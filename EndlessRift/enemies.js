// enemies.js (Updated for Wave System)

import { camera, gameState, safeHouse, triggerScreenShake } from './systemsmanager.js';
import { createXpOrb, fireEnemyProjectile, createImpactParticles } from './attacks_skills.js';
import { player } from './player.js'; // Player object is available here

// Path definitions for different enemy types
const enemyPath = new Path2D('M-12,0 Q-10,-15 0,-15 Q10,-15 12,0 L8,-5 L5,5 L0,0 L-5,5 L-8,-5 Z');
const largeEnemyPath = new Path2D('M-20,0 L0,-30 L20,0 L15,10 L0,20 L-15,10 Z');
const fastEnemyPath = new Path2D('M-8,0 L0,-15 L8,0 L0,15 Z');
const shooterEnemyPath = new Path2D('M-10,-10 L10,-10 L10,10 L-10,10 Z M0,-15 A5 5 0 1 0 0 -5');
const bossEnemyPath = new Path2D('M-30,-20 L0,-60 L30,-20 L25,20 L0,40 L-25,20 Z M-10,-40 C-10,-50 10,-50 10,-40 C10,-30 -10,-30 -10,-40 Z'); // A more complex shape for a boss

// Base Archetypes for Enemies
const ENEMY_ARCHETYPES = {
    basic: {
        health: 20, speed: 1.0, damage: 10, width: 40, xpValue: 5, path: enemyPath,
        color: 'var(--enemy-color)', accentColor: 'var(--enemy-accent-color)', canShoot: false, isBoss: false,
    },
    tank: {
        health: 100, speed: 0.6, damage: 20, width: 60, xpValue: 15, path: largeEnemyPath,
        color: 'rgba(100, 50, 50, 1)', accentColor: 'rgba(200, 100, 100, 1)', canShoot: false, isBoss: false,
    },
    skirmisher: {
        health: 10, speed: 2.5, damage: 5, width: 30, xpValue: 3, path: fastEnemyPath,
        color: 'rgba(50, 100, 50, 1)', accentColor: 'rgba(100, 200, 100, 1)', canShoot: false, isBoss: false,
    },
    shooter: {
        health: 40, speed: 0.8, damage: 8, width: 50, xpValue: 10, path: shooterEnemyPath,
        color: 'rgba(50, 50, 100, 1)', accentColor: 'rgba(100, 100, 200, 1)', canShoot: true,
        projectileSpeed: 5, fireRate: 2000, projectileDamage: 15, lastShotTime: 0, isBoss: false,
    },
    boss: { // NEW Boss Archetype
        health: 500, speed: 0.5, damage: 30, width: 100, xpValue: 100, path: bossEnemyPath,
        color: 'rgba(150, 0, 150, 1)', accentColor: 'rgba(255, 100, 255, 1)', canShoot: true,
        projectileSpeed: 7, fireRate: 1500, projectileDamage: 25, lastShotTime: 0, isBoss: true,
    }
};

// --- MODIFIED: spawnEnemy to incorporate stage, wave, and boss logic ---
function spawnEnemy(enemies, currentStage, currentWave, typeOverride = null) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const buffer = 50; // Buffer distance outside camera view
    switch (side) {
        case 0: x = camera.x + Math.random() * camera.width; y = camera.y - buffer; break;
        case 1: x = camera.x + camera.width + buffer; y = camera.y + Math.random() * camera.height; break;
        case 2: x = camera.x + Math.random() * camera.width; y = camera.y + camera.height + buffer; break;
        case 3: x = camera.x - buffer; y = camera.y + Math.random() * camera.height; break;
    }

    let typeToSpawn = 'basic';
    const gameTimeSeconds = gameState.gameTime / 1000; // Keep for existing time-based modifiers if needed

    // --- NEW: Enemy Type Spawning Logic based on Wave and Stage ---
    if (typeOverride === 'boss') {
        typeToSpawn = 'boss';
    } else {
        // Regular wave enemy distribution
        const rand = Math.random();
        if (currentStage >= 1 && currentWave >= 1) { // Stage 1, Wave 1: Basic
            typeToSpawn = 'basic';
        }
        if (currentStage >= 1 && currentWave >= 2) { // Stage 1, Wave 2+: Introduce Skirmisher
            if (rand < 0.4) typeToSpawn = 'skirmisher';
            else typeToSpawn = 'basic';
        }
        if (currentStage >= 2 && currentWave >= 1) { // Stage 2: Introduce Tanks
            if (rand < 0.3) typeToSpawn = 'tank';
            else if (rand < 0.6) typeToSpawn = 'skirmisher';
            else typeToSpawn = 'basic';
        }
        if (currentStage >= 3 && currentWave >= 1) { // Stage 3: Introduce Shooters
            if (rand < 0.25) typeToSpawn = 'shooter';
            else if (rand < 0.5) typeToSpawn = 'tank';
            else if (rand < 0.75) typeToSpawn = 'skirmisher';
            else typeToSpawn = 'basic';
        }
        // Further waves within a stage or higher stages can increase probability
        if (currentWave === 4 && currentStage > 1) { // More diverse enemies in last regular wave before boss
            if (rand < 0.3) typeToSpawn = 'shooter';
            else if (rand < 0.6) typeToSpawn = 'tank';
            else typeToSpawn = 'skirmisher'; // No basic in wave 4 of higher stages
        }
    }
    // --- END NEW: Enemy Type Spawning Logic ---

    const archetype = ENEMY_ARCHETYPES[typeToSpawn];

    // --- MODIFIED: Difficulty Scaling based on Stage ---
    // The difficultyStage is now directly tied to currentStage
    const difficultyStage = currentStage; // Use currentStage for scaling

    // Define scaling factors (adjust these values to fine-tune difficulty)
    const HEALTH_SCALE_FACTOR = 0.20; // +20% health per stage
    const DAMAGE_SCALE_FACTOR = 0.15; // +15% damage per stage
    const SPEED_SCALE_FACTOR = 0.03; // +3% speed per stage (slight increase)
    const XP_SCALE_FACTOR = 0.10;   // +10% XP value per stage (reward for harder enemies)
    const PROJECTILE_DAMAGE_SCALE_FACTOR = 0.15; // +15% projectile damage per stage
    const FIRE_RATE_REDUCTION_FACTOR = 0.03; // -3% fire rate (faster shooting) per stage

    // Calculate dynamic modifiers based on difficulty stage
    // Scale more aggressively for boss if needed, or rely on its higher base stats
    const healthStageModifier = 1 + (difficultyStage * HEALTH_SCALE_FACTOR);
    const damageStageModifier = 1 + (difficultyStage * DAMAGE_SCALE_FACTOR);
    const speedStageModifier = 1 + (difficultyStage * SPEED_SCALE_FACTOR);
    const xpStageModifier = 1 + (difficultyStage * XP_SCALE_FACTOR);
    const projectileDamageStageModifier = 1 + (difficultyStage * PROJECTILE_DAMAGE_SCALE_FACTOR);
    const fireRateStageModifier = 1 / (1 + (difficultyStage * FIRE_RATE_REDUCTION_FACTOR)); 

    // Combine existing time-based health modifier (if still desired) with stage-based modifier
    // Given the wave system, time-based scaling might be less relevant or can be simplified.
    // For now, removing the old time-based scaling to prioritize stage-based.
    // If you want time-in-current-wave scaling, that would be a separate modifier.
    // const healthGameTimeModifier = 1 + (gameTimeSeconds / 60) * 0.1; 
    const finalHealthMultiplier = healthStageModifier; // Simpler: just use stage scaling for health

    let newEnemy = {
        x, y,
        // Apply scaled stats for the new enemy
        health: archetype.health * finalHealthMultiplier,
        maxHealth: archetype.health * finalHealthMultiplier,
        speed: archetype.speed * speedStageModifier,
        damage: archetype.damage * damageStageModifier,
        width: archetype.width,
        xpValue: Math.round(archetype.xpValue * xpStageModifier), // Ensure XP value is a whole number
        path: archetype.path,
        color: archetype.color,
        accentColor: archetype.accentColor,
        canShoot: archetype.canShoot,
        projectileSpeed: archetype.projectileSpeed * speedStageModifier, // Scale projectile speed too
        fireRate: archetype.fireRate * fireRateStageModifier, // Lower value means faster firing
        projectileDamage: archetype.projectileDamage * projectileDamageStageModifier,
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
        particlesSpawned: false,
        isBoss: archetype.isBoss, // NEW: Flag for boss enemies
    };

    // Boss specific adjustments if needed (e.g., specific abilities or initial states)
    if (newEnemy.isBoss) {
        newEnemy.health *= 2; // Make boss even stronger than normal scaling
        newEnemy.maxHealth = newEnemy.health;
        newEnemy.speed *= 0.8; // Bosses are typically slower
        newEnemy.xpValue *= 5; // Boss gives much more XP
    }

    enemies.push(newEnemy);
}
// --- END MODIFIED: spawnEnemy ---

function updateEnemies(deltaTime, enemies, playerObj, showLevelUpOptionsCallback, gainXPCallback) {
    const activeEnemies = enemies.filter(e => {
        const cullBuffer = 100;
        return e.x + e.width / 2 > camera.x - cullBuffer &&
               e.x - e.width / 2 < camera.x + camera.width + cullBuffer &&
               e.y + e.width / 2 > camera.y - cullBuffer &&
               e.y - e.width / 2 < camera.y + camera.height + cullBuffer;
    });

    activeEnemies.forEach((e) => {
        if (e.isDying) {
            e.deathTimer -= deltaTime;
            if (e.deathTimer <= 0) {
                e.markedForDeletion = true;
            }
            return;
        }

        const angleToPlayer = Math.atan2(playerObj.y - e.y, playerObj.x - e.x);
        let currentSpeed = e.speed * e.speedMultiplier;

        if (e.slowTimer > 0) {
            currentSpeed *= (1 - player.skills.frostNova.slowAmount);
            e.slowTimer -= deltaTime;
        }

        let nextX = e.x + Math.cos(angleToPlayer) * currentSpeed;
        let nextY = e.y + Math.sin(angleToPlayer) * currentSpeed;

        if (safeHouse.active) {
            const dx_safeHouse = nextX - safeHouse.x;
            const dy_safeHouse = nextY - safeHouse.y;
            const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);
            const safeZoneOuterBoundary = safeHouse.radius + (e.width / 2);

            if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                if (distToSafeHouseCenter === 0) {
                    nextX = safeHouse.x + Math.random() * 2 - 1;
                    nextY = safeHouse.y + Math.random() * 2 - 1;
                } else {
                    const angleFromSafeHouseCenter = Math.atan2(dy_safeHouse, dx_safeHouse);
                    nextX = safeHouse.x + Math.cos(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                    // FIX: This line was missing safeHouse.y + (re-confirmed correct now)
                    nextY = safeHouse.y + Math.sin(angleFromSafeHouseCenter) * safeZoneOuterBoundary; 
                }
            }
        }

        e.x = nextX;
        e.y = nextY;

        if (e.canShoot && gameState.gameTime - e.lastShotTime > e.fireRate) {
            const distToPlayer = Math.hypot(playerObj.x - e.x, playerObj.y - e.y);
            if (distToPlayer < camera.width / 2 + 100) { 
                fireEnemyProjectile(e, playerObj.x, playerObj.y);
                e.lastShotTime = gameState.gameTime;
            }
        }

        if (e.health <= 0 && !e.isDying) {
            if (!e.isBoss) { // Only increment kills for non-boss enemies
                playerObj.kills++;
            }
            if (playerObj.lifeSteal > 0) {
                playerObj.health = Math.min(playerObj.maxHealth, playerObj.health + playerObj.lifeSteal);
            }
            createXpOrb(e.x, e.y, e.xpValue, playerObj, gainXPCallback);

            // Level-up options now mainly triggered by XP in player.js, or time.
            // This specific kill-based trigger at player level 20 for extra options is less relevant with wave system
            // as level-ups are more guaranteed. You might keep it, or remove if too frequent.
            // I'll keep it for now as it doesn't break the wave logic.
            if (gameState.isRunning && playerObj.level >= 20 && playerObj.kills >= playerObj.nextKillUpgrade) {
                showLevelUpOptionsCallback();
                playerObj.nextKillUpgrade += 1000;
            }
            e.isDying = true;
            e.deathTimer = e.deathDuration;
            e.speed = 0; // Stop movement immediately upon death
            createImpactParticles(e.x, e.y, 20, 'enemy_death', e.color);
        }

        if (e.shockTimer > 0) {
            e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer -= deltaTime;
        }
    });
}

function drawEnemy(e, ctx, playerObj) {
    if (e.markedForDeletion && !e.isDying) return;

    const drawBuffer = 50;
    if (e.x + e.width / 2 < camera.x - drawBuffer ||
        e.x - e.width / 2 > camera.x + camera.width + drawBuffer ||
        e.y + e.width / 2 < camera.y - drawBuffer ||
        e.y - e.width / 2 > camera.y + camera.height + drawBuffer) {
        return;
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(playerObj.y - e.y, playerObj.x - e.x) + Math.PI / 2);

    if (e.isDying) {
        ctx.globalAlpha = e.deathTimer / e.deathDuration;
    }

    const HIT_FLASH_DURATION = 100;
    const isFlashing = e.lastHitTime && (gameState.gameTime - e.lastHitTime < HIT_FLASH_DURATION);
    if (isFlashing) {
        const flashAlpha = (HIT_FLASH_DURATION - (gameState.gameTime - e.lastHitTime)) / HIT_FLASH_DURATION;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.7})`;
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
    }

    if (e.slowTimer > 0) {
        ctx.fillStyle = `rgba(135, 206, 250, 0.7)`;
        ctx.fill(e.path);
    }

    ctx.fillStyle = e.color;
    ctx.fill(e.path);
    ctx.strokeStyle = e.accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke(e.path);

    // NEW: Draw health bar for enemies (especially bosses)
    if (e.health < e.maxHealth) {
        const barWidth = e.width * 1.2;
        const barHeight = 5;
        const barYOffset = -e.width / 2 - 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(-barWidth / 2, barYOffset, barWidth, barHeight);

        const currentHealthWidth = (e.health / e.maxHealth) * barWidth;
        ctx.fillStyle = e.isBoss ? 'red' : 'lime'; // Boss health is red
        ctx.fillRect(-barWidth / 2, barYOffset, currentHealthWidth, barHeight);
    }

    ctx.restore();
}

export { enemyPath, spawnEnemy, updateEnemies, drawEnemy };
