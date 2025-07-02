import { camera, gameState, safeHouse } from './systemsmanager.js'; // safeHouse is now the SafeHouse class instance
import { createXpOrb } from './attacks_skills.js';

const enemyPath = new Path2D('M-12,0 Q-10,-15 0,-15 Q10,-15 12,0 L8,-5 L5,5 L0,0 L-5,5 L-8,-5 Z');

function spawnEnemy(enemies) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const buffer = 50;
    switch (side) {
        case 0: x = camera.x + Math.random() * camera.width; y = camera.y - buffer; break;
        case 1: x = camera.x + camera.width + buffer; y = camera.y + Math.random() * camera.height; break;
        case 2: x = camera.x + Math.random() * camera.width; y = camera.y + camera.height + buffer; break;
        case 3: x = camera.x - buffer; y = camera.y + Math.random() * camera.height; break;
    }
    const health = 20 + Math.floor(gameState.gameTime / 8000);
    enemies.push({
        x, y,
        health,
        speed: 1 + Math.random() * 0.8, // Base speed
        damage: 10, // Added damage property for enemy contact damage
        shockTimer: 0,
        shockDamage: 0,
        speedMultiplier: 1.0, // This is modified by systemsmanager based on safe zone
        markedForDeletion: false,
        width: 40 // Define a width for collision checks (assuming this is diameter)
    });
};

function updateEnemies(deltaTime, enemies, player, showLevelUpOptionsCallback, gainXPCallback) {
    enemies.forEach((e) => {
        const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);

        // Calculate potential next position based on player attraction
        let nextX = e.x + Math.cos(angleToPlayer) * e.speed * e.speedMultiplier;
        let nextY = e.y + Math.sin(angleToPlayer) * e.speed * e.speedMultiplier;

        // NEW LOGIC: Prevent enemies from entering the safe zone
        // Only apply this logic if the safe zone is currently active
        if (safeHouse.active) {
            const dx_safeHouse = nextX - safeHouse.x;
            const dy_safeHouse = nextY - safeHouse.y;
            const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);

            // Calculate the radius for the *exclusion zone* - the area enemies cannot cross.
            // This is the safe zone's radius plus half of the enemy's width,
            // so the enemy's visual representation doesn't overlap the safe zone.
            const safeZoneOuterBoundary = safeHouse.radius + (e.width / 2);

            if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                // If the enemy's next position would take it inside this boundary,
                // clamp its position to the boundary.
                if (distToSafeHouseCenter === 0) { // Avoid division by zero if enemy is exactly at safehouse center
                    // Nudge enemy slightly if it's at the center to give it a direction to move
                    nextX = safeHouse.x + Math.random() * 2 - 1;
                    nextY = safeHouse.y + Math.random() * 2 - 1;
                } else {
                    const angleFromSafeHouseCenter = Math.atan2(dy_safeHouse, dx_safeHouse);
                    nextX = safeHouse.x + Math.cos(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                    nextY = safeHouse.y + Math.sin(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                }
            }
        }

        // Apply the calculated position
        e.x = nextX;
        e.y = nextY;

        // Original logic for health, kills, XP, life steal, shockTimer remains unchanged
        if (e.health <= 0) {
            player.kills++;
            if (player.lifeSteal > 0) {
                player.health = Math.min(player.maxHealth, player.health + player.lifeSteal);
            }

            if (gameState.isRunning && player.level >= 20 && player.kills >= player.nextKillUpgrade) {
                showLevelUpOptionsCallback();
                player.nextKillUpgrade += 1000;
            }
            createXpOrb(e.x, e.y, 5, player, gainXPCallback);
            e.markedForDeletion = true;
        }

        if (e.shockTimer > 0) {
            e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer -= deltaTime;
        }
    });
}

export { enemyPath, spawnEnemy, updateEnemies };
