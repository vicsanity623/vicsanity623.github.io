// attacks_skills.js

// Import player object
import { player } from './player.js'; 

const enemyProjectilePath = new Path2D('M-5,-5 L5,-5 L5,5 L-5,5 Z');
const enemyProjectileColor = 'rgba(255, 100, 100, 1)';

const playerSkillProjectilePath = new Path2D('M-5,-5 L5,-5 L5,5 L-5,5 Z');

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

// Pass projectiles, camera as parameters
function fireProjectile(p, projectilesArray, camera) {
    const fire = (angleOffset) => {
        for (let i = 0; i < p.weapon.count; i++) {
            const spread = (i - (p.weapon.count - 1) / 2) * 0.2;
            const angle = p.angle + angleOffset + spread;
            projectilesArray.push({
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
                update(dt, currentCamera, currentSafeHouse) { // Update method receives currentCamera and currentSafeHouse
                    this.x += this.vx; this.y += this.vy;
                    this.trail.push({ x: this.x, y: this.y });
                    if (this.trail.length > 7) this.trail.shift();
                    this.life -= dt;
                    // Remove projectiles that are far off-screen
                    return this.life <= 0 || this.x < currentCamera.x - 100 || this.x > currentCamera.x + currentCamera.width + 100 || this.y < currentCamera.y - 100 || this.y > currentCamera.y + currentCamera.height + 100;
                }
            });
        }
    };
    fire(0);
    if (p.abilities.backShot) fire(Math.PI);
    if (p.abilities.diagonalShot) { fire(Math.PI / 4); fire(-Math.PI / 4); }
}

// Pass projectilesArray, camera, safeHouse as parameters
function fireEnemyProjectile(enemy, targetX, targetY, projectilesArray, camera, safeHouse) {
    const angleToPlayer = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    projectilesArray.push({
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
        update(dt, currentCamera, currentSafeHouse) { // Update method receives currentCamera and currentSafeHouse
            this.x += this.vx; this.y += this.vy;

            if (currentSafeHouse && currentSafeHouse.active) { // Check if safeHouse exists and is active
                const dx_safeHouse = this.x - currentSafeHouse.x;
                const dy_safeHouse = this.y - currentSafeHouse.y;
                const distToSafeHouseCenter = Math.hypot(dx_safeHouse, dy_safeHouse);
                const safeZoneOuterBoundary = currentSafeHouse.radius + (this.size.w / 2);

                if (distToSafeHouseCenter < safeZoneOuterBoundary) {
                    return true; // Projectile disappears if it enters the safe zone
                }
            }

            this.life -= dt;
            // Remove projectiles that are far off-screen
            return this.life <= 0 || this.x < currentCamera.x - 100 || this.x > currentCamera.x + currentCamera.width + 100 || this.y < currentCamera.y - 100 || this.y > currentCamera.y + currentCamera.height + 100;
        }
    });
}

// Pass projectilesArray, camera as parameters
function firePlayerSkillProjectile(startX, startY, targetX, targetY, damage, speed, color, size, projectilesArray, camera) {
    const angle = Math.atan2(targetY - startY, targetX - startX);
    projectilesArray.push({
        x: startX, y: startY, angle,
        vx: Math.cos(angle) * parseFloat(speed),
        vy: Math.sin(angle) * parseFloat(speed),
        damage: parseFloat(damage),
        life: 1500,
        isPlayerProjectile: true,
        isPlayerSkillProjectile: true,
        path: playerSkillProjectilePath, // Using the shared path
        color: color,
        size: { w: size, h: size },
        trail: [],
        explodesOnImpact: true, // All skill projectiles explode on first hit
        explosionRadius: 40, // Default explosion radius
        explosionDamage: damage * 0.8, // Default explosion damage
        hitEnemies: [],
        update(dt, currentCamera) { // Update method receives currentCamera
            this.x += this.vx; this.y += this.vy;
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 5) this.trail.shift();
            this.life -= dt;
            // Remove projectiles that are far off-screen
            return this.life <= 0 || this.x < currentCamera.x - 100 || this.x > currentCamera.x + currentCamera.width + 100 || this.y < currentCamera.y - 100 || this.y > currentCamera.y + currentCamera.height + 100;
        }
    });
}

// Pass visualEffectsArray, screenFlashObject, triggerScreenShakeCallback as parameters
function fireHyperBeam(player, damage, width, duration, chargingTime, color, visualEffectsArray, screenFlashObject, triggerScreenShakeCallback) {
    const beamRgbColor = hexToRgb(color);
    visualEffectsArray.push({
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
        visualEffectsArray.push({
            type: 'hyperBeam',
            x: player.x,
            y: player.y,
            angle: player.angle,
            damage: damage,
            beamWidth: width,
            life: duration,
            maxLife: duration,
            color: beamRgbColor,
            length: 2000, // Fixed length for hyper beam to cover large area
            hitEnemies: new Set(),
            update(dt) {
                this.life -= dt;
                return this.life <= 0;
            }
        });
        screenFlashObject.value = 0.5; // Use passed screenFlashObject
        triggerScreenShakeCallback(15, 300); // Use passed triggerScreenShakeCallback
        visualEffectsArray.push({
            type: 'shockwave', x: player.x, y: player.y, radius: 20, maxRadius: 250, life: 300,
            update(dt) { this.radius += (this.maxRadius / 300) * dt; this.life -= dt; return this.life <= 0; }
        });
    }, chargingTime);
}

// Pass visualEffectsArray, enemiesArray, spawnDamageNumberCallback, triggerScreenShakeCallback, particlesArray as parameters
function triggerNova(p, damage = 50, radius = 200, visualEffectsArray, enemiesArray, spawnDamageNumberCallback, triggerScreenShakeCallback, particlesArray) {
    visualEffectsArray.push({
        type: 'shockwave', x: p.x, y: p.y, radius: 20, maxRadius: radius, life: 400,
        update(dt) { this.radius += (this.maxRadius / 400) * dt; this.life -= dt; return this.life <= 0; }
    });
    enemiesArray.forEach(e => {
        if (Math.hypot(e.x - p.x, e.y - p.y) < radius) {
            e.health -= damage;
            spawnDamageNumberCallback(e.x, e.y, damage, false); // Use passed callback
            e.lastHitTime = 0; // Reset lastHitTime to ensure damage is applied
        }
    });
    triggerScreenShakeCallback(8, 150); // Use passed callback
    createImpactParticles(p.x, p.y, 30, 'nova', null, null, null, particlesArray); // Pass particlesArray
}

// Pass xpOrbsArray, player, gainXPCallback as parameters
function createXpOrb(x, y, value, playerObj, gainXPCallback, xpOrbsArray) {
    xpOrbsArray.push({
        x, y, value, size: 5 + Math.random() * 5,
        isPulled: false,
        alpha: 1,
        update(dt) { 
            const dx = playerObj.x - this.x, dy = playerObj.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < playerObj.pickupRadius) {
                this.isPulled = true;
                this.alpha = Math.max(0.1, 1 - (dist / playerObj.pickupRadius)); 
                
                const speedFactor = Math.max(1, (playerObj.pickupRadius - dist) / playerObj.pickupRadius * 10);
                this.x += (dx / dist) * speedFactor * playerObj.magnetism * (dt/16); 
                this.y += (dy / dist) * speedFactor * playerObj.magnetism * (dt/16); 
            } else {
                this.isPulled = false;
                this.alpha = 1;
            }
            
            if (dist < 20) {
                if (playerObj.abilities.healOnXp && Math.random() < 0.1) {
                    playerObj.health = Math.min(playerObj.maxHealth, playerObj.health + 1);
                }
                gainXPCallback(value);
                return true;
            }
            return false;
        }
    });
}

// Pass particlesArray as parameter
function createImpactParticles(x, y, count, type = 'normal', color = null, initialVx = null, initialVy = null, particlesArray) {
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
                life = 200 + Math.random() * 100;
                break;
            case 'fire':
            case 'ember':
                particleColor = particleColor || `rgba(${255}, ${Math.floor(Math.random() * 100)}, 0, 0.9)`;
                gravity = -0.1;
                friction = 0.95;
                endSize = size * 2;
                life = 300 + Math.random() * 150;
                startAlpha = 0.9;
                break;
            case 'ice':
                particleColor = particleColor || `rgba(${135 + Math.floor(Math.random() * 50)}, ${206 + Math.floor(Math.random() * 50)}, ${250 + Math.floor(Math.random() * 5)}, 0.9)`;
                gravity = 0.05;
                friction = 0.97;
                endSize = size * 0.5;
                life = 250 + Math.random() * 100;
                break;
            case 'spark':
                particleColor = particleColor || `rgba(255, 255, 255, 0.9)`;
                life = 80 + Math.random() * 70;
                friction = 0.9;
                endSize = 0;
                startAlpha = 1;
                break;
            case 'energy':
                particleColor = particleColor || `rgba(200, 150, 255, 0.7)`;
                life = 150 + Math.random() * 100;
                friction = 0.98;
                endSize = 0;
                startAlpha = 0.8;
                break;
            case 'enemy_death':
                let rgb = hexToRgb(color || '#A0A0A0');
                particleColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.8 + Math.random() * 0.2})`;
                life = 300 + Math.random() * 150;
                speed = Math.random() * 3 + 1;
                endSize = 0;
                friction = 0.95;
                break;
            case 'impact':
            default:
                particleColor = particleColor || `rgba(255, 255, 255, 0.8)`;
                life = 200 + Math.random() * 100;
                break;
        }

        particlesArray.push({ // Use passed particlesArray
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

// Pass damageNumbersArray as parameter
function spawnDamageNumber(x, y, value, isCrit, damageNumbersArray, gameTime) {
    const dx = (Math.random() - 0.5) * 15;
    const dy = (Math.random() - 0.5) * 15;
    damageNumbersArray.push({ // Use passed damageNumbersArray
        x: x + dx, y: y + dy, value, isCrit, life: 800, alpha: 1,
        update(dt) {
            this.y -= 0.5; this.life -= dt;
            this.alpha = Math.max(0, this.life / 800);
            return this.life <= 0;
        }
    });
}

// Pass enemiesArray, gameTime, lightningBoltsArray, screenFlashObject, createImpactParticlesCallback, spawnDamageNumberCallback as parameters
function updateLightning(deltaTime, player, enemiesArray, gameTime, lightningBoltsArray, screenFlashObject, createImpactParticlesCallback, spawnDamageNumberCallback) {
    if (!player.skills.lightning.isUnlocked) return;
    const skill = player.skills.lightning;
    if (gameTime - skill.lastStrike > skill.cooldown) {
        let lastTarget = player;
        let potentialTargets = enemiesArray.filter(e => !e.markedForDeletion); // Use passed enemiesArray
        for (let i = 0; i <= skill.chains; i++) {
            if(i > 0 && skill.forkChance && Math.random() < skill.forkChance) {
                lastTarget = player; // Fork from player again
            }
            let closestTarget = null;
            let minDist = Infinity;
            potentialTargets.forEach(target => {
                const dist = Math.hypot(target.x - lastTarget.x, target.y - lastTarget.y);
                if (dist < minDist && dist < 300) { // Limit chain range
                    minDist = dist;
                    closestTarget = target;
                }
            });
            if (closestTarget) {
                lightningBoltsArray.push({ // Use passed lightningBoltsArray
                    start: { x: lastTarget.x, y: lastTarget.y },
                    end: { x: closestTarget.x, y: closestTarget.y },
                    life: 150,
                    color: 'var(--lightning-color)',
                    update(dt) { this.life -= dt; return this.life <= 0; }
                });
                screenFlashObject.value = 0.2; // Use passed screenFlashObject
                createImpactParticlesCallback(closestTarget.x, closestTarget.y, 3, 'spark', 'var(--lightning-color')); // Use passed callback
                closestTarget.health -= skill.damage;
                spawnDamageNumberCallback(closestTarget.x, closestTarget.y, Math.round(skill.damage), false); // Use passed callback
                closestTarget.lastHitTime = gameTime;
                if (skill.shockDuration > 0) {
                    closestTarget.shockTimer = skill.shockDuration;
                    closestTarget.shockDamage = skill.damage / 2;
                }
                lastTarget = closestTarget;
                potentialTargets = potentialTargets.filter(t => t !== closestTarget && !t.markedForDeletion);
            } else { break; }
        }
        skill.lastStrike = gameTime;
    }
}

// Pass enemiesArray, gameTime, volcanicEruptionsArray, createImpactParticlesCallback, spawnDamageNumberCallback as parameters
function updateVolcano(deltaTime, player, enemiesArray, gameTime, volcanicEruptionsArray, createImpactParticlesCallback, spawnDamageNumberCallback) {
    if (!player.skills.volcano.isUnlocked) return;
    const skill = player.skills.volcano;
    if (gameTime - skill.lastEruption > skill.cooldown) {
        if (enemiesArray.length > 0) { // Use passed enemiesArray
            const eruptionCount = skill.count || 1;
            for (let i=0; i < eruptionCount; i++) {
                const targetEnemy = enemiesArray[Math.floor(Math.random() * enemiesArray.length)]; // Use passed enemiesArray
                if (!targetEnemy || targetEnemy.markedForDeletion) continue;
                volcanicEruptionsArray.push({ // Use passed volcanicEruptionsArray
                    x: targetEnemy.x, y: targetEnemy.y, radius: skill.radius,
                    damage: skill.damage, burnDuration: skill.burnDuration,
                    life: skill.burnDuration, hitEnemies: [],
                    color: 'var(--volcano-color)',
                    update(dt) {
                        enemiesArray.forEach(e => { // Use passed enemiesArray
                            if (!e.markedForDeletion && !this.hitEnemies.includes(e) && Math.hypot(e.x - this.x, e.y - this.y) < this.radius) {
                                e.health -= this.damage * (dt / 1000); // Continuous damage while in zone
                                e.lastHitTime = gameTime; // Keep this here for potential damage indication
                            }
                        });
                        this.life -= dt;
                        return this.life <= 0;
                    }
                });
                createImpactParticlesCallback(targetEnemy.x, targetEnemy.y, 15, 'fire'); // Use passed callback
                // Initial burst damage from volcano
                targetEnemy.health -= skill.damage;
                spawnDamageNumberCallback(targetEnemy.x, targetEnemy.y, Math.round(skill.damage), false); // Use passed callback
                targetEnemy.lastHitTime = gameTime; // Ensure enemy hit time is updated
            }
            skill.lastEruption = gameTime;
        }
    }
}

// Pass enemiesArray, gameTime, visualEffectsArray, createImpactParticlesCallback, spawnDamageNumberCallback as parameters
function updateFrostNova(deltaTime, player, enemiesArray, gameTime, visualEffectsArray, createImpactParticlesCallback, spawnDamageNumberCallback) {
    if (!player.skills.frostNova.isUnlocked) return;
    const skill = player.skills.frostNova;
    if (gameTime - skill.lastCast > skill.cooldown) {
        visualEffectsArray.push({ // Use passed visualEffectsArray
            type: 'frostwave', x: player.x, y: player.y, radius: 20, maxRadius: skill.radius, life: 500,
            update(dt) { this.radius += (this.maxRadius / 500) * dt; this.life -= dt; return this.life <= 0; }
        });
        enemiesArray.forEach(e => { // Use passed enemiesArray
            if (Math.hypot(e.x - player.x, e.y - player.y) < skill.radius) {
                e.health -= skill.damage;
                e.slowTimer = skill.slowDuration;
                e.slowAmount = skill.slowAmount;
                spawnDamageNumberCallback(e.x, e.y, skill.damage, false); // Use passed callback
                createImpactParticlesCallback(e.x, e.y, 5, 'ice'); // Use passed callback
                e.lastHitTime = gameTime;
            }
        });
        skill.lastCast = gameTime;
    }
}

// Pass enemiesArray, gameTime, visualEffectsArray, createImpactParticlesCallback, spawnDamageNumberCallback as parameters
function updateBlackHole(deltaTime, player, enemiesArray, gameTime, visualEffectsArray, createImpactParticlesCallback, spawnDamageNumberCallback) {
    if (!player.skills.blackHole.isUnlocked) return;
    const skill = player.skills.blackHole;
    if (gameTime - skill.lastCast > skill.cooldown) {
        if (enemiesArray.length > 0) { // Use passed enemiesArray
            const targetEnemy = enemiesArray[Math.floor(Math.random() * enemiesArray.length)]; // Use passed enemiesArray
            if (!targetEnemy || targetEnemy.markedForDeletion) return;
            visualEffectsArray.push({ // Use passed visualEffectsArray
                type: 'blackHole', x: targetEnemy.x, y: targetEnemy.y,
                radius: skill.radius, life: skill.duration, maxLife: skill.duration,
                pullStrength: skill.pullStrength, damage: skill.damage,
                update(dt) {
                    this.life -= dt;
                    enemiesArray.forEach(e => { // Use passed enemiesArray
                        if (!e.markedForDeletion) {
                            const dist = Math.hypot(e.x - this.x, e.y - this.y);
                            if (dist < this.radius && dist > 10) {
                                e.x -= (e.x - this.x) / dist * this.pullStrength * (dt/16);
                                e.y -= (e.y - this.y) / dist * this.pullStrength * (dt/16);
                                if (Math.random() < 0.05) { 
                                    e.health -= this.damage;
                                    spawnDamageNumberCallback(e.x, e.y, this.damage, false); // Use passed callback
                                    e.lastHitTime = gameTime;
                                }
                            }
                        }
                    });
                    return this.life <= 0;
                }
            });
            skill.lastCast = gameTime;
        }
    }
}

// New: Projectile drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawProjectile(p, ctx) { 
    if (p.isPlayerProjectile) {
        if (p.isPlayerSkillProjectile) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 20;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillRect(-p.size.w / 2, -p.size.h / 2, p.size.w, p.size.h);
            ctx.restore();

            // createImpactParticles needs to be imported or passed for this to work
            // Since it's exported, it will be available where this function is called.
            if (Math.random() < 0.3) {
                // This call assumes createImpactParticles is imported in systemsmanager.js
                // and available via the draw loop. For a fully self-contained attacks_skills,
                // createImpactParticles would need to be passed as a parameter here too.
                // However, given the current module structure, this should work.
                createImpactParticles(p.x - p.vx * 0.1, p.y - p.vy * 0.1, 1, 'nova', p.color);
            }

        } else {
            if (p.trail.length < 2) return;
            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = p.color || 'var(--projectile-color)';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            for (let i = 1; i < p.trail.length; i++) {
                const point = p.trail[i];
                ctx.lineWidth = (i / p.trail.length) * p.size.w * 1.5;
                ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
            ctx.restore();
        }
    } else {
        ctx.save();
        ctx.fillStyle = p.color || 'rgba(255, 0, 0, 1)';
        ctx.shadowColor = p.color || 'rgba(255, 0, 0, 1)';
        ctx.shadowBlur = 10;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fill(p.path);
        ctx.restore();
    }
}

// New: XP Orb drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawXpOrb(o, ctx, playerObj, gameTime) { 
    ctx.save();
    ctx.fillStyle = 'var(--highlight-xp-orb-color)';
    ctx.shadowColor = 'var(--highlight-xp-orb-color)';
    ctx.shadowBlur = 25;

    const pulseScale = 1 + Math.sin(gameTime / 200) * 0.1;
    const currentSize = o.size * pulseScale;

    ctx.beginPath();
    ctx.arc(o.x, o.y, currentSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    if (o.isPulled) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 0, ${o.alpha || 1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(playerObj.x, playerObj.y);
        ctx.stroke();
        ctx.restore();
    }
}

// New: Damage Number drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawDamageNumber(dn, ctx) { 
    ctx.save(); ctx.translate(dn.x, dn.y); ctx.globalAlpha = dn.alpha; ctx.fillStyle = dn.isCrit ? 'yellow' : 'var(--damage-text-color)'; ctx.font = dn.isCrit ? 'bold 24px Roboto' : 'bold 18px Roboto'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(dn.value, 0, 0); ctx.restore();
}

// New: Lightning Bolt drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawLightningBolt(bolt, ctx, createImpactParticlesCallback) { 
    ctx.save();
    ctx.globalAlpha = Math.min(1, bolt.life / 100);
    ctx.strokeStyle = bolt.color || 'var(--lightning-color)';
    ctx.lineWidth = 3;
    ctx.shadowColor = bolt.color || 'var(--lightning-color)';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(bolt.start.x, bolt.start.y);
    const segments = 15;
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const x = bolt.start.x * (1 - t) + bolt.end.x * t;
        const y = bolt.start.y * (1 - t) + bolt.end.y * t;
        if (i < segments) {
            ctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    if (bolt.life > 50 && Math.random() < 0.5) {
        createImpactParticlesCallback(bolt.end.x, bolt.end.y, 1, 'spark', bolt.color);
    }
    ctx.restore();
}

// New: Volcano drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawVolcano(v, ctx, gameTime, createImpactParticlesCallback) { 
    ctx.save();
    const lifePercent = v.life / v.burnDuration;
    ctx.globalAlpha = lifePercent * 0.7;
    ctx.fillStyle = v.color || 'var(--volcano-color)';

    ctx.beginPath();
    ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
        const bubbleRadius = v.radius * (0.3 + Math.sin(gameTime / (100 + i * 50)) * 0.1);
        const offsetX = Math.cos(gameTime / (80 + i * 30)) * (v.radius * 0.3);
        const offsetY = Math.sin(gameTime / (90 + i * 40)) * (v.radius * 0.3);
        ctx.globalAlpha = lifePercent * (0.4 + Math.random() * 0.2);
        ctx.fillStyle = `rgba(255, ${100 + Math.floor(Math.random() * 50)}, 0, 1)`;
        ctx.beginPath();
        ctx.arc(v.x + offsetX, v.y + offsetY, bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    if (lifePercent > 0.1 && Math.random() < 0.2) {
        createImpactParticlesCallback(v.x + (Math.random() - 0.5) * v.radius,
                              v.y + (Math.random() - 0.5) * v.radius,
                              1, 'fire');
    }
    ctx.restore();
}

// New: Soul Vortex drawing logic (moved from systemsmanager.js)
// CRITICAL FIX: Explicitly accept 'ctx' as a parameter.
function drawSoulVortex(playerObj, ctx) { 
    const shield = playerObj.abilities.orbitingShield;
    if (!shield.enabled) return;

    const count = shield.count || 1;
    const soulRadius = shield.radius || 10;
    const orbitDistance = shield.distance || 50;

    for (let i = 0; i < count; i++) {
        const angle = shield.angle + (i * (Math.PI * 2 / count));
        const soulX = playerObj.x + Math.cos(angle) * orbitDistance;
        const soulY = playerObj.y + Math.sin(angle) * orbitDistance;

        ctx.save();
        ctx.beginPath();
        ctx.arc(soulX, soulY, soulRadius, 0, Math.PI * 2);

        ctx.fillStyle = `rgba(150, 0, 255, 0.7)`;
        ctx.shadowColor = `rgba(180, 50, 255, 1)`;
        ctx.shadowBlur = 15;
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 255, 255, 0.8)`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        // createImpactParticles needs to be imported or passed for this to work
        if (Math.random() < 0.05) {
            createImpactParticles(soulX, soulY, 1, 'energy', `rgba(200, 150, 255, 0.7)`);
        }
    }
}

// Export all functions that are used by other modules, including the new draw functions
export {
    fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile, triggerNova,
    createXpOrb, createImpactParticles, spawnDamageNumber,
    updateLightning, updateVolcano, updateFrostNova, updateBlackHole,
    fireHyperBeam, hexToRgb, 
    drawSoulVortex, drawProjectile, drawXpOrb, drawDamageNumber, drawLightningBolt, drawVolcano // Exported drawing functions
};