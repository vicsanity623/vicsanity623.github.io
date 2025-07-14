// player.js

// Import createImpactParticles for player drawing effect
import { createImpactParticles } from './attacks_skills.js'; 

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
        armor: 0,
        thorns: 0,
        lifeSteal: 0,
        dodgeChance: 0,
        magnetism: 1,
        lastHitTime: 0, // Used for i-frames

        weapon: {
            damage: 10,
            cooldown: 600,
            speed: 8,
            size: { w: 4, h: 40 },
            count: 1,
            pierce: 0,
            critChance: 0.05,
            critDamage: 2,
            explodesOnImpact: false,
            explosionRadius: 60,
            explosionDamage: 10
        },
        abilities: {
            orbitingShield: { enabled: false, angle: 0, distance: 70, damage: 5, cooldown: 500, lastHit: {}, speed: 1, radius: 10, count: 1 }, // Changed lastHit to an object for multiple shields
            backShot: false,
            diagonalShot: false,
            novaOnLevelUp: false,
            healOnXp: false,
            critExplosion: false
        },
        skills: {
            lightning: { isUnlocked: false, damage: 5, chains: 1, shockDuration: 0, cooldown: 3000, lastStrike: 0, forkChance: 0 }, // Added forkChance default
            volcano: { isUnlocked: false, damage: 10, radius: 50, burnDuration: 2000, cooldown: 5000, lastEruption: 0, count: 1 }, // Added count default
            frostNova: { isUnlocked: false, damage: 5, radius: 150, slowAmount: 0.5, slowDuration: 2000, cooldown: 6000, lastCast: 0 },
            blackHole: { isUnlocked: false, pullStrength: 0.5, radius: 200, duration: 3000, damage: 2, cooldown: 12000, lastCast: 0 },
            bulletstorm: { isUnlocked: false, damage: 10, speed: 7, fireRate: 300, lastShotTime: 0, color: '#00FFFF', size: 10 },
            hyperBeam: { isUnlocked: false, damage: 200, width: 100, duration: 800, cooldown: 30000, lastCast: 0, chargingTime: 500, color: '#FF00FF', manualTrigger: false } // Added manualTrigger
        }
    };
}

function loadPlayer(savedPlayer) {
    // Initialize a fresh default player to get all properties with their default values
    const defaultPlayer = {};
    initPlayer({ width: 3000, height: 2000 }); // Pass dummy world size, as it's not critical for default structure
    Object.assign(defaultPlayer, player); // Copy the newly initialized default player structure

    // Simplified deep merge function to merge saved data into the default structure
    const deepMerge = (target, source) => {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key]) && typeof target[key] === 'object' && target[key] !== null) {
                    target[key] = deepMerge(target[key], source[key]);
                } else if (source[key] !== undefined) { // Only assign if source property is defined
                    target[key] = source[key];
                }
            }
        }
        return target;
    };

    // Deep merge saved data into the default player structure
    player = deepMerge(defaultPlayer, savedPlayer);

    // Apply specific post-load fixes/ensures if needed
    player.health = Math.min(player.health, player.maxHealth); // Ensure health doesn't exceed new maxHealth

    // Ensure lastCast/lastShotTime for skills are numbers, if they could be null/undefined from save
    for (const skillName in player.skills) {
        const skill = player.skills[skillName];
        if (skill && skill.hasOwnProperty('lastCast') && typeof skill.lastCast !== 'number') {
            skill.lastCast = 0;
        }
        if (skill && skill.hasOwnProperty('lastStrike') && typeof skill.lastStrike !== 'number') {
            skill.lastStrike = 0;
        }
        if (skill && skill.hasOwnProperty('lastEruption') && typeof skill.lastEruption !== 'number') {
            skill.lastEruption = 0;
        }
        if (skill && skill.hasOwnProperty('lastShotTime') && typeof skill.lastShotTime !== 'number') {
            skill.lastShotTime = 0;
        }
        if (skillName === 'hyperBeam' && typeof skill.manualTrigger !== 'boolean') {
            skill.manualTrigger = false;
        }
    }
    // Ensure orbitingShield.lastHit is an object if it gets loaded as something else
    if (player.abilities.orbitingShield && typeof player.abilities.orbitingShield.lastHit !== 'object') {
        player.abilities.orbitingShield.lastHit = {};
    }
}

function takeDamage(amount, gameTime, spawnDamageNumberCallback, screenRedFlashObject, triggerScreenShakeCallback) {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) { // Ensure amount is a positive number
        return;
    }

    const currentArmor = parseFloat(player.armor);
    if (isNaN(currentArmor)) {
        player.armor = 0; // Ensure armor is a number
    }

    const IFRAME_DURATION = 1000; // milliseconds

    // Only apply i-frames if damage is from a direct hit (e.g., enemy collision, projectile)
    // Small damage ticks (e.g., from DoTs, thorns) generally don't trigger i-frames
    if (amount >= 1 && (gameTime - (player.lastHitTime || 0) < IFRAME_DURATION)) {
        return;
    }

    if (Math.random() < player.dodgeChance) {
        spawnDamageNumberCallback(player.x, player.y + 20, "DODGE", true);
        return;
    }

    const finalDamage = Math.max(0, amount - player.armor);
    player.health -= finalDamage;

    // Only flash screen and shake on significant hits
    if (amount >= 1 && screenRedFlashObject) { 
        screenRedFlashObject.value = 0.6;
        triggerScreenShakeCallback(5, 100);
    }

    // Only update lastHitTime on significant hits to trigger i-frames
    if (amount >= 1) { 
        player.lastHitTime = gameTime;
    }

    if (player.health <= 0) {
        player.health = 0;
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

    // Health regeneration
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
    if (player.health <= 0) return; // Cannot gain XP if dead
    player.xp += amount * player.xpGainModifier;
    if (player.xp >= player.xpForNextLevel) {
        const xpOver = player.xp - player.xpForNextLevel;
        const oldLevel = player.level;
        player.level++;

        // This condition implies a special upgrade at Level 20 based on kills.
        // It's a unique game mechanic, so keeping it as is.
        if (oldLevel < 20 && player.level >= 20) {
            player.nextKillUpgrade = Math.ceil(player.kills / 1000) * 1000;
        }

        // World expansion every 20 levels
        if (player.level > 0 && player.level % 20 === 0) {
            expandWorldCallback(camera, player);
        }

        player.xp = xpOver;
        player.xpForNextLevel = Math.floor(player.xpForNextLevel * 1.6); // XP required increases
        player.health = player.maxHealth; // Full heal on level up
        if (player.abilities.novaOnLevelUp) triggerNovaCallback(player); // Trigger nova if ability unlocked
        showLevelUpOptionsCallback(); // Show level up options
    }
    // Heal on XP pickup chance
    if (player.abilities.healOnXp && Math.random() < 0.1) {
        player.health = Math.min(player.maxHealth, player.health + 1);
    }
}

// Player drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawPlayer(p, angle, gameTime, ctx, createImpactParticlesCallback) {
    // Bobbing animation for player
    const bob = Math.sin(gameTime / 250) * 2;
    ctx.save(); 
    ctx.translate(p.x, p.y + bob);

    // Subtle hover pulse effect
    const hoverPulse = Math.sin(gameTime / 400);

    // Shadow/hover effect ellipse
    ctx.beginPath();
    ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2 + hoverPulse * 0.1;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.rotate(angle); // Rotate player towards mouse/enemy

    // Aura pulse effect
    const auraPulse = Math.sin(gameTime / 200);

    // Outer aura
    ctx.beginPath();
    ctx.arc(0, 0, 30 + auraPulse * 4, -1.9, 1.9); // Arc shape
    ctx.strokeStyle = 'var(--player-aura-color)';
    ctx.lineWidth = 8 + auraPulse * 4;
    ctx.shadowColor = 'var(--player-aura-color)';
    ctx.shadowBlur = 35 + auraPulse * 20;
    ctx.stroke();

    // Inner aura/glow
    ctx.beginPath();
    ctx.arc(0, 0, 25 + auraPulse * 2.5, -1.9, 1.9);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4 + auraPulse * 1.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 20 + auraPulse * 10;
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow for main player body

    // Player body shape (triangle)
    ctx.fillStyle = '#00FFFF';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(8, 15);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 15);
    ctx.closePath();
    ctx.fill();

    // Player "eye" or detail (black rectangle)
    ctx.fillStyle = '#000';
    ctx.fillRect(-5, -15, 10, 10);

    ctx.restore(); // Restore player rotation

    // Small particle effects around the player
    if (Math.random() < 0.1) {
        createImpactParticlesCallback(p.x + (Math.random() - 0.5) * 10,
                              p.y + (Math.random() - 0.5) * 10,
                              1, 'spark', 'var(--player-aura-color)');
    }

    ctx.restore(); // Restore player translation (for bobbing)
}

// Export the player object and all its related functions
export { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage, drawPlayer };