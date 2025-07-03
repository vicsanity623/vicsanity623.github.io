import { gameState, enemies, projectiles, xpOrbs, particles, damageNumbers, lightningBolts, volcanicEruptions, visualEffects, screenFlash, camera } from './systemsmanager.js';

// MODIFIED: triggerNova now accepts an optional enemiesRef to apply damage to global enemies
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
                    // Projectiles should only be removed if they are outside the world bounds,
                    // not just camera view, as they might target enemies far away.
                    // Assuming world bounds are relevant, otherwise keep original.
                    return this.life <= 0 || this.x < 0 || this.x > gameState.world.width || this.y < 0 || this.y > gameState.world.height;
                }
            });
        }
    };
    fire(0);
    if (p.abilities.backShot) fire(Math.PI);
    if (p.abilities.diagonalShot) { fire(Math.PI / 4); fire(-Math.PI / 4); fire(Math.PI * 3 / 4); fire(-Math.PI * 3 / 4); } // MODIFIED: Corrected diagonal shot to fire all 4 diagonals
}

// MODIFIED: triggerNova now accepts enemiesRef for global damage application
function triggerNova(p, damage = 50, radius = 200, enemiesRef = null) {
    visualEffects.push({
        type: 'shockwave', x: p.x, y: p.y, radius: 20, maxRadius: radius, life: 400, // MODIFIED: Use passed radius
        update(dt) { this.radius += (this.maxRadius / 400) * dt; this.life -= dt; return this.life <= 0; }
    });
    // Apply damage to global enemies if enemiesRef is provided and current client is host
    if (enemiesRef && gameState.isHost) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < radius) {
                enemiesRef.child(e.id).child('health').set(e.health - damage); // Update global enemy health
                spawnDamageNumber(e.x, e.y, damage, false);
            }
        });
    } else { // Fallback for non-host or if enemiesRef is not provided (e.g., local particles only)
        enemies.forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < radius) {
                // If not host or not syncing, just apply locally for visual/immediate feedback
                e.health -= damage;
                spawnDamageNumber(e.x, e.y, damage, false);
            }
        });
    }

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

// MODIFIED: createXpOrb now returns the orb object with a unique ID for DB storage
function createXpOrb(x, y, value, player, gainXPCallback) {
    const orbId = `orb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newOrb = {
        id: orbId, // NEW: Unique ID for Realtime Database
        x, y, value, size: 5 + Math.random() * 5,
        // The update function for XP orbs is now self-contained,
        // it applies XP locally and reports pickup for DB removal.
        update(dt, options) { // options contains player and gainXPCallback, isMultiplayer
            const localPlayer = options.player;
            const localGainXPCallback = options.gainXPCallback;
            const isMultiplayer = options.isMultiplayer;

            const dx = localPlayer.x - this.x;
            const dy = localPlayer.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < localPlayer.pickupRadius) {
                this.x += (dx / dist) * 8 * localPlayer.magnetism;
                this.y += (dy / dist) * 8 * localPlayer.magnetism;
            }
            if (dist < 20) {
                // MODIFIED: Check for heal on XP pickup
                if (localPlayer.abilities.healOnXp && Math.random() < 0.1) {
                    localPlayer.health = Math.min(localPlayer.maxHealth, localPlayer.health + 1);
                }
                // Call the local gainXPCallback (which is player.gainXP from systemsmanager)
                // This function internally triggers level-ups and applies player progression.
                localGainXPCallback(this.value, this.id); // Pass orb ID so systemsmanager knows which one to remove
                return true; // Mark for local removal
            }
            return false;
        }
    };
    xpOrbs.push(newOrb); // Add to local array for rendering
    return newOrb; // Return the orb object so the host can push it to DB
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

// MODIFIED: Skill functions now take enemiesRef for global damage application
function updateLightning(deltaTime, player, enemiesRef) {
    if (!player.skills.lightning.isUnlocked) return;
    const skill = player.skills.lightning;
    if (gameState.gameTime - skill.lastStrike > skill.cooldown) {
        let lastTarget = player;
        let potentialTargets = [...enemies]; // Use the local 'enemies' array for targeting visuals
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
                spawnDamageNumber(closestTarget.x, closestTarget.y, Math.round(skill.damage), false);

                // Apply damage to global enemy only if host
                if (gameState.isHost) {
                    enemiesRef.child(closestTarget.id).update({
                        health: closestTarget.health - skill.damage,
                        shockTimer: skill.shockDuration > 0 ? skill.shockDuration : 0,
                        shockDamage: skill.shockDuration > 0 ? skill.damage / 2 : 0
                    });
                } else {
                    // Non-host clients can apply local visual/immediate feedback
                    closestTarget.health -= skill.damage; // Local health update for immediate visual
                    if (skill.shockDuration > 0) {
                        closestTarget.shockTimer = skill.shockDuration;
                        closestTarget.shockDamage = skill.damage / 2;
                    }
                }

                lastTarget = closestTarget;
                potentialTargets = potentialTargets.filter(t => t !== closestTarget);
            } else { break; }
        }
        skill.lastStrike = gameState.gameTime;
    }
}

// MODIFIED: Skill functions now take enemiesRef for global damage application
function updateVolcano(deltaTime, player, enemiesRef) {
    if (!player.skills.volcano.isUnlocked) return;
    const skill = player.skills.volcano;
    if (gameState.gameTime - skill.lastEruption > skill.cooldown) {
        if (enemies.length > 0) {
            const eruptionCount = skill.count || 1; // ADDED: Multiple eruptions
            for (let i=0; i < eruptionCount; i++) {
                const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                if (!targetEnemy) continue; // Ensure target enemy exists

                const volcanoEffect = {
                    x: targetEnemy.x, y: targetEnemy.y, radius: skill.radius,
                    damage: skill.damage, burnDuration: skill.burnDuration,
                    life: skill.burnDuration, hitEnemies: [], // Keep track of already hit enemies locally for continuous damage
                    update(dt) {
                        enemies.forEach(e => { // Iterate over current local enemies
                            // Check if this specific enemy has not been hit by this volcano effect yet AND is within radius
                            if (e && !this.hitEnemies.includes(e.id) && Math.hypot(e.x - this.x, e.y - this.y) < this.radius) {
                                // Apply initial burst damage only once per enemy per volcano effect
                                if (gameState.isHost) {
                                    enemiesRef.child(e.id).child('health').set(e.health - (this.damage * (dt / 1000))); // Apply damage over time
                                } else {
                                    e.health -= this.damage * (dt / 1000); // Local estimate
                                }
                                this.hitEnemies.push(e.id); // Mark enemy as hit by this volcano effect
                            }
                        });
                        this.life -= dt;
                        return this.life <= 0;
                    }
                };
                visualEffects.push(volcanoEffect); // Add to visual effects

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
                // Apply initial burst damage if host
                if (gameState.isHost) {
                    enemiesRef.child(targetEnemy.id).child('health').set(targetEnemy.health - skill.damage);
                } else {
                    targetEnemy.health -= skill.damage; // Local estimate
                }
                spawnDamageNumber(targetEnemy.x, targetEnemy.y, Math.round(skill.damage), false);
            }
            skill.lastEruption = gameState.gameTime;
        }
    }
}

// MODIFIED: Skill functions now take enemiesRef for global damage application
function updateFrostNova(deltaTime, player, enemiesRef) {
    if (!player.skills.frostNova.isUnlocked) return;
    const skill = player.skills.frostNova;
    if (gameState.gameTime - skill.lastCast > skill.cooldown) {
        visualEffects.push({
            type: 'frostwave', x: player.x, y: player.y, radius: 20, maxRadius: skill.radius, life: 500,
            update(dt) { this.radius += (this.maxRadius / 500) * dt; this.life -= dt; return this.life <= 0; }
        });
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < skill.radius) {
                spawnDamageNumber(e.x, e.y, skill.damage, false);
                if (gameState.isHost) {
                    enemiesRef.child(e.id).update({
                        health: e.health - skill.damage,
                        slowTimer: skill.slowDuration,
                        slowAmount: skill.slowAmount
                    });
                } else {
                    e.health -= skill.damage;
                    e.slowTimer = skill.slowDuration;
                    e.slowAmount = skill.slowAmount;
                }
            }
        });
        skill.lastCast = gameState.gameTime;
    }
}

// MODIFIED: Skill functions now take enemiesRef for global damage application
function updateBlackHole(deltaTime, player, enemiesRef) {
    if (!player.skills.blackHole.isUnlocked) return;
    const skill = player.skills.blackHole;
    if (gameState.gameTime - skill.lastCast > skill.cooldown) {
        if (enemies.length > 0) {
            const targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            if (!targetEnemy) return; // Ensure target exists for black hole

            const blackHoleEffect = {
                type: 'blackHole', x: targetEnemy.x, y: targetEnemy.y,
                radius: skill.radius, life: skill.duration,
                pullStrength: skill.pullStrength, damage: skill.damage,
                // Store a list of enemies currently being pulled by this black hole instance
                pulledEnemies: new Set(), 
                update(dt) {
                    this.life -= dt;
                    enemies.forEach(e => { // Iterate over current local enemies
                        if (!e) return; // Skip if enemy is null/undefined

                        const dist = Math.hypot(e.x - this.x, e.y - this.y);
                        if (dist < this.radius && dist > 10) { // Keep enemies from collapsing to the center
                            // Only host should apply force and damage to global enemies
                            if (gameState.isHost) {
                                // Calculate new positions based on pull strength
                                const newX = e.x - (e.x - this.x) / dist * this.pullStrength;
                                const newY = e.y - (e.y - this.y) / dist * this.pullStrength;

                                // Update enemy position in DB
                                enemiesRef.child(e.id).update({ x: newX, y: newY });

                                // Apply damage periodically (host only)
                                if (!this.pulledEnemies.has(e.id)) { // First hit on entry or refresh
                                    this.pulledEnemies.add(e.id);
                                    enemiesRef.child(e.id).child('health').set(e.health - this.damage);
                                    spawnDamageNumber(e.x, e.y, this.damage, false);
                                } else if (Math.random() < 0.05 * (dt / 16)) { // ~5% chance per 16ms frame
                                    enemiesRef.child(e.id).child('health').set(e.health - this.damage);
                                    spawnDamageNumber(e.x, e.y, this.damage, false);
                                }
                            } else {
                                // Clients apply local movement for smooth visuals, but host is authoritative
                                e.x -= (e.x - this.x) / dist * this.pullStrength;
                                e.y -= (e.y - this.y) / dist * this.pullStrength;
                                // Clients also show damage numbers for immediate feedback
                                if (Math.random() < 0.05 * (dt / 16)) {
                                    spawnDamageNumber(e.x, e.y, this.damage, false);
                                }
                            }
                        } else {
                            this.pulledEnemies.delete(e.id); // Remove from pulled set if outside radius
                        }
                    });
                    return this.life <= 0;
                }
            };
            visualEffects.push(blackHoleEffect);
            skill.lastCast = gameState.gameTime;
        }
    }
}


// MODIFIED: Export the new functions
export { fireProjectile, triggerNova, createXpOrb, createImpactParticles, spawnDamageNumber, updateLightning, updateVolcano, updateFrostNova, updateBlackHole };