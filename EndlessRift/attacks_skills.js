import { gameState, enemies, projectiles, xpOrbs, particles, damageNumbers, lightningBolts, volcanicEruptions, visualEffects, screenFlash, camera } from './systemsmanager.js';

function fireProjectile(p) {
    const fire = (angleOffset) => {
        for (let i = 0; i < p.weapon.count; i++) {
            const spread = (i - (p.weapon.count - 1) / 2) * 0.2;
            const angle = p.angle + angleOffset + spread;
            projectiles.push({
                x: p.x, y: p.y, angle,
                vx: Math.cos(angle) * p.weapon.speed,
                vy: Math.sin(angle) * p.weapon.speed,
                damage: p.weapon.damage, pierce: p.weapon.pierce,
                size: p.weapon.size, critChance: p.weapon.critChance,
                // ADDED: Pass new weapon properties to the projectile object
                critDamage: p.weapon.critDamage,
                explodesOnImpact: p.weapon.explodesOnImpact,
                explosionRadius: p.weapon.explosionRadius,
                explosionDamage: p.weapon.explosionDamage,
                life: 1000, hitEnemies: [], trail: [],
                update(dt) {
                    this.x += this.vx; this.y += this.vy;
                    this.trail.push({ x: this.x, y: this.y });
                    if (this.trail.length > 7) this.trail.shift();
                    this.life -= dt;
                    return this.life <= 0 || this.x < camera.x - 50 || this.x > camera.x + camera.width + 50 || this.y < camera.y - 50 || this.y > camera.y + camera.height + 50;
                }
            });
        }
    };
    fire(0);
    if (p.abilities.backShot) fire(Math.PI);
    if (p.abilities.diagonalShot) { fire(Math.PI / 4); fire(-Math.PI / 4); }
}

function triggerNova(p, damage = 50, radius = 200) {
    visualEffects.push({
        type: 'shockwave', x: p.x, y: p.y, radius: 20, maxRadius: radius, life: 400, // MODIFIED: Use passed radius
        update(dt) { this.radius += (this.maxRadius / 400) * dt; this.life -= dt; return this.life <= 0; }
    });
    enemies.forEach(e => {
        if (Math.hypot(e.x - p.x, e.y - p.y) < radius) {
            e.health -= damage;
            spawnDamageNumber(e.x, e.y, damage, false);
        }
    });
    for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 4;
        particles.push({
            x: p.x, y: p.y, life: 800,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            alpha: 1, type: 'nova',
            update(dt) {
                this.x += this.vx; this.y += this.vy;
                this.vx *= 0.95; this.vy *= 0.95;
                this.life -= dt; this.alpha = this.life / 800;
                return this.life <= 0;
            }
        });
    }
}

function createXpOrb(x, y, value, player, gainXPCallback) {
    xpOrbs.push({
        x, y, value, size: 5 + Math.random() * 5,
        update(dt, playerDist) {
            const dx = player.x - this.x, dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < player.pickupRadius) {
                // MODIFIED: Use magnetism property
                this.x += (dx / dist) * 8 * player.magnetism;
                this.y += (dy / dist) * 8 * player.magnetism;
            }
            if (dist < 20) {
                // MODIFIED: Check for heal on XP pickup
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

function createImpactParticles(x, y, count, type = 'normal') {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        const life = 400 + Math.random() * 200;
        particles.push({
            x, y, life,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            alpha: 1, type: type, size: Math.random() * 2 + 1,
            update(dt) {
                this.x += this.vx; this.y += this.vy;
                this.vx *= 0.96; this.vy *= 0.96;
                this.life -= dt; this.alpha = this.life / 400;
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
        let potentialTargets = [...enemies];
        for (let i = 0; i <= skill.chains; i++) {
            if(i > 0 && skill.forkChance && Math.random() < skill.forkChance) { // ADDED: Fork logic
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
                    life: 150, update(dt) { this.life -= dt; return this.life <= 0; }
                });
                screenFlash.value = 0.2;
                createImpactParticles(closestTarget.x, closestTarget.y, 5, 'lightning');
                closestTarget.health -= skill.damage;
                spawnDamageNumber(closestTarget.x, closestTarget.y, Math.round(skill.damage), false);
                if (skill.shockDuration > 0) {
                    closestTarget.shockTimer = skill.shockDuration;
                    closestTarget.shockDamage = skill.damage / 2;
                }
                lastTarget = closestTarget;
                potentialTargets = potentialTargets.filter(t => t !== closestTarget);
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
            const eruptionCount = skill.count || 1; // ADDED: Multiple eruptions
            for (let i=0; i < eruptionCount; i++) {
                const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                volcanicEruptions.push({
                    x: targetEnemy.x, y: targetEnemy.y, radius: skill.radius,
                    damage: skill.damage, burnDuration: skill.burnDuration,
                    life: skill.burnDuration, hitEnemies: [],
                    update(dt) {
                        enemies.forEach(e => {
                            if (!this.hitEnemies.includes(e) && Math.hypot(e.x - this.x, e.y - this.y) < this.radius) {
                                e.health -= this.damage * (dt / 1000);
                            }
                        });
                        this.life -= dt;
                        return this.life <= 0;
                    }
                });
                for (let j = 0; j < 30; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 6 + 3;
                    particles.push({
                        x: targetEnemy.x, y: targetEnemy.y,
                        life: 800 + Math.random() * 400,
                        vx: Math.cos(angle) * speed * 0.3, vy: -speed,
                        type: 'ember', alpha: 1,
                        update(dt) {
                            this.x += this.vx; this.y += this.vy; this.vy += 0.1;
                            this.life -= dt; this.alpha = this.life / 1000;
                            return this.life <= 0;
                        }
                    });
                }
                targetEnemy.health -= skill.damage;
                spawnDamageNumber(targetEnemy.x, targetEnemy.y, Math.round(skill.damage), false);
            }
            skill.lastEruption = gameState.gameTime;
        }
    }
}

// --- ADDED: NEW SKILL FUNCTIONS ---

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
            visualEffects.push({
                type: 'blackHole', x: targetEnemy.x, y: targetEnemy.y,
                radius: skill.radius, life: skill.duration,
                pullStrength: skill.pullStrength, damage: skill.damage,
                update(dt) {
                    this.life -= dt;
                    enemies.forEach(e => {
                        const dist = Math.hypot(e.x - this.x, e.y - this.y);
                        if (dist < this.radius && dist > 10) { // Keep enemies from collapsing to the center
                            e.x -= (e.x - this.x) / dist * this.pullStrength;
                            e.y -= (e.y - this.y) / dist * this.pullStrength;
                            if (Math.random() < 0.1) { // Deal damage periodically
                                e.health -= this.damage;
                                spawnDamageNumber(e.x, e.y, this.damage, false);
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


// MODIFIED: Export the new functions
export { fireProjectile, triggerNova, createXpOrb, createImpactParticles, spawnDamageNumber, updateLightning, updateVolcano, updateFrostNova, updateBlackHole };