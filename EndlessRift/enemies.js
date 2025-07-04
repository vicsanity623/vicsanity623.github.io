// enemies.js

// MODIFIED: Import `gameState` directly from systemsmanager for consistency.
// `safeHouse` is directly imported as before.
import { safeHouse, gameState } from './systemsmanager.js';
// MODIFIED: `createXpOrb` now also needs the `xpOrbsRef` for host to push to DB,
// but for this file, it just needs to *call* createXpOrb, which returns the orb object.
import { createXpOrb } from './attacks_skills.js';
import { seededRandom } from './rift.js'; // NEW: Import for consistent spawning

const enemyPath = new Path2D('M-12,0 Q-10,-15 0,-15 Q10,-15 12,0 L8,-5 L5,5 L0,0 L-5,5 L-8,-5 Z');

// MODIFIED: spawnEnemy now takes world as an argument, and returns the new enemy
// This function will be called by the host.
function spawnEnemy(world) {
    const side = Math.floor(seededRandom() * 4); // Use seededRandom for consistent, yet varied, spawn side
    let x, y;
    const buffer = 100; // Increased buffer for spawning further outside visible screen

    // Spawning enemies at the edges of the GLOBAL world, not just the local camera view.
    // This ensures enemies are distributed across the world regardless of player positions.
    switch (side) {
        case 0: // Top edge of the world
            x = seededRandom() * world.width;
            y = -buffer;
            break;
        case 1: // Right edge of the world
            x = world.width + buffer;
            y = seededRandom() * world.height;
            break;
        case 2: // Bottom edge of the world
            x = seededRandom() * world.width;
            y = world.height + buffer;
            break;
        case 3: // Left edge of the world
            x = -buffer;
            y = seededRandom() * world.height;
            break;
    }

    const health = 20 + Math.floor(gameState.gameTime / 8000); // Health scales with global game time
    const enemyId = `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // Unique ID for DB reference

    return { // Return the new enemy object for host to push to DB
        id: enemyId, // NEW: Unique ID is essential for Realtime Database
        x, y,
        health,
        speed: 1 + seededRandom() * 0.8, // Base speed uses seededRandom
        damage: 10, // Base damage
        shockTimer: 0,
        shockDamage: 0,
        slowTimer: 0, // Used by Frost Nova skill
        slowAmount: 0, // Used by Frost Nova skill
        speedMultiplier: 1.0, // This is modified by systemsmanager based on safe zone
        markedForDeletion: false, // For local client visual removal before DB syncs
        width: 40 // For collision detection
    };
};

// MODIFIED: updateEnemies now accepts `allPlayers`, `enemiesRef`, `xpOrbsRef`, and `isHost` parameters
// `enemiesArray` refers to the local `enemies` array, which is kept in sync by a DB listener.
function updateEnemies(deltaTime, enemiesArray, player, allPlayers, showLevelUpOptionsCallback, gainXPCallback, enemiesRef, xpOrbsRef, isHost) {
    enemiesArray.forEach((e) => { // Iterate through the local enemiesArray
        // Clients apply local visual effects based on synchronized enemy state
        // Host applies the authoritative health changes from shock/slow and updates DB
        if (e.shockTimer > 0) {
            // Apply shock damage only if host, otherwise client just decreases timer for visual
            if (isHost) e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer = Math.max(0, e.shockTimer - deltaTime);
        }

        e.speedMultiplier = 1.0; // Reset for recalculation
        if (e.slowTimer > 0) {
            e.speedMultiplier = 1.0 - e.slowAmount;
            e.slowTimer = Math.max(0, e.slowTimer - deltaTime);
        }

        // Host performs the authoritative movement calculations and DB updates
        if (isHost) {
            // Combine local player and other synchronized players for enemy targeting
            const currentSessionPlayers = [player, ...Array.from(allPlayers.values())];
            
            let closestPlayerToEnemy = null;
            let minDistToPlayer = Infinity;

            currentSessionPlayers.forEach(p => {
                // Ensure player data is valid and they are alive
                if (p && typeof p.x === 'number' && typeof p.y === 'number' && p.health > 0) {
                    const dist = Math.hypot(p.x - e.x, p.y - e.y);
                    if (dist < minDistToPlayer) {
                        minDistToPlayer = dist;
                        closestPlayerToPlayer = p; // Corrected variable name
                    }
                }
            });

            let nextX = e.x;
            let nextY = e.y;

            if (closestPlayerToPlayer) { // Use the corrected variable name
                const angleToPlayer = Math.atan2(closestPlayerToPlayer.y - e.y, closestPlayerToPlayer.x - e.x);
                nextX = e.x + Math.cos(angleToPlayer) * e.speed * e.speedMultiplier;
                nextY = e.y + Math.sin(angleToPlayer) * e.speed * e.speedMultiplier;

                // Prevent enemies from entering the safe zone (Host-only calculation)
                if (safeHouse.active) { // safeHouse instance is synchronized via systemsmanager
                    const dx_safeHouse = nextX - safeHouse.x;
                    const dy_safeHouse = nextY - safeHouse.y;
                    const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);
                    // Safe zone boundary is its radius plus half the enemy's width
                    const safeZoneOuterBoundary = safeHouse.radius + (e.width / 2);

                    if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                        // Nudge enemy out if it tries to enter the safe zone boundary
                        if (distToSafeHouseCenter === 0) { // Avoid division by zero if enemy is exactly at center
                            nextX = safeHouse.x + (seededRandom() * 2 - 1); // Small random nudge
                            nextY = safeHouse.y + (seededRandom() * 2 - 1);
                        } else {
                            const angleFromSafeHouseCenter = Math.atan2(dy_safeHouse, dx_safeHouse);
                            nextX = safeHouse.x + Math.cos(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                            nextY = safeHouse.y + Math.sin(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                        }
                    }
                }
            } else {
                // If no players are online (or alive targets), enemies wander slightly
                nextX = e.x + (seededRandom() - 0.5) * 0.5;
                nextY = e.y + (seededRandom() - 0.5) * 0.5;
            }

            // Update the enemy's state in the Realtime Database
            // Only update properties that are controlled by the host's calculations
            enemiesRef.child(e.id).update({
                x: nextX,
                y: nextY,
                health: e.health, // Sync current health (after shock damage potentially applied)
                shockTimer: e.shockTimer, // Sync shock timer
                slowTimer: e.slowTimer, // Sync slow timer
                speedMultiplier: e.speedMultiplier // Sync speed multiplier to apply slow effect on clients
            });

            // Handle enemy death logic (host-only to trigger global events)
            if (e.health <= 0) {
                // Local player progression (kills, life steal)
                player.kills++; // Local player's kills increase regardless of who made the kill
                if (player.lifeSteal > 0) {
                    player.health = Math.min(player.maxHealth, player.health + player.lifeSteal);
                }

                // Check for local player's level up condition
                if (gameState.isRunning && player.level >= 20 && player.kills >= player.nextKillUpgrade) {
                    showLevelUpOptionsCallback();
                    player.nextKillUpgrade += 1000;
                }

                // Create XP orb globally (host-only)
                // createXpOrb now returns an object which includes a unique ID
                const newXpOrb = createXpOrb(e.x, e.y, 5, player, gainXPCallback); // gainXPCallback is for local player XP
                xpOrbsRef.child(newXpOrb.id).set(newXpOrb); // Push to global XP orbs

                e.markedForDeletion = true; // Mark for local client visual removal
                enemiesRef.child(e.id).remove(); // Remove from DB for all clients
            }
        }
    });
}

export { enemyPath, spawnEnemy, updateEnemies };
