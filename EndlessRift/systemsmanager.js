import { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage as playerTakeDamage } from './player.js';
import { enemyPath, spawnEnemy, updateEnemies, drawEnemy } from './enemies.js';
import { fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber, updateFrostNova, updateBlackHole, fireHyperBeam } from './attacks_skills.js';
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

let gameState = { isRunning: false, isAutoMode: false, gameTime: 0, lastTime: 0, enemySpawnTimer: 0, enemySpawnInterval: 1500, saveIntervalId: null, animationFrameId: null };
let enemies = [], projectiles = [], xpOrbs = [], particles = [], damageNumbers = [], lightningBolts = [], volcanicEruptions = [], visualEffects = [], skillTotems = [];
let world = { width: 3000, height: 2000 };

let safeHouseInstance;

let camera = { x: 0, y: 0, width: 0, height: 0, zoom: 1 };
let screenFlash = { value: 0 };
let screenRedFlash = { value: 0 };

const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 };

let nextMinuteUpgradeTime = MINUTE_INTERVAL;

let canvas, ctx, hudElements, menuElements;

const UPGRADE_POOL = [
    { id: "might", title: "Might", maxLevel: 5, description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } },
    { id: "haste", title: "Haste", maxLevel: 5, description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } },
    { id: "multishot", title: "Multi-Shot", maxLevel: 4, description: (level) => `Fire ${level + 2} total projectiles.`, apply: (p) => { p.weapon.count += 1; } },
    { id: "impact", title: "Greater Impact", maxLevel: 3, description: (level) => `Increase projectile size by 25%. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; } },
    { id: "pierce", title: "Piercing Shots", maxLevel: 3, description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } },
    { id: "velocity", title: "Velocity", maxLevel: 5, description: (level) => `Projectiles travel 20% faster. (Lvl ${level+1})`, apply: (p) => { p.weapon.speed *= 1.20; } },
    { id: "vitality", title: "Vitality", description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } },
    { id: "recovery", title: "Recovery", maxLevel: 3, description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } },
    { id: "agility", title: "Agility", maxLevel: 3, description: (level) => `Increase movement speed by 10%. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } },
    { id: "armor", title: "Armor", maxLevel: 5, description: (level) => `Reduce incoming damage by 1. (Lvl ${level+1})`, apply: (p) => { p.armor += 1; } },
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
    { id: "soul_nova", title: "Soul Nova", maxLevel: 1, description: () => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; triggerNova(p, 50, 200); } },
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
    { id: "bulletstorm", title: "Bulletstorm", maxLevel: 1, description: () => `Unleash a torrent of explosive skill projectiles.`, apply: (p) => { p.skills.bulletstorm.isUnlocked = true; } },
    { id: "bulletstorm_damage", title: "Bulletstorm: Caliber", maxLevel: 5, skill: "bulletstorm", description: (level) => `Increase Bulletstorm damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.bulletstorm.damage += 5; } },
    { id: "bulletstorm_firerate", title: "Bulletstorm: Rapid Fire", maxLevel: 3, skill: "bulletstorm", description: () => `Bulletstorm fires faster.`, apply: (p) => { p.skills.bulletstorm.fireRate *= 0.8; } },
    { id: "bulletstorm_speed", title: "Bulletstorm: Velocity", maxLevel: 3, skill: "bulletstorm", description: () => `Bulletstorm projectiles travel faster.`, apply: (p) => { p.skills.bulletstorm.speed *= 1.2; } },
    { id: "hyperBeam", title: "Hyper Beam", maxLevel: 1, description: () => `Unleash a devastating laser in one direction.`, apply: (p) => { p.skills.hyperBeam.isUnlocked = true; } },
    { id: "hyperBeam_damage", title: "Hyper Beam: Overcharge", maxLevel: 5, skill: "hyperBeam", description: (level) => `Increase Hyper Beam damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.damage += 50; } },
    { id: "hyperBeam_width", title: "Hyper Beam: Wide Arc", maxLevel: 3, skill: "hyperBeam", description: (level) => `Increase Hyper Beam width. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.width += 20; } },
    { id: "hyperBeam_cooldown", title: "Hyper Beam: Quick Charge", maxLevel: 3, skill: "hyperBeam", description: () => `Hyper Beam recharges faster.`, apply: (p) => { p.skills.hyperBeam.cooldown *= 0.8; } },
    { id: "hyperBeam_duration", title: "Hyper Beam: Sustained Blast", maxLevel: 2, skill: "hyperBeam", description: () => `Hyper Beam lasts longer.`, apply: (p) => { p.skills.hyperBeam.duration += 200; } },
    { id: "hyperBeam_charge", title: "Hyper Beam: Instant Cast", maxLevel: 1, skill: "hyperBeam", description: () => `Reduces Hyper Beam charging time.`, apply: (p) => { p.skills.hyperBeam.chargingTime = 0; } },
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
        upgradeStatsList: document.getElementById('upgrade-stats-list'),
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
function takeDamage(amount, isDirectHit = false) {
    playerTakeDamage(amount, gameState.gameTime, spawnDamageNumber, screenRedFlash);

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
    const SAFE_HOUSE_PRIORITY = 500;

    if (safeHouseInstance && !safeHouseInstance.active && safeHouseInstance.respawnTimer > 1) {
    } else if (safeHouseInstance && safeHouseInstance.active) {
        if (!safeHouseInstance.isInside(player)) {
            target = safeHouseInstance;
            targetDist = Math.hypot(safeHouseInstance.x - player.x, safeHouseInstance.y - player.y);
        }
    }


    if (closestOrb && closestOrbDist < XP_PRIORITY_RADIUS) target = closestOrb;
    if (closestTotem && (!player.skills[closestTotem.skill].isUnlocked || (player.abilities.orbitingShield.enabled && closestTotem.skill === 'soul_vortex'))) target = closestTotem;

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
        if (gameState.gameTime - skill.lastCast > skill.cooldown) {
            const nearbyEnemies = enemies.filter(e => Math.hypot(e.x - player.x, e.y - player.y) < camera.width / 2 + 200);
            if (nearbyEnemies.length > 15) {
                console.log("Hyper Beam Fired!");
                fireHyperBeam(player, skill.damage, skill.width, skill.duration, skill.chargingTime, skill.color);
                skill.lastCast = gameState.gameTime;
            }
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
            if (e.markedForDeletion || p.hitEnemies.includes(e)) return;

            const combinedRadius = (p.size?.w / 2 || 5) + (e.width / 2 || 20);
            if (Math.hypot(e.x - p.x, e.y - p.y) < combinedRadius) {
                if (p.explodesOnImpact && p.hitEnemies.length === 0) {
                    triggerNova({x: e.x, y: e.y}, p.explosionDamage, p.explosionRadius);
                }

                const isCrit = Math.random() < (p.critChance || 0);
                const damage = isCrit ? Math.round(p.damage * (p.critDamage || 2)) : p.damage;
                
                e.health -= damage;
                p.hitEnemies.push(e);
                createImpactParticles(e.x, e.y, 10);
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
        const enemyCollisionRadius = (e.width / 2 || 20);
        const playerCollisionRadius = player.size;

        if (Math.hypot(e.x - player.x, e.y - player.y) < enemyCollisionRadius + playerCollisionRadius) {
            takeDamage(e.damage || 10, true);
            e.health = -1;
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
                    if (e.markedForDeletion) return;
                    const combinedRadius = 15 + (e.width / 2 || 20);
                    if (Math.hypot(e.x - shieldX, e.y - shieldY) < combinedRadius) {
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

    visualEffects.forEach(effect => {
        if (effect.type === 'hyperBeam' && effect.life > effect.maxLife - effect.maxLife * 0.9) {
            enemies.forEach(e => {
                if (e.markedForDeletion || effect.hitEnemies.has(e)) return;

                const dx = e.x - effect.x;
                const dy = e.y - effect.y;
                const rotatedX = dx * Math.cos(-effect.angle) - dy * Math.sin(-effect.angle);
                const rotatedY = dx * Math.sin(-effect.angle) + dy * Math.cos(-effect.angle);

                if (Math.abs(rotatedY) < (effect.beamWidth / 2) + (e.width / 2) && rotatedX >= -e.width / 2 && rotatedX < effect.length) {
                    e.health -= effect.damage;
                    spawnDamageNumber(e.x, e.y, effect.damage, true);
                    createImpactParticles(e.x, e.y, 15, 'nova');
                    effect.hitEnemies.add(e);
                }
            });
        }
    });
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
    projectiles.forEach(p => drawProjectile(p, ctx));
    enemies.forEach(e => drawEnemy(e, ctx, player));
    const playerBlink = (gameState.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(gameState.gameTime / 100) % 2 === 0;
    if (!playerBlink) drawPlayer(player, player.angle);
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
        // --- EXISTING UPDATE LOGIC FOR OTHER EFFECTS ---
        // These need to be updated regardless of whether they are drawn.
        // The common update logic for visualEffects array members
        // is typically handled by `updateEntityArray(visualEffects, deltaTime);`
        // in the main `update` loop.
        // However, if some effects have custom update logic that should
        // run *before* or *during* their drawing, it goes here.
        // For simplicity and clarity, let's ensure HyperBeam related updates
        // are properly managed.

        // It seems the structure expects an update method directly on the effect objects.
        // Let's ensure these are called, and also ensure the drawing logic is correct.

        // Update the effect's state (life, alpha, etc.)
        if (effect.update) { // Call update method if it exists on the effect object
            // For effects like shockwave, frostwave, blackHole that have their own update:
            effect.update(0); // Pass 0 as deltaTime here. Their actual life update happens below in updateEntityArray
        }
        // ^ This is a bit of a tricky spot. The `updateEntityArray` call in `systemsmanager.js`
        // already handles `effect.update(dt)`. We *don't* want to call it here again.
        // So, let's make sure the `hyperBeam` and `hyperBeamCharge` objects *have*
        // their `update` methods defined in `attacks_skills.js` where they are created,
        // and then they'll be automatically updated by `updateEntityArray`.

        // Let's re-confirm that the `update` method is called elsewhere, then focus on drawing here.
        // The current `systemsmanager.js` already has:
        // `updateEntityArray(visualEffects, deltaTime);`
        // This is where `effect.update(dt)` is called for *all* visual effects.
        // So we just need the `drawParticlesAndEffects` to focus purely on drawing based on the *current* state of `effect`.
    });

    // Drawing loop
    visualEffects.forEach(effect => {
        const lifePercent = effect.life / effect.maxLife; // Rely on `effect.life` being updated by updateEntityArray
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

        // Hyper Beam charging effect drawing
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
        }

        // Hyper Beam drawing
        else if (effect.type === 'hyperBeam') {
            ctx.save();
            ctx.translate(effect.x, effect.y);
            ctx.rotate(effect.angle);

            const currentAlpha = effect.life / effect.maxLife;
            const beamStartOffset = 20;
            const glowStrength = currentAlpha * 120;

            ctx.fillStyle = `rgba(255, 0, 0, ${currentAlpha * 0.4})`;
            ctx.shadowColor = `rgba(255, 0, 0, ${currentAlpha * 0.8})`;
            ctx.shadowBlur = glowStrength;
            ctx.fillRect(beamStartOffset, -effect.beamWidth / 2, effect.length, effect.beamWidth);

            ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.8})`;
            ctx.shadowBlur = glowStrength * 0.5;
            ctx.fillRect(beamStartOffset, -effect.beamWidth * 0.2, effect.length, effect.beamWidth * 0.4);

            ctx.restore();

            if (effect.life === effect.maxLife) {
                for (let i = 0; i < 50; i++) {
                    const angle = effect.angle + (Math.random() - 0.5) * Math.PI;
                    const speed = Math.random() * 10 + 5;
                    particles.push({
                        x: effect.x, y: effect.y, life: 300,
                        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                        alpha: 1, type: 'nova', size: Math.random() * 5 + 2,
                        update(dt) { this.x += this.vx; this.y += this.vy; this.life -= dt; this.alpha = this.life / 300; return this.life <= 0; }
                    });
                }
            }
            if (currentAlpha > 0.1 && Math.random() < 0.8) {
                ctx.save(); // Save before translation/rotation for particles
                ctx.translate(effect.x, effect.y);
                ctx.rotate(effect.angle);
                particles.push({
                    x: Math.random() * effect.length, // Random X along beam's length
                    y: (Math.random() - 0.5) * effect.beamWidth, // Random Y within beam's width
                    life: 150,
                    vx: 0, vy: 0,
                    alpha: currentAlpha * 0.5, type: 'nova', size: Math.random() * 3 + 1,
                    update(dt) { this.life -= dt; this.alpha = this.life / 150 * currentAlpha * 0.5; return this.life <= 0; }
                });
                ctx.restore(); // Restore after particle placement
            }
        }
    });
    particles.forEach(p => { // Particle drawing loop
        // ... existing particle drawing ...
    });
    // ... rest of drawParticlesAndEffects ...
}
function drawPlayer(p, angle) { const bob = Math.sin(gameState.gameTime / 250) * 2; ctx.save(); ctx.translate(p.x, p.y + bob); const hoverPulse = Math.sin(gameState.gameTime / 400); ctx.beginPath(); ctx.ellipse(0, 25, 20, 8, 0, 0, Math.PI * 2); ctx.globalAlpha = 0.2 + hoverPulse * 0.1; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; ctx.save(); ctx.rotate(angle); const auraPulse = Math.sin(gameState.gameTime / 200); ctx.beginPath(); ctx.arc(0, 0, 30, -1.9, 1.9); ctx.strokeStyle = 'var(--player-aura-color)'; ctx.lineWidth = 4 + auraPulse * 2; ctx.shadowColor = 'var(--player-aura-color)'; ctx.shadowBlur = 15 + auraPulse * 10; ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(8, 15); ctx.lineTo(0, 10); ctx.lineTo(-8, 15); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(-5, -15, 10, 10); ctx.restore(); ctx.restore(); }
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
                particles.push({
                    x: p.x - p.vx * 0.1, y: p.y - p.vy * 0.1, life: 100,
                    vx: (Math.random() - 0.5) * 1, vy: (Math.random() - 0.5) * 1,
                    alpha: 0.8, type: 'nova', size: Math.random() * 2 + 1,
                    update(dt) { this.x += this.vx; this.y += this.vy; this.life -= dt; this.alpha = this.life / 100; return this.life <= 0; }
                });
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
}
function drawJoystick() { ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(128,128,128,0.3)'; ctx.fill(); ctx.beginPath(); ctx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
function drawDamageNumber(dn) { ctx.save(); ctx.translate(dn.x, dn.y); ctx.globalAlpha = dn.alpha; ctx.fillStyle = dn.isCrit ? 'yellow' : 'var(--damage-text-color)'; ctx.font = dn.isCrit ? 'bold 24px Roboto' : 'bold 18px Roboto'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5; ctx.fillText(dn.value, 0, 0); ctx.restore(); }
function drawLightningBolt(bolt) { ctx.save(); ctx.globalAlpha = Math.min(1, bolt.life / 100); ctx.strokeStyle = 'var(--lightning-color)'; ctx.lineWidth = 3; ctx.shadowColor = 'var(--lightning-color)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(bolt.start.x, bolt.start.y); const segments = 10; for (let i = 1; i <= segments; i++) { const t = i / segments; const x = bolt.start.x * (1 - t) + bolt.end.x * t; const y = bolt.start.y * (1 - t) + bolt.end.y * t; if (i < segments) { ctx.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20); } else { ctx.lineTo(x, y); } } ctx.stroke(); ctx.restore(); }
function drawVolcano(v) { ctx.save(); const lifePercent = v.life / v.burnDuration; ctx.globalAlpha = lifePercent * 0.7; ctx.fillStyle = 'var(--volcano-color)'; ctx.beginPath(); ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
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
        if (upgrade.skill && !player.skills[upgrade.skill]?.isUnlocked && upgrade.id !== upgrade.skill) return false;
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
    damageNumbers, lightningBolts, volcanicEruptions, visualEffects, skillTotems,
    safeHouseInstance as safeHouse,
    screenFlash, screenRedFlash, UPGRADE_POOL
};