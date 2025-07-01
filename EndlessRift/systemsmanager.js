import { player, initPlayer, loadPlayer, updatePlayer, takeDamage, gainXP } from './player.js';
import { enemyPath, spawnEnemy, updateEnemies } from './enemies.js';
import { fireProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber } from './attacks_skills.js';
import { initRift, expandWorld, getBackgroundCanvas } from './rift.js';

// --- Firebase Variables (Declared but not initialized) ---
let auth, firestore, googleProvider, currentUser;

// --- Firebase Config (This is safe to define here) ---
const firebaseConfig = {
    apiKey: "AIzaSyAvutjrwWBsZ_5bCPN-nbL3VpP2NQ94EUY",
    authDomain: "tap-guardian-rpg.firebaseapp.com",
    projectId: "tap-guardian-rpg",
    storageBucket: "tap-guardian-rpg.firebasestorage.app",
    messagingSenderId: "50272459426",
    appId: "1:50272459426:web:8f67f9126d3bc3a23a15fb",
    measurementId: "G-XJRE7YNPZR"
};

// --- Global State ---
let gameState = { isRunning: false, isAutoMode: false, gameTime: 0, lastTime: 0, enemySpawnTimer: 0, enemySpawnInterval: 1500, saveIntervalId: null, animationFrameId: null };
let enemies = [], projectiles = [], xpOrbs = [], particles = [], damageNumbers = [], lightningBolts = [], volcanicEruptions = [], visualEffects = [], skillTotems = [];
let world = { width: 3000, height: 2000 };
let safeHouse = {};
let camera = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
let screenFlash = { value: 0 };
let screenRedFlash = { value: 0 };

// --- DOM and Canvas ---
let canvas, ctx, hudElements, menuElements;
const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 };

// --- Upgrade Pool (Unchanged) ---
const UPGRADE_POOL = [ { id: "might", title: "Might", maxLevel: 5, description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } }, { id: "haste", title: "Haste", maxLevel: 5, description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } }, { id: "vitality", title: "Vitality", description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } }, { id: "recovery", title: "Recovery", maxLevel: 3, description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } }, { id: "agility", title: "Agility", maxLevel: 3, description: (level) => `Increase movement speed. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } }, { id: "multishot", title: "Multi-Shot", maxLevel: 4, description: (level) => `Fire ${level + 2} total projectiles.`, apply: (p) => { p.weapon.count += 1; } }, { id: "impact", title: "Greater Impact", maxLevel: 3, description: (level) => `Increase projectile size. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; } }, { id: "pierce", title: "Piercing Shots", maxLevel: 3, description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } }, { id: "wisdom", title: "Wisdom", maxLevel: 3, description: (level) => `Gain ${20 * (level + 1)}% more XP. (Lvl ${level + 1})`, apply: (p) => { p.xpGainModifier += 0.20; } }, { id: "greed", title: "Greed", maxLevel: 3, description: (level) => `Increase XP pickup radius. (Lvl ${level + 1})`, apply: (p) => { p.pickupRadius += 75; } }, { id: "lethality", title: "Lethality", maxLevel: 5, description: (level) => `+10% chance to deal double damage. (Lvl ${level + 1})`, apply: (p) => { p.weapon.critChance += 0.1; } }, { id: "soul_vortex", title: "Soul Vortex", maxLevel: 1, description: (level) => `Gain an orbiting soul that damages enemies.`, apply: (p) => { p.abilities.orbitingShield.enabled = true; } }, { id: "rear_guard", title: "Rear Guard", maxLevel: 1, description: (level) => `Fire a projectile behind you.`, apply: (p) => { p.abilities.backShot = true; } }, { id: "crossfire", title: "Crossfire", maxLevel: 1, description: (level) => `Fire projectiles diagonally.`, apply: (p) => { p.abilities.diagonalShot = true; } }, { id: "soul_nova", title: "Soul Nova", maxLevel: 1, description: (level) => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; triggerNova(p, 50, 200); } }, { id: "volcano_damage", title: "Magma Core", maxLevel: 5, skill: "volcano", description: (level) => `Increase eruption damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.damage += 10; } }, { id: "volcano_radius", title: "Wide Eruption", maxLevel: 3, skill: "volcano", description: (level) => `Increase eruption radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.radius *= 1.2; } }, { id: "volcano_cooldown", title: "Frequent Fissures", maxLevel: 3, skill: "volcano", description: (level) => `Eruptions occur more frequently. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.cooldown *= 0.8; } }, { id: "lightning_chains", title: "Chain Lightning", maxLevel: 4, skill: "lightning", description: (level) => `Lightning chains to ${level + 2} enemies.`, apply: (p) => { p.skills.lightning.chains += 1; } }, { id: "lightning_damage", title: "High Voltage", maxLevel: 5, skill: "lightning", description: (level) => `Increase lightning damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.damage += 5; } }, { id: "lightning_shock", title: "Static Field", maxLevel: 3, skill: "lightning", description: (level) => `Lightning shocks enemies, dealing damage over time. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.shockDuration += 1000; } }, ];

// --- INITIALIZATION ---
// ** CORE FIX: This function will be called from index.html after Firebase is loaded **
export function initializeApp() {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();

    // Select all DOM elements
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    menuElements = {
        mainMenu: document.getElementById('main-menu'),
        newGameBtn: document.getElementById('newGameBtn'),
        loadOptionsContainer: document.getElementById('load-options-container'),
        googleSignInBtn: document.getElementById('googleSignInBtn'),
        userStatus: document.getElementById('userStatus'),
        userDisplay: document.getElementById('user-display'),
        userName: document.getElementById('userName'),
        signOutBtn: document.getElementById('signOutBtn'),
    };
    hudElements = { 
        gameContainer: document.getElementById('game-container'),
        level: document.getElementById('level-text'), hp: document.getElementById('hp-text'), hpFill: document.getElementById('hp-bar-fill'), xpFill: document.getElementById('xp-bar-fill'), timer: document.getElementById('timer-text'), xpBottomFill: document.getElementById('xp-bar-bottom-fill'), finalTime: document.getElementById('final-time-text'), finalLevel: document.getElementById('final-level-text'), levelUpWindow: document.getElementById('level-up-window'), upgradeOptions: document.getElementById('upgrade-options'), gameOverScreen: document.getElementById('game-over-screen'), restartButton: document.getElementById('restart-button'), killCounter: document.getElementById('kill-counter-text'), finalKills: document.getElementById('final-kills-text'), autoModeButton: document.getElementById('auto-mode-button'), 
    };
    
    // Setup initial state and listeners
    initRift();
    setupEventListeners();
    checkSaveStates();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        camera.width = canvas.width;
        camera.height = canvas.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getTouchPos(touchEvent) { const rect = canvas.getBoundingClientRect(); return { x: touchEvent.touches[0].clientX - rect.left, y: touchEvent.touches[0].clientY - rect.top }; }
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (!gameState.isRunning || gameState.isAutoMode) return; const pos = getTouchPos(e); joystick.active = true; joystick.baseX = pos.x; joystick.baseY = pos.y; joystick.handleX = pos.x; joystick.handleY = pos.y; }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!joystick.active) return; const pos = getTouchPos(e); const dx = pos.x - joystick.baseX; const dy = pos.y - joystick.baseY; const dist = Math.hypot(dx, dy); if (dist > joystick.radius) { joystick.handleX = joystick.baseX + (dx / dist) * joystick.radius; joystick.handleY = joystick.baseY + (dy / dist) * joystick.radius; } else { joystick.handleX = pos.x; joystick.handleY = pos.y; } }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); joystick.active = false; }, { passive: false });
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
    
    // Menu and Auth Buttons
    menuElements.newGameBtn.addEventListener('click', () => startGame(true));
    menuElements.googleSignInBtn.addEventListener('click', signInWithGoogle);
    menuElements.signOutBtn.addEventListener('click', () => auth.signOut());
    
    // In-Game Buttons
    hudElements.restartButton.addEventListener('click', () => {
        hudElements.gameOverScreen.classList.remove('visible');
        menuElements.mainMenu.classList.add('visible');
        hudElements.gameContainer.style.visibility = 'hidden';
        checkSaveStates();
    });
    hudElements.autoModeButton.addEventListener('click', () => { gameState.isAutoMode = !gameState.isAutoMode; hudElements.autoModeButton.textContent = gameState.isAutoMode ? 'AUTO ON' : 'AUTO OFF'; hudElements.autoModeButton.classList.toggle('auto-on', gameState.isAutoMode); });

    // Firebase Auth Listener
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            menuElements.userStatus.textContent = `Signed in as ${user.displayName}.`;
            menuElements.googleSignInBtn.style.display = 'none';
            menuElements.userDisplay.style.display = 'block';
            menuElements.userName.textContent = user.displayName;
        } else {
            menuElements.userStatus.textContent = 'Sign in for cloud saves.';
            menuElements.googleSignInBtn.style.display = 'flex';
            menuElements.userDisplay.style.display = 'none';
        }
        checkSaveStates();
    });
}

// --- AUTH & SAVE/LOAD ---
function signInWithGoogle() {
    auth.signInWithPopup(googleProvider).catch(error => {
        console.error("Google Sign-In Error:", error);
        alert("Could not sign in with Google. Please try again.");
    });
}

async function checkSaveStates() {
    const localSaveExists = !!localStorage.getItem('survivorSaveData');
    let cloudSaveExists = false;

    if (currentUser) {
        const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
        const doc = await saveRef.get().catch(e => console.error(e));
        if (doc && doc.exists) {
            cloudSaveExists = true;
        }
    }

    menuElements.loadOptionsContainer.innerHTML = ''; // Clear previous buttons

    if (cloudSaveExists) {
        const cloudBtn = document.createElement('button');
        cloudBtn.id = 'loadCloudBtn';
        cloudBtn.className = 'menu-button';
        cloudBtn.textContent = 'Load Cloud Save';
        cloudBtn.onclick = () => startGame(false, 'cloud');
        menuElements.loadOptionsContainer.appendChild(cloudBtn);
    }
    
    if (localSaveExists) {
        const localBtn = document.createElement('button');
        localBtn.id = 'loadLocalBtn';
        localBtn.className = 'menu-button';
        localBtn.textContent = 'Load Local Save';
        localBtn.onclick = () => startGame(false, 'local');
        menuElements.loadOptionsContainer.appendChild(localBtn);
    }

    if (!cloudSaveExists && !localSaveExists) {
        const noSaveBtn = document.createElement('button');
        noSaveBtn.id = 'loadGameBtn';
        noSaveBtn.className = 'menu-button';
        noSaveBtn.textContent = 'No Save Found';
        noSaveBtn.disabled = true;
        menuElements.loadOptionsContainer.appendChild(noSaveBtn);
    }
}

async function saveGame() {
    if (!player || !gameState.isRunning) return;
    // Create a clean savable object from the player proxy
    const savablePlayer = JSON.parse(JSON.stringify(player));
    const saveData = {
        player: savablePlayer,
        gameTime: gameState.gameTime,
        skillTotems: skillTotems,
        world: world,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (currentUser) {
        const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
        try {
            await saveRef.set(saveData);
        } catch (error) {
            console.error("Error saving to cloud:", error);
        }
    }
    
    localStorage.setItem('survivorSaveData', JSON.stringify(saveData));
}

async function loadGame(source) {
    let savedData = null;
    try {
        if (source === 'cloud' && currentUser) {
            const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
            const doc = await saveRef.get();
            if (doc.exists) {
                savedData = doc.data();
                console.log("Game loaded from cloud.");
            }
        } else if (source === 'local') {
            const localData = localStorage.getItem('survivorSaveData');
            if (localData) savedData = JSON.parse(localData);
            console.log("Game loaded locally.");
        }
    } catch(error) {
        console.error("Error loading game:", error);
        return false;
    }
    
    if (savedData) {
        loadPlayer(savedData.player);
        gameState.gameTime = savedData.gameTime;
        skillTotems = savedData.skillTotems || [];
        if (savedData.world) {
            world.width = savedData.world.width;
            world.height = savedData.world.height;
        }
        return true;
    }
    return false;
}

function clearSave() {
    localStorage.removeItem('survivorSaveData');
    if (currentUser) {
        firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default').delete().catch(e => console.error("Error clearing cloud save:", e));
    }
}

// --- GAME LIFECYCLE ---
async function startGame(forceNew, loadSource = 'cloud') {
    menuElements.mainMenu.classList.remove('visible');
    hudElements.gameContainer.style.visibility = 'visible';
    
    gameState.isAutoMode = false;
    if (gameState.saveIntervalId) clearInterval(gameState.saveIntervalId);

    let loadedSuccessfully = false;
    if (!forceNew) {
        // Prioritize cloud save if logged in and that's the source
        const sourceToLoad = currentUser ? loadSource : 'local';
        loadedSuccessfully = await loadGame(sourceToLoad);
    }
    
    if (forceNew || !loadedSuccessfully) {
        clearSave();
        world.width = 3000; world.height = 2000;
        initPlayer(world);
        gameState.gameTime = 0;
        skillTotems = [ { x: world.width / 2 - 200, y: world.height / 2 - 200, radius: 30, skill: 'lightning', color: 'var(--lightning-color)', icon: '⚡' }, { x: world.width / 2 + 200, y: world.height / 2 + 200, radius: 30, skill: 'volcano', color: 'var(--volcano-color)', icon: '🔥' } ];
    }
    
    initRift();
    
    gameState.lastTime = performance.now();
    gameState.enemySpawnTimer = 0;
    gameState.enemySpawnInterval = Math.max(100, 1500 * Math.pow(0.985, gameState.gameTime / 1000));
    enemies.length = 0; projectiles.length = 0; xpOrbs.length = 0; particles.length = 0; damageNumbers.length = 0; lightningBolts.length = 0; volcanicEruptions.length = 0; visualEffects.length = 0;
    safeHouse = { x: world.width / 2, y: world.height / 2, radius: 150, healingRate: 10 };
    
    hudElements.levelUpWindow.classList.remove('visible');
    hudElements.gameOverScreen.classList.remove('visible');
    hudElements.autoModeButton.textContent = 'AUTO OFF';
    hudElements.autoModeButton.classList.remove('auto-on');
    gameState.isRunning = true;
    gameState.saveIntervalId = setInterval(saveGame, 10000);
    
    if (gameState.animationFrameId) cancelAnimationFrame(gameState.animationFrameId);
    gameLoop(performance.now());
}

function gameOver() {
    gameState.isRunning = false;
    clearInterval(gameState.saveIntervalId);
    gameState.saveIntervalId = null;
    cancelAnimationFrame(gameState.animationFrameId);
    hudElements.finalTime.textContent = formatTime(gameState.gameTime);
    hudElements.finalLevel.textContent = player.level;
    hudElements.finalKills.textContent = player.kills;
    hudElements.gameOverScreen.classList.add('visible');
}

// ... The rest of the file is unchanged ...
// gameLoop, update, draw, handleCollisions, etc.
// ... (All remaining functions are the same as before)
// ...

function gameLoop(timestamp) { if (!gameState.isRunning) return; const deltaTime = timestamp - gameState.lastTime; gameState.lastTime = timestamp; gameState.gameTime += deltaTime; update(deltaTime); draw(); gameState.animationFrameId = requestAnimationFrame(gameLoop); }
function update(deltaTime) { let dx = 0, dy = 0; if (gameState.isAutoMode) { const aiVector = getAiMovementVector(); dx = aiVector.x; dy = aiVector.y; } else if (joystick.active) { dx = joystick.handleX - joystick.baseX; dy = joystick.handleY - joystick.baseY; } else { dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0); dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0); } const { closestEnemy, closestDist } = updatePlayer(deltaTime, world, gameState, enemies, { dx, dy }); if (closestEnemy && gameState.gameTime - (player.lastFireTime || 0) > player.weapon.cooldown) { fireProjectile(player); player.lastFireTime = gameState.gameTime; } camera.x = player.x - camera.width / 2; camera.y = player.y - camera.height / 2; camera.x = Math.max(0, Math.min(world.width - camera.width, camera.x)); camera.y = Math.max(0, Math.min(world.height - camera.height, camera.y)); if (Math.hypot(player.x - safeHouse.x, player.y - safeHouse.y) < safeHouse.radius) { player.health = Math.min(player.maxHealth, player.health + safeHouse.healingRate * (deltaTime / 1000)); } gameState.enemySpawnTimer += deltaTime; if (gameState.enemySpawnTimer > gameState.enemySpawnInterval) { spawnEnemy(enemies); gameState.enemySpawnTimer = 0; gameState.enemySpawnInterval = Math.max(100, gameState.enemySpawnInterval * 0.985); } const gainXPCallback = (amount) => gainXP(amount, showLevelUpOptions, () => expandWorld(camera, player), triggerNova, camera); updateEnemies(deltaTime, enemies, player, showLevelUpOptions, gainXPCallback); for (let i = skillTotems.length - 1; i >= 0; i--) { const totem = skillTotems[i]; if (Math.hypot(player.x - totem.x, player.y - totem.y) < player.size + totem.radius) { player.skills[totem.skill].isUnlocked = true; skillTotems.splice(i, 1); } } updateLightning(deltaTime, player); updateVolcano(deltaTime, player); const updateEntityArray = (arr, dt, extra) => { for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].update(dt, extra)) arr.splice(i, 1); } }; updateEntityArray(projectiles, deltaTime); updateEntityArray(xpOrbs, deltaTime, closestDist); updateEntityArray(particles, deltaTime); updateEntityArray(damageNumbers, deltaTime); updateEntityArray(lightningBolts, deltaTime); updateEntityArray(volcanicEruptions, deltaTime); updateEntityArray(visualEffects, deltaTime); handleCollisions(); }
function handleCollisions() { projectiles.forEach(p => { if (p.pierce < p.hitEnemies.length) return; enemies.forEach(e => { if (p.hitEnemies.includes(e)) return; if (Math.hypot(e.x - p.x, e.y - p.y) < 20) { const isCrit = Math.random() < p.critChance; const damage = isCrit ? p.damage * 2 : p.damage; e.health -= damage; p.hitEnemies.push(e); createImpactParticles(e.x, e.y, 10); spawnDamageNumber(e.x, e.y, Math.round(damage), isCrit); } }); }); enemies.forEach(e => { if (Math.hypot(e.x - player.x, e.y - player.y) < 20) { takeDamage(10, gameState, screenRedFlash, gameOver); e.health = -1; } }); const shield = player.abilities.orbitingShield; if (shield.enabled) { shield.angle += 0.05; if (gameState.gameTime - shield.lastHit > shield.cooldown) { const shieldX = player.x + Math.cos(shield.angle) * shield.distance; const shieldY = player.y + Math.sin(shield.angle) * shield.distance; enemies.forEach(e => { if (Math.hypot(e.x - shieldX, e.y - shieldY) < 30) { e.health -= shield.damage; spawnDamageNumber(e.x, e.y, shield.damage, false); shield.lastHit = gameState.gameTime; } }); } } }
function draw() { if(!gameState.isRunning && !hudElements.gameOverScreen.classList.contains('visible')) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(-camera.x, -camera.y); ctx.drawImage(getBackgroundCanvas(), 0, 0); drawWorldElements(); projectiles.forEach(p => drawProjectile(p)); enemies.forEach(e => drawEnemy(e)); const playerBlink = (gameState.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0; if (!playerBlink) drawPlayer(player, player.angle); drawParticlesAndEffects(); ctx.restore(); if (screenRedFlash.value > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${screenRedFlash.value * 0.4})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenRedFlash.value -= 0.04; } if (screenFlash.value > 0) { ctx.fillStyle = `rgba(200, 225, 255, ${screenFlash.value})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenFlash.value -= 0.05; } if (joystick.active && !gameState.isAutoMode) drawJoystick(); updateHUD(); }
function drawWorldElements() { ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = 'var(--safe-house-fill)'; ctx.beginPath(); ctx.arc(safeHouse.x, safeHouse.y, safeHouse.radius, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.5; ctx.strokeStyle = 'var(--safe-house-stroke)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); skillTotems.forEach(totem => drawSkillTotem(totem)); lightningBolts.forEach(bolt => drawLightningBolt(bolt)); volcanicEruptions.forEach(v => drawVolcano(v)); xpOrbs.forEach(orb => drawXpOrb(orb)); }
function drawParticlesAndEffects() { visualEffects.forEach(effect => { if (effect.type === 'shockwave') { ctx.save(); const lifePercent = effect.life / 400; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255, 255, 255, ${lifePercent * 0.8})`; ctx.lineWidth = 15 * lifePercent; ctx.stroke(); ctx.restore(); } else if (effect.type === 'world_expansion') { ctx.save(); const lifePercent = effect.life / 1000; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.strokeStyle = `rgba(150, 255, 150, ${lifePercent * 0.9})`; ctx.lineWidth = 20 * lifePercent; ctx.stroke(); ctx.restore(); } }); particles.forEach(p => { if (p.type === 'ember') { ctx.fillStyle = `rgba(255, 165, 0, ${p.alpha})`; } else if (p.type === 'nova') { ctx.fillStyle = `rgba(220, 180, 255, ${p.alpha})`; } else if (p.type === 'lightning') { ctx.fillStyle = `rgba(157, 255, 255, ${p.alpha})`; } else { ctx.fillStyle = `rgba(255, 255, 224, ${p.alpha})`; } ctx.beginPath(); ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2); ctx.fill(); }); damageNumbers.forEach(dn => drawDamageNumber(dn)); const shield = player.abilities.orbitingShield; if (shield.enabled) { const pulse = Math.sin(gameState.gameTime / 150); const shieldX = player.x + Math.cos(shield.angle) * shield.distance; const shieldY = player.y + Math.sin(shield.angle) * shield.distance; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(220, 120, 255, ${0.4 + pulse * 0.2})`; ctx.shadowColor = 'rgba(220, 120, 255, 1)'; ctx.shadowBlur = 20 + pulse * 10; ctx.beginPath(); ctx.arc(shieldX, shieldY, 15 + pulse * 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); if (Math.random() > 0.5) { particles.push({ x: shieldX, y: shieldY, life: 200, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, alpha: 1, type: 'nova', size: Math.random() * 2, update(dt) { this.x += this.vx; this.y += this.vy; this.life -= dt; this.alpha = this.life / 200; return this.life <= 0; } }); } } }
function drawPlayer(p, angle) { const bob = Math.sin(gameState.gameTime / 250) * 2; ctx.save(); ctx.translate(p.x, p.y + bob); const hoverPulse = Math.sin(gameState.gameTime / 400); ctx.beginPath(); ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.2 + hoverPulse * 0.1; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; ctx.save(); ctx.rotate(angle); const auraPulse = Math.sin(gameState.gameTime / 200); ctx.beginPath(); ctx.arc(0, 0, 30, -1.9, 1.9); ctx.strokeStyle = 'var(--player-aura-color)'; ctx.lineWidth = 4 + auraPulse * 2; ctx.shadowColor = 'var(--player-aura-color)'; ctx.shadowBlur = 15 + auraPulse * 10; ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(8, 15); ctx.lineTo(0, 10); ctx.lineTo(-8, 15); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(-5, -15, 10, 10); ctx.restore(); ctx.restore(); }
function drawEnemy(e) { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2); ctx.fillStyle = 'var(--enemy-color)'; ctx.fill(enemyPath); ctx.strokeStyle = 'var(--enemy-accent-color)'; ctx.lineWidth = 1.5; ctx.stroke(enemyPath); ctx.restore(); }
function drawProjectile(p) { if (p.trail.length < 2) return; ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = 'var(--projectile-color)'; ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y); for (let i = 1; i < p.trail.length; i++) { const point = p.trail[i]; ctx.lineWidth = (i / p.trail.length) * p.size.w * 1.5; ctx.lineTo(point.x, point.y); } ctx.stroke(); ctx.restore(); }
function drawXpOrb(o) { ctx.beginPath(); ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2); ctx.fillStyle = 'var(--xp-orb-color)'; ctx.shadowColor = 'var(--xp-orb-color)'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0; }
function drawJoystick() { ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(128,128,128,0.3)'; ctx.fill(); ctx.beginPath(); ctx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
function drawDamageNumber(dn) { ctx.save(); ctx.translate(dn.x, dn.y); ctx.globalAlpha = dn.alpha; ctx.fillStyle = dn.isCrit ? 'yellow' : 'var(--damage-text-color)'; ctx.font = dn.isCrit ? 'bold 24px Roboto' : 'bold 18px Roboto'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(dn.value, 0, 0); ctx.restore(); }
function drawLightningBolt(bolt) { ctx.save(); ctx.globalAlpha = Math.min(1, bolt.life / 100); ctx.strokeStyle = 'var(--lightning-color)'; ctx.lineWidth = 3; ctx.shadowColor = 'var(--lightning-color)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(bolt.start.x, bolt.start.y); const segments = 10; for (let i = 1; i <= segments; i++) { const t = i / segments; const x = bolt.start.x * (1 - t) + bolt.end.x * t; const y = bolt.start.y * (1 - t) + bolt.end.y * t; if (i < segments) { ctx.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20); } else { ctx.lineTo(x, y); } } ctx.stroke(); ctx.restore(); }
function drawVolcano(v) { ctx.save(); const lifePercent = v.life / v.burnDuration; ctx.globalAlpha = lifePercent * 0.7; ctx.fillStyle = 'var(--volcano-color)'; ctx.beginPath(); ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawSkillTotem(totem) { ctx.save(); ctx.translate(totem.x, totem.y); ctx.globalAlpha = 0.8 + Math.sin(gameState.gameTime / 200) * 0.2; ctx.beginPath(); ctx.arc(0, 0, totem.radius, 0, Math.PI * 2); ctx.fillStyle = totem.color; ctx.shadowColor = totem.color; ctx.shadowBlur = 20; ctx.fill(); ctx.font = '24px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(totem.icon, 0, 0); ctx.restore(); }
function updateHUD() { hudElements.level.textContent = `LV ${player.level}`; hudElements.hp.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`; hudElements.hpFill.style.width = `${(player.health / player.maxHealth) * 100}%`; hudElements.timer.textContent = formatTime(gameState.gameTime); hudElements.xpBottomFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`; hudElements.killCounter.textContent = player.kills; }
function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function showLevelUpOptions() { gameState.isRunning = false; hudElements.xpFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`; const availablePool = UPGRADE_POOL.filter(upgrade => { const currentLevel = player.upgradeLevels[upgrade.id] || 0; const maxLevel = upgrade.maxLevel || Infinity; if (currentLevel >= maxLevel) return false; if (upgrade.skill === 'lightning' && !player.skills.lightning.isUnlocked) return false; if (upgrade.skill === 'volcano' && !player.skills.volcano.isUnlocked) return false; return true; }); const choices = availablePool.sort(() => 0.5 - Math.random()).slice(0, 3); hudElements.upgradeOptions.innerHTML = ''; choices.forEach(upgrade => { const currentLevel = player.upgradeLevels[upgrade.id] || 0; const card = document.createElement('div'); card.className = 'upgrade-card'; card.innerHTML = `<h3>${upgrade.title}</h3><p>${upgrade.description(currentLevel)}</p>`; card.onclick = () => selectUpgrade(upgrade); hudElements.upgradeOptions.appendChild(card); }); hudElements.levelUpWindow.classList.add('visible'); }
window.showLevelUpOptions = showLevelUpOptions;
function selectUpgrade(upgrade) { const currentLevel = player.upgradeLevels[upgrade.id] || 0; player.upgradeLevels[upgrade.id] = currentLevel + 1; upgrade.apply(player); hudElements.levelUpWindow.classList.remove('visible'); gameState.isRunning = true; gameState.lastTime = performance.now(); requestAnimationFrame(gameLoop); }
export { gameState, keys, joystick, world, camera, enemies, projectiles, xpOrbs, particles, damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems, safeHouse, screenFlash, screenRedFlash, UPGRADE_POOL };
