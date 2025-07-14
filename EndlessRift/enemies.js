// enemies.js

// Import necessary functions and the player object
import { player } from './player.js'; 
import { createXpOrb, fireEnemyProjectile, createImpactParticles, spawnDamageNumber } from './attacks_skills.js'; // Ensure spawnDamageNumber is also imported

const enemyPath = new Path2D('M-12,0 Q-10,-15 0,-15 Q10,-15 12,0 L8,-5 L5,5 L0,0 L-5,5 L-8,-5 Z');
const largeEnemyPath = new Path2D('M-20,0 L0,-30 L20,0 L15,10 L0,20 L-15,10 Z');
const fastEnemyPath = new Path2D('M-8,0 L0,-15 L8,0 L0,15 Z');
const shooterEnemyPath = new Path2D('M-10,-10 L10,-10 L10,10 L-10,10 Z M0,-15 A5 5 0 1 0 0 -5');

const ENEMY_ARCHETYPES = {
    basic: {
        health: 20, speed: 1.0, damage: 10, width: 40, xpValue: 5, path: enemyPath,
        color: 'var(--enemy-color)', accentColor: 'var(--enemy-accent-color)', canShoot: false,
    },
    tank: {
        health: 100, speed: 0.6, damage: 20, width: 60, xpValue: 15, path: largeEnemyPath,
        color: 'rgba(100, 50, 50, 1)', accentColor: 'rgba(200, 100, 100, 1)', canShoot: false,
    },
    skirmisher: {
        health: 10, speed: 2.5, damage: 5, width: 30, xpValue: 3, path: fastEnemyPath,
        color: 'rgba(50, 100, 50, 1)', accentColor: 'rgba(100, 200, 100, 1)', canShoot: false,
    },
    shooter: {
        health: 40, speed: 0.8, damage: 8, width: 50, xpValue: 10, path: shooterEnemyPath,
        color: 'rgba(50, 50, 100, 1)', accentColor: 'rgba(100, 100, 200, 1)', canShoot: true,
        projectileSpeed: 5, fireRate: 2000, projectileDamage: 15, lastShotTime: 0,
    }
};

// Pass enemiesArray, camera, world, gameTime as parameters
function spawnEnemy(enemiesArray, camera, world, gameTime) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const buffer = 50;
    // Spawn relative to camera, but ensure within world bounds
    switch (side) {
        case 0: x = camera.x + Math.random() * camera.width; y = camera.y - buffer; break;
        case 1: x = camera.x + camera.width + buffer; y = camera.y + Math.random() * camera.height; break;
        case 2: x = camera.x + Math.random() * camera.width; y = camera.y + camera.height + buffer; break;
        case 3: x = camera.x - buffer; y = camera.y + Math.random() * camera.height; break;
    }
    // Clamp to world boundaries just in case
    x = Math.max(0, Math.min(world.width, x));
    y = Math.max(0, Math.min(world.height, y));


    let typeToSpawn = 'basic';
    const gameTimeSeconds = gameTime / 1000;

    if (gameTimeSeconds > 30) {
        if (Math.random() < 0.4) typeToSpawn = 'skirmisher';
    }
    if (gameTimeSeconds > 60) {
        const rand = Math.random();
        if (rand < 0.3) typeToSpawn = 'tank';
        else if (rand < 0.6) typeToSpawn = 'skirmisher';
        else typeToSpawn = 'basic';
    }
    if (gameTimeSeconds > 120) {
        const rand = Math.random();
        if (rand < 0.25) typeToSpawn = 'shooter';
        else if (rand < 0.5) typeToSpawn = 'tank';
        else if (rand < 0.75) typeToSpawn = 'skirmisher';
        else typeToSpawn = 'basic';
    }

    const archetype = ENEMY_ARCHETYPES[typeToSpawn];
    const healthModifier = 1 + (gameTimeSeconds / 60) * 0.1;

    enemiesArray.push({
        x, y,
        health: archetype.health * healthModifier,
        maxHealth: archetype.health * healthModifier,
        speed: archetype.speed,
        damage: archetype.damage,
        width: archetype.width,
        xpValue: archetype.xpValue,
        path: archetype.path,
        color: archetype.color,
        accentColor: archetype.accentColor,
        canShoot: archetype.canShoot,
        projectileSpeed: archetype.projectileSpeed,
        fireRate: archetype.fireRate,
        projectileDamage: archetype.projectileDamage,
        lastShotTime: archetype.lastShotTime,
        shockTimer: 0,
        shockDamage: 0,
        slowTimer: 0,
        speedMultiplier: 1.0,
        markedForDeletion: false,
        type: typeToSpawn,
        lastHitTime: 0,
        isDying: false,
        deathTimer: 0,
        deathDuration: 300,
        particlesSpawned: false, // Flag to ensure particles are spawned only once on death
    });
}

// Pass enemiesArray, playerObj, showLevelUpOptionsCallback, gainXPCallback, camera, safeHouse, fireEnemyProjectileCallback, createXpOrbCallback, createImpactParticlesCallback, gameTime, gameState (for isRunning) as parameters
function updateEnemies(deltaTime, enemiesArray, playerObj, showLevelUpOptionsCallback, gainXPCallback, camera, safeHouse, fireEnemyProjectileCallback, createXpOrbCallback, createImpactParticlesCallback, gameTime, gameState) {
    const activeEnemies = enemiesArray.filter(e => {
        // Only update enemies that are within a reasonable range of the camera
        // This is a form of frustum culling to reduce update workload
        const cullBuffer = 100; // Extra buffer around screen
        return e.x + e.width / 2 > camera.x - cullBuffer &&
               e.x - e.width / 2 < camera.x + camera.width + cullBuffer &&
               e.y + e.width / 2 > camera.y - cullBuffer &&
               e.y - e.width / 2 < camera.y + camera.height + cullBuffer;
    });

    activeEnemies.forEach((e) => {
        if (e.isDying) {
            e.deathTimer -= deltaTime;
            if (!e.particlesSpawned) { // Spawn particles once when death animation starts
                createImpactParticlesCallback(e.x, e.y, 20, 'enemy_death', e.color);
                e.particlesSpawned = true;
            }
            if (e.deathTimer <= 0) {
                e.markedForDeletion = true; // Mark for removal from the array
            }
            return; // Skip movement and attack logic for dying enemies
        }

        const angleToPlayer = Math.atan2(playerObj.y - e.y, playerObj.x - e.x);
        let currentSpeed = e.speed * e.speedMultiplier;

        if (e.slowTimer > 0) {
            currentSpeed *= (1 - player.skills.frostNova.slowAmount); // Apply slow effect
            e.slowTimer -= deltaTime;
        }

        let nextX = e.x + Math.cos(angleToPlayer) * currentSpeed;
        let nextY = e.y + Math.sin(angleToPlayer) * currentSpeed;

        if (safeHouse && safeHouse.active) { // Check if safeHouse exists and is active
            const dx_safeHouse = nextX - safeHouse.x;
            const dy_safeHouse = nextY - safeHouse.y;
            const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);
            const safeZoneOuterBoundary = safeHouse.radius + (e.width / 2);

            if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                // If enemy is moving into or within safe zone, try to push it out
                if (distToSafeHouseCenter === 0) { // Avoid division by zero if exactly at center
                    nextX = safeHouse.x + Math.random() * 2 - 1;
                    nextY = safeHouse.y + Math.random() * 2 - 1;
                } else {
                    const angleFromSafeHouseCenter = Math.atan2(dy_safeHouse, dx_safeHouse);
                    nextX = safeHouse.x + Math.cos(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                    nextY = safeHouse.y + Math.sin(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                }
            }
        }

        e.x = nextX;
        e.y = nextY;

        // Enemy shooting logic
        if (e.canShoot && gameTime - e.lastShotTime > e.fireRate) { 
            const distToPlayer = Math.hypot(playerObj.x - e.x, playerObj.y - e.y);
            if (distToPlayer < camera.width / 2 + 100) { // Only shoot if player is somewhat nearby
                fireEnemyProjectileCallback(e, playerObj.x, playerObj.y); // Use passed callback
                e.lastShotTime = gameTime;
            }
        }

        // Enemy health check and death handling
        if (e.health <= 0 && !e.isDying) {
            playerObj.kills++; // Increment player kills
            if (playerObj.lifeSteal > 0) { // Apply life steal
                playerObj.health = Math.min(playerObj.maxHealth, playerObj.health + playerObj.lifeSteal);
            }
            createXpOrbCallback(e.x, e.y, e.xpValue, playerObj, gainXPCallback); // Use passed callback

            // Special level up trigger for level 20+ based on kills
            if (gameState && gameState.isRunning && playerObj.level >= 20 && playerObj.kills >= playerObj.nextKillUpgrade) { // Ensure gameState is checked
                showLevelUpOptionsCallback(); // Use passed callback
                playerObj.nextKillUpgrade += 1000; // Increase next target
            }
            e.isDying = true; // Start death animation/timer
            e.deathTimer = e.deathDuration;
            e.speed = 0; // Stop enemy movement on death
        }

        // Apply shock damage over time
        if (e.shockTimer > 0) {
            e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer -= deltaTime;
        }
    });
}

// Pass ctx, playerObj, gameTime, camera as parameters
function drawEnemy(e, ctx, playerObj, gameTime, camera) {
    if (e.markedForDeletion && !e.isDying) return; // Don't draw if marked for deletion and not in dying phase

    // Only draw enemies if they are on screen or close to it (frustum culling for drawing)
    const drawBuffer = 50;
    if (e.x + e.width / 2 < camera.x - drawBuffer ||
        e.x - e.width / 2 > camera.x + camera.width + drawBuffer ||
        e.y + e.width / 2 < camera.y - drawBuffer ||
        e.y - e.width / 2 > camera.y + camera.height + drawBuffer) {
        return;
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(playerObj.y - e.y, playerObj.x - e.x) + Math.PI / 2); // Rotate to face player

    if (e.isDying) {
        ctx.globalAlpha = e.deathTimer / e.deathDuration; // Fade out during death animation
    }

    const HIT_FLASH_DURATION = 100; // milliseconds
    const isFlashing = e.lastHitTime && (gameTime - e.lastHitTime < HIT_FLASH_DURATION);
    if (isFlashing) {
        const flashAlpha = (HIT_FLASH_DURATION - (gameTime - e.lastHitTime)) / HIT_FLASH_DURATION;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.7})`; // White flash
        ctx.fillRect(-e.width / 2, -e.width / 2, e.width, e.width); // Draw a square flash over enemy
    }

    if (e.slowTimer > 0) {
        ctx.fillStyle = `rgba(135, 206, 250, 0.7)`; // Blue overlay for slow effect
        ctx.fill(e.path); // Fill the enemy's path with the overlay
    }

    // Draw enemy body
    ctx.fillStyle = e.color;
    ctx.fill(e.path);
    ctx.strokeStyle = e.accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke(e.path);

    ctx.restore();
}

// Export all functions that are used by other modules
export { enemyPath, spawnEnemy, updateEnemies, drawEnemy };