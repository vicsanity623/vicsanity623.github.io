const ASCENSION_LEVEL = 50;
const BATTLE_UNLOCK_LEVEL = 20;
const MAX_ENEMIES = 40;
const FORGE_UNLOCK_LEVEL = 10;
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const PVP_UNLOCK_LEVEL = 25;
const DOJO_DAMAGE_MULTIPLIER = 233;

function activateFrenzy() {
    if (tapCombo.frenzyTimeout) {
        clearTimeout(tapCombo.frenzyTimeout);
    }
    tapCombo.currentMultiplier = (tapCombo.currentMultiplier === 1) ? 5 : tapCombo.currentMultiplier + 5;

    const shakeDuration = Math.min(800, 200 + (tapCombo.currentMultiplier * 5));
    triggerScreenShake(shakeDuration);

    createParticles({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    if (tapCombo.currentMultiplier > 30) {
        createParticles({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    }

    if (tapCombo.currentMultiplier >= 100) {
        triggerScreenFlash();
    }

    updateFrenzyVisuals();
    tapCombo.frenzyTimeout = setTimeout(deactivateFrenzy, 7000);
}

function deactivateFrenzy() {
    tapCombo.currentMultiplier = 1;
    tapCombo.frenzyTimeout = null;
    updateFrenzyVisuals();
}

function handleTap(event, isPartnerTap = false) {
    if (!HungerSystem.canPerformAction()) return;
    if (gameState.expedition.active) return;
    initAudio();
    if (gameState.tutorialCompleted === false) {
        gameState.tutorialCompleted = true;
        tutorialOverlay.classList.remove('visible');
        saveGame();
    }

    if (isPartnerTap) {
        const partner = gameState.partner;
        if (!partner) return;
        if (partner.hatchTime) {
            partner.hatchTime -= 500;
            updatePartnerUI();
        } else {
            if (partner.resources.energy <= 0) return;
            partner.resources.energy -= 0.1;
            createXpOrb(event, 0.5, partner);
        }
    } else {
        if (Math.random() < 0.005) {
            createXpBubble();
        }
        if (gameState.resources.energy <= 0) return;
        gameState.counters.taps = (gameState.counters.taps || 0) + 1;
        checkAllAchievements();
        playSound('tap', 0.5, 'square', 150, 100, 0.05);
        const now = Date.now();
        if (now - tapCombo.lastTapTime < 1500) {
            tapCombo.counter++;
        } else {
            tapCombo.counter = 1;
        }
        tapCombo.lastTapTime = now;
        if (tapCombo.counter > 0 && tapCombo.counter % 5 === 0) {
            if (Math.random() < 0.60) {
                activateFrenzy();
            }
        }
        if (Math.random() < 0.1) {
            triggerScreenShake(150);
        }
        let xpGain = 0.25 * tapCombo.currentMultiplier;
        if (gameState.level >= 30) {
            xpGain = 1.0 * tapCombo.currentMultiplier;
        } else if (gameState.level >= 10) {
            xpGain = 0.75 * tapCombo.currentMultiplier;
        }
        const tapXpBonus = 1 + (gameState.ascension.perks.tapXp || 0) * 0.10;
        xpGain *= tapXpBonus;
        createXpOrb(event, xpGain, gameState);
        gameState.resources.energy -= 1.1;
        HungerSystem.drainOnAction('tap');
        if (tapCombo.currentMultiplier > 1) {
            createParticles(event);
        }
        characterSprite.style.animation = 'none';
        void characterSprite.offsetWidth;
        characterSprite.classList.add('tapped');
        setTimeout(() => {
            characterSprite.classList.remove('tapped');
            updateAscensionVisuals();
        }, 200);
    }
    updateUI();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function applyDamageToEnemy(enemy, damageAmount, isCrit = false) {
    if (!enemy || enemy.hp <= 0) return false;

    const finalDamage = Math.floor(damageAmount);
    enemy.hp -= finalDamage;
    genesisState.totalDamageDealtThisBattle += finalDamage;
    const now = Date.now();
    if (enemy.lastDamageNumberTime === undefined) {
        enemy.lastDamageNumberTime = 0;
    }

    if (isCrit || now - enemy.lastDamageNumberTime > 150) {
        enemy.lastDamageNumberTime = now;

        const textEl = document.createElement('div');
        textEl.className = 'enemy-damage-text';
        textEl.textContent = formatNumber(finalDamage);
        textEl.style.left = `${enemy.x}px`;
        textEl.style.top = `${enemy.y - 20}px`;
        textEl.style.color = isCrit ? 'var(--xp-color)' : '#ff4136';
        if (isCrit) {
            textEl.style.fontSize = '1.8em';
            textEl.style.fontWeight = '900';
        } else {
            textEl.style.fontSize = '1.2em';
        }
        genesisArena.appendChild(textEl);
        setTimeout(() => textEl.remove(), 1200);
    }

    const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    if (enemy.healthBarFill) enemy.healthBarFill.style.width = `${hpPercent}%`;

    if (enemy.hp <= 0) {
        if (!enemy.isBoss) {
             gameState.orbs = (gameState.orbs || 0) + 0.5;
             createFloatingText('+0.5 🔮', enemy.x, enemy.y - 40, { color: '#87CEFA', fontSize: '1.4em' });
        }

        addXP(gameState, 20 * (genesisState.isBattleMode ? (gameState.highestBattleLevelCompleted + 1) : (gameState.level * gameState.ascension.tier)));
        createLootOrb(enemy.x, enemy.y);

        if (enemy.element) enemy.element.remove();
        if (enemy.healthBarContainer) enemy.healthBarContainer.remove();

        return true;
    }

    return false;
}

function startGameGenesis() {
    if (genesisState.isActive) return;

    genesisArena.style.display = 'block';
    characterArea.style.display = 'none';

    genesisState.isActive = true;

    const playerEl = document.createElement('img');
    playerEl.src = 'player.PNG';
    playerEl.className = 'genesis-player';
    genesisArena.appendChild(playerEl);

    genesisState.player = {
        element: playerEl,
        x: 0,
        y: 0,
        isInitialized: false,
        speed: 5,
        width: 80,
        height: 80,
        attackRange: 70,
        lastAttackTime: 0,
        target: null,
        manualDestination: null,
        isDashing: false,
        dashTarget: null,
        dashDuration: 380,
        dashCooldown: 1200,
        lastDashTime: 0,
        thunderStrikeCooldown: 2500,
        lastThunderStrikeTime: 0,
        lastDamagedTime: 0,
        havocRageCooldown: 4000,
        lastHavocRageTime: 0,
        isChargingHavoc: false,
    };

    if (genesisState.isBattleMode) {
        const arenaRect = genesisArena.getBoundingClientRect();
        genesisState.player.x = 100;
        genesisState.player.y = arenaRect.height / 2;
        genesisState.player.patrolCenterX = 150;
        genesisState.player.patrolCenterY = arenaRect.height / 2;
        genesisState.player.patrolRadius = 120;
    }
    characterArea.style.display = 'none';
    genesisState.gameLoopId = requestAnimationFrame(gameLoop);
}

function stopGameGenesis() {
    genesisState.isActive = false;
    if (genesisState.gameLoopId) {
        cancelAnimationFrame(genesisState.gameLoopId);
        genesisState.gameLoopId = null;
    }

    const dynamicElements = genesisArena.querySelectorAll('.genesis-player, .genesis-enemy, .genesis-loot-orb');
    dynamicElements.forEach(el => el.remove());

    genesisState.player = null;
    genesisState.enemies = [];
    if (genesisState.lootOrbs) genesisState.lootOrbs = [];

    genesisWaveDisplay.style.display = 'none';
    bossHealthContainer.style.display = 'none';
    genesisState.isBattleMode = false;
}

function toggleGrowthMode() {
    if (genesisState.isActive) {
        stopGameGenesis();
        characterArea.style.display = 'flex';
        genesisArena.style.display = 'none';
        growBtn.textContent = 'Endless';
    } else {
        genesisArena.style.display = 'block';
        characterArea.style.display = 'none';
        startGameGenesis();
        growBtn.textContent = 'Grow';
    }
}

function handleLootCollection() {
    const player = genesisState.player;
    if (!player || !genesisState.lootOrbs) return;

    const arenaRect = genesisArena.getBoundingClientRect();

    genesisState.lootOrbs = genesisState.lootOrbs.filter(orb => {
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= orb.collectionRadius) {
            gameState.gold += orb.amount;

            const screenX = arenaRect.left + player.x;
            const screenY = arenaRect.top + player.y;

            createFloatingText(`+${formatNumber(orb.amount)} Gold`, screenX, screenY, { color: 'var(--xp-color)' });

            playSound('feed', 0.5, 'sine', 600, 800, 0.1);
            orb.element.remove();
            return false;
        }
        return true;
    });
}

function gameLoop(timestamp) {
    if (!genesisState.isActive || !genesisState.player) return;

    if (timestamp - genesisState.player.lastDamagedTime > 200) {
        genesisState.player.element.style.filter = '';
    }

    if (!genesisState.isBattleMode) {
        const DIFFICULTY_INTERVAL = 15000;
        if (timestamp - genesisState.lastDifficultyIncrease > DIFFICULTY_INTERVAL) {
            if (genesisState.lastDifficultyIncrease !== 0) {
                genesisState.difficultyLevel++;
                showToast(`Challenge Level ${genesisState.difficultyLevel}!`);
                playSound('levelUp', 0.5, 'sawtooth', 300, 400, 0.2);
            }
            genesisState.lastDifficultyIncrease = timestamp;
        }
    }

    if (genesisState.isBattleMode &&
        genesisState.enemies.length === 0 &&
        genesisState.enemiesSpawnedThisWave >= genesisState.enemiesToSpawnThisWave &&
        !genesisState.waveTransitionActive &&
        genesisState.currentWave < genesisState.totalWaves
    ) {
        genesisState.waveTransitionActive = true;

        genesisWaveDisplay.textContent = `Wave ${genesisState.currentWave} Cleared!`;
        genesisWaveDisplay.style.display = 'block';
        playSound('levelUp', 0.6, 'triangle', 440, 880, 0.3);

        setTimeout(() => {
            if (!genesisState.isActive || !genesisState.waveTransitionActive) return;

            if (genesisState.currentWave + 1 === genesisState.totalWaves) {
                genesisWaveDisplay.textContent = 'BOSS INCOMING!';
                playSound('ascend', 0.7, 'sawtooth', 500, 100, 0.4);
            } else {
                genesisWaveDisplay.textContent = 'Next Wave Incoming...';
            }

        }, 1500);

        setTimeout(() => {
            if (!genesisState.isActive) return;
            startNextBattleWave();
            if (genesisState.isActive) {
                genesisState.waveTransitionActive = false;
            }
        }, 3000);
    }

    updatePlayerTarget();
    movePlayer();
    moveEnemies();
    moveLootOrbs();
    handleBurnDamage(timestamp);

    let actionTaken = false;
    actionTaken = handleGenesisThunderStrike(timestamp);
    if (!actionTaken) {
        actionTaken = handleGenesisHavocRage(timestamp);
    }
    if (!actionTaken) {
        actionTaken = initiateGenesisPlayerDash(timestamp);
    }
    if (!actionTaken) {
        handleGenesisPlayerAttack(timestamp);
    }
    if (genesisState.isBattleMode) {
        handleEnemyAttacks(timestamp);
    }

    handleLootCollection();
    if (genesisState.boss) updateBossHealthBar();

    genesisState.player.element.style.left = `${genesisState.player.x}px`;
    genesisState.player.element.style.top = `${genesisState.player.y}px`;
    genesisState.enemies.forEach(enemy => {
        enemy.element.style.left = `${enemy.x}px`;
        enemy.element.style.top = `${enemy.y}px`;
    });
    genesisState.lootOrbs.forEach(orb => {
        const orbTranslateX = orb.x - (orb.element.offsetWidth / 2);
        const orbTranslateY = orb.y - (orb.element.offsetHeight / 2);
        orb.element.style.transform = `translate(${orbTranslateX}px, ${orbTranslateY}px)`;
    });

    spawnEnemies(timestamp);

    if (genesisState.isBattleMode && genesisState.boss && genesisState.boss.hp <= 0 && genesisState.isActive) {
        genesisState.isActive = false;
        endBattle(true);
        return;
    }

    if (gameState.resources.hp <= 0 && genesisState.isActive) {
        genesisState.isActive = false;
        endBattle(false);
        return;
    }

    genesisState.gameLoopId = requestAnimationFrame(gameLoop);
}

function spawnEnemies(timestamp) {
    if (genesisState.isBattleMode) {
        const waveSpawnInterval = 800;
        if (genesisState.enemiesSpawnedThisWave < genesisState.enemiesToSpawnThisWave && timestamp - genesisState.lastEnemySpawn > waveSpawnInterval) {
            genesisState.lastEnemySpawn = timestamp;
            genesisState.enemiesSpawnedThisWave++;

            const arenaRect = genesisArena.getBoundingClientRect();
            const difficulty = gameState.highestBattleLevelCompleted + 1;
            const waveMultiplier = 0.1 + (genesisState.currentWave / genesisState.totalWaves);

            const enemy = {
                element: document.createElement('img'),
                healthBarContainer: document.createElement('div'),
                healthBarFill: document.createElement('div'),
                x: 0,
                y: 0,
                speed: (0.5 + Math.random() * 1.2) * waveMultiplier,
                width: 40,
                height: 40,
                maxHp: (40 + (1.1 * difficulty)) * waveMultiplier,
                hp: (40 + (1.1 * difficulty)) * waveMultiplier,
                id: Date.now() + Math.random(),
                attackRange: 25,
                attackCooldown: 2000,
                lastAttackTime: 0
            };

            const padding = 50;
            enemy.x = padding + (Math.random() * (arenaRect.width - padding * 2));
            enemy.y = padding + (Math.random() * (arenaRect.height - padding * 2));

            enemy.healthBarContainer.className = 'enemy-health-bar-container';
            enemy.healthBarFill.className = 'enemy-health-bar-fill';
            enemy.healthBarContainer.appendChild(enemy.healthBarFill);

            enemy.element.src = 'player.PNG';
            enemy.element.className = 'genesis-enemy';
            enemy.element.style.filter = `hue-rotate(${Math.random() * 360}deg) saturate(1.5)`;

            genesisArena.appendChild(enemy.element);
            genesisArena.appendChild(enemy.healthBarContainer);
            genesisState.enemies.push(enemy);
        }
    } else {
        if (genesisState.enemies.length >= MAX_ENEMIES) return;

        const baseSpawnInterval = 380;
        const minSpawnInterval = 50;
        const enemyCountRatio = genesisState.enemies.length / MAX_ENEMIES;
        const spawnRateModifier = 1 / (1 - enemyCountRatio * 0.45);

        let dynamicSpawnInterval = Math.max(minSpawnInterval, (baseSpawnInterval / genesisState.difficultyLevel) * spawnRateModifier);
        const arenaRect = genesisArena.getBoundingClientRect();

        if (timestamp - genesisState.lastEnemySpawn > dynamicSpawnInterval && arenaRect.width > 0) {
            genesisState.lastEnemySpawn = timestamp;
            const difficulty = genesisState.difficultyLevel;
            const enemyHp = Math.floor((2 * gameState.level * gameState.ascension.tier) + (difficulty * 2));

            const baseSpeed = 0.2 + Math.random() * 0.9;
            const speedMultiplier = 1 + (difficulty - 1) * 0.05;
            const enemySpeed = baseSpeed * speedMultiplier;

            const enemy = {
                element: document.createElement('img'),
                healthBarContainer: document.createElement('div'),
                healthBarFill: document.createElement('div'),
                x: 0,
                y: 0,
                speed: enemySpeed,
                width: 40,
                height: 40,
                maxHp: enemyHp,
                hp: enemyHp,
                id: Date.now() + Math.random(),
                attackRange: 25,
                attackCooldown: 2000,
                lastAttackTime: 0,
            };

            const padding = 50;
            enemy.x = padding + (Math.random() * (arenaRect.width - padding * 2));
            enemy.y = padding + (Math.random() * (arenaRect.height - padding * 2));

            enemy.healthBarContainer.className = 'enemy-health-bar-container';
            enemy.healthBarFill.className = 'enemy-health-bar-fill';
            enemy.healthBarContainer.appendChild(enemy.healthBarFill);

            enemy.element.src = 'player.PNG';
            enemy.element.className = 'genesis-enemy';
            enemy.element.style.filter = `hue-rotate(${Math.random() * 360}deg) saturate(1.5)`;

            genesisArena.appendChild(enemy.element);
            genesisArena.appendChild(enemy.healthBarContainer);
            genesisState.enemies.push(enemy);
        }
    }
}

function moveEnemies() {
    if (!genesisState.player) return;
    genesisState.enemies.forEach(enemy => {
        const dx = genesisState.player.x - enemy.x;
        const dy = genesisState.player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > enemy.attackRange) {
            enemy.x += (dx / distance) * enemy.speed;
            enemy.y += (dy / distance) * enemy.speed;
        }
    });
}

function handleEnemyAttacks(timestamp) {
    const player = genesisState.player;
    if (!player || player.isDashing) return;

    genesisState.enemies.forEach(enemy => {
        if (timestamp - enemy.lastAttackTime > enemy.attackCooldown) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= enemy.attackRange) {
                enemy.lastAttackTime = timestamp;
                const damage = Math.max(1, (enemy.isBoss ? 20 : 5) * (gameState.highestBattleLevelCompleted + 1) - getTotalStat('fortitude'));
                gameState.resources.hp -= damage;
                player.lastDamagedTime = timestamp;
                player.element.style.filter = 'brightness(3) drop-shadow(0 0 5px red)';
                createImpactEffect(player.x, player.y);

                const healthThreshold = gameState.resources.maxHp * 0.3;
                if (gameState.resources.hp > 0 && gameState.resources.hp <= healthThreshold && !genesisState.autoPotionOnCooldown) {
                    if (gameState.healthPotions > 0) {

                        genesisState.autoPotionOnCooldown = true;

                        gameState.healthPotions--;
                        const healAmount = Math.floor(gameState.resources.maxHp * 0.5);
                        gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + healAmount);

                        showToast("Used a Health Potion!");
                        playSound('feed', 1, 'sine', 200, 600, 0.2);

                        const arenaRect = genesisArena.getBoundingClientRect();
                        const screenX = arenaRect.left + player.x;
                        const screenY = arenaRect.top + player.y;
                        createFloatingText(`+${healAmount} HP`, screenX, screenY, { color: 'var(--accent-color)' });

                        setTimeout(() => {
                            if (genesisState) {
                                genesisState.autoPotionOnCooldown = false;
                            }
                        }, 1000);
                    }
                }
                updateUI();
            }
        }
    });
}

function updatePlayerTarget() {
    const player = genesisState.player;
    if (!player) return;

    let validTargets = genesisState.enemies;
    let closestEnemy = null;
    let minDistance = Infinity;

    validTargets.forEach(enemy => {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
            minDistance = distance;
            closestEnemy = enemy;
        }
    });

    player.target = closestEnemy;
}

function movePlayer() {
    const player = genesisState.player;
    if (!player) return;

    let targetX = null;
    let targetY = null;
    let currentSpeed = player.speed;

    if (player.isDashing && player.dashTarget) {
        targetX = player.dashTarget.x;
        targetY = player.dashTarget.y;
        currentSpeed = player.speed * 5;
        createDashTrailEffect(player);
    } else if (player.manualDestination) {
        targetX = player.manualDestination.x;
        targetY = player.manualDestination.y;
        const dx = targetX - player.x;
        const dy = targetY - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
            player.manualDestination = null;
        }
    } else {
        if (player.target) {
            if (genesisState.isBattleMode) {
                const enemyTargetX = player.target.x;
                const enemyTargetY = player.target.y;
                const vectorX = enemyTargetX - player.patrolCenterX;
                const vectorY = enemyTargetY - player.patrolCenterY;
                const distFromPatrolCenter = Math.sqrt(vectorX * vectorX + vectorY * vectorY);

                if (distFromPatrolCenter > player.patrolRadius) {
                    const normX = vectorX / distFromPatrolCenter;
                    const normY = vectorY / distFromPatrolCenter;
                    targetX = player.patrolCenterX + normX * player.patrolRadius;
                    targetY = player.patrolCenterY + normY * player.patrolRadius;
                } else {
                    targetX = enemyTargetX;
                    targetY = enemyTargetY;
                }
            } else {
                const dx = player.target.x - player.x;
                const dy = player.target.y - player.y;
                const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
                if (distanceToTarget > player.attackRange * 0.4) {
                    targetX = player.target.x;
                    targetY = player.target.y;
                }
            }
        } else {
            if (genesisState.isBattleMode) {
                const dx = player.patrolCenterX - player.x;
                const dy = player.patrolCenterY - player.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    targetX = player.patrolCenterX;
                    targetY = player.patrolCenterY;
                }
            }
        }
    }

    if (targetX !== null && targetY !== null) {
        const moveDx = targetX - player.x;
        const moveDy = targetY - player.y;
        const moveDistance = Math.sqrt(moveDx * moveDx + moveDy * moveDy);

        if (moveDistance > 1) {
            const moveAmount = Math.min(currentSpeed, moveDistance);
            player.x += (moveDx / moveDistance) * moveAmount;
            player.y += (moveDy / moveDistance) * moveAmount;
        }
    }

    const arenaRect = genesisArena.getBoundingClientRect();
    if (arenaRect.width > 0) {
        player.x = clamp(player.x, player.width / 2, arenaRect.width - player.width / 2);
        player.y = clamp(player.y, player.height / 2, arenaRect.height - player.height / 2);
    }
}

function initiateGenesisPlayerDash(timestamp) {
    if (!HungerSystem.canPerformAction()) return false;
    const player = genesisState.player;
    if (!player || player.isDashing || genesisState.enemies.length === 0) return false;
    if (timestamp - player.lastDashTime < player.dashCooldown) return false;

    let bestTarget = null;
    let maxCount = 0;
    const clusterRadius = 350;

    genesisState.enemies.forEach(potentialTarget => {
        let nearbyCount = 0;
        genesisState.enemies.forEach(otherEnemy => {
            if (Math.sqrt(Math.pow(potentialTarget.x - otherEnemy.x, 2) + Math.pow(potentialTarget.y - otherEnemy.y, 2)) < clusterRadius) {
                nearbyCount++;
            }
        });
        if (nearbyCount > maxCount) {
            maxCount = nearbyCount;
            bestTarget = potentialTarget;
        }
    });

    if (!bestTarget) {
        bestTarget = player.target;
    }

    if (bestTarget) {
        if (Math.sqrt(Math.pow(player.x - bestTarget.x, 2) + Math.pow(player.y - bestTarget.y, 2)) > 600) {
            return false;
        }

        player.lastDashTime = timestamp;

        const shouldChain = Math.random() < 0.30;
        const maxChains = shouldChain ? 6 : 1;

        const arenaRect = genesisArena.getBoundingClientRect();
        const screenX = arenaRect.left + player.x;
        const screenY = arenaRect.top + player.y - 80;

        createFloatingText(shouldChain ? "Dash Chain!" : "Dash!", screenX, screenY, { color: '#ff8c00', fontSize: '2.2em' });

        performDash(bestTarget, 1, maxChains);

        return true;
    }

    return false;
}

function performDash(target, currentChain, maxChains) {
    const player = genesisState.player;
    if (!player || !target) {
        if (player) player.isDashing = false;
        return;
    };

    player.isDashing = true;
    player.dashTarget = { x: target.x, y: target.y };
    playSound('hit', 1, 'sawtooth', 800, 200, 0.2);

    setTimeout(() => {
        if (!genesisState.player) return;

        player.isDashing = false;
        const explosionX = player.x;
        const explosionY = player.y;
        createDashExplosionEffect(explosionX, explosionY);
        playSound('crit', 1, 'square', 400, 50, 0.4);
        triggerScreenShake(300);
        HungerSystem.drainOnAction('attack');

        const dashDamage = getTotalStat('strength') * 5 * (1 + getSkillBonus('dash') / 100);
        const explosionRadius = 150;

        genesisState.enemies.forEach(enemy => {
            const dx = explosionX - enemy.x;
            const dy = explosionY - enemy.y;
            if (Math.sqrt(dx * dx + dy * dy) <= explosionRadius) {
                const isCrit = Math.random() < (getTotalStat('critChance') / 100);
                const critMultiplier = 2.5 + (getPotentialBonus('crit_damage_percent') / 100);
                const finalDamage = dashDamage * (isCrit ? critMultiplier : 1);
                applyDamageToEnemy(enemy, finalDamage, isCrit);
            }
        });

        genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);

        if (currentChain < maxChains && genesisState.enemies.length > 0) {
            let furthestEnemy = null;
            let maxDistance = -1;
            genesisState.enemies.forEach(enemy => {
                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > maxDistance) {
                    maxDistance = distance;
                    furthestEnemy = enemy;
                }
            });
            if (furthestEnemy) {
                performDash(furthestEnemy, currentChain + 1, maxChains);
            }
        }
    }, player.dashDuration);
}

function handleGenesisThunderStrike(timestamp) {
    if (!HungerSystem.canPerformAction()) return false;
    const player = genesisState.player;
    if (!player || player.isChargingHavoc || genesisState.enemies.length === 0) return false;
    if (timestamp - player.lastThunderStrikeTime < player.thunderStrikeCooldown) return false;

    const thunderStrikeProximity = 50;
    let isEnemyClose = false;
    for (const enemy of genesisState.enemies) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        if (Math.sqrt(dx * dx + dy * dy) <= thunderStrikeProximity) {
            isEnemyClose = true;
            break;
        }
    }
    if (!isEnemyClose) {
        return false;
    }

    let potentialTargets = [...genesisState.enemies];
    let chainTargets = [player];
    const maxChain = 28;

    for (let i = 0; i < maxChain && potentialTargets.length > 0; i++) {
        const lastTarget = chainTargets[chainTargets.length - 1];
        let closestEnemy = null;
        let minDistance = Infinity;
        potentialTargets.forEach(enemy => {
            const dx = lastTarget.x - enemy.x;
            const dy = lastTarget.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                minDistance = distance;
                closestEnemy = enemy;
            }
        });
        if (closestEnemy) {
            chainTargets.push(closestEnemy);
            potentialTargets = potentialTargets.filter(e => e.id !== closestEnemy.id);
        }
    }

    if (chainTargets.length > 1) {
        player.lastThunderStrikeTime = timestamp;
        HungerSystem.drainOnAction('attack');
        playSound('ascend', 0.8, 'sawtooth', 100, 800, 0.3);
        triggerScreenShake(200);

        const arenaRect = genesisArena.getBoundingClientRect();
        const screenX = arenaRect.left + player.x;
        const screenY = arenaRect.top + player.y - 80;
        createFloatingText("Thunder Strike!", screenX, screenY, {
            color: '#00ffff',
            fontSize: '2.2em'
        });

        createChainLightningEffect(chainTargets);

        const thunderDamage = getTotalStat('strength') * 4.5 * (1 + getSkillBonus('thunderStrike') / 100);

        for (let i = 1; i < chainTargets.length; i++) {
            const enemy = chainTargets[i];
            const isCrit = Math.random() < (getTotalStat('critChance') / 100);
            const critMultiplier = 2.5 + (getPotentialBonus('crit_damage_percent') / 100);
            const finalDamage = thunderDamage * (isCrit ? critMultiplier : 1);
            applyDamageToEnemy(enemy, finalDamage, isCrit);
        }

        genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
        return true;
    }
    return false;
}

function handleGenesisHavocRage(timestamp) {
    if (!HungerSystem.canPerformAction()) return false;
    const player = genesisState.player;
    if (!player || genesisState.enemies.length === 0) return false;
    if (timestamp - player.lastHavocRageTime < player.havocRageCooldown) return false;

    player.lastHavocRageTime = timestamp;
    HungerSystem.drainOnAction('attack');

    playSound('crit', 1, 'sawtooth', 300, 50, 0.5);
    triggerScreenShake(400);

    const arenaRect = genesisArena.getBoundingClientRect();
    const screenX = arenaRect.left + player.x;
    const screenY = arenaRect.top + player.y - 80;
    createFloatingText("Havoc Rage!", screenX, screenY, {
        color: '#dc143c',
        fontSize: '2.2em'
    });

    player.element.style.filter = 'invert(1)';
    setTimeout(() => {
        if (player && player.element) {
            player.element.style.filter = '';
        }
    }, 250);

    createHavocShockwaveEffect(player.x, player.y, 200);

    const burnDamagePerSecond = getTotalStat('strength') * 0.25 * (1 + getSkillBonus('havocRage') / 100);

    genesisState.enemies.forEach(enemy => {
        enemy.burn = {
            expiryTime: timestamp + 5000,
            damagePerTick: burnDamagePerSecond,
            lastTickTime: timestamp
        };
        enemy.element.classList.add('burning');
    });

    return true;
}

function handleBurnDamage(timestamp) {
    if (genesisState.enemies.length === 0) return;

    for (let i = genesisState.enemies.length - 1; i >= 0; i--) {
        const enemy = genesisState.enemies[i];

        if (enemy && enemy.burn) {
            if (timestamp > enemy.burn.expiryTime) {
                delete enemy.burn;
                if (enemy.element) enemy.element.classList.remove('burning');
                continue;
            }

            if (timestamp - enemy.burn.lastTickTime > 250) {
                const tickDamage = enemy.burn.damagePerTick / 4;
                createBurnParticles(enemy);

                applyDamageToEnemy(enemy, tickDamage, false);

                if (enemy.hp > 0) {
                    enemy.burn.lastTickTime = timestamp;
                }
            }
        }
    }
    genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
}

function handleGenesisPlayerAttack(timestamp) {
    if (!HungerSystem.canPerformAction()) return;
    const player = genesisState.player;
    const baseCooldown = 300;
    const reductionPerAgi = 1;
    const minimumCooldown = 95;

    const agility = getTotalStat('agility');
    const attackSpeedBonus = 1 - (getAwakeningBonus('attackSpeed') * 0.01);
    const dynamicAttackCooldown = Math.max(minimumCooldown, (baseCooldown - (agility * reductionPerAgi)) * attackSpeedBonus);

    if (!player || player.isDashing || (timestamp - player.lastAttackTime < dynamicAttackCooldown)) {
        return;
    }
    if (!player.target) return;

    if (Math.sqrt(Math.pow(player.x - player.target.x, 2) + Math.pow(player.y - player.target.y, 2)) > player.attackRange) {
        return;
    }

    player.lastAttackTime = timestamp;
    createAoeSlashEffect(player.x, player.y, player.attackRange);

    genesisState.enemies.forEach(enemy => {
        const distance_to_enemy = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));

        if (distance_to_enemy <= player.attackRange) {
            const isCrit = Math.random() < (getTotalStat('critChance') / 100);
            const critMultiplier = 2.5 + (getPotentialBonus('crit_damage_percent') / 100);

            const baseDamage = getTotalStat('strength') * (1 + getSkillBonus('aoeSlash') / 100);
            const finalDamage = baseDamage * (isCrit ? critMultiplier : 1);

            applyDamageToEnemy(enemy, finalDamage, isCrit);
            HungerSystem.drainOnAction('attack');
        }
    });

    genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
}

function startBattle() {
    stopGameGenesis();
    genesisState.isBattleMode = true;
    genesisState.currentWave = 0;
    genesisState.boss = null;
    genesisState.totalDamageDealtThisBattle = 0;
    genesisWaveDisplay.style.display = 'block';
    gameState.resources.hp = gameState.resources.maxHp;
    updateUI();

    startGameGenesis();

    startNextBattleWave();
}

function startNextBattleWave() {
    genesisState.currentWave++;
    genesisState.enemiesSpawnedThisWave = 0;

    if (genesisState.currentWave > genesisState.totalWaves) {
        endBattle(true);
        return;
    }

    genesisWaveDisplay.textContent = `Wave ${genesisState.currentWave} / ${genesisState.totalWaves}`;
    genesisWaveDisplay.style.display = 'block';

    if (genesisState.currentWave === genesisState.totalWaves) {
        genesisState.enemiesToSpawnThisWave = 30;
        spawnBoss();
    } else {
        const baseMinEnemies = 9;
        const baseMaxEnemies = 25;
        const waveBonus = Math.floor(genesisState.currentWave * 1.5);
        const minEnemies = baseMinEnemies + waveBonus;
        const maxEnemies = baseMaxEnemies + waveBonus;
        genesisState.enemiesToSpawnThisWave = Math.floor(Math.random() * (maxEnemies - minEnemies + 1)) + minEnemies;
    }
}

function spawnBoss() {
    const arenaRect = genesisArena.getBoundingClientRect();
    const difficulty = gameState.highestBattleLevelCompleted + 1;

    const boss = {
        element: document.createElement('img'),
        x: arenaRect.width - 100,
        y: arenaRect.height / 2,
        speed: 1,
        width: 160,
        height: 160,
        maxHp: 500 * difficulty * gameState.ascension.tier,
        hp: 500 * difficulty * gameState.ascension.tier,
        id: 'BOSS',
        isBoss: true,
        attackRange: 80,
        attackCooldown: 3000,
        lastAttackTime: 0
    };

    boss.element.src = 'player.PNG';
    boss.element.className = 'genesis-enemy';
    boss.element.style.width = `${boss.width}px`;
    boss.element.style.height = `${boss.height}px`;
    boss.element.style.filter = 'grayscale(1) sepia(1) hue-rotate(320deg) saturate(5)';

    genesisArena.appendChild(boss.element);
    genesisState.enemies.push(boss);
    genesisState.boss = boss;

    bossHealthContainer.style.display = 'block';
    bossNameDisplay.textContent = `Level ${difficulty} Hellspawn King`;
    updateBossHealthBar();
}

function startNextWave() {
    battleState.currentWave++;

    const enemyLevel = battleState.targetBattleLevel;
    const tierMultiplier = gameState.ascension.tier;
    const waveMultiplier = 1 + (battleState.currentWave - 1) * 0.2;
    let isBoss = battleState.currentWave === battleState.totalWaves;
    let enemy;

    if (isBoss) {
        enemy = {
            name: `Level ${enemyLevel} Hellspawn King`,
            hp: Math.floor((150 + 20 * enemyLevel) * tierMultiplier * waveMultiplier),
            strength: Math.floor((10 + 4 * enemyLevel) * tierMultiplier * waveMultiplier),
            agility: Math.floor((5 + 2 * enemyLevel) * tierMultiplier * waveMultiplier),
            fortitude: Math.floor((8 + 3 * enemyLevel) * tierMultiplier * waveMultiplier),
            xpReward: Math.floor((100 * enemyLevel) * tierMultiplier * waveMultiplier),
            goldReward: Math.floor((75 * enemyLevel) * tierMultiplier * waveMultiplier)
        };
    } else {
        enemy = {
            name: `Wave ${battleState.currentWave} Goblin`,
            hp: Math.floor((60 + 8 * enemyLevel) * tierMultiplier * waveMultiplier),
            strength: Math.floor((3 + 2 * enemyLevel) * tierMultiplier * waveMultiplier),
            agility: Math.floor((3 + 1 * enemyLevel) * tierMultiplier * waveMultiplier),
            fortitude: Math.floor((3 + 1 * enemyLevel) * tierMultiplier * waveMultiplier),
            xpReward: Math.floor((25 * enemyLevel) * tierMultiplier * waveMultiplier),
            goldReward: Math.floor((15 * enemyLevel) * tierMultiplier * waveMultiplier)
        };
    }
    enemy.maxHp = enemy.hp;
    battleState.enemy = enemy;
    updateBattleHud();
    addBattleLog(`A wild ${battleState.enemy.name} appears!`, "log-system");
    attackBtn.disabled = true;
    fleeBtn.disabled = true;
    feedBattleBtn.disabled = true;

    setTimeout(() => {
        if (battleState.enemy.agility > getTotalStat('agility')) {
            addBattleLog(`${battleState.enemy.name} is faster and attacks first!`, "log-enemy");
            handleEnemyAttack();
        } else {
            addBattleLog("You are faster! Your turn.", "log-player");
            if (gameState.settings && gameState.settings.isAutoBattle) {
                setTimeout(handlePlayerAttack, 1000);
            } else {
                attackBtn.disabled = false;
                fleeBtn.disabled = false;
                feedBattleBtn.disabled = false;
            }
        }
    }, 1000);
}

function handlePlayerAttack() {
    if (!battleState.isActive) return;
    attackBtn.disabled = true;
    fleeBtn.disabled = true;
    feedBattleBtn.disabled = true;
    const isCrit = Math.random() < (getTotalStat('critChance') / 100);
    const baseDamage = Math.max(1, getTotalStat('strength') * 2 - battleState.enemy.fortitude);
    const damage = Math.floor(baseDamage * (isCrit ? 2 : 1));
    battleState.totalDamage += damage;
    battleState.enemy.hp = Math.max(0, battleState.enemy.hp - damage);

    if (isCrit) {
        addBattleLog('CRITICAL HIT!', 'log-crit');
        playSound('crit', 0.8, 'square', 1000, 500, 0.2);
    } else {
        playSound('hit', 0.8, 'square', 400, 100, 0.1);
    }
    addBattleLog(`You attack for ${damage} damage!`, "log-player");
    createDamageNumber(damage, isCrit, true);
    updateBattleHud();

    if (battleState.enemy.hp <= 0) {
        gameState.counters.enemiesDefeated = (gameState.counters.enemiesDefeated || 0) + 1;
        const finalGoldReward = Math.floor(battleState.enemy.goldReward * (1 + getTotalStat('goldFind') / 100));
        battleState.totalXp += battleState.enemy.xpReward;
        battleState.totalGold += finalGoldReward;
        addBattleLog(`You defeated ${battleState.enemy.name}!`, "log-system");
        if (battleState.currentWave >= battleState.totalWaves) {
            endBattle(true);
        } else {
            addBattleLog(`Prepare for the next wave...`, 'log-system');
            setTimeout(startNextWave, 2000);
        }
    } else {
        setTimeout(handleEnemyAttack, 1500);
    }
}

function handleEnemyAttack() {
    if (!battleState.isActive) return;
    if (Math.random() < (getTotalStat('agility') / 250)) {
        addBattleLog('You dodged the attack!', 'log-player');
        if (gameState.settings && gameState.settings.isAutoBattle) {
            setTimeout(handlePlayerAttack, 1000);
        } else {
            attackBtn.disabled = false;
            fleeBtn.disabled = false;
            feedBattleBtn.disabled = false;
        }
        return;
    }
    const damage = Math.max(1, battleState.enemy.strength * 2 - getTotalStat('fortitude'));
    battleState.playerHp = Math.max(0, battleState.playerHp - damage);
    playSound('hit', 0.6, 'sawtooth', 200, 50, 0.15);
    triggerScreenShake(200);
    createDamageNumber(damage, false, false);
    addBattleLog(`${battleState.enemy.name} attacks for ${damage} damage!`, "log-enemy");
    updateBattleHud();
    if (battleState.playerHp <= 0) {
        endBattle(false);
    } else {
        if (gameState.settings && gameState.settings.isAutoBattle) {
            setTimeout(handlePlayerAttack, 1000);
        } else {
            attackBtn.disabled = false;
            fleeBtn.disabled = false;
            feedBattleBtn.disabled = false;
        }
    }
}

async function endBattle(playerWon) {
    if (genesisState.isBattleMode && genesisState.totalDamageDealtThisBattle > gameState.dojoPersonalBest) {
        gameState.dojoPersonalBest = genesisState.totalDamageDealtThisBattle;
        showToast("New Personal Damage Record!");
        playSound('victory', 1, 'triangle', 523, 1046, 0.4);
        updateDojoUI();

        try {
            await db.collection("damageLeaderboard").doc(gameState.playerName).set({
                name: gameState.playerName,
                totalDamage: Math.floor(gameState.dojoPersonalBest)
            }, { merge: true });
            showToast("New damage score submitted to leaderboard!");
        } catch (e) {
            console.error("Failed to submit damage score", e);
        }
    }

    battleState.isActive = false;
    gameState.healthPotions = (gameState.healthPotions || 0) - battleState.potionsUsedThisBattle;

    let title = "";
    let rewardText = "";

    if (playerWon) {
        if (genesisState.isBattleMode) {
            const battleLevel = gameState.highestBattleLevelCompleted + 1;
            gameState.highestBattleLevelCompleted = battleLevel;
            gameState.counters.battlesCompleted = (gameState.counters.battlesCompleted || 0) + 1;
            checkAllAchievements();
            playSound('victory', 1, 'triangle', 523, 1046, 0.4);

            let bonusItem = generateItem();
            title = `Battle Level ${battleLevel} Complete!`;

            const goldReward = 10000 * battleLevel;
            const xpReward = 20000 * battleLevel;
            gameState.gold += goldReward;
            addXP(gameState, xpReward);

            const totalDamageDealt = Math.floor(genesisState.totalDamageDealtThisBattle);

            rewardText = `You are victorious!<br><br>Total Rewards:<br>+${goldReward.toLocaleString()} Gold<br>+${xpReward.toLocaleString()} XP<br>Total Damage Dealt: ${totalDamageDealt.toLocaleString()}<br><br>Completion Bonus:<br><strong style="color:${bonusItem.rarity.color}">${bonusItem.name}</strong>`;
            const edgeStoneReward = 0.50 * (gameState.ascension.tier);
            gameState.edgeStones = (gameState.edgeStones || 0) + edgeStoneReward;

            rewardText += `<br>Found <span style="color: #00FFFF;">♦️ ${edgeStoneReward.toFixed(4)} EdgeStones</span>`;
            const orbReward = 10 * battleLevel;
            gameState.orbs = (gameState.orbs || 0) + orbReward;
            rewardText += `<br>Found <strong style="color: #87CEFA;">${orbReward} 🔮 Orbs</strong>`;
            gameState.inventory.push(bonusItem);
        }
    } else {
        playSound('defeat', 1, 'sine', 440, 110, 0.8);
        if (gameState.resources.hp <= 0) {
            title = "Defeated!";
            rewardText = "You black out and wake up back home. You lost half your current gold.";
            gameState.gold = Math.floor(gameState.gold / 2);
            gameState.resources.hp = 1;
        } else {
            title = "Fled from Battle";
            rewardText = "You escaped, but gained no rewards.";
        }
    }

    stopGameGenesis();
    setTimeout(() => {
        showScreen('game-screen');
        startGameGenesis();
        if (title) showNotification(title, rewardText);
        saveGame();
        updateUI();
    }, 500);
}

function feedInBattle() {
    if (!battleState.isActive) return;

    const availablePotions = (gameState.healthPotions || 0) - battleState.potionsUsedThisBattle;
    if (availablePotions <= 0) {
        showToast("No potions left!");
        return;
    }
    if (battleState.playerHp >= gameState.resources.maxHp) {
        showToast("Health is already full!");
        return;
    }

    attackBtn.disabled = true;
    fleeBtn.disabled = true;
    feedBattleBtn.disabled = true;

    battleState.potionsUsedThisBattle++;
    const healAmount = Math.floor(gameState.resources.maxHp * 0.5);
    battleState.playerHp = Math.min(gameState.resources.maxHp, battleState.playerHp + healAmount);

    playSound('feed', 1, 'sine', 200, 600, 0.2);
    addBattleLog(`You use a potion and heal for ${healAmount} HP!`, 'log-player');
    updateBattleHud();

    setTimeout(handleEnemyAttack, 1500);
}

function enterDojo() {
    showScreen('dojo-screen');
    dojoSessionTotalDisplay.textContent = "";
    dojoTimerBarContainer.style.visibility = 'hidden';

    dojoLightningCanvas.width = dojoLightningCanvas.clientWidth;
    dojoLightningCanvas.height = dojoLightningCanvas.clientHeight;

    updateDojoUI();
}

function exitDojo() {
    if (dojoState.isActive) {
        stopDojoSession();
    }
    showScreen('game-screen');
    startGameGenesis();
}

function startDojoSession() {
    if (dojoState.isActive) return;

    dojoState = {
        isActive: true,
        timerId: null,
        damageIntervalId: null,
        beamAnimationId: null,
        totalSessionDamage: 0,
        timeLeft: 7.0
    };

    dojoTimerBarContainer.style.visibility = 'visible';
    dojoSessionTotalDisplay.textContent = formatNumber(0);
    playSound('ascend', 0.5, 'sawtooth', 100, 500, 0.5);
    dojoDummySprite.classList.add('zapped');

    startDojoBeam();

    dojoState.timerId = setInterval(() => {
        dojoState.timeLeft -= 0.1;

        const percentage = (dojoState.timeLeft / 7.0) * 100;
        dojoTimerBarFill.style.width = `${percentage}%`;
        dojoTimerBarLabel.textContent = `${dojoState.timeLeft.toFixed(1)}s`;

        if (dojoState.timeLeft <= 0) {
            stopDojoSession();
        }
    }, 100);

    dojoState.damageIntervalId = setInterval(() => {
        const isCrit = Math.random() < (getTotalStat('critChance') / 100);
        const baseDamage = getTotalStat('strength') * (Math.random() * 0.4 + 0.8);
        const critMultiplier = 2.5 + (getPotentialBonus('crit_damage_percent') / 100);
        const damage = Math.floor(baseDamage * (isCrit ? critMultiplier : 1) * DOJO_DAMAGE_MULTIPLIER);

        dojoState.totalSessionDamage += damage;

        createDojoDamageNumber(damage, isCrit);
        dojoSessionTotalDisplay.textContent = formatNumber(Math.floor(dojoState.totalSessionDamage));
        playSound('tap', 0.3, 'square', 200, 150, 0.05);
    }, 150);
}

async function stopDojoSession() {
    if (!dojoState.isActive) return;

    clearInterval(dojoState.timerId);
    clearInterval(dojoState.damageIntervalId);
    stopDojoBeam();
    dojoDummySprite.classList.remove('zapped');

    dojoState.isActive = false;
    dojoTimerBarContainer.style.visibility = 'hidden';

    if (dojoState.totalSessionDamage > gameState.dojoPersonalBest) {
        gameState.dojoPersonalBest = dojoState.totalSessionDamage;
        showToast("New Personal Best!");
        playSound('victory', 1, 'triangle', 523, 1046, 0.4);
        updateDojoUI();

        try {
            await db.collection("damageLeaderboard").doc(gameState.playerName).set({
                name: gameState.playerName,
                totalDamage: Math.floor(gameState.dojoPersonalBest)
            }, { merge: true });
            showToast("New score submitted to leaderboard!");
        } catch (e) {
            console.error("Failed to submit damage score", e);
        }

        saveGame();
    }
}

async function enterPvpSelection() {
    if (gameState.level < PVP_UNLOCK_LEVEL) {
        showToast(`PvP unlocks at Level ${PVP_UNLOCK_LEVEL}`);
        return;
    }
    showScreen('pvp-selection-screen');
    pvpOpponentListContainer.innerHTML = '<p>Searching for opponents...</p>';

    try {
        const snapshot = await db.collection('playerSaves')
            .where('level', '>=', PVP_UNLOCK_LEVEL)
            .limit(50)
            .get();

        let allEligiblePlayers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.playerName !== gameState.playerName) {
                allEligiblePlayers.push(data);
            }
        });

        const lowerBound = gameState.level - 10;
        const upperBound = gameState.level + 10;

        let opponents = allEligiblePlayers.filter(player => {
            return player.level >= lowerBound && player.level <= upperBound;
        });

        if (opponents.length < 1) {
            opponents = allEligiblePlayers;
        }

        if (opponents.length === 0) {
            pvpOpponentListContainer.innerHTML = '<p>Could not find any eligible opponents. Please try again later.</p>';
            return;
        }

        opponents.sort(() => 0.5 - Math.random());

        pvpOpponentListContainer.innerHTML = '';
        opponents.slice(0, 4).forEach(opponent => {
            const itemEl = document.createElement('div');
            itemEl.className = 'pvp-opponent-item';
            itemEl.innerHTML = `
                <img src="player.PNG" class="pvp-opponent-avatar" style="filter: hue-rotate(${Math.random() * 360}deg);">
                <div class="pvp-opponent-info">
                    <div class="pvp-opponent-name">${opponent.playerName} (Lv. ${opponent.level})</div>
                    <div class="pvp-opponent-stats">Tier: ${opponent.ascension.tier}</div>
                </div>
            `;
            itemEl.onclick = () => startPvpBattle(opponent);
            pvpOpponentListContainer.appendChild(itemEl);
        });

    } catch (error) {
        console.error("Error fetching PvP opponents:", error);
        if (error.message.includes('index')) {
            pvpOpponentListContainer.innerHTML = `<p>Database requires an index. Please check the developer console (F12) for a link to create it.</p>`;
        } else {
            pvpOpponentListContainer.innerHTML = '<p>Could not find opponents. Please try again later.</p>';
        }
    }
}

function getPvpCombatantStat(combatant, stat) {
    let total = combatant.stats[stat] || 0;

    if (combatant.permanentUpgrades) {
        for (const upgradeId in combatant.permanentUpgrades) {
            const upgradeData = permanentShopUpgrades[upgradeId];
            if (upgradeData && upgradeData.stat === stat) {
                total += (combatant.permanentUpgrades[upgradeId] || 0) * upgradeData.bonus;
            }
        }
    }

    for (const slot in combatant.equipment) {
        const item = combatant.equipment[slot];
        if (item && item.stats && item.stats[stat]) {
            total += item.stats[stat];
        }
    }

    if (stat === 'goldFind' && combatant.ascension && combatant.ascension.perks) {
        total += (combatant.ascension.perks.goldBoost || 0) * 5;
    }

    const immortal = combatant.immortalGrowth || defaultState.immortalGrowth;

    if (stat === 'strength') {
        const awakeningBonus = (immortal.awakening.weaponMastery || 0) * 10;
        total += awakeningBonus;
        const potentialBonus = (immortal.potentials.attack_power_percent || 0) * potentialsData.attack_power_percent.bonusPerLevel;
        total *= (1 + potentialBonus / 100);
        return Math.round(total);
    }

    if (stat === 'fortitude') {
        const awakeningBonus = (immortal.awakening.armorMastery || 0) * 10;
        total += awakeningBonus;
    }

    if (stat === 'goldFind') {
        const potentialBonus = (immortal.potentials.gold_find_percent || 0) * potentialsData.gold_find_percent.bonusPerLevel;
        total += potentialBonus;
    }

    return total;
}

function handlePvpCollision() {
    if (!pvpState.isActive) return;

    const playerSprite = document.getElementById('pvp-player-sprite');
    const opponentSprite = document.getElementById('pvp-opponent-sprite');

    if (!playerSprite || !opponentSprite) return;

    const pRect = playerSprite.getBoundingClientRect();
    const oRect = opponentSprite.getBoundingClientRect();

    const isColliding = pRect.left < oRect.right && pRect.right > oRect.left &&
        pRect.top < oRect.bottom && pRect.bottom > oRect.top;

    if (isColliding && (playerSprite.classList.contains('is-attacking') || opponentSprite.classList.contains('is-attacking'))) {

        playerSprite.classList.remove('is-attacking');
        opponentSprite.classList.remove('is-attacking');
        clearTimeout(pvpState.playerActionTimeout);
        clearTimeout(pvpState.opponentActionTimeout);

        const midX = (playerSprite.offsetLeft + opponentSprite.offsetLeft) / 2;
        const midY = (playerSprite.offsetTop + opponentSprite.offsetTop) / 2;
        createCollisionExplosion(midX, midY);

        const collisionDamage = 10000;
        pvpState.playerDamage += collisionDamage;
        pvpState.opponentDamage += collisionDamage;
        createPvpDamageNumber(collisionDamage, true);
        createPvpDamageNumber(collisionDamage, false);

        playerSprite.style.left = pvpState.playerStartPos;
        opponentSprite.style.left = pvpState.opponentStartPos;

        pvpState.playerTimeoutId = setTimeout(() => executePvpAction(true), 1000);
        pvpState.opponentTimeoutId = setTimeout(() => executePvpAction(false), 1000);
    }
}

function startPvpBattle(opponentData) {
    pvpState = {
        isActive: true,
        mainTimerId: null,
        playerActionTimeout: null,
        opponentActionTimeout: null,
        timeLeft: 15.0,
        playerDamage: 0,
        opponentDamage: 0,
        opponentData: opponentData,
        playerStartPos: '20%',
        opponentStartPos: '80%',
    };

    showScreen('pvp-battle-screen');
    pvpArena.innerHTML = '';

    const playerSprite = document.createElement('img');
    playerSprite.src = 'player.PNG';
    playerSprite.className = 'genesis-player';
    playerSprite.id = 'pvp-player-sprite';
    playerSprite.style.left = pvpState.playerStartPos;
    playerSprite.style.top = '50%';
    playerSprite.style.transform = 'translate(-50%, -50%)';

    const opponentSprite = document.createElement('img');
    opponentSprite.src = 'player.PNG';
    opponentSprite.className = 'genesis-player';
    opponentSprite.id = 'pvp-opponent-sprite';
    opponentSprite.style.filter = 'hue-rotate(180deg) scaleX(-1)';
    opponentSprite.style.left = pvpState.opponentStartPos;
    opponentSprite.style.top = '50%';
    opponentSprite.style.transform = 'translate(-50%, -50%)';

    pvpArena.appendChild(playerSprite);
    pvpArena.appendChild(opponentSprite);

    pvpPlayerName.textContent = gameState.playerName;
    pvpOpponentName.textContent = opponentData.playerName;

    pvpState.mainTimerId = setInterval(pvpTick, 100);

    executePvpAction(true);
    executePvpAction(false);
}

function executePvpAction(isPlayer) {
    if (!pvpState.isActive) return;

    const combatantSprite = pvpArena.querySelector(isPlayer ? '#pvp-player-sprite' : '#pvp-opponent-sprite');
    const targetSprite = pvpArena.querySelector(isPlayer ? '#pvp-opponent-sprite' : '#pvp-player-sprite');

    if (!combatantSprite || !targetSprite || combatantSprite.classList.contains('is-attacking')) return;

    const combatant = isPlayer ? gameState : pvpState.opponentData;
    const opponent = isPlayer ? pvpState.opponentData : gameState;
    const startPos = isPlayer ? pvpState.playerStartPos : pvpState.opponentStartPos;
    const targetPos = isPlayer ? pvpState.opponentStartPos : pvpState.playerStartPos;

    const attackerAgi = getPvpCombatantStat(combatant, 'agility');
    const defenderAgi = getPvpCombatantStat(opponent, 'agility');
    const evadeChance = Math.min(0.4, (defenderAgi / (attackerAgi + defenderAgi + 1)) * 0.5);

    const isCrit = Math.random() < (getPvpCombatantStat(combatant, 'critChance') / 100);
    const critPotentialLevel = (combatant.immortalGrowth?.potentials?.crit_damage_percent) || 0;
    const critDamageBonus = 1.5 + (critPotentialLevel * potentialsData.crit_damage_percent.bonusPerLevel / 100);

    const performAttack = (attackLogic) => {
        combatantSprite.classList.add('is-attacking');
        combatantSprite.style.left = `calc(${targetPos} ${isPlayer ? '-' : '+'} 60px)`;

        setTimeout(() => {
            if (pvpState.isActive && Math.random() < evadeChance) {
                triggerEvadeAnimation(targetSprite);
            } else if (pvpState.isActive) {
                attackLogic();
            }

            setTimeout(() => {
                if (combatantSprite) combatantSprite.style.left = startPos;
                setTimeout(() => {
                    if (combatantSprite) combatantSprite.classList.remove('is-attacking');
                }, 200);
            }, 300);
        }, 300);
    };

    const roll = Math.random();
    const combatantLevel = combatant.level || 0;

    if (combatantLevel >= 50 && roll < 0.10) {
        performAttack(() => {
            createSlamEffect(combatantSprite.offsetLeft, combatantSprite.offsetTop);
            createFloatingText("Slam!", combatantSprite.offsetLeft, combatantSprite.offsetTop - 40, { color: '#D2691E', fontSize: '1.8em' });

            const damage = getPvpCombatantStat(combatant, 'strength') * 8 * (1 + getSkillBonus('slam') / 100);
            if (isPlayer) pvpState.playerDamage += damage;
            else pvpState.opponentDamage += damage;
            createPvpDamageNumber(damage, isPlayer);
        });
    } else if (roll < 0.25) {
        performAttack(() => {
            createPvpChainLightningEffect(combatantSprite, targetSprite);
            createFloatingText("Thunder Strike!", combatantSprite.offsetLeft, combatantSprite.offsetTop - 40, { color: '#00ffff', fontSize: '1.8em' });
            const damage = getPvpCombatantStat(combatant, 'strength') * 4.5 * (1 + getSkillBonus('thunderStrike') / 100);
            const finalDamage = damage * (isCrit ? (1 + critDamageBonus) : 1);
            if (isPlayer) pvpState.playerDamage += finalDamage;
            else pvpState.opponentDamage += finalDamage;
            createPvpDamageNumber(finalDamage, isPlayer);
        });
    } else if (roll < 0.45) {
        performAttack(() => {
            createDashExplosionEffect(targetSprite.offsetLeft + targetSprite.offsetWidth / 2, targetSprite.offsetTop + targetSprite.offsetHeight / 2);
            createFloatingText("Dash!", combatantSprite.offsetLeft, combatantSprite.offsetTop - 40, { color: '#ff8c00', fontSize: '1.8em' });
            const damage = getPvpCombatantStat(combatant, 'strength') * 5 * (1 + getSkillBonus('dash') / 100);
            const finalDamage = damage * (isCrit ? (1 + critDamageBonus) : 1);
            if (isPlayer) pvpState.playerDamage += finalDamage;
            else pvpState.opponentDamage += finalDamage;
            createPvpDamageNumber(finalDamage, isPlayer);
        });
    } else {
        performAttack(() => {
            createAoeSlashEffect(targetSprite.offsetLeft + targetSprite.offsetWidth / 2, targetSprite.offsetTop + targetSprite.offsetHeight / 2, 50);
            const baseDamage = getPvpCombatantStat(combatant, 'strength') * (1 + getSkillBonus('aoeSlash') / 100);
            const finalDamage = baseDamage * (isCrit ? (1 + critDamageBonus) : 1);
            if (isPlayer) pvpState.playerDamage += finalDamage;
            else pvpState.opponentDamage += finalDamage;
            createPvpDamageNumber(finalDamage, isPlayer);
        });
    }

    const baseCooldown = 1500;
    const speedBonus = 1 - (attackerAgi / (attackerAgi + 500));
    const nextActionDelay = baseCooldown * speedBonus + (Math.random() * 500);

    if (isPlayer) {
        pvpState.playerActionTimeout = setTimeout(() => executePvpAction(true), nextActionDelay);
    } else {
        pvpState.opponentActionTimeout = setTimeout(() => executePvpAction(false), nextActionDelay);
    }
}

function pvpTick() {
    if (!pvpState.isActive) {
        clearInterval(pvpState.mainTimerId);
        return;
    }

    pvpState.timeLeft -= 0.1;

    if (pvpState.timeLeft <= 0) {
        pvpTimerDisplay.textContent = "0.0";
        endPvpBattle();
        return;
    }

    pvpTimerDisplay.textContent = pvpState.timeLeft.toFixed(1);

    handlePvpCollision();

    const totalDamage = pvpState.playerDamage + pvpState.opponentDamage;
    if (totalDamage > 0) {
        const playerPct = (pvpState.playerDamage / totalDamage) * 100;
        pvpPlayerDamageFill.style.width = `${playerPct}%`;
        pvpOpponentDamageFill.style.width = `${100 - playerPct}%`;
    }
}

async function endPvpBattle() {
    clearInterval(pvpState.mainTimerId);
    clearTimeout(pvpState.playerActionTimeout);
    clearTimeout(pvpState.opponentActionTimeout);
    pvpState.isActive = false;

    const playerWon = pvpState.playerDamage > pvpState.opponentDamage;
    let title = playerWon ? "VICTORY!" : "DEFEAT!";
    let text = `You dealt ${formatNumber(pvpState.playerDamage)} damage.<br>${pvpState.opponentData.playerName} dealt ${formatNumber(pvpState.opponentDamage)} damage.`;

    if (playerWon) {
        playSound('victory', 1, 'triangle', 523, 1046, 0.4);
        const pvpGoldReward = 55000 * gameState.level * gameState.ascension.tier;
        const pvpXpReward = 50000 * gameState.level * gameState.ascension.tier;

        gameState.gold += pvpGoldReward;
        addXP(gameState, pvpXpReward);

        text += `<br><br><b>Victory Bonus:</b><br>+${formatNumber(pvpGoldReward)} Gold<br>+${formatNumber(pvpXpReward)} XP`;
        const pvpBest = gameState.pvpPersonalBest || 0;
        if (pvpState.playerDamage > pvpBest) {
            gameState.pvpPersonalBest = pvpState.playerDamage;
            text += "<br><br><b>New PvP Damage Record!</b> Score submitted to leaderboard.";
            try {
                await db.collection("pvpLeaderboard").doc(gameState.playerName).set({
                    name: gameState.playerName,
                    maxDamage: Math.floor(gameState.pvpPersonalBest)
                }, { merge: true });
            } catch (e) {
                console.error("Failed to submit PvP score", e);
            }
        }
    } else {
        playSound('defeat', 1, 'sine', 440, 110, 0.8);
    }

    showNotification(title, text);
    saveGame();
    showScreen('game-screen');

    if (playerWon) {
        genesisArena.style.display = 'block';
        characterArea.style.display = 'none';
        startGameGenesis();
        growBtn.textContent = 'Grow';
    } else {
        stopGameGenesis();
        genesisArena.style.display = 'none';
        characterArea.style.display = 'flex';
        growBtn.textContent = 'Endless';
    }
}