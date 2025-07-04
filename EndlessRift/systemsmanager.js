import { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage as playerTakeDamage } from './player.js'; // MODIFIED: Imported playerTakeDamage
import { enemyPath, spawnEnemy, updateEnemies } from './enemies.js';
import { fireProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber, updateFrostNova, updateBlackHole } from './attacks_skills.js';
import { initRift, expandWorld, getBackgroundCanvas } from './rift.js';

// --- Firebase Variables (Declared but not initialized) ---
let auth, firestore, googleProvider, currentUser;

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyAvutjrwWBsZ_5bCPN-nbL3VpP2NQ94EUY",
    authDomain: "tap-guardian-rpg.firebaseapp.com",
    projectId: "tap-guardian-rpg",
    storageBucket: "tap-guardian-rpg.firebasestorage.app",
    messagingSenderId: "50272459426",
    appId: "1:50272459426:web:8f67f9126d3bc3a23a15fb",
    measurementId: "G-XJRE7YNPZR"
};

// NEW: Define the SafeHouse class
// This class will manage the shrinking, relocating safe zone.
class SafeHouse {
    constructor(gameWorldWidth, gameWorldHeight) {
        this.gameWorldWidth = gameWorldWidth;
        this.gameWorldHeight = gameWorldHeight;
        this.initialRadius = 250; // Starting radius of the safe zone
        this.minRadius = 80;    // Minimum radius before it disappears
        this.shrinkRate = 2;   // Pixels per second the radius shrinks
        this.respawnTime = 5;   // Seconds until a new zone spawns after old one disappears

        this.x = 0;
        this.y = 0;
        this.radius = this.initialRadius;
        this.active = false;      // Is the safe zone currently visible/active?
        this.respawnTimer = 0;    // Countdown for respawning a new zone
        this.healingRate = 10;    // Player healing rate per second when inside
        this.damageRate = 10;     // Player damage per second when outside (base amount)

        // Visual properties
        this.color = 'rgba(0, 255, 0, 0.2)'; // Green, semi-transparent
        this.borderColor = 'rgba(0, 255, 0, 0.8)'; // Green border

        this.spawn(); // Initial spawn when the game starts
    }

    // Spawns the safe zone at a new random location
    spawn() {
        // Ensure the zone spawns fully within the game world bounds
        this.radius = this.initialRadius; // Reset radius
        // Calculate max x/y to ensure the circle doesn't go off-screen
        this.x = Math.random() * (this.gameWorldWidth - this.initialRadius * 2) + this.initialRadius;
        this.y = Math.random() * (this.gameWorldHeight - this.initialRadius * 2) + this.initialRadius;
        this.active = true;
        this.respawnTimer = 0; // Reset timer
        console.log(`Safe House spawned at (${this.x.toFixed(0)}, ${this.y.toFixed(0)}) with radius ${this.radius.toFixed(0)}`);
    }

    update(deltaTime) {
        // Convert deltaTime from milliseconds to seconds
        const dtSeconds = deltaTime / 1000;

        if (this.active) {
            // Shrink the safe zone
            this.radius -= this.shrinkRate * dtSeconds;

            // Check if safe zone has shrunk too much
            if (this.radius <= this.minRadius) {
                this.active = false;
                this.respawnTimer = this.respawnTime; // Start countdown for respawn
                console.log("Safe House disappeared! Respawning in " + this.respawnTime + " seconds.");
            }
        } else {
            // Safe zone is not active, countdown to respawn
            this.respawnTimer -= dtSeconds;
            if (this.respawnTimer <= 0) {
                this.spawn(); // Time to spawn a new one!
            }
        }
    }

    draw(context, camera) {
        if (this.active) {
            context.save();
            context.beginPath();
            // Adjust for camera offset so it draws at correct world position
            context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            context.fillStyle = this.color;
            context.fill();
            context.strokeStyle = this.borderColor;
            context.lineWidth = 3; // Thicker border
            context.stroke();
            context.restore();

            // Optional: Draw a "SAFE ZONE" text above the circle, also adjusted for camera
            context.save();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '20px Arial';
            context.fillStyle = 'white';
            context.fillText('SAFE ZONE', this.x, this.y - this.radius - 20);
            context.restore();

        } else {
            // Optional: Display a message when safe zone is not active (on screen, not world coordinates)
            context.save();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '30px Arial';
            context.fillStyle = 'red';
            // Position relative to canvas center (using camera to get screen center)
            context.fillText('FIND NEW SAFE ZONE!', camera.x + camera.width / 2, camera.y + camera.height / 2 - 50);
            context.font = '20px Arial';
            context.fillText(`Respawning in: ${this.respawnTimer.toFixed(1)}s`, camera.x + camera.width / 2, camera.y + camera.height / 2);
            context.restore();
        }
    }

    // Helper to check if a given object (player/enemy) is inside the safe zone
    isInside(object) {
        if (!this.active) return false; // Can't be inside if not active
        // Calculate distance from the center of the safe zone to the object's center
        const distanceX = object.x - this.x;
        const distanceY = object.y - this.y;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        // Add a small buffer if object has its own radius/width
        // Assuming player has `size` and enemies have `width`
        const objectSize = object.size || object.width || 0;
        return distance < (this.radius - objectSize / 2);
    }
}


// --- Global State ---
let gameState = { isRunning: false, isAutoMode: false, gameTime: 0, lastTime: 0, enemySpawnTimer: 0, enemySpawnInterval: 1500, saveIntervalId: null, animationFrameId: null };
let enemies = [], projectiles = [], xpOrbs = [], particles = [], damageNumbers = [], lightningBolts = [], volcanicEruptions = [], visualEffects = [], skillTotems = [];
let world = { width: 3000, height: 2000 };

// MODIFIED: Renamed from `safeHouse` to `safeHouseInstance` to hold the class instance
let safeHouseInstance;

let camera = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
let screenFlash = { value: 0 };
let screenRedFlash = { value: 0 };

// NEW: Moved 'keys' and 'joystick' declarations here, with other global state
const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 };

// --- DOM and Canvas ---
let canvas, ctx, hudElements, menuElements; // Still for DOM elements that need `let`

// --- MASSIVELY EXPANDED UPGRADE POOL ---
const UPGRADE_POOL = [
    // === Core Offensive Upgrades ===
    { id: "might", title: "Might", maxLevel: 5, description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } },
    { id: "haste", title: "Haste", maxLevel: 5, description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } },
    { id: "multishot", title: "Multi-Shot", maxLevel: 4, description: (level) => `Fire ${level + 2} total projectiles.`, apply: (p) => { p.weapon.count += 1; } },
    { id: "impact", title: "Greater Impact", maxLevel: 3, description: (level) => `Increase projectile size by 25%. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; } },
    { id: "pierce", title: "Piercing Shots", maxLevel: 3, description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } },
    { id: "velocity", title: "Velocity", maxLevel: 5, description: (level) => `Projectiles travel 20% faster. (Lvl ${level+1})`, apply: (p) => { p.weapon.speed *= 1.20; } },

    // === Core Defensive Upgrades ===
    { id: "vitality", title: "Vitality", description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } },
    { id: "recovery", title: "Recovery", maxLevel: 3, description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } },
    { id: "agility", title: "Agility", maxLevel: 3, description: (level) => `Increase movement speed by 10%. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } },
    { id: "armor", title: "Armor", maxLevel: 5, description: (level) => `Reduce incoming damage by 1. (Lvl ${level+1})`, apply: (p) => { p.armor += 1; } },
    { id: "dodge", title: "Evasion", maxLevel: 4, description: (level) => `+5% chance to dodge attacks. (Lvl ${level+1})`, apply: (p) => { p.dodgeChance += 0.05; } },

    // === Core Utility Upgrades ===
    { id: "wisdom", title: "Wisdom", maxLevel: 3, description: (level) => `Gain ${20 * (level + 1)}% more XP. (Lvl ${level + 1})`, apply: (p) => { p.xpGainModifier += 0.20; } },
    { id: "greed", title: "Greed", maxLevel: 3, description: (level) => `Increase XP pickup radius by 50%. (Lvl ${level + 1})`, apply: (p) => { p.pickupRadius *= 1.50; } },
    { id: "magnetism", title: "Magnetism", maxLevel: 4, description: (level) => `XP orbs are pulled towards you faster. (Lvl ${level+1})`, apply: (p) => { p.magnetism *= 1.5; } },
    { id: "rejuvenation", title: "Rejuvenation", maxLevel: 1, description: () => `Picking up an XP orb has a 10% chance to heal 1 HP.`, apply: (p) => { p.abilities.healOnXp = true; } },

    // === Critical Hit Synergy ===
    { id: "lethality", title: "Lethality", maxLevel: 5, description: (level) => `+10% chance to deal double damage. (Lvl ${level + 1})`, apply: (p) => { p.weapon.critChance += 0.1; } },
    { id: "overwhelm", title: "Overwhelm", maxLevel: 5, description: (level) => `Critical hits do +50% more damage. (Lvl ${level+1})`, apply: (p) => { p.weapon.critDamage += 0.5; } },
    { id: "crit_explosion", title: "Critical Mass", maxLevel: 1, description: () => `Critical hits cause a small explosion.`, apply: (p) => { p.abilities.critExplosion = true; } },

    // === Ability Upgrades ===
    { id: "soul_vortex", title: "Soul Vortex", maxLevel: 1, description: () => `Gain an orbiting soul that damages enemies.`, apply: (p) => { p.abilities.orbitingShield.enabled = true; } },
    { id: "rear_guard", title: "Rear Guard", maxLevel: 1, description: () => `Fire a projectile behind you.`, apply: (p) => { p.abilities.backShot = true; } },
    { id: "crossfire", title: "Crossfire", maxLevel: 1, description: () => `Fire projectiles diagonally.`, apply: (p) => { p.abilities.diagonalShot = true; } },
    { id: "soul_nova", title: "Soul Nova", maxLevel: 1, description: () => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; triggerNova(p, 50, 200); } },
    { id: "thorns", title: "Thorns", maxLevel: 3, description: (level) => `Enemies that hit you take ${5 * (level+1)} damage.`, apply: (p) => { p.thorns += 5; } },
    { id: "life_steal", title: "Life Steal", maxLevel: 3, description: (level) => `Heal for ${level+1} HP on kill.`, apply: (p) => { p.lifeSteal += 1; } },
    { id: "demolition", title: "Demolition", maxLevel: 1, description: () => `Projectiles explode on their first hit.`, apply: (p) => { p.weapon.explodesOnImpact = true; } },

    // === Soul Vortex Synergy ===
    { id: "vortex_damage", title: "Vortex: Sharpen", maxLevel: 5, skill: "soul_vortex", description: (level) => `Soul Vortex deals +5 damage. (Lvl ${level + 1})`, apply: (p) => { p.abilities.orbitingShield.damage += 5; } },
    { id: "vortex_speed", title: "Vortex: Accelerate", maxLevel: 3, skill: "soul_vortex", description: (level) => `Soul Vortex orbits faster. (Lvl ${level+1})`, apply: (p) => { p.abilities.orbitingShield.speed = (p.abilities.orbitingShield.speed || 1) * 1.25; } },
    { id: "vortex_twin", title: "Vortex: Twin Souls", maxLevel: 1, skill: "soul_vortex", description: () => `Gain a second orbiting soul.`, apply: (p) => { p.abilities.orbitingShield.count = 2; } },

    // === Lightning Skill Synergy ===
    { id: "lightning_damage", title: "Lightning: High Voltage", maxLevel: 5, skill: "lightning", description: (level) => `Increase lightning damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.damage += 5; } },
    { id: "lightning_chains", title: "Lightning: Chain Lightning", maxLevel: 4, skill: "lightning", description: (level) => `Lightning chains to ${level + 2} enemies.`, apply: (p) => { p.skills.lightning.chains += 1; } },
    { id: "lightning_cooldown", title: "Lightning: Storm Caller", maxLevel: 3, skill: "lightning", description: () => `Lightning strikes more frequently.`, apply: (p) => { p.skills.lightning.cooldown *= 0.8; } },
    { id: "lightning_shock", title: "Lightning: Static Field", maxLevel: 3, skill: "lightning", description: (level) => `Lightning shocks enemies, dealing damage over time. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.shockDuration += 1000; } },
    { id: "lightning_fork", title: "Lightning: Fork", maxLevel: 2, skill: "lightning", description: () => `Each lightning strike has a chance to fork.`, apply: (p) => { p.skills.lightning.forkChance = (p.skills.lightning.forkChance || 0) + 0.15; } },

    // === Volcano Skill Synergy ===
    { id: "volcano_damage", title: "Volcano: Magma Core", maxLevel: 5, skill: "volcano", description: (level) => `Increase eruption damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.damage += 10; } },
    { id: "volcano_radius", title: "Volcano: Wide Eruption", maxLevel: 3, skill: "volcano", description: (level) => `Increase eruption radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.radius *= 1.2; } },
    { id: "volcano_cooldown", title: "Volcano: Frequent Fissures", maxLevel: 3, skill: "volcano", description: (level) => `Eruptions occur more frequently. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.cooldown *= 0.8; } },
    { id: "volcano_duration", title: "Volcano: Scorched Earth", maxLevel: 3, skill: "volcano", description: () => `Burning ground lasts longer.`, apply: (p) => { p.skills.volcano.burnDuration *= 1.3; } },
    { id: "volcano_count", title: "Volcano: Cluster Bombs", maxLevel: 2, skill: "volcano", description: () => `Volcano creates an extra eruption.`, apply: (p) => { p.skills.volcano.count = (p.skills.volcano.count || 1) + 1; } },

    // === Frost Nova Skill Synergy ===
    { id: "frostnova_damage", title: "Frost Nova: Deep Freeze", maxLevel: 5, skill: "frostNova", description: (level) => `Increase Frost Nova damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.damage += 5; } },
    { id: "frostnova_radius", title: "Frost Nova: Absolute Zero", maxLevel: 3, skill: "frostNova", description: (level) => `Increase Frost Nova radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.radius *= 1.25; } },
    { id: "frostnova_cooldown", title: "Frost Nova: Winter's Grasp", maxLevel: 3, skill: "frostNova", description: () => `Cast Frost Nova more frequently.`, apply: (p) => { p.skills.frostNova.cooldown *= 0.8; } },
    { id: "frostnova_slow", title: "Frost Nova: Crippling Cold", maxLevel: 2, skill: "frostNova", description: () => `Frost Nova's slow is more effective.`, apply: (p) => { p.skills.frostNova.slowAmount += 0.1; } },

    // === Black Hole Skill Synergy ===
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
        upgradeStatsList: document.getElementById('upgrade-stats-list'), // NEW: Get reference to the new list container
    };

    initRift();
    setupEventListeners();
    checkSaveStates();
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

    menuElements.newGameBtn.addEventListener('click', () => startGame(true));
    menuElements.googleSignInBtn.addEventListener('click', signInWithGoogle);
    menuElements.signOutBtn.addEventListener('click', () => auth.signOut());

    hudElements.restartButton.addEventListener('click', () => {
        hudElements.gameOverScreen.classList.remove('visible');
        menuElements.mainMenu.classList.add('visible');
        hudElements.gameContainer.style.visibility = 'hidden';
        checkSaveStates();
    });
    hudElements.autoModeButton.addEventListener('click', () => { gameState.isAutoMode = !gameState.isAutoMode; hudElements.autoModeButton.textContent = gameState.isAutoMode ? 'AUTO ON' : 'AUTO OFF'; hudElements.autoModeButton.classList.toggle('auto-on', gameState.isAutoMode); });

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
function signInWithGoogle() { auth.signInWithPopup(googleProvider).catch(error => { console.error("Google Sign-In Error:", error); alert("Could not sign in with Google. Please try again."); }); }
async function checkSaveStates() {
    const localSaveExists = !!localStorage.getItem('survivorSaveData');
    let cloudSaveExists = false;
    if (currentUser) {
        const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
        const doc = await saveRef.get().catch(e => console.error(e));
        if (doc && doc.exists) cloudSaveExists = true;
    }
    menuElements.loadOptionsContainer.innerHTML = '';
    if (cloudSaveExists) {
        const cloudBtn = document.createElement('button');
        cloudBtn.className = 'menu-button'; cloudBtn.textContent = 'Load Cloud Save';
        cloudBtn.onclick = () => startGame(false, 'cloud');
        menuElements.loadOptionsContainer.appendChild(cloudBtn);
    }
    if (localSaveExists) {
        const localBtn = document.createElement('button');
        localBtn.className = 'menu-button'; localBtn.textContent = 'Load Local Save';
        localBtn.onclick = () => startGame(false, 'local');
        menuElements.loadOptionsContainer.appendChild(localBtn);
    }
    if (!cloudSaveExists && !localSaveExists) {
        const noSaveBtn = document.createElement('button');
        noSaveBtn.className = 'menu-button'; noSaveBtn.textContent = 'No Save Found'; noSaveBtn.disabled = true;
        menuElements.loadOptionsContainer.appendChild(noSaveBtn);
    }
}
async function saveGame() {
    if (!player || !gameState.isRunning) return;
    const savablePlayer = JSON.parse(JSON.stringify(player));
    const saveData = {
        player: savablePlayer,
        gameTime: gameState.gameTime,
        skillTotems: skillTotems,
        world: world,
        // NEW: Save SafeHouse state if needed (optional for now, as it respawns on load)
        safeHouse: safeHouseInstance ? {
            x: safeHouseInstance.x,
            y: safeHouseInstance.y,
            radius: safeHouseInstance.radius,
            active: safeHouseInstance.active,
            respawnTimer: safeHouseInstance.respawnTimer,
        } : null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (currentUser) {
        const saveRef = firestore.collection('users').doc(currentUser.uid).collection('gameSaves').doc('default');
        try { await saveRef.set(saveData); } catch (error) { console.error("Error saving to cloud:", error); }
    }
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
        skillTotems = savedData.skillTotems || [];
        if (savedData.world) { world.width = savedData.world.width; world.height = savedData.world.height; }

        // NEW: Load SafeHouse state if available, otherwise it will spawn a new one
        if (savedData.safeHouse && safeHouseInstance) {
            safeHouseInstance.x = savedData.safeHouse.x;
            safeHouseInstance.y = savedData.safeHouse.y;
            safeHouseInstance.radius = savedData.safeHouse.radius;
            safeHouseInstance.active = savedData.safeHouse.active;
            safeHouseInstance.respawnTimer = savedData.safeHouse.respawnTimer;
            console.log("SafeHouse state loaded.");
        } else if (safeHouseInstance) {
             safeHouseInstance.spawn(); // Ensure a safehouse exists even if not saved
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
// MODIFIED: Updated takeDamage function to use playerTakeDamage and manage thorns
function takeDamage(amount, isDirectHit = false) { // Default to false for continuous damage
    // Call player's dedicated takeDamage function, passing necessary state
    playerTakeDamage(amount, gameState.gameTime, spawnDamageNumber, screenRedFlash);

    // Thorns logic remains here because it needs access to the enemies array
    // Only trigger thorns on direct hits, not continuous zone damage
    if (player.thorns > 0 && isDirectHit) {
        enemies.forEach(e => {
            // Check if enemy is close enough to trigger thorns (e.g., collision range)
            if (Math.hypot(e.x - player.x, e.y - player.y) < player.size + (e.width || 0) + 10) {
                e.health -= player.thorns;
                spawnDamageNumber(e.x, e.y, player.thorns, false);
            }
        });
    }

    // Check if player health is now <= 0 AFTER playerTakeDamage has updated it
    if (player.health <= 0) {
        player.health = 0; // Ensure health doesn't go below 0 visually
        gameOver();
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
        const sourceToLoad = currentUser ? loadSource : 'local';
        loadedSuccessfully = await loadGame(sourceToLoad);
    }
    if (forceNew || !loadedSuccessfully) {
        clearSave();
        world.width = 3000; world.height = 2000;
        initPlayer(world); // Ensure player is initialized BEFORE SafeHouse needs its size
        gameState.gameTime = 0;
        // MODIFIED: Add new skill totems to the world
        skillTotems = [
            { x: world.width / 2 - 200, y: world.height / 2 - 200, radius: 30, skill: 'lightning', color: 'var(--lightning-color)', icon: '⚡' },
            { x: world.width / 2 + 200, y: world.height / 2 + 200, radius: 30, skill: 'volcano', color: 'var(--volcano-color)', icon: '🔥' },
            { x: world.width / 2 + 200, y: world.height / 2 - 200, radius: 30, skill: 'frostNova', color: '#87CEEB', icon: '❄️' },
            { x: world.width / 2 - 200, y: world.height / 2 + 200, radius: 30, skill: 'blackHole', color: '#483D8B', icon: '🌀' },
        ];
    }
    initRift();

    // NEW: Initialize SafeHouse instance here. This ensures it's always created.
    // If `loadedSuccessfully` is true, the `loadGame` function will update its state.
    // Otherwise, `SafeHouse` constructor will call `spawn()` for a new one.
    safeHouseInstance = new SafeHouse(world.width, world.height);

    gameState.lastTime = performance.now();
    gameState.enemySpawnTimer = 0;
    gameState.enemySpawnInterval = Math.max(100, gameState.enemySpawnInterval * 0.985);
    enemies.length = 0; projectiles.length = 0; xpOrbs.length = 0; particles.length = 0; damageNumbers.length = 0; lightningBolts.length = 0; volcanicEruptions.length = 0; visualEffects.length = 0;
    // REMOVED: Old safeHouse initialization line, now handled by SafeHouse class constructor
    // safeHouse = { x: world.width / 2, y: world.height / 2, radius: 150, healingRate: 10 };
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
    let closestEnemy = null, closestEnemyDist = Infinity;
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < closestEnemyDist) { closestEnemyDist = dist; closestEnemy = enemy; }
    });
    let closestTotem = null, closestTotemDist = Infinity;
    skillTotems.forEach(totem => {
        const dist = Math.hypot(totem.x - player.x, totem.y - player.y);
        if(dist < closestTotemDist) { closestTotemDist = dist; closestTotem = totem; }
    });

    // NEW: AI logic to prioritize moving towards SafeHouse if not active, or staying in if active
    let target = closestEnemy; // Default target
    let targetDist = closestEnemyDist;
    const SAFE_HOUSE_PRIORITY = 500; // How much AI prioritizes the safe house

    if (safeHouseInstance && !safeHouseInstance.active && safeHouseInstance.respawnTimer > 1) { // If safe zone is gone and respawning
        // AI prioritizes getting to where the new safe zone will be or finding it
        // For simplicity, let's make it try to move towards the center of the world or last known safe zone location
        // Or, more accurately, we'd need a target for where the NEW one will spawn.
        // For now, let's keep enemy/orb priority for AI. The player's AI is more complex.
    } else if (safeHouseInstance && safeHouseInstance.active) { // If safe zone is active
        if (!safeHouseInstance.isInside(player)) {
            // Player is outside, prioritize moving into the safe zone
            target = safeHouseInstance;
            targetDist = Math.hypot(safeHouseInstance.x - player.x, safeHouseInstance.y - player.y);
        }
    }


    if (closestOrb && closestOrbDist < XP_PRIORITY_RADIUS) target = closestOrb;
    if (closestTotem && (!player.skills[closestTotem.skill].isUnlocked || (player.abilities.orbitingShield.enabled && closestTotem.skill === 'soul_vortex'))) target = closestTotem; // Only go for totems if skill is not unlocked or its the soul vortex if not enabled

    // If we have a preferred target from the AI logic above (like safe zone or specific totem)
    if (target && target !== closestEnemy) { // if the target is not the default closest enemy
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        if (dist > 0) {
            const weight = (target === closestTotem || target === safeHouseInstance) ? TOTEM_WEIGHT * 2 : ATTRACTION_WEIGHT; // Give more weight to safezone/totems
            attraction.x = (target.x - player.x) / dist * weight;
            attraction.y = (target.y - player.y) / dist * weight;
        }
    } else if (closestEnemy) { // Fallback to closest enemy if no other strong target
        const dist = Math.hypot(closestEnemy.x - player.x, closestEnemy.y - player.y);
         if (dist > 0) {
            attraction.x = (closestEnemy.x - player.x) / dist * ATTRACTION_WEIGHT;
            attraction.y = (closestEnemy.y - player.y) / dist * ATTRACTION_WEIGHT;
        }
    }

    return { x: attraction.x + (repulsion.x * REPULSION_WEIGHT), y: attraction.y + (repulsion.y * REPULSION_WEIGHT) };
}

function gameLoop(timestamp) { if (!gameState.isRunning) return; const deltaTime = timestamp - gameState.lastTime; gameState.lastTime = timestamp; gameState.gameTime += deltaTime; update(deltaTime); draw(); gameState.animationFrameId = requestAnimationFrame(gameLoop); }
function update(deltaTime) {
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
    camera.x = player.x - camera.width / 2; camera.y = player.y - camera.height / 2;
    camera.x = Math.max(0, Math.min(world.width - camera.width, camera.x));
    camera.y = Math.max(0, Math.min(world.height - camera.height, camera.y));

    // Update the SafeHouse and apply its effects
    if (safeHouseInstance) { // Ensure it's initialized
        safeHouseInstance.update(deltaTime);

        // --- Apply Safe House Effects ---
        // Player interaction: ONLY HEALING, NO DAMAGE WHEN OUTSIDE
        if (safeHouseInstance.active && safeHouseInstance.isInside(player)) {
            // Player is safe: Heal (using player's healthRegen + safehouse healing)
            player.health = Math.min(player.maxHealth, player.health + (player.healthRegen + safeHouseInstance.healingRate) * (deltaTime / 1000));
        }
        // Removed: Else (player is outside) takeDamage calls

        // Enemy interaction: Assuming enemies have a `speedMultiplier` property
        enemies.forEach(enemy => {
            if (safeHouseInstance.active && safeHouseInstance.isInside(enemy)) {
                // Enemy is inside safe zone: Slow down
                enemy.speedMultiplier = 0.5; // Half speed
            } else {
                // Enemy is outside safe zone (or zone is inactive): Normal speed
                enemy.speedMultiplier = 1.0;
            }
        });
    }

    gameState.enemySpawnTimer += deltaTime;
    if (gameState.enemySpawnTimer > gameState.enemySpawnInterval) {
        spawnEnemy(enemies);
        gameState.enemySpawnTimer = 0;
        gameState.enemySpawnInterval = Math.max(100, gameState.enemySpawnInterval * 0.985);
    }
    const gainXPCallback = (amount) => gainXP(amount, showLevelUpOptions, () => expandWorld(camera, player), triggerNova, camera);
    updateEnemies(deltaTime, enemies, player, showLevelUpOptions, gainXPCallback);

    // Filter out enemies marked for deletion after their update
    enemies = enemies.filter(enemy => !enemy.markedForDeletion);

    for (let i = skillTotems.length - 1; i >= 0; i--) {
        const totem = skillTotems[i];
        if (Math.hypot(player.x - totem.x, player.y - totem.y) < player.size + totem.radius) {
            player.skills[totem.skill].isUnlocked = true;
            skillTotems.splice(i, 1);
        }
    }
    // ADDED: Update calls for new skills
    updateLightning(deltaTime, player);
    updateVolcano(deltaTime, player);
    updateFrostNova(deltaTime, player);
    updateBlackHole(deltaTime, player);

    const updateEntityArray = (arr, dt, extra) => { for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].update(dt, extra)) arr.splice(i, 1); } };
    updateEntityArray(projectiles, deltaTime); updateEntityArray(xpOrbs, deltaTime, closestDist); updateEntityArray(particles, deltaTime);
    updateEntityArray(damageNumbers, deltaTime); updateEntityArray(lightningBolts, deltaTime); updateEntityArray(volcanicEruptions, deltaTime); updateEntityArray(visualEffects, deltaTime);
    handleCollisions();
}
function handleCollisions() {
    projectiles.forEach(p => {
        if (p.pierce < p.hitEnemies.length) return;
        enemies.forEach(e => {
            if (p.hitEnemies.includes(e)) return;
            // MODIFIED: Changed collision check to consider enemy width for better accuracy
            const combinedRadius = (p.size?.w || 10) + (e.width || 20); // Default to a size if not defined
            if (Math.hypot(e.x - p.x, e.y - p.y) < combinedRadius / 2) { // Check distance vs half combined size
                // ADDED: Logic for projectile explosions and crit explosions
                if (p.explodesOnImpact && p.hitEnemies.length === 0) {
                    triggerNova({x: e.x, y: e.y}, p.explosionDamage, p.explosionRadius);
                }
                const isCrit = Math.random() < p.critChance;
                const damage = isCrit ? Math.round(p.damage * p.critDamage) : p.damage;
                if(isCrit && player.abilities.critExplosion) {
                    triggerNova({x: e.x, y: e.y}, damage / 2, 80);
                }
                e.health -= damage;
                p.hitEnemies.push(e);
                createImpactParticles(e.x, e.y, 10);
                spawnDamageNumber(e.x, e.y, Math.round(damage), isCrit);
            }
        });
    });
    enemies.forEach(e => {
        // MODIFIED: Changed collision check to consider enemy width/player size
        const combinedRadius = player.size + (e.width || 20); // Assuming player.size is radius
        if (Math.hypot(e.x - player.x, e.y - player.y) < combinedRadius / 2) {
            // Player takes damage directly from enemy contact.
            // This is a direct hit, so invincibility frames should apply.
            takeDamage(e.damage || 10, true); // MODIFIED: Pass `true` for `isDirectHit`
            e.health = -1; // Enemies die on contact for simplicity, adjust if they have health.
        }
    });
    const shield = player.abilities.orbitingShield;
    if (shield.enabled) {
        const count = shield.count || 1;
        for(let i=0; i<count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            if (gameState.gameTime - (shield.lastHitTime?.[i] || 0) > shield.cooldown) {
                const shieldX = player.x + Math.cos(angle) * shield.distance;
                const shieldY = player.y + Math.sin(angle) * shield.distance; // Corrected: removed the second Math.sin(angle)
                enemies.forEach(e => {
                    const combinedRadius = 15 + (e.width || 20); // Shield size (15) + enemy size
                    if (Math.hypot(e.x - shieldX, e.y - shieldY) < combinedRadius / 2) {
                        e.health -= shield.damage;
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

    // NEW: Draw the SafeHouse using its own draw method
    if (safeHouseInstance) {
        safeHouseInstance.draw(ctx, camera); // Pass context and camera
    }

    drawWorldElements(); // This now only draws skill totems, etc., not the old safeHouse
    projectiles.forEach(p => drawProjectile(p));
    enemies.forEach(e => drawEnemy(e));
    const playerBlink = (gameState.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0;
    if (!playerBlink) drawPlayer(player, player.angle);
    drawParticlesAndEffects();
    ctx.restore();
    if (screenRedFlash.value > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${screenRedFlash.value * 0.4})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenRedFlash.value -= 0.04; }
    if (screenFlash.value > 0) { ctx.fillStyle = `rgba(200, 225, 255, ${screenFlash.value})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenFlash.value -= 0.05; }
    if (joystick.active && !gameState.isAutoMode) drawJoystick(); updateHUD();
}
// MODIFIED: drawWorldElements function (removed old safeHouse drawing code)
function drawWorldElements() {
    // Keep skill totems and other world elements
    skillTotems.forEach(totem => drawSkillTotem(totem));
    lightningBolts.forEach(bolt => drawLightningBolt(bolt));
    volcanicEruptions.forEach(v => drawVolcano(v));
    xpOrbs.forEach(orb => drawXpOrb(orb));
}
function drawParticlesAndEffects() {
    visualEffects.forEach(effect => {
        const lifePercent = effect.life / effect.maxLife; // More generic life percentage
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
            const shieldY = player.y + Math.sin(angle) * shield.distance; // Corrected: removed the second Math.sin(angle)
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
function drawPlayer(p, angle) { const bob = Math.sin(gameState.gameTime / 250) * 2; ctx.save(); ctx.translate(p.x, p.y + bob); const hoverPulse = Math.sin(gameState.gameTime / 400); ctx.beginPath(); ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.2 + hoverPulse * 0.1; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; ctx.save(); ctx.rotate(angle); const auraPulse = Math.sin(gameState.gameTime / 200); ctx.beginPath(); ctx.arc(0, 0, 30, -1.9, 1.9); ctx.strokeStyle = 'var(--player-aura-color)'; ctx.lineWidth = 4 + auraPulse * 2; ctx.shadowColor = 'var(--player-aura-color)'; ctx.shadowBlur = 15 + auraPulse * 10; ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(8, 15); ctx.lineTo(0, 10); ctx.lineTo(-8, 15); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(-5, -15, 10, 10); ctx.restore(); ctx.restore(); }
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

    // NEW: Update active upgrade stats list
    hudElements.upgradeStatsList.innerHTML = ''; // Clear existing list

    // Define base stats for calculations (if you change player's base speed/cooldown, update these)
    const BASE_PLAYER_SPEED = 3.5;
    const BASE_WEAPON_COOLDOWN = 600; // milliseconds

    // Sort upgrades by ID for consistent display order
    const sortedUpgradeIds = Object.keys(player.upgradeLevels).sort();

    for (const upgradeId of sortedUpgradeIds) {
        const level = player.upgradeLevels[upgradeId];
        const upgradeDef = UPGRADE_POOL.find(up => up.id === upgradeId);

        if (upgradeDef) {
            let displayText = `${upgradeDef.title}: `;
            let statValue = '';

            // Custom display logic for specific upgrades
            switch (upgradeId) {
                case "vitality":
                    statValue = `${player.maxHealth} Max HP`;
                    break;
                case "recovery":
                    statValue = `${(player.healthRegen).toFixed(1)} HP/s`;
                    break;
                case "agility":
                    statValue = `${((player.speed / BASE_PLAYER_SPEED) * 100).toFixed(0)}% Speed`;
                    break;
                case "armor":
                    statValue = `${player.armor} Armor`;
                    break;
                case "dodge":
                    statValue = `${(player.dodgeChance * 100).toFixed(0)}% Dodge`;
                    break;
                case "wisdom":
                    statValue = `${(player.xpGainModifier * 100).toFixed(0)}% XP`;
                    break;
                case "greed":
                    statValue = `${player.pickupRadius} Pickup Radius`;
                    break;
                case "magnetism":
                    statValue = `${(player.magnetism).toFixed(1)}x Magnetism`;
                    break;
                case "lethality":
                    statValue = `${(player.weapon.critChance * 100).toFixed(0)}% Crit Chance`;
                    break;
                case "overwhelm":
                    statValue = `${(player.weapon.critDamage * 100).toFixed(0)}% Crit Damage`;
                    break;
                case "might":
                    statValue = `${player.weapon.damage} Damage`;
                    break;
                case "haste":
                    statValue = `${(1000 / player.weapon.cooldown).toFixed(1)} Atk/s`; // Attacks per second
                    break;
                case "multishot":
                    statValue = `${player.weapon.count} Projectiles`;
                    break;
                case "impact":
                    statValue = `${player.weapon.size.h.toFixed(0)} Projectile Size`; // Using 'h' as a representative size
                    break;
                case "pierce":
                    statValue = `${player.weapon.pierce} Pierce`;
                    break;
                case "velocity":
                    statValue = `${player.weapon.speed.toFixed(1)} Projectile Speed`;
                    break;
                case "thorns":
                    statValue = `${player.thorns} Thorns Damage`;
                    break;
                case "life_steal":
                    statValue = `${player.lifeSteal} Life Steal`;
                    break;
                // --- Skill-specific stats ---
                case "lightning":
                case "lightning_damage":
                    statValue = `${player.skills.lightning.damage} Lightning Damage`;
                    break;
                case "lightning_chains":
                    statValue = `${player.skills.lightning.chains} Lightning Chains`;
                    break;
                case "lightning_cooldown":
                    statValue = `${(player.skills.lightning.cooldown / 1000).toFixed(1)}s Lightning CD`;
                    break;
                case "lightning_shock":
                    statValue = `${(player.skills.lightning.shockDuration / 1000).toFixed(1)}s Shock Duration`;
                    break;
                case "lightning_fork":
                    statValue = `${(player.skills.lightning.forkChance * 100).toFixed(0)}% Lightning Fork`;
                    break;
                case "volcano":
                case "volcano_damage":
                    statValue = `${player.skills.volcano.damage} Volcano Damage`;
                    break;
                case "volcano_radius":
                    statValue = `${player.skills.volcano.radius} Volcano Radius`;
                    break;
                case "volcano_cooldown":
                    statValue = `${(player.skills.volcano.cooldown / 1000).toFixed(1)}s Volcano CD`;
                    break;
                case "volcano_duration":
                    statValue = `${(player.skills.volcano.burnDuration / 1000).toFixed(1)}s Burn Duration`;
                    break;
                case "volcano_count":
                    statValue = `${player.skills.volcano.count || 1} Volcano Count`; // Default to 1 if not set
                    break;
                case "frostNova":
                case "frostnova_damage":
                    statValue = `${player.skills.frostNova.damage} Frost Nova Damage`;
                    break;
                case "frostnova_radius":
                    statValue = `${player.skills.frostNova.radius} Frost Nova Radius`;
                    break;
                case "frostnova_cooldown":
                    statValue = `${(player.skills.frostNova.cooldown / 1000).toFixed(1)}s Frost Nova CD`;
                    break;
                case "frostnova_slow":
                    statValue = `${(player.skills.frostNova.slowAmount * 100).toFixed(0)}% Slow`;
                    break;
                case "blackHole":
                case "blackhole_damage":
                    statValue = `${player.skills.blackHole.damage} Black Hole Damage`;
                    break;
                case "blackhole_radius":
                    statValue = `${player.skills.blackHole.radius} Black Hole Radius`;
                    break;
                case "blackhole_duration":
                    statValue = `${(player.skills.blackHole.duration / 1000).toFixed(1)}s Black Hole Duration`;
                    break;
                case "blackhole_pull":
                    statValue = `${player.skills.blackHole.pullStrength.toFixed(1)} Pull Strength`;
                    break;
                case "soul_vortex":
                case "vortex_damage":
                    statValue = `${player.abilities.orbitingShield.damage} Vortex Damage`;
                    break;
                case "vortex_speed":
                    statValue = `${(player.abilities.orbitingShield.speed || 1).toFixed(1)}x Vortex Speed`;
                    break;
                case "vortex_twin":
                    statValue = `${player.abilities.orbitingShield.count} Vortex Count`;
                    break;

                // Abilities that are just "Active"
                case "rear_guard":
                case "diagonalShot": // Corrected from crossfire
                case "novaOnLevelUp":
                case "healOnXp":
                case "crit_explosion":
                case "demolition":
                    statValue = `Active`;
                    break;
                default:
                    // Fallback for any other upgrade, display its level
                    statValue = `Lv ${level}`;
                    break;
            }

            const p = document.createElement('p');
            p.className = 'upgrade-stat-item';
            p.innerHTML = `${upgradeDef.title}: <strong>${statValue}</strong>`; // Using strong for the value
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
        // Logic to show skill upgrades only if the base skill is unlocked
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

// IMPORTANT: Update the export list to export the SafeHouse instance as `safeHouse`
export {
    gameState, keys, joystick, world, camera, enemies, projectiles, xpOrbs, particles,
    damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems,
    safeHouseInstance as safeHouse, // Export the instance under the original name
    screenFlash, screenRedFlash, UPGRADE_POOL
};
