import { camera, gameState, safeHouse } from './systemsmanager.js';
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
    enemies.push({ x, y, health, speed: 1 + Math.random() * 0.8, shockTimer: 0, shockDamage: 0 });
};

function updateEnemies(deltaTime, enemies, player, showLevelUpOptionsCallback, gainXPCallback) {
    enemies.forEach((e, i) => {
        const distToSafeHouse = Math.hypot(e.x - safeHouse.x, e.y - safeHouse.y);
        if (distToSafeHouse < safeHouse.radius) {
            const angleFromCenter = Math.atan2(e.y - safeHouse.y, e.x - safeHouse.x);
            e.x += Math.cos(angleFromCenter) * e.speed * 1.5;
            e.y += Math.sin(angleFromCenter) * e.speed * 1.5;
        } else {
            const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);
            e.x += Math.cos(angleToPlayer) * e.speed;
            e.y += Math.sin(angleToPlayer) * e.speed;
        }

        if (e.health <= 0) {
            player.kills++;
            if (gameState.isRunning && player.level >= 20 && player.kills >= player.nextKillUpgrade) {
                showLevelUpOptionsCallback();
                player.nextKillUpgrade += 1000;
            }
            createXpOrb(e.x, e.y, 5, player, gainXPCallback);
            enemies.splice(i, 1);
        }

        if (e.shockTimer > 0) {
            e.health -= e.shockDamage * (deltaTime / 1000);
            e.shockTimer -= deltaTime;
        }
    });
}

export { enemyPath, spawnEnemy, updateEnemies };