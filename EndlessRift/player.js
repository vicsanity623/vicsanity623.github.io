// player.js

// This module now only manages the player object and its logic.
// It receives necessary data from systemsmanager.js as function arguments.

let player = {};

function initPlayer(world) {
    player = {
        x: world.width / 2,
        y: world.height / 2,
        size: 20,
        speed: 3.5,
        health: 100,
        maxHealth: 100,
        healthRegen: 0,
        xp: 0,
        level: 1,
        xpForNextLevel: 10,
        pickupRadius: 75,
        xpGainModifier: 1,
        angle: 0,
        kills: 0,
        nextKillUpgrade: 1000,
        upgradeLevels: {},
        // ADDED: New defensive and utility properties
        armor: 0,
        thorns: 0,
        lifeSteal: 0,
        dodgeChance: 0,
        magnetism: 1,
        // NEW: Added lastHitTime for invincibility frames (if needed)
        lastHitTime: 0,

        weapon: {
            damage: 10,
            cooldown: 600,
            speed: 8,
            size: { w: 4, h: 40 },
            count: 1,
            pierce: 0,
            critChance: 0.05,
            // ADDED: New weapon properties
            critDamage: 2,
            explodesOnImpact: false,
            explosionRadius: 60,
            explosionDamage: 10
        },
        abilities: {
            orbitingShield: { enabled: false, angle: 0, distance: 70, damage: 5, cooldown: 500, lastHit: 0 },
            backShot: false,
            diagonalShot: false,
            novaOnLevelUp: false,
            // ADDED: New ability properties
            healOnXp: false,
            critExplosion: false
        },
        skills: {
            lightning: { isUnlocked: false, damage: 5, chains: 1, shockDuration: 0, cooldown: 3000, lastStrike: 0 },
            volcano: { isUnlocked: false, damage: 10, radius: 50, burnDuration: 2000, cooldown: 5000, lastEruption: 0 },
            // ADDED: Two new unlockable skills
            frostNova: { isUnlocked: false, damage: 5, radius: 150, slowAmount: 0.5, slowDuration: 2000, cooldown: 6000, lastCast: 0 },
            blackHole: { isUnlocked: false, pullStrength: 0.5, radius: 200, duration: 3000, damage: 2, cooldown: 12000, lastCast: 0 }
        }
    };
}

// *** THIS IS THE CRITICAL FIX ***
// This function now upgrades old save files to be compatible with new code.
function loadPlayer(savedPlayer) {
    // Create a fresh, complete player object with all new properties and default values.
    initPlayer({ width: 3000, height: 2000 }); // The world size here is a placeholder.

    // Now, copy the saved data on top of the default object.
    // This preserves progress while adding any new properties that were missing.
    Object.assign(player, savedPlayer);

    // Deep merge nested objects to ensure they are also upgraded.
    if (savedPlayer.weapon) {
        player.weapon = { ...player.weapon, ...savedPlayer.weapon };
    }
    if (savedPlayer.abilities) {
        player.abilities = { ...player.abilities, ...savedPlayer.abilities };
    }
    if (savedPlayer.skills) {
        player.skills = { ...player.skills, ...savedPlayer.skills };
        // Also merge the individual skills inside
        if(savedPlayer.skills.lightning) player.skills.lightning = { ...player.skills.lightning, ...savedPlayer.skills.lightning };
        if(savedPlayer.skills.volcano) player.skills.volcano = { ...player.skills.volcano, ...savedPlayer.skills.volcano };
        // NEW: Merge new skills if they exist in save, otherwise they'll be defaults from initPlayer
        if(savedPlayer.skills.frostNova) player.skills.frostNova = { ...player.skills.frostNova, ...savedPlayer.skills.frostNova };
        if(savedPlayer.skills.blackHole) player.skills.blackHole = { ...player.skills.blackHole, ...savedPlayer.skills.blackHole };
    }
}

// NEW: Player's dedicated takeDamage function
// This function needs access to the current gameTime and spawnDamageNumber,
// which it gets via arguments now.
function takeDamage(amount, gameTime, spawnDamageNumberCallback, screenRedFlashObject) {
    // Check for invincibility frames for "hit" damage, but allow continuous damage through
    // For continuous safe zone damage, `amount` might be very small (e.g., 0.05 per frame).
    // Only apply invincibility frames for larger, direct hits (e.g., from enemies).
    const isDirectHit = amount > 1; // Arbitrary threshold for direct hit vs. continuous damage
    const IFRAME_DURATION = 1000; // milliseconds

    if (isDirectHit && (gameTime - (player.lastHitTime || 0) < IFRAME_DURATION)) {
        return; // Still in invincibility frames from a recent direct hit
    }

    if (Math.random() < player.dodgeChance) {
        spawnDamageNumberCallback(player.x, player.y + 20, "DODGE", true);
        return; // Dodged the hit
    }

    const finalDamage = Math.max(1, amount - player.armor);
    player.health -= finalDamage;

    // Only apply screen flash for direct hits, not continuous zone damage
    if (isDirectHit && screenRedFlashObject) {
        screenRedFlashObject.value = 0.6;
    }

    // Update lastHitTime only for direct hits to trigger IFrames
    if (isDirectHit) {
        player.lastHitTime = gameTime;
    }

    // The thorns logic will remain in systemsmanager.js as it needs access to the enemies array
    // and determines which enemies are affected by the player taking damage.

    if (player.health <= 0) {
        player.health = 0;
        // Game over logic will be handled by systemsmanager, which calls this function.
    }
}


function updatePlayer(deltaTime, world, enemies, moveVector) {
    if (moveVector.dx !== 0 || moveVector.dy !== 0) {
        const mag = Math.hypot(moveVector.dx, moveVector.dy);
        player.x += (moveVector.dx / mag) * player.speed;
        player.y += (moveVector.dy / mag) * player.speed;
    }

    player.x = Math.max(0, Math.min(world.width, player.x));
    player.y = Math.max(0, Math.min(world.height, player.y));

    // Player health regeneration (separate from safe house healing)
    player.health = Math.min(player.maxHealth, player.health + player.healthRegen * (deltaTime / 1000));

    let closestEnemy = null;
    let closestDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < closestDist) {
            closestDist = dist;
            closestEnemy = e;
        }
    });

    if (closestEnemy) {
        player.angle = Math.atan2(closestEnemy.y - player.y, closestEnemy.x - player.x);
    }

    return { closestEnemy, closestDist };
}

function gainXP(amount, showLevelUpOptionsCallback, expandWorldCallback, triggerNovaCallback, camera) {
    if (player.health <= 0) return;
    player.xp += amount * player.xpGainModifier;
    if (player.xp >= player.xpForNextLevel) {
        const xpOver = player.xp - player.xpForNextLevel;
        const oldLevel = player.level;
        player.level++;

        if (oldLevel < 20 && player.level >= 20) {
            player.nextKillUpgrade = Math.ceil(player.kills / 1000) * 1000;
        }

        if (player.level > 0 && player.level % 20 === 0) {
            expandWorldCallback(camera, player);
        }

        player.xp = xpOver;
        player.xpForNextLevel = Math.floor(player.xpForNextLevel * 1.6);
        player.health = player.maxHealth;
        if (player.abilities.novaOnLevelUp) triggerNovaCallback(player);
        showLevelUpOptionsCallback();
    }
    // NEW: Heal on XP pickup ability
    if (player.abilities.healOnXp && Math.random() < 0.1) { // 10% chance
        player.health = Math.min(player.maxHealth, player.health + 1); // Heal 1 HP
    }
}

// IMPORTANT: Export the new takeDamage function
export { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage };
