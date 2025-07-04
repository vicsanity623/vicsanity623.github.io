import { gameState, enemies, projectiles, xpOrbs, particles, damageNumbers, lightningBolts, volcanicEruptions, visualEffects, screenFlash, camera, safeHouse, triggerScreenShake } from './systemsmanager.js';

const enemyProjectilePath = new Path2D('M-5,-5 L5,-5 L5,5 L-5,5 Z');
const enemyProjectileColor = 'rgba(255, 100, 100, 1)';

const playerSkillProjectilePath = new Path2D('M-5,-5 L5,-5 L5,5 L-5,5 Z');
const playerSkillProjectileColor = '#00FFFF';
const hyperBeamColor = '#FF00FF';

function hexToRgb(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) {
        hex = hex.slice(1);
    }
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    return { r, g, b };
}

function fireProjectile(p) {
    const fire = (angleOffset) => {
        for (let i = 0; i < p.weapon.count; i++) {
            const spread = (i - (p.weapon.count - 1) / 2) * 0.2;
            const angle = p.angle + angleOffset + spread;
            projectiles.push({
                x: p.x, y: p.y, angle,
                vx: Math.cos(angle) * parseFloat(p.weapon.speed),
                vy: Math.sin(angle) * parseFloat(p.weapon.speed),
                damage: parseFloat(p.weapon.damage), pierce: p.weapon.pierce,
                size: p.weapon.size, critChance: p.weapon.critChance,
                critDamage: p.weapon.critDamage,
                explodesOnImpact: p.weapon.explodesOnImpact,
                explosionRadius: p.weapon.explosionRadius,
                explosionDamage: p.weapon.explosionDamage,
                life: 1000, hitEnemies: [], trail: [],
                isPlayerProjectile: true,
                isPlayerSkillProjectile: false,
                path: null,
                color: 'var(--projectile-color)',
                update(dt) {
                    this.x += this.vx; this.y += this.vy;
                    this.trail.push({ x: this.x, y: this.y });
                    if (this.trail.length > 7) this.trail.shift();
                    this.life -= dt;
                    // Remove projectiles that are far off-screen
                    return this.life <= 0 || this.x < camera.x - 100 || this.x > camera.x + camera.width + 100 || this.y < camera.y - 100 || this.y > camera.y + camera.height + 100;
                }
            });
        }
    };
    fire(0);
    if (p.abilities.backShot) fire(Math.PI);
    if (p.abilities.diagonalShot) { fire(Math.PI / 4); fire(-Math.PI / 4); }
}

function fireEnemyProjectile(enemy, targetX, targetY) {
    const angleToPlayer = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    projectiles.push({
        x: enemy.x, y: enemy.y, angle: angleToPlayer,
        vx: Math.cos(angleToPlayer) * parseFloat(enemy.projectileSpeed),
        vy: Math.sin(angleToPlayer) * parseFloat(enemy.projectileSpeed),
        damage: parseFloat(enemy.projectileDamage),
        life: 1500,
        isPlayerProjectile: false,
        isPlayerSkillProjectile: false,
        path: enemyProjectilePath,
        color: enemyProjectileColor,
        size: { w: 10, h: 10 },
        trail: [],
        hitEnemies: [],
        update(dt) {
            this.x += this.vx; this.y += this.vy;

            if (safeHouse.active) {
                const dx_safeHouse = this.x - safeHouse.x;
                const dy_safeHouse = this.y - safeHouse.y;
                const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);
                const safeZoneOuterBoundary = safeHouse.radius + (this.size.w / 2);

                if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                    return true;
                }
            }

            this.life -= dt;
            // Remove projectiles that are far off-screen
            return this.life <= 0 || this.x < camera.x - 100 || this.x > camera.x + camera.width + 100 || this.y < camera.y - 100 || this.y > camera.y + camera.height + 100;
        }
    });
}

function firePlayerSkillProjectile(startX, startY, targetX, targetY, damage, speed, color, size) {
    const angle = Math.atan2(targetY - startY, targetX - startX);
    projectiles.push({
        x: startX, y: startY, angle,
        vx: Math.cos(angle) * parseFloat(speed),
        vy: Math.sin(angle) * parseFloat(speed),
        damage: parseFloat(damage),
        life: 1500,
        isPlayerProjectile: true,
        isPlayerSkillProjectile: true,
        path: playerSkillProjectilePath,
        color: color,
        size: { w: size, h: size },
        trail: [],
        explodesOnImpact: true,
        explosionRadius: 40,
        explosionDamage: damage * 0.8,
        hitEnemies: [],
        update(dt) {
            this.x += this.vx; this.y += this.vy;
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 5) this.trail.shift();
            this.life -= dt;
            // Remove projectiles that are far off-screen
            return this.life <= 0 || this.x < camera.x - 100 || this.x > camera.x + camera.width + 100 || this.y < camera.y - 100 || this.y > camera.y + camera.height + 100;
        }
    });
}

function fireHyperBeam(player, damage, width, duration, chargingTime, color) {
    const beamRgbColor = hexToRgb(color);
    visualEffects.push({
        type: 'hyperBeamCharge',
        x: player.x,
        y: player.y,
        angle: player.angle,
        beamWidth: width,
        life: chargingTime,
        maxLife: chargingTime,
        color: beamRgbColor,
        update(dt) {
            this.life -= dt;
            return this.life <= 0;
        }
    });

    setTimeout(() => {
        visualEffects.push({
            type: 'hyperBeam',
            x: player.x,
            y: player.y,
            angle: player.angle,
            damage: damage,
            beamWidth: width,
            life: duration,
            maxLife: duration,
            color: beamRgbColor,
            length: Math.max(camera.width, camera.height) * 2,
            hitEnemies: new Set(),
            update(dt) {
                this.life -= dt;
                return this.life <= 0;
            }
        });
        screenFlash.value = 0.5;
        triggerScreenShake(15, 300);
        visualEffects.push({
            type: 'shockwave', x: player.x, y: player.y, radius: 20, maxRadius: 250, life: 300,
            update(dt) { this.radius += (this.maxRadius / 300) * dt; this.life -= dt; return this.life <= 0; }
        });
    }, chargingTime);
}

function triggerNova(p, damage = 50, radius = 200) {
    visualEffects.push({
        type: 'shockwave', x: p.x, y: p.y, radius: 20, maxRadius: radius, life: 400,
        update(dt) { this.radius += (this.maxRadius / 400) * dt; this.life -= dt; return this.life <= 0; }
    });
    enemies.forEach(e => {
        if (Math.hypot(e.x - p.x, e.y - p.y) < radius) {
            e.health -= damage;
            spawnDamageNumber(e.x, e.y, damage, false);
            e.lastHitTime = gameState.gameTime;
        }
    });
    triggerScreenShake(8, 150);
    createImpactParticles(p.x, p.y, 30, 'nova'); // Reduced particle count
}

function createXpOrb(x, y, value, player, gainXPCallback) {
    xpOrbs.push({
        x, y, value, size: 5 + Math.random() * 5,
        isPulled: false,
        alpha: 1,
        maxLife: 1000,
        update(dt, playerClosestDist) { // Use playerClosestDist for more optimized XP pull
            const dx = player.x - this.x, dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);

            // Only pull if within the player's pickup radius
            if (dist < player.pickupRadius) {
                this.isPulled = true;
                this.alpha = Math.max(0.1, 1 - (dist / player.pickupRadius)); // Fades line based on distance
                
                // Gradually increase speed as it gets closer
                const speedFactor = Math.max(1, (player.pickupRadius - dist) / player.pickupRadius * 10);
                this.x += (dx / dist) * speedFactor * player.magnetism;
                this.y += (dy / dist) * speedFactor * player.magnetism;
            } else {
                this.isPulled = false;
                this.alpha = 1;
            }
            
            // If already at player location
            if (dist < 20) {
                if (player.abilities.healOnXp && Math.random() < 0.1) {
                    player.health = Math.min(player.maxHealth, player.health + 1);
                }
                gainXPCallback(value);
                return true;
            }
            return false;
        }
    });
}

function createImpactParticles(x, y, count, type = 'normal', color = null, initialVx = null, initialVy = null) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 5 + 1;
        let size = Math.random() * 4 + 2;
        let life = Math.random() * 300 + 150;

        let particleColor = color;
        let gravity = 0;
        let friction = 0.98;
        let endSize = size * 0.1;
        let startAlpha = 1;
        let endAlpha = 0;

        let vx = initialVx !== null ? initialVx + (Math.random() - 0.5) * 0.5 : Math.cos(angle) * speed;
        let vy = initialVy !== null ? initialVy + (Math.random() - 0.5) * 0.5 : Math.sin(angle) * speed;

        switch (type) {
            case 'nova':
                particleColor = particleColor || `rgba(255, 255, 255, 0.8)`;
                gravity = 0;
                friction = 0.99;
                endSize = size * 0.2;
                life = 200 + Math.random() * 100; // Shorter life
                break;
            case 'fire':
            case 'ember':
                particleColor = particleColor || `rgba(${255}, ${Math.floor(Math.random() * 100)}, 0, 0.9)`;
                gravity = -0.1;
                friction = 0.95;
                endSize = size * 2;
                life = 300 + Math.random() * 150; // Slightly shorter life
                startAlpha = 0.9;
                break;
            case 'ice':
                particleColor = particleColor || `rgba(${135 + Math.floor(Math.random() * 50)}, ${206 + Math.floor(Math.random() * 50)}, ${250 + Math.floor(Math.random() * 5)}, 0.9)`;
                gravity = 0.05;
                friction = 0.97;
                endSize = size * 0.5;
                life = 250 + Math.random() * 100; // Shorter life
                break;
            case 'spark':
                particleColor = particleColor || `rgba(255, 255, 255, 0.9)`;
                life = 80 + Math.random() * 70; // Very short life
                friction = 0.9;
                endSize = 0;
                startAlpha = 1;
                break;
            case 'energy':
                particleColor = particleColor || `rgba(200, 150, 255, 0.7)`;
                life = 150 + Math.random() * 100; // Shorter life
                friction = 0.98;
                endSize = 0;
                startAlpha = 0.8;
                break;
            case 'enemy_death':
                let rgb = hexToRgb(color || '#A0A0A0');
                particleColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.8 + Math.random() * 0.2})`;
                life = 300 + Math.random() * 150; // Slightly shorter life
                speed = Math.random() * 3 + 1;
                endSize = 0;
                friction = 0.95;
                break;
            case 'impact':
            default:
                particleColor = particleColor || `rgba(255, 255, 255, 0.8)`;
                life = 200 + Math.random() * 100; // Shorter life
                break;
        }

        particles.push({
            x: x, y: y,
            life: life,
            maxLife: life,
            vx: vx,
            vy: vy,
            startAlpha: startAlpha,
            endAlpha: endAlpha,
            size: size,
            startSize: size,
            endSize: endSize,
            color: particleColor,
            gravity: gravity,
            friction: friction,
            type: type,
            update(dt) {
                this.vx *= this.friction;
                this.vy *= this.friction;
                this.vy += this.gravity;
                this.x += this.vx;
                this.y += this.vy;
                this.life -= dt;

                const lifeRatio = this.life / this.maxLife;
                this.alpha = this.startAlpha * lifeRatio + this.endAlpha * (1 - lifeRatio);
                this.currentSize = this.startSize * lifeRatio + this.endSize * (1 - lifeRatio);

                return this.life <= 0;
            }
        });
    }
}

function spawnDamageNumber(x, y, value, isCrit) {
    const dx = (Math.random() - 0.5) * 15;
    const dy = (Math.random() - 0.5) * 15;
    damageNumbers.push({
        x: x + dx, y: y + dy, value, isCrit, life: 800, alpha: 1,
        update(dt) {
            this.y -= 0.5; this.life -= dt;
            this.alpha = Math.max(0, this.life / 800);
            return this.life <= 0;
        }
    });
}

function updateLightning(deltaTime, player) {
    if (!player.skills.lightning.isUnlocked) return;
    const skill = player.skills.lightning;
    if (gameState.gameTime - skill.lastStrike > skill.cooldown) {
        let lastTarget = player;
        let potentialTargets = enemies.filter(e => !e.markedForDeletion);
        for (let i = 0; i <= skill.chains; i++) {
            if(i > 0 && skill.forkChance && Math.random() < skill.forkChance) {
                lastTarget = player;
            }
            let closestTarget = null;
            let minDist = Infinity;
            potentialTargets.forEach(target => {
                const dist = Math.hypot(target.x - lastTarget.x, target.y - lastTarget.y);
                if (dist < minDist && dist < 300) {
                    minDist = dist;
                    closestTarget = target;
                }
            });
            if (closestTarget) {
                lightningBolts.push({
                    start: { x: lastTarget.x, y: lastTarget.y },
                    end: { x: closestTarget.x, y: closestTarget.y },
                    life: 150,
                    color: 'var(--lightning-color)',
                    update(dt) { this.life -= dt; return this.life <= 0; }
                });
                screenFlash.value = 0.2;
                createImpactParticles(closestTarget.x, closestTarget.y, 3, 'spark', 'var(--lightning-color)'); // Reduced particle count
                closestTarget.health -= skill.damage;
                spawnDamageNumber(closestTarget.x, closestTarget.y, Math.round(skill.damage), false);
                closestTarget.lastHitTime = gameState.gameTime;
                if (skill.shockDuration > 0) {
                    closestTarget.shockTimer = skill.shockDuration;
                    closestTarget.shockDamage = skill.damage / 2;
                }
                lastTarget = closestTarget;
                potentialTargets = potentialTargets.filter(t => t !== closestTarget && !t.markedForDeletion);
            } else { break; }
        }
        skill.lastStrike = gameState.gameTime;
    }
}

function updateVolcano(deltaTime, player) {
    if (!player.skills.volcano.isUnlocked) return;
    const skill = player.skills.volcano;
    if (gameState.gameTime - skill.lastEruption > skill.cooldown) {
        if (enemies.length > 0) {
            const eruptionCount = skill.count || 1;
            for (let i=0; i < eruptionCount; i++) {
                const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                if (!targetEnemy || targetEnemy.markedForDeletion) continue;
                volcanicEruptions.push({
                    x: targetEnemy.x, y: targetEnemy.y, radius: skill.radius,
                    damage: skill.damage, burnDuration: skill.burnDuration,
                    life: skill.burnDuration, hitEnemies: [],
                    color: 'var(--volcano-color)',
                    update(dt) {
                        enemies.forEach(e => {
                            if (!e.markedForDeletion && !this.hitEnemies.includes(e) && Math.hypot(e.x - this.x, e.y - this.y) < this.radius) {
                                e.health -= this.damage * (dt / 1000);
                                e.lastHitTime = gameState.gameTime;
                            }
                        });
                        this.life -= dt;
                        return this.life <= 0;
                    }
                });
                createImpactParticles(targetEnemy.x, targetEnemy.y, 15, 'fire'); // Reduced particle count
                targetEnemy.health -= skill.damage;
                spawnDamageNumber(targetEnemy.x, targetEnemy.y, Math.round(skill.damage), false);
                targetEnemy.lastHitTime = gameState.gameTime;
            }
            skill.lastEruption = gameState.gameTime;
        }
    }
}

function updateFrostNova(deltaTime, player) {
    if (!player.skills.frostNova.isUnlocked) return;
    const skill = player.skills.frostNova;
    if (gameState.gameTime - skill.lastCast > skill.cooldown) {
        visualEffects.push({
            type: 'frostwave', x: player.x, y: player.y, radius: 20, maxRadius: skill.radius, life: 500,
            update(dt) { this.radius += (this.maxRadius / 500) * dt; this.life -= dt; return this.life <= 0; }
        });
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < skill.radius) {
                e.health -= skill.damage;
                e.slowTimer = skill.slowDuration;
                e.slowAmount = skill.slowAmount;
                spawnDamageNumber(e.x, e.y, skill.damage, false);
                createImpactParticles(e.x, e.y, 5, 'ice'); // Reduced particle count
                e.lastHitTime = gameState.gameTime;
            }
        });
        skill.lastCast = gameState.gameTime;
    }
}

function updateBlackHole(deltaTime, player) {
    if (!player.skills.blackHole.isUnlocked) return;
    const skill = player.skills.blackHole;
    if (gameState.gameTime - skill.lastCast > skill.cooldown) {
        if (enemies.length > 0) {
            const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            if (!targetEnemy || targetEnemy.markedForDeletion) return;
            visualEffects.push({
                type: 'blackHole', x: targetEnemy.x, y: targetEnemy.y,
                radius: skill.radius, life: skill.duration, maxLife: skill.duration,
                pullStrength: skill.pullStrength, damage: skill.damage,
                update(dt) {
                    this.life -= dt;
                    enemies.forEach(e => {
                        if (!e.markedForDeletion) {
                            const dist = Math.hypot(e.x - this.x, e.y - this.y);
                            if (dist < this.radius && dist > 10) {
                                e.x -= (e.x - this.x) / dist * this.pullStrength;
                                e.y -= (e.y - this.y) / dist * this.pullStrength;
                                if (Math.random() < 0.05) { // Reduced damage tick frequency
                                    e.health -= this.damage;
                                    spawnDamageNumber(e.x, e.y, this.damage, false);
                                    e.lastHitTime = gameState.gameTime;
                                }
                            }
                        }
                    });
                    return this.life <= 0;
                }
            });
            skill.lastCast = gameState.gameTime;
        }
    }
}

export { fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile, triggerNova, createXpOrb, createImpactParticles, spawnDamageNumber, updateLightning, updateVolcano, updateFrostNova, updateBlackHole, fireHyperBeam, hexToRgb };