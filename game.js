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
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
    const GAME_VERSION = 1.8;
    let gameState = {};
    let audioCtx = null;
    let buffInterval = null;
    let lightningInterval = null;
    
    let battleState = {
        isActive: false, currentWave: 0, totalWaves: 5, playerHp: 0, enemy: null,
        totalXp: 0, totalGold: 0, totalDamage: 0
    };

    let availableExpeditions = [];
    let forgeSlots = [null, null];
    let partnerTimerInterval = null;
    const musicFileUrls = { main: 'main.mp3', battle: 'battle.mp3', expedition: 'expedition.mp3' };
    const musicManager = { isInitialized: false, audio: {}, currentTrack: null, fadeInterval: null };
    
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
    const achievements = {
        tap100: { name: "Novice Tapper", desc: "Tap 100 times.", target: 100, unlocked: false, reward: { type: 'gold', amount: 50 } },
        tap1000: { name: "Adept Tapper", desc: "Tap 1,000 times.", target: 1000, unlocked: false, reward: { type: 'gold', amount: 250 } },
        level10: { name: "Getting Stronger", desc: "Reach level 10.", target: 10, unlocked: false, reward: { type: 'item', rarity: 'uncommon' } },
        defeat10: { name: "Goblin Slayer", desc: "Defeat 10 enemies.", target: 10, unlocked: false, reward: { type: 'gold', amount: 100 } },
        ascend1: { name: "New Beginning", desc: "Ascend for the first time.", target: 1, unlocked: false, reward: { type: 'gold', amount: 1000 } },
        battle1: { name: "Battle Runner", desc: "Complete a Battle sequence once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2000 } },
    };
    const perks = {
        vigor: { name: "Guardian's Vigor", desc: "+10 Max HP & Energy per level.", maxLevel: 5, cost: [1, 1, 2, 2, 3] },
        tapXp: { name: "Tapper's Insight", desc: "+10% XP from Taps per level.", maxLevel: 5, cost: [1, 1, 2, 2, 3] },
        goldBoost: { name: "Fortune's Favor", desc: "+5% Gold from all sources per level.", maxLevel: 10, cost: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] },
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
    };
    const permanentShopUpgrades = {
        strTraining: { name: "Strength Training", desc: "Permanently increases base Strength.", stat: 'strength', bonus: 1, levelReq: 10, maxLevel: 10, cost: (level) => 1000 * Math.pow(2, level) },
        forTraining: { name: "Fortitude Training", desc: "Permanently increases base Fortitude.", stat: 'fortitude', bonus: 1, levelReq: 10, maxLevel: 10, cost: (level) => 1000 * Math.pow(2, level) },
    };
    const expeditionData = {
        actions: ["Explore", "Patrol", "Scour", "Delve into", "Investigate"],
        locations: ["the Glimmering Caves", "the Whispering Woods", "the Forgotten Ruins"],
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
        inventory: [],
        expedition: { active: false, returnTime: 0 },
        ascension: { tier: 1, points: 0, perks: {} },
        permanentUpgrades: {},
        achievements: JSON.parse(JSON.stringify(achievements)),
        counters: { taps: 0, enemiesDefeated: 0, ascensionCount: 0, battlesCompleted: 0, itemsForged: 0, legendariesFound: 0 },
        settings: {
            musicVolume: 0.5,
            sfxVolume: 1.0,
            isMuted: false,
            isAutoBattle: false,
        }
    };
    const ASCENSION_LEVEL = 50;
    const BATTLE_UNLOCK_LEVEL = 20;
    const FORGE_UNLOCK_LEVEL = 15;
    let tapCombo = { counter: 0, lastTapTime: 0, currentMultiplier: 1, frenzyTimeout: null };
    let expeditionInterval = null;
    
    // --- ELEMENT SELECTORS ---
    const screens = document.querySelectorAll('.screen');
    const gameScreen = document.getElementById('game-screen');
    const loadGameBtn = document.getElementById('load-game-btn');
    const characterSprite = document.getElementById('character-sprite');
    const playerNameLevel = document.getElementById('player-name-level');
    const healthBarFill = document.querySelector('#health-bar .stat-bar-fill');
    const healthBarLabel = document.querySelector('#health-bar .stat-bar-label');
    const energyBarFill = document.querySelector('#energy-bar .stat-bar-fill');
    const energyBarLabel = document.querySelector('#energy-bar .stat-bar-label');
    const xpBarFill = document.querySelector('#xp-bar .stat-bar-fill');
    const xpBarLabel = document.querySelector('#xp-bar .stat-bar-label');
    const coreStatsDisplay = document.getElementById('core-stats-display');
    const goldDisplay = document.getElementById('gold-display');
    const worldTierDisplay = document.getElementById('world-tier-display');
    const startGameBtn = document.getElementById('start-game-btn');
    const feedBtn = document.getElementById('feed-btn');
    const battleBtn = document.getElementById('battle-btn');
    const battleUnlockText = document.getElementById('battle-unlock-text');
    const expeditionBtn = document.getElementById('expedition-btn');
    const shopBtn = document.getElementById('shop-btn');
    const forgeBtn = document.getElementById('forge-btn');
    const forgeUnlockText = document.getElementById('forge-unlock-text');
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
    const saveGameBtn = document.getElementById('save-game-btn');
    const optionsBtn = document.getElementById('options-btn');
    const quitToTitleBtn = document.getElementById('quit-to-title-btn');
    const returnToGameBtn = document.getElementById('return-to-game-btn');
    const inventoryBtn = document.getElementById('inventory-btn');
    const inventoryModal = document.getElementById('inventory-modal');
    const inventoryList = document.getElementById('inventory-list');
    const closeInventoryBtn = document.getElementById('close-inventory-btn');
    const expeditionTimerDisplay = document.getElementById('expedition-timer-display');
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
    const windAnimationContainer = document.getElementById('wind-animation-container');

    // --- CORE GAME FUNCTIONS ---
    function showScreen(screenId) { 
        screens.forEach(s => s.classList.remove('active')); document.getElementById(screenId).classList.add('active'); 
        if (gameState.settings) {
            if (screenId === 'battle-screen') { playMusic('battle'); } 
            else if (screenId === 'game-screen' || screenId === 'main-menu-screen') { if (!gameState.expedition || !gameState.expedition.active) { playMusic('main'); } }
        }
    }
    function init() { 
        startBackgroundAssetLoading();
        createWindEffect();
        createStarfield();
        auth.onAuthStateChanged(user => {
            updateAuthUI(user);
            if (user) { loadGame(); }
        });
        setTimeout(() => { if(!auth.currentUser) showScreen('main-menu-screen'); if (!localStorage.getItem('tapGuardianSave')) { loadGameBtn.disabled = true; } }, 1500);
        setInterval(passiveResourceRegen, 1000);
    }
    async function startGame() {
        let playerName = ""; let isNameValid = false;
        while (!isNameValid) {
            const inputName = prompt("Enter your Guardian's name (3-15 chars):", auth.currentUser ? auth.currentUser.displayName : "");
            if (inputName === null) { return; } 
            if (inputName.length < 3 || inputName.length > 15) { alert("Name must be between 3 and 15 characters."); continue; }
            playerName = inputName; isNameValid = true;
        }
        gameState = JSON.parse(JSON.stringify(defaultState));
        gameState.playerName = playerName;
        
        initAudio(); 
        updateSettingsUI();
        updateUI(); 
        updateAscensionVisuals(); 
        saveGame(); 
        showScreen('game-screen');
    }
    async function migrateSaveData(loadedState) {
        if (!loadedState.version || loadedState.version < GAME_VERSION) {
            showScreen('update-screen');
            loadedState.version = GAME_VERSION;
            const defaultSettings = defaultState.settings;
            loadedState.settings = { ...defaultSettings, ...(loadedState.settings || {})};
            return new Promise(resolve => setTimeout(() => resolve(loadedState), 1500));
        }
        return Promise.resolve(loadedState);
    }
    async function loadGame() {
        initAudio();
        let loadedState = null;

        if (auth.currentUser) {
            try {
                const docRef = db.collection('playerSaves').doc(auth.currentUser.uid);
                const doc = await docRef.get();
                if (doc.exists) {
                    loadedState = doc.data();
                    showToast("Cloud save loaded!");
                } else {
                    showToast("No cloud save found. Starting a new game.");
                    startGame();
                    return;
                }
            } catch (error) {
                console.error("Error loading from cloud:", error);
                showToast("Could not load from cloud. Trying local save.");
            }
        }

        if (!loadedState) {
            const savedData = localStorage.getItem('tapGuardianSave');
            if (savedData) {
                loadedState = JSON.parse(savedData);
            }
        }
        
        if (loadedState) {
            loadedState = await migrateSaveData(loadedState);
            gameState = { ...defaultState, ...loadedState };
            updateSettingsUI();
            updateUI(); 
            updateAscensionVisuals(); 
            showScreen('game-screen');
        } else {
            showNotification("No Save Data Found!", "Starting a new game instead.");
            startGame();
        }
    }
    async function saveGame(showToastNotification = false) {
        if (!gameState.playerName) return;
        if (auth.currentUser) {
            try {
                const docRef = db.collection('playerSaves').doc(auth.currentUser.uid);
                await docRef.set(gameState);
                if (showToastNotification) showToast("Game saved to Cloud!");
            } catch (error) {
                console.error("Error saving to cloud:", error);
                if (showToastNotification) showToast("Cloud save failed!");
            }
        } else {
            localStorage.setItem('tapGuardianSave', JSON.stringify(gameState));
            if (showToastNotification) showToast("Game Saved Locally!");
        }
        loadGameBtn.disabled = false;
    }
    function getXpForNextLevel(level) { return Math.floor(100 * Math.pow(1.5, level - 1)); }
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
        
        const onExpedition = gameState.expedition.active;
        characterSprite.style.display = onExpedition ? 'none' : 'block';
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
            if (!expeditionInterval) { expeditionInterval = setInterval(() => { expeditionTimerDisplay.textContent = new Date((gameState.expedition.returnTime - Date.now()) || 0).toISOString().substr(11, 8); }, 1000); }
        } else { expeditionBtn.textContent = `Expedition`; expeditionBtn.disabled = false; }
        if (gameState.tutorialCompleted) { tutorialOverlay.style.display = 'none'; } else { tutorialOverlay.style.display = 'flex'; }
    }
    function addXP(character, amount) { 
        const tierMultiplier = Math.pow(1.2, gameState.ascension.tier - 1);
        let finalAmount = amount * tierMultiplier;
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
        playSound('levelUp', 1, 'triangle', 440, 880); 
        checkAllAchievements();
        submitScoreToLeaderboard();
        updateAscensionVisuals();
        showNotification("LEVEL UP!", `${character.name} is now Level ${character.level}!`); saveGame();
    }
    function showNotification(title, text) { modal.classList.add('visible'); modalTitle.textContent = title; modalText.innerHTML = text; }
    function handleTap(event) {
        if (gameState.expedition.active) return;
        initAudio();
        if (gameState.tutorialCompleted === false) { gameState.tutorialCompleted = true; tutorialOverlay.style.display = 'none'; saveGame(); }
        if (gameState.resources.energy <= 0) return;
        gameState.counters.taps = (gameState.counters.taps || 0) + 1; checkAllAchievements();
        playSound('tap', 0.5, 'square', 150, 100, 0.05);
        let xpGain = 0.25;
        if (gameState.level >= 10) { xpGain = 0.75; }
        const tapXpBonus = 1 + (gameState.ascension.perks.tapXp || 0) * 0.10;
        xpGain *= tapXpBonus; createXpOrb(event, xpGain, gameState); gameState.resources.energy -= 0.1;
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
            gameState.resources = JSON.parse(JSON.stringify(defaultState.resources));
            submitScoreToLeaderboard();
            updateAscensionVisuals();
            saveGame(); updateUI(); ingameMenuModal.classList.remove('visible');
            showNotification("ASCENDED!", `Welcome to World Tier ${gameState.ascension.tier}. You have gained 1 Ascension Point to spend.`);
        }
    }
    async function submitScoreToLeaderboard() {
        if (!auth.currentUser || !gameState.playerName || gameState.playerName === "Guardian") return;
        const score = { name: gameState.playerName, level: gameState.level, tier: gameState.ascension.tier };
        try { await db.collection("leaderboard").doc(auth.currentUser.uid).set(score); } catch (error) { console.error("Error submitting score: ", error); }
    }
    async function showLeaderboard(type = 'level') {
        // ... (This function remains unchanged)
    }
    function generateItem(forceRarity = null) {
        // ... (This function remains unchanged)
    }
    function updateInventoryUI() {
        // ... (This function remains unchanged)
    }
    function initAudio() { if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); initMusic(); } }
    function playSound(type, volume = 1, wave = 'sine', startFreq = 440, endFreq = 440, duration = 0.1) {
        if (!audioCtx || (gameState.settings && gameState.settings.isMuted)) return;
        const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); oscillator.type = wave;
        oscillator.frequency.setValueAtTime(startFreq, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
        const finalVolume = (gameState.settings ? gameState.settings.sfxVolume : 1.0) * volume;
        gainNode.gain.setValueAtTime(finalVolume, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.start(); oscillator.stop(audioCtx.currentTime + duration);
    }
    function createDamageNumber(amount, isCrit, isPlayerSource) {
        const num = document.createElement('div'); num.textContent = amount; num.className = 'damage-text';
        if (isPlayerSource) num.classList.add('player-damage'); else num.classList.add('enemy-damage');
        if (isCrit) num.classList.add('crit'); document.getElementById('battle-arena').appendChild(num);
        setTimeout(() => { num.style.transform = 'translateY(-80px)'; num.style.opacity = '0'; }, 10);
        setTimeout(() => { num.remove(); }, 800);
    }
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
            }
        }
        showToast(`Achievement: ${ach.name}${rewardText}`);
        playSound('levelUp', 0.7, 'triangle', 880, 1200, 0.3);
        updateUI();
    }
    function checkAllAchievements() {
        if (!gameState.counters) return;
        const counters = gameState.counters;
        if (counters.taps >= 100) unlockAchievement('tap100');
        if (counters.taps >= 1000) unlockAchievement('tap1000');
        if (gameState.level >= 10) unlockAchievement('level10');
        if (counters.enemiesDefeated >= 10) unlockAchievement('defeat10');
        if (counters.ascensionCount >= 1) unlockAchievement('ascend1');
        if (counters.battlesCompleted >= 1) unlockAchievement('battle1');
    }
    function updateAchievementsUI() {
        // ... (This function remains unchanged)
    }
    function updatePerksUI() {
        // ... (This function remains unchanged)
    }
    function buyPerk(perkId) {
        // ... (This function remains unchanged)
    }
    function updateShopUI() {
        // ... (This function remains unchanged)
    }
    function buyShopItem(itemId, type) {
        // ... (This function remains unchanged)
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
            enemy = {
                name: "Goblin King", hp: Math.floor((150 + 20 * levelMultiplier) * tierMultiplier * waveMultiplier),
                strength: Math.floor((10 + 4 * levelMultiplier) * tierMultiplier * waveMultiplier),
                agility: Math.floor((5 + 2 * levelMultiplier) * tierMultiplier * waveMultiplier),
                fortitude: Math.floor((8 + 3 * levelMultiplier) * tierMultiplier * waveMultiplier),
                xpReward: Math.floor((100 * levelMultiplier) * tierMultiplier * waveMultiplier),
                goldReward: Math.floor((75 * levelMultiplier) * tierMultiplier * waveMultiplier)
            };
        } else {
            enemy = {
                name: `Wave ${battleState.currentWave} Goblin`, hp: Math.floor((60 + 8 * levelMultiplier) * tierMultiplier * waveMultiplier),
                strength: Math.floor((3 + 2 * levelMultiplier) * tierMultiplier * waveMultiplier),
                agility: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier),
                fortitude: Math.floor((3 + 1 * levelMultiplier) * tierMultiplier * waveMultiplier),
                xpReward: Math.floor((25 * levelMultiplier) * tierMultiplier * waveMultiplier),
                goldReward: Math.floor((15 * levelMultiplier) * tierMultiplier * waveMultiplier)
            };
        }
        enemy.maxHp = enemy.hp;
        battleState.enemy = enemy;
        updateBattleHud();
        addBattleLog(`A wild ${battleState.enemy.name} appears!`, "log-system");
        attackBtn.disabled = true;
        fleeBtn.disabled = true;

        setTimeout(() => {
            if (battleState.enemy.agility > getTotalStat('agility')) {
                addBattleLog(`${battleState.enemy.name} is faster and attacks first!`, "log-enemy");
                handleEnemyAttack();
            } else {
                addBattleLog("You are faster! Your turn.", "log-player");
                if (gameState.settings.isAutoBattle) {
                    setTimeout(handlePlayerAttack, 1000); // Wait 1s before auto-attacking
                } else {
                    attackBtn.disabled = false;
                    fleeBtn.disabled = false;
                }
            }
        }, 1000);
    }
    function handlePlayerAttack() {
        if (!battleState.isActive) return;
        attackBtn.disabled = true;
        fleeBtn.disabled = true;

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
            if (gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); }
            else { attackBtn.disabled = false; fleeBtn.disabled = false; }
            return;
        }
        const damage = Math.max(1, battleState.enemy.strength * 2 - getTotalStat('fortitude'));
        battleState.playerHp = Math.max(0, battleState.playerHp - damage);
        playSound('hit', 0.6, 'sawtooth', 200, 50, 0.15);
        createDamageNumber(damage, false, false);
        addBattleLog(`${battleState.enemy.name} attacks for ${damage} damage!`, "log-enemy");
        updateBattleHud();
        if (battleState.playerHp <= 0) {
            endBattle(false);
        } else {
            if (gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); }
            else { attackBtn.disabled = false; fleeBtn.disabled = false; }
        }
    }
    async function endBattle(playerWon) {
        battleState.isActive = false;
        
        if (battleState.totalDamage > 0 && auth.currentUser) {
            try {
                const damageRef = db.collection("damageLeaderboard").doc(auth.currentUser.uid);
                const doc = await damageRef.get();
                if (!doc.exists || doc.data().totalDamage < battleState.totalDamage) {
                    await damageRef.set({ name: gameState.playerName, totalDamage: battleState.totalDamage });
                }
            } catch(e) { console.error("Failed to submit damage score", e); }
        }
        
        let title = "";
        let rewardText = "";

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
            if (!gameState.equipment[bonusItem.type] || bonusItem.power > gameState.equipment[bonusItem.type].power) { 
                equipItem(bonusItem); 
            }
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

        setTimeout(() => {
            showScreen('game-screen');
            showNotification(title, rewardText);
            saveGame();
            updateUI();
        }, 2500);
    }
    function passiveResourceRegen() {
        let UINeedsUpdate = false;
        if (gameState.resources && !gameState.expedition.active && !battleState.isActive) {
            if (gameState.resources.hp < gameState.resources.maxHp) {
                const hpRegenAmount = getTotalStat('stamina') * 0.05; 
                gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + hpRegenAmount);
                UINeedsUpdate = true;
            }
            if (gameState.resources.energy < gameState.resources.maxEnergy) {
                gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + 0.15);
                UINeedsUpdate = true;
            }
        }
        if (UINeedsUpdate) { updateUI(); }
    }
    
    // --- AUTH & SETTINGS ---
    function signInWithGoogle() {
        auth.signInWithPopup(googleProvider).catch(error => console.error("Sign in error", error));
    }
    function signOut() {
        const localSaveExists = localStorage.getItem('tapGuardianSave');
        auth.signOut();
        
        if (localSaveExists) {
            if (confirm("You have signed out. Load your local save?")) {
                loadGame();
            } else {
                showScreen('main-menu-screen');
            }
        } else {
            showNotification("Signed Out", "You are now playing locally. Your cloud save is safe.");
            showScreen('main-menu-screen');
        }
    }
    function updateAuthUI(user) {
        if (user) {
            authStatus.textContent = `Signed in as ${user.displayName || user.email}`;
            googleSigninBtn.textContent = 'Sign Out';
        } else {
            authStatus.textContent = 'Sign in to save to the cloud.';
            googleSigninBtn.textContent = 'Sign in with Google';
        }
    }
    function updateSettingsUI() {
        if (!gameState.settings) {
            gameState.settings = { ...defaultState.settings };
        }
        musicVolumeSlider.value = gameState.settings.musicVolume;
        sfxVolumeSlider.value = gameState.settings.sfxVolume;
        muteAllCheckbox.checked = gameState.settings.isMuted;
        autoBattleCheckbox.checked = gameState.settings.isAutoBattle;
    }

    // --- EVENT LISTENERS ---
    startGameBtn.addEventListener('click', startGame);
    loadGameBtn.addEventListener('click', loadGame);
    characterSprite.addEventListener('click', (e) => handleTap(e, false)); 
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('visible'));
    feedBtn.addEventListener('click', feed); 
    battleBtn.addEventListener('click', startBattle);
    attackBtn.addEventListener('click', handlePlayerAttack);
    fleeBtn.addEventListener('click', () => endBattle(false));
    expeditionBtn.addEventListener('click', () => { generateAndShowExpeditions(); showScreen('expedition-screen'); }); 
    shopBtn.addEventListener('click', () => { updateShopUI(); shopModal.classList.add('visible'); });
    expeditionCancelBtn.addEventListener('click', () => showScreen('game-screen'));
    ingameMenuBtn.addEventListener('click', () => {
        const ascendBtn = document.getElementById('ascension-btn');
        if (ascendBtn) {
            ascendBtn.style.display = (gameState.level >= ASCENSION_LEVEL) ? 'block' : 'none';
        }
        ingameMenuModal.classList.add('visible');
    });
    returnToGameBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); });
    saveGameBtn.addEventListener('click', () => saveGame(true));
    optionsBtn.addEventListener('click', () => { updateSettingsUI(); optionsModal.classList.add('visible'); });
    quitToTitleBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); showScreen('main-menu-screen'); });
    inventoryBtn.addEventListener('click', () => { updateInventoryUI(); inventoryModal.classList.add('visible'); });
    closeInventoryBtn.addEventListener('click', () => { inventoryModal.classList.remove('visible'); });
    leaderboardBtn.addEventListener('click', () => showLeaderboard('level'));
    leaderboardTabs.forEach(tab => tab.addEventListener('click', () => showLeaderboard(tab.dataset.type)) );
    closeLeaderboardBtn.addEventListener('click', () => { leaderboardModal.classList.remove('visible'); });
    achievementsBtn.addEventListener('click', () => { updateAchievementsUI(); achievementsModal.classList.add('visible'); });
    closeAchievementsBtn.addEventListener('click', () => { achievementsModal.classList.remove('visible'); });
    ascensionBtn.addEventListener('click', () => { updatePerksUI(); ascensionModal.classList.add('visible'); });
    closeAscensionBtn.addEventListener('click', () => { ascensionModal.classList.remove('visible'); });
    closeShopBtn.addEventListener('click', () => { shopModal.classList.remove('visible'); });
    
    closeOptionsBtn.addEventListener('click', () => { saveGame(); optionsModal.classList.remove('visible'); });
    googleSigninBtn.addEventListener('click', () => {
        if(auth.currentUser) { signOut(); }
        else { signInWithGoogle(); }
    });
    muteAllCheckbox.addEventListener('change', (e) => {
        gameState.settings.isMuted = e.target.checked;
        if (gameState.settings.isMuted) {
            for(const key in musicManager.audio) { musicManager.audio[key].pause(); }
        } else { playMusic(musicManager.currentTrack); }
    });
    musicVolumeSlider.addEventListener('input', (e) => {
        gameState.settings.musicVolume = parseFloat(e.target.value);
        const currentMusic = musicManager.audio[musicManager.currentTrack];
        if (currentMusic) { currentMusic.volume = gameState.settings.musicVolume; }
    });
    sfxVolumeSlider.addEventListener('input', (e) => { gameState.settings.sfxVolume = parseFloat(e.target.value); });
    autoBattleCheckbox.addEventListener('change', (e) => { gameState.settings.isAutoBattle = e.target.checked; });
    
    init();
});