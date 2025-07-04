import { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage as playerTakeDamage } from './player.js';
import { enemyPath, spawnEnemy, updateEnemies } from './enemies.js';
import { fireProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber, updateFrostNova, updateBlackHole, createXpOrb } from './attacks_skills.js';
import { initRift, expandWorld, getBackgroundCanvas, seededRandom } from './rift.js';

// --- Firebase Variables (Declared but not initialized) ---
let auth, firestore, database, googleProvider, currentUser;

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyAvutjrwWBsZ_5bCPN-nbL3VpP2NQ94EUY",
    authDomain: "tap-guardian-rpg.firebaseapp.com",
    projectId: "tap-guardian-rpg",
    databaseURL: "https://tap-guardian-rpg-default-rtdb.firebaseio.com",
    storageBucket: "tap-guardian-rg.firebaseapp.com",
    messagingSenderId: "50272459426",
    appId: "1:50272459426:web:8f67f9126d3bc3a23a15fb",
    measurementId: "G-XJRE7YNPZR"
};

// NEW: Define the SafeHouse class
class SafeHouse {
    constructor(gameWorldWidth, gameWorldHeight) {
        this.gameWorldWidth = gameWorldWidth;
        this.gameWorldHeight = gameWorldHeight;
        this.initialRadius = 250;
        this.minRadius = 80;
        this.shrinkRate = 2;
        this.respawnTime = 5;

        this.x = 0;
        this.y = 0;
        this.radius = this.initialRadius;
        this.active = false;
        this.respawnTimer = 0;
        this.healingRate = 10;
        this.damageRate = 10;

        this.color = 'rgba(0, 255, 0, 0.2)';
        this.borderColor = 'rgba(0, 255, 0, 0.8)';

        this.spawn();
    }

    spawn() {
        this.radius = this.initialRadius;
        this.x = seededRandom() * (this.gameWorldWidth - this.initialRadius * 2) + this.initialRadius;
        this.y = seededRandom() * (this.gameWorldHeight - this.initialRadius * 2) + this.initialRadius;
        this.active = true;
        this.respawnTimer = 0;
        console.log(`Safe House spawned at (${this.x.toFixed(0)}, ${this.y.toFixed(0)}) with radius ${this.radius.toFixed(0)}`);
    }

    update(deltaTime) {
        const dtSeconds = deltaTime / 1000;
        if (this.active) {
            this.radius -= this.shrinkRate * dtSeconds;
            if (this.radius <= this.minRadius) {
                this.active = false;
                this.respawnTimer = this.respawnTime;
                console.log("Safe House disappeared! Respawning in " + this.respawnTime + " seconds.");
            }
        } else {
            this.respawnTimer -= dtSeconds;
            if (this.respawnTimer <= 0) {
                this.spawn();
            }
        }
    }

    draw(context, camera) {
        if (this.active) {
            context.save();
            context.beginPath();
            context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            context.fillStyle = this.color;
            context.fill();
            context.strokeStyle = this.borderColor;
            context.lineWidth = 3;
            context.stroke();
            context.restore();

            context.save();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '20px Arial';
            context.fillStyle = 'white';
            context.fillText('SAFE ZONE', this.x, this.y - this.radius - 20);
            context.restore();

        } else {
            context.save();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '30px Arial';
            context.fillStyle = 'red';
            context.fillText('FIND NEW SAFE ZONE!', camera.x + camera.width / 2, camera.y + camera.height / 2 - 50);
            context.font = '20px Arial';
            context.fillText(`Respawning in: ${this.respawnTimer.toFixed(1)}s`, camera.x + camera.width / 2, camera.y + camera.height / 2);
            context.restore();
        }
    }

    isInside(object) {
        if (!this.active) return false;
        const distanceX = object.x - this.x;
        const distanceY = object.y - this.y;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        const objectSize = object.size || object.width || 0;
        return distance < (this.radius - objectSize / 2);
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            radius: this.radius,
            active: this.active,
            respawnTimer: this.respawnTimer,
            healingRate: this.healingRate,
            damageRate: this.damageRate
        };
    }
}


// --- Global State ---
let gameState = { isRunning: false, isAutoMode: false, gameTime: 0, lastTime: 0, enemySpawnTimer: 0, enemySpawnInterval: 1500, saveIntervalId: null, animationFrameId: null, isHost: false, worldSeed: 0 };
let enemies = [], projectiles = [], xpOrbs = [], particles = [], damageNumbers = [], lightningBolts = [], volcanicEruptions = [], visualEffects = [], skillTotems = [];
let world = { width: 3000, height: 2000 };

let safeHouseInstance;

let camera = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
let screenFlash = { value: 0 };
let screenRedFlash = { value: 0 };

const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 };

let canvas, ctx, hudElements, menuElements;

let otherPlayers = new Map();
const MAX_PLAYERS = 100;
const WORLD_REF = (worldId = 'main') => database.ref(`worlds/${worldId}`);
const WORLD_STATE_REF = (worldId = 'main') => WORLD_REF(worldId).child('state');
const WORLD_ENEMIES_REF = (worldId = 'main') => WORLD_REF(worldId).child('enemies');
const WORLD_XP_ORBS_REF = (worldId = 'main') => WORLD_REF(worldId).child('xpOrbs');
const WORLD_SKILL_TOTEMS_REF = (worldId = 'main') => WORLD_REF(worldId).child('skillTotems');
const PLAYERS_REF = (worldId = 'main') => database.ref(`worlds/${worldId}/playersOnline`);

// --- Firebase Realtime Database Listeners ---
let worldStateListener = null;
let onlinePlayersListener = null;
let enemiesListener = null;
let xpOrbsListener = null;
let skillTotemsListener = null;

const VALID_UNLOCKABLE_SKILLS = ['lightning', 'volcano', 'frostNova', 'blackHole'];

// --- UPGRADE POOL (truncated for brevity) ---
const UPGRADE_POOL = [
    { id: "might", title: "Might", maxLevel: 5, description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } },
    { id: "haste", title: "Haste", maxLevel: 5, description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } },
    { id: "multishot", title: "Multi-Shot", maxLevel: 4, description: (level) => `Fire ${level + 2} total projectiles.`, apply: (p) => { p.weapon.count += 1; } },
    { id: "impact", title: "Greater Impact", maxLevel: 3, description: (level) => `Increase projectile size by 25%. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; } },
    { id: "pierce", title: "Piercing Shots", maxLevel: 3, description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } },
    { id: "velocity", title: "Velocity", maxLevel: 5, description: (level) => `Projectiles travel 20% faster. (Lvl ${level+1})`, apply: (p) => { p.weapon.speed *= 1.20; } },
    { id: "vitality", title: "Vitality", description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } },
    { id: "recovery", title: "Recovery", maxLevel: 3, description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } },
    { id: "agility", title: "Agility", maxLevel: 3, description: (level) => `Increase movement speed by 10%. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } }
    ,{ id: "armor", title: "Armor", maxLevel: 5, description: (level) => `Reduce incoming damage by 1. (Lvl ${level+1})`, apply: (p) => { p.armor += 1; } },
    { id: "dodge", title: "Evasion", maxLevel: 4, description: (level) => `+5% chance to dodge attacks. (Lvl ${level+1})`, apply: (p) => { p.dodgeChance += 0.05; } },
    { id: "wisdom", title: "Wisdom", maxLevel: 3, description: (level) => `Gain ${20 * (level + 1)}% more XP. (Lvl ${level + 1})`, apply: (p) => { p.xpGainModifier += 0.20; } },
    { id: "greed", title: "Greed", maxLevel: 3, description: (level) => `Increase XP pickup radius by 50%. (Lvl ${level + 1})`, apply: (p) => { p.pickupRadius *= 1.50; } },
    { id: "magnetism", title: "Magnetism", maxLevel: 4, description: (level) => `XP orbs are pulled towards you faster. (Lvl ${level+1})`, apply: (p) => { p.magnetism *= 1.5; } },
    { id: "rejuvenation", title: "Rejuvenation", maxLevel: 1, description: () => `Picking up an XP orb has a 10% chance to heal 1 HP.`, apply: (p) => { p.abilities.healOnXp = true; } },
    { id: "lethality", title: "Lethality", maxLevel: 5, description: (level) => `+10% chance to deal double damage. (Lvl ${level + 1})`, apply: (p) => { p.weapon.critChance += 0.1; } },
    { id: "overwhelm", title: "Overwhelm", maxLevel: 5, description: (level) => `Critical hits do +50% more damage. (Lvl ${level+1})`, apply: (p) => { p.weapon.critDamage += 0.5; } },
    { id: "crit_explosion", title: "Critical Mass", maxLevel: 1, description: () => `Critical hits cause a small explosion.`, apply: (p) => { p.abilities.critExplosion = true; } },
    { id: "soul_vortex", title: "Soul Vortex", maxLevel: 1, description: () => `Gain an orbiting soul that damages enemies.`, apply: (p) => { p.abilities.orbitingShield.enabled = true; } },
    { id: "rear_guard", title: "Rear Guard", maxLevel: 1, description: () => `Fire a projectile behind you.`, apply: (p) => { p.abilities.backShot = true; } },
    { id: "crossfire", title: "Crossfire", maxLevel: 1, description: () => `Fire projectiles diagonally.`, apply: (p) => { p.abilities.diagonalShot = true; } },
    { id: "soul_nova", title: "Soul Nova", maxLevel: 1, description: () => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; triggerNova(player, 50, 200); } },
    { id: "thorns", title: "Thorns", maxLevel: 3, description: (level) => `Enemies that hit you take ${5 * (level+1)} damage.`, apply: (p) => { p.thorns += 5; } },
    { id: "life_steal", title: "Life Steal", maxLevel: 3, description: (level) => `Heal for ${level+1} HP on kill.`, apply: (p) => { p.lifeSteal += 1; } },
    { id: "demolition", title: "Demolition", maxLevel: 1, description: () => `Projectiles explode on their first hit.`, apply: (p) => { p.weapon.explodesOnImpact = true; } },
    { id: "vortex_damage", title: "Vortex: Sharpen", maxLevel: 5, skill: "soul_vortex", description: (level) => `Soul Vortex deals +5 damage. (Lvl ${level + 1})`, apply: (p) => { p.abilities.orbitingShield.damage += 5; } },
    { id: "vortex_speed", title: "Vortex: Accelerate", maxLevel: 3, skill: "soul_vortex", description: (level) => `Soul Vortex orbits faster. (Lvl ${level+1})`, apply: (p) => { p.abilities.orbitingShield.speed = (p.abilities.orbitingShield.speed || 1) * 1.25; } },
    { id: "vortex_twin", title: "Vortex: Twin Souls", maxLevel: 1, skill: "soul_vortex", description: () => `Gain a second orbiting soul.`, apply: (p) => { p.abilities.orbitingShield.count = 2; } },
    { id: "lightning_damage", title: "Lightning: High Voltage", maxLevel: 5, skill: "lightning", description: (level) => `Increase lightning damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.damage += 5; } },
    { id: "lightning_chains", title: "Lightning: Chain Lightning", maxLevel: 4, skill: "lightning", description: (level) => `Lightning chains to ${level + 2} enemies.`, apply: (p) => { p.skills.lightning.chains += 1; } },
    { id: "lightning_cooldown", title: "Lightning: Storm Caller", maxLevel: 3, skill: "lightning", description: () => `Lightning strikes more frequently.`, apply: (p) => { p.skills.lightning.cooldown *= 0.8; } },
    { id: "lightning_shock", title: "Lightning: Static Field", maxLevel: 3, skill: "lightning", description: (level) => `Lightning shocks enemies, dealing damage over time. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.shockDuration += 1000; } },
    { id: "lightning_fork", title: "Lightning: Fork", maxLevel: 2, skill: "lightning", description: () => `Each lightning strike has a chance to fork.`, apply: (p) => { p.skills.lightning.forkChance = (p.skills.lightning.forkChance || 0) + 0.15; } },
    { id: "volcano_damage", title: "Volcano: Magma Core", maxLevel: 5, skill: "volcano", description: (level) => `Increase eruption damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.damage += 10; } },
    { id: "volcano_radius", title: "Volcano: Wide Eruption", maxLevel: 3, skill: "volcano", description: (level) => `Increase eruption radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.radius *= 1.2; } },
    { id: "volcano_cooldown", title: "Volcano: Frequent Fissures", maxLevel: 3, skill: "volcano", description: (level) => `Eruptions occur more frequently. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.cooldown *= 0.8; } },
    { id: "volcano_duration", title: "Volcano: Scorched Earth", maxLevel: 3, skill: "volcano", description: () => `Burning ground lasts longer.`, apply: (p) => { p.skills.volcano.burnDuration *= 1.3; } },
    { id: "volcano_count", title: "Volcano: Cluster Bombs", maxLevel: 2, skill: "volcano", description: () => `Volcano creates an extra eruption.`, apply: (p) => { p.skills.volcano.count = (p.skills.volcano.count || 1) + 1; } },
    { id: "frostnova_damage", title: "Frost Nova: Deep Freeze", maxLevel: 5, skill: "frostNova", description: (level) => `Increase Frost Nova damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.damage += 5; } },
    { id: "frostnova_radius", title: "Frost Nova: Absolute Zero", maxLevel: 3, skill: "frostNova", description: (level) => `Increase Frost Nova radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.radius *= 1.25; } },
    { id: "frostnova_cooldown", title: "Frost Nova: Winter's Grasp", maxLevel: 3, skill: "frostNova", description: () => `Cast Frost Nova more frequently.`, apply: (p) => { p.skills.frostNova.cooldown *= 0.8; } },
    { id: "frostnova_slow", title: "Frost Nova: Crippling Cold", maxLevel: 2, skill: "frostNova", description: () => `Frost Nova's slow is more effective.`, apply: (p) => { p.skills.frostNova.slowAmount += 0.1; } },
    { id: "blackhole_damage", title: "Black Hole: Event Horizon", maxLevel: 5, skill: "blackHole", description: (level) => `Increase Black Hole damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.damage += 2; } },
    { id: "blackhole_radius", title: "Black Hole: Singularity", maxLevel: 3, skill: "blackHole", description: (level) => `Increase Black Hole radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.radius *= 1.2; } },
    { id: "blackhole_duration", title: "Black Hole: Lingering Void", maxLevel: 3, skill: "blackHole", description: () => `Black Hole lasts longer.`, apply: (p) => { p.skills.blackHole.duration *= 1.25; } },
    { id: "blackhole_pull", title: "Black Hole: Gravity Well", maxLevel: 2, skill: "blackHole", description: () => `Black Hole's pull is stronger.`, apply: (p) => { p.skills.blackHole.pullStrength *= 1.5; } },
];


// --- INITIALIZATION ---
export function initializeApp() {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
    database = firebase.database();
    googleProvider = new firebase.auth.GoogleAuthProvider();

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
        upgradeStatsList: document.getElementById('upgrade-stats-list'),
    };

    setupEventListeners();
    // checkSaveStates() is now called exclusively from auth.onAuthStateChanged initially,
    // and whenever auth state changes to ensure player data is ready.

    // NEW: Listen to auth state changes to set player details and enable menu options
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            menuElements.userStatus.textContent = `Signed in as ${user.displayName}.`;
            menuElements.googleSignInBtn.style.display = 'none';
            menuElements.userDisplay.style.display = 'block';
            menuElements.userName.textContent = user.displayName;

            // This is the critical asynchronous step for player color/name/uid
            // We await it here to ensure player object is fully hydrated before enabling game start.
            player.color = await getPlayerColor(user.uid);
            player.name = user.displayName;
            player.uid = user.uid;

        } else {
            menuElements.userStatus.textContent = 'Sign in for cloud saves.';
            menuElements.googleSignInBtn.style.display = 'flex';
            menuElements.userDisplay.style.display = 'none';
            player.uid = null;
            player.color = 'var(--player-aura-color)'; // Reset to default color for guest
            player.name = 'Guest'; // Default name for guest
            initPlayer(world); // Re-initialize local player object to defaults for guest
        }
        // AFTER player.color, name, uid are GUARANTEED to be set (or reset for guest),
        // then we can safely update menu options, which then allows game start.
        checkSaveStates();
    });
}

// Function to get or assign a permanent player color
async function getPlayerColor(uid) {
    const userDocRef = firestore.collection('users').doc(uid);
    const doc = await userDocRef.get();
    if (doc.exists && doc.data().playerColor) {
        return doc.data().playerColor;
    } else {
        const randomBytes = new Uint32Array(1);
        window.crypto.getRandomValues(randomBytes);
        const newColor = '#' + (randomBytes[0] % 16777216).toString(16).padStart(6, '0');
        await userDocRef.set({ playerColor: newColor }, { merge: true });
        return newColor;
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    function resizeCanvas() { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; camera.width = canvas.width; camera.height = canvas.height; }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getTouchPos(touchEvent) { const rect = canvas.getBoundingClientRect(); return { x: touchEvent.touches[0].clientX - rect.left, y: touchEvent.touches[0].clientY - rect.top }; }
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (!gameState.isRunning || gameState.isAutoMode) return; const pos = getTouchPos(e); joystick.active = true; joystick.baseX = pos.x; joystick.baseY = pos.y; joystick.handleX = pos.x; joystick.handleY = pos.y; }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!joystick.active) return; const pos = getTouchPos(e); const dx = pos.x - joystick.baseX; const dy = pos.y - joystick.baseY; const dist = Math.hypot(dx, dy); if (dist > joystick.radius) { joystick.handleX = joystick.baseX + (dx / dist) * joystick.radius; joystick.handleY = joystick.baseY + (dy / dist) * joystick.radius; } else { joystick.handleX = pos.x; joystick.handleY = pos.y; } }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); joystick.active = false; }, { passive: false });
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    // Menu button listeners remain, but checkSaveStates will control their rendering/clickability.
    menuElements.newGameBtn.addEventListener('click', () => startGame(true));
    menuElements.googleSignInBtn.addEventListener('click', signInWithGoogle);
    menuElements.signOutBtn.addEventListener('click', () => auth.signOut());

    hudElements.restartButton.addEventListener('click', () => {
        hudElements.gameOverScreen.classList.remove('visible');
        menuElements.mainMenu.classList.add('visible');
        hudElements.gameContainer.style.visibility = 'hidden';
        // When restarting, re-check save states to refresh menu options
        // This implicitly waits for onAuthStateChanged to finish if not already.
        checkSaveStates(); 
    });
    hudElements.autoModeButton.addEventListener('click', () => { gameState.isAutoMode = !gameState.isAutoMode; hudElements.autoModeButton.textContent = gameState.isAutoMode ? 'AUTO ON' : 'AUTO OFF'; hudElements.autoModeButton.classList.toggle('auto-on', gameState.isAutoMode); });
}

// checkSaveStates now primarily responsible for setting menu button visibility/enabled state
async function checkSaveStates() {
    menuElements.loadOptionsContainer.innerHTML = ''; // Clear existing buttons

    const localSaveExists = !!localStorage.getItem('survivorSaveData');
    let cloudSaveExists = false;

    // Only query Firestore if a user is logged in
    if (currentUser) {
        const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
        const doc = await saveRef.get().catch(e => console.error(e));
        if (doc && doc.exists) cloudSaveExists = true;
    }

    // Always re-add New Game button first for consistent order
    menuElements.loadOptionsContainer.appendChild(menuElements.newGameBtn);
    menuElements.newGameBtn.textContent = 'New Game (Local)'; // Clarify local only

    // Add buttons based on whether saves exist and if a user is logged in
    if (currentUser) {
        // If a user is logged in, enable the "New Game" button and add cloud-specific options.
        menuElements.newGameBtn.disabled = false; // Enable for signed-in users

        if (cloudSaveExists) {
            const cloudBtn = document.createElement('button');
            cloudBtn.className = 'menu-button';
            cloudBtn.textContent = 'Load Cloud Save';
            cloudBtn.onclick = () => startGame(false, 'cloud');
            menuElements.loadOptionsContainer.appendChild(cloudBtn);
        }
        
        // This is the primary entry for the global world. It always implies new personal progress.
        const globalBtn = document.createElement('button');
        globalBtn.className = 'menu-button';
        globalBtn.textContent = cloudSaveExists || localSaveExists ? 'Continue Global World (New Save)' : 'Play Global World (New Game)';
        globalBtn.onclick = () => startGame(true); // `startGame(true)` forces new personal progression
        menuElements.loadOptionsContainer.appendChild(globalBtn);

    } else {
        // If no user is logged in, disable the New Game button until signed in.
        menuElements.newGameBtn.disabled = true;
        menuElements.newGameBtn.textContent = 'New Game (Sign in to Play Global)';
    }

    if (localSaveExists) {
        const localBtn = document.createElement('button');
        localBtn.className = 'menu-button';
        localBtn.textContent = 'Load Local Save';
        localBtn.onclick = () => startGame(false, 'local');
        menuElements.loadOptionsContainer.appendChild(localBtn);
    }
}

async function saveGame() {
    if (!player || !gameState.isRunning || !currentUser) return;
    const savablePlayer = JSON.parse(JSON.stringify(player));
    delete savablePlayer.color;
    delete savablePlayer.name;
    delete savablePlayer.uid;

    const saveData = {
        player: savablePlayer,
        gameTime: gameState.gameTime,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
    try { await saveRef.set(saveData); } catch (error) { console.error("Error saving to cloud:", error); }
    localStorage.setItem('survivorSaveData', JSON.stringify(saveData));
}

async function loadGame(source) {
    let savedData = null;
    try {
        if (source === 'cloud' && currentUser) {
            const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
            const doc = await saveRef.get();
            if (doc.exists) { savedData = doc.data(); console.log("Game loaded from cloud."); }
        } else if (source === 'local') {
            const localData = localStorage.getItem('survivorSaveData');
            if (localData) savedData = JSON.parse(localData);
            console.log("Game loaded locally.");
        }
    } catch(error) { console.error("Error loading game:", error); return false; }
    if (savedData) {
        loadPlayer(savedData.player);
        gameState.gameTime = savedData.gameTime;
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

function takeDamage(amount, isDirectHit = false) {
    if (!player.uid) return;

    playerTakeDamage(amount, gameState.gameTime, spawnDamageNumber, screenRedFlash);

    if (player.thorns > 0 && isDirectHit) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < player.size + (e.width || 0) + 10) {
                WORLD_ENEMIES_REF().child(e.id).child('health').set(e.health - player.thorns);
                spawnDamageNumber(e.x, e.y, player.thorns, false);
            }
        });
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
    }
}


// --- GAME LIFECYCLE ---
async function startGame(forceNew, loadSource = 'cloud') {
    // This check is now redundant if buttons are properly managed,
    // but kept as a final fail-safe for unexpected edge cases.
    if (!currentUser || !player.color || !player.uid || !player.name) {
        console.error("Critical: Attempted to start game with incomplete player session data. Please ensure user is logged in and refresh.");
        alert("Error: Player data not fully loaded. Please refresh the page and try again.");
        return;
    }

    menuElements.mainMenu.classList.remove('visible');
    hudElements.gameContainer.style.visibility = 'visible';
    gameState.isAutoMode = false;
    if (gameState.saveIntervalId) clearInterval(gameState.saveIntervalId);

    let loadedSuccessfully = false;
    if (!forceNew) {
        loadedSuccessfully = await loadGame(loadSource);
    }
    if (forceNew || !loadedSuccessfully) {
        clearSave();
        initPlayer(world); // Re-initialize local player state to default
    }

    await initMultiplayerWorld();

    const playerRef = PLAYERS_REF().child(currentUser.uid);
    playerRef.onDisconnect().remove();

    playerRef.set({ // player.color, name, uid are now guaranteed to be populated by onAuthStateChanged
        x: player.x,
        y: player.y,
        angle: player.angle,
        size: player.size,
        name: player.name,
        color: player.color,
        health: player.health,
        maxHealth: player.maxHealth,
        level: player.level,
        lastHitTime: player.lastHitTime
    });

    gameState.lastTime = performance.now();
    projectiles.length = 0; particles.length = 0; damageNumbers.length = 0; lightningBolts.length = 0; volcanicEruptions.length = 0; visualEffects.length = 0;
    hudElements.levelUpWindow.classList.remove('visible');
    hudElements.gameOverScreen.classList.remove('visible');
    hudElements.autoModeButton.textContent = 'AUTO OFF';
    hudElements.autoModeButton.classList.remove('auto-on');
    gameState.isRunning = true;
    gameState.saveIntervalId = setInterval(saveGame, 10000);
    if (gameState.animationFrameId) cancelAnimationFrame(gameState.animationFrameId);
    gameLoop(performance.now());
}

async function initMultiplayerWorld() {
    if (worldStateListener) WORLD_STATE_REF().off('value', worldStateListener);
    if (onlinePlayersListener) PLAYERS_REF().off('value', onlinePlayersListener);
    if (enemiesListener) WORLD_ENEMIES_REF().off('value', enemiesListener);
    if (xpOrbsListener) WORLD_XP_ORBS_REF().off('value', xpOrbsListener);
    if (skillTotemsListener) WORLD_SKILL_TOTEMS_REF().off('value', skillTotemsListener);

    otherPlayers.clear();
    enemies.length = 0;
    xpOrbs.length = 0;
    skillTotems.length = 0;

    const worldStateSnapshot = await WORLD_STATE_REF().once('value');
    const onlinePlayersSnapshot = await PLAYERS_REF().once('value');
    const onlinePlayerCount = onlinePlayersSnapshot.val() ? Object.keys(onlinePlayersSnapshot.val()).length : 0;

    const rawReceivedWorldData = worldStateSnapshot.val();

    const existingHostId = rawReceivedWorldData && rawReceivedWorldData.hostId;
    
    const hostIsOnline = existingHostId && onlinePlayersSnapshot.hasChild(existingHostId);
    gameState.isHost = (!existingHostId || !hostIsOnline) && (onlinePlayerCount < MAX_PLAYERS);

    let defaultWorldData = {
        worldWidth: 3000,
        worldHeight: 2000,
        gameTime: 0,
        enemySpawnTimer: 0,
        enemySpawnInterval: 1500,
        worldSeed: Date.now(),
        safeHouse: new SafeHouse(3000, 2000).toJSON(),
        skillTotems: [
            { id: 'lightTotem', x: 3000 / 2 - 200, y: 2000 / 2 - 200, radius: 30, skill: 'lightning', color: '#9dffff', icon: '⚡' },
            { id: 'volcTotem', x: 3000 / 2 + 200, y: 2000 / 2 + 200, radius: 30, skill: 'volcano', color: '#ff8c00', icon: '🔥' },
            { id: 'frostTotem', x: 3000 / 2 + 200, y: 2000 / 2 - 200, radius: 30, skill: 'frostNova', color: '#87CEEB', icon: '❄️' },
            { id: 'blackTotem', x: 3000 / 2 - 200, y: 2000 / 2 + 200, radius: 30, skill: 'blackHole', color: '#483D8B', icon: '🌀' },
        ],
        hostId: currentUser.uid,
        lastHostHeartbeat: firebase.database.ServerValue.TIMESTAMP
    };

    let worldDataToApply;

    if (gameState.isHost) {
        console.log("Becoming host and initializing global world...");
        worldDataToApply = { ...defaultWorldData };
        await WORLD_REF().set(worldDataToApply);
    } else {
        console.log("Joining existing global world...");
        if (!rawReceivedWorldData) {
            console.error("Failed to join world: No world state found or invalid data.");
            alert("Could not join game. World not active or failed to load. Please try again.");
            hudElements.gameOverScreen.classList.add('visible');
            menuElements.mainMenu.classList.add('visible');
            hudElements.gameContainer.style.visibility = 'hidden';
            return;
        }

        worldDataToApply = {
            worldWidth: typeof rawReceivedWorldData.worldWidth === 'number' ? rawReceivedWorldData.worldWidth : defaultWorldData.worldWidth,
            worldHeight: typeof rawReceivedWorldData.worldHeight === 'number' ? rawReceivedWorldData.worldHeight : defaultWorldData.worldHeight,
            gameTime: typeof rawReceivedWorldData.gameTime === 'number' ? rawReceivedWorldData.gameTime : defaultWorldData.gameTime,
            enemySpawnTimer: typeof rawReceivedWorldData.enemySpawnTimer === 'number' ? rawReceivedWorldData.enemySpawnTimer : defaultWorldData.enemySpawnTimer,
            enemySpawnInterval: typeof rawReceivedWorldData.enemySpawnInterval === 'number' ? rawReceivedWorldData.enemySpawnInterval : defaultWorldData.enemySpawnInterval,
            worldSeed: typeof rawReceivedWorldData.worldSeed === 'number' ? rawReceivedWorldData.worldSeed : defaultWorldData.worldSeed,
            
            safeHouse: rawReceivedWorldData.safeHouse ? {
                x: typeof rawReceivedWorldData.safeHouse.x === 'number' ? rawReceivedWorldData.safeHouse.x : defaultWorldData.safeHouse.x,
                y: typeof rawReceivedWorldData.safeHouse.y === 'number' ? rawReceivedWorldData.safeHouse.y : defaultWorldData.safeHouse.y,
                radius: typeof rawReceivedWorldData.safeHouse.radius === 'number' ? rawReceivedWorldData.safeHouse.radius : defaultWorldData.safeHouse.radius,
                active: typeof rawReceivedWorldData.safeHouse.active === 'boolean' ? rawReceivedWorldData.safeHouse.active : defaultWorldData.safeHouse.active,
                respawnTimer: typeof rawReceivedWorldData.safeHouse.respawnTimer === 'number' ? rawReceivedWorldData.safeHouse.respawnTimer : defaultWorldData.safeHouse.respawnTimer,
                healingRate: typeof rawReceivedWorldData.safeHouse.healingRate === 'number' ? rawReceivedWorldData.safeHouse.healingRate : defaultWorldData.safeHouse.healingRate,
                damageRate: typeof rawReceivedWorldData.safeHouse.damageRate === 'number' ? rawReceivedWorldData.safeHouse.damageRate : defaultWorldData.safeHouse.damageRate,
            } : defaultWorldData.safeHouse,

            skillTotems: Array.isArray(rawReceivedWorldData.skillTotems) ? rawReceivedWorldData.skillTotems.map(totem => ({
                id: typeof totem.id === 'string' ? totem.id : '',
                x: typeof totem.x === 'number' ? totem.x : 0,
                y: typeof totem.y === 'number' ? totem.y : 0,
                radius: typeof totem.radius === 'number' ? totem.radius : 30,
                skill: typeof totem.skill === 'string' ? totem.skill : '',
                color: typeof totem.color === 'string' ? totem.color.replace(/[^#0-9a-fA-F]/g, '') : '#FFFFFF',
                icon: typeof totem.icon === 'string' ? totem.icon : '❓',
            })) : defaultWorldData.skillTotems,

            hostId: typeof rawReceivedWorldData.hostId === 'string' ? rawReceivedWorldData.hostId : defaultWorldData.hostId,
            lastHostHeartbeat: typeof rawReceivedWorldData.lastHostHeartbeat === 'number' ? rawReceivedWorldData.lastHostHeartbeat : defaultWorldData.lastHostHeartbeat
        };
    }

    world.width = worldDataToApply.worldWidth;
    world.height = worldDataToApply.worldHeight;
    gameState.gameTime = worldDataToApply.gameTime;
    gameState.enemySpawnTimer = worldDataToApply.enemySpawnTimer;
    gameState.enemySpawnInterval = worldDataToApply.enemySpawnInterval;
    gameState.worldSeed = worldDataToApply.worldSeed;

    safeHouseInstance = new SafeHouse(world.width, world.height);
    Object.assign(safeHouseInstance, worldDataToApply.safeHouse);
    skillTotems = worldDataToApply.skillTotems || [];

    initRift(gameState.worldSeed);

    setupRealtimeDBListeners();

    if (gameState.isHost) {
        setInterval(() => {
            WORLD_STATE_REF().child('lastHostHeartbeat').set(firebase.database.ServerValue.TIMESTAMP);
        }, 5000);
    }
}

function setupRealtimeDBListeners() {
    worldStateListener = WORLD_STATE_REF().on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            gameState.gameTime = typeof data.gameTime === 'number' ? data.gameTime : gameState.gameTime;
            gameState.enemySpawnTimer = typeof data.enemySpawnTimer === 'number' ? data.enemySpawnTimer : gameState.enemySpawnTimer;
            gameState.enemySpawnInterval = typeof data.enemySpawnInterval === 'number' ? data.enemySpawnInterval : gameState.enemySpawnInterval;
            world.width = typeof data.worldWidth === 'number' ? data.worldWidth : world.width;
            world.height = typeof data.worldHeight === 'number' ? data.worldHeight : world.height;
            gameState.worldSeed = typeof data.worldSeed === 'number' ? data.worldSeed : gameState.worldSeed;

            if (safeHouseInstance && data.safeHouse) {
                safeHouseInstance.x = typeof data.safeHouse.x === 'number' ? data.safeHouse.x : safeHouseInstance.x;
                safeHouseInstance.y = typeof data.safeHouse.y === 'number' ? data.safeHouse.y : safeHouseInstance.y;
                safeHouseInstance.radius = typeof data.safeHouse.radius === 'number' ? data.safeHouse.radius : safeHouseInstance.radius;
                safeHouseInstance.active = typeof data.safeHouse.active === 'boolean' ? data.safeHouse.active : safeHouseInstance.active;
                safeHouseInstance.respawnTimer = typeof data.safeHouse.respawnTimer === 'number' ? data.safeHouse.respawnTimer : safeHouseInstance.respawnTimer;
                safeHouseInstance.healingRate = typeof data.safeHouse.healingRate === 'number' ? data.safeHouse.healingRate : safeHouseInstance.healingRate;
                safeHouseInstance.damageRate = typeof data.safeHouse.damageRate === 'number' ? data.safeHouse.damageRate : safeHouseInstance.damageRate;
            } else if (safeHouseInstance) {
                 safeHouseInstance.spawn();
            }
            if (Array.isArray(data.skillTotems)) {
                skillTotems = data.skillTotems.map(totem => ({
                    id: typeof totem.id === 'string' ? totem.id : '',
                    x: typeof totem.x === 'number' ? totem.x : 0,
                    y: typeof totem.y === 'number' ? totem.y : 0,
                    radius: typeof totem.radius === 'number' ? totem.radius : 30,
                    skill: typeof totem.skill === 'string' ? totem.skill : '',
                    color: typeof totem.color === 'string' ? totem.color.replace(/[^#0-9a-fA-F]/g, '') : '#FFFFFF',
                    icon: typeof totem.icon === 'string' ? totem.icon : '❓',
                }));
            } else {
                skillTotems = [];
            }
        }
    });

    onlinePlayersListener = PLAYERS_REF().on('value', (snapshot) => {
        const playersData = snapshot.val();
        otherPlayers.clear();
        if (playersData) {
            Object.keys(playersData).forEach(uid => {
                if (uid !== currentUser.uid) {
                    const pData = playersData[uid];
                    otherPlayers.set(uid, {
                        x: typeof pData.x === 'number' ? pData.x : 0,
                        y: typeof pData.y === 'number' ? pData.y : 0,
                        angle: typeof pData.angle === 'number' ? pData.angle : 0,
                        size: typeof pData.size === 'number' ? pData.size : 20,
                        name: typeof pData.name === 'string' ? pData.name.substring(0, 20) : 'Unknown',
                        color: typeof pData.color === 'string' ? pData.color.replace(/[^#0-9a-fA-F]/g, '') : '#FFFFFF',
                        health: typeof pData.health === 'number' ? pData.health : 100,
                        maxHealth: typeof pData.maxHealth === 'number' ? pData.maxHealth : 100,
                        level: typeof pData.level === 'number' ? pData.level : 1,
                        kills: typeof pData.kills === 'number' ? pData.kills : 0,
                        xp: typeof pData.xp === 'number' ? pData.xp : 0,
                        xpForNextLevel: typeof pData.xpForNextLevel === 'number' ? pData.xpForNextLevel : 10,
                        lastHitTime: typeof pData.lastHitTime === 'number' ? pData.lastHitTime : 0
                    });
                }
            });
        }
    });

    enemiesListener = WORLD_ENEMIES_REF().on('value', (snapshot) => {
        const enemiesData = snapshot.val();
        enemies.length = 0;
        if (enemiesData) {
            Object.values(enemiesData).forEach(rawEnemy => {
                if (typeof rawEnemy === 'object' && rawEnemy !== null && rawEnemy.id && typeof rawEnemy.x === 'number' && typeof rawEnemy.y === 'number') {
                    enemies.push({
                        id: rawEnemy.id,
                        x: rawEnemy.x,
                        y: rawEnemy.y,
                        health: typeof rawEnemy.health === 'number' ? rawEnemy.health : 1,
                        speed: typeof rawEnemy.speed === 'number' ? rawEnemy.speed : 1,
                        damage: typeof rawEnemy.damage === 'number' ? rawEnemy.damage : 10,
                        shockTimer: typeof rawEnemy.shockTimer === 'number' ? rawEnemy.shockTimer : 0,
                        shockDamage: typeof rawEnemy.shockDamage === 'number' ? rawEnemy.shockDamage : 0,
                        slowTimer: typeof rawEnemy.slowTimer === 'number' ? rawEnemy.slowTimer : 0,
                        slowAmount: typeof rawEnemy.slowAmount === 'number' ? rawEnemy.slowAmount : 0,
                        speedMultiplier: typeof rawEnemy.speedMultiplier === 'number' ? rawEnemy.speedMultiplier : 1.0,
                        markedForDeletion: typeof rawEnemy.markedForDeletion === 'boolean' ? rawEnemy.markedForDeletion : false,
                        width: typeof rawEnemy.width === 'number' ? rawEnemy.width : 40
                    });
                }
            });
        }
    });

    xpOrbsListener = WORLD_XP_ORBS_REF().on('value', (snapshot) => {
        const xpOrbsData = snapshot.val();
        xpOrbs.length = 0;
        if (xpOrbsData) {
            Object.values(xpOrbsData).forEach(rawOrb => {
                if (typeof rawOrb === 'object' && rawOrb !== null && rawOrb.id && typeof rawOrb.x === 'number' && typeof rawOrb.y === 'number') {
                    xpOrbs.push({
                        id: rawOrb.id,
                        x: rawOrb.x,
                        y: rawOrb.y,
                        value: typeof rawOrb.value === 'number' ? rawOrb.value : 1,
                        size: typeof rawOrb.size === 'number' ? rawOrb.size : 5,
                        update: (dt, options) => {
                            const localPlayer = options.player;
                            const localGainXPCallback = options.gainXPCallback;

                            const dx = localPlayer.x - rawOrb.x;
                            const dy = localPlayer.y - rawOrb.y;
                            const dist = Math.hypot(dx, dy);

                            if (dist < localPlayer.pickupRadius) {
                                rawOrb.x += (dx / dist) * 8 * localPlayer.magnetism;
                                rawOrb.y += (dy / dist) * 8 * localPlayer.magnetism;
                            }
                            if (dist < 20) {
                                if (localPlayer.abilities.healOnXp && Math.random() < 0.1) {
                                    localPlayer.health = Math.min(localPlayer.maxHealth, localPlayer.health + 1);
                                }
                                localGainXPCallback(rawOrb.value, rawOrb.id);
                                return true;
                            }
                            return false;
                        }
                    });
                }
            });
        }
    });
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

    PLAYERS_REF().child(currentUser.uid).remove();
}

function getAiMovementVector() {
    const DANGER_RADIUS = 150; const XP_PRIORITY_RADIUS = 200;
    const REPULSION_WEIGHT = 1.5; const ATTRACTION_WEIGHT = 1.0; const TOTEM_WEIGHT = 2.0;
    let repulsion = { x: 0, y: 0 }; let attraction = { x: 0, y: 0 };
    
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < DANGER_RADIUS && dist > 0) {
            const force = 1 / (dist * dist);
            repulsion.x -= (enemy.x - player.x) / dist * force;
            repulsion.y -= (enemy.y - player.y) / dist * force;
        }
    });

    let closestOrb = null, closestOrbDist = Infinity;
    xpOrbs.forEach(orb => {
        const dist = Math.hypot(orb.x - player.x, orb.y - player.y);
        if (dist < closestOrbDist) { closestOrbDist = dist; closestOrb = orb; }
    });

    let closestEnemyForTargeting = null, closestEnemyForTargetingDist = Infinity;
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < closestEnemyForTargetingDist) { closestEnemyForTargetingDist = dist; closestEnemyForTargeting = enemy; }
    });

    let closestTotem = null, closestTotemDist = Infinity;
    skillTotems.forEach(totem => {
        const dist = Math.hypot(totem.x - player.x, totem.y - player.y);
        if(dist < closestTotemDist) { closestTotemDist = dist; closestTotem = totem; }
    });

    let target = closestEnemyForTargeting;
    let targetDist = closestEnemyForTargetingDist;

    if (safeHouseInstance && !safeHouseInstance.active && safeHouseInstance.respawnTimer > 1) {
        // AI could wander, but for simplicity, current AI defaults to closest enemy if no other priority.
    } else if (safeHouseInstance && safeHouseInstance.active) {
        if (!safeHouseInstance.isInside(player)) {
            target = safeHouseInstance;
            targetDist = Math.hypot(safeHouseInstance.x - player.x, safeHouseInstance.y - player.y);
        }
    }

    if (closestOrb && closestOrbDist < XP_PRIORITY_RADIUS) target = closestOrb;
    if (closestTotem && (!player.skills[closestTotem.skill].isUnlocked || (player.abilities.orbitingShield.enabled && closestTotem.skill === 'soul_vortex'))) {
        target = closestTotem;
    }

    if (target && targetDist > 0) {
        const weight = (target === closestTotem || target === safeHouseInstance) ? TOTEM_WEIGHT * 2 : ATTRACTION_WEIGHT;
        attraction.x = (target.x - player.x) / targetDist * weight;
        attraction.y = (target.y - player.y) / targetDist * weight;
    } else if (closestEnemyForTargeting) {
         if (closestEnemyForTargetingDist > 0) {
            attraction.x = (closestEnemyForTargeting.x - player.x) / closestEnemyForTargetingDist * ATTRACTION_WEIGHT;
            attraction.y = (closestEnemyForTargeting.y - player.y) / closestEnemyForTargetingDist * ATTRACTION_WEIGHT;
        }
    }

    return { x: attraction.x + (repulsion.x * REPULSION_WEIGHT), y: attraction.y + (repulsion.y * REPULSION_WEIGHT) };
}

function gameLoop(timestamp) { if (!gameState.isRunning) return; const deltaTime = timestamp - gameState.lastTime; gameState.lastTime = timestamp; update(deltaTime); draw(); gameState.animationFrameId = requestAnimationFrame(gameLoop); }

async function update(deltaTime) {
    if (!currentUser) return;

    if (gameState.isHost) {
        gameState.gameTime += deltaTime;
        WORLD_STATE_REF().child('gameTime').set(gameState.gameTime);

        if (safeHouseInstance) {
            safeHouseInstance.update(deltaTime);
            WORLD_STATE_REF().child('safeHouse').set(safeHouseInstance.toJSON());
        }

        gameState.enemySpawnTimer += deltaTime;
        if (gameState.enemySpawnTimer > gameState.enemySpawnInterval && enemies.length < 100) {
            const newEnemy = spawnEnemy(world);
            if (newEnemy) {
                 WORLD_ENEMIES_REF().child(newEnemy.id).set(newEnemy);
            }
            gameState.enemySpawnTimer = 0;
            gameState.enemySpawnInterval = Math.max(100, gameState.enemySpawnInterval * 0.985);
            WORLD_STATE_REF().child('enemySpawnInterval').set(gameState.enemySpawnInterval);
            WORLD_STATE_REF().child('enemySpawnTimer').set(gameState.enemySpawnTimer);
        }

        updateEnemies(deltaTime, enemies, player, otherPlayers, showLevelUpOptions, (amount, orbId) => {
            gainXP(amount, showLevelUpOptions, () => expandWorld(camera, player), (p) => triggerNova(p, 50, 200, WORLD_ENEMIES_REF()), camera);
            if (orbId) {
                WORLD_XP_ORBS_REF().child(orbId).remove();
            }
        }, WORLD_ENEMIES_REF(), WORLD_XP_ORBS_REF(), gameState.isHost);
        
        const updatedSkillTotems = [];
        for (const totem of skillTotems) {
            if (Math.hypot(player.x - totem.x, player.y - totem.y) < player.size + totem.radius) {
                if (VALID_UNLOCKABLE_SKILLS.includes(totem.skill)) {
                    player.skills[totem.skill].isUnlocked = true;
                    WORLD_SKILL_TOTEMS_REF().child(totem.id).remove();
                } else {
                    console.warn(`Attempted to unlock invalid skill: ${totem.skill} via totem. Ignoring.`);
                    updatedSkillTotems.push(totem);
                }
            } else {
                updatedSkillTotems.push(totem);
            }
        }
        skillTotems = updatedSkillTotems;
    }
    
    let dx = 0, dy = 0;
    if (gameState.isAutoMode) {
        const aiVector = getAiMovementVector();
        dx = aiVector.x; dy = aiVector.y;
    } else if (joystick.active) {
        dx = joystick.handleX - joystick.baseX; dy = joystick.handleY - joystick.baseY;
    } else {
        dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0); dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    }
    const { closestEnemy, closestDist } = updatePlayer(deltaTime, world, enemies, { dx, dy });
    if (closestEnemy && gameState.gameTime - (player.lastFireTime || 0) > player.weapon.cooldown) {
        fireProjectile(player);
        player.lastFireTime = gameState.gameTime;
    }

    const playerRef = PLAYERS_REF().child(currentUser.uid);
    playerRef.update({
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: player.health,
        maxHealth: player.maxHealth,
        level: player.level,
        kills: player.kills,
        xp: player.xp,
        xpForNextLevel: player.xpForNextLevel,
        lastHitTime: player.lastHitTime
    });

    camera.x = player.x - camera.width / 2; camera.y = player.y - camera.height / 2;
    camera.x = Math.max(0, Math.min(world.width - camera.width, camera.x));
    camera.y = Math.max(0, Math.min(world.height - camera.height, camera.y));

    if (safeHouseInstance) {
        if (safeHouseInstance.active && safeHouseInstance.isInside(player)) {
            player.health = Math.min(player.maxHealth, player.health + (player.healthRegen + safeHouseInstance.healingRate) * (deltaTime / 1000));
        }
    }

    enemies = enemies.filter(enemy => !enemy.markedForDeletion);

    updateLightning(deltaTime, player, WORLD_ENEMIES_REF());
    updateVolcano(deltaTime, player, WORLD_ENEMIES_REF());
    updateFrostNova(deltaTime, player, WORLD_ENEMIES_REF());
    updateBlackHole(deltaTime, player, WORLD_ENEMIES_REF());

    const updateEntityArray = (arr, dt, extra) => {
        for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].update(dt, extra)) arr.splice(i, 1);
        }
    };
    updateEntityArray(projectiles, deltaTime);
    updateEntityArray(xpOrbs, deltaTime, { player, gainXPCallback: (amount, orbId) => {
        gainXP(amount, showLevelUpOptions, () => expandWorld(camera, player), (p) => triggerNova(p, 50, 200, WORLD_ENEMIES_REF()), camera);
        if (gameState.isHost) {
            WORLD_XP_ORBS_REF().child(orbId).remove();
        }
    }});
    updateEntityArray(particles, deltaTime);
    updateEntityArray(damageNumbers, deltaTime);
    updateEntityArray(lightningBolts, deltaTime);
    updateEntityArray(volcanicEruptions, deltaTime);
    updateEntityArray(visualEffects, deltaTime);

    handleCollisions(WORLD_ENEMIES_REF());
}

function handleCollisions(enemiesRef) {
    projectiles.forEach(p => {
        if (p.pierce < p.hitEnemies.length) return;
        enemies.forEach(e => {
            if (p.hitEnemies.includes(e.id)) return;
            const combinedRadius = (p.size?.w || 10) + (e.width || 20);
            if (Math.hypot(e.x - p.x, e.y - p.y) < combinedRadius / 2) {
                if (p.explodesOnImpact && p.hitEnemies.length === 0) {
                    triggerNova({x: e.x, y: e.y}, p.explosionDamage, p.explosionRadius, enemiesRef);
                }
                const isCrit = Math.random() < p.critChance;
                const damage = isCrit ? Math.round(p.damage * p.critDamage) : p.damage;
                if(isCrit && player.abilities.critExplosion) {
                    triggerNova({x: e.x, y: e.y}, damage / 2, 80, enemiesRef);
                }
                
                if (gameState.isHost) {
                    enemiesRef.child(e.id).child('health').set(e.health - damage);
                } else {
                    e.health -= damage;
                }
                
                p.hitEnemies.push(e.id);
                createImpactParticles(e.x, e.y, 10);
                spawnDamageNumber(e.x, e.y, Math.round(damage), isCrit);
            }
        });
    });
    enemies.forEach(e => {
        const combinedRadius = player.size + (e.width || 20);
        if (Math.hypot(e.x - player.x, e.y - player.y) < combinedRadius / 2) {
            takeDamage(e.damage || 10, true);
            if (gameState.isHost) {
                WORLD_ENEMIES_REF().child(e.id).child('health').set(0);
            } else {
                e.health = -1;
            }
        }
    });
    const shield = player.abilities.orbitingShield;
    if (shield.enabled) {
        const count = shield.count || 1;
        for(let i=0; i<count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            if (gameState.gameTime - (shield.lastHitTime?.[i] || 0) > shield.cooldown) {
                const shieldX = player.x + Math.cos(angle) * shield.distance;
                const shieldY = player.y + Math.sin(angle) * shield.distance;
                enemies.forEach(e => {
                    const combinedRadius = 15 + (e.width || 20);
                    if (Math.hypot(e.x - shieldX, e.y - shieldY) < combinedRadius / 2) {
                        if (gameState.isHost) {
                            enemiesRef.child(e.id).child('health').set(e.health - shield.damage);
                        } else {
                            e.health -= shield.damage;
                        }
                        spawnDamageNumber(e.x, e.y, shield.damage, false);
                        if(!shield.lastHitTime) shield.lastHitTime = {};
                        shield.lastHitTime[i] = gameState.gameTime;
                    }
                });
            }
        }
        shield.angle += 0.05 * (shield.speed || 1);
    }
}

function draw() {
    if(!gameState.isRunning && !hudElements.gameOverScreen.classList.contains('visible')) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    ctx.drawImage(getBackgroundCanvas(), 0, 0);

    if (safeHouseInstance) {
        safeHouseInstance.draw(ctx, camera);
    }

    drawWorldElements();
    projectiles.forEach(p => drawProjectile(p));
    enemies.forEach(e => drawEnemy(e));

    otherPlayers.forEach(otherPlayer => {
        if (otherPlayer.x > camera.x - 50 && otherPlayer.x < camera.x + camera.width + 50 &&
            otherPlayer.y > camera.y - 50 && otherPlayer.y < camera.y + camera.height + 50) {
            const otherPlayerBlink = (gameState.gameTime - (otherPlayer.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0;
            if (otherPlayer.health > 0 && !otherPlayerBlink) {
                drawPlayer(otherPlayer, otherPlayer.angle, otherPlayer.color, otherPlayer.name, otherPlayer.health, otherPlayer.maxHealth);
            }
        }
    });

    const playerBlink = (gameState.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0;
    if (!playerBlink) drawPlayer(player, player.angle, player.color, player.name, player.health, player.maxHealth, true);


    drawParticlesAndEffects();
    ctx.restore();
    if (screenRedFlash.value > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${screenRedFlash.value * 0.4})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenRedFlash.value -= 0.04; }
    if (screenFlash.value > 0) { ctx.fillStyle = `rgba(200, 225, 255, ${screenFlash.value})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenFlash.value -= 0.05; }
    if (joystick.active && !gameState.isAutoMode) drawJoystick(); updateHUD();
}

function drawWorldElements() {
    skillTotems.forEach(totem => drawSkillTotem(totem));
    lightningBolts.forEach(bolt => drawLightningBolt(bolt));
    volcanicEruptions.forEach(v => drawVolcano(v));
    xpOrbs.forEach(orb => drawXpOrb(orb));
}

function drawParticlesAndEffects() {
    visualEffects.forEach(effect => {
        const lifePercent = effect.life / effect.maxLife;
        ctx.save();
        ctx.beginPath();
        if (effect.type === 'shockwave' || effect.type === 'frostwave') {
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.strokeStyle = effect.type === 'frostwave' ? `rgba(135, 206, 250, ${lifePercent * 0.8})` : `rgba(255, 255, 255, ${lifePercent * 0.8})`;
            ctx.lineWidth = 15 * lifePercent;
            ctx.stroke();
        } else if (effect.type === 'world_expansion') {
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(150, 255, 150, ${lifePercent * 0.9})`;
            ctx.lineWidth = 20 * lifePercent;
            ctx.stroke();
        } else if (effect.type === 'blackHole') {
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(effect.x, effect.y, 10, effect.x, effect.y, effect.radius);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(25, 0, 50, 0.7)');
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.restore();
    });
    particles.forEach(p => {
        if (p.type === 'ember') { ctx.fillStyle = `rgba(255, 165, 0, ${p.alpha})`; }
        else if (p.type === 'nova') { ctx.fillStyle = `rgba(220, 180, 255, ${p.alpha})`; }
        else if (p.type === 'lightning') { ctx.fillStyle = `rgba(157, 255, 255, ${p.alpha})`; }
        else { ctx.fillStyle = `rgba(255, 255, 224, ${p.alpha})`; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2); ctx.fill();
    });
    damageNumbers.forEach(dn => drawDamageNumber(dn));
    const shield = player.abilities.orbitingShield;
    if (shield.enabled) {
        const count = shield.count || 1;
        for(let i=0; i<count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            const pulse = Math.sin(gameState.gameTime / 150 + i * Math.PI);
            const shieldX = player.x + Math.cos(angle) * shield.distance;
            const shieldY = player.y + Math.sin(angle) * shield.distance;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(220, 120, 255, ${0.4 + pulse * 0.2})`;
            ctx.shadowColor = 'rgba(220, 120, 255, 1)'; ctx.shadowBlur = 20 + pulse * 10;
            ctx.beginPath(); ctx.arc(shieldX, shieldY, 15 + pulse * 5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            if (Math.random() > 0.5) {
                particles.push({
                    x: shieldX, y: shieldY, life: 200, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
                    alpha: 1, type: 'nova', size: Math.random() * 2,
                    update(dt) { this.x += this.vx; this.y += this.vy; this.life -= dt; this.alpha = this.life / 200; return this.life <= 0; }
                });
            }
        }
    }
}

function drawPlayer(p, angle, customColor, name, currentHealth, maxHealth, isLocalPlayer = false) {
    const bob = Math.sin(gameState.gameTime / 250) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    const hoverPulse = Math.sin(gameState.gameTime / 400);

    ctx.beginPath();
    ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2 + hoverPulse * 0.1;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.rotate(angle);

    const auraPulse = Math.sin(gameState.gameTime / 200);
    ctx.beginPath();
    ctx.arc(0, 0, 30, -1.9, 1.9);
    ctx.strokeStyle = customColor;
    ctx.lineWidth = 4 + auraPulse * 2;
    ctx.shadowColor = customColor;
    ctx.shadowBlur = 15 + auraPulse * 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(8, 15);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.fillRect(-5, -15, 10, 10);

    ctx.restore();

    if (name && !isLocalPlayer) {
        ctx.save();
        ctx.translate(0, -40);
        ctx.font = '14px Arial';
        ctx.fillStyle = customColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(name, 0, 0);

        const barWidth = 40;
        const barHeight = 5;
        const hpPercent = currentHealth / maxHealth;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-barWidth / 2, 5, barWidth, barHeight);
        ctx.fillStyle = 'red';
        ctx.fillRect(-barWidth / 2, 5, barWidth * hpPercent, barHeight);
        ctx.restore();
    } else if (isLocalPlayer) {
        ctx.save();
        ctx.translate(0, -40);
        ctx.font = '14px Arial';
        ctx.fillStyle = customColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(name + " (YOU)", 0, 0);
        ctx.restore();
    }

    ctx.restore();
}

function drawEnemy(e) { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2); if (e.slowTimer > 0) { ctx.fillStyle = '#87CEEB'; } else { ctx.fillStyle = 'var(--enemy-color)'; } ctx.fill(enemyPath); ctx.strokeStyle = 'var(--enemy-accent-color)'; ctx.lineWidth = 1.5; ctx.stroke(enemyPath); ctx.restore(); }
function drawProjectile(p) { if (p.trail.length < 2) return; ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = 'var(--projectile-color)'; ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y); for (let i = 1; i < p.trail.length; i++) { const point = p.trail[i]; ctx.lineWidth = (i / p.trail.length) * p.size.w * 1.5; ctx.lineTo(point.x, point.y); } ctx.stroke(); ctx.restore(); }
function drawXpOrb(o) { ctx.beginPath(); ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2); ctx.fillStyle = 'var(--xp-orb-color)'; ctx.shadowColor = 'var(--xp-orb-color)'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0; }
function drawJoystick() { ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(128,128,128,0.3)'; ctx.fill(); ctx.beginPath(); ctx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
function drawDamageNumber(dn) { ctx.save(); ctx.translate(dn.x, dn.y); ctx.globalAlpha = dn.alpha; ctx.fillStyle = dn.isCrit ? 'yellow' : 'var(--damage-text-color)'; ctx.font = dn.isCrit ? 'bold 24px Roboto' : 'bold 18px Roboto'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(dn.value, 0, 0); ctx.restore(); }
function drawLightningBolt(bolt) { ctx.save(); ctx.globalAlpha = Math.min(1, bolt.life / 100); ctx.strokeStyle = 'var(--lightning-color)'; ctx.lineWidth = 3; ctx.shadowColor = 'var(--lightning-color)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(bolt.start.x, bolt.start.y); const segments = 10; for (let i = 1; i <= segments; i++) { const t = i / segments; const x = bolt.start.x * (1 - t) + bolt.end.x * t; const y = bolt.start.y * (1 - t) + bolt.end.y * t; if (i < segments) { ctx.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20); } else { ctx.lineTo(x, y); } } ctx.stroke(); ctx.restore(); }
function drawVolcano(v) { ctx.save(); const lifePercent = v.life / v.burnDuration; ctx.globalAlpha = lifePercent * 0.7; ctx.fillStyle = 'var(--volcano-color)'; ctx.beginPath(); ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawSkillTotem(totem) { ctx.save(); ctx.translate(totem.x, totem.y); ctx.globalAlpha = 0.8 + Math.sin(gameState.gameTime / 200) * 0.2; ctx.beginPath(); ctx.arc(0, 0, totem.radius, 0, Math.PI * 2); ctx.fillStyle = totem.color; ctx.shadowColor = totem.color; ctx.shadowBlur = 20; ctx.fill(); ctx.font = '24px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(totem.icon, 0, 0); ctx.restore(); }
function updateHUD() {
    hudElements.level.textContent = `LV ${player.level}`;
    hudElements.hp.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
    hudElements.hpFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
    hudElements.timer.textContent = formatTime(gameState.gameTime);
    hudElements.xpBottomFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    hudElements.killCounter.textContent = player.kills;

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
                case "soul_vortex": case "vortex_damage": statValue = `${player.abilities.orbitingShield.damage} Vortex Damage`; break;
                case "vortex_speed": statValue = `${(player.abilities.orbitingShield.speed || 1).toFixed(1)}x Vortex Speed`; break;
                case "vortex_twin": statValue = `${player.abilities.orbitingShield.count} Vortex Count`; break;
                case "rear_guard": case "diagonalShot": case "novaOnLevelUp": case "healOnXp": case "crit_explosion": case "demolition": statValue = `Active`; break;
                default: statValue = `Lv ${level}`; break;
            }

            const p = document.createElement('p');
            p.className = 'upgrade-stat-item';
            p.innerHTML = `${upgradeDef.title}: <strong>${statValue}</strong>`;
            hudElements.upgradeStatsList.appendChild(p);
        }
    }
}
function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function showLevelUpOptions() {
    gameState.isRunning = false;
    hudElements.xpFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    const availablePool = UPGRADE_POOL.filter(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const maxLevel = upgrade.maxLevel || Infinity;
        if (currentLevel >= maxLevel) return false;
        if (upgrade.skill === 'lightning' && !player.skills.lightning.isUnlocked) return false;
        if (upgrade.skill === 'volcano' && !player.skills.volcano.isUnlocked) return false;
        if (upgrade.skill === 'frostNova' && !player.skills.frostNova.isUnlocked) return false;
        if (upgrade.skill === 'blackHole' && !player.skills.blackHole.isUnlocked) return false;
        if (upgrade.skill === 'soul_vortex' && !player.abilities.orbitingShield.enabled) return false;
        return true;
    });
    const choices = availablePool.sort(() => 0.5 - Math.random()).slice(0, 6);
    hudElements.upgradeOptions.innerHTML = '';
    choices.forEach(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<h3>${upgrade.title}</h3><p>${upgrade.description(currentLevel)}</p>`;
        card.onclick = () => selectUpgrade(upgrade);
        hudElements.upgradeOptions.appendChild(card);
    });
    hudElements.levelUpWindow.classList.add('visible');
}
window.showLevelUpOptions = showLevelUpOptions;
function selectUpgrade(upgrade) {
    const currentLevel = player.upgradeLevels[upgrade.id] || 0;
    player.upgradeLevels[upgrade.id] = currentLevel + 1;
    upgrade.apply(player);
    hudElements.levelUpWindow.classList.remove('visible');
    gameState.isRunning = true;
    gameState.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

export {
    gameState, keys, joystick, world, camera, enemies, projectiles, xpOrbs, particles,
    damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems, otherPlayers,
    safeHouseInstance as safeHouse,
    screenFlash, screenRedFlash, UPGRADE_POOL
};
