// systemsmanager.js

import { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage as playerTakeDamage } from './player.js';
import { enemyPath, spawnEnemy, updateEnemies, drawEnemy } from './enemies.js';
import { fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber, updateFrostNova, updateBlackHole, fireHyperBeam, drawSoulVortex } from './attacks_skills.js';
import { initRift, expandWorld, getBackgroundCanvas } from './rift.js';

let auth, firestore, googleProvider, currentUser;

const firebaseConfig = {
    apiKey: "AIzaSyAvutjrwWBsZ_5bCPN-nbL3VpP2NQ94EUY",
    authDomain: "tap-guardian-rpg.firebaseapp.com",
    projectId: "tap-guardian-rpg",
    storageBucket: "tap-guardian-rpg.firebaseapp.com",
    messagingSenderId: "50272459426",
    appId: "1:50272459426:web:8f67f9126d3bc3a23a15fb",
    measurementId: "G-XJRE7YNPZR"
};

const MINUTE_INTERVAL = 60000;

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
        this.x = Math.random() * (this.gameWorldWidth - this.initialRadius * 2) + this.initialRadius;
        this.y = Math.random() * (this.gameWorldHeight - this.initialRadius * 2) + this.initialRadius;
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
}

let gameState = {
    isRunning: false,
    isAutoMode: false,
    gameTime: 0,
    lastTime: 0,
    enemySpawnTimer: 0,
    enemySpawnInterval: 1500,
    saveIntervalId: null,
    animationFrameId: null,

    // Level Up Timer properties
    levelUpTimerActive: false,
    levelUpTimerStartTime: 0,
    levelUpTimerDuration: 10000, // 10 seconds in milliseconds
    availableLevelUpOptions: [], // To store the options that were presented
};

let enemies = [], projectiles = [], xpOrbs = [], particles = [], damageNumbers = [], lightningBolts = [], volcanicEruptions = [], visualEffects = [], skillTotems = [];
let world = { width: 3000, height: 2000 };

let safeHouseInstance;

let camera = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
let screenFlash = { value: 0 };
let screenRedFlash = { value: 0 };
let screenShake = { intensity: 0, duration: 0, timer: 0 };
let manualHyperBeamTrigger = false;

const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 };

let nextMinuteUpgradeTime = MINUTE_INTERVAL;

let canvas, ctx, hudElements, menuElements;

const UPGRADE_POOL = [
    { id: "might", title: "Might", description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } },
    { id: "haste", title: "Haste", description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } },
    { id: "multishot", title: "Multi-Shot", description: (level) => `Fire ${level + 1} more projectile(s).`, apply: (p) => { p.weapon.count += 1; } },
    { id: "impact", title: "Greater Impact", description: (level) => `Increase projectile size by 25%. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; } },
    { id: "pierce", title: "Piercing Shots", description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } },
    { id: "velocity", title: "Velocity", description: (level) => `Projectiles travel 20% faster. (Lvl ${level+1})`, apply: (p) => { p.weapon.speed *= 1.20; } },
    { id: "vitality", title: "Vitality", description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } },
    { id: "recovery", title: "Recovery", description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } },
    { id: "agility", title: "Agility", maxLevel: 10, description: (level) => `Increase movement speed by 10%. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } },
    { id: "armor", title: "Armor", description: (level) => `Reduce incoming damage by 1. (Lvl ${level+1})`, apply: (p) => { p.armor += 1; } },
    { id: "dodge", title: "Evasion", description: (level) => `+5% chance to dodge attacks. (Lvl ${level+1})`, apply: (p) => { p.dodgeChance += 0.05; } },
    { id: "wisdom", title: "Wisdom", description: (level) => `Gain ${20 * (level + 1)}% more XP. (Lvl ${level + 1})`, apply: (p) => { p.xpGainModifier += 0.20; } },
    { id: "greed", title: "Greed", description: (level) => `Increase XP pickup radius by 50%. (Lvl ${level + 1})`, apply: (p) => { p.pickupRadius *= 1.50; } },
    { id: "magnetism", title: "Magnetism", description: (level) => `XP orbs are pulled towards you faster. (Lvl ${level+1})`, apply: (p) => { p.magnetism *= 1.5; } },
    { id: "rejuvenation", title: "Rejuvenation", description: () => `Picking up an XP orb has a 10% chance to heal 1 HP.`, apply: (p) => { p.abilities.healOnXp = true; } },
    { id: "lethality", title: "Lethality", description: (level) => `+10% chance to deal double damage. (Lvl ${level + 1})`, apply: (p) => { p.weapon.critChance += 0.1; } },
    { id: "overwhelm", title: "Overwhelm", description: (level) => `Critical hits do +50% more damage. (Lvl ${level+1})`, apply: (p) => { p.weapon.critDamage += 0.5; } },
    { id: "crit_explosion", title: "Critical Mass", description: () => `Critical hits cause a small explosion.`, apply: (p) => { p.abilities.critExplosion = true; } },
    {
        id: "soul_vortex",
        title: "Soul Vortex",
        description: () => `Gain an orbiting soul that damages enemies.`,
        apply: (p) => {
            p.abilities.orbitingShield = {
                enabled: true,
                damage: 10,
                speed: 1,
                count: 1,
            };
        }
    },
    { id: "rear_guard", title: "Rear Guard", description: () => `Fire a projectile behind you.`, apply: (p) => { p.abilities.backShot = true; } },
    { id: "crossfire", title: "Crossfire", description: () => `Fire projectiles diagonally.`, apply: (p) => { p.abilities.diagonalShot = true; } },
    { id: "soul_nova", title: "Soul Nova", description: () => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; triggerNova(p, 50, 200);} },
    { id: "thorns", title: "Thorns", description: (level) => `Enemies that hit you take ${5 * (level+1)} damage.`, apply: (p) => { p.thorns += 5; } },
    { id: "life_steal", title: "Life Steal", description: (level) => `Heal for ${level+1} HP on kill.`, apply: (p) => { p.lifeSteal += 1; } },
    { id: "demolition", title: "Demolition", description: () => `Projectiles explode on their first hit.`, apply: (p) => { p.weapon.explodesOnImpact = true; } },

    {
        id: "vortex_damage",
        title: "Vortex: Sharpen",
        maxLevel: 15,
        skill: "soul_vortex",
        description: (level) => `Soul Vortex deals +5 damage. (Lvl ${level + 1})`,
        apply: (p) => { p.abilities.orbitingShield.damage += 5; }
    },
    {
        id: "vortex_speed",
        title: "Vortex: Accelerate",
        maxLevel: 50,
        skill: "soul_vortex",
        description: (level) => `Soul Vortex orbits ${Math.round((1.25**(level + 1) - 1) * 100)}% faster. (Lvl ${level + 1})`,
        apply: (p) => { p.abilities.orbitingShield.speed *= 1.25; }
    },
    {
        id: "vortex_twin",
        title: "Vortex: Twin Souls",
        maxLevel: 20,
        skill: "soul_vortex",
        description: (level) => {
            const currentTotalSouls = (p.abilities.orbitingShield ? p.abilities.orbitingShield.count : 1) + 1;
            const ordinal = ["second", "third", "fourth", "fifth"][level];
            return `Gain a ${ordinal} orbiting soul (Total: ${currentTotalSouls}).`;
        },
        apply: (p) => {
            p.abilities.orbitingShield.count = (p.abilities.orbitingShield.count || 1) + 1;
        }
    },

    { id: "lightning_damage", title: "Lightning: High Voltage", maxLevel: 500, skill: "lightning", description: (level) => `Increase lightning damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.damage += 5; } },
    { id: "lightning_chains", title: "Lightning: Chain Lightning", maxLevel: 400, skill: "lightning", description: (level) => `Lightning chains to ${level + 2} enemies.`, apply: (p) => { p.skills.lightning.chains += 1; } },
    { id: "lightning_cooldown", title: "Lightning: Storm Caller", maxLevel: 300, skill: "lightning", description: () => `Lightning strikes more frequently.`, apply: (p) => { p.skills.lightning.cooldown *= 0.8; } },
    { id: "lightning_shock", title: "Lightning: Static Field", maxLevel: 300, skill: "lightning", description: (level) => `Lightning shocks enemies, dealing damage over time. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.shockDuration += 1000; } },
    { id: "lightning_fork", title: "Lightning: Fork", maxLevel: 200, skill: "lightning", description: () => `Each lightning strike has a chance to fork.`, apply: (p) => { p.skills.lightning.forkChance = (p.skills.lightning.forkChance || 0) + 0.15; } },
    { id: "volcano_damage", title: "Volcano: Magma Core", maxLevel: 500, skill: "volcano", description: (level) => `Increase eruption damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.damage += 10; } },
    { id: "volcano_cooldown", title: "Volcano: Frequent Fissures", maxLevel: 300, skill: "volcano", description: (level) => `Eruptions occur more frequently. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.cooldown *= 0.8; } },
    { id: "volcano_duration", title: "Volcano: Scorched Earth", maxLevel: 300, skill: "volcano", description: () => `Burning ground lasts longer.`, apply: (p) => { p.skills.volcano.burnDuration *= 1.3; } },
    { id: "volcano_count", title: "Volcano: Cluster Bombs", maxLevel: 200, skill: "volcano", description: () => `Volcano creates an extra eruption.`, apply: (p) => { p.skills.volcano.count = (p.skills.volcano.count || 1) + 1; } },
    { id: "frostnova_damage", title: "Frost Nova: Deep Freeze", maxLevel: 500, skill: "frostNova", description: (level) => `Increase Frost Nova damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.damage += 5; } },
    { id: "frostnova_radius", title: "Frost Nova: Absolute Zero", maxLevel: 300, skill: "frostNova", description: (level) => `Increase Frost Nova radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.radius *= 1.25; } },
    { id: "frostnova_cooldown", title: "Frost Nova: Winter's Grasp", maxLevel: 300, skill: "frostNova", description: () => `Cast Frost Nova more frequently.`, apply: (p) => { p.skills.frostNova.cooldown *= 0.8; } },
    { id: "frostnova_slow", title: "Frost Nova: Crippling Cold", maxLevel: 200, skill: "frostNova", description: () => `Frost Nova's slow is more effective.`, apply: (p) => { p.skills.frostNova.slowAmount += 0.1; } },
    { id: "blackhole_damage", title: "Black Hole: Event Horizon", maxLevel: 500, skill: "blackHole", description: (level) => `Increase Black Hole damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.damage += 2; } },
    { id: "blackhole_radius", title: "Black Hole: Singularity", maxLevel: 300, skill: "blackHole", description: (level) => `Increase Black Hole radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.radius *= 1.2; } },
    { id: "blackhole_duration", title: "Black Hole: Lingering Void", maxLevel: 300, skill: "blackHole", description: () => `Black Hole lasts longer.`, apply: (p) => { p.skills.blackHole.duration *= 1.25; } },
    { id: "blackhole_pull", title: "Black Hole: Gravity Well", maxLevel: 200, skill: "blackHole", description: () => `Black Hole's pull is stronger.`, apply: (p) => { p.skills.blackHole.pullStrength *= 1.5; } },
    { id: "bulletstorm", title: "Bulletstorm", maxLevel: 100, description: () => `Unleash a torrent of explosive skill projectiles.`, apply: (p) => { p.skills.bulletstorm.isUnlocked = true; } },
    { id: "bulletstorm_damage", title: "Bulletstorm: Caliber", maxLevel: 500, skill: "bulletstorm", description: (level) => `Increase Bulletstorm damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.bulletstorm.damage += 5; } },
    { id: "bulletstorm_firerate", title: "Bulletstorm: Rapid Fire", maxLevel: 300, skill: "bulletstorm", description: () => `Bulletstorm fires faster.`, apply: (p) => { p.skills.bulletstorm.fireRate *= 0.8; } },
    { id: "bulletstorm_speed", title: "Bulletstorm: Velocity", maxLevel: 300, skill: "bulletstorm", description: () => `Bulletstorm projectiles travel faster.`, apply: (p) => { p.skills.bulletstorm.speed *= 1.2; } },
    { id: "hyperBeam", title: "Hyper Beam", maxLevel: 100, description: () => `Unleash a devastating laser in one direction.`, apply: (p) => { p.skills.hyperBeam.isUnlocked = true; } },
    { id: "hyperBeam_damage", title: "Hyper Beam: Overcharge", maxLevel: 500, skill: "hyperBeam", description: (level) => `Increase Hyper Beam damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.damage += 50; } },
    { id: "hyperBeam_width", title: "Hyper Beam: Wide Arc", maxLevel: 300, skill: "hyperBeam", description: (level) => `Increase Hyper Beam width. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.width += 20; } },
    { id: "hyperBeam_cooldown", title: "Hyper Beam: Quick Charge", maxLevel: 300, skill: "hyperBeam", description: () => `Hyper Beam recharges faster.`, apply: (p) => { p.skills.hyperBeam.cooldown *= 0.8; } },
    { id: "hyperBeam_duration", title: "Hyper Beam: Sustained Blast", maxLevel: 200, skill: "hyperBeam", description: () => `Hyper Beam lasts longer.`, apply: (p) => { p.skills.hyperBeam.duration += 200; } },
    { id: "hyperBeam_charge", title: "Hyper Beam: Instant Cast", maxLevel: 100, skill: "hyperBeam", description: () => `Reduces Hyper Beam charging time.`, apply: (p) => { p.skills.hyperBeam.chargingTime = 0; } },
];

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
        hyperBeamButton: document.getElementById('hyperBeamButton'),
        upgradeStatsList: document.getElementById('upgrade-stats-list'),
        // NEW: Link to the DOM element for the level-up timer display
        levelUpTimerDisplay: document.getElementById('level-up-timer-display'),
    };

    initRift();
    setupEventListeners();
    checkSaveStates();
}

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

    hudElements.hyperBeamButton.addEventListener('click', () => {
        if (!gameState.isAutoMode && player.skills.hyperBeam.isUnlocked) {
            manualHyperBeamTrigger = true;
        }
    });

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

        if (savedData.safeHouse && safeHouseInstance) {
            safeHouseInstance.x = savedData.safeHouse.x;
            safeHouseInstance.y = savedData.safeHouse.y;
            safeHouseInstance.radius = savedData.safeHouse.radius;
            safeHouseInstance.active = savedData.safeHouse.active;
            safeHouseInstance.respawnTimer = savedData.safeHouse.respawnTimer;
            console.log("SafeHouse state loaded.");
        } else if (safeHouseInstance) {
             safeHouseInstance.spawn();
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

export function triggerScreenShake(intensity, duration) {
    screenShake.intensity = Math.max(screenShake.intensity, intensity);
    screenShake.duration = Math.max(screenShake.duration, duration);
    screenShake.timer = screenShake.duration;
}

function takeDamage(amount, isDirectHit = false) {
    playerTakeDamage(amount, gameState.gameTime, spawnDamageNumber, screenRedFlash, triggerScreenShake);

    if (player.thorns > 0 && isDirectHit) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < player.size + (e.width || 0) + 10) {
                e.health -= player.thorns;
                spawnDamageNumber(e.x, e.y, player.thorns, false);
            }
        });
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
    }
}

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
        initPlayer(world);
        gameState.gameTime = 0;
        nextMinuteUpgradeTime = MINUTE_INTERVAL;
        skillTotems = [
            { x: world.width / 2 - 200, y: world.height / 2 - 200, radius: 30, skill: 'lightning', color: 'var(--lightning-color)', icon: '⚡' },
            { x: world.width / 2 + 200, y: world.height / 2 + 200, radius: 30, skill: 'volcano', color: 'var(--volcano-color)', icon: '🔥' },
            { x: world.width / 2 + 200, y: world.height / 2 - 200, radius: 30, skill: 'frostNova', color: '#87CEEB', icon: '❄️' },
            { x: world.width / 2 - 200, y: world.height / 2 + 200, radius: 30, skill: 'blackHole', color: '#483D8B', icon: '🌀' },
            { x: world.width / 2, y: world.height / 2 + 100, radius: 30, skill: 'bulletstorm', color: '#00FFFF', icon: '🔫' },
            { x: world.width / 2 + 100, y: world.height / 2 + 100, radius: 30, skill: 'hyperBeam', color: '#FF00FF', icon: '💥' },
        ];
    } else {
        nextMinuteUpgradeTime = Math.ceil((gameState.gameTime + 1) / MINUTE_INTERVAL) * MINUTE_INTERVAL;
    }
    initRift();

    safeHouseInstance = new SafeHouse(world.width, world.height);

    gameState.lastTime = performance.now();
    gameState.enemySpawnTimer = 0;
    gameState.enemySpawnInterval = Math.max(100, 1500 * Math.pow(0.985, gameState.gameTime / 1000));
    enemies.length = 0; projectiles.length = 0; xpOrbs.length = 0; particles.length = 0; damageNumbers.length = 0; lightningBolts.length = 0; volcanicEruptions.length = 0; visualEffects.length = 0;
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

function autoSelectRandomUpgrade() {
    if (!gameState.levelUpTimerActive || gameState.availableLevelUpOptions.length === 0) {
        return;
    }

    console.log("Time ran out! Auto-selecting a power-up.");
    const randomIndex = Math.floor(Math.random() * gameState.availableLevelUpOptions.length);
    const chosenUpgrade = gameState.availableLevelUpOptions[randomIndex];

    selectUpgrade(chosenUpgrade);
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

    let target = closestEnemy;
    let targetDist = closestEnemyDist;

    if (safeHouseInstance && !safeHouseInstance.active && safeHouseInstance.respawnTimer > 1) {
    } else if (safeHouseInstance && safeHouseInstance.active) {
        if (!safeHouseInstance.isInside(player)) {
            target = safeHouseInstance;
            targetDist = Math.hypot(safeHouseInstance.x - player.x, safeHouseInstance.y - player.y);
        }
    }

    // Refined logic for totem prioritization
    if (closestTotem && !player.skills[closestTotem.skill].isUnlocked) {
        target = closestTotem; // Always prioritize unlocking new skills
    } else if (closestTotem && (closestTotem.skill === 'soul_vortex' || UPGRADE_POOL.find(u => u.id === closestTotem.skill)?.skill === 'soul_vortex')) {
        // If it's a Soul Vortex related totem and the base is unlocked,
        // we might still want to pick it up for upgrades (like 'vortex_twin').
        // This assumes that re-picking up the totem increases the count.
        // This is a more nuanced game design choice, but keeping original intent.
        if (player.abilities.orbitingShield && player.abilities.orbitingShield.enabled && player.abilities.orbitingShield.count < (UPGRADE_POOL.find(u => u.id === 'vortex_twin')?.maxLevel || Infinity)) {
            // If soul vortex is unlocked and not at max souls for twin, prioritize it
            target = closestTotem;
        } else if (!player.abilities.orbitingShield?.enabled && closestTotem.skill === 'soul_vortex') {
            // If soul vortex is not enabled, but it is the soul vortex totem, prioritize it
             target = closestTotem;
        }
    } else if (closestOrb && closestOrbDist < XP_PRIORITY_RADIUS) {
        target = closestOrb; // Prioritize XP orbs if close
    }


    if (target && target !== closestEnemy) {
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        if (dist > 0) {
            const weight = (target === closestTotem || target === safeHouseInstance) ? TOTEM_WEIGHT * 2 : ATTRACTION_WEIGHT;
            attraction.x = (target.x - player.x) / dist * weight;
            attraction.y = (target.y - player.y) / dist * weight;
        }
    } else if (closestEnemy) {
        const dist = Math.hypot(closestEnemy.x - player.x, closestEnemy.y - player.y);
         if (dist > 0) {
            attraction.x = (closestEnemy.x - player.x) / dist * ATTRACTION_WEIGHT;
            attraction.y = (closestEnemy.y - player.y) / dist * ATTRACTION_WEIGHT;
        }
    }

    return { x: attraction.x + (repulsion.x * REPULSION_WEIGHT), y: attraction.y + (repulsion.y * REPULSION_WEIGHT) };
}

function gameLoop(timestamp) {
    // CRITICAL FIX: Always update gameTime, regardless of gameState.isRunning
    const deltaTime = timestamp - gameState.lastTime;
    gameState.lastTime = timestamp;
    gameState.gameTime += deltaTime;

    if (!gameState.isRunning) { // If game is paused
        if (gameState.levelUpTimerActive) {
            const elapsedTime = gameState.gameTime - gameState.levelUpTimerStartTime;
            if (elapsedTime >= gameState.levelUpTimerDuration) {
                autoSelectRandomUpgrade();
            }
            // updateHUD() will be called by draw() to update the DOM timer display
        }
        draw(); // Always draw when paused to show UI elements like the timer
        gameState.animationFrameId = requestAnimationFrame(gameLoop);
        return; // Stop further game updates if paused
    }

    // Only run game update logic if game is running
    update(deltaTime);
    draw();
    gameState.animationFrameId = requestAnimationFrame(gameLoop);
}

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

    if (screenShake.timer > 0) {
        screenShake.timer -= deltaTime;
        const shakeAmount = screenShake.intensity * (screenShake.timer / screenShake.duration);
        camera.x += (Math.random() - 0.5) * 2 * shakeAmount;
        camera.y += (Math.random() - 0.5) * 2 * shakeAmount;
    }

    camera.x = player.x - camera.width / 2; camera.y = player.y - camera.height / 2;
    camera.x = Math.max(0, Math.min(world.width - camera.width, camera.x));
    camera.y = Math.max(0, Math.min(world.height - camera.height, camera.y));

    if (gameState.isRunning && gameState.gameTime >= nextMinuteUpgradeTime) {
        if (!hudElements.levelUpWindow.classList.contains('visible')) {
            console.log(`Time-based upgrade triggered at ${formatTime(gameState.gameTime)}`);
            showLevelUpOptions();
        }
        nextMinuteUpgradeTime = Math.ceil((gameState.gameTime + 1) / MINUTE_INTERVAL) * MINUTE_INTERVAL;
    }

    if (player.skills.bulletstorm.isUnlocked) {
        const skill = player.skills.bulletstorm;
        if (gameState.gameTime - skill.lastShotTime > skill.fireRate) {
            const target = closestEnemy || (enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : null);
            if (target) {
                firePlayerSkillProjectile(player.x, player.y, target.x, target.y, skill.damage, skill.speed, skill.color, skill.size);
                skill.lastShotTime = gameState.gameTime;
            }
        }
    }

    if (player.skills.hyperBeam.isUnlocked) {
        const skill = player.skills.hyperBeam;
        const isOnCooldown = gameState.gameTime - skill.lastCast < skill.cooldown;
        let shouldFire = false;

        if (gameState.isAutoMode) {
            const nearbyEnemies = enemies.filter(e => Math.hypot(e.x - player.x, e.y - player.y) < camera.width / 2 + 200);
            if (!isOnCooldown && nearbyEnemies.length > 15) {
                shouldFire = true;
            }
        } else {
            if (!isOnCooldown && manualHyperBeamTrigger) {
                shouldFire = true;
            }
        }

        if (shouldFire) {
            console.log("Hyper Beam Fired!");
            fireHyperBeam(player, skill.damage, skill.width, skill.duration, skill.chargingTime, skill.color);
            skill.lastCast = gameState.gameTime;
            manualHyperBeamTrigger = false;
        }
    }

    if (safeHouseInstance) {
        safeHouseInstance.update(deltaTime);

        if (safeHouseInstance.active && safeHouseInstance.isInside(player)) {
            player.health = Math.min(player.maxHealth, player.health + (player.healthRegen + safeHouseInstance.healingRate) * (deltaTime / 1000));
        }
        enemies.forEach(enemy => {
            if (safeHouseInstance.active && safeHouseInstance.isInside(enemy)) {
                enemy.speedMultiplier = 0.5;
            } else {
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

    enemies = enemies.filter(enemy => !enemy.markedForDeletion);

    for (let i = skillTotems.length - 1; i >= 0; i--) {
        const totem = skillTotems[i];
        if (Math.hypot(player.x - totem.x, player.y - totem.y) < player.size + totem.radius) {
            player.skills[totem.skill].isUnlocked = true;
            player.upgradeLevels[totem.skill] = 1;
            skillTotems.splice(i, 1);
        }
    }
    updateLightning(deltaTime, player);
    updateVolcano(deltaTime, player);
    updateFrostNova(deltaTime, player);
    updateBlackHole(deltaTime, player);

    const updateEntityArray = (arr, dt, extra) => { for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].update(dt, extra)) arr.splice(i, 1); } };
    updateEntityArray(projectiles, deltaTime);
    updateEntityArray(xpOrbs, deltaTime, closestDist);
    updateEntityArray(particles, deltaTime);
    updateEntityArray(damageNumbers, deltaTime);
    updateEntityArray(lightningBolts, deltaTime);
    updateEntityArray(volcanicEruptions, deltaTime);
    updateEntityArray(visualEffects, deltaTime);
    handleCollisions();
}

function handleCollisions() {
    projectiles.forEach(p => {
        if (!p.isPlayerProjectile) return;

        if (p.pierce < p.hitEnemies.length && (!p.isPlayerSkillProjectile || !p.explodesOnImpact || p.hitEnemies.length > 0)) {
            return;
        }

        enemies.forEach(e => {
            if (e.markedForDeletion || e.isDying || p.hitEnemies.includes(e)) return;

            const combinedRadius = (p.size?.w / 2 || 5) + (e.width / 2 || 20);
            if (Math.hypot(e.x - p.x, e.y - p.y) < combinedRadius) {
                if (p.explodesOnImpact && p.hitEnemies.length === 0) {
                    triggerNova({x: e.x, y: e.y}, p.explosionDamage, p.explosionRadius);
                }

                const isCrit = Math.random() < (p.critChance || 0);
                const damage = isCrit ? Math.round(p.damage * (p.critDamage || 2)) : p.damage;
                
                e.health -= damage;
                e.lastHitTime = gameState.gameTime;
                p.hitEnemies.push(e);
                createImpactParticles(e.x, e.y, 10, 'impact');
                spawnDamageNumber(e.x, e.y, Math.round(damage), isCrit);

                if (p.isPlayerSkillProjectile) {
                    p.life = 0;
                }
            }
        });
    });

    projectiles.forEach(p => {
        if (p.isPlayerProjectile) return;

        const playerCollisionRadius = player.size;
        const projectileCollisionRadius = p.size?.w / 2 || 5;

        if (Math.hypot(player.x - p.x, player.y - p.y) < projectileCollisionRadius + playerCollisionRadius) {
            takeDamage(p.damage, true);
            p.life = 0;
            createImpactParticles(p.x, p.y, 5, 'normal');
        }
    });

    enemies.forEach(e => {
        if (e.isDying) return;

        const enemyCollisionRadius = (e.width / 2 || 20);
        const playerCollisionRadius = player.size;

        if (Math.hypot(e.x - player.x, e.y - player.y) < enemyCollisionRadius + playerCollisionRadius) {
            takeDamage(e.damage || 10, true);
            e.health = -1;
            e.isDying = true;
            e.deathTimer = 300;
            e.deathDuration = 300;
            e.speed = 0;
        }
    });

    const shield = player.abilities.orbitingShield;
    if (shield && shield.enabled) {
        const count = shield.count || 1;
        for(let i=0; i<count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            shield.cooldown = shield.cooldown || 200;
            if(!shield.lastHitTime) shield.lastHitTime = {};

            if (gameState.gameTime - (shield.lastHitTime[i] || 0) > shield.cooldown) {
                const shieldX = player.x + Math.cos(angle) * shield.distance;
                const shieldY = player.y + Math.sin(angle) * shield.distance;
                enemies.forEach(e => {
                    if (e.markedForDeletion || e.isDying) return;
                    const combinedRadius = 15 + (e.width / 2 || 20);
                    if (Math.hypot(e.x - shieldX, e.y - shieldY) < combinedRadius) {
                        e.health -= shield.damage;
                        spawnDamageNumber(e.x, e.y, shield.damage, false);
                        shield.lastHitTime[i] = gameState.gameTime;
                    }
                });
            }
        }
        shield.angle += 0.05 * (shield.speed || 1);
    }

    visualEffects.forEach(effect => {
        if (effect.type === 'hyperBeam' && effect.life > effect.maxLife - effect.maxLife * 0.9) {
            enemies.forEach(e => {
                if (e.markedForDeletion || e.isDying || effect.hitEnemies.has(e)) return;

                const dx = e.x - effect.x;
                const dy = e.y - effect.y;
                const rotatedX = dx * Math.cos(-effect.angle) - dy * Math.sin(-effect.angle);
                const rotatedY = dx * Math.sin(-effect.angle) + dy * Math.cos(-effect.angle);

                if (Math.abs(rotatedY) < (effect.beamWidth / 2) + (e.width / 2) && rotatedX >= -e.width / 2 && rotatedX < effect.length) {
                    e.health -= effect.damage;
                    spawnDamageNumber(e.x, e.y, effect.damage, true);
                    createImpactParticles(e.x, e.y, 15, 'nova', `rgba(${effect.color.r},${effect.color.g},${effect.color.b},1)`);
                    effect.hitEnemies.add(e);
                }
            });
        }
    });
}
function draw() {
    // Only return if game is not running AND neither game over nor level up window is visible
    if (!gameState.isRunning && !hudElements.gameOverScreen.classList.contains('visible') && !hudElements.levelUpWindow.classList.contains('visible')) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    
    // Drawing Order (from furthest back to front)
    ctx.drawImage(getBackgroundCanvas(), 0, 0); // Background Rift

    if (safeHouseInstance) {
        safeHouseInstance.draw(ctx, camera); // Safe House
    }

    drawWorldElements(); // Skill Totems, Lightning, Volcano, XP Orbs

    enemies.forEach(e => drawEnemy(e, ctx, player)); // Enemies
    projectiles.forEach(p => drawProjectile(p, ctx)); // Projectiles

    // Player drawing (always on top of most game elements)
    const playerBlink = (gameState.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0;
    if (!playerBlink) drawPlayer(player, player.angle);

    drawParticlesAndEffects(); // Particles (general), HyperBeam, BlackHole (these should generally be on top of player)

    ctx.restore();

    // Screen-wide effects (always on top of everything else)
    if (screenRedFlash.value > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${screenRedFlash.value * 0.4})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenRedFlash.value -= 0.04; }
    if (screenFlash.value > 0) { ctx.fillStyle = `rgba(200, 225, 255, ${screenFlash.value})`; ctx.fillRect(0, 0, canvas.width, canvas.height); screenFlash.value -= 0.05; }
    
    if (joystick.active && !gameState.isAutoMode) drawJoystick();
    updateHUD();

    // The canvas-based timer drawing is no longer needed as it's now a DOM element updated in updateHUD
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
        createImpactParticles(v.x + (Math.random() - 0.5) * v.radius,
                              v.y + (Math.random() - 0.5) * v.radius,
                              1, 'fire');
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

    // Update the DOM element for the level-up timer
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
    } else if (hudElements.levelUpTimerDisplay) {
        hudElements.levelUpTimerDisplay.textContent = '';
        hudElements.levelUpTimerDisplay.classList.remove('low-time');
    }
}

// REMOVED: This helper function is no longer needed as its logic is directly in updateHUD.
// function updateLevelUpTimerDisplay() { }


function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }

function showLevelUpOptions() {
    gameState.isRunning = false;
    hudElements.xpFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    const availablePool = UPGRADE_POOL.filter(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const maxLevel = upgrade.maxLevel || Infinity;
        if (currentLevel >= maxLevel) return false;
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
    updateHUD(); // Call updateHUD to immediately show the timer and its initial value
}

window.showLevelUpOptions = showLevelUpOptions;

function selectUpgrade(upgrade) {
    const currentLevel = player.upgradeLevels[upgrade.id] || 0;
    player.upgradeLevels[upgrade.id] = currentLevel + 1;
    upgrade.apply(player);
    hudElements.levelUpWindow.classList.remove('visible');
    gameState.isRunning = true;
    gameState.lastTime = performance.now();
    
    gameState.levelUpTimerActive = false;
    gameState.availableLevelUpOptions = [];
    updateHUD(); // Call updateHUD to clear the timer display immediately
}

// REMOVED: The canvas-based drawLevelUpTimer is no longer needed.

export {
    gameState, keys, joystick, world, camera, enemies, projectiles, xpOrbs, particles,
    damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems,
    safeHouseInstance as safeHouse,
    screenFlash, screenRedFlash, screenShake, UPGRADE_POOL
};
