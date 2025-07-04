import { camera, gameState, safeHouse } from './systemsmanager.js';
import { createXpOrb, fireEnemyProjectile } from './attacks_skills.js';
import { player } from './player.js';

// --- Enemy Visual Paths ---
const enemyPath = new Path2D('M-12,0 Q-10,-15 0,-15 Q10,-15 12,0 L8,-5 L5,5 L0,0 L-5,5 L-8,-5 Z');
const largeEnemyPath = new Path2D('M-20,0 L0,-30 L20,0 L15,10 L0,20 L-15,10 Z');
const fastEnemyPath = new Path2D('M-8,0 L0,-15 L8,0 L0,15 Z');
const shooterEnemyPath = new Path2D('M-10,-10 L10,-10 L10,10 L-10,10 Z M0,-15 A5 5 0 1 0 0 -5');

// --- Enemy Archetype Definitions ---
const ENEMY_ARCHETYPES = {
    // Note: All damage/health values here are explicitly numbers, which is good.
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

    let typeToSpawn = 'basic';
    const gameTimeSeconds = gameState.gameTime / 1000;

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

    enemies.push({
        x, y,
        health: archetype.health * healthModifier,
        maxHealth: archetype.health * healthModifier,
        speed: archetype.speed,
        damage: archetype.damage, // Ensure this is a number from archetype
        width: archetype.width,
        xpValue: archetype.xpValue,
        path: archetype.path,
        color: archetype.color,
        accentColor: archetype.accentColor,
        canShoot: archetype.canShoot,
        projectileSpeed: archetype.projectileSpeed, // Ensure this is a number
        fireRate: archetype.fireRate,
        projectileDamage: archetype.projectileDamage, // Ensure this is a number
        lastShotTime: archetype.lastShotTime,
        shockTimer: 0,
        shockDamage: 0,
        speedMultiplier: 1.0,
        markedForDeletion: false,
        type: typeToSpawn,
    });
};

function updateEnemies(deltaTime, enemies, playerObj, showLevelUpOptionsCallback, gainXPCallback) {
    enemies.forEach((e) => {
        const angleToPlayer = Math.atan2(playerObj.y - e.y, playerObj.x - e.x);
        let nextX = e.x + Math.cos(angleToPlayer) * e.speed * e.speedMultiplier;
        let nextY = e.y + Math.sin(angleToPlayer) * e.speed * e.speedMultiplier;

        // Prevent enemies from entering the safe zone
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
                    nextY = safeHouse.y + Math.sin(angleFromSafeHouseCenter) * safeZoneOuterBoundary;
                }
            }
        }

        e.x = nextX;
        e.y = nextY;

        if (e.canShoot && gameState.gameTime - e.lastShotTime > e.fireRate) {
            const distToPlayer = Math.hypot(playerObj.x - e.x, playerObj.y - e.y);
            // Only fire if player is within a reasonable range
            if (distToPlayer < camera.width / 2 + 100) { // Example range, adjust as needed
                fireEnemyProjectile(e, playerObj.x, playerObj.y);
                e.lastShotTime = gameState.gameTime;
            }
        }

        if (e.health <= 0) {
            playerObj.kills++;
            if (playerObj.lifeSteal > 0) {
                playerObj.health = Math.min(playerObj.maxHealth, playerObj.health + playerObj.lifeSteal);
            }
            createXpOrb(e.x, e.y, e.xpValue, playerObj, gainXPCallback);
            if (gameState.isRunning && playerObj.level >= 20 && playerObj.kills >= playerObj.nextKillUpgrade) {
                showLevelUpOptionsCallback();
                playerObj.nextKillUpgrade += 1000;
            }
            e.markedForDeletion = true;
        }

        if (e.shockTimer > 0) {
            e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer -= deltaTime;
        }
    });
}

function drawEnemy(e, ctx, playerObj) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(playerObj.y - e.y, playerObj.x - e.x) + Math.PI / 2);
    if (e.slowTimer > 0) {
        ctx.fillStyle = '#87CEEB';
    } else {
        ctx.fillStyle = e.color;
    }
    ctx.fill(e.path);
    ctx.strokeStyle = e.accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke(e.path);
    ctx.restore();
}

export { enemyPath, spawnEnemy, updateEnemies, drawEnemy };