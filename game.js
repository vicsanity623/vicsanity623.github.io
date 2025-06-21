const firebaseConfig = {
    apiKey: "AIzaSyDyZ_aOOnuMNxC9QBE52KfjKzUyHjbagqk",
    authDomain: "tap-guardian-rpg.firebaseapp.com",
    projectId: "tap-guardian-rpg",
    storageBucket: "tap-guardian-rpg.appspot.com",
    messagingSenderId: "50272459426",
    appId: "1:50272459426:web:7ae4beb76ed67d4a3a15fb",
    measurementId: "G-4686TXHCHN"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
    let gameState = {};
    let audioCtx = null;
    let buffInterval = null;
    let lightningInterval = null;
    let currentNpc = {};
    let gauntletState = {};
    let availableExpeditions = [];
    const musicFileUrls = { main: 'main.mp3', battle: 'battle.mp3', expedition: 'expedition.mp3' };
    const musicManager = { isInitialized: false, audio: {}, currentTrack: null, fadeInterval: null };
    
    function initMusic() { if (musicManager.isInitialized) return; musicManager.isInitialized = true; playMusic('main'); }
    function playMusic(trackName) {
        if (!musicManager.isInitialized || !musicManager.audio[trackName]) return;
        const oldTrackName = musicManager.currentTrack;
        if (oldTrackName && musicManager.audio[oldTrackName]) { musicManager.audio[oldTrackName].pause(); musicManager.audio[oldTrackName].currentTime = 0; }
        if (oldTrackName === trackName) { if (musicManager.audio[trackName].paused) { musicManager.audio[trackName].play().catch(e => console.error("Music resume failed:", e)); } return; }
        const newTrack = musicManager.audio[trackName]; musicManager.currentTrack = trackName;
        if (newTrack) { newTrack.volume = 0.5; newTrack.play().catch(e => console.error(`Music play failed for ${trackName}:`, e)); }
    }
    function startBackgroundAssetLoading() {
        for (const key in musicFileUrls) { if (musicFileUrls[key]) { const audio = new Audio(musicFileUrls[key]); audio.loop = true; audio.preload = 'auto'; musicManager.audio[key] = audio; } }
    }
    const achievements = {
        tap100: { name: "Novice Tapper", desc: "Tap 100 times.", target: 100, unlocked: false }, tap1000: { name: "Adept Tapper", desc: "Tap 1,000 times.", target: 1000, unlocked: false },
        tap10000: { name: "Master Tapper", desc: "Tap 10,000 times.", target: 10000, unlocked: false }, level10: { name: "Getting Stronger", desc: "Reach level 10.", target: 10, unlocked: false },
        level25: { name: "Seasoned Guardian", desc: "Reach level 25.", target: 25, unlocked: false }, level50: { name: "True Champion", desc: "Reach the Ascension level.", target: 50, unlocked: false },
        defeat10: { name: "Goblin Slayer", desc: "Defeat 10 enemies.", target: 10, unlocked: false }, defeat50: { name: "Monster Hunter", desc: "Defeat 50 enemies.", target: 50, unlocked: false },
        ascend1: { name: "New Beginning", desc: "Ascend for the first time.", target: 1, unlocked: false }
    };
    const perks = {
        vigor: { name: "Guardian's Vigor", desc: "+10 Max HP & Energy per level.", maxLevel: 5, cost: [1, 1, 2, 2, 3] },
        tapXp: { name: "Tapper's Insight", desc: "+10% XP from Taps per level.", maxLevel: 5, cost: [1, 1, 2, 2, 3] },
        goldBoost: { name: "Fortune's Favor", desc: "+5% Gold from all sources per level.", maxLevel: 10, cost: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] },
        expeditionSpeed: { name: "Expeditionary Leader", desc: "-5% Expedition Duration per level.", maxLevel: 5, cost: [1, 2, 2, 3, 3] }
    };
    const itemData = {
        rarities: { common: { weight: 70, color: 'var(--rarity-common)', budget: 1, affixes: 1 }, uncommon: { weight: 20, color: 'var(--rarity-uncommon)', budget: 1.4, affixes: 2 }, rare: { weight: 7, color: 'var(--rarity-rare)', budget: 1.9, affixes: 2 }, epic: { weight: 2.5, color: 'var(--rarity-epic)', budget: 2.5, affixes: 3 }, legendary: { weight: 0.5, color: 'var(--rarity-legendary)', budget: 3.5, affixes: 4 } },
        types: { weapon: { base: ['Sword', 'Axe', 'Mace', 'Dagger'], primary: 'strength' }, armor: { base: ['Cuirass', 'Plate', 'Mail', 'Armor'], primary: 'fortitude' } },
        prefixes: { strength: 'Mighty', fortitude: 'Sturdy', agility: 'Swift', critChance: 'Deadly', goldFind: 'Gilded' },
        suffixes: { strength: 'of the Bear', fortitude: 'of the Tortoise', agility: 'of the Viper', critChance: 'of Piercing', goldFind: 'of Greed' },
        affixes: ['agility', 'critChance', 'goldFind']
    };
    const shopItems = {
        hpPotion: { name: "Health Potion", desc: "Instantly restores 50% of your Max HP.", cost: 150, type: 'consumable' },
        energyPotion: { name: "Energy Potion", desc: "Instantly restores 50% of your Max Energy.", cost: 100, type: 'consumable' },
        xpBoost: { name: "Scroll of Wisdom", desc: "+50% XP from all sources for 15 minutes.", cost: 500, type: 'buff', duration: 900 }
    };
    const permanentShopUpgrades = {
        strTraining: { name: "Strength Training", desc: "Permanently increases base Strength.", stat: 'strength', bonus: 1, levelReq: 10, maxLevel: 10, cost: (level) => 1000 * Math.pow(2, level) },
        forTraining: { name: "Fortitude Training", desc: "Permanently increases base Fortitude.", stat: 'fortitude', bonus: 1, levelReq: 10, maxLevel: 10, cost: (level) => 1000 * Math.pow(2, level) },
        agiTraining: { name: "Agility Training", desc: "Permanently increases base Agility.", stat: 'agility', levelReq: 20, maxLevel: 5, cost: (level) => 5000 * Math.pow(3, level) }
    };
    const expeditionData = {
        actions: ["Explore", "Patrol", "Scour", "Delve into", "Investigate"],
        locations: ["the Glimmering Caves", "the Whispering Woods", "the Forgotten Ruins", "the Sunken City", "the Dragon's Pass"],
        modifiers: {
            gold: { name: "Rich", description: "High chance of Gold", goldMod: 1.5, itemMod: 0.8 },
            item: { name: "Mysterious", description: "High chance of Items", goldMod: 0.8, itemMod: 1.5 },
            xp: { name: "Dangerous", description: "High XP reward", goldMod: 1, itemMod: 1, xpMod: 1.5 },
        }
    };
    const defaultState = {
        playerName: "Guardian", tutorialCompleted: false, level: 1, xp: 0, gold: 0,
        stats: { strength: 5, agility: 5, fortitude: 5, stamina: 5 },
        resources: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 },
        equipment: { weapon: null, armor: null }, expedition: { active: false, returnTime: 0 },
        ascension: { tier: 1, points: 0, perks: {} },
        permanentUpgrades: {},
        activeBuffs: {},
        achievements: JSON.parse(JSON.stringify(achievements)),
        counters: { taps: 0, enemiesDefeated: 0, ascensionCount: 0 }
    };
    const ASCENSION_LEVEL = 50;
    let tapCombo = { counter: 0, lastTapTime: 0, currentMultiplier: 1, frenzyTimeout: null };
    let expeditionInterval = null;
    const screens = document.querySelectorAll('.screen');
    const gameScreen = document.getElementById('game-screen');
    const loadGameBtn = document.getElementById('load-game-btn');
    const characterSprite = document.getElementById('character-sprite');
    const characterArea = document.getElementById('character-area');
    const playerNameLevel = document.getElementById('player-name-level');
    const healthBarFill = document.querySelector('#health-bar .stat-bar-fill');
    const healthBarLabel = document.querySelector('#health-bar .stat-bar-label');
    const energyBarFill = document.querySelector('#energy-bar .stat-bar-fill');
    const energyBarLabel = document.querySelector('#energy-bar .stat-bar-label');
    const xpBarFill = document.querySelector('#xp-bar .stat-bar-fill');
    const xpBarLabel = document.querySelector('#xp-bar .stat-bar-label');
    const coreStatsDisplay = document.getElementById('core-stats-display');
    const goldDisplay = document.getElementById('gold-display');
    const buffDisplay = document.getElementById('buff-display');
    const worldTierDisplay = document.getElementById('world-tier-display');
    const startGameBtn = document.getElementById('start-game-btn');
    const feedBtn = document.getElementById('feed-btn');
    const battleBtn = document.getElementById('battle-btn');
    const expeditionBtn = document.getElementById('expedition-btn');
    const shopBtn = document.getElementById('shop-btn');
    const modal = document.getElementById('notification-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const battleLog = document.getElementById('battle-log');
    const battlePlayerName = document.getElementById('battle-player-name');
    const attackBtn = document.getElementById('attack-btn');
    const gauntletActionBtn = document.getElementById('gauntlet-action-btn');
    const gauntletWaveDisplay = document.getElementById('gauntlet-wave-display');
    const battleNpcName = document.getElementById('battle-npc-name');
    const expeditionCancelBtn = document.getElementById('expedition-cancel-btn');
    const expeditionListContainer = document.getElementById('expedition-list-container');
    const ingameMenuBtn = document.getElementById('ingame-menu-btn');
    const ingameMenuModal = document.getElementById('ingame-menu-modal');
    const ingameMenuContent = document.getElementById('ingame-menu-content');
    const saveGameBtn = document.getElementById('save-game-btn');
    const optionsBtn = document.getElementById('options-btn');
    const quitToTitleBtn = document.getElementById('quit-to-title-btn');
    const returnToGameBtn = document.getElementById('return-to-game-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const inventoryModal = document.getElementById('inventory-modal');
    const weaponSlot = document.getElementById('weapon-slot');
    const armorSlot = document.getElementById('armor-slot');
    const closeInventoryBtn = document.getElementById('close-inventory-btn');
    const expeditionTimerDisplay = document.getElementById('expedition-timer-display');
    const windAnimationContainer = document.getElementById('wind-animation-container');
    const frenzyDisplay = document.getElementById('frenzy-display');
    const leaderboardBtn = document.getElementById('leaderboard-btn');
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const leaderboardList = document.getElementById('leaderboard-list');
    const closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');
    const toastContainer = document.getElementById('toast-container');
    const achievementsModal = document.getElementById('achievements-modal');
    const closeAchievementsBtn = document.getElementById('close-achievements-btn');
    const achievementsList = document.getElementById('achievements-list');
    const achievementsBtn = document.getElementById('achievements-btn');
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    const ascensionBtn = document.getElementById('ascension-btn');
    const ascensionModal = document.getElementById('ascension-modal');
    const closeAscensionBtn = document.getElementById('close-ascension-btn');
    const ascensionPointsDisplay = document.getElementById('ascension-points-display');
    const perksContainer = document.getElementById('perks-container');
    const shopModal = document.getElementById('shop-modal');
    const shopConsumablesContainer = document.getElementById('shop-consumables-container');
    const shopUpgradesContainer = document.getElementById('shop-upgrades-container');
    const closeShopBtn = document.getElementById('close-shop-btn');
    
    function showScreen(screenId) { 
        screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId).classList.add('active'); 
        if (screenId === 'battle-screen') { playMusic('battle'); } 
        else if (screenId === 'game-screen' || screenId === 'main-menu-screen') { if (!gameState.expedition || !gameState.expedition.active) { playMusic('main'); } }
    }
    function init() { 
        createWindEffect(); createStarfield(); startBackgroundAssetLoading();
        setTimeout(() => { showScreen('main-menu-screen'); if (!localStorage.getItem('tapGuardianSave')) { loadGameBtn.disabled = true; } }, 1500);
        buffInterval = setInterval(updateBuffs, 1000);
    }
    
    async function startGame() {
        initAudio();
        let playerName = ""; let isNameValid = false;
        while (!isNameValid) {
            const inputName = prompt("Enter your Guardian's name (3-15 chars):", "");
            if (inputName === null) { return; } 
            if (inputName.length < 3 || inputName.length > 15) { alert("Name must be between 3 and 15 characters."); continue; }
            try {
                const leaderboardDoc = await db.collection("leaderboard").doc(inputName).get();
                if (leaderboardDoc.exists) { alert(`The name "${inputName}" is already taken. Please choose another.`); } 
                else { playerName = inputName; isNameValid = true; }
            } catch (error) { console.error("Error checking name:", error); alert("Could not verify name with the server. Please check your connection and try again."); return; }
        }
        gameState = JSON.parse(JSON.stringify(defaultState));
        gameState.playerName = playerName;
        localStorage.setItem('tapGuardianLastLogin', new Date().toDateString());
        checkExpeditionStatus(); updateUI(); updateAscensionVisuals(); saveGame(); showScreen('game-screen');
    }

    function loadGame() {
        initAudio();
        const savedData = localStorage.getItem('tapGuardianSave');
        if (savedData) {
            let loadedState = JSON.parse(savedData);
            gameState = {...defaultState, ...loadedState};
            gameState.stats = {...defaultState.stats, ...loadedState.stats};
            gameState.resources = {...defaultState.resources, ...loadedState.resources};
            gameState.ascension = {...defaultState.ascension, ...loadedState.ascension};
            gameState.equipment = {...defaultState.equipment, ...(loadedState.equipment || {})};
            gameState.activeBuffs = loadedState.activeBuffs || {};
            gameState.permanentUpgrades = loadedState.permanentUpgrades || {};
            gameState.achievements = {...JSON.parse(JSON.stringify(achievements)), ...(loadedState.achievements || {})};
            gameState.counters = {...defaultState.counters, ...(loadedState.counters || {})};
            gameState.tutorialCompleted = loadedState.tutorialCompleted === true;
            const lastLogin = localStorage.getItem('tapGuardianLastLogin');
            const today = new Date().toDateString();
            if (lastLogin !== today) {
                const dailyGold = 50 + (gameState.ascension.tier * 25); const dailyXP = 100 + (gameState.ascension.tier * 50);
                gameState.gold += dailyGold; addXP(dailyXP);
                showNotification("Welcome Back!", `You received a daily login bonus of:<br><br>+${dailyGold} Gold<br>+${dailyXP} XP`);
            }
            localStorage.setItem('tapGuardianLastLogin', today);
            checkExpeditionStatus(); updateUI(); updateAscensionVisuals(); showScreen('game-screen');
        } else { showNotification("No Save Data Found!", "Starting a new game instead."); startGame(); }
    }
    function saveGame() { localStorage.setItem('tapGuardianSave', JSON.stringify(gameState)); loadGameBtn.disabled = false; }
    function getXpForNextLevel() { return Math.floor(100 * Math.pow(1.5, gameState.level - 1)); }

    function updateExpeditionTimer() {
        if (!gameState.expedition.active) { if (expeditionInterval) clearInterval(expeditionInterval); expeditionInterval = null; return; }
        const timeLeft = gameState.expedition.returnTime - Date.now();
        if (timeLeft <= 0) {
            expeditionTimerDisplay.textContent = "Returning..."; clearInterval(expeditionInterval); expeditionInterval = null;
            checkExpeditionStatus(); updateUI();
        } else {
            const pad = num => num.toString().padStart(2, '0');
            const hours = pad(Math.floor(timeLeft / 3600000));
            const minutes = pad(Math.floor((timeLeft % 3600000) / 60000));
            const seconds = pad(Math.floor((timeLeft % 60000) / 1000));
            expeditionTimerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        }
    }

    function updateUI() {
        if (!gameState.stats) return;
        const vigorBonus = (gameState.ascension.perks.vigor || 0) * 10;
        const baseMaxHp = 100 + (gameState.level - 1) * 10;
        const baseMaxEnergy = 100 + (gameState.level - 1) * 5;
        gameState.resources.maxHp = baseMaxHp + vigorBonus;
        gameState.resources.maxEnergy = baseMaxEnergy + vigorBonus;
        playerNameLevel.textContent = `${gameState.playerName} Lv. ${gameState.level}`;
        worldTierDisplay.textContent = `World Tier: ${gameState.ascension.tier}`;
        const xpForNext = getXpForNextLevel();
        healthBarFill.style.width = `${(gameState.resources.hp / gameState.resources.maxHp) * 100}%`;
        healthBarLabel.textContent = `HP: ${Math.floor(gameState.resources.hp)} / ${gameState.resources.maxHp}`;
        energyBarFill.style.width = `${(gameState.resources.energy / gameState.resources.maxEnergy) * 100}%`;
        energyBarLabel.textContent = `Energy: ${Math.floor(gameState.resources.energy)} / ${gameState.resources.maxEnergy}`;
        xpBarFill.style.width = `${(gameState.xp / xpForNext) * 100}%`;
        xpBarLabel.textContent = `XP: ${Math.floor(gameState.xp)} / ${xpForNext}`;
        coreStatsDisplay.innerHTML = `<span>STR: ${getTotalStat('strength')}</span><span>AGI: ${getTotalStat('agility')}</span><span>FOR: ${getTotalStat('fortitude')}</span><span>STA: ${getTotalStat('stamina')}</span><span>Crit: ${getTotalStat('critChance').toFixed(2)}%</span><span>Gold: ${getTotalStat('goldFind').toFixed(2)}%</span>`;
        goldDisplay.textContent = `Gold: ${gameState.gold}`;
        updateBuffDisplay();
        const onExpedition = gameState.expedition.active;
        characterSprite.style.display = onExpedition ? 'none' : 'block';
        expeditionTimerDisplay.style.display = onExpedition ? 'block' : 'none';
        windAnimationContainer.style.display = onExpedition ? 'block' : 'none';
        if (onExpedition) {
            expeditionBtn.textContent = `On Expedition`; expeditionBtn.disabled = true;
            if (!expeditionInterval) { expeditionInterval = setInterval(updateExpeditionTimer, 1000); updateExpeditionTimer(); }
        } else { expeditionBtn.textContent = `Expedition`; expeditionBtn.disabled = false; }
        feedBtn.disabled = onExpedition; battleBtn.disabled = onExpedition; inventoryBtn.disabled = onExpedition; shopBtn.disabled = onExpedition;
        if (gameState.tutorialCompleted) { tutorialOverlay.classList.remove('visible'); } else { tutorialOverlay.classList.add('visible'); }
    }
    function addXP(amount) { if (gameState.expedition.active) return;
        const tierMultiplier = Math.pow(1.2, gameState.ascension.tier - 1);
        let finalAmount = amount * tierMultiplier;
        if (gameState.activeBuffs.xpBoost) { finalAmount *= 1.5; }
        gameState.xp += finalAmount;
        if (gameState.xp >= getXpForNextLevel()) { levelUp(); }
        updateUI();
    }
    function levelUp() {
        const xpOver = gameState.xp - getXpForNextLevel(); gameState.level++; gameState.xp = xpOver;
        gameState.stats.strength += 2; gameState.stats.agility += 1; gameState.stats.fortitude += 2; gameState.stats.stamina += 1;
        gameState.resources.hp = gameState.resources.maxHp; gameState.resources.energy = gameState.resources.maxEnergy;
        playSound('levelUp', 1, 'triangle', 440, 880); triggerScreenShake(400); checkAllAchievements(); submitScoreToLeaderboard();
        showNotification("LEVEL UP!", `You are now Level ${gameState.level}!`);
        updateAscensionVisuals();
        saveGame();
    }
    function showNotification(title, text) { modal.classList.add('visible'); modalTitle.textContent = title; modalText.innerHTML = text; }
    function updateFrenzyVisuals() {
        const multiplier = tapCombo.currentMultiplier; const root = document.documentElement;
        if (multiplier > 1) {
            let color = 'var(--accent-color)';
            if (multiplier >= 15) { color = 'var(--health-color)'; } else if (multiplier >= 10) { color = 'var(--xp-color)'; }
            root.style.setProperty('--frenzy-glow-color', color);
            frenzyDisplay.textContent = `x${multiplier}`; frenzyDisplay.style.color = color;
            frenzyDisplay.classList.add('active'); characterSprite.classList.add('frenzy');
        } else { frenzyDisplay.classList.remove('active'); characterSprite.classList.remove('frenzy'); }
    }
    function activateFrenzy() {
        if (tapCombo.frenzyTimeout) { clearTimeout(tapCombo.frenzyTimeout); }
        tapCombo.currentMultiplier = (tapCombo.currentMultiplier === 1) ? 5 : tapCombo.currentMultiplier + 5;
        updateFrenzyVisuals(); tapCombo.frenzyTimeout = setTimeout(deactivateFrenzy, 7000);
    }
    function deactivateFrenzy() { tapCombo.currentMultiplier = 1; tapCombo.frenzyTimeout = null; updateFrenzyVisuals(); }
    function createParticles(event) {
        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div'); particle.className = 'particle';
            let clientX = event.clientX || (event.touches && event.touches[0].clientX); let clientY = event.clientY || (event.touches && event.touches[0].clientY);
            particle.style.left = `${clientX}px`; particle.style.top = `${clientY}px`;
            const xEnd = (Math.random() - 0.5) * 200; const yEnd = (Math.random() - 0.5) * 200;
            particle.style.setProperty('--x-end', `${xEnd}px`); particle.style.setProperty('--y-end', `${yEnd}px`);
            document.body.appendChild(particle); setTimeout(() => { particle.remove(); }, 800);
        }
    }
    function createXpOrb(event, xpGain) {
        let clientX = event.clientX || (event.touches && event.touches[0].clientX); let clientY = event.clientY || (event.touches && event.touches[0].clientY);
        const orbContainer = document.createElement('div'); orbContainer.className = 'xp-orb-container';
        orbContainer.style.left = `${clientX - 10}px`; orbContainer.style.top = `${clientY - 10}px`;
        orbContainer.innerHTML = `<div class="xp-orb"></div><div class="xp-orb-text">+${xpGain.toFixed(2)}</div>`;
        document.body.appendChild(orbContainer);
        const xpBarRect = document.querySelector('#xp-bar').getBoundingClientRect();
        const targetX = xpBarRect.left + (xpBarRect.width / 2); const targetY = xpBarRect.top + (xpBarRect.height / 2);
        setTimeout(() => { orbContainer.style.left = `${targetX}px`; orbContainer.style.top = `${targetY}px`; orbContainer.style.transform = 'scale(0)'; orbContainer.style.opacity = '0'; }, 50);
        setTimeout(() => { const xpBar = document.querySelector('#xp-bar'); xpBar.classList.add('bar-pulse'); addXP(xpGain); setTimeout(() => xpBar.classList.remove('bar-pulse'), 300); orbContainer.remove(); }, 850);
    }
    function handleTap(event) {
        if (gameState.expedition.active || gameState.resources.energy <= 0) return;
        initAudio();
        if (gameState.tutorialCompleted === false) { gameState.tutorialCompleted = true; tutorialOverlay.classList.remove('visible'); saveGame(); }
        gameState.counters.taps = (gameState.counters.taps || 0) + 1; checkAllAchievements();
        playSound('tap', 0.5, 'square', 150, 100, 0.05); const now = Date.now();
        if (now - tapCombo.lastTapTime < 1500) { tapCombo.counter++; } else { tapCombo.counter = 1; }
        tapCombo.lastTapTime = now;
        if (tapCombo.counter > 0 && tapCombo.counter % 15 === 0) { if (Math.random() < 0.45) { activateFrenzy(); } }
        if (Math.random() < 0.1) { triggerScreenShake(150); }
        let xpGain = 0.25 * tapCombo.currentMultiplier;
        if (gameState.level >= 30) { xpGain = 1.0 * tapCombo.currentMultiplier; } else if (gameState.level >= 10) { xpGain = 0.75 * tapCombo.currentMultiplier; }
        const tapXpBonus = 1 + (gameState.ascension.perks.tapXp || 0) * 0.10;
        xpGain *= tapXpBonus; createXpOrb(event, xpGain); gameState.resources.energy -= 0.1;
        if (tapCombo.currentMultiplier > 1) { createParticles(event); }
        characterSprite.style.animation = 'none'; void characterSprite.offsetWidth; characterSprite.classList.add('tapped');
        setTimeout(() => { 
            characterSprite.classList.remove('tapped'); updateAscensionVisuals();
        }, 200); 
        updateUI();
    }
    function feed() {
        if (gameState.gold >= 50) {
            gameState.gold -= 50; 
            gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + 20);
            gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + 10);
            playSound('feed', 1, 'sine', 200, 600, 0.2);
            showNotification("Yum!", "Energy and HP restored slightly."); updateUI(); saveGame();
        } else { showNotification("Not enough gold!", "You need 50 gold to feed your guardian."); }
    }
    function startExpedition(index) {
        const expedition = availableExpeditions[index]; if (!expedition) return;
        const speedBonus = 1 - (gameState.ascension.perks.expeditionSpeed || 0) * 0.05;
        const finalDuration = expedition.duration * speedBonus;
        gameState.expedition = { active: true, returnTime: Date.now() + finalDuration * 1000, name: expedition.name, modifiers: expedition.modifiers };
        showNotification("Expedition Started!", `Your guardian begins to ${expedition.name}.<br><br>They will return in ${(finalDuration / 60).toFixed(0)} minutes.`);
        saveGame(); updateUI(); showScreen('game-screen'); playMusic('expedition');
    }
    function checkExpeditionStatus() {
        if (gameState.expedition.active && Date.now() > gameState.expedition.returnTime) {
            const mods = gameState.expedition.modifiers || {};
            const goldMod = mods.goldMod || 1; const itemMod = mods.itemMod || 1; const xpMod = mods.xpMod || 1;
            gameState.expedition.active = false; playMusic('main');
            const tierMultiplier = Math.pow(1.5, gameState.ascension.tier - 1);
            const xpReward = Math.floor(100 * gameState.level * tierMultiplier * xpMod);
            const goldReward = Math.floor(50 * gameState.level * tierMultiplier * (1 + getTotalStat('goldFind') / 100) * goldMod);
            let rewardText = `Your guardian has returned from ${gameState.expedition.name}!<br><br>+${xpReward} XP<br>+${goldReward} Gold`;
            const itemFindChance = 0.3 + (gameState.ascension.tier * 0.05);
            if (Math.random() < (itemFindChance * itemMod)) {
                const foundItem = generateItem(); const currentItem = gameState.equipment[foundItem.type];
                rewardText += `<br><br>Found: <strong style="color:${foundItem.rarity.color}">${foundItem.name}</strong>`;
                if (!currentItem || foundItem.power > currentItem.power) {
                    gameState.equipment[foundItem.type] = foundItem; rewardText += `<br><br>New item equipped!`;
                } else { rewardText += `<br><br>Your current item is stronger.`; }
            }
            addXP(xpReward); gameState.gold += goldReward;
            showNotification("Expedition Complete!", rewardText); saveGame(); updateUI();
        }
    }
    function getTotalStat(stat) {
        let total = gameState.stats[stat] || 0;
        for (const slot in gameState.equipment) {
            const item = gameState.equipment[slot];
            if (item && item.stats && item.stats[stat]) { total += item.stats[stat]; }
        }
        for (const upgradeId in gameState.permanentUpgrades) {
            const upgradeData = permanentShopUpgrades[upgradeId];
            if (upgradeData && upgradeData.stat === stat) {
                total += (gameState.permanentUpgrades[upgradeId] || 0) * upgradeData.bonus;
            }
        }
        if (stat === 'goldFind') { total += (gameState.ascension.perks.goldBoost || 0) * 5; }
        return total;
    }
    function ascend() {
        if (gameState.level < ASCENSION_LEVEL) { showNotification("Not Ready", `You must reach Level ${ASCENSION_LEVEL} to Ascend.`); return; }
        if (confirm(`Are you sure you want to Ascend?\n\nYour Level, Stats, Gold, and Equipment will be reset.\n\nYou will advance to World Tier ${gameState.ascension.tier + 1} and gain 1 Ascension Point. Your Perks and Permanent Shop Upgrades will remain.`)) {
            gameState.ascension.tier++; gameState.ascension.points++;
            gameState.counters.ascensionCount = (gameState.counters.ascensionCount || 0) + 1; checkAllAchievements();
            playSound('ascend', 1, 'sawtooth', 100, 1000, 1);
            gameState.level = 1; gameState.xp = 0; gameState.gold = 0;
            gameState.stats = JSON.parse(JSON.stringify(defaultState.stats));
            gameState.equipment = JSON.parse(JSON.stringify(defaultState.equipment));
            const oldHp = gameState.resources.hp; const oldEnergy = gameState.resources.energy;
            gameState.resources = JSON.parse(JSON.stringify(defaultState.resources));
            updateUI();
            gameState.resources.hp = Math.min(oldHp, gameState.resources.maxHp);
            gameState.resources.energy = Math.min(oldEnergy, gameState.resources.maxEnergy);
            submitScoreToLeaderboard();
            updateAscensionVisuals();
            saveGame(); updateUI(); ingameMenuModal.classList.remove('visible');
            showNotification("ASCENDED!", `Welcome to World Tier ${gameState.ascension.tier}. You have gained 1 Ascension Point to spend.`);
        }
    }
    async function submitScoreToLeaderboard() {
        if (!gameState.playerName || gameState.playerName === "Guardian") return;
        const score = { name: gameState.playerName, level: gameState.level, tier: gameState.ascension.tier, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
        try { await db.collection("leaderboard").doc(gameState.playerName).set(score, { merge: true }); } catch (error) { console.error("Error submitting score: ", error); }
    }
    async function showLeaderboard() {
        leaderboardList.innerHTML = "<li>Loading...</li>"; leaderboardModal.classList.add('visible');
        try {
            const snapshot = await db.collection("leaderboard").orderBy("tier", "desc").orderBy("level", "desc").limit(20).get();
            if (snapshot.empty) { leaderboardList.innerHTML = "<li>No scores yet. Be the first!</li>"; return; }
            leaderboardList.innerHTML = ""; let rank = 1;
            snapshot.forEach(doc => { const data = doc.data(); const li = document.createElement('li'); li.innerHTML = `<span class="rank-name">${rank}. ${data.name} (Tier ${data.tier})</span> <span class="rank-level">Level ${data.level}</span>`; leaderboardList.appendChild(li); rank++; });
        } catch (error) { console.error("Error fetching leaderboard: ", error); leaderboardList.innerHTML = "<li>Error loading scores.</li>"; }
    }
    function startGauntlet() {
        gauntletState = { currentWave: 0, totalWaves: 5, totalXp: 0, totalGold: 0 };
        battlePlayerName.textContent = gameState.playerName;
        battleLog.innerHTML = ""; addBattleLog("The Gauntlet begins! Prepare for battle.", "log-system");
        showScreen('battle-screen');
        startNextWave();
    }
    function startNextWave() {
        gauntletState.currentWave++; gauntletWaveDisplay.textContent = `Wave: ${gauntletState.currentWave} / ${gauntletState.totalWaves}`;
        const tierMultiplier = gameState.ascension.tier; const levelMultiplier = Math.max(1, gameState.level - 2 + Math.floor(Math.random() * 5));
        const waveMultiplier = 1 + (gauntletState.currentWave - 1) * 0.25;
        currentNpc = {
            name: `Wave ${gauntletState.currentWave} Goblin`,
            hp: Math.floor((60 + 8 * levelMultiplier) * tierMultiplier * waveMultiplier), maxHp: Math.floor((60 + 8 * levelMultiplier) * tierMultiplier * waveMultiplier),
            strength: Math.floor((3 + 2 * levelMultiplier) * tierMultiplier * waveMultiplier), agility: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier),
            fortitude: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier),
            xpReward: Math.floor((25 * levelMultiplier) * tierMultiplier * waveMultiplier), goldReward: Math.floor((15 * levelMultiplier) * tierMultiplier * waveMultiplier)
        };
        battleNpcName.textContent = `${currentNpc.name} Lv. ${levelMultiplier}`;
        updateBattleUI(); addBattleLog(`A wild ${currentNpc.name} appears!`, "log-system");
        attackBtn.disabled = true; gauntletActionBtn.disabled = true;
        setTimeout(() => {
            if (currentNpc.agility > getTotalStat('agility')) {
                addBattleLog(`${currentNpc.name} is faster and attacks first!`, "log-enemy"); npcAttack();
            } else {
                addBattleLog("You are faster! Your turn.", "log-player");
                attackBtn.disabled = false; gauntletActionBtn.disabled = false; gauntletActionBtn.textContent = 'Flee';
            }
        }, 1000);
    }
    function playerAttack() {
        attackBtn.disabled = true; gauntletActionBtn.disabled = true;
        const isCrit = Math.random() < (getTotalStat('critChance') / 100);
        const baseDamage = Math.max(1, getTotalStat('strength') * 2 - currentNpc.fortitude);
        const damage = Math.floor(baseDamage * (isCrit ? 2 : 1));
        currentNpc.hp = Math.max(0, currentNpc.hp - damage);
        if (isCrit) { addBattleLog('CRITICAL HIT!', 'log-crit'); playSound('crit', 0.8, 'square', 1000, 500, 0.2); } 
        else { playSound('hit', 0.8, 'square', 400, 100, 0.1); }
        addBattleLog(`You attack for ${damage} damage!`, "log-player"); createDamageNumber(damage, isCrit, true);
        updateBattleUI();
        if (currentNpc.hp <= 0) { endBattle(true); } else { setTimeout(npcAttack, 1500); }
    }
    function npcAttack() {
        if (Math.random() < (getTotalStat('agility') / 250)) { addBattleLog('You dodged the attack!', 'log-player'); attackBtn.disabled = false; gauntletActionBtn.disabled = false; return; }
        const damage = Math.max(1, currentNpc.strength * 2 - getTotalStat('fortitude'));
        gameState.resources.hp = Math.max(0, gameState.resources.hp - damage);
        playSound('hit', 0.6, 'sawtooth', 200, 50, 0.15); triggerScreenShake(200); createDamageNumber(damage, false, false);
        addBattleLog(`${currentNpc.name} attacks for ${damage} damage!`, "log-enemy");
        updateBattleUI();
        if (gameState.resources.hp <= 0) { endBattle(false); } else { attackBtn.disabled = false; gauntletActionBtn.disabled = false; }
    }
    function endBattle(playerWon) {
        attackBtn.disabled = true; gauntletActionBtn.disabled = true;
        if (playerWon) {
            gameState.counters.enemiesDefeated = (gameState.counters.enemiesDefeated || 0) + 1;
            const finalGoldReward = Math.floor(currentNpc.goldReward * (1 + getTotalStat('goldFind') / 100));
            gauntletState.totalXp += currentNpc.xpReward; gauntletState.totalGold += finalGoldReward;
            addBattleLog(`You defeated the ${currentNpc.name}!`, "log-system");
            if (gauntletState.currentWave >= gauntletState.totalWaves) {
                playSound('victory', 1, 'triangle', 523, 1046, 0.4);
                let bonusItem = generateItem();
                let rewardText = `GAUNTLET COMPLETE!<br><br>Total Rewards:<br>+${gauntletState.totalGold} Gold<br>+${gauntletState.totalXp} XP<br><br>Completion Bonus:<br><strong style="color:${bonusItem.rarity.color}">${bonusItem.name}</strong>`;
                addXP(gauntletState.totalXp); gameState.gold += gauntletState.totalGold;
                if (!gameState.equipment[bonusItem.type] || bonusItem.power > gameState.equipment[bonusItem.type].power) { gameState.equipment[bonusItem.type] = bonusItem; }
                setTimeout(() => { showNotification("Victory!", rewardText); showScreen('game-screen'); saveGame(); updateUI(); }, 2000);
            } else {
                addBattleLog(`Wave ${gauntletState.currentWave} cleared! Prepare for the next wave...`, 'log-system');
                setTimeout(() => {
                    gauntletActionBtn.textContent = `Claim (${gauntletState.totalGold}G) & Flee`;
                    gauntletActionBtn.disabled = false; attackBtn.disabled = false; attackBtn.textContent = "Next Wave"; attackBtn.onclick = startNextWave;
                }, 1500);
            }
        } else {
            playSound('defeat', 1, 'sine', 440, 110, 0.8);
            addBattleLog("You have been defeated... The Gauntlet ends.", "log-system");
            setTimeout(() => {
                showNotification("Defeat", "You black out and wake up back home. You lost half your gold.");
                gameState.gold = Math.floor(gameState.gold / 2); gameState.resources.hp = 1;
                showScreen('game-screen'); saveGame(); updateUI();
            }, 2000);
        }
    }
    function claimAndFlee() {
        addBattleLog(`You claim your rewards and flee the Gauntlet!`, "log-player");
        addXP(gauntletState.totalXp); gameState.gold += gauntletState.totalGold;
        let rewardText = `You escaped the Gauntlet with your life!<br><br>Total Rewards:<br>+${gauntletState.totalGold} Gold<br>+${gauntletState.totalXp} XP`;
        setTimeout(() => { showNotification("Gauntlet Run Over", rewardText); showScreen('game-screen'); saveGame(); updateUI(); }, 2000);
    }
    function generateItem() {
        const roll = Math.random() * 100; let chosenRarityKey = 'common'; let cumulativeWeight = 0;
        for(const key in itemData.rarities) { cumulativeWeight += itemData.rarities[key].weight; if (roll < cumulativeWeight) { chosenRarityKey = key; break; } }
        const rarity = itemData.rarities[chosenRarityKey];
        const itemTypeKey = Math.random() < 0.5 ? 'weapon' : 'armor'; const itemType = itemData.types[itemTypeKey];
        const baseName = itemType.base[Math.floor(Math.random() * itemType.base.length)]; const primaryStat = itemType.primary;
        const stats = {}; let power = 0; const totalBudget = (gameState.level + (gameState.ascension.tier * 5)) * rarity.budget;
        stats[primaryStat] = Math.ceil(totalBudget * 0.6); power += stats[primaryStat];
        let availableAffixes = [...itemData.affixes]; let namePrefix = itemData.prefixes[primaryStat]; let nameSuffix = '';
        for (let i = 1; i < rarity.affixes && availableAffixes.length > 0; i++) {
            const affixIndex = Math.floor(Math.random() * availableAffixes.length); const affix = availableAffixes.splice(affixIndex, 1)[0];
            let value;
            if (affix === 'critChance' || affix === 'goldFind') { value = Math.max(1, Math.ceil(totalBudget * 0.15 * (Math.random() * 0.5 + 0.75))); power += value * 3; } 
            else { value = Math.ceil(totalBudget * 0.25 * (Math.random() * 0.5 + 0.75)); power += value; }
            stats[affix] = value; if (i === 1) { nameSuffix = itemData.suffixes[affix]; }
        }
        return { type: itemTypeKey, name: `${namePrefix} ${baseName} ${nameSuffix}`.trim(), rarity: { key: chosenRarityKey, color: rarity.color }, stats: stats, power: power };
    }
    function updateInventoryUI() {
        function updateSlot(slot, item) {
            if (item) {
                let statsHtml = '<div class="item-stats">';
                for (const stat in item.stats) { const value = item.stats[stat]; const suffix = (stat === 'critChance' || stat === 'goldFind') ? '%' : ''; statsHtml += `<span class="item-stat">+${value}${suffix} ${stat}</span>`; }
                statsHtml += '</div>';
                slot.innerHTML = `<span class="item-name" style="color:${item.rarity.color}">${item.name}</span>${statsHtml}`;
            } else { slot.innerHTML = `${slot.id === 'weapon-slot' ? 'Weapon' : 'Armor'}: None`; }
        }
        updateSlot(weaponSlot, gameState.equipment.weapon); updateSlot(armorSlot, gameState.equipment.armor);
    }
    function generateAndShowExpeditions() {
        availableExpeditions = []; expeditionListContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const action = expeditionData.actions[Math.floor(Math.random() * expeditionData.actions.length)];
            const location = expeditionData.locations[Math.floor(Math.random() * expeditionData.locations.length)];
            const modKeys = Object.keys(expeditionData.modifiers);
            const modKey = modKeys[Math.floor(Math.random() * modKeys.length)];
            const modifier = expeditionData.modifiers[modKey];
            const duration = (Math.floor(Math.random() * 10) + 20) * 60; // 20-29 minutes
            const expedition = { name: `${action} ${location}`, description: modifier.description, duration: duration, modifiers: { goldMod: modifier.goldMod, itemMod: modifier.itemMod, xpMod: modifier.xpMod }, index: i };
            availableExpeditions.push(expedition);
            const itemEl = document.createElement('div'); itemEl.className = 'expedition-item';
            itemEl.innerHTML = `<div class="expedition-info"><strong>${expedition.name}</strong><div class="expedition-desc">${expedition.description} (~${Math.round(expedition.duration / 60)} mins)</div></div><button data-index="${i}">Begin</button>`;
            itemEl.querySelector('button').onclick = () => startExpedition(expedition.index);
            expeditionListContainer.appendChild(itemEl);
        }
    }
    function createWindEffect() {
        for(let i=0; i<20; i++) { const streak = document.createElement('div'); streak.className = 'wind-streak'; streak.style.top = `${Math.random() * 100}%`; streak.style.width = `${Math.random() * 150 + 50}px`; streak.style.animationDuration = `${Math.random() * 3 + 2}s`; streak.style.animationDelay = `${Math.random() * 5}s`; windAnimationContainer.appendChild(streak); }
    }
    function createStarfield() {
        const container = document.getElementById('background-stars');
        for(let i=0; i<100; i++) { const star = document.createElement('div'); star.className = 'star'; const size = Math.random() * 2 + 1; star.style.width = `${size}px`; star.style.height = `${size}px`; star.style.top = `${Math.random() * 100}%`; star.style.left = `${Math.random() * 100}%`; star.style.animationDuration = `${Math.random() * 50 + 25}s`; star.style.animationDelay = `${Math.random() * 50}s`; container.appendChild(star); }
    }
    function initAudio() { if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); initMusic(); } }
    function playSound(type, volume = 1, wave = 'sine', startFreq = 440, endFreq = 440, duration = 0.1) {
        if (!audioCtx) return;
        const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); oscillator.type = wave;
        oscillator.frequency.setValueAtTime(startFreq, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.start(); oscillator.stop(audioCtx.currentTime + duration);
    }
    function triggerScreenShake(duration = 500) { document.body.classList.add('screen-shake'); setTimeout(() => document.body.classList.remove('screen-shake'), duration); }
    function showToast(message) { const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; toastContainer.appendChild(toast); setTimeout(() => { toast.remove(); }, 4000); }
    function createDamageNumber(amount, isCrit, isPlayerSource) {
        const num = document.createElement('div'); num.textContent = amount; num.className = 'damage-text';
        if (isPlayerSource) num.classList.add('player-damage'); else num.classList.add('enemy-damage');
        if (isCrit) num.classList.add('crit'); document.getElementById('battle-arena').appendChild(num);
        setTimeout(() => { num.style.transform = 'translateY(-80px)'; num.style.opacity = '0'; }, 10);
        setTimeout(() => { num.remove(); }, 800);
    }
    function unlockAchievement(id) {
        if (!gameState.achievements[id] || gameState.achievements[id].unlocked) return;
        gameState.achievements[id].unlocked = true; showToast(`Achievement Unlocked: ${gameState.achievements[id].name}`);
        playSound('levelUp', 0.7, 'triangle', 880, 1200, 0.3);
    }
    function checkAllAchievements() {
        if (!gameState.counters) return;
        if (gameState.counters.taps >= 100) unlockAchievement('tap100'); if (gameState.counters.taps >= 1000) unlockAchievement('tap1000');
        if (gameState.counters.taps >= 10000) unlockAchievement('tap10000'); if (gameState.level >= 10) unlockAchievement('level10');
        if (gameState.level >= 25) unlockAchievement('level25'); if (gameState.level >= 50) unlockAchievement('level50');
        if (gameState.counters.enemiesDefeated >= 10) unlockAchievement('defeat10'); if (gameState.counters.enemiesDefeated >= 50) unlockAchievement('defeat50');
        if (gameState.counters.ascensionCount >= 1) unlockAchievement('ascend1');
    }
    function updateAchievementsUI() {
        achievementsList.innerHTML = '';
        for (const id in gameState.achievements) { const ach = gameState.achievements[id]; const li = document.createElement('li'); if (ach.unlocked) li.classList.add('unlocked'); li.innerHTML = `<strong>${ach.name}</strong><div class="achievement-desc">${ach.desc}</div>`; achievementsList.appendChild(li); }
    }
    function updatePerksUI() {
        perksContainer.innerHTML = ''; ascensionPointsDisplay.textContent = gameState.ascension.points;
        for (const perkId in perks) {
            const perkData = perks[perkId]; const currentLevel = gameState.ascension.perks[perkId] || 0;
            const perkItem = document.createElement('div'); perkItem.className = 'perk-item';
            const infoDiv = document.createElement('div'); infoDiv.className = 'perk-info';
            infoDiv.innerHTML = `<strong>${perkData.name}</strong><div class="perk-desc">${perkData.desc}</div>`;
            const levelSpan = document.createElement('span'); levelSpan.className = 'perk-level';
            levelSpan.textContent = `Lvl ${currentLevel}/${perkData.maxLevel}`; const buyBtn = document.createElement('button');
            if (currentLevel >= perkData.maxLevel) { buyBtn.textContent = 'Maxed'; buyBtn.disabled = true; } 
            else { const cost = perkData.cost[currentLevel]; buyBtn.textContent = `Up (${cost} AP)`; if (gameState.ascension.points < cost) { buyBtn.disabled = true; } buyBtn.onclick = () => buyPerk(perkId); }
            perkItem.appendChild(infoDiv); perkItem.appendChild(levelSpan); perkItem.appendChild(buyBtn); perksContainer.appendChild(perkItem);
        }
    }
    function buyPerk(perkId) {
        const perkData = perks[perkId]; const currentLevel = gameState.ascension.perks[perkId] || 0;
        if (currentLevel >= perkData.maxLevel) return; const cost = perkData.cost[currentLevel];
        if (gameState.ascension.points >= cost) { gameState.ascension.points -= cost; gameState.ascension.perks[perkId] = (gameState.ascension.perks[perkId] || 0) + 1; playSound('levelUp', 0.8, 'sine', 600, 1200, 0.2); updatePerksUI(); updateUI(); saveGame(); }
    }
    function updateShopUI() {
        shopConsumablesContainer.innerHTML = '';
        for (const itemId in shopItems) {
            const itemData = shopItems[itemId]; const shopItem = document.createElement('div'); shopItem.className = 'shop-item';
            const infoDiv = document.createElement('div'); infoDiv.className = 'shop-info';
            infoDiv.innerHTML = `<strong>${itemData.name}</strong><div class="shop-desc">${itemData.desc}</div>`;
            const buyBtn = document.createElement('button'); buyBtn.textContent = `Buy (${itemData.cost} G)`;
            if (gameState.gold < itemData.cost || (itemData.type === 'buff' && gameState.activeBuffs[itemId])) { buyBtn.disabled = true; }
            buyBtn.onclick = () => buyShopItem(itemId, 'consumable'); shopItem.appendChild(infoDiv); shopItem.appendChild(buyBtn); shopConsumablesContainer.appendChild(shopItem);
        }
        shopUpgradesContainer.innerHTML = '';
        for (const upgradeId in permanentShopUpgrades) {
            const upgradeData = permanentShopUpgrades[upgradeId]; const currentLevel = gameState.permanentUpgrades[upgradeId] || 0;
            const shopItem = document.createElement('div'); shopItem.className = 'shop-item';
            const infoDiv = document.createElement('div'); infoDiv.className = 'shop-info';
            infoDiv.innerHTML = `<strong>${upgradeData.name}</strong><div class="shop-desc">${upgradeData.desc} (Lvl ${currentLevel}/${upgradeData.maxLevel})</div>`;
            const buyBtn = document.createElement('button');
            if (currentLevel >= upgradeData.maxLevel) { buyBtn.textContent = 'Maxed'; buyBtn.disabled = true; } 
            else if (gameState.level < upgradeData.levelReq) { buyBtn.textContent = `Req Lvl ${upgradeData.levelReq}`; buyBtn.disabled = true; }
            else { const cost = upgradeData.cost(currentLevel); buyBtn.textContent = `Upgrade (${cost} G)`; if (gameState.gold < cost) { buyBtn.disabled = true; } buyBtn.onclick = () => buyShopItem(upgradeId, 'permanent'); }
            shopItem.appendChild(infoDiv); shopItem.appendChild(buyBtn); shopUpgradesContainer.appendChild(shopItem);
        }
    }
    function buyShopItem(itemId, type) {
        if (type === 'permanent') {
            const upgrade = permanentShopUpgrades[itemId]; const currentLevel = gameState.permanentUpgrades[itemId] || 0;
            const cost = upgrade.cost(currentLevel);
            if (gameState.gold >= cost) {
                gameState.gold -= cost; gameState.permanentUpgrades[itemId] = currentLevel + 1;
                showToast(`Purchased ${upgrade.name} Level ${currentLevel + 1}!`);
            }
        } else {
            const item = shopItems[itemId];
            if (gameState.gold >= item.cost) {
                gameState.gold -= item.cost;
                switch (itemId) {
                    case 'hpPotion': gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + gameState.resources.maxHp * 0.5); break;
                    case 'energyPotion': gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + gameState.resources.maxEnergy * 0.5); break;
                    case 'xpBoost': gameState.activeBuffs[itemId] = { expiry: Date.now() + item.duration * 1000 }; break;
                }
                showToast(`Purchased ${item.name}!`);
            }
        }
        updateUI(); updateShopUI(); saveGame();
    }
    function updateBuffs() {
        if (!gameState.activeBuffs) return; let buffsUpdated = false;
        for (const buffId in gameState.activeBuffs) {
            if (Date.now() > gameState.activeBuffs[buffId].expiry) {
                delete gameState.activeBuffs[buffId]; showToast(`${shopItems[buffId].name} has worn off.`); buffsUpdated = true;
            }
        }
        if (buffsUpdated) { updateUI(); saveGame(); }
    }
    function updateBuffDisplay() {
        let buffText = "";
        if (gameState.activeBuffs) {
            for (const buffId in gameState.activeBuffs) {
                const timeLeft = Math.round((gameState.activeBuffs[buffId].expiry - Date.now()) / 1000);
                buffText += `${shopItems[buffId].name} (${timeLeft}s) `;
            }
        }
        buffDisplay.textContent = buffText;
    }
    function createLightningEffect() {
        const bolt = document.createElement('div');
        bolt.className = 'lightning-bolt';
        bolt.style.left = `${Math.random() * 100}%`;
        bolt.style.transform = `rotate(${(Math.random() - 0.5) * 20}deg)`;
        characterArea.appendChild(bolt);
        setTimeout(() => bolt.remove(), 200);
    }
    function updateAscensionVisuals() {
        characterSprite.classList.remove('aura-level-10', 'aura-ascended');
        gameScreen.classList.remove('background-glitch');
        if (lightningInterval) clearInterval(lightningInterval);
        lightningInterval = null;

        const tier = gameState.ascension.tier;
        if (tier >= 5) {
            characterSprite.classList.add('aura-ascended');
            gameScreen.classList.add('background-glitch');
            lightningInterval = setInterval(createLightningEffect, 3000);
        } else if (tier >= 3) {
            characterSprite.classList.add('aura-ascended');
        } else if (gameState.level >= 10) {
            characterSprite.classList.add('aura-level-10');
        } else {
            characterSprite.style.animation = 'idle-breathe 4s ease-in-out infinite';
        }
    }
    startGameBtn.addEventListener('click', startGame); loadGameBtn.addEventListener('click', loadGame);
    characterSprite.addEventListener('click', handleTap); characterSprite.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e.touches[0]); }, {passive: false});
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('visible'));
    feedBtn.addEventListener('click', feed); 
    battleBtn.addEventListener('click', () => { attackBtn.textContent = "Attack"; attackBtn.onclick = playerAttack; startGauntlet(); });
    gauntletActionBtn.addEventListener('click', () => { if (gauntletState.currentWave > 0 && gauntletState.currentWave <= gauntletState.totalWaves) { claimAndFlee(); } });
    expeditionBtn.addEventListener('click', () => { generateAndShowExpeditions(); showScreen('expedition-screen'); }); 
    shopBtn.addEventListener('click', () => { updateShopUI(); shopModal.classList.add('visible'); });
    expeditionCancelBtn.addEventListener('click', () => showScreen('game-screen'));
    ingameMenuBtn.addEventListener('click', () => {
        let ascendBtn = document.getElementById('ascend-btn');
        if (gameState.level >= ASCENSION_LEVEL && !ascendBtn) {
            ascendBtn = document.createElement('button'); ascendBtn.id = 'ascend-btn'; ascendBtn.className = 'ascend-button'; ascendBtn.textContent = 'Ascend';
            ascendBtn.onclick = ascend; ingameMenuContent.insertBefore(ascendBtn, returnToGameBtn);
        } else if (gameState.level < ASCENSION_LEVEL && ascendBtn) { ascendBtn.remove(); }
        ingameMenuModal.classList.add('visible');
    });
    returnToGameBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); });
    saveGameBtn.addEventListener('click', () => { saveGame(); showToast("Game Saved!"); });
    optionsBtn.addEventListener('click', () => { alert('Options not yet implemented!'); });
    quitToTitleBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); showScreen('main-menu-screen'); });
    inventoryBtn.addEventListener('click', () => { updateInventoryUI(); inventoryModal.classList.add('visible'); });
    closeInventoryBtn.addEventListener('click', () => { inventoryModal.classList.remove('visible'); });
    leaderboardBtn.addEventListener('click', showLeaderboard);
    closeLeaderboardBtn.addEventListener('click', () => { leaderboardModal.classList.remove('visible'); });
    achievementsBtn.addEventListener('click', () => { updateAchievementsUI(); achievementsModal.classList.add('visible'); });
    closeAchievementsBtn.addEventListener('click', () => { achievementsModal.classList.remove('visible'); });
    ascensionBtn.addEventListener('click', () => { updatePerksUI(); ascensionModal.classList.add('visible'); });
    closeAscensionBtn.addEventListener('click', () => { ascensionModal.classList.remove('visible'); });
    closeShopBtn.addEventListener('click', () => { shopModal.classList.remove('visible'); });
    const handleVisualTap = (e) => {
        if (gameState.expedition.active || gameState.resources.energy <= 0) return;
        const characterArea = document.getElementById('character-area'); const spriteRect = characterSprite.getBoundingClientRect(); const areaRect = characterArea.getBoundingClientRect();
        const flash = document.createElement('div'); flash.className = 'tap-flash-overlay';
        flash.style.width = `${spriteRect.width}px`; flash.style.height = `${spriteRect.height}px`;
        flash.style.left = `${spriteRect.left - areaRect.left}px`; flash.style.top = `${spriteRect.top - areaRect.top}px`;
        characterArea.appendChild(flash); setTimeout(() => { flash.remove(); }, 200);
    };
    characterSprite.addEventListener('click', handleVisualTap); characterSprite.addEventListener('touchstart', handleVisualTap, { passive: true });
    setInterval(() => { if (gameState.resources && gameState.resources.energy < gameState.resources.maxEnergy && !gameState.expedition.active) { gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + 0.15); updateUI(); } }, 1000);
    init();
});