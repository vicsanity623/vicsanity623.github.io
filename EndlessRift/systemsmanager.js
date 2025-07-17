// systemsmanager.js

import { initPlayer, player, updatePlayer, gainXP, takeDamage } from './player.js';
import { spawnEnemy, updateEnemies, drawEnemy } from './enemies.js';
import { initRift, expandWorld, drawStaticBackground, getBackgroundCanvas } from './rift.js';
import {
    fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile,
    triggerNova, createXpOrb, createImpactParticles, spawnDamageNumber,
    updateLightning, updateVolcano, updateFrostNova, updateBlackHole,
    fireHyperBeam, hexToRgb, drawSoulVortex
} from './attacks_skills.js';
import { UPGRADE_POOL } from './upgrades.js'; // Assuming you have an upgrades.js file
import { initFirebase, saveGame, loadGame, getSavedGames, deleteGame, signInWithGoogle, signOutUser, observeAuthState } from './firebase_utils.js'; // Assuming firebase_utils.js

// --- Core Game State Variables ---
let gameState = {
    isRunning: false,
    gameTime: 0,
    lastTime: 0,
    deltaTime: 0,
    currentStage: 1,
    currentWave: 0, // 0 for intermission, 1-5 for waves
    waveStartTime: 0,
    intermissionDuration: 5000, // 5 seconds
    waveDuration: 60000, // 60 seconds (1 minute)
    currentWaveEnemyCount: 0,
    maxWaveEnemyCount: 0,
    nextWaveEnemySpawnTime: 0,
    spawnInterval: 0,
    waveSpawnedEnemies: 0,
    isIntermission: true,
    isAutoMode: false,
    bossActive: false,
    bossEnemy: null,
    levelUpTimerActive: false,
    levelUpTimerStartTime: 0,
    levelUpTimerDuration: 10000, // 10 seconds for level up choice
    availableLevelUpOptions: [],
};

const world = { width: 3000, height: 2000 };
const camera = { x: 0, y: 0, width: 0, height: 0 };
const joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, baseX: 0, baseY: 0, radius: 60, handleRadius: 25, deadZone: 10 };
const keys = { w: false, a: false, s: false, d: false };

let canvas, ctx;
let hudElements = {};

// --- Game Entity Arrays ---
let enemies = [];
let projectiles = [];
let xpOrbs = [];
let particles = [];
let damageNumbers = [];
let lightningBolts = [];
let volcanicEruptions = [];
let visualEffects = []; // For shockwaves, explosions, etc.
let skillTotems = []; // For visual representation of skill areas (e.g., Volcano)

// Safe House - Central defensive point
let safeHouse = {
    x: world.width / 2,
    y: world.height / 2,
    radius: 150,
    active: false,
    health: 1000, // Safe house health
    maxHealth: 1000,
    lastDamageTime: 0,
    regenRate: 0.5, // Health per second
    enemiesHit: new Set(), // To prevent multiple hits per enemy per frame
};

// Screen effects
let screenFlash = { value: 0 }; // 0 to 1
let screenRedFlash = { value: 0 }; // 0 to 1 for player hit indicator
let screenShake = { intensity: 0, duration: 0, startTime: 0 };

// --- Initialization ---
function initializeApp() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Setup camera dimensions
    camera.width = window.innerWidth;
    camera.height = window.innerHeight;
    canvas.width = camera.width;
    canvas.height = camera.height;

    // Initialize HUD elements
    hudElements = {
        level: document.getElementById('level-text'),
        hp: document.getElementById('hp-text'),
        hpFill: document.getElementById('hp-bar-fill'),
        timer: document.getElementById('timer-text'),
        xpBottomFill: document.getElementById('xp-bar-bottom-fill'),
        killCounter: document.getElementById('kill-counter-text'),
        upgradeOptions: document.getElementById('upgrade-options'),
        levelUpWindow: document.getElementById('level-up-window'),
        xpFill: document.getElementById('xp-bar-fill'), // For the bar inside the level-up window
        restartButton: document.getElementById('restart-button'),
        gameOverScreen: document.getElementById('game-over-screen'),
        finalTimeText: document.getElementById('final-time-text'),
        finalLevelText: document.getElementById('final-level-text'),
        finalKillsText: document.getElementById('final-kills-text'),
        autoModeButton: document.getElementById('auto-mode-button'),
        hyperBeamButton: document.getElementById('hyperBeamButton'), // NEW
        bossHealthBarContainer: document.getElementById('boss-health-bar-container'), // NEW
        bossHealthBarFill: document.getElementById('boss-health-bar-fill'), // NEW
        stageText: document.getElementById('stage-text'), // NEW
        waveText: document.getElementById('wave-text'), // NEW
        nextWaveMessage: document.createElement('div'), // NEW: for "Wave X Incoming"
        upgradeStatsList: document.getElementById('upgrade-stats-list'), // NEW
        levelUpTimerDisplay: document.getElementById('level-up-timer-display'), // NEW
    };

    hudElements.nextWaveMessage.id = 'next-wave-message';
    document.body.appendChild(hudElements.nextWaveMessage);

    setupEventListeners();
    initPlayer(world); // Initialize player data
    initRift(); // Initialize background canvas

    // Firebase setup
    initFirebase();
    observeAuthState(updateAuthUI);

    // Initial menu display
    showMainMenu();
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        camera.width = window.innerWidth;
        camera.height = window.innerHeight;
        canvas.width = camera.width;
        canvas.height = camera.height;
        drawStaticBackground(); // Redraw background if world size changed (unlikely on resize, but good for consistency)
        // Adjust joystick base position on resize for mobile
        if (joystick.active) {
            joystick.baseX = camera.width * 0.15;
            joystick.baseY = camera.height * 0.8;
            joystick.handleX = joystick.baseX;
            joystick.handleY = joystick.baseY;
        }
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (gameState.isRunning) {
            keys[e.key.toLowerCase()] = true;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (gameState.isRunning) {
            keys[e.key.toLowerCase()] = false;
        }
    });

    // Mobile / Touch controls
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!gameState.isRunning && !hudElements.levelUpWindow.classList.contains('visible') && !hudElements.gameOverScreen.classList.contains('visible')) return;

        const touch = e.touches[0];
        joystick.active = true;
        joystick.baseX = touch.clientX;
        joystick.baseY = touch.clientY;
        joystick.handleX = touch.clientX;
        joystick.handleY = touch.clientY;
        updateMoveVectorFromJoystick();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystick.active) return;
        const touch = e.touches[0];
        joystick.currentX = touch.clientX;
        joystick.currentY = touch.clientY;
        updateMoveVectorFromJoystick();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        joystick.active = false;
        keys.w = keys.a = keys.s = keys.d = false; // Reset keys when joystick inactive
        joystick.handleX = joystick.baseX;
        joystick.handleY = joystick.baseY;
    });

    // HUD and Menu buttons
    hudElements.restartButton.addEventListener('click', () => {
        resetGame();
        startGame();
    });

    document.getElementById('newGameBtn').addEventListener('click', () => {
        initPlayer(world);
        resetGame();
        startGame();
        hideMainMenu();
    });

    hudElements.autoModeButton.addEventListener('click', () => {
        gameState.isAutoMode = !gameState.isAutoMode;
        hudElements.autoModeButton.textContent = gameState.isAutoMode ? 'AUTO ON' : 'AUTO OFF';
        hudElements.autoModeButton.classList.toggle('auto-on', gameState.isAutoMode);
    });

    hudElements.hyperBeamButton.addEventListener('click', () => {
        if (player.skills.hyperBeam.isUnlocked && !hudElements.hyperBeamButton.disabled) {
            fireHyperBeam(player, player.skills.hyperBeam.damage, player.skills.hyperBeam.width, player.skills.hyperBeam.duration, player.skills.hyperBeam.chargingTime, player.skills.hyperBeam.color);
            player.skills.hyperBeam.lastCast = gameState.gameTime;
        }
    });

    // Firebase Auth Buttons
    document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
    document.getElementById('signOutBtn').addEventListener('click', signOutUser);
}

function updateAuthUI(user) {
    const authSection = document.getElementById('auth-section');
    const userStatus = document.getElementById('userStatus');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const userNameDisplay = document.getElementById('userName');
    const signOutBtn = document.getElementById('signOutBtn');
    const userDisplay = document.getElementById('user-display');
    const loadOptionsContainer = document.getElementById('load-options-container');

    if (user) {
        userStatus.textContent = `Signed in as: ${user.displayName || user.email}`;
        googleSignInBtn.style.display = 'none';
        userDisplay.style.display = 'flex';
        userNameDisplay.textContent = user.displayName || user.email;
        signOutBtn.style.display = 'inline-block';
        loadSavedGames(user.uid, loadOptionsContainer);
    } else {
        userStatus.textContent = 'You are playing as a guest.';
        googleSignInBtn.style.display = 'flex';
        userDisplay.style.display = 'none';
        signOutBtn.style.display = 'none';
        loadOptionsContainer.innerHTML = ''; // Clear load options
    }
}

function loadSavedGames(userId, container) {
    getSavedGames(userId).then(saves => {
        container.innerHTML = ''; // Clear previous load buttons
        if (saves.length > 0) {
            saves.forEach(save => {
                const button = document.createElement('button');
                button.className = 'menu-button';
                button.textContent = `Load Game: ${formatTime(save.gameTime)} Lv${save.player.level}`;
                button.onclick = () => {
                    loadGame(userId, save.id).then(loadedState => {
                        if (loadedState) {
                            console.log("Game loaded:", loadedState);
                            // Reset game state and load player
                            resetGame();
                            Object.assign(gameState, loadedState.gameState);
                            Object.assign(safeHouse, loadedState.safeHouse);
                            player.x = loadedState.player.x;
                            player.y = loadedState.player.y;
                            player.level = loadedState.player.level;
                            player.xp = loadedState.player.xp;
                            player.xpForNextLevel = loadedState.player.xpForNextLevel;
                            player.kills = loadedState.player.kills;
                            player.health = loadedState.player.health;
                            player.maxHealth = loadedState.player.maxHealth;
                            player.upgradeLevels = loadedState.player.upgradeLevels;
                            player.weapon = loadedState.player.weapon;
                            player.abilities = loadedState.player.abilities;
                            player.skills = loadedState.player.skills;
                            player.armor = loadedState.player.armor || 0; // Ensure new props are set
                            player.thorns = loadedState.player.thorns || 0;
                            player.lifeSteal = loadedState.player.lifeSteal || 0;
                            player.dodgeChance = loadedState.player.dodgeChance || 0;
                            player.magnetism = loadedState.player.magnetism || 1;
                            player.healthRegen = loadedState.player.healthRegen || 0;
                            player.xpGainModifier = loadedState.player.xpGainModifier || 1;
                            player.speed = loadedState.player.speed || 3.5;
                            player.lastHitTime = loadedState.player.lastHitTime || 0;


                            // Re-initialize player to ensure all properties (especially nested ones) are correct
                            // and default values for new properties are set if not in save.
                            // This might be redundant with the Object.assign above if loadPlayer is thorough.
                            // Consider replacing with: loadPlayer(loadedState.player);
                            // For now, doing it manually:
                            Object.assign(player, loadedState.player);
                            
                            // Re-init player weapon/skills/abilities for robust loading of new properties
                            // (If loadPlayer function is used, this logic should be inside it)
                            if (loadedState.player.weapon) Object.assign(player.weapon, loadedState.player.weapon);
                            if (loadedState.player.abilities) Object.assign(player.abilities, loadedState.player.abilities);
                            if (loadedState.player.skills) Object.assign(player.skills, loadedState.player.skills);


                            // Re-draw background if world size changed from saved game
                            drawStaticBackground();
                            startGame();
                            hideMainMenu();
                        }
                    }).catch(error => {
                        console.error("Error loading game:", error);
                        alert("Failed to load game: " + error.message);
                    });
                };
                container.appendChild(button);

                const deleteButton = document.createElement('button');
                deleteButton.className = 'menu-button secondary delete-button';
                deleteButton.textContent = 'X';
                deleteButton.onclick = (e) => {
                    e.stopPropagation(); // Prevent clicking load button
                    if (confirm('Are you sure you want to delete this save?')) {
                        deleteGame(userId, save.id).then(() => {
                            console.log("Game deleted:", save.id);
                            loadSavedGames(userId, container); // Refresh list
                        }).catch(error => {
                            console.error("Error deleting game:", error);
                            alert("Failed to delete game: " + error.message);
                        });
                    }
                };
                button.appendChild(deleteButton); // Append delete button to the load button
            });
        } else {
            container.innerHTML = '<p>No saved games found.</p>';
        }
    }).catch(error => {
        console.error("Error fetching saved games:", error);
        container.innerHTML = '<p>Error loading saved games.</p>';
    });
}


function showMainMenu() {
    document.getElementById('main-menu').classList.add('visible');
    document.getElementById('game-container').style.visibility = 'hidden';
    hudElements.gameOverScreen.classList.remove('visible');
    gameState.isRunning = false; // Ensure game is paused
}

function hideMainMenu() {
    document.getElementById('main-menu').classList.remove('visible');
    document.getElementById('game-container').style.visibility = 'visible';
}

function startGame() {
    gameState.isRunning = true;
    gameState.lastTime = performance.now();
    gameState.gameTime = 0; // Reset game time for new game
    gameState.currentStage = 1;
    gameState.currentWave = 0; // Start with intermission
    gameState.isIntermission = true;
    gameState.waveStartTime = performance.now(); // Start timer for intermission
    enemies = []; // Clear any existing enemies
    projectiles = [];
    xpOrbs = [];
    particles = [];
    damageNumbers = [];
    lightningBolts = [];
    volcanicEruptions = [];
    visualEffects = [];
    skillTotems = [];

    safeHouse.active = true; // Ensure safe house is active
    safeHouse.health = safeHouse.maxHealth; // Reset safe house health

    requestAnimationFrame(gameLoop);
}

function resetGame() {
    // Reset core game state
    gameState.isRunning = false;
    gameState.gameTime = 0;
    gameState.lastTime = 0;
    gameState.deltaTime = 0;
    gameState.currentStage = 1;
    gameState.currentWave = 0;
    gameState.waveStartTime = 0;
    gameState.isIntermission = true;
    gameState.currentWaveEnemyCount = 0;
    gameState.maxWaveEnemyCount = 0;
    gameState.nextWaveEnemySpawnTime = 0;
    gameState.spawnInterval = 0;
    gameState.waveSpawnedEnemies = 0;
    gameState.bossActive = false;
    gameState.bossEnemy = null;
    gameState.levelUpTimerActive = false;
    gameState.levelUpTimerStartTime = 0;
    gameState.availableLevelUpOptions = [];

    // Reset player state (re-initialize for a clean slate)
    initPlayer(world);

    // Clear all entity arrays
    enemies = [];
    projectiles = [];
    xpOrbs = [];
    particles = [];
    damageNumbers = [];
    lightningBolts = [];
    volcanicEruptions = [];
    visualEffects = [];
    skillTotems = [];

    // Reset safe house
    safeHouse.active = true;
    safeHouse.health = safeHouse.maxHealth;
    safeHouse.lastDamageTime = 0;
    safeHouse.enemiesHit.clear();

    // Reset screen effects
    screenFlash.value = 0;
    screenRedFlash.value = 0;
    screenShake.intensity = 0;
    screenShake.duration = 0;
    screenShake.startTime = 0;

    // Reset HUD visibility
    hudElements.gameOverScreen.classList.remove('visible');
    hudElements.levelUpWindow.classList.remove('visible');
    hudElements.nextWaveMessage.style.display = 'none';

    // Re-render static background in case world size changed (e.g. from a loaded game)
    world.width = 3000;
    world.height = 2000;
    drawStaticBackground();

    // Update HUD to reflect reset state
    updateHUD();
}


// --- Main Game Loop ---
function gameLoop(currentTime) {
    if (!gameState.isRunning) {
        gameState.lastTime = currentTime; // Keep lastTime updated even when paused
        return;
    }

    gameState.deltaTime = currentTime - gameState.lastTime;
    gameState.lastTime = currentTime;
    gameState.gameTime += gameState.deltaTime;

    // --- Update Game State based on Waves and Stages ---
    handleWaveProgression();

    // --- Core Updates ---
    updatePlayer(gameState.deltaTime, world, enemies, getMoveVector());
    updateCamera();
    
    // Player Weapon Cooldown & Firing
    if (!gameState.isAutoMode && gameState.gameTime - player.weapon.lastShotTime > player.weapon.cooldown) {
        fireProjectile(player);
        player.weapon.lastShotTime = gameState.gameTime;
    }

    // Player Skill Cooldowns
    updateLightning(gameState.deltaTime, player);
    updateVolcano(gameState.deltaTime, player);
    updateFrostNova(gameState.deltaTime, player);
    updateBlackHole(gameState.deltaTime, player);

    // Bulletstorm Skill
    if (player.skills.bulletstorm.isUnlocked && gameState.gameTime - player.skills.bulletstorm.lastShotTime > player.skills.bulletstorm.fireRate) {
        const target = enemies.filter(e => !e.markedForDeletion).sort((a,b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
        if (target) {
            firePlayerSkillProjectile(player.x, player.y, target.x, target.y,
                player.skills.bulletstorm.damage, player.skills.bulletstorm.speed,
                player.skills.bulletstorm.color, player.skills.bulletstorm.size);
            player.skills.bulletstorm.lastShotTime = gameState.gameTime;
        }
    }

    // Update Enemies (Movement, Shooting, Dying State)
    updateEnemies(gameState.deltaTime, enemies, player, showLevelUpOptions, gainXPWrapper);

    // --- NEW: Collision Detection and Damage Application ---
    handleCollisions();
    
    // --- Update Entities and Filter Dead Ones ---
    projectiles = projectiles.filter(p => !p.update(gameState.deltaTime));
    xpOrbs = xpOrbs.filter(o => !o.update(gameState.deltaTime, Math.hypot(player.x - o.x, player.y - o.y))); // Pass player-orb distance
    particles = particles.filter(p => !p.update(gameState.deltaTime));
    damageNumbers = damageNumbers.filter(dn => !dn.update(gameState.deltaTime));
    lightningBolts = lightningBolts.filter(b => !b.update(gameState.deltaTime));
    volcanicEruptions = volcanicEruptions.filter(v => !v.update(gameState.deltaTime));
    visualEffects = visualEffects.filter(eff => !eff.update(gameState.deltaTime));
    
    // Filter enemies: Mark 'markedForDeletion' as the final removal step
    enemies = enemies.filter(e => !e.markedForDeletion);

    // Update Safe House
    updateSafeHouse(gameState.deltaTime);

    // Check for game over
    if (player.health <= 0) {
        gameState.isRunning = false;
        hudElements.gameOverScreen.classList.add('visible');
        hudElements.finalTimeText.textContent = formatTime(gameState.gameTime);
        hudElements.finalLevelText.textContent = player.level;
        hudElements.finalKillsText.textContent = player.kills;
        // Optionally save game on death
        saveGame({ player, gameState, safeHouse });
    }

    // --- Drawing ---
    drawGame();

    // Update HUD
    updateHUD();

    requestAnimationFrame(gameLoop);
}

// Helper to provide gainXP with callbacks
function gainXPWrapper(amount) {
    gainXP(amount, showLevelUpOptions, expandWorld, triggerNova, camera);
}

function handleWaveProgression() {
    const timeInCurrentPhase = gameState.gameTime - gameState.waveStartTime;

    if (gameState.isIntermission) {
        hudElements.nextWaveMessage.textContent = `WAVE ${gameState.currentWave + 1} INCOMING!`;
        hudElements.nextWaveMessage.style.display = 'block';

        if (timeInCurrentPhase >= gameState.intermissionDuration) {
            // End intermission, start next wave
            gameState.isIntermission = false;
            gameState.currentWave++;
            gameState.waveStartTime = gameState.gameTime;
            gameState.waveSpawnedEnemies = 0;
            hudElements.nextWaveMessage.style.display = 'none';

            if (gameState.currentWave > 5) {
                // If all regular waves are done, move to next stage and reset waves
                gameState.currentStage++;
                gameState.currentWave = 1; // Start wave 1 of new stage
                // Give a short intermission before starting next stage's wave 1
                gameState.isIntermission = true;
                gameState.waveStartTime = gameState.gameTime;
                hudElements.nextWaveMessage.textContent = `STAGE ${gameState.currentStage} START!`;
                hudElements.nextWaveMessage.style.display = 'block';
                return; // Skip enemy spawning for this frame, wait for next loop
            }

            if (gameState.currentWave === 5) { // Boss wave
                gameState.bossActive = true;
                hudElements.nextWaveMessage.textContent = `BOSS APPROACHING!`;
                hudElements.nextWaveMessage.style.display = 'block'; // Keep message
                setTimeout(() => {
                    if (!gameState.bossEnemy) { // Ensure only one boss
                        spawnEnemy(enemies, gameState.currentStage, gameState.currentWave, 'boss');
                        gameState.bossEnemy = enemies.find(e => e.isBoss); // Store boss reference
                        hudElements.nextWaveMessage.style.display = 'none'; // Hide message once boss spawns
                    }
                }, 1000); // 1 second delay for boss spawn
                gameState.maxWaveEnemyCount = 1; // Only the boss
            } else { // Regular waves
                // Calculate max enemies for current wave based on stage and wave number
                gameState.maxWaveEnemyCount = Math.floor(5 + (gameState.currentStage * 3) + (gameState.currentWave * 2));
                gameState.spawnInterval = gameState.waveDuration / gameState.maxWaveEnemyCount;
                gameState.nextWaveEnemySpawnTime = gameState.gameTime + gameState.spawnInterval;
            }
        }
    } else { // During a wave
        if (gameState.bossActive) {
            if (gameState.bossEnemy && gameState.bossEnemy.markedForDeletion) {
                // Boss defeated!
                gameState.bossActive = false;
                gameState.bossEnemy = null;
                // Transition to intermission after boss defeat
                gameState.currentWave++; // Increment to 6 (post-boss)
                gameState.isIntermission = true;
                gameState.waveStartTime = gameState.gameTime;
                hudElements.nextWaveMessage.textContent = `STAGE CLEARED!`;
                hudElements.nextWaveMessage.style.display = 'block';
            } else if (!gameState.bossEnemy) {
                // Boss was supposed to be active but is null (e.g., initial spawn failed or was removed prematurely)
                // Re-attempt spawn or transition to next phase if boss not found after a short while
                if (gameState.gameTime - gameState.waveStartTime > 5000 && !gameState.bossEnemy) { // 5s grace period
                    console.warn("Boss was active but bossEnemy is null. Resetting wave state.");
                    gameState.bossActive = false;
                    gameState.currentWave++; // Increment to 6 (post-boss)
                    gameState.isIntermission = true;
                    gameState.waveStartTime = gameState.gameTime;
                    hudElements.nextWaveMessage.textContent = `STAGE CLEARED! (Boss not found)`;
                    hudElements.nextWaveMessage.style.display = 'block';
                }
            }
        } else { // Regular waves
            if (timeInCurrentPhase >= gameState.waveDuration) {
                // End wave, transition to intermission
                gameState.isIntermission = true;
                gameState.waveStartTime = gameState.gameTime;
                hudElements.nextWaveMessage.textContent = `WAVE ${gameState.currentWave} COMPLETE!`;
                hudElements.nextWaveMessage.style.display = 'block';
            } else {
                // Spawn enemies during wave
                if (gameState.waveSpawnedEnemies < gameState.maxWaveEnemyCount && gameState.gameTime >= gameState.nextWaveEnemySpawnTime) {
                    spawnEnemy(enemies, gameState.currentStage, gameState.currentWave);
                    gameState.waveSpawnedEnemies++;
                    gameState.nextWaveEnemySpawnTime = gameState.gameTime + gameState.spawnInterval;
                }
            }
        }
    }
}

function getMoveVector() {
    let dx = 0;
    let dy = 0;

    if (joystick.active) {
        const deltaX = joystick.currentX - joystick.baseX;
        const deltaY = joystick.currentY - joystick.baseY;
        const distance = Math.hypot(deltaX, deltaY);
        const angle = Math.atan2(deltaY, deltaX);

        if (distance > joystick.deadZone) {
            const cappedDistance = Math.min(distance, joystick.radius);
            dx = Math.cos(angle) * cappedDistance;
            dy = Math.sin(angle) * cappedDistance;

            joystick.handleX = joystick.baseX + dx;
            joystick.handleY = joystick.baseY + dy;
            
            // Normalize for player speed calculation
            dx /= joystick.radius;
            dy /= joystick.radius;
        } else {
            joystick.handleX = joystick.baseX;
            joystick.handleY = joystick.baseY;
        }
    } else {
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
    }

    return { dx, dy };
}

function updateCamera() {
    camera.x = player.x - camera.width / 2;
    camera.y = player.y - camera.height / 2;

    // Clamp camera to world boundaries
    camera.x = Math.max(0, Math.min(world.width - camera.width, camera.x));
    camera.y = Math.max(0, Math.min(world.height - camera.height, camera.y));

    // Apply screen shake
    if (screenShake.intensity > 0) {
        const elapsed = gameState.gameTime - screenShake.startTime;
        if (elapsed < screenShake.duration) {
            camera.x += (Math.random() - 0.5) * screenShake.intensity;
            camera.y += (Math.random() - 0.5) * screenShake.intensity;
            // Gradually reduce intensity
            screenShake.intensity *= 0.95;
        } else {
            screenShake.intensity = 0;
        }
    }
}

function triggerScreenShake(intensity, duration) {
    screenShake.intensity = Math.max(screenShake.intensity, intensity);
    screenShake.duration = Math.max(screenShake.duration, duration);
    screenShake.startTime = gameState.gameTime;
}


// --- NEW: Collision Handling Function ---
function handleCollisions() {
    // Player Projectile vs Enemy
    projectiles.filter(p => p.isPlayerProjectile && !p.isPlayerSkillProjectile && !p.markedForDeletion).forEach(p => {
        enemies.forEach(e => {
            if (!e.isDying && !e.markedForDeletion && !p.hitEnemies.includes(e)) {
                // Basic AABB collision for simplicity, or use circular collision if sizes are radii
                const projHalfW = p.size.w / 2;
                const projHalfH = p.size.h / 2; // For rectangular projectiles
                const enemyHalfW = e.width / 2;
                const dist = Math.hypot(p.x - e.x, p.y - e.y); // Center to center distance

                // Consider projectile as a circle of max(w,h)/2, enemy as a circle of width/2
                if (dist < Math.max(projHalfW, projHalfH) + enemyHalfW) {
                    applyDamageToEnemy(e, p.damage, p.critChance, p.critDamage, p.x, p.y, p.color);
                    p.hitEnemies.push(e); // Mark enemy as hit by this projectile

                    if (player.abilities.critExplosion && Math.random() < player.weapon.critChance) {
                        createImpactParticles(e.x, e.y, 10, 'spark', 'orange');
                        triggerNova(e, p.damage * 0.5, p.explosionRadius); // Minor explosion
                    }
                    
                    if (p.explodesOnImpact) {
                        visualEffects.push({
                            type: 'shockwave', x: p.x, y: p.y, radius: 10, maxRadius: p.explosionRadius, life: 150,
                            update(dt) { this.radius += (this.maxRadius / 150) * dt; this.life -= dt; return this.life <= 0; }
                        });
                        // Apply explosion damage to all enemies in radius
                        enemies.forEach(expEnemy => {
                            if (!expEnemy.isDying && !expEnemy.markedForDeletion && Math.hypot(expEnemy.x - p.x, expEnemy.y - p.y) < p.explosionRadius) {
                                applyDamageToEnemy(expEnemy, p.explosionDamage, 0, 1, expEnemy.x, expEnemy.y, 'rgba(255, 100, 0, 1)'); // No crit for explosion damage
                            }
                        });
                        p.markedForDeletion = true; // Mark projectile for deletion after explosion
                    }

                    if (p.pierce > 0) {
                        p.pierce--;
                    } else {
                        if (!p.explodesOnImpact) { // If it explodes, it's already marked
                            p.markedForDeletion = true;
                        }
                    }
                }
            }
        });
    });

    // Player Skill Projectile vs Enemy (e.g., Bulletstorm)
    projectiles.filter(p => p.isPlayerSkillProjectile && !p.markedForDeletion).forEach(p => {
        enemies.forEach(e => {
            if (!e.isDying && !e.markedForDeletion && !p.hitEnemies.includes(e)) {
                const projHalfW = p.size.w / 2;
                const enemyHalfW = e.width / 2;
                const dist = Math.hypot(p.x - e.x, p.y - e.y);

                if (dist < projHalfW + enemyHalfW) {
                    applyDamageToEnemy(e, p.damage, p.critChance, p.critDamage, p.x, p.y, p.color);
                    p.hitEnemies.push(e);

                    if (p.explodesOnImpact) {
                        visualEffects.push({
                            type: 'shockwave', x: p.x, y: p.y, radius: 10, maxRadius: p.explosionRadius, life: 150,
                            update(dt) { this.radius += (this.maxRadius / 150) * dt; this.life -= dt; return this.life <= 0; }
                        });
                        enemies.forEach(expEnemy => {
                            if (!expEnemy.isDying && !expEnemy.markedForDeletion && Math.hypot(expEnemy.x - p.x, expEnemy.y - p.y) < p.explosionRadius) {
                                applyDamageToEnemy(expEnemy, p.explosionDamage, 0, 1, expEnemy.x, expEnemy.y, p.color);
                            }
                        });
                        p.markedForDeletion = true;
                    }
                    if (!p.explodesOnImpact) { // Mark for deletion if it doesn't explode
                        p.markedForDeletion = true;
                    }
                }
            }
        });
    });

    // Enemy Projectile vs Player
    projectiles.filter(p => !p.isPlayerProjectile && !p.markedForDeletion).forEach(p => {
        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        const projSize = p.size.w / 2; // Assuming square for simplicity
        const playerSize = player.size / 2;

        if (dist < projSize + playerSize) {
            takeDamage(p.damage, gameState.gameTime, spawnDamageNumber, screenRedFlash, triggerScreenShake);
            p.markedForDeletion = true;
        }
    });

    // Player (Melee) vs Enemy (Thorns/Contact Damage)
    enemies.forEach(e => {
        if (!e.isDying && !e.markedForDeletion && e.type !== 'shooter') { // Shooters typically don't have contact damage
            const dist = Math.hypot(player.x - e.x, player.y - e.y);
            const playerHalfSize = player.size / 2;
            const enemyHalfSize = e.width / 2;

            if (dist < playerHalfSize + enemyHalfSize) {
                // Player takes damage from enemy contact
                if (gameState.gameTime - e.lastDamageToPlayerTime > 500 || !e.lastDamageToPlayerTime) { // 0.5 sec cooldown for enemy contact damage
                    takeDamage(e.damage, gameState.gameTime, spawnDamageNumber, screenRedFlash, triggerScreenShake);
                    e.lastDamageToPlayerTime = gameState.gameTime;
                }
                
                // Enemy takes thorns damage from player contact
                if (player.thorns > 0) {
                    if (!safeHouse.enemiesHit.has(e)) { // Re-using safeHouse's Set to prevent rapid thorns ticks
                        applyDamageToEnemy(e, player.thorns, 0, 1, e.x, e.y, 'var(--player-aura-color)');
                        safeHouse.enemiesHit.add(e);
                        setTimeout(() => safeHouse.enemiesHit.delete(e), 100); // Clear hit for next tick
                    }
                }
            }
        }
    });

    // Hyper Beam Damage Application
    visualEffects.filter(eff => eff.type === 'hyperBeam' && eff.life > 0).forEach(beam => {
        const beamCenter = { x: beam.x, y: beam.y };
        const beamAngle = beam.angle;
        const beamHalfWidth = beam.beamWidth / 2;
        const beamLength = beam.length;

        enemies.forEach(e => {
            if (!e.isDying && !e.markedForDeletion && !beam.hitEnemies.has(e)) {
                // Calculate position of enemy relative to beam's coordinate system
                const dx = e.x - beamCenter.x;
                const dy = e.y - beamCenter.y;
                const rotatedX = dx * Math.cos(-beamAngle) - dy * Math.sin(-beamAngle);
                const rotatedY = dx * Math.sin(-beamAngle) + dy * Math.cos(-beamAngle);

                // Check if enemy is within beam's rectangular hit area
                if (rotatedX > 0 && rotatedX < beamLength &&
                    rotatedY > -beamHalfWidth - e.width/2 && rotatedY < beamHalfWidth + e.width/2)
                {
                    applyDamageToEnemy(e, beam.damage * (gameState.deltaTime / 1000), 0, 1, e.x, e.y, beam.color); // Continuous damage
                    beam.hitEnemies.add(e); // Mark as hit for this beam instance
                }
            }
        });
        // Clear hitEnemies set for next frame if not a continuous beam, or at intervals
        // For a single-pass beam, this needs adjustment. For continuous:
        // Set will be cleared when the beam effect itself is removed.
    });

    // Soul Vortex Damage
    if (player.abilities.orbitingShield.enabled) {
        const shield = player.abilities.orbitingShield;
        const count = shield.count || 1;
        const soulRadius = shield.radius || 10;
        const orbitDistance = shield.distance || 50;

        for (let i = 0; i < count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            const soulX = player.x + Math.cos(angle) * orbitDistance;
            const soulY = player.y + Math.sin(angle) * orbitDistance;

            enemies.forEach(e => {
                if (!e.isDying && !e.markedForDeletion) {
                    const dist = Math.hypot(soulX - e.x, soulY - e.y);
                    if (dist < soulRadius + e.width / 2) {
                        // Check cooldown for each soul and enemy pair
                        const hitKey = `${e.id || e.x}_${e.y}_${i}`; // Unique key for this enemy-soul interaction
                        if (!shield.lastHit || (gameState.gameTime - shield.lastHit[hitKey] > shield.cooldown || !shield.lastHit[hitKey])) {
                            applyDamageToEnemy(e, shield.damage, 0, 1, e.x, e.y, 'var(--lightning-color)');
                            shield.lastHit = shield.lastHit || {}; // Initialize if null
                            shield.lastHit[hitKey] = gameState.gameTime;
                        }
                    }
                }
            });
        }
        // Update soul angle for rotation
        shield.angle += (shield.speed || 1) * (gameState.deltaTime / 500); // Rotate faster based on speed
    }
}

// Function to apply damage to an enemy, handling crit, thorns, and death
function applyDamageToEnemy(enemy, baseDamage, critChance, critDamageMultiplier, fxX, fxY, color = 'white') {
    if (enemy.isDying || enemy.markedForDeletion) return;

    let finalDamage = baseDamage;
    let isCrit = false;

    if (Math.random() < critChance) {
        finalDamage *= critDamageMultiplier;
        isCrit = true;
    }

    // Apply thorns damage to player
    if (player.thorns > 0 && finalDamage > 0) {
        // Thorns are typically on enemy contact, but if you want reflected damage from player attacks:
        // No, this is typically handled in player-enemy direct contact collision.
        // It's better to keep thorns as a direct contact effect on the player.
    }

    enemy.health -= finalDamage;
    enemy.lastHitTime = gameState.gameTime; // For hit flash

    // Ensure damage numbers are spawned with correct values and colors
    spawnDamageNumber(fxX, fxY, Math.round(finalDamage), isCrit);

    // Enemy death handled in updateEnemies after health check
    // No need to set markedForDeletion here, updateEnemies will do it when health <= 0
    // and handle XP, kills, etc.
}


function updateSafeHouse(deltaTime) {
    if (!safeHouse.active) return;

    // Regenerate health
    safeHouse.health = Math.min(safeHouse.maxHealth, safeHouse.health + safeHouse.regenRate * (deltaTime / 1000));

    // Collision with enemies (enemies deal damage to safe house)
    enemies.forEach(e => {
        if (!e.isDying && !e.markedForDeletion) {
            const dist = Math.hypot(e.x - safeHouse.x, e.y - safeHouse.y);
            if (dist < safeHouse.radius + e.width / 2) {
                if (!safeHouse.enemiesHit.has(e)) {
                    safeHouse.health -= e.damage;
                    createImpactParticles(safeHouse.x, safeHouse.y, 5, 'impact', 'rgba(255, 0, 0, 0.5)'); // Red particles for hits
                    spawnDamageNumber(safeHouse.x, safeHouse.y - safeHouse.radius, Math.round(e.damage), false);
                    triggerScreenShake(2, 50); // Minor shake for safe house hit
                    safeHouse.enemiesHit.add(e);
                    // Clear the hit status after a short delay to allow more hits
                    setTimeout(() => safeHouse.enemiesHit.delete(e), 500); // Cooldown for damage from this enemy
                }
            }
        }
    });

    if (safeHouse.health <= 0) {
        safeHouse.health = 0;
        safeHouse.active = false;
        // Trigger game over if safe house is destroyed and player is also low health/dead
        if (player.health > 0) { // If player is still alive, maybe a "last stand"
             // For now, if safehouse dies, it just becomes inactive. Player still needs to die for game over.
        }
        createImpactParticles(safeHouse.x, safeHouse.y, 50, 'enemy_death', 'red'); // Explosion for safehouse
    }
}


// --- Drawing Functions ---
function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw pre-rendered static background
    ctx.drawImage(getBackgroundCanvas(), 0, 0);

    // Draw Safe House
    if (safeHouse.active) {
        ctx.beginPath();
        ctx.arc(safeHouse.x, safeHouse.y, safeHouse.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'var(--safe-house-fill)';
        ctx.fill();
        ctx.strokeStyle = 'var(--safe-house-stroke)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw safe house health bar
        if (safeHouse.health < safeHouse.maxHealth) {
            const barWidth = safeHouse.radius * 1.5;
            const barHeight = 8;
            const barYOffset = safeHouse.radius + 15;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(safeHouse.x - barWidth / 2, safeHouse.y - barYOffset, barWidth, barHeight);

            const currentHealthWidth = (Math.max(0, safeHouse.health) / safeHouse.maxHealth) * barWidth;
            ctx.fillStyle = 'yellow'; // Safe house bar is yellow
            ctx.fillRect(safeHouse.x - barWidth / 2, safeHouse.y - barYOffset, currentHealthWidth, barHeight);
        }
    }

    drawWorldElements(); // Skill Totems, Lightning Bolts, Volcanoes, XP Orbs
    
    projectiles.forEach(p => {
        if (p.isPlayerProjectile) { // Draw player projectiles in attacks_skills.js
            fireProjectile.drawProjectile(p, ctx); // This function doesn't exist, will need to be fixed
            // The drawProjectile function is actually defined in systemsmanager.js at the bottom in the old code.
            // So calling it directly here.
            drawProjectile(p, ctx);
        } else { // Enemy projectiles drawn in attacks_skills.js
            drawEnemyProjectile(p, ctx); // Need to define/import this if it's not present
        }
    });

    drawPlayer(player, player.angle); // Player is always drawn on top of most things

    // Draw Enemies (after projectiles so projectiles appear "under" enemies if they pass through)
    enemies.forEach(e => drawEnemy(e, ctx, player)); // Player is passed for enemy rotation

    drawParticlesAndEffects(); // Particles, Damage Numbers, Visual Effects
    
    ctx.restore();

    // Draw Joystick (always on top, not affected by camera)
    if (joystick.active) {
        drawJoystick();
    }

    // Apply screen flash overlay (always on top)
    if (screenFlash.value > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${screenFlash.value})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        screenFlash.value = Math.max(0, screenFlash.value - 0.05); // Fade out
    }
    // Apply screen red flash overlay for player damage
    if (screenRedFlash.value > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${screenRedFlash.value})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        screenRedFlash.value = Math.max(0, screenRedFlash.value - 0.08); // Fade out faster
    }
}

// Drawing functions that were previously embedded or implicitly available
// These should be moved to a separate `drawing.js` or `render.js` file if preferred,
// but for now, consolidating them here to ensure everything is present.

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

            if (Math.random() < 0.3) {
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
    }
}

function drawEnemyProjectile(p, ctx) {
    ctx.save();
    ctx.fillStyle = p.color || 'rgba(255, 0, 0, 1)';
    ctx.shadowColor = p.color || 'rgba(255, 0, 0, 1)';
    ctx.shadowBlur = 10;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fill(p.path); // Assumes p.path is a Path2D object
    ctx.restore();
}

function drawWorldElements() {
    skillTotems.forEach(totem => drawSkillTotem(totem));
    lightningBolts.forEach(bolt => drawLightningBolt(bolt));
    volcanicEruptions.forEach(v => drawVolcano(v));
    xpOrbs.forEach(orb => drawXpOrb(orb));
}

function drawParticlesAndEffects() {
    visualEffects.forEach(effect => {
        ctx.save();
        ctx.beginPath();
        if (effect.type === 'shockwave' || effect.type === 'frostwave') {
            const lifePercent = effect.life / effect.maxLife;
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.strokeStyle = effect.type === 'frostwave' ? `rgba(135, 206, 250, ${lifePercent * 0.8})` : `rgba(255, 255, 255, ${lifePercent * 0.8})`;
            ctx.lineWidth = 15 * lifePercent;
            ctx.stroke();

            if (effect.type === 'frostwave') {
                ctx.beginPath();
                const innerRadius = effect.radius * 0.8;
                const numSpikes = 8;
                for (let i = 0; i < numSpikes; i++) {
                    const angle = (i / numSpikes) * Math.PI * 2;
                    const outerX = effect.x + Math.cos(angle) * innerRadius;
                    const outerY = effect.y + Math.sin(angle) * innerRadius;
                    const innerX = effect.x + Math.cos(angle + Math.PI / numSpikes) * innerRadius * 0.7;
                    const innerY = effect.y + Math.sin(angle + Math.PI / numSpikes) * innerRadius * 0.7;
                    if (i === 0) ctx.moveTo(outerX, outerY);
                    else ctx.lineTo(outerX, outerY);
                    ctx.lineTo(innerX, innerY);
                }
                ctx.closePath();
                ctx.fillStyle = `rgba(180, 220, 255, ${lifePercent * 0.3})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(135, 206, 250, ${lifePercent * 0.5})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                if (lifePercent > 0.1 && Math.random() < 0.4) {
                    createImpactParticles(effect.x + (Math.random() - 0.5) * effect.radius * 0.8,
                                          effect.y + (Math.random() - 0.5) * effect.radius * 0.8,
                                          1, 'ice');
                }
            }
        } else if (effect.type === 'world_expansion') {
            const lifePercent = effect.life / effect.maxLife;
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(150, 255, 150, ${lifePercent * 0.9})`;
            ctx.lineWidth = 20 * lifePercent;
            ctx.stroke();
        } else if (effect.type === 'blackHole') {
            const lifePercent = effect.life / effect.maxLife;
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(effect.x, effect.y, 10, effect.x, effect.y, effect.radius);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.7, `rgba(25, 0, 50, ${lifePercent * 0.7})`);
            gradient.addColorStop(1, `rgba(0, 0, 0, ${lifePercent * 0.9})`);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.beginPath();
            const coreRadius = effect.radius * 0.2 * (Math.sin(gameState.gameTime / 100) * 0.1 + 0.9);
            ctx.arc(effect.x, effect.y, coreRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 0, 200, ${lifePercent * 0.5})`;
            ctx.shadowColor = `rgba(150, 50, 255, ${lifePercent * 0.8})`;
            ctx.shadowBlur = coreRadius * 2;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (lifePercent > 0.1 && Math.random() < 0.8) {
                const pAngle = Math.random() * Math.PI * 2;
                const pDist = Math.random() * effect.radius;
                const particleX = effect.x + Math.cos(pAngle) * pDist;
                const particleY = effect.y + Math.sin(pAngle) * pDist;
                createImpactParticles(particleX, particleY, 1, 'energy', 'rgba(200, 150, 255, 0.7)', (effect.x - particleX) / 100 * effect.pullStrength, (effect.y - particleY) / 100 * effect.pullStrength);
            }
        }
        ctx.restore();

        if (effect.type === 'hyperBeamCharge') {
            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(effect.angle);
            const chargeProgress = 1 - effect.life / effect.maxLife;
            const chargeSize = 5 + chargeProgress * 50;
            const chargeAlpha = chargeProgress * 0.8;
            ctx.fillStyle = `rgba(255, 255, 255, ${chargeAlpha})`;
            ctx.shadowColor = `rgba(255, 255, 255, ${chargeAlpha})`;
            ctx.shadowBlur = chargeSize * 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, chargeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (effect.type === 'hyperBeam') {
            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(effect.angle);

            const currentAlpha = effect.life / effect.maxLife;
            const beamStartOffset = 20;
            const glowStrength = currentAlpha * 120;

            const beamColor = effect.color;

            ctx.fillStyle = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.4})`;
            ctx.shadowColor = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.8})`;
            ctx.shadowBlur = glowStrength;
            ctx.fillRect(beamStartOffset, -effect.beamWidth / 2, effect.length, effect.beamWidth);

            ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.8})`;
            ctx.shadowBlur = glowStrength * 0.5;
            ctx.fillRect(beamStartOffset, -effect.beamWidth * 0.2, effect.length, effect.beamWidth * 0.4);

            const rippleFactor = Math.sin(gameState.gameTime / 50) * 0.05 + 1;
            ctx.fillStyle = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.1})`;
            ctx.shadowBlur = 0;
            ctx.fillRect(beamStartOffset, -effect.beamWidth / 2 * rippleFactor, effect.length, effect.beamWidth * rippleFactor);

            ctx.restore();

            if (currentAlpha > 0.1 && Math.random() < 0.3) {
                const particleX = beamStartOffset + Math.random() * effect.length;
                const particleY = (Math.random() - 0.5) * effect.beamWidth;
                const angleOffset = effect.angle;
                const speed = Math.random() * 2 + 0.5;
                
                const rotatedParticleX = effect.x + Math.cos(angleOffset) * particleX - Math.sin(angleOffset) * particleY;
                const rotatedParticleY = effect.y + Math.sin(angleOffset) * particleX + Math.cos(angleOffset) * particleY;

                createImpactParticles(rotatedParticleX, rotatedParticleY, 1, 'spark', `rgba(255, 255, 255, ${currentAlpha})`, Math.cos(angleOffset + (Math.random() - 0.5) * 0.5) * speed, Math.sin(angleOffset + (Math.random() - 0.5) * 0.5) * speed);
            }
        }
    });
    drawSoulVortex(player, ctx);

    // Drawing of individual particles:
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        if (p.currentSize > 3 && p.type !== 'spark') {
           ctx.shadowColor = p.color;
           ctx.shadowBlur = p.currentSize * 1.5;
        } else {
           ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.currentSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
    damageNumbers.forEach(dn => drawDamageNumber(dn));
}

function drawPlayer(p, angle) {
    const bob = Math.sin(gameState.gameTime / 250) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);

    const hoverPulse = Math.sin(gameState.gameTime / 400);

    // Subtle ground shadow/hover effect
    ctx.beginPath();
    ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2 + hoverPulse * 0.1;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.rotate(angle);

    const auraPulse = Math.sin(gameState.gameTime / 200);

    // Layer 1: Strongest Outer Aura
    ctx.beginPath();
    ctx.arc(0, 0, 30 + auraPulse * 4, -1.9, 1.9);
    ctx.strokeStyle = 'var(--player-aura-color)';
    ctx.lineWidth = 8 + auraPulse * 4;
    ctx.shadowColor = 'var(--player-aura-color)';
    ctx.shadowBlur = 35 + auraPulse * 20;
    ctx.stroke();

    // Layer 2: Brighter Inner Aura
    ctx.beginPath();
    ctx.arc(0, 0, 25 + auraPulse * 2.5, -1.9, 1.9);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4 + auraPulse * 1.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 1)';
    ctx.shadowBlur = 20 + auraPulse * 10;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Player Body (fill with a strong color)
    ctx.fillStyle = '#00FFFF';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(8, 15);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 15);
    ctx.closePath();
    ctx.fill();

    // Player "Eye" or core (black)
    ctx.fillStyle = '#000';
    ctx.fillRect(-5, -15, 10, 10);

    ctx.restore();

    if (Math.random() < 0.1) {
        createImpactParticles(p.x + (Math.random() - 0.5) * 10,
                              p.y + (Math.random() - 0.5) * 10,
                              1, 'spark', 'var(--player-aura-color)');
    }

    ctx.restore();
}

function drawXpOrb(o) {
    ctx.save();
    ctx.fillStyle = 'var(--highlight-xp-orb-color)';
    ctx.shadowColor = 'var(--highlight-xp-orb-color)';
    ctx.shadowBlur = 25;

    const pulseScale = 1 + Math.sin(gameState.gameTime / 200) * 0.1;
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
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.restore();
    }
}
function drawJoystick() { ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(128,128,128,0.3)'; ctx.fill(); ctx.beginPath(); ctx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
function drawDamageNumber(dn) { ctx.save(); ctx.translate(dn.x, dn.y); ctx.globalAlpha = dn.alpha; ctx.fillStyle = dn.isCrit ? 'yellow' : 'var(--damage-text-color)'; ctx.font = dn.isCrit ? 'bold 24px Roboto' : 'bold 18px Roboto'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(dn.value, 0, 0); ctx.restore(); }
function drawLightningBolt(bolt) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, bolt.life / 150); // Fade faster as it was 100
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
        createImpactParticles(bolt.end.x, bolt.end.y, 1, 'spark', bolt.color);
    }
    ctx.restore();
}
function drawVolcano(v) {
    ctx.save();
    const lifePercent = v.life / v.burnDuration;
    ctx.globalAlpha = lifePercent * 0.7;
    ctx.fillStyle = v.color || 'var(--volcano-color)';

    ctx.beginPath();
    ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
        const bubbleRadius = v.radius * (0.3 + Math.sin(gameState.gameTime / (100 + i * 50)) * 0.1);
        const offsetX = Math.cos(gameState.gameTime / (80 + i * 30)) * (v.radius * 0.3);
        const offsetY = Math.sin(gameState.gameTime / (90 + i * 40)) * (v.radius * 0.3);
        ctx.globalAlpha = lifePercent * (0.4 + Math.random() * 0.2);
        ctx.fillStyle = `rgba(255, ${100 + Math.floor(Math.random() * 50)}, 0, 1)`;
        ctx.beginPath();
        ctx.arc(v.x + offsetX, v.y + offsetY, bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    if (lifePercent > 0.1 && Math.random() < 0.2) {
        createImpactParticles(v.x, v.y, 1, 'fire'); // Create particles at volcano center
    }
    ctx.restore();
}
function drawSkillTotem(totem) { ctx.save(); ctx.translate(totem.x, totem.y); ctx.globalAlpha = 0.8 + Math.sin(gameState.gameTime / 200) * 0.2; ctx.beginPath(); ctx.arc(0, 0, totem.radius, 0, Math.PI * 2); ctx.fillStyle = totem.color; ctx.shadowColor = totem.color; ctx.shadowBlur = 20; ctx.fill(); ctx.font = '24px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(totem.icon, 0, 0); ctx.restore(); }


function updateHUD() {
    hudElements.level.textContent = `LV ${player.level}`;
    hudElements.hp.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
    hudElements.hpFill.style.width = `${(player.maxHealth > 0 && !isNaN(player.health)) ? (player.health / player.maxHealth) * 100 : 0}%`;
    hudElements.timer.textContent = formatTime(gameState.gameTime);
    hudElements.xpBottomFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    hudElements.killCounter.textContent = player.kills;

    // NEW: Update Stage and Wave text
    if (hudElements.stageText) hudElements.stageText.textContent = `STAGE: ${gameState.currentStage}`;
    if (hudElements.waveText) hudElements.waveText.textContent = `WAVE: ${gameState.currentWave === 0 || gameState.isIntermission ? 'INTERMISSION' : gameState.currentWave}/5`;

    // NEW: Update Boss Health Bar
    if (hudElements.bossHealthBarContainer && hudElements.bossHealthBarFill) {
        if (gameState.bossActive && gameState.bossEnemy) {
            hudElements.bossHealthBarContainer.style.display = 'block';
            const bossHealthPercent = Math.max(0, (gameState.bossEnemy.health / gameState.bossEnemy.maxHealth) * 100);
            hudElements.bossHealthBarFill.style.width = `${bossHealthPercent}%`;
        } else {
            hudElements.bossHealthBarContainer.style.display = 'none';
        }
    }

    hudElements.upgradeStatsList.innerHTML = '';

    const BASE_PLAYER_SPEED = 3.5;
    const BASE_WEAPON_COOLDOWN = 600;

    const sortedUpgradeIds = Object.keys(player.upgradeLevels).sort();

    for (const upgradeId of sortedUpgradeIds) {
        const level = player.upgradeLevels[upgradeId];
        const upgradeDef = UPGRADE_POOL.find(up => up.id === upgradeId);

        if (upgradeDef) {
            let statValue = '';
            switch (upgradeId) {
                case "vitality": statValue = `${player.maxHealth} Max HP`; break;
                case "recovery": statValue = `${(player.healthRegen).toFixed(1)} HP/s`; break;
                case "agility": statValue = `${((player.speed / BASE_PLAYER_SPEED) * 100).toFixed(0)}% Speed`; break;
                case "armor": statValue = `${player.armor} Armor`; break;
                case "dodge": statValue = `${(player.dodgeChance * 100).toFixed(0)}% Dodge`; break;
                case "wisdom": statValue = `${(player.xpGainModifier * 100).toFixed(0)}% XP`; break;
                case "greed": statValue = `${player.pickupRadius} Pickup Radius`; break;
                case "magnetism": statValue = `${(player.magnetism).toFixed(1)}x Magnetism`; break;
                case "lethality": statValue = `${(player.weapon.critChance * 100).toFixed(0)}% Crit Chance`; break;
                case "overwhelm": statValue = `${(player.weapon.critDamage * 100).toFixed(0)}% Crit Damage`; break;
                case "might": statValue = `${player.weapon.damage} Damage`; break;
                case "haste": statValue = `${(1000 / player.weapon.cooldown).toFixed(1)} Atk/s`; break;
                case "multishot": statValue = `${player.weapon.count} Projectiles`; break;
                case "impact": statValue = `${player.weapon.size.h.toFixed(0)} Projectile Size`; break;
                case "pierce": statValue = `${player.weapon.pierce} Pierce`; break;
                case "velocity": statValue = `${player.weapon.speed.toFixed(1)} Projectile Speed`; break;
                case "thorns": statValue = `${player.thorns} Thorns Damage`; break;
                case "life_steal": statValue = `${player.lifeSteal} Life Steal`; break;
                case "lightning": case "lightning_damage": statValue = `${player.skills.lightning.damage} Lightning Damage`; break;
                case "lightning_chains": statValue = `${player.skills.lightning.chains} Lightning Chains`; break;
                case "lightning_cooldown": statValue = `${(player.skills.lightning.cooldown / 1000).toFixed(1)}s Lightning CD`; break;
                case "lightning_shock": statValue = `${(player.skills.lightning.shockDuration / 1000).toFixed(1)}s Shock Duration`; break;
                case "lightning_fork": statValue = `${(player.skills.lightning.forkChance * 100).toFixed(0)}% Lightning Fork`; break;
                case "volcano": case "volcano_damage": statValue = `${player.skills.volcano.damage} Volcano Damage`; break;
                case "volcano_radius": statValue = `${player.skills.volcano.radius} Volcano Radius`; break;
                case "volcano_cooldown": statValue = `${(player.skills.volcano.cooldown / 1000).toFixed(1)}s Volcano CD`; break;
                case "volcano_duration": statValue = `${(player.skills.volcano.burnDuration / 1000).toFixed(1)}s Burn Duration`; break;
                case "volcano_count": statValue = `${player.skills.volcano.count || 1} Volcano Count`; break;
                case "frostNova": case "frostnova_damage": statValue = `${player.skills.frostNova.damage} Frost Nova Damage`; break;
                case "frostnova_radius": statValue = `${player.skills.frostNova.radius} Frost Nova Radius`; break;
                case "frostnova_cooldown": statValue = `${(player.skills.frostNova.cooldown / 1000).toFixed(1)}s Frost Nova CD`; break;
                case "frostnova_slow": statValue = `${(player.skills.frostNova.slowAmount * 100).toFixed(0)}% Slow`; break;
                case "blackHole": case "blackhole_damage": statValue = `${player.skills.blackHole.damage} Black Hole Damage`; break;
                case "blackhole_radius": statValue = `${player.skills.blackHole.radius} Black Hole Radius`; break;
                case "blackhole_duration": statValue = `${(player.skills.blackHole.duration / 1000).toFixed(1)}s Black Hole Duration`; break;
                case "blackhole_pull": statValue = `${player.skills.blackHole.pullStrength.toFixed(1)} Pull Strength`; break;
                case "bulletstorm": statValue = `Unlocked`; break;
                case "bulletstorm_damage": statValue = `${player.skills.bulletstorm.damage} Bul. Damage`; break;
                case "bulletstorm_firerate": statValue = `${(1000 / player.skills.bulletstorm.fireRate).toFixed(1)} Bul. Atk/s`; break;
                case "bulletstorm_speed": statValue = `${player.skills.bulletstorm.speed.toFixed(1)} Bul. Speed`; break;
                case "hyperBeam": statValue = `Unlocked`; break;
                case "hyperBeam_damage": statValue = `${player.skills.hyperBeam.damage} Beam Damage`; break;
                case "hyperBeam_width": statValue = `${player.skills.hyperBeam.width} Beam Width`; break;
                case "hyperBeam_cooldown": statValue = `${(player.skills.hyperBeam.cooldown / 1000).toFixed(1)}s Beam CD`; break;
                case "hyperBeam_duration": statValue = `${(player.skills.hyperBeam.duration / 1000).toFixed(1)}s Beam Duration`; break;
                case "hyperBeam_charge": statValue = `Instant Cast`; break;

                case "rear_guard":
                case "diagonalShot":
                case "novaOnLevelUp":
                case "healOnXp":
                case "crit_explosion":
                case "demolition":
                    statValue = `Active`;
                    break;
                case "soul_vortex": statValue = `${player.abilities.orbitingShield.count} Souls`; break;
                case "vortex_damage": statValue = `${player.abilities.orbitingShield.damage} Soul Dmg`; break;
                case "vortex_speed": statValue = `${player.abilities.orbitingShield.speed.toFixed(1)}x Soul Speed`; break;
                case "vortex_twin": statValue = `${player.abilities.orbitingShield.count} Souls`; break;
                default: statValue = `Lv ${level}`; break;
            }

            const p = document.createElement('p');
            p.className = 'upgrade-stat-item';
            p.innerHTML = `${upgradeDef.title}: <strong>${statValue}</strong>`;
            hudElements.upgradeStatsList.appendChild(p);
        }
    }

    const hyperBeamSkill = player.skills.hyperBeam;
    const hyperBeamButton = hudElements.hyperBeamButton;

    if (hyperBeamSkill.isUnlocked) {
        hyperBeamButton.style.display = 'block';
        if (gameState.isAutoMode) {
            hyperBeamButton.textContent = 'AUTO HB';
            hyperBeamButton.disabled = true;
            hyperBeamButton.classList.remove('cooldown-active');
            // Auto cast Hyper Beam if available in auto mode
            if (gameState.gameTime - hyperBeamSkill.lastCast > hyperBeamSkill.cooldown) {
                 fireHyperBeam(player, hyperBeamSkill.damage, hyperBeamSkill.width, hyperBeamSkill.duration, hyperBeamSkill.chargingTime, hyperBeamSkill.color);
                 hyperBeamSkill.lastCast = gameState.gameTime;
            }
        } else {
            const timeRemaining = Math.max(0, (hyperBeamSkill.cooldown - (gameState.gameTime - hyperBeamSkill.lastCast)) / 1000);
            const isOnCooldown = timeRemaining > 0.1;
            hyperBeamButton.disabled = isOnCooldown;
            hyperBeamButton.textContent = isOnCooldown ? `HB (${timeRemaining.toFixed(1)}s)` : 'Hyper Beam';
            hyperBeamButton.classList.toggle('cooldown-active', isOnCooldown);
        }
    } else {
        hyperBeamButton.style.display = 'none';
    }

    if (hudElements.levelUpTimerDisplay && gameState.levelUpTimerActive) {
        const elapsedTime = gameState.gameTime - gameState.levelUpTimerStartTime;
        const timeLeft = Math.max(0, (gameState.levelUpTimerDuration - elapsedTime) / 1000);
        const displayTime = Math.ceil(timeLeft);
        hudElements.levelUpTimerDisplay.textContent = `Time: ${displayTime}`;
        if (displayTime <= 3) {
            hudElements.levelUpTimerDisplay.classList.add('low-time');
        } else {
            hudElements.levelUpTimerDisplay.classList.remove('low-time');
        }
        if (timeLeft <= 0) {
            // Auto-select a random upgrade if time runs out
            if (gameState.availableLevelUpOptions.length > 0) {
                const randomUpgrade = gameState.availableLevelUpOptions[Math.floor(Math.random() * gameState.availableLevelUpOptions.length)];
                selectUpgrade(randomUpgrade);
            } else {
                // If no options, just close the window
                hudElements.levelUpWindow.classList.remove('visible');
                gameState.isRunning = true;
                gameState.lastTime = performance.now();
                gameState.levelUpTimerActive = false;
                gameState.availableLevelUpOptions = [];
            }
        }
    } else if (hudElements.levelUpTimerDisplay) {
        hudElements.levelUpTimerDisplay.textContent = '';
        hudElements.levelUpTimerDisplay.classList.remove('low-time');
    }
}

function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }

function showLevelUpOptions() {
    gameState.isRunning = false; // Pause game during level-up
    hudElements.xpFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    const availablePool = UPGRADE_POOL.filter(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const maxLevel = upgrade.maxLevel || Infinity;

        if (upgrade.once && currentLevel > 0) {
            return false;
        }

        if (currentLevel >= maxLevel) {
            return false;
        }

        if (upgrade.skill && !player.skills[upgrade.skill]?.isUnlocked && upgrade.id !== upgrade.skill) {
            return false;
        }
        
        if ((upgrade.skill === "soul_vortex" || upgrade.id.startsWith("vortex_")) && (!player.abilities.orbitingShield || !player.abilities.orbitingShield.enabled) && upgrade.id !== "soul_vortex") {
            return false;
        }

        return true;
    });
    const choices = availablePool.sort(() => 0.5 - Math.random()).slice(0, 6);
    hudElements.upgradeOptions.innerHTML = '';

    gameState.availableLevelUpOptions = choices;

    choices.forEach(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<h3>${upgrade.title}</h3><p>${upgrade.description(currentLevel)}</p>`;
        card.onclick = () => selectUpgrade(upgrade);
        hudElements.upgradeOptions.appendChild(card);
    });
    hudElements.levelUpWindow.classList.add('visible');

    gameState.levelUpTimerStartTime = gameState.gameTime;
    gameState.levelUpTimerActive = true;
    updateHUD();
}

window.showLevelUpOptions = showLevelUpOptions;

function selectUpgrade(upgrade) {
    const currentLevel = player.upgradeLevels[upgrade.id] || 0;
    player.upgradeLevels[upgrade.id] = currentLevel + 1;
    upgrade.apply(player);
    hudElements.levelUpWindow.classList.remove('visible');
    gameState.isRunning = true; // Resume game after level-up
    gameState.lastTime = performance.now(); // Reset lastTime to avoid huge deltaTime spike after pause
    
    gameState.levelUpTimerActive = false;
    gameState.availableLevelUpOptions = [];
    updateHUD();
}

export {
    gameState, keys, joystick, world, camera, enemies, projectiles, xpOrbs, particles,
    damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems,
    safeHouse,
    screenFlash, screenRedFlash, screenShake, UPGRADE_POOL,
    // Export utility functions for other modules if needed by them
    triggerScreenShake, createImpactParticles, spawnDamageNumber
};
