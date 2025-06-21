const firebaseConfig = {
  apiKey: "AIzaSyAvutjrwWBsZ_5bCPN-nbL3VpP2NQ94EUY",
  authDomain: "tap-guardian-rpg.firebaseapp.com",
  projectId: "tap-guardian-rpg",
  storageBucket: "tap-guardian-rpg.appspot.com",
  messagingSenderId: "50272459426",
  appId: "1:50272459426:web:8f67f9126d3bc3a23a15fb",
  measurementId: "G-XJRE7YNPZR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
    const GAME_VERSION = 1.9; // Updated version for new features
    let gameState = {};
    let audioCtx = null;
    let buffInterval = null;
    let lightningInterval = null;
    
    // Centralized state for the battle system.
    let battleState = {
        isActive: false,
        currentWave: 0,
        totalWaves: 5,
        playerHp: 0,
        enemy: null,
        totalXp: 0,
        totalGold: 0,
        totalDamage: 0
    };

    let availableExpeditions = [];
    let forgeSlots = [null, null];
    let partnerTimerInterval = null;
    const musicFileUrls = { main: 'main.mp3', battle: 'battle.mp3', expedition: 'expedition.mp3' };
    const musicManager = { isInitialized: false, audio: {}, currentTrack: null, fadeInterval: null };
    let tapCombo = { counter: 0, lastTapTime: 0, currentMultiplier: 1, frenzyTimeout: null };
    let expeditionInterval = null;

    // --- FIXED/MERGED ---: Added all missing constant data from the working file.
    const achievements = {
        tap100: { name: "Novice Tapper", desc: "Tap 100 times.", target: 100, unlocked: false, reward: { type: 'gold', amount: 50 } },
        tap1000: { name: "Adept Tapper", desc: "Tap 1,000 times.", target: 1000, unlocked: false, reward: { type: 'gold', amount: 250 } },
        tap10000: { name: "Master Tapper", desc: "Tap 10,000 times.", target: 10000, unlocked: false, reward: { type: 'gold', amount: 1000 } },
        level10: { name: "Getting Stronger", desc: "Reach level 10.", target: 10, unlocked: false, reward: { type: 'item', rarity: 'uncommon' } },
        level25: { name: "Seasoned Guardian", desc: "Reach level 25.", target: 25, unlocked: false, reward: { type: 'item', rarity: 'rare' } },
        level50: { name: "True Champion", desc: "Reach the Ascension level.", target: 50, unlocked: false, reward: { type: 'gold', amount: 5000 } },
        defeat10: { name: "Goblin Slayer", desc: "Defeat 10 enemies.", target: 10, unlocked: false, reward: { type: 'gold', amount: 100 } },
        defeat100: { name: "Monster Hunter", desc: "Defeat 100 enemies.", target: 100, unlocked: false, reward: { type: 'gold', amount: 500 } },
        defeat500: { name: "Legendary Hunter", desc: "Defeat 500 enemies.", target: 500, unlocked: false, reward: { type: 'item', rarity: 'epic' } },
        ascend1: { name: "New Beginning", desc: "Ascend for the first time.", target: 1, unlocked: false, reward: { type: 'gold', amount: 1000 } },
        ascend5: { name: "World Walker", desc: "Reach Ascension Tier 5.", target: 5, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
        battle1: { name: "Battle Runner", desc: "Complete a Battle sequence once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2000 } },
        forge1: { name: "Apprentice Blacksmith", desc: "Forge an item once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 750 } },
        findLegendary: { name: "A Glimmer of Power", desc: "Find your first Legendary item.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2500 } },
        masterGuardian: { name: "Master Guardian", desc: "Reach Ascension Tier 5 and Level 50.", target: 1, unlocked: false, reward: { type: 'egg' } }
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
        version: GAME_VERSION,
        playerName: "Guardian", tutorialCompleted: false, level: 1, xp: 0, gold: 0,
        stats: { strength: 5, agility: 5, fortitude: 5, stamina: 5 },
        resources: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 },
        equipment: { weapon: null, armor: null }, 
        inventory: [], hasEgg: false, partner: null,
        expedition: { active: false, returnTime: 0 },
        ascension: { tier: 1, points: 0, perks: {} },
        permanentUpgrades: {},
        activeBuffs: {},
        achievements: JSON.parse(JSON.stringify(achievements)), // Deep copy achievements
        counters: { taps: 0, enemiesDefeated: 0, ascensionCount: 0, battlesCompleted: 0, itemsForged: 0, legendariesFound: 0 },
        lastWeeklyRewardClaim: 0,
        settings: { musicVolume: 0.5, sfxVolume: 1.0, isMuted: false, isAutoBattle: false }
    };

    const ASCENSION_LEVEL = 50;
    const BATTLE_UNLOCK_LEVEL = 20;
    const FORGE_UNLOCK_LEVEL = 15;
    
    // --- FIXED/MERGED ---: Added all missing element selectors.
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
    const battleUnlockText = document.getElementById('battle-unlock-text');
    const expeditionBtn = document.getElementById('expedition-btn');
    const shopBtn = document.getElementById('shop-btn');
    const forgeBtn = document.getElementById('forge-btn');
    const forgeUnlockText = document.getElementById('forge-unlock-text');
    const switchCharacterBtn = document.getElementById('switch-character-btn');
    const switchToMainBtn = document.getElementById('switch-to-main-btn');
    const partnerScreen = document.getElementById('partner-screen');
    const partnerSprite = document.getElementById('partner-sprite');
    const partnerNameLevel = document.getElementById('partner-name-level');
    const partnerHealthBarFill = document.querySelector('#partner-health-bar .stat-bar-fill');
    const partnerHealthBarLabel = document.querySelector('#partner-health-bar .stat-bar-label');
    const partnerEnergyBarFill = document.querySelector('#partner-energy-bar .stat-bar-fill');
    const partnerEnergyBarLabel = document.querySelector('#partner-energy-bar .stat-bar-label');
    const partnerXpBarFill = document.querySelector('#partner-xp-bar .stat-bar-fill');
    const partnerXpBarLabel = document.querySelector('#partner-xp-bar .stat-bar-label');
    const partnerCoreStatsDisplay = document.getElementById('partner-core-stats-display');
    const partnerStatsArea = document.getElementById('partner-stats-area');
    const eggTimerDisplay = document.getElementById('egg-timer-display');
    const modal = document.getElementById('notification-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const battleLog = document.getElementById('battle-log');
    const attackBtn = document.getElementById('attack-btn');
    const fleeBtn = document.getElementById('flee-btn');
    const battleWaveDisplay = document.getElementById('battle-wave-display');
    const battlePlayerName = document.getElementById('battle-player-name');
    const battleEnemyName = document.getElementById('battle-enemy-name');
    const expeditionCancelBtn = document.getElementById('expedition-cancel-btn');
    const expeditionListContainer = document.getElementById('expedition-list-container');
    const ingameMenuBtn = document.getElementById('ingame-menu-btn');
    const ingameMenuModal = document.getElementById('ingame-menu-modal');
    const ingameMenuContent = document.getElementById('ingame-menu-content');
    const progressionMenuSection = document.getElementById('progression-menu-section');
    const saveGameBtn = document.getElementById('save-game-btn');
    const optionsBtn = document.getElementById('options-btn');
    const quitToTitleBtn = document.getElementById('quit-to-title-btn');
    const returnToGameBtn = document.getElementById('return-to-game-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const inventoryModal = document.getElementById('inventory-modal');
    const inventoryList = document.getElementById('inventory-list');
    const closeInventoryBtn = document.getElementById('close-inventory-btn');
    const forgeModal = document.getElementById('forge-modal');
    const forgeSlot1Div = document.getElementById('forge-slot-1');
    const forgeSlot2Div = document.getElementById('forge-slot-2');
    const forgeResultSlotDiv = document.getElementById('forge-result-slot');
    const forgeCostDisplay = document.getElementById('forge-cost-display');
    const forgeBtnAction = document.getElementById('forge-btn-action');
    const closeForgeBtn = document.getElementById('close-forge-btn');
    const expeditionTimerDisplay = document.getElementById('expedition-timer-display');
    const windAnimationContainer = document.getElementById('wind-animation-container');
    const frenzyDisplay = document.getElementById('frenzy-display');
    const leaderboardBtn = document.getElementById('leaderboard-btn');
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const leaderboardTabs = document.querySelectorAll('.leaderboard-tab');
    const levelLeaderboardList = document.getElementById('level-leaderboard-list');
    const damageLeaderboardList = document.getElementById('damage-leaderboard-list');
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
    const optionsModal = document.getElementById('options-modal');
    const closeOptionsBtn = document.getElementById('close-options-btn');
    const googleSigninBtn = document.getElementById('google-signin-btn');
    const authStatus = document.getElementById('auth-status');
    const muteAllCheckbox = document.getElementById('mute-all-checkbox');
    const musicVolumeSlider = document.getElementById('music-volume-slider');
    const sfxVolumeSlider = document.getElementById('sfx-volume-slider');
    const autoBattleCheckbox = document.getElementById('auto-battle-checkbox');

    // --- FIXED/MERGED ---: Combined music logic with settings from new file.
    function initMusic() { if (musicManager.isInitialized) return; musicManager.isInitialized = true; playMusic('main'); }
    function playMusic(trackName) {
        if (!musicManager.isInitialized || !musicManager.audio[trackName]) return;
        if (gameState.settings && gameState.settings.isMuted) return;

        const oldTrackName = musicManager.currentTrack;
        if (oldTrackName && musicManager.audio[oldTrackName]) { musicManager.audio[oldTrackName].pause(); musicManager.audio[oldTrackName].currentTime = 0; }
        if (oldTrackName === trackName) { if (musicManager.audio[trackName].paused) { musicManager.audio[trackName].play().catch(e => console.error("Music resume failed:", e)); } return; }
        
        const newTrack = musicManager.audio[trackName];
        musicManager.currentTrack = trackName;
        if (newTrack) { 
            newTrack.volume = (gameState.settings) ? gameState.settings.musicVolume : 0.5;
            newTrack.play().catch(e => console.error(`Music play failed for ${trackName}:`, e)); 
        }
    }
    function startBackgroundAssetLoading() {
        for (const key in musicFileUrls) { if (musicFileUrls[key]) { const audio = new Audio(musicFileUrls[key]); audio.loop = true; audio.preload = 'auto'; musicManager.audio[key] = audio; } }
    }
    function createWindEffect() { for(let i=0; i<20; i++) { const streak = document.createElement('div'); streak.className = 'wind-streak'; streak.style.top = `${Math.random() * 100}%`; streak.style.width = `${Math.random() * 150 + 50}px`; streak.style.animationDuration = `${Math.random() * 3 + 2}s`; streak.style.animationDelay = `${Math.random() * 5}s`; windAnimationContainer.appendChild(streak); } }
    function createStarfield() { const container = document.getElementById('background-stars'); for(let i=0; i<100; i++) { const star = document.createElement('div'); star.className = 'star'; const size = Math.random() * 2 + 1; star.style.width = `${size}px`; star.style.height = `${size}px`; star.style.top = `${Math.random() * 100}%`; star.style.left = `${Math.random() * 100}%`; star.style.animationDuration = `${Math.random() * 50 + 25}s`; star.style.animationDelay = `${Math.random() * 50}s`; container.appendChild(star); } }

    function showScreen(screenId) { 
        screens.forEach(s => s.classList.remove('active')); 
        const screenToShow = document.getElementById(screenId);
        if(screenToShow) screenToShow.classList.add('active'); 

        if (screenId === 'battle-screen') { playMusic('battle'); } 
        else if (screenId === 'game-screen' || screenId === 'main-menu-screen' || screenId === 'partner-screen') { if (!gameState.expedition || !gameState.expedition.active) { playMusic('main'); } }
    }
    
    // --- FIXED/MERGED ---: Integrated init with Auth logic.
    function init() { 
        createWindEffect(); createStarfield(); startBackgroundAssetLoading();
        
        auth.onAuthStateChanged(user => {
            updateAuthUI(user);
            if (user) {
                // If user is logged in, try to load their cloud save.
                loadGame(); 
            } else {
                // If not logged in, check for a local save.
                loadGameBtn.disabled = !localStorage.getItem('tapGuardianSave');
            }
        });

        setTimeout(() => { 
            // After a delay, if still on loading screen (e.g., no auth state change), show main menu.
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen && loadingScreen.classList.contains('active')) {
                showScreen('main-menu-screen'); 
            }
        }, 1500);

        // Start all game loop intervals
        buffInterval = setInterval(updateBuffs, 1000);
        partnerTimerInterval = setInterval(checkEggHatch, 1000);
        setInterval(passiveResourceRegen, 1000);
    }
    
    // --- FIXED/MERGED ---: Restored full startGame logic.
    async function startGame() {
        initAudio();
        let playerName = ""; let isNameValid = false;
        while (!isNameValid) {
            const defaultName = auth.currentUser ? auth.currentUser.displayName.split(' ')[0] : "";
            const inputName = prompt("Enter your Guardian's name (3-15 chars):", defaultName);
            if (inputName === null) { return; } 
            if (inputName.length < 3 || inputName.length > 15) { alert("Name must be between 3 and 15 characters."); continue; }
            playerName = inputName; isNameValid = true;
        }
        gameState = JSON.parse(JSON.stringify(defaultState));
        gameState.playerName = playerName;
        
        updateSettingsUI();
        updateUI(); 
        updateAscensionVisuals();
        showScreen('game-screen');
        checkWeeklyRewards();
        await saveGame(); 
    }

    // --- FIXED/MERGED ---: Used the more robust migration logic.
    async function migrateSaveData(loadedState) {
        if (!loadedState.version || loadedState.version < GAME_VERSION) {
            showScreen('update-screen');
            loadedState.version = GAME_VERSION;
            if (!loadedState.equipment) loadedState.equipment = { weapon: null, armor: null };
            if (!loadedState.inventory) { 
                loadedState.inventory = [];
                if (loadedState.equipment.weapon) loadedState.inventory.push(loadedState.equipment.weapon);
                if (loadedState.equipment.armor) loadedState.inventory.push(loadedState.equipment.armor);
            }
            loadedState.inventory.forEach(item => { if (item && item.reforgeCount === undefined) item.reforgeCount = 0; });
            loadedState.permanentUpgrades = loadedState.permanentUpgrades || {};
            loadedState.activeBuffs = loadedState.activeBuffs || {};
            loadedState.ascension = loadedState.ascension || { tier: 1, points: 0, perks: {} };
            const defaultCounters = { taps: 0, enemiesDefeated: 0, ascensionCount: 0, battlesCompleted: 0, itemsForged: 0, legendariesFound: 0 };
            loadedState.counters = { ...defaultCounters, ...(loadedState.counters || {})};
            loadedState.hasEgg = loadedState.hasEgg || false;
            loadedState.partner = loadedState.partner || null;
            loadedState.lastWeeklyRewardClaim = loadedState.lastWeeklyRewardClaim || 0;
            const defaultSettings = defaultState.settings;
            loadedState.settings = { ...defaultSettings, ...(loadedState.settings || {})};
            
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return loadedState;
    }

    // --- FIXED/MERGED ---: Robust load game logic with cloud-first approach.
    async function loadGame() {
        initAudio();
        let loadedState = null;
        let fromCloud = false;

        if (auth.currentUser) {
            try {
                const docRef = db.collection('playerSaves').doc(auth.currentUser.uid);
                const doc = await docRef.get();
                if (doc.exists) {
                    loadedState = doc.data();
                    fromCloud = true;
                }
            } catch (error) {
                console.error("Error loading from cloud:", error);
                showToast("Cloud save failed! Trying local save.");
            }
        }

        if (!loadedState) {
            const savedData = localStorage.getItem('tapGuardianSave');
            if (savedData) {
                loadedState = JSON.parse(savedData);
                 if (auth.currentUser) { showToast("No cloud save found, loaded local save instead."); }
            }
        }
        
        if (loadedState) {
            loadedState = await migrateSaveData(loadedState);
            gameState = { ...defaultState, ...loadedState };
            if(fromCloud) showToast("Cloud save loaded!");
            
            updateSettingsUI();
            checkExpeditionStatus();
            updateUI(); 
            updateAscensionVisuals();
            showScreen('game-screen');
            checkWeeklyRewards();
            await saveGame();
        } else if (auth.currentUser) {
             showToast("No saves found. Starting a new game.");
             startGame();
        } else {
             // Do nothing, wait for user to click "Start Game" or "Load Game" (if available)
        }
    }

    // --- FIXED/MERGED ---: Kept the superior save logic from the new file.
    async function saveGame(showToastNotification = false) {
        if (!gameState.playerName || gameState.playerName === "Guardian") return;
        if (auth.currentUser) {
            try {
                const docRef = db.collection('playerSaves').doc(auth.currentUser.uid);
                await docRef.set(gameState);
                if (showToastNotification) showToast("Game saved to Cloud!");
            } catch (error) {
                console.error("Error saving to cloud:", error);
                if (showToastNotification) showToast("Cloud save failed! Retrying locally.");
                localStorage.setItem('tapGuardianSave', JSON.stringify(gameState));
            }
        } else {
            localStorage.setItem('tapGuardianSave', JSON.stringify(gameState));
            if (showToastNotification) showToast("Game Saved Locally!");
        }
        loadGameBtn.disabled = false;
    }

    // --- All functions from here are restored from the working file or merged ---
    
    function getXpForNextLevel(level) { return Math.floor(100 * Math.pow(1.5, level - 1)); }
    
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
        const xpForNext = getXpForNextLevel(gameState.level);
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

        const canUseBattle = gameState.level >= BATTLE_UNLOCK_LEVEL;
        battleBtn.disabled = onExpedition || !canUseBattle;
        battleUnlockText.textContent = canUseBattle ? "" : `Unlocks at LVL ${BATTLE_UNLOCK_LEVEL}`;
        
        const canUseForge = gameState.level >= FORGE_UNLOCK_LEVEL;
        forgeBtn.disabled = onExpedition || !canUseForge;
        forgeUnlockText.textContent = canUseForge ? "" : `Unlocks at LVL ${FORGE_UNLOCK_LEVEL}`;

        feedBtn.disabled = onExpedition; 
        inventoryBtn.disabled = onExpedition; 
        shopBtn.disabled = onExpedition;

        if (onExpedition) {
            expeditionBtn.textContent = `On Expedition`; expeditionBtn.disabled = true;
            if (!expeditionInterval) { expeditionInterval = setInterval(updateExpeditionTimer, 1000); updateExpeditionTimer(); }
        } else { expeditionBtn.textContent = `Expedition`; expeditionBtn.disabled = false; }
        
        if (gameState.tutorialCompleted) { tutorialOverlay.classList.remove('visible'); } else { tutorialOverlay.classList.add('visible'); }

        switchCharacterBtn.style.display = gameState.hasEgg ? 'block' : 'none';
        updatePartnerUI();
    }
    
    function addXP(character, amount) { 
        if(character.isPartner && gameState.expedition.active) return;
        const tierMultiplier = Math.pow(1.2, gameState.ascension.tier - 1);
        let finalAmount = amount * tierMultiplier;
        if (gameState.activeBuffs.xpBoost && !character.isPartner) { finalAmount *= 1.5; }
        character.xp += finalAmount;
        if (character.xp >= getXpForNextLevel(character.level)) {
            levelUp(character);
        }
        updateUI();
    }

    function levelUp(character) {
        const xpOver = character.xp - getXpForNextLevel(character.level); character.level++; character.xp = xpOver;
        character.stats.strength += 2; character.stats.agility += 2; character.stats.fortitude += 1; character.stats.stamina += 1;
        character.resources.maxHp += 10; character.resources.hp = character.resources.maxHp;
        character.resources.maxEnergy += 5; character.resources.energy = character.resources.maxEnergy;
        playSound('levelUp', 1, 'triangle', 440, 880); triggerScreenShake(400); 
        if(!character.isPartner) {
            checkAllAchievements();
            submitScoreToLeaderboard();
            updateAscensionVisuals();
        }
        showNotification("LEVEL UP!", `${character.name || 'Partner'} is now Level ${character.level}!`); saveGame();
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
    
    function createXpOrb(event, xpGain, character) {
        let clientX = event.clientX || (event.touches && event.touches[0].clientX); let clientY = event.clientY || (event.touches && event.touches[0].clientY);
        const orbContainer = document.createElement('div'); orbContainer.className = 'xp-orb-container';
        orbContainer.style.left = `${clientX - 10}px`; orbContainer.style.top = `${clientY - 10}px`;
        orbContainer.innerHTML = `<div class="xp-orb"></div><div class="xp-orb-text">+${xpGain.toFixed(2)}</div>`;
        document.body.appendChild(orbContainer);
        const xpBarEl = character.isPartner ? '#partner-xp-bar' : '#xp-bar';
        const xpBarRect = document.querySelector(xpBarEl).getBoundingClientRect();
        const targetX = xpBarRect.left + (xpBarRect.width / 2); const targetY = xpBarRect.top + (xpBarRect.height / 2);
        setTimeout(() => { orbContainer.style.left = `${targetX}px`; orbContainer.style.top = `${targetY}px`; orbContainer.style.transform = 'scale(0)'; orbContainer.style.opacity = '0'; }, 50);
        setTimeout(() => { const xpBar = document.querySelector(xpBarEl); xpBar.classList.add('bar-pulse'); addXP(character, xpGain); setTimeout(() => xpBar.classList.remove('bar-pulse'), 300); orbContainer.remove(); }, 850);
    }
    
    function handleTap(event, isPartnerTap = false) {
        if (gameState.expedition.active) return;
        initAudio();
        if (gameState.tutorialCompleted === false) { gameState.tutorialCompleted = true; tutorialOverlay.classList.remove('visible'); saveGame(); }

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
            if (gameState.resources.energy <= 0) return;
            gameState.counters.taps = (gameState.counters.taps || 0) + 1; checkAllAchievements();
            playSound('tap', 0.5, 'square', 150, 100, 0.05); const now = Date.now();
            if (now - tapCombo.lastTapTime < 1500) { tapCombo.counter++; } else { tapCombo.counter = 1; }
            tapCombo.lastTapTime = now;
            if (tapCombo.counter > 0 && tapCombo.counter % 15 === 0) { if (Math.random() < 0.55) { activateFrenzy(); } }
            if (Math.random() < 0.1) { triggerScreenShake(150); }
            let xpGain = 0.32 * tapCombo.currentMultiplier;
            if (gameState.level >= 30) { xpGain = 1.0 * tapCombo.currentMultiplier; } else if (gameState.level >= 10) { xpGain = 0.75 * tapCombo.currentMultiplier; }
            const tapXpBonus = 1 + (gameState.ascension.perks.tapXp || 0) * 0.10;
            xpGain *= tapXpBonus; createXpOrb(event, xpGain, gameState); gameState.resources.energy -= 0.1;
            if (tapCombo.currentMultiplier > 1) { createParticles(event); }
            characterSprite.style.animation = 'none'; void characterSprite.offsetWidth; characterSprite.classList.add('tapped');
            setTimeout(() => { 
                characterSprite.classList.remove('tapped'); updateAscensionVisuals();
            }, 200); 
        }
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
                const foundItem = generateItem(); 
                if (foundItem.rarity.key === 'legendary') gameState.counters.legendariesFound = (gameState.counters.legendariesFound || 0) + 1;
                rewardText += `<br><br>Found: <strong style="color:${foundItem.rarity.color}">${foundItem.name}</strong>`;
                gameState.inventory.push(foundItem);
                const currentItem = gameState.equipment[foundItem.type];
                if (!currentItem || foundItem.power > currentItem.power) {
                    equipItem(foundItem);
                    rewardText += `<br><br>New item equipped!`;
                }
            }
            addXP(gameState, xpReward); gameState.gold += goldReward;
            showNotification("Expedition Complete!", rewardText); saveGame(); updateUI();
        }
    }
    
    function getTotalStat(stat) {
        let total = gameState.stats[stat] || 0;
        if(gameState.permanentUpgrades) {
            for (const upgradeId in gameState.permanentUpgrades) {
                const upgradeData = permanentShopUpgrades[upgradeId];
                if (upgradeData && upgradeData.stat === stat) {
                    total += (gameState.permanentUpgrades[upgradeId] || 0) * upgradeData.bonus;
                }
            }
        }
        for (const slot in gameState.equipment) {
            const item = gameState.equipment[slot];
            if (item && item.stats && item.stats[stat]) { total += item.stats[stat]; }
        }
        if (stat === 'goldFind' && gameState.ascension.perks) { total += (gameState.ascension.perks.goldBoost || 0) * 5; }
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
            gameState.inventory = [];
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
        try {
            // Use player name for public leaderboard, but use UID for personal saves.
            await db.collection("leaderboard").doc(gameState.playerName).set(score, { merge: true });
        } catch (error) { console.error("Error submitting score: ", error); }
    }

    async function showLeaderboard(type = 'level') {
        const allLists = document.querySelectorAll('.leaderboard-list');
        allLists.forEach(l => l.classList.remove('active'));
        
        let targetList, collectionName, orderByField, orderByDirection, secondaryOrderByField, secondaryOrderByDirection;

        if(type === 'damage') {
            targetList = damageLeaderboardList;
            collectionName = 'damageLeaderboard';
            orderByField = 'totalDamage';
            orderByDirection = 'desc';
        } else {
            targetList = levelLeaderboardList;
            collectionName = 'leaderboard';
            orderByField = 'tier';
            orderByDirection = 'desc';
            secondaryOrderByField = 'level';
            secondaryOrderByDirection = 'desc';
        }
        
        targetList.classList.add('active');
        leaderboardTabs.forEach(t => t.classList.remove('active'));
        document.querySelector(`.leaderboard-tab[data-type="${type}"]`).classList.add('active');
        
        leaderboardModal.classList.add('visible');
        targetList.innerHTML = "<li>Loading...</li>";

        try {
            let query = db.collection(collectionName).orderBy(orderByField, orderByDirection);
            if (secondaryOrderByField) {
                query = query.orderBy(secondaryOrderByField, secondaryOrderByDirection);
            }
            const snapshot = await query.limit(10).get();

            if (snapshot.empty) { targetList.innerHTML = "<li>No scores yet. Be the first!</li>"; return; }
            targetList.innerHTML = "";
            let rank = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                const li = document.createElement('li');
                let scoreText;
                if(type === 'damage') {
                    scoreText = `Damage: ${data.totalDamage.toLocaleString()}`;
                } else {
                    scoreText = `Level ${data.level} (Tier ${data.tier})`;
                }
                li.innerHTML = `<span class="rank-name">${rank}. ${data.name}</span> <span class="rank-score">${scoreText}</span>`;
                targetList.appendChild(li);
                rank++;
            });
        } catch (error) { console.error("Error fetching leaderboard: ", error); targetList.innerHTML = "<li>Error loading scores.</li>"; }
    }
    
    function generateItem(forceRarity = null) {
        let chosenRarityKey = forceRarity;
        if (!chosenRarityKey) {
            const roll = Math.random() * 100; let cumulativeWeight = 0;
            for(const key in itemData.rarities) { cumulativeWeight += itemData.rarities[key].weight; if (roll < cumulativeWeight) { chosenRarityKey = key; break; } }
        }
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
        return { type: itemTypeKey, name: `${namePrefix} ${baseName} ${nameSuffix}`.trim(), rarity: { key: chosenRarityKey, color: rarity.color }, stats: stats, power: power, reforgeCount: 0 };
    }
    
    function equipItem(itemToEquip) {
        const itemIndex = gameState.inventory.findIndex(i => i && i.name === itemToEquip.name);
        if (itemIndex === -1) return;
        gameState.equipment[itemToEquip.type] = itemToEquip;
        updateUI(); saveGame();
    }
    
    function updateInventoryUI() {
        inventoryList.innerHTML = '';
        if (gameState.inventory.length === 0) {
            inventoryList.innerHTML = '<p>Your inventory is empty.</p>';
            return;
        }
        const sortedInventory = [...gameState.inventory].filter(i => i).sort((a,b) => b.power - a.power);
        sortedInventory.forEach((item) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'inventory-item';
            let statsHtml = '';
            for (const stat in item.stats) {
                const value = item.stats[stat];
                const suffix = (stat === 'critChance' || stat === 'goldFind') ? '%' : '';
                statsHtml += `<span>+${value}${suffix} ${stat}</span><br>`;
            }
            const infoDiv = document.createElement('div');
            infoDiv.className = 'inventory-item-info';
            infoDiv.innerHTML = `<strong style="color:${item.rarity.color}">${item.name}</strong><div class="item-stats">${statsHtml}Reforged: ${item.reforgeCount}/3</div>`;
            const isEquipped = gameState.equipment[item.type] && gameState.equipment[item.type].name === item.name;
            const button = document.createElement('button');
            if (isEquipped) { button.textContent = 'Equipped'; button.disabled = true; } 
            else { button.textContent = 'Equip'; button.onclick = (e) => { e.stopPropagation(); equipItem(item); inventoryModal.classList.remove('visible'); }; }
            itemEl.appendChild(infoDiv);
            itemEl.appendChild(button);
            itemEl.onclick = () => selectItemForForge(item);
            inventoryList.appendChild(itemEl);
        });
    }

    function generateAndShowExpeditions() {
        availableExpeditions = []; expeditionListContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const action = expeditionData.actions[Math.floor(Math.random() * expeditionData.actions.length)];
            const location = expeditionData.locations[Math.floor(Math.random() * expeditionData.locations.length)];
            const modKeys = Object.keys(expeditionData.modifiers);
            const modKey = modKeys[Math.floor(Math.random() * modKeys.length)];
            const modifier = expeditionData.modifiers[modKey];
            const duration = (Math.floor(Math.random() * 10) + 20) * 60;
            const expedition = { name: `${action} ${location}`, description: modifier.description, duration: duration, modifiers: { goldMod: modifier.goldMod, itemMod: modifier.itemMod, xpMod: modifier.xpMod }, index: i };
            availableExpeditions.push(expedition);
            const itemEl = document.createElement('div'); itemEl.className = 'expedition-item';
            itemEl.innerHTML = `<div class="expedition-info"><strong>${expedition.name}</strong><div class="expedition-desc">${expedition.description} (~${Math.round(expedition.duration / 60)} mins)</div></div><button data-index="${i}">Begin</button>`;
            itemEl.querySelector('button').onclick = () => startExpedition(expedition.index);
            expeditionListContainer.appendChild(itemEl);
        }
    }

    function initAudio() { if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); initMusic(); } }
    
    // --- FIXED/MERGED ---: Sound function now respects settings.
    function playSound(type, volume = 1, wave = 'sine', startFreq = 440, endFreq = 440, duration = 0.1) {
        if (!audioCtx || (gameState.settings && gameState.settings.isMuted)) return;
        const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); oscillator.type = wave;
        oscillator.frequency.setValueAtTime(startFreq, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
        const finalVolume = (gameState.settings ? gameState.settings.sfxVolume : 1.0) * volume;
        gainNode.gain.setValueAtTime(finalVolume, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
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
    
    // --- FIXED/MERGED ---: Full unlock achievement logic.
    function unlockAchievement(id) {
        if (!gameState.achievements[id] || gameState.achievements[id].unlocked) return;
        gameState.achievements[id].unlocked = true;
        const ach = achievements[id];
        let rewardText = "";
        if (ach.reward) {
            switch (ach.reward.type) {
                case 'gold':
                    gameState.gold += ach.reward.amount;
                    rewardText = ` (+${ach.reward.amount} Gold)`;
                    break;
                case 'item':
                    const newItem = generateItem(ach.reward.rarity);
                    gameState.inventory.push(newItem);
                    rewardText = ` (Received ${newItem.name})`;
                    break;
                case 'egg':
                    gameState.hasEgg = true;
                    gameState.partner = {
                        name: 'Mysterious Egg',
                        isPartner: true,
                        isHatched: false,
                        hatchTime: Date.now() + 7 * 24 * 60 * 60 * 1000,
                    };
                    rewardText = ' (You found a Mysterious Egg!)';
                    break;
            }
        }
        showToast(`Achievement: ${ach.name}${rewardText}`);
        playSound('levelUp', 0.7, 'triangle', 880, 1200, 0.3);
        updateUI();
    }
    
    // --- FIXED/MERGED ---: Full achievement check logic.
    function checkAllAchievements() {
        if (!gameState.counters) return;
        const counters = gameState.counters;
        if (counters.taps >= 100) unlockAchievement('tap100');
        if (counters.taps >= 1000) unlockAchievement('tap1000');
        if (counters.taps >= 10000) unlockAchievement('tap10000');
        if (gameState.level >= 10) unlockAchievement('level10');
        if (gameState.level >= 25) unlockAchievement('level25');
        if (gameState.level >= 50) unlockAchievement('level50');
        if (counters.enemiesDefeated >= 10) unlockAchievement('defeat10');
        if (counters.enemiesDefeated >= 100) unlockAchievement('defeat100');
        if (counters.enemiesDefeated >= 500) unlockAchievement('defeat500');
        if (counters.ascensionCount >= 1) unlockAchievement('ascend1');
        if (counters.ascensionCount >= 5) unlockAchievement('ascend5');
        if (counters.battlesCompleted >= 1) unlockAchievement('battle1');
        if (counters.itemsForged >= 1) unlockAchievement('forge1');
        if (counters.legendariesFound >= 1) unlockAchievement('findLegendary');
        if (gameState.ascension.tier >= 5 && gameState.level >= 50) unlockAchievement('masterGuardian');
    }
    
    function updateAchievementsUI() {
        achievementsList.innerHTML = '';
        for (const id in achievements) {
            const achData = achievements[id];
            const achState = gameState.achievements[id] || { unlocked: false };
            const li = document.createElement('li');
            if (achState.unlocked) li.classList.add('unlocked');
            
            let rewardHtml = '';
            if (achData.reward) {
                let rewardDesc = '';
                switch(achData.reward.type) {
                    case 'gold': rewardDesc = `Reward: ${achData.reward.amount} Gold`; break;
                    case 'item': rewardDesc = `Reward: A ${achData.reward.rarity} item`; break;
                    case 'egg': rewardDesc = 'Reward: ???'; break;
                }
                rewardHtml = `<div class="achievement-reward">${rewardDesc}</div>`;
            }

            li.innerHTML = `<strong>${achData.name}</strong><div class="achievement-desc">${achData.desc}</div>${rewardHtml}`;
            achievementsList.appendChild(li);
        }
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
        let newAnimation = 'idle-breathe 4s ease-in-out infinite';
        if (tier >= 5) {
            characterSprite.classList.add('aura-ascended');
            gameScreen.classList.add('background-glitch');
            lightningInterval = setInterval(createLightningEffect, 3000);
            newAnimation = 'idle-breathe 2s ease-in-out infinite, super-aura-anim 1s ease-in-out infinite alternate';
        } else if (tier >= 3) {
            characterSprite.classList.add('aura-ascended');
            newAnimation = 'idle-breathe 2s ease-in-out infinite, super-aura-anim 1s ease-in-out infinite alternate';
        } else if (gameState.level >= 10) {
            characterSprite.classList.add('aura-level-10');
            newAnimation = 'idle-breathe 4s ease-in-out infinite, aura-level-10-anim 2s ease-in-out infinite';
        }
        if(characterSprite.classList.contains('frenzy')){ newAnimation += ', frenzy-glow 1s infinite'; }
        characterSprite.style.animation = newAnimation;
    }
    
    function selectItemForForge(item) {
        if (forgeSlots[0] && forgeSlots[1]) {
            showToast("Forge slots are full. Clear one first."); return;
        }
        const emptySlot = forgeSlots[0] ? 1 : 0;
        forgeSlots[emptySlot] = item;
        inventoryModal.classList.remove('visible');
        forgeModal.classList.add('visible');
        updateForgeUI();
    }
    
    function updateForgeUI() {
        const [item1, item2] = forgeSlots;
        const slots = [forgeSlot1Div, forgeSlot2Div];
        slots.forEach((slot, i) => {
            const item = forgeSlots[i];
            if (item) {
                slot.innerHTML = `<strong style="color:${item.rarity.color}">${item.name}</strong><br><small>Reforges: ${item.reforgeCount}/3</small>`;
                slot.classList.add('filled');
            } else {
                slot.innerHTML = `Slot ${i + 1}`;
                slot.classList.remove('filled');
            }
        });
        forgeResultSlotDiv.innerHTML = "Result";
        forgeResultSlotDiv.classList.remove('filled');
        if (item1 && item2) {
            const cost = (item1.power + item2.power) * 5;
            forgeCostDisplay.innerHTML = `Cost: ${cost} Gold, 50 Energy`;
        } else {
            forgeCostDisplay.innerHTML = '';
        }
    }
    
    function forgeItems() {
        const [item1, item2] = forgeSlots;
        if (!item1 || !item2) { showToast("Need two items to forge."); return; }
        if (item1.type !== item2.type) { showToast("Items must be the same type."); return; }
        if (item1.reforgeCount >= 3 || item2.reforgeCount >= 3) { showToast("One of the items cannot be reforged further."); return; }
        
        const cost = Math.floor((item1.power + item2.power) * 5);
        if (gameState.gold < cost) { showToast(`Not enough gold. Need ${cost} G.`); return; }
        if (gameState.resources.energy < 50) { showToast("Not enough energy. Need 50."); return; }

        gameState.gold -= cost;
        gameState.resources.energy -= 50;
        
        const newStats = {};
        const allKeys = new Set([...Object.keys(item1.stats), ...Object.keys(item2.stats)]);
        allKeys.forEach(stat => {
            const val1 = item1.stats[stat] || 0;
            const val2 = item2.stats[stat] || 0;
            newStats[stat] = Math.ceil((val1 + val2) * 1.1);
        });

        const newName = `Reforged ${item1.type === 'weapon' ? 'Blade' : 'Plate'}`;
        const newPower = Object.values(newStats).reduce((a, b) => a + b, 0);
        const newItem = {
            type: item1.type, name: newName,
            rarity: { key: 'epic', color: 'var(--rarity-epic)' },
            stats: newStats, power: newPower,
            reforgeCount: Math.max(item1.reforgeCount, item2.reforgeCount) + 1
        };

        const index1 = gameState.inventory.findIndex(i => i.name === item1.name);
        if (index1 > -1) gameState.inventory.splice(index1, 1);
        const index2 = gameState.inventory.findIndex(i => i.name === item2.name);
        if (index2 > -1) gameState.inventory.splice(index2, 1);
        gameState.inventory.push(newItem);
        
        if (gameState.equipment[item1.type] && (gameState.equipment[item1.type].name === item1.name || gameState.equipment[item1.type].name === item2.name)) {
            gameState.equipment[item1.type] = null;
        }
        
        gameState.counters.itemsForged = (gameState.counters.itemsForged || 0) + 1;
        forgeSlots = [null, null];
        updateForgeUI();
        showToast("Items successfully forged!");
        updateUI(); saveGame();
    }
    
    function checkEggHatch() {
        if (gameState.partner && gameState.partner.hatchTime && Date.now() > gameState.partner.hatchTime) {
            gameState.partner.isHatched = true;
            gameState.partner.hatchTime = null;
            gameState.partner.name = "Newborn Guardian";
            gameState.partner.level = 1;
            gameState.partner.xp = 0;
            gameState.partner.stats = { strength: 5, agility: 5, fortitude: 5, stamina: 5 };
            gameState.partner.resources = { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 };
            
            showNotification("A Mysterious Egg Hatched!", "A newborn guardian has joined you! You can switch to it from the main screen.");
            playSound('victory', 1, 'sawtooth', 200, 1000, 1);
            updatePartnerUI();
            saveGame();
        }
    }
    
    function updatePartnerUI() {
        if (!gameState.hasEgg) return;
        const partner = gameState.partner;
        if (!partner) return;

        if (partner.isHatched) {
            partnerStatsArea.style.display = 'block';
            eggTimerDisplay.style.display = 'none';
            partnerSprite.src = 'player.PNG';
            partnerSprite.classList.add('hatched');
            partnerNameLevel.textContent = `${partner.name} Lv. ${partner.level}`;
            const xpForNext = getXpForNextLevel(partner.level);
            partnerHealthBarFill.style.width = `${(partner.resources.hp / partner.resources.maxHp) * 100}%`;
            partnerHealthBarLabel.textContent = `HP: ${Math.floor(partner.resources.hp)} / ${partner.resources.maxHp}`;
            partnerEnergyBarFill.style.width = `${(partner.resources.energy / partner.resources.maxEnergy) * 100}%`;
            partnerEnergyBarLabel.textContent = `Energy: ${Math.floor(partner.resources.energy)} / ${partner.resources.maxEnergy}`;
            partnerXpBarFill.style.width = `${(partner.xp / xpForNext) * 100}%`;
            partnerXpBarLabel.textContent = `XP: ${Math.floor(partner.xp)} / ${xpForNext}`;
            partnerCoreStatsDisplay.innerHTML = `<span>STR: ${partner.stats.strength}</span><span>AGI: ${partner.stats.agility}</span><span>FOR: ${partner.stats.fortitude}</span><span>STA: ${partner.stats.stamina}</span>`;
        } else {
            partnerStatsArea.style.display = 'none';
            eggTimerDisplay.style.display = 'block';
            partnerSprite.src = 'egg.png';
            partnerSprite.classList.remove('hatched');
            const timeLeft = partner.hatchTime - Date.now();
            if (timeLeft > 0) {
                const pad = num => num.toString().padStart(2, '0');
                const days = pad(Math.floor(timeLeft / (1000 * 60 * 60 * 24)));
                const hours = pad(Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
                const minutes = pad(Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60)));
                const seconds = pad(Math.floor((timeLeft % (1000 * 60)) / 1000));
                eggTimerDisplay.textContent = `${days}:${hours}:${minutes}:${seconds}`;
            } else {
                eggTimerDisplay.textContent = "Hatching...";
            }
        }
    }

    async function checkWeeklyRewards() {
        try {
            const rewardDocRef = db.collection("admin").doc("weeklyReward");
            const rewardDoc = await rewardDocRef.get();
            const weekInMs = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            if (!rewardDoc.exists || now > rewardDoc.data().nextRewardTime) {
                const snapshot = await db.collection("damageLeaderboard").orderBy("totalDamage", "desc").limit(1).get();
                if (!snapshot.empty) {
                    const winner = snapshot.docs[0].data();
                    if (gameState.playerName === winner.name && now > (gameState.lastWeeklyRewardClaim + weekInMs)) {
                        const rewardItem = generateItem('legendary');
                        gameState.inventory.push(rewardItem);
                        gameState.lastWeeklyRewardClaim = now;
                        saveGame();
                        showNotification("Weekly Champion!", `For being #1 on the damage leaderboard, you receive a reward: <strong style="color:var(--rarity-legendary)">${rewardItem.name}</strong>!`);
                    }
                }
                
                const nextTime = now + weekInMs;
                await rewardDocRef.set({ nextRewardTime: nextTime });
            }
        } catch(e) { console.error("Could not check weekly rewards:", e); }
    }

    // --- BATTLE SYSTEM ---
    
    function addBattleLog(message, className) {
        battleLog.innerHTML += `<div class="${className}">${message}</div>`;
        battleLog.scrollTop = battleLog.scrollHeight;
    }

    function updateBattleHud() {
        const playerHpBar = document.querySelector('#battle-player-hp-bar .stat-bar-fill');
        const playerHpLabel = document.querySelector('#battle-player-hp-bar .stat-bar-label');
        playerHpBar.style.width = `${(battleState.playerHp / gameState.resources.maxHp) * 100}%`;
        playerHpLabel.textContent = `HP: ${Math.ceil(battleState.playerHp)} / ${gameState.resources.maxHp}`;
        document.getElementById('battle-player-name').textContent = gameState.playerName;
        
        if (battleState.enemy) {
            const enemyHpBar = document.querySelector('#battle-enemy-hp-bar .stat-bar-fill');
            const enemyHpLabel = document.querySelector('#battle-enemy-hp-bar .stat-bar-label');
            enemyHpBar.style.width = `${(battleState.enemy.hp / battleState.enemy.maxHp) * 100}%`;
            enemyHpLabel.textContent = `HP: ${Math.ceil(battleState.enemy.hp)} / ${battleState.enemy.maxHp}`;
            document.getElementById('battle-enemy-name').textContent = battleState.enemy.name;
        }

        battleWaveDisplay.textContent = `Wave: ${battleState.currentWave} / ${battleState.totalWaves}`;
    }

    function startBattle() {
        battleState = {
            isActive: true, currentWave: 0, totalWaves: 5, playerHp: gameState.resources.hp,
            enemy: null, totalXp: 0, totalGold: 0, totalDamage: 0
        };
        battleLog.innerHTML = "";
        addBattleLog("The battle begins!", "log-system");
        showScreen('battle-screen');
        startNextWave();
    }

    function startNextWave() {
        battleState.currentWave++;

        const tierMultiplier = gameState.ascension.tier;
        const levelMultiplier = Math.max(1, gameState.level - 2 + Math.floor(Math.random() * 5));
        const waveMultiplier = 1 + (battleState.currentWave - 1) * 0.2;
        let isBoss = battleState.currentWave === battleState.totalWaves;
        let enemy;
        
        if (isBoss) {
            enemy = { name: "Goblin King", hp: Math.floor((150 + 20 * levelMultiplier) * tierMultiplier * waveMultiplier), strength: Math.floor((10 + 4 * levelMultiplier) * tierMultiplier * waveMultiplier), agility: Math.floor((5 + 2 * levelMultiplier) * tierMultiplier * waveMultiplier), fortitude: Math.floor((8 + 3 * levelMultiplier) * tierMultiplier * waveMultiplier), xpReward: Math.floor((100 * levelMultiplier) * tierMultiplier * waveMultiplier), goldReward: Math.floor((75 * levelMultiplier) * tierMultiplier * waveMultiplier) };
        } else {
            enemy = { name: `Wave ${battleState.currentWave} Goblin`, hp: Math.floor((60 + 8 * levelMultiplier) * tierMultiplier * waveMultiplier), strength: Math.floor((3 + 2 * levelMultiplier) * tierMultiplier * waveMultiplier), agility: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier), fortitude: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier), xpReward: Math.floor((25 * levelMultiplier) * tierMultiplier * waveMultiplier), goldReward: Math.floor((15 * levelMultiplier) * tierMultiplier * waveMultiplier) };
        }
        enemy.maxHp = enemy.hp;
        battleState.enemy = enemy;
        updateBattleHud();
        addBattleLog(`A wild ${battleState.enemy.name} appears!`, "log-system");
        attackBtn.disabled = true; fleeBtn.disabled = true;

        setTimeout(() => {
            if (battleState.enemy.agility > getTotalStat('agility')) {
                addBattleLog(`${battleState.enemy.name} is faster and attacks first!`, "log-enemy");
                handleEnemyAttack();
            } else {
                addBattleLog("You are faster! Your turn.", "log-player");
                if (gameState.settings && gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); } 
                else { attackBtn.disabled = false; fleeBtn.disabled = false; }
            }
        }, 1000);
    }
    
    function handlePlayerAttack() {
        if (!battleState.isActive) return;
        attackBtn.disabled = true; fleeBtn.disabled = true;
        const isCrit = Math.random() < (getTotalStat('critChance') / 100);
        const baseDamage = Math.max(1, getTotalStat('strength') * 2 - battleState.enemy.fortitude);
        const damage = Math.floor(baseDamage * (isCrit ? 2 : 1));
        battleState.totalDamage += damage;
        battleState.enemy.hp = Math.max(0, battleState.enemy.hp - damage);

        if (isCrit) { addBattleLog('CRITICAL HIT!', 'log-crit'); playSound('crit', 0.8, 'square', 1000, 500, 0.2); } 
        else { playSound('hit', 0.8, 'square', 400, 100, 0.1); }
        addBattleLog(`You attack for ${damage} damage!`, "log-player");
        createDamageNumber(damage, isCrit, true);
        updateBattleHud();

        if (battleState.enemy.hp <= 0) {
            gameState.counters.enemiesDefeated = (gameState.counters.enemiesDefeated || 0) + 1;
            const finalGoldReward = Math.floor(battleState.enemy.goldReward * (1 + getTotalStat('goldFind') / 100));
            battleState.totalXp += battleState.enemy.xpReward;
            battleState.totalGold += finalGoldReward;
            addBattleLog(`You defeated ${battleState.enemy.name}!`, "log-system");
            if (battleState.currentWave >= battleState.totalWaves) { endBattle(true); } 
            else { addBattleLog(`Prepare for the next wave...`, 'log-system'); setTimeout(startNextWave, 2000); }
        } else { setTimeout(handleEnemyAttack, 1500); }
    }

    function handleEnemyAttack() {
        if (!battleState.isActive) return;
        if (Math.random() < (getTotalStat('agility') / 250)) {
            addBattleLog('You dodged the attack!', 'log-player');
            if (gameState.settings && gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); }
            else { attackBtn.disabled = false; fleeBtn.disabled = false; }
            return;
        }
        const damage = Math.max(1, battleState.enemy.strength * 2 - getTotalStat('fortitude'));
        battleState.playerHp = Math.max(0, battleState.playerHp - damage);
        playSound('hit', 0.6, 'sawtooth', 200, 50, 0.15);
        triggerScreenShake(200);
        createDamageNumber(damage, false, false);
        addBattleLog(`${battleState.enemy.name} attacks for ${damage} damage!`, "log-enemy");
        updateBattleHud();
        if (battleState.playerHp <= 0) { endBattle(false); } 
        else { if (gameState.settings && gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); } else { attackBtn.disabled = false; fleeBtn.disabled = false; } }
    }

    async function endBattle(playerWon) {
        battleState.isActive = false;
        
        if (battleState.totalDamage > 0) {
            try {
                // Use player name for the public damage leaderboard
                const damageRef = db.collection("damageLeaderboard").doc(gameState.playerName);
                const doc = await damageRef.get();
                if (!doc.exists || doc.data().totalDamage < battleState.totalDamage) {
                    await damageRef.set({ name: gameState.playerName, totalDamage: battleState.totalDamage });
                }
            } catch(e) { console.error("Failed to submit damage score", e); }
        }
        
        let title = ""; let rewardText = "";
        if (playerWon) {
            gameState.counters.battlesCompleted = (gameState.counters.battlesCompleted || 0) + 1;
            checkAllAchievements();
            playSound('victory', 1, 'triangle', 523, 1046, 0.4);
            let bonusItem = generateItem();
            title = "Battle Complete!";
            rewardText = `You are victorious!<br><br>Total Rewards:<br>+${battleState.totalGold} Gold<br>+${battleState.totalXp} XP<br>Total Damage: ${battleState.totalDamage}<br><br>Completion Bonus:<br><strong style="color:${bonusItem.rarity.color}">${bonusItem.name}</strong>`;
            gameState.gold += battleState.totalGold;
            addXP(gameState, battleState.totalXp);
            gameState.inventory.push(bonusItem);
            if (!gameState.equipment[bonusItem.type] || bonusItem.power > gameState.equipment[bonusItem.type].power) { equipItem(bonusItem); }
        } else {
            playSound('defeat', 1, 'sine', 440, 110, 0.8);
            if (battleState.playerHp <= 0) {
                title = "Defeated!";
                rewardText = "You black out and wake up back home. You lost half your current gold.";
                gameState.gold = Math.floor(gameState.gold / 2);
                gameState.resources.hp = 1;
            } else {
                title = "Fled from Battle";
                rewardText = "You escaped with your life, but no rewards were gained.";
            }
        }
        gameState.resources.hp = battleState.playerHp;
        setTimeout(() => { showScreen('game-screen'); showNotification(title, rewardText); saveGame(); updateUI(); }, 2500);
    }
    
    function passiveResourceRegen() {
        let playerUINeedsUpdate = false;
        let partnerUINeedsUpdate = false;

        if (gameState.resources && !gameState.expedition.active && !battleState.isActive) {
            if (gameState.resources.hp < gameState.resources.maxHp) {
                const hpRegenAmount = getTotalStat('stamina') * 0.05; 
                gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + hpRegenAmount);
                playerUINeedsUpdate = true;
            }
            if (gameState.resources.energy < gameState.resources.maxEnergy) {
                gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + 0.15);
                playerUINeedsUpdate = true;
            }
        }
        
        if (gameState.partner && gameState.partner.isHatched) {
            if (gameState.partner.resources.hp < gameState.partner.resources.maxHp) {
                const partnerHpRegenAmount = gameState.partner.stats.stamina * 0.05;
                gameState.partner.resources.hp = Math.min(gameState.partner.resources.maxHp, gameState.partner.resources.hp + partnerHpRegenAmount);
                partnerUINeedsUpdate = true;
            }
            if (gameState.partner.resources.energy < gameState.partner.resources.maxEnergy) {
                gameState.partner.resources.energy = Math.min(gameState.partner.resources.maxEnergy, gameState.partner.resources.energy + 0.15);
                partnerUINeedsUpdate = true;
            }
        }

        if (playerUINeedsUpdate) {
            updateUI();
        }
        if (partnerUINeedsUpdate) {
            updatePartnerUI();
        }
    }

    // --- AUTH & SETTINGS ---
    function signInWithGoogle() { 
        auth.signInWithPopup(googleProvider)
            .then(result => {
                showToast(`Welcome, ${result.user.displayName}!`);
                // onAuthStateChanged will handle loading the game
            })
            .catch(error => {
                console.error("Sign in error", error);
                showToast(`Sign in failed: ${error.message}`);
            }); 
    }
    
    function signOut() {
        const localSaveExists = !!localStorage.getItem('tapGuardianSave');
        const wasLoggedIn = !!auth.currentUser;
        
        auth.signOut().then(() => {
            showToast("Signed Out");
            // Reset game state to default before deciding what to do next
            gameState = JSON.parse(JSON.stringify(defaultState));
            if (localSaveExists) {
                if (confirm("You are now signed out. Do you want to load your local save file? (This will not affect your cloud save)")) {
                    loadGame();
                } else {
                    showScreen('main-menu-screen');
                    updateUI(); // Update UI to reflect logged-out state
                }
            } else {
                showScreen('main-menu-screen');
                updateUI();
            }
        });
    }

    function updateAuthUI(user) {
        if (user) {
            authStatus.textContent = `Signed in as ${user.displayName || user.email}`;
            googleSigninBtn.textContent = 'Sign Out';
            loadGameBtn.disabled = false; // Enable load game button when logged in
        } else {
            authStatus.textContent = 'Sign in for Cloud Saves & Leaderboards';
            googleSigninBtn.textContent = 'Sign in with Google';
            loadGameBtn.disabled = !localStorage.getItem('tapGuardianSave');
        }
    }
    function updateSettingsUI() {
        if (!gameState.settings) {
            gameState.settings = JSON.parse(JSON.stringify(defaultState.settings));
        }
        musicVolumeSlider.value = gameState.settings.musicVolume;
        sfxVolumeSlider.value = gameState.settings.sfxVolume;
        muteAllCheckbox.checked = gameState.settings.isMuted;
        autoBattleCheckbox.checked = gameState.settings.isAutoBattle;

        // Apply mute setting immediately
        if (gameState.settings.isMuted) {
             for(const key in musicManager.audio) { if(musicManager.audio[key] && !musicManager.audio[key].paused) musicManager.audio[key].pause(); }
        } else {
            if(musicManager.currentTrack) playMusic(musicManager.currentTrack);
        }

        // Apply volume setting immediately
        const currentMusic = musicManager.audio[musicManager.currentTrack];
        if (currentMusic) { currentMusic.volume = gameState.settings.musicVolume; }
    }

    // --- EVENT LISTENERS (FIXED/MERGED) ---
    startGameBtn.addEventListener('click', startGame);
    loadGameBtn.addEventListener('click', loadGame);
    characterSprite.addEventListener('click', (e) => handleTap(e, false)); 
    characterSprite.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e.touches[0], false); }, {passive: false});
    partnerSprite.addEventListener('click', (e) => handleTap(e, true)); 
    partnerSprite.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e.touches[0], true); }, {passive: false});
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('visible'));
    feedBtn.addEventListener('click', feed); 
    
    battleBtn.addEventListener('click', startBattle);
    attackBtn.addEventListener('click', handlePlayerAttack);
    fleeBtn.addEventListener('click', () => endBattle(false));

    expeditionBtn.addEventListener('click', () => { generateAndShowExpeditions(); showScreen('expedition-screen'); }); 
    shopBtn.addEventListener('click', () => { updateShopUI(); shopModal.classList.add('visible'); });
    expeditionCancelBtn.addEventListener('click', () => showScreen('game-screen'));
    
    ingameMenuBtn.addEventListener('click', () => {
        if (gameState.level >= ASCENSION_LEVEL) {
            ascensionBtn.style.display = 'block';
        } else {
            ascensionBtn.style.display = 'none';
        }
        ingameMenuModal.classList.add('visible');
    });

    returnToGameBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); });
    saveGameBtn.addEventListener('click', () => saveGame(true));
    quitToTitleBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); showScreen('main-menu-screen'); });
    inventoryBtn.addEventListener('click', () => { updateInventoryUI(); inventoryModal.classList.add('visible'); });
    closeInventoryBtn.addEventListener('click', () => { inventoryModal.classList.remove('visible'); });
    leaderboardBtn.addEventListener('click', () => showLeaderboard('level'));
    leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => showLeaderboard(tab.dataset.type));
    });
    closeLeaderboardBtn.addEventListener('click', () => { leaderboardModal.classList.remove('visible'); });
    achievementsBtn.addEventListener('click', () => { updateAchievementsUI(); achievementsModal.classList.add('visible'); });
    closeAchievementsBtn.addEventListener('click', () => { achievementsModal.classList.remove('visible'); });
    ascensionBtn.addEventListener('click', () => { updatePerksUI(); ascensionModal.classList.add('visible'); });
    closeAscensionBtn.addEventListener('click', () => { ascensionModal.classList.remove('visible'); });
    closeShopBtn.addEventListener('click', () => { shopModal.classList.remove('visible'); });
    forgeBtn.addEventListener('click', () => { updateForgeUI(); forgeModal.classList.add('visible'); });
    closeForgeBtn.addEventListener('click', () => { forgeSlots = [null, null]; forgeModal.classList.remove('visible'); });
    forgeBtnAction.addEventListener('click', forgeItems);
    [forgeSlot1Div, forgeSlot2Div].forEach((slot, index) => {
        slot.addEventListener('click', () => {
            forgeSlots[index] = null;
            updateForgeUI();
        });
    });
    switchCharacterBtn.addEventListener('click', () => showScreen('partner-screen'));
    switchToMainBtn.addEventListener('click', () => showScreen('game-screen'));
    
    // Auth and Settings listeners
    optionsBtn.addEventListener('click', () => { updateSettingsUI(); optionsModal.classList.add('visible'); });
    closeOptionsBtn.addEventListener('click', () => { saveGame(); optionsModal.classList.remove('visible'); });
    googleSigninBtn.addEventListener('click', () => {
        if(auth.currentUser) { signOut(); }
        else { signInWithGoogle(); }
    });
    muteAllCheckbox.addEventListener('change', (e) => {
        gameState.settings.isMuted = e.target.checked;
        updateSettingsUI(); // Re-apply settings
    });
    musicVolumeSlider.addEventListener('input', (e) => {
        gameState.settings.musicVolume = parseFloat(e.target.value);
        updateSettingsUI(); // Re-apply settings
    });
    sfxVolumeSlider.addEventListener('input', (e) => { 
        gameState.settings.sfxVolume = parseFloat(e.target.value); 
    });
    autoBattleCheckbox.addEventListener('change', (e) => { 
        gameState.settings.isAutoBattle = e.target.checked; 
    });
    
    const handleVisualTap = (e) => {
        if (gameState.expedition.active || (e.currentTarget.id === 'character-sprite' && gameState.resources.energy <= 0) || (e.currentTarget.id === 'partner-sprite' && gameState.partner && gameState.partner.isHatched && gameState.partner.resources.energy <= 0)) return;
        const targetSprite = e.currentTarget;
        const area = targetSprite.parentElement;
        const spriteRect = targetSprite.getBoundingClientRect();
        const areaRect = area.getBoundingClientRect();
        const flash = document.createElement('div');
        flash.className = 'tap-flash-overlay';
        flash.style.width = `${spriteRect.width}px`;
        flash.style.height = `${spriteRect.height}px`;
        flash.style.left = `${spriteRect.left - areaRect.left}px`;
        flash.style.top = `${spriteRect.top - areaRect.top}px`;
        area.appendChild(flash); setTimeout(() => { flash.remove(); }, 200);
    };
    characterSprite.addEventListener('click', handleVisualTap); 
    characterSprite.addEventListener('touchstart', handleVisualTap, { passive: true });
    partnerSprite.addEventListener('click', handleVisualTap);
    partnerSprite.addEventListener('touchstart', handleVisualTap, { passive: true });
    
    init();
});
