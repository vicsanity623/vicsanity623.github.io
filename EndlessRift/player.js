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

function loadPlayer(savedPlayer) {
    player = savedPlayer;
}

// *** CORE FIX: Removed the unused 'gameState' parameter. ***
function updatePlayer(deltaTime, world, enemies, moveVector) {
    if (moveVector.dx !== 0 || moveVector.dy !== 0) {
        const mag = Math.hypot(moveVector.dx, moveVector.dy);
        player.x += (moveVector.dx / mag) * player.speed;
        player.y += (moveVector.dy / mag) * player.speed;
    }

    player.x = Math.max(0, Math.min(world.width, player.x));
    player.y = Math.max(0, Math.min(world.height, player.y));

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
}

// takeDamage has been moved to systemsmanager.js
export { player, initPlayer, loadPlayer, updatePlayer, gainXP };