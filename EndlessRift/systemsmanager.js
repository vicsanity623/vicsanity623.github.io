// systemsmanager.js

// 1. CRITICAL FIX: Import all necessary drawing functions and the player object
import { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage as playerTakeDamage, drawPlayer } from './player.js'; // Added drawPlayer
import { enemyPath, spawnEnemy, updateEnemies, drawEnemy } from './enemies.js';
import { fireProjectile, fireEnemyProjectile, firePlayerSkillProjectile, triggerNova, updateLightning, updateVolcano, createImpactParticles, spawnDamageNumber, updateFrostNova, updateBlackHole, fireHyperBeam, hexToRgb, drawSoulVortex, drawProjectile, drawXpOrb, drawDamageNumber, drawLightningBolt, drawVolcano, createXpOrb as createXpOrbFunction } from './attacks_skills.js'; // Added draw functions and renamed createXpOrb to avoid conflict
import { initRift, expandWorld, getBackgroundCanvas } from './rift.js';

let auth, firestore, googleProvider, currentUser;

const MINUTE_INTERVAL = 60000;

// Added drawSkillTotem function here as it's used in drawWorldElements
function drawSkillTotem(totem, ctx, gameTime) { // Added ctx and gameTime parameters
    ctx.save();
    ctx.translate(totem.x, totem.y);
    ctx.globalAlpha = 0.8 + Math.sin(gameTime / 200) * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, totem.radius, 0, Math.PI * 2);
    ctx.fillStyle = totem.color;
    ctx.shadowColor = totem.color;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(totem.icon, 0, 0);
    ctx.restore();
}

class SafeHouse {
    constructor(gameWorldWidth, gameWorldHeight) {
        // These are initial world dimensions, actual spawning uses current 'game.world'
        this.gameWorldWidth = gameWorldWidth; 
        this.gameWorldHeight = gameWorldHeight; 
        this.initialRadius = 250;
        this.minRadius = 80;
        this.shrinkRate = 2; // radius units per second
        this.respawnTime = 5; // seconds
        this.healingRate = 10; // HP per second when inside
        this.x = 0;
        this.y = 0;
        this.radius = this.initialRadius;
        this.active = false;
        this.respawnTimer = 0;
        this.color = 'var(--safe-house-fill, rgba(161, 232, 232, 0.15))'; // Use CSS variable, with fallback
        this.borderColor = 'var(--safe-house-stroke, rgba(209, 250, 250, 0.5))'; // Use CSS variable, with fallback
        // The first spawn will happen in startGame or loadGame, ensuring world is defined.
        // This constructor will just set up the properties.
    }
    spawn() {
        // Use the current world dimensions from the global 'game.world' object
        this.radius = this.initialRadius;
        this.x = Math.random() * (game.world.width - this.initialRadius * 2) + this.initialRadius;
        this.y = Math.random() * (game.world.height - this.initialRadius * 2) + this.initialRadius;
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
            context.textBaseline = 'bottom'; // Position text above the circle
            context.font = '20px Arial';
            context.fillStyle = 'white';
            context.fillText('SAFE ZONE', this.x, this.y - this.radius - 10); // Adjust Y coordinate to be above
            context.restore();
        } else {
            // This part should draw on screen coordinates, not world coordinates
            context.save();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '30px Arial';
            context.fillStyle = 'red';
            // Use camera's position to draw relative to the screen center
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

// Encapsulate global state into a single 'game' object
const game = {
    isRunning: false,
    isAutoMode: false,
    gameTime: 0,
    lastTime: 0,
    enemySpawnTimer: 0,
    enemySpawnInterval: 1500,
    saveIntervalId: null,
    animationFrameId: null,
    enemies: [],
    projectiles: [],
    xpOrbs: [],
    particles: [],
    damageNumbers: [],
    lightningBolts: [],
    volcanicEruptions: [],
    visualEffects: [],
    skillTotems: [],
    world: { width: 3000, height: 2000 },
    safeHouse: null, // Will be instantiated in startGame
    camera: { x: 0, y: 0, width: 0, height: 0, zoom: 1 },
    screenFlash: { value: 0 },
    screenRedFlash: { value: 0 },
    screenShake: { intensity: 0, duration: 0, timer: 0 },
    keys: { w: false, a: false, s: false, d: false },
    joystick: { active: false, baseX: 0, baseY: 0, handleX: 0, handleY: 0, radius: 60, handleRadius: 25 },
    nextMinuteUpgradeTime: MINUTE_INTERVAL,
    canvas: null, // Will be set in initializeApp
    ctx: null, // Will be set in initializeApp
    hudElements: {}, // Will be populated in initializeApp
    menuElements: {}, // Will be populated in initializeApp
    lastHudUpdateTime: 0, // For HUD update optimization
    hudUpdateInterval: 100 // Update HUD every 100ms instead of every frame
};

const UPGRADE_POOL = [
    { id: "might", title: "Might", maxLevel: Infinity, description: (level) => `Increase projectile damage by 5. (Lvl ${level + 1})`, apply: (p) => { p.weapon.damage += 5; } },
    { id: "haste", title: "Haste", maxLevel: Infinity, description: (level) => `Attack 15% faster. (Lvl ${level + 1})`, apply: (p) => { p.weapon.cooldown *= 0.85; } },
    { id: "multishot", title: "Multi-Shot", maxLevel: Infinity, description: (level) => `Fire ${level + 1} more projectile(s).`, apply: (p) => { p.weapon.count += 1; } },
    { id: "impact", title: "Greater Impact", maxLevel: Infinity, description: (level) => `Increase projectile size by 25%. (Lvl ${level + 1})`, apply: (p) => { p.weapon.size.h *= 1.25; p.weapon.size.w *= 1.25; } }, // Scaled width too
    { id: "pierce", title: "Piercing Shots", maxLevel: Infinity, description: (level) => `Projectiles pierce ${level + 1} more enemies.`, apply: (p) => { p.weapon.pierce += 1; } },
    { id: "velocity", title: "Velocity", maxLevel: Infinity, description: (level) => `Projectiles travel 20% faster. (Lvl ${level+1})`, apply: (p) => { p.weapon.speed *= 1.20; } },
    { id: "vitality", title: "Vitality", maxLevel: Infinity, description: (level) => `Increase Max HP by 25. (Lvl ${level + 1})`, apply: (p) => { p.maxHealth += 25; p.health += 25; } },
    { id: "recovery", title: "Recovery", maxLevel: Infinity, description: (level) => `Heal ${0.5 * (level + 1)} HP/sec. (Lvl ${level + 1})`, apply: (p) => { p.healthRegen += 0.5; } },
    { id: "agility", title: "Agility", maxLevel: Infinity, description: (level) => `Increase movement speed by 10%. (Lvl ${level + 1})`, apply: (p) => { p.speed *= 1.10; } },
    { id: "armor", title: "Armor", maxLevel: Infinity, description: (level) => `Reduce incoming damage by 1. (Lvl ${level+1})`, apply: (p) => { p.armor += 1; } },
    { id: "dodge", title: "Evasion", maxLevel: Infinity, description: (level) => `+5% chance to dodge attacks. (Lvl ${level+1})`, apply: (p) => { p.dodgeChance += 0.05; } },
    { id: "wisdom", title: "Wisdom", maxLevel: Infinity, description: (level) => `Gain ${20 * (level + 1)}% more XP. (Lvl ${level + 1})`, apply: (p) => { p.xpGainModifier += 0.20; } },
    { id: "greed", title: "Greed", maxLevel: Infinity, description: (level) => `Increase XP pickup radius by 50%. (Lvl ${level + 1})`, apply: (p) => { p.pickupRadius *= 1.50; } },
    { id: "magnetism", title: "Magnetism", maxLevel: Infinity, description: (level) => `XP orbs are pulled towards you faster. (Lvl ${level+1})`, apply: (p) => { p.magnetism *= 1.5; } },
    { id: "rejuvenation", title: "Rejuvenation", maxLevel: 1, description: () => `Picking up an XP orb has a 10% chance to heal 1 HP.`, apply: (p) => { p.abilities.healOnXp = true; } },
    { id: "lethality", title: "Lethality", maxLevel: Infinity, description: (level) => `+10% chance to deal double damage. (Lvl ${level + 1})`, apply: (p) => { p.weapon.critChance += 0.1; } },
    { id: "overwhelm", title: "Overwhelm", maxLevel: Infinity, description: (level) => `Critical hits do +50% more damage. (Lvl ${level+1})`, apply: (p) => { p.weapon.critDamage += 0.5; } },
    { id: "crit_explosion", title: "Critical Mass", maxLevel: 1, description: () => `Critical hits cause a small explosion.`, apply: (p) => { p.abilities.critExplosion = true; } },
    {
        id: "soul_vortex",
        title: "Soul Vortex",
        maxLevel: 1,
        description: () => `Gain an orbiting soul that damages enemies.`,
        apply: (p) => {
            p.abilities.orbitingShield.enabled = true;
            // Add/ensure a corresponding skill entry for filtering purposes
            p.skills.soulVortex = p.skills.soulVortex || { isUnlocked: false, damage: 10, speed: 1, count: 1, lastHit: 0 };
            p.skills.soulVortex.isUnlocked = true;
        }
    },
    { id: "rear_guard", title: "Rear Guard", maxLevel: 1, description: () => `Fire a projectile behind you.`, apply: (p) => { p.abilities.backShot = true; } },
    { id: "crossfire", title: "Crossfire", maxLevel: 1, description: () => `Fire projectiles diagonally.`, apply: (p) => { p.abilities.diagonalShot = true; } },
    { id: "soul_nova", title: "Soul Nova", maxLevel: 1, description: () => `On level up, release a damaging nova.`, apply: (p) => { p.abilities.novaOnLevelUp = true; } },
    { id: "thorns", title: "Thorns", maxLevel: Infinity, description: (level) => `Enemies that hit you take ${5 * (level+1)} damage.`, apply: (p) => { p.thorns += 5; } },
    { id: "life_steal", title: "Life Steal", maxLevel: Infinity, description: (level) => `Heal for ${level+1} HP on kill.`, apply: (p) => { p.lifeSteal += 1; } },
    { id: "demolition", title: "Demolition", maxLevel: 1, description: () => `Projectiles explode on their first hit.`, apply: (p) => { p.weapon.explodesOnImpact = true; } },

    {
        id: "vortex_damage",
        title: "Vortex: Sharpen",
        maxLevel: Infinity,
        skill: "soulVortex",
        description: (level) => `Soul Vortex deals +5 damage. (Lvl ${level + 1})`,
        apply: (p) => { p.abilities.orbitingShield.damage += 5; }
    },
    {
        id: "vortex_speed",
        title: "Vortex: Accelerate",
        maxLevel: Infinity,
        skill: "soulVortex",
        description: (level) => `Soul Vortex orbits ${Math.round((1.25**(level + 1) - 1) * 100)}% faster. (Lvl ${level + 1})`,
        apply: (p) => { p.abilities.orbitingShield.speed *= 1.25; }
    },
    {
        id: "vortex_twin",
        title: "Vortex: Twin Souls",
        maxLevel: Infinity,
        skill: "soulVortex",
        description: (level) => `Gain an additional orbiting soul. (Total: ${ (player.abilities.orbitingShield.count || 1) + 1})`, // Calculate description based on current + new count
        apply: (p) => {
            p.abilities.orbitingShield.count = (p.abilities.orbitingShield.count || 1) + 1;
        }
    },

    { id: "lightning", title: "Lightning Bolt", maxLevel: 1, description: () => `Unlock Lightning Bolt skill. Strikes nearest enemy.`, apply: (p) => { p.skills.lightning.isUnlocked = true; } },
    { id: "lightning_damage", title: "Lightning: High Voltage", maxLevel: Infinity, skill: "lightning", description: (level) => `Increase lightning damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.damage += 5; } },
    { id: "lightning_chains", title: "Lightning: Chain Lightning", maxLevel: Infinity, skill: "lightning", description: (level) => `Lightning chains to ${level + 2} enemies.`, apply: (p) => { p.skills.lightning.chains += 1; } },
    { id: "lightning_cooldown", title: "Lightning: Storm Caller", maxLevel: Infinity, skill: "lightning", description: () => `Lightning strikes more frequently.`, apply: (p) => { p.skills.lightning.cooldown *= 0.8; } },
    { id: "lightning_shock", title: "Lightning: Static Field", maxLevel: Infinity, skill: "lightning", description: (level) => `Lightning shocks enemies, dealing damage over time. (Lvl ${level + 1})`, apply: (p) => { p.skills.lightning.shockDuration += 1000; } },
    { id: "lightning_fork", title: "Lightning: Fork", maxLevel: Infinity, skill: "lightning", description: () => `Each lightning strike has a chance to fork.`, apply: (p) => { p.skills.lightning.forkChance = (p.skills.lightning.forkChance || 0) + 0.15; } },

    { id: "volcano", title: "Volcanic Eruption", maxLevel: 1, description: () => `Unlock Volcanic Eruption skill. Periodically erupts.`, apply: (p) => { p.skills.volcano.isUnlocked = true; } },
    { id: "volcano_damage", title: "Volcano: Magma Core", maxLevel: Infinity, skill: "volcano", description: (level) => `Increase eruption damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.damage += 10; } },
    { id: "volcano_cooldown", title: "Volcano: Frequent Fissures", maxLevel: Infinity, skill: "volcano", description: (level) => `Eruptions occur more frequently. (Lvl ${level + 1})`, apply: (p) => { p.skills.volcano.cooldown *= 0.8; } },
    { id: "volcano_duration", title: "Volcano: Scorched Earth", maxLevel: Infinity, skill: "volcano", description: () => `Burning ground lasts longer.`, apply: (p) => { p.skills.volcano.burnDuration *= 1.3; } },
    { id: "volcano_count", title: "Volcano: Cluster Bombs", maxLevel: Infinity, skill: "volcano", description: () => `Volcano creates an extra eruption.`, apply: (p) => { p.skills.volcano.count = (p.skills.volcano.count || 1) + 1; } },

    { id: "frostNova", title: "Frost Nova", maxLevel: 1, description: () => `Unlock Frost Nova. Damages & slows nearby enemies.`, apply: (p) => { p.skills.frostNova.isUnlocked = true; } },
    { id: "frostnova_damage", title: "Frost Nova: Deep Freeze", maxLevel: Infinity, skill: "frostNova", description: (level) => `Increase Frost Nova damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.damage += 5; } },
    { id: "frostnova_radius", title: "Frost Nova: Absolute Zero", maxLevel: Infinity, skill: "frostNova", description: (level) => `Increase Frost Nova radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.frostNova.radius *= 1.25; } },
    { id: "frostnova_cooldown", title: "Frost Nova: Winter's Grasp", maxLevel: Infinity, skill: "frostNova", description: () => `Cast Frost Nova more frequently.`, apply: (p) => { p.skills.frostNova.cooldown *= 0.8; } },
    { id: "frostnova_slow", title: "Frost Nova: Crippling Cold", maxLevel: Infinity, skill: "frostNova", description: () => `Frost Nova's slow is more effective.`, apply: (p) => { p.skills.frostNova.slowAmount += 0.1; } },

    { id: "blackHole", title: "Black Hole", maxLevel: 1, description: () => `Unlock Black Hole. Pulls & damages enemies.`, apply: (p) => { p.skills.blackHole.isUnlocked = true; } },
    { id: "blackHole_damage", title: "Black Hole: Event Horizon", maxLevel: Infinity, skill: "blackHole", description: (level) => `Increase Black Hole damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.damage += 2; } },
    { id: "blackHole_radius", title: "Black Hole: Singularity", maxLevel: Infinity, skill: "blackHole", description: (level) => `Increase Black Hole radius. (Lvl ${level + 1})`, apply: (p) => { p.skills.blackHole.radius *= 1.2; } },
    { id: "blackHole_duration", title: "Black Hole: Lingering Void", maxLevel: Infinity, skill: "blackHole", description: () => `Black Hole lasts longer.`, apply: (p) => { p.skills.blackHole.duration *= 1.25; } },
    { id: "blackHole_pull", title: "Black Hole: Gravity Well", maxLevel: Infinity, skill: "blackHole", description: () => `Black Hole's pull is stronger.`, apply: (p) => { p.skills.blackHole.pullStrength *= 1.5; } },

    { id: "bulletstorm", title: "Bulletstorm", maxLevel: 1, description: () => `Unleash a torrent of explosive skill projectiles.`, apply: (p) => { p.skills.bulletstorm.isUnlocked = true; } },
    { id: "bulletstorm_damage", title: "Bulletstorm: Caliber", maxLevel: Infinity, skill: "bulletstorm", description: (level) => `Increase Bulletstorm damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.bulletstorm.damage += 5; } },
    { id: "bulletstorm_firerate", title: "Bulletstorm: Rapid Fire", maxLevel: Infinity, skill: "bulletstorm", description: () => `Bulletstorm fires faster.`, apply: (p) => { p.skills.bulletstorm.fireRate *= 0.8; } },
    { id: "bulletstorm_speed", title: "Bulletstorm: Velocity", maxLevel: Infinity, skill: "bulletstorm", description: () => `Bulletstorm projectiles travel faster.`, apply: (p) => { p.skills.bulletstorm.speed *= 1.2; } },

    { id: "hyperBeam", title: "Hyper Beam", maxLevel: 1, description: () => `Unleash a devastating laser in one direction.`, apply: (p) => { p.skills.hyperBeam.isUnlocked = true; } },
    { id: "hyperBeam_damage", title: "Hyper Beam: Overcharge", maxLevel: Infinity, skill: "hyperBeam", description: (level) => `Increase Hyper Beam damage. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.damage += 50; } },
    { id: "hyperBeam_width", title: "Hyper Beam: Wide Arc", maxLevel: Infinity, skill: "hyperBeam", description: (level) => `Increase Hyper Beam width. (Lvl ${level + 1})`, apply: (p) => { p.skills.hyperBeam.width += 20; } },
    { id: "hyperBeam_cooldown", title: "Hyper Beam: Quick Charge", maxLevel: Infinity, skill: "hyperBeam", description: () => `Hyper Beam recharges faster.`, apply: (p) => { p.skills.hyperBeam.cooldown *= 0.8; } },
    { id: "hyperBeam_duration", title: "Hyper Beam: Sustained Blast", maxLevel: Infinity, skill: "hyperBeam", description: () => `Hyper Beam lasts longer.`, apply: (p) => { p.skills.hyperBeam.duration += 200; } },
    { id: "hyperBeam_charge", title: "Hyper Beam: Instant Cast", maxLevel: 1, skill: "hyperBeam", description: () => `Reduces Hyper Beam charging time.`, apply: (p) => { p.skills.hyperBeam.chargingTime = 0; } },
];

export function initializeApp() {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    firestore = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();

    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');

    // Assign DOM elements to the game.menuElements and game.hudElements objects
    Object.assign(game.menuElements, {
        mainMenu: document.getElementById('main-menu'),
        newGameBtn: document.getElementById('newGameBtn'),
        loadOptionsContainer: document.getElementById('load-options-container'),
        googleSignInBtn: document.getElementById('googleSignInBtn'),
        userStatus: document.getElementById('userStatus'),
        userDisplay: document.getElementById('user-display'),
        userName: document.getElementById('userName'),
        signOutBtn: document.getElementById('signOutBtn'),
    });
    Object.assign(game.hudElements, {
        gameContainer: document.getElementById('game-container'),
        level: document.getElementById('level-text'), hp: document.getElementById('hp-text'), hpFill: document.getElementById('hp-bar-fill'), xpFill: document.getElementById('xp-bar-fill'), timer: document.getElementById('timer-text'), xpBottomFill: document.getElementById('xp-bar-bottom-fill'), finalTime: document.getElementById('final-time-text'), finalLevel: document.getElementById('final-level-text'), levelUpWindow: document.getElementById('level-up-window'), upgradeOptions: document.getElementById('upgrade-options'), gameOverScreen: document.getElementById('game-over-screen'), restartButton: document.getElementById('restart-button'), killCounter: document.getElementById('kill-counter-text'), finalKills: document.getElementById('final-kills-text'), autoModeButton: document.getElementById('auto-mode-button'),
        hyperBeamButton: document.getElementById('hyperBeamButton'),
        upgradeStatsList: document.getElementById('upgrade-stats-list'),
    });

    initRift(); // Rift should initialize its background canvas without needing game.world here
    setupEventListeners();
    checkSaveStates();
}

function setupEventListeners() {
    function resizeCanvas() { 
        game.canvas.width = game.canvas.clientWidth; 
        game.canvas.height = game.canvas.clientHeight; 
        game.camera.width = game.canvas.width; 
        game.camera.height = game.canvas.height; 
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getTouchPos(touchEvent) { const rect = game.canvas.getBoundingClientRect(); return { x: touchEvent.touches[0].clientX - rect.left, y: touchEvent.touches[0].clientY - rect.top }; }
    game.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (!game.isRunning || game.isAutoMode) return; const pos = getTouchPos(e); game.joystick.active = true; game.joystick.baseX = pos.x; game.joystick.baseY = pos.y; game.joystick.handleX = pos.x; game.joystick.handleY = pos.y; }, { passive: false });
    game.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!game.joystick.active) return; const pos = getTouchPos(e); const dx = pos.x - game.joystick.baseX; const dy = pos.y - game.joystick.baseY; const dist = Math.hypot(dx, dy); if (dist > game.joystick.radius) { game.joystick.handleX = game.joystick.baseX + (dx / dist) * game.joystick.radius; game.joystick.handleY = game.joystick.baseY + (dy / dist) * game.joystick.radius; } else { game.joystick.handleX = pos.x; game.joystick.handleY = pos.y; } }, { passive: false });
    game.canvas.addEventListener('touchend', (e) => { e.preventDefault(); game.joystick.active = false; }, { passive: false });
    window.addEventListener('keydown', e => game.keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => game.keys[e.key.toLowerCase()] = false);

    game.menuElements.newGameBtn.addEventListener('click', () => startGame(true));
    game.menuElements.googleSignInBtn.addEventListener('click', signInWithGoogle);
    game.menuElements.signOutBtn.addEventListener('click', () => auth.signOut());

    game.hudElements.restartButton.addEventListener('click', () => {
        game.hudElements.gameOverScreen.classList.remove('visible');
        game.menuElements.mainMenu.classList.add('visible');
        game.hudElements.gameContainer.style.display = 'none'; // Changed visibility to display
        checkSaveStates();
    });
    game.hudElements.autoModeButton.addEventListener('click', () => { game.isAutoMode = !game.isAutoMode; game.hudElements.autoModeButton.textContent = game.isAutoMode ? 'AUTO ON' : 'AUTO OFF'; game.hudElements.autoModeButton.classList.toggle('auto-on', game.isAutoMode); });

    game.hudElements.hyperBeamButton.addEventListener('click', () => {
        if (!game.isAutoMode && player.skills.hyperBeam.isUnlocked) {
            player.skills.hyperBeam.manualTrigger = true; // Use skill property instead of global var
        }
    });

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            game.menuElements.userStatus.textContent = `Signed in as ${user.displayName}.`;
            game.menuElements.googleSignInBtn.style.display = 'none';
            game.menuElements.userDisplay.style.display = 'block';
            game.menuElements.userName.textContent = user.displayName;
        } else {
            game.menuElements.userStatus.textContent = 'Sign in for cloud saves.';
            game.menuElements.googleSignInBtn.style.display = 'flex';
            game.menuElements.userDisplay.style.display = 'none';
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
    game.menuElements.loadOptionsContainer.innerHTML = '';
    if (cloudSaveExists) {
        const cloudBtn = document.createElement('button');
        cloudBtn.className = 'menu-button'; cloudBtn.textContent = 'Load Cloud Save';
        cloudBtn.onclick = () => startGame(false, 'cloud');
        game.menuElements.loadOptionsContainer.appendChild(cloudBtn);
    }
    if (localSaveExists) {
        const localBtn = document.createElement('button');
        localBtn.className = 'menu-button'; localBtn.textContent = 'Load Local Save';
        localBtn.onclick = () => startGame(false, 'local');
        game.menuElements.loadOptionsContainer.appendChild(localBtn);
    }
    if (!cloudSaveExists && !localSaveExists) {
        const noSaveBtn = document.createElement('button');
        noSaveBtn.className = 'menu-button'; noSaveBtn.textContent = 'No Save Found'; noSaveBtn.disabled = true;
        game.menuElements.loadOptionsContainer.appendChild(noSaveBtn);
    }
}
async function saveGame() {
    if (!player || !game.isRunning) return;
    const savablePlayer = JSON.parse(JSON.stringify(player));
    const saveData = {
        player: savablePlayer,
        gameTime: game.gameTime,
        skillTotems: game.skillTotems,
        world: game.world,
        safeHouse: game.safeHouse ? {
            x: game.safeHouse.x,
            y: game.safeHouse.y,
            radius: game.safeHouse.radius,
            active: game.safeHouse.active,
            respawnTimer: game.safeHouse.respawnTimer,
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
        loadPlayer(savedData.player); // This function initializes 'player' based on loaded data
        game.gameTime = savedData.gameTime;
        game.skillTotems = savedData.skillTotems || [];
        if (savedData.world) { game.world.width = savedData.world.width; game.world.height = savedData.world.height; }

        if (savedData.safeHouse) {
            // Re-instantiate SafeHouse and load its state
            game.safeHouse = new SafeHouse(game.world.width, game.world.height);
            Object.assign(game.safeHouse, savedData.safeHouse);
            console.log("SafeHouse state loaded.");
        } else {
             // If no safe house data, create a new one
             game.safeHouse = new SafeHouse(game.world.width, game.world.height);
             game.safeHouse.spawn(); // Spawn immediately if new
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
    game.screenShake.intensity = Math.max(game.screenShake.intensity, intensity);
    game.screenShake.duration = Math.max(game.screenShake.duration, duration);
    game.screenShake.timer = game.screenShake.duration;
}

function takeDamage(amount, isDirectHit = false) {
    playerTakeDamage(amount, game.gameTime, 
        (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime), // Pass game.damageNumbers, game.gameTime
        game.screenRedFlash, 
        triggerScreenShake);

    if (player.thorns > 0 && isDirectHit) {
        game.enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < player.size + (e.width || 0) + 10) {
                e.health -= player.thorns;
                spawnDamageNumber(e.x, e.y, player.thorns, false, game.damageNumbers, game.gameTime); // Pass game.damageNumbers, game.gameTime
            }
        });
    }

    if (player.health <= 0) {
        player.health = 0;
        gameOver();
    }
}

async function startGame(forceNew, loadSource = 'cloud') {
    game.menuElements.mainMenu.classList.remove('visible');
    game.hudElements.gameContainer.style.display = 'block'; // Changed visibility to display
    game.isAutoMode = false;
    if (game.saveIntervalId) clearInterval(game.saveIntervalId);
    let loadedSuccessfully = false;
    if (!forceNew) {
        const sourceToLoad = currentUser ? loadSource : 'local';
        loadedSuccessfully = await loadGame(sourceToLoad);
    }
    if (forceNew || !loadedSuccessfully) {
        clearSave();
        game.world.width = 3000; game.world.height = 2000;
        initPlayer(game.world); // Pass world to player init
        game.gameTime = 0;
        game.nextMinuteUpgradeTime = MINUTE_INTERVAL;
        game.skillTotems = [
            { x: game.world.width / 2 - 200, y: game.world.height / 2 - 200, radius: 30, skill: 'lightning', color: 'var(--lightning-color)', icon: '⚡' },
            { x: game.world.width / 2 + 200, y: game.world.height / 2 + 200, radius: 30, skill: 'volcano', color: 'var(--volcano-color)', icon: '🔥' },
            { x: game.world.width / 2 + 200, y: game.world.height / 2 - 200, radius: 30, skill: 'frostNova', color: '#87CEEB', icon: '❄️' },
            { x: game.world.width / 2 - 200, y: game.world.height / 2 + 200, radius: 30, skill: 'blackHole', color: '#483D8B', icon: '🌀' },
            { x: game.world.width / 2, y: game.world.height / 2 + 100, radius: 30, skill: 'bulletstorm', color: '#00FFFF', icon: '🔫' },
            { x: game.world.width / 2 + 100, y: game.world.height / 2 + 100, radius: 30, skill: 'hyperBeam', color: '#FF00FF', icon: '💥' },
        ];
        game.safeHouse = new SafeHouse(game.world.width, game.world.height); // Instantiate SafeHouse on new game
        game.safeHouse.spawn(); // Immediately spawn the new safe house
    } else {
        game.nextMinuteUpgradeTime = Math.ceil((game.gameTime + 1) / MINUTE_INTERVAL) * MINUTE_INTERVAL;
    }
    initRift(); // Re-initialize rift (resets background canvas based on current world size)

    game.lastTime = performance.now();
    game.enemySpawnTimer = 0;
    game.enemySpawnInterval = Math.max(100, 1500 * Math.pow(0.985, game.gameTime / 1000));
    // Clear all game entities
    game.enemies.length = 0; game.projectiles.length = 0; game.xpOrbs.length = 0; game.particles.length = 0; game.damageNumbers.length = 0; game.lightningBolts.length = 0; game.volcanicEruptions.length = 0; game.visualEffects.length = 0;
    game.hudElements.levelUpWindow.classList.remove('visible');
    game.hudElements.gameOverScreen.classList.remove('visible');
    game.hudElements.autoModeButton.textContent = 'AUTO OFF';
    game.hudElements.autoModeButton.classList.remove('auto-on');
    game.isRunning = true;
    game.saveIntervalId = setInterval(saveGame, 10000);
    if (game.animationFrameId) cancelAnimationFrame(game.animationFrameId);
    gameLoop(performance.now());
}
function gameOver() {
    game.isRunning = false;
    clearInterval(game.saveIntervalId);
    game.saveIntervalId = null;
    cancelAnimationFrame(game.animationFrameId);
    game.hudElements.finalTime.textContent = formatTime(game.gameTime);
    game.hudElements.finalLevel.textContent = player.level;
    game.hudElements.finalKills.textContent = player.kills;
    game.hudElements.gameOverScreen.classList.add('visible');
}
function getAiMovementVector() {
    const DANGER_RADIUS = 150; const XP_PRIORITY_RADIUS = 200;
    const REPULSION_WEIGHT = 1.5; const ATTRACTION_WEIGHT = 1.0; const TOTEM_WEIGHT = 2.0;
    let repulsion = { x: 0, y: 0 }; let attraction = { x: 0, y: 0 };
    game.enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < DANGER_RADIUS && dist > 0) {
            const force = 1 / (dist * dist);
            repulsion.x -= (enemy.x - player.x) / dist * force;
            repulsion.y -= (enemy.y - player.y) / dist * force;
        }
    });
    let closestOrb = null, closestOrbDist = Infinity;
    game.xpOrbs.forEach(orb => {
        const dist = Math.hypot(orb.x - player.x, orb.y - player.y);
        if (dist < closestOrbDist) { closestOrbDist = dist; closestOrb = orb; }
    });
    let closestEnemy = null, closestEnemyDist = Infinity;
    game.enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < closestEnemyDist) { closestEnemyDist = dist; closestEnemy = enemy; }
    });
    let closestTotem = null, closestTotemDist = Infinity;
    game.skillTotems.forEach(totem => {
        const dist = Math.hypot(totem.x - player.x, totem.y - player.y);
        if(dist < closestTotemDist) { closestTotemDist = dist; closestTotem = totem; }
    });

    let target = closestEnemy;
    let targetDist = closestEnemyDist;

    if (game.safeHouse && !game.safeHouse.active && game.safeHouse.respawnTimer > 1) {
    } else if (game.safeHouse && game.safeHouse.active) {
        if (!game.safeHouse.isInside(player)) {
            target = game.safeHouse;
            targetDist = Math.hypot(game.safeHouse.x - player.x, game.safeHouse.y - player.y);
        }
    }

    // Prioritize XP orbs if within range AND there's no closer, more important target (like a skill totem or safe house)
    if (closestOrb && closestOrbDist < XP_PRIORITY_RADIUS) {
        if (!target || closestOrbDist < targetDist) { // Only switch if orb is closer than current target
            target = closestOrb;
            targetDist = closestOrbDist;
        }
    }
    // Prioritize Totem if it's not unlocked yet
    if (closestTotem && (!player.skills[closestTotem.skill]?.isUnlocked || (player.abilities.orbitingShield.enabled && closestTotem.skill === 'soulVortex'))) {
        if (!target || closestTotemDist < targetDist) { // Only switch if totem is closer than current target
            target = closestTotem;
            targetDist = closestTotemDist;
        }
    }


    if (target && targetDist > 0) { // Check targetDist > 0 to avoid division by zero
        const weight = (target === closestTotem || target === game.safeHouse) ? TOTEM_WEIGHT * 2 : ATTRACTION_WEIGHT;
        attraction.x = (target.x - player.x) / targetDist * weight;
        attraction.y = (target.y - player.y) / targetDist * weight;
    }


    return { x: attraction.x + (repulsion.x * REPULSION_WEIGHT), y: attraction.y + (repulsion.y * REPULSION_WEIGHT) };
}

function gameLoop(timestamp) {
    if (!game.isRunning) return;
    const deltaTime = timestamp - game.lastTime;
    game.lastTime = timestamp;
    game.gameTime += deltaTime;
    update(deltaTime);
    draw();
    game.animationFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    let dx = 0, dy = 0;
    if (game.isAutoMode) {
        const aiVector = getAiMovementVector();
        dx = aiVector.x; dy = aiVector.y;
    } else if (game.joystick.active) {
        dx = game.joystick.handleX - game.joystick.baseX; dy = game.joystick.handleY - game.joystick.baseY;
    } else {
        dx = (game.keys.d ? 1 : 0) - (game.keys.a ? 1 : 0); dy = (game.keys.s ? 1 : 0) - (game.keys.w ? 1 : 0);
    }
    const { closestEnemy, closestDist } = updatePlayer(deltaTime, game.world, game.enemies, { dx, dy });
    if (closestEnemy && game.gameTime - (player.lastFireTime || 0) > player.weapon.cooldown) {
        fireProjectile(player, game.projectiles, game.camera); // Pass projectiles and camera
        player.lastFireTime = game.gameTime;
    }

    if (game.screenShake.timer > 0) {
        game.screenShake.timer -= deltaTime;
        const shakeAmount = game.screenShake.intensity * (game.screenShake.timer / game.screenShake.duration);
        game.camera.x += (Math.random() - 0.5) * 2 * shakeAmount;
        game.camera.y += (Math.random() - 0.5) * 2 * shakeAmount;
    }

    game.camera.x = player.x - game.camera.width / 2; game.camera.y = player.y - game.camera.height / 2;
    game.camera.x = Math.max(0, Math.min(game.world.width - game.camera.width, game.camera.x));
    game.camera.y = Math.max(0, Math.min(game.world.height - game.camera.height, game.camera.y));

    if (game.isRunning && game.gameTime >= game.nextMinuteUpgradeTime) {
        if (!game.hudElements.levelUpWindow.classList.contains('visible')) {
            console.log(`Time-based upgrade triggered at ${formatTime(game.gameTime)}`);
            showLevelUpOptions();
        }
        game.nextMinuteUpgradeTime = Math.ceil((game.gameTime + 1) / MINUTE_INTERVAL) * MINUTE_INTERVAL;
    }

    if (player.skills.bulletstorm.isUnlocked) {
        const skill = player.skills.bulletstorm;
        if (game.gameTime - skill.lastShotTime > skill.fireRate) {
            const target = closestEnemy || (game.enemies.length > 0 ? game.enemies[Math.floor(Math.random() * game.enemies.length)] : null);
            if (target) {
                firePlayerSkillProjectile(player.x, player.y, target.x, target.y, skill.damage, skill.speed, skill.color, skill.size, game.projectiles, game.camera); // Pass projectiles and camera
                skill.lastShotTime = game.gameTime;
            }
        }
    }

    if (player.skills.hyperBeam.isUnlocked) {
        const skill = player.skills.hyperBeam;
        const isOnCooldown = game.gameTime - skill.lastCast < skill.cooldown;
        let shouldFire = false;

        if (game.isAutoMode) {
            const nearbyEnemies = game.enemies.filter(e => Math.hypot(e.x - player.x, e.y - player.y) < game.camera.width / 2 + 200);
            if (!isOnCooldown && nearbyEnemies.length > 15) {
                shouldFire = true;
            }
        } else {
            if (!isOnCooldown && skill.manualTrigger) { // Use skill property
                shouldFire = true;
            }
        }

        if (shouldFire) {
            console.log("Hyper Beam Fired!");
            fireHyperBeam(player, skill.damage, skill.width, skill.duration, skill.chargingTime, skill.color, game.visualEffects, game.screenFlash, triggerScreenShake); // Pass visualEffects and screenFlash
            skill.lastCast = game.gameTime;
            skill.manualTrigger = false; // Reset trigger
        }
    }

    if (game.safeHouse) {
        game.safeHouse.update(deltaTime);

        if (game.safeHouse.active && game.safeHouse.isInside(player)) {
            player.health = Math.min(player.maxHealth, player.health + (player.healthRegen + game.safeHouse.healingRate) * (deltaTime / 1000));
        }
        game.enemies.forEach(enemy => {
            if (game.safeHouse.active && game.safeHouse.isInside(enemy)) {
                enemy.speedMultiplier = 0.5;
            } else {
                enemy.speedMultiplier = 1.0;
            }
        });
    }

    game.enemySpawnTimer += deltaTime;
    if (game.enemySpawnTimer > game.enemySpawnInterval) {
        spawnEnemy(game.enemies, game.camera, game.world, game.gameTime); // Pass game.enemies, game.camera, game.world, game.gameTime
        game.enemySpawnTimer = 0;
        game.enemySpawnInterval = Math.max(100, game.enemySpawnInterval * 0.985);
    }
    const gainXPCallback = (amount) => gainXP(amount, showLevelUpOptions, 
        () => expandWorld(game.camera, player, game.visualEffects), // Pass visualEffects
        () => triggerNova(player, player.weapon.damage * 5, 200, game.visualEffects, game.enemies, 
                          (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime), // Pass game.damageNumbers, game.gameTime
                          triggerScreenShake, game.particles), // Pass game.particles
        game.camera);
    
    updateEnemies(deltaTime, game.enemies, player, showLevelUpOptions, gainXPCallback, 
                  game.camera, game.safeHouse, 
                  (enemy, targetX, targetY) => fireEnemyProjectile(enemy, targetX, targetY, game.projectiles, game.camera, game.safeHouse), // Pass game.projectiles, camera, safeHouse
                  (x, y, val, playerObj, cb) => createXpOrbFunction(x, y, val, playerObj, cb, game.xpOrbs), // Pass game.xpOrbs
                  (x, y, count, type, color, initialVx, initialVy) => createImpactParticles(x, y, count, type, color, initialVx, initialVy, game.particles), // Pass game.particles
                  game.gameTime); // Pass game.gameTime

    game.enemies = game.enemies.filter(enemy => !enemy.markedForDeletion);

    for (let i = game.skillTotems.length - 1; i >= 0; i--) {
        const totem = game.skillTotems[i];
        if (Math.hypot(player.x - totem.x, player.y - totem.y) < player.size + totem.radius) {
            player.skills[totem.skill].isUnlocked = true;
            player.upgradeLevels[totem.skill] = (player.upgradeLevels[totem.skill] || 0) + 1; // Ensure level is incremented for skill unlock
            game.skillTotems.splice(i, 1);
        }
    }
    updateLightning(deltaTime, player, game.enemies, game.gameTime, game.lightningBolts, game.screenFlash, 
                    (x, y, count, type, color) => createImpactParticles(x, y, count, type, color, null, null, game.particles), // Pass game.particles
                    (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime)); // Pass game.damageNumbers, game.gameTime
    
    updateVolcano(deltaTime, player, game.enemies, game.gameTime, game.volcanicEruptions, 
                  (x, y, count, type, color) => createImpactParticles(x, y, count, type, color, null, null, game.particles), // Pass game.particles
                  (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime)); // Pass game.damageNumbers, game.gameTime
    
    updateFrostNova(deltaTime, player, game.enemies, game.gameTime, game.visualEffects, 
                     (x, y, count, type, color) => createImpactParticles(x, y, count, type, color, null, null, game.particles), // Pass game.particles
                     (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime)); // Pass game.damageNumbers, game.gameTime
    
    updateBlackHole(deltaTime, player, game.enemies, game.gameTime, game.visualEffects, 
                     (x, y, count, type, color, initialVx, initialVy) => createImpactParticles(x, y, count, type, color, initialVx, initialVy, game.particles), // Pass game.particles
                     (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime)); // Pass game.damageNumbers, game.gameTime

    const updateEntityArray = (arr, dt, ...extra) => { for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].update(dt, ...extra)) arr.splice(i, 1); } };
    game.projectiles.forEach(p => p.update(deltaTime, game.camera, game.safeHouse)); // Explicitly pass camera and safeHouse
    game.xpOrbs.forEach(o => o.update(deltaTime, player)); // Explicitly pass player
    updateEntityArray(game.particles, deltaTime);
    updateEntityArray(game.damageNumbers, deltaTime);
    updateEntityArray(game.lightningBolts, deltaTime);
    updateEntityArray(game.volcanicEruptions, deltaTime);
    updateEntityArray(game.visualEffects, deltaTime);
    handleCollisions();
}

function handleCollisions() {
    game.projectiles.forEach(p => {
        if (!p.isPlayerProjectile) return;

        if (p.pierce < p.hitEnemies.length && (!p.isPlayerSkillProjectile || !p.explodesOnImpact || p.hitEnemies.length > 0)) {
            return;
        }

        game.enemies.forEach(e => {
            if (e.markedForDeletion || e.isDying || p.hitEnemies.includes(e)) return;

            const combinedRadius = (p.size?.w / 2 || 5) + (e.width / 2 || 20);
            if (Math.hypot(e.x - p.x, e.y - p.y) < combinedRadius) {
                if (p.explodesOnImpact && p.hitEnemies.length === 0) {
                    triggerNova({x: e.x, y: e.y}, p.explosionDamage, p.explosionRadius, game.visualEffects, game.enemies, 
                                 (x, y, val, isCrit) => spawnDamageNumber(x, y, val, isCrit, game.damageNumbers, game.gameTime), 
                                 triggerScreenShake, game.particles);
                }

                const isCrit = Math.random() < (p.critChance || 0);
                const damage = isCrit ? Math.round(p.damage * (p.critDamage || 2)) : p.damage;
                
                e.health -= damage;
                e.lastHitTime = game.gameTime;
                p.hitEnemies.push(e);
                createImpactParticles(e.x, e.y, 10, 'impact', null, null, null, game.particles); // Pass game.particles
                spawnDamageNumber(e.x, e.y, Math.round(damage), isCrit, game.damageNumbers, game.gameTime); // Pass game.damageNumbers, game.gameTime

                if (p.isPlayerSkillProjectile || (p.explodesOnImpact && p.hitEnemies.length === 1)) {
                    p.life = 0;
                }
            }
        });
    });

    game.projectiles.forEach(p => {
        if (p.isPlayerProjectile) return;

        const playerCollisionRadius = player.size;
        const projectileCollisionRadius = p.size?.w / 2 || 5;

        if (Math.hypot(player.x - p.x, player.y - p.y) < projectileCollisionRadius + playerCollisionRadius) {
            takeDamage(p.damage, true);
            p.life = 0;
            createImpactParticles(p.x, p.y, 5, 'normal', null, null, null, game.particles); // Pass game.particles
        }
    });

    game.enemies.forEach(e => {
        if (e.isDying) return;

        const enemyCollisionRadius = (e.width / 2 || 20);
        const playerCollisionRadius = player.size;

        if (Math.hypot(e.x - player.x, e.y - player.y) < enemyCollisionRadius + playerCollisionRadius) {
            takeDamage(e.damage || 10, true);
            e.health = -1; // Mark for immediate death
            e.isDying = true;
            e.deathTimer = 300;
            e.deathDuration = 300;
            e.speed = 0;
        }
    });

    const shield = player.abilities.orbitingShield;
    if (shield.enabled) {
        const count = shield.count || 1;
        for(let i=0; i<count; i++) {
            const angle = shield.angle + (i * (Math.PI * 2 / count));
            if (game.gameTime - (shield.lastHitTime?.[i] || 0) > shield.cooldown) {
                const shieldX = player.x + Math.cos(angle) * shield.distance;
                const shieldY = player.y + Math.sin(angle) * shield.distance;
                game.enemies.forEach(e => {
                    if (e.markedForDeletion || e.isDying) return;
                    const combinedRadius = 15 + (e.width / 2 || 20);
                    if (Math.hypot(e.x - shieldX, e.y - shieldY) < combinedRadius) {
                        e.health -= shield.damage;
                        spawnDamageNumber(e.x, e.y, shield.damage, false, game.damageNumbers, game.gameTime); // Pass game.damageNumbers, game.gameTime
                        if(!shield.lastHitTime) shield.lastHitTime = {};
                        shield.lastHitTime[i] = game.gameTime;
                    }
                });
            }
        }
        shield.angle += 0.05 * (shield.speed || 1);
    }

    game.visualEffects.forEach(effect => {
        if (effect.type === 'hyperBeam' && effect.life > effect.maxLife - effect.maxLife * 0.9) {
            game.enemies.forEach(e => {
                if (e.markedForDeletion || e.isDying || effect.hitEnemies.has(e)) return;

                const dx = e.x - effect.x;
                const dy = e.y - effect.y;
                const rotatedX = dx * Math.cos(-effect.angle) - dy * Math.sin(-effect.angle);
                const rotatedY = dx * Math.sin(-effect.angle) + dy * Math.cos(-effect.angle);

                if (Math.abs(rotatedY) < (effect.beamWidth / 2) + (e.width / 2) && rotatedX >= -e.width / 2 && rotatedX < effect.length) {
                    e.health -= effect.damage;
                    spawnDamageNumber(e.x, e.y, effect.damage, true, game.damageNumbers, game.gameTime); // Pass game.damageNumbers, game.gameTime
                    createImpactParticles(e.x, e.y, 15, 'nova', `rgba(${effect.color.r},${effect.color.g},${effect.color.b},1)`, null, null, game.particles); // Pass game.particles
                    effect.hitEnemies.add(e);
                }
            });
        }
    });
}
function draw() {
    if(!game.isRunning && !game.hudElements.gameOverScreen.classList.contains('visible')) return;
    game.ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);
    game.ctx.save();
    game.ctx.translate(-game.camera.x, -game.camera.y);
    
    game.ctx.drawImage(getBackgroundCanvas(), 0, 0);

    if (game.safeHouse) {
        game.safeHouse.draw(game.ctx, game.camera);
    }

    drawWorldElements();

    game.enemies.forEach(e => drawEnemy(e, game.ctx, player, game.gameTime, game.camera)); // Pass ctx, player, game.gameTime, camera
    game.projectiles.forEach(p => drawProjectile(p, game.ctx)); // Pass ctx

    const playerBlink = (game.gameTime - (player.lastHitTime || 0) < 1000) && Math.floor(game.gameTime / 100) % 2 === 0;
    if (!playerBlink) drawPlayer(player, player.angle, game.gameTime, (x,y,count,type,color,vx,vy) => createImpactParticles(x,y,count,type,color,vx,vy,game.particles)); // Pass game.gameTime and createImpactParticles with game.particles

    drawParticlesAndEffects();

    game.ctx.restore();

    if (game.screenRedFlash.value > 0) { game.ctx.fillStyle = `rgba(255, 0, 0, ${game.screenRedFlash.value * 0.4})`; game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height); game.screenRedFlash.value -= 0.04; }
    if (game.screenFlash.value > 0) { game.ctx.fillStyle = `rgba(200, 225, 255, ${game.screenFlash.value})`; game.ctx.fillRect(0, 0, game.canvas.width, game.canvas.height); game.screenFlash.value -= 0.05; }
    
    if (game.joystick.active && !game.isAutoMode) drawJoystick(game.joystick);
    updateHUD();
}
function drawWorldElements() {
    game.skillTotems.forEach(totem => drawSkillTotem(totem, game.ctx, game.gameTime)); // Pass ctx, game.gameTime
    game.lightningBolts.forEach(bolt => drawLightningBolt(bolt, game.ctx, 
        (x, y, count, type, color) => createImpactParticles(x, y, count, type, color, null, null, game.particles))); // Pass ctx, createImpactParticles with game.particles
    game.volcanicEruptions.forEach(v => drawVolcano(v, game.ctx, game.gameTime, 
        (x, y, count, type, color) => createImpactParticles(x, y, count, type, color, null, null, game.particles))); // Pass ctx, game.gameTime, createImpactParticles with game.particles
    game.xpOrbs.forEach(orb => drawXpOrb(orb, game.ctx, player, game.gameTime)); // Pass ctx, player, game.gameTime
}
function drawParticlesAndEffects() {
    game.visualEffects.forEach(effect => {
        game.ctx.save();
        game.ctx.beginPath();
        if (effect.type === 'shockwave' || effect.type === 'frostwave') {
            const lifePercent = effect.life / effect.maxLife;
            game.ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            game.ctx.strokeStyle = effect.type === 'frostwave' ? `rgba(135, 206, 250, ${lifePercent * 0.8})` : `rgba(255, 255, 255, ${lifePercent * 0.8})`;
            game.ctx.lineWidth = 15 * lifePercent;
            game.ctx.stroke();

            if (effect.type === 'frostwave') {
                game.ctx.beginPath();
                const innerRadius = effect.radius * 0.8;
                const numSpikes = 8;
                for (let i = 0; i < numSpikes; i++) {
                    const angle = (i / numSpikes) * Math.PI * 2;
                    const outerX = effect.x + Math.cos(angle) * innerRadius;
                    const outerY = effect.y + Math.sin(angle) * innerRadius;
                    const innerX = effect.x + Math.cos(angle + Math.PI / numSpikes) * innerRadius * 0.7;
                    const innerY = effect.y + Math.sin(angle + Math.PI / numSpikes) * innerRadius * 0.7;
                    if (i === 0) game.ctx.moveTo(outerX, outerY);
                    else game.ctx.lineTo(outerX, outerY);
                    game.ctx.lineTo(innerX, innerY);
                }
                game.ctx.closePath();
                game.ctx.fillStyle = `rgba(180, 220, 255, ${lifePercent * 0.3})`;
                game.ctx.fill();
                game.ctx.strokeStyle = `rgba(135, 206, 250, ${lifePercent * 0.5})`;
                game.ctx.lineWidth = 2;
                game.ctx.stroke();

                if (lifePercent > 0.1 && Math.random() < 0.4) {
                    createImpactParticles(effect.x + (Math.random() - 0.5) * effect.radius * 0.8,
                                          effect.y + (Math.random() - 0.5) * effect.radius * 0.8,
                                          1, 'ice', null, null, null, game.particles); // Pass game.particles
                }
            }
        } else if (effect.type === 'world_expansion') {
            const lifePercent = effect.life / effect.maxLife;
            game.ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            game.ctx.strokeStyle = `rgba(150, 255, 150, ${lifePercent * 0.9})`;
            game.ctx.lineWidth = 20 * lifePercent;
            game.ctx.stroke();
        } else if (effect.type === 'blackHole') {
            const lifePercent = effect.life / effect.maxLife;
            game.ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            const gradient = game.ctx.createRadialGradient(effect.x, effect.y, 10, effect.x, effect.y, effect.radius);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.7, `rgba(25, 0, 50, ${lifePercent * 0.7})`);
            gradient.addColorStop(1, `rgba(0, 0, 0, ${lifePercent * 0.9})`);
            game.ctx.fillStyle = gradient;
            game.ctx.fill();

            game.ctx.beginPath();
            const coreRadius = effect.radius * 0.2 * (Math.sin(game.gameTime / 100) * 0.1 + 0.9);
            game.ctx.arc(effect.x, effect.y, coreRadius, 0, Math.PI * 2);
            game.ctx.fillStyle = `rgba(100, 0, 200, ${lifePercent * 0.5})`;
            game.ctx.shadowColor = `rgba(150, 50, 255, ${lifePercent * 0.8})`;
            game.ctx.shadowBlur = coreRadius * 2;
            game.ctx.fill();
            game.ctx.shadowBlur = 0;

            if (lifePercent > 0.1 && Math.random() < 0.8) {
                const pAngle = Math.random() * Math.PI * 2;
                const pDist = Math.random() * effect.radius;
                const particleX = effect.x + Math.cos(pAngle) * pDist;
                const particleY = effect.y + Math.sin(pAngle) * pDist;
                createImpactParticles(particleX, particleY, 1, 'energy', 'rgba(200, 150, 255, 0.7)', (effect.x - particleX) / 100 * effect.pullStrength, (effect.y - particleY) / 100 * effect.pullStrength, game.particles); // Pass game.particles
            }
        }
        game.ctx.restore();

        if (effect.type === 'hyperBeamCharge') {
            game.ctx.save();
            game.ctx.translate(effect.x, effect.y);
            game.ctx.rotate(effect.angle);
            const chargeProgress = 1 - effect.life / effect.maxLife;
            const chargeSize = 5 + chargeProgress * 50;
            const chargeAlpha = chargeProgress * 0.8;
            game.ctx.fillStyle = `rgba(255, 255, 255, ${chargeAlpha})`;
            game.ctx.shadowColor = `rgba(255, 255, 255, ${chargeAlpha})`;
            game.ctx.shadowBlur = chargeSize * 0.8;
            game.ctx.beginPath();
            game.ctx.arc(0, 0, chargeSize, 0, Math.PI * 2);
            game.ctx.fill();
            game.ctx.restore();
        } else if (effect.type === 'hyperBeam') {
            game.ctx.save();
            game.ctx.translate(effect.x, effect.y);
            game.ctx.rotate(effect.angle);

            const currentAlpha = effect.life / effect.maxLife;
            const beamStartOffset = 20;
            const glowStrength = currentAlpha * 120;

            const beamColor = effect.color;

            game.ctx.fillStyle = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.4})`;
            game.ctx.shadowColor = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.8})`;
            game.ctx.shadowBlur = glowStrength;
            game.ctx.fillRect(beamStartOffset, -effect.beamWidth / 2, effect.length, effect.beamWidth);

            game.ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.8})`;
            game.ctx.shadowBlur = glowStrength * 0.5;
            game.ctx.fillRect(beamStartOffset, -effect.beamWidth * 0.2, effect.length, effect.beamWidth * 0.4);

            const rippleFactor = Math.sin(game.gameTime / 50) * 0.05 + 1;
            game.ctx.fillStyle = `rgba(${beamColor.r}, ${beamColor.g}, ${beamColor.b}, ${currentAlpha * 0.1})`;
            game.ctx.shadowBlur = 0;
            game.ctx.fillRect(beamStartOffset, -effect.beamWidth / 2 * rippleFactor, effect.length, effect.beamWidth * rippleFactor);

            game.ctx.restore();

            if (currentAlpha > 0.1 && Math.random() < 0.3) {
                const particleX = beamStartOffset + Math.random() * effect.length;
                const particleY = (Math.random() - 0.5) * effect.beamWidth;
                const angleOffset = effect.angle;
                const speed = Math.random() * 2 + 0.5;
                
                const rotatedParticleX = effect.x + Math.cos(angleOffset) * particleX - Math.sin(angleOffset) * particleY;
                const rotatedParticleY = effect.y + Math.sin(angleOffset) * particleX + Math.cos(angleOffset) * particleY;

                createImpactParticles(rotatedParticleX, rotatedParticleY, 1, 'spark', `rgba(255, 255, 255, ${currentAlpha})`, Math.cos(angleOffset + (Math.random() - 0.5) * 0.5) * speed, Math.sin(angleOffset + (Math.random() - 0.5) * 0.5) * speed, game.particles); // Pass game.particles
            }
        }
    });
    drawSoulVortex(player, game.ctx); // Pass ctx

    game.particles.forEach(p => {
        game.ctx.save();
        game.ctx.globalAlpha = p.alpha;
        game.ctx.fillStyle = p.color;
        if (p.currentSize > 3 && p.type !== 'spark') {
           game.ctx.shadowColor = p.color;
           game.ctx.shadowBlur = p.currentSize * 1.5;
        } else {
           game.ctx.shadowBlur = 0;
        }

        game.ctx.beginPath();
        game.ctx.arc(p.x, p.y, p.currentSize, 0, Math.PI * 2);
        game.ctx.fill();

        game.ctx.restore();
    });
    game.damageNumbers.forEach(dn => drawDamageNumber(dn, game.ctx)); // Pass ctx
}

function drawJoystick(joystick) { // Made joystick a parameter
    game.ctx.beginPath(); game.ctx.arc(joystick.baseX, joystick.baseY, joystick.radius, 0, Math.PI * 2); game.ctx.fillStyle = 'rgba(128,128,128,0.3)'; game.ctx.fill(); game.ctx.beginPath(); game.ctx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, Math.PI * 2); game.ctx.fillStyle = 'rgba(255,255,255,0.5)'; game.ctx.fill();
}

// HUD update optimization: only update every X milliseconds
function updateHUD() {
    if (game.gameTime - game.lastHudUpdateTime < game.hudUpdateInterval && game.isRunning) {
        return; // Skip update if not enough time has passed
    }
    game.lastHudUpdateTime = game.gameTime;

    game.hudElements.level.textContent = `LV ${player.level}`;
    game.hudElements.hp.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
    game.hudElements.hpFill.style.width = `${(player.maxHealth > 0 && !isNaN(player.health)) ? (player.health / player.maxHealth) * 100 : 0}%`;
    game.hudElements.timer.textContent = formatTime(game.gameTime);
    game.hudElements.xpBottomFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    game.hudElements.killCounter.textContent = player.kills;

    game.hudElements.upgradeStatsList.innerHTML = '';

    const BASE_PLAYER_SPEED = 3.5;

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
                case "greed": statValue = `${player.pickupRadius.toFixed(0)} Pickup Radius`; break;
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
                case "lightning": statValue = `Unlocked`; break;
                case "lightning_damage": statValue = `${player.skills.lightning.damage} Lightning Damage`; break;
                case "lightning_chains": statValue = `${player.skills.lightning.chains} Lightning Chains`; break;
                case "lightning_cooldown": statValue = `${(player.skills.lightning.cooldown / 1000).toFixed(1)}s Lightning CD`; break;
                case "lightning_shock": statValue = `${(player.skills.lightning.shockDuration / 1000).toFixed(1)}s Shock Duration`; break;
                case "lightning_fork": statValue = `${(player.skills.lightning.forkChance * 100).toFixed(0)}% Lightning Fork`; break;
                case "volcano": statValue = `Unlocked`; break;
                case "volcano_damage": statValue = `${player.skills.volcano.damage} Volcano Damage`; break;
                case "volcano_radius": statValue = `${player.skills.volcano.radius} Volcano Radius`; break;
                case "volcano_cooldown": statValue = `${(player.skills.volcano.cooldown / 1000).toFixed(1)}s Volcano CD`; break;
                case "volcano_duration": statValue = `${(player.skills.volcano.burnDuration / 1000).toFixed(1)}s Burn Duration`; break;
                case "volcano_count": statValue = `${player.skills.volcano.count || 1} Volcano Count`; break;
                case "frostNova": statValue = `Unlocked`; break;
                case "frostnova_damage": statValue = `${player.skills.frostNova.damage} Frost Nova Damage`; break;
                case "frostnova_radius": statValue = `${player.skills.frostNova.radius} Frost Nova Radius`; break;
                case "frostnova_cooldown": statValue = `${(player.skills.frostNova.cooldown / 1000).toFixed(1)}s Frost Nova CD`; break;
                case "frostnova_slow": statValue = `${(player.skills.frostNova.slowAmount * 100).toFixed(0)}% Slow`; break;
                case "blackHole": statValue = `Unlocked`; break;
                case "blackHole_damage": statValue = `${player.skills.blackHole.damage} Black Hole Damage`; break;
                case "blackHole_radius": statValue = `${player.skills.blackHole.radius} Black Hole Radius`; break;
                case "blackHole_duration": statValue = `${(player.skills.blackHole.duration / 1000).toFixed(1)}s Black Hole Duration`; break;
                case "blackHole_pull": statValue = `${player.skills.blackHole.pullStrength.toFixed(1)} Pull Strength`; break;
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
                case "soul_vortex": statValue = `Active`; break;
                case "vortex_damage": statValue = `${player.abilities.orbitingShield.damage} Vortex Damage`; break;
                case "vortex_speed": statValue = `${(player.abilities.orbitingShield.speed || 1).toFixed(1)}x Vortex Speed`; break;
                case "vortex_twin": statValue = `${player.abilities.orbitingShield.count || 1} Vortex Souls`; break;

                case "rear_guard":
                case "crossfire":
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
            game.hudElements.upgradeStatsList.appendChild(p);
        }
    }

    const hyperBeamSkill = player.skills.hyperBeam;
    const hyperBeamButton = game.hudElements.hyperBeamButton;

    if (hyperBeamSkill.isUnlocked) {
        hyperBeamButton.style.display = 'block';
        if (game.isAutoMode) {
            hyperBeamButton.textContent = 'AUTO HB';
            hyperBeamButton.disabled = true;
            hyperBeamButton.classList.remove('cooldown-active');
        } else {
            const timeRemaining = Math.max(0, (hyperBeamSkill.cooldown - (game.gameTime - hyperBeamSkill.lastCast)) / 1000);
            const isOnCooldown = timeRemaining > 0.1;
            hyperBeamButton.disabled = isOnCooldown;
            hyperBeamButton.textContent = isOnCooldown ? `HB (${timeRemaining.toFixed(1)}s)` : 'Hyper Beam';
            hyperBeamButton.classList.toggle('cooldown-active', isOnCooldown);
        }
    } else {
        hyperBeamButton.style.display = 'none';
    }
}
function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function showLevelUpOptions() {
    game.isRunning = false;
    game.hudElements.xpFill.style.width = `${(player.xp / player.xpForNextLevel) * 100}%`;
    const availablePool = UPGRADE_POOL.filter(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const maxLevel = upgrade.maxLevel || Infinity;
        if (currentLevel >= maxLevel) return false;

        // Special handling for skill-based upgrades
        if (upgrade.skill) {
            // If it's the base unlock for a skill (e.g., 'lightning' unlocks player.skills.lightning)
            if (upgrade.id === upgrade.skill) {
                return !player.skills[upgrade.skill]?.isUnlocked;
            }
            // If it's an upgrade FOR an already unlocked skill (e.g., 'lightning_damage' for 'lightning')
            return player.skills[upgrade.skill]?.isUnlocked;
        }

        return true;
    });
    const choices = availablePool.sort(() => 0.5 - Math.random()).slice(0, 6);
    game.hudElements.upgradeOptions.innerHTML = '';
    choices.forEach(upgrade => {
        const currentLevel = player.upgradeLevels[upgrade.id] || 0;
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<h3>${upgrade.title}</h3><p>${upgrade.description(currentLevel)}</p>`;
        card.onclick = () => selectUpgrade(upgrade);
        game.hudElements.upgradeOptions.appendChild(card);
    });
    game.hudElements.levelUpWindow.classList.add('visible');
}
window.showLevelUpOptions = showLevelUpOptions;
function selectUpgrade(upgrade) {
    const currentLevel = player.upgradeLevels[upgrade.id] || 0;
    player.upgradeLevels[upgrade.id] = currentLevel + 1;
    upgrade.apply(player);
    game.hudElements.levelUpWindow.classList.remove('visible');
    game.isRunning = true;
    game.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Export game object directly (aliased as gameState for backward compatibility if needed)
export {
    game as gameState, // Alias for backward compatibility if other files reference 'gameState'
    game, // Export the full game object for cleaner access
    UPGRADE_POOL,
    triggerScreenShake // Keep this explicitly exported as it's called externally
};