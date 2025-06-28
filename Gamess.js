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
    const GAME_VERSION = 1.9;

    let gameState = {};
    let audioCtx = null;
    let buffInterval = null;
    let lightningInterval = null;
    let skillsModalInterval = null;
    let isUiHidden = false;

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
    let currentForgeSelectionTarget = null;
    let partnerTimerInterval = null;
    let tapCombo = { counter: 0, lastTapTime: 0, currentMultiplier: 1, frenzyTimeout: null };
    let expeditionInterval = null;
    let dojoState = { isActive: false, timerId: null, damageIntervalId: null, beamAnimationId: null, totalSessionDamage: 0 };
    let genesisState = {
      isActive: false,
      gameLoopId: null,
      player: null,
      enemies: [],
      lootOrbs: [],
      autoPotionOnCooldown: false,
      lastEnemySpawn: 0,
      difficultyLevel: 1,
      lastDifficultyIncrease: 0,
      isBattleMode: false,
      currentWave: 0,
      totalWaves: 10,
      enemiesToSpawnThisWave: 0,
      enemiesSpawnedThisWave: 0,
      boss: null,
      waveTransitionActive: false,
      totalDamageDealtThisBattle: 0,
    };
    let pvpState = {
      isActive: false,
      timerId: null,
      playerDamage: 0,
      opponentDamage: 0,
      opponentData: null,
    };

    // --- FIX PART 1: Remove the direct dependency on the `achievements` constant ---
    const defaultState = {
        version: GAME_VERSION,
        playerName: "Guardian", tutorialCompleted: false, level: 1, xp: 0, gold: 0, healthPotions: 30,
        edgeStones: 0,
        highestBattleLevelCompleted: 0,
        stats: { strength: 5, agility: 5, fortitude: 5, stamina: 5 },
        satiation: 2000,
        maxSatiation: 2000,
        resources: { hp: 100, maxHp: 100, energy: 100, maxEnergy: 100 },
        equipment: { weapon: null, armor: null },
        inventory: [], hasEgg: false, partner: null,
        expedition: { active: false, returnTime: 0 },
        ascension: { tier: 1, points: 0, perks: {} },
        permanentUpgrades: {},
        activeBuffs: {},
        achievements: null, // Set to null initially
        counters: { taps: 0, enemiesDefeated: 0, ascensionCount: 0, battlesCompleted: 0, itemsForged: 0, legendariesFound: 0 },
        lastWeeklyRewardClaim: 0,
        settings: { musicVolume: 0.5, sfxVolume: 1.0, isMuted: false, isAutoBattle: false }, dojoPersonalBest: 0,
        pvpPersonalBest: 0,
        lastDailyClaim: 0,
        dailyStreak: 0,
        lastLogin: Date.now(),
        orbs: 0,
        immortalGrowth: {
          potentials: {
              attack_power_percent: 0,
              hp_percent: 0,
              crit_damage_percent: 0,
              gold_find_percent: 0,
              xp_gain_percent: 0
          },
          awakening: {
              stamina: 0,
              wisdom: 0,
              weaponMastery: 0,
              armorMastery: 0,
              attackSpeed: 0
          },
          skills: {
              aoeSlash: 0,
              dash: 0,
              thunderStrike: 0,
              havocRage: 0
          }
      }
    };

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
    const playerStatPanel = document.getElementById('player-stat-panel');
    const buffDisplay = document.getElementById('buff-display');
    const worldTierDisplay = document.getElementById('world-tier-display');
    const hungerBarFill = document.getElementById('hunger-bar-fill');
    const startGameBtn = document.getElementById('start-game-btn');
    const growBtn = document.getElementById('grow-btn');
    const feedBtn = document.getElementById('feed-btn');
    const battleBtn = document.getElementById('battle-btn');
    const battleUnlockText = document.getElementById('battle-unlock-text');
    const pvpBtn = document.getElementById('pvp-btn');
    const pvpUnlockText = document.getElementById('pvp-unlock-text');
    const pvpSelectionScreen = document.getElementById('pvp-selection-screen');
    const pvpOpponentListContainer = document.getElementById('pvp-opponent-list-container');
    const pvpSelectionBackBtn = document.getElementById('pvp-selection-back-btn');
    const pvpBattleScreen = document.getElementById('pvp-battle-screen');
    const pvpArena = document.getElementById('pvp-arena');
    const pvpTimerDisplay = document.getElementById('pvp-timer-display');
    const pvpPlayerName = document.getElementById('pvp-player-name');
    const pvpOpponentName = document.getElementById('pvp-opponent-name');
    const pvpPlayerDamageFill = document.getElementById('pvp-player-damage-fill');
    const pvpOpponentDamageFill = document.getElementById('pvp-opponent-damage-fill');
    const pvpLeaderboardList = document.getElementById('pvp-leaderboard-list');
    const expeditionBtn = document.getElementById('expedition-btn');
    const actionButtons = document.getElementById('action-buttons');
    const toggleUiBtn = document.getElementById('toggle-ui-btn');
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
    const autoForgeBtn = document.getElementById('auto-forge-btn');
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
    const confirmAscensionBtn = document.getElementById('confirm-ascension-btn');
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
    const rewardsBtn = document.getElementById('rewards-btn');
    const rewardsModal = document.getElementById('rewards-modal');
    const closeRewardsBtn = document.getElementById('close-rewards-btn');
    const dailyRewardsContainer = document.getElementById('daily-rewards-container');
    const weeklyRewardsContainer = document.getElementById('weekly-rewards-container');
    const feedBattleBtn = document.getElementById('feed-battle-btn');
    const potionCountDisplay = document.getElementById('potion-count-display');
    const offlineRewardsModal = document.getElementById('offline-rewards-modal');
    const closeOfflineRewardsBtn = document.getElementById('close-offline-rewards-btn');
    const offlineTimeAway = document.getElementById('offline-time-away');
    const offlineRewardsList = document.getElementById('offline-rewards-list');
    const immortalGrowthBtn = document.getElementById('immortal-growth-btn');
    const immortalGrowthModal = document.getElementById('immortal-growth-modal');
    const potentialsTreeContainer = document.getElementById('potentials-tree-container');
    const resetPotentialsBtn = document.getElementById('reset-potentials-btn');
    const immortalGrowthCloseFooterBtn = document.getElementById('immortal-growth-close-footer-btn');
    const awakeningBtn = document.querySelector('.immortal-growth-tabs .immortal-growth-tab-btn');
    const awakeningModal = document.getElementById('awakening-modal');
    const awakeningTreeContainer = document.getElementById('awakening-tree-container');
    const awakeningCloseBtn = document.getElementById('awakening-close-btn');
    const skillsBtn = document.getElementById('skills-btn');
    const skillsModal = document.getElementById('skills-modal');
    const closeSkillsBtn = document.getElementById('skills-close-btn');
    const skillsTreeContainer = document.getElementById('skills-tree-container');

    const dojoBtn = document.getElementById('dojo-btn');
    const dojoScreen = document.getElementById('dojo-screen');
    const dojoExitBtn = document.getElementById('dojo-exit-btn');
    const dojoDummySprite = document.getElementById('dojo-dummy-sprite');
    const dojoPersonalBestDisplay = document.getElementById('dojo-personal-best');
    const dojoSessionTotalDisplay = document.getElementById('dojo-session-total');
    const dojoTimerBarContainer = document.getElementById('dojo-timer-bar-container');
    const dojoTimerBarFill = document.querySelector('#dojo-timer-bar-container .stat-bar-fill');
    const dojoTimerBarLabel = document.querySelector('#dojo-timer-bar-container .stat-bar-label');
    const dojoLightningCanvas = document.getElementById('dojo-lightning-canvas');
    const dojoCanvasCtx = dojoLightningCanvas.getContext('2d');
    const genesisArena = document.getElementById('genesis-arena');
    const genesisWaveDisplay = document.getElementById('genesis-wave-display');
    const bossHealthContainer = document.getElementById('boss-health-container');
    const bossNameDisplay = document.getElementById('boss-name');
    const bossHealthFill = document.getElementById('boss-health-fill');

    function init() {
        displayTopPlayersOnMenu();
        createWindEffect();
        createStarfield();
        startBackgroundAssetLoading();

        auth.onAuthStateChanged(user => {
            updateAuthUI(user);
            if (user) {
                loadGame();
            } else {
                loadGameBtn.disabled = !localStorage.getItem('tapGuardianSave');
            }
        });

        setTimeout(() => {
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen && loadingScreen.classList.contains('active')) {
                showScreen('main-menu-screen');
            }
        }, 1500);

        buffInterval = setInterval(updateBuffs, 1000);
        partnerTimerInterval = setInterval(checkEggHatch, 1000);
        setInterval(passiveResourceRegen, 1000);
    }

    async function startGame() {
        initAudio();
        let playerName = "";
        let isNameValid = false;
        while (!isNameValid) {
            const defaultName = auth.currentUser ? auth.currentUser.displayName.split(' ')[0] : "";
            const inputName = prompt("Enter your Guardian's name (3-15 chars):", defaultName);
            if (inputName === null) {
                return;
            }
            if (inputName.length < 3 || inputName.length > 15) {
                alert("Name must be between 3 and 15 characters.");
                continue;
            }
            playerName = inputName;
            isNameValid = true;
        }
        gameState = JSON.parse(JSON.stringify(defaultState));
        gameState.playerName = playerName;

        // --- FIX PART 2: Properly initialize the achievements now that it's safe ---
        gameState.achievements = JSON.parse(JSON.stringify(achievements));

        updateSettingsUI();
        updateUI();
        updateAscensionVisuals();
        showScreen('game-screen');
        startGameGenesis();
        checkWeeklyRewards();
        checkDailyRewards();
        await saveGame();
    }

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
                if (auth.currentUser) {
                    showToast("No cloud save found, loaded local save instead.");
                }
            }
        }

        if (loadedState) {
            loadedState = await migrateSaveData(loadedState);
            gameState = JSON.parse(JSON.stringify(defaultState));
            for (const key in loadedState) {
                if (typeof loadedState[key] === 'object' && !Array.isArray(loadedState[key]) && loadedState[key] !== null) {
                    gameState[key] = { ...gameState[key],
                        ...loadedState[key]
                    };
                } else {
                    gameState[key] = loadedState[key];
                }
            }
            checkOfflineRewards();
            if (fromCloud) showToast("Cloud save loaded!");

            updateSettingsUI();
            checkExpeditionStatus();
            updateUI();
            updateAscensionVisuals();
            showScreen('game-screen');
            startGameGenesis();
            checkWeeklyRewards();
            checkDailyRewards();
            await saveGame();
        } else if (auth.currentUser) {
            showToast("No saves found. Starting a new game.");
            startGame();
        }
    }

    async function saveGame(showToastNotification = false) {
        if (!gameState.playerName || gameState.playerName === "Guardian") return;
        gameState.lastLogin = Date.now();
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

    function signInWithGoogle() {
        auth.signInWithPopup(googleProvider)
            .then(result => {
                showToast(`Welcome, ${result.user.displayName}!`);
            })
            .catch(error => {
                console.error("Sign in error", error);
                showToast(`Sign in failed: ${error.message}`);
            });
    }

    function signOut() {
        const localSaveExists = !!localStorage.getItem('tapGuardianSave');
        auth.signOut().then(() => {
            showToast("Signed Out");
            gameState = JSON.parse(JSON.stringify(defaultState));
            if (localSaveExists) {
                if (confirm("You are now signed out. Do you want to load your local save file? (This will not affect your cloud save)")) {
                    loadGame();
                } else {
                    showScreen('main-menu-screen');
                    updateUI();
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
            loadGameBtn.disabled = false;
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

        if (gameState.settings.isMuted) {
            for (const key in musicManager.audio) {
                if (musicManager.audio[key] && !musicManager.audio[key].paused) musicManager.audio[key].pause();
            }
        } else {
            if (musicManager.currentTrack) playMusic(musicManager.currentTrack);
        }

        const currentMusic = musicManager.audio[musicManager.currentTrack];
        if (currentMusic) {
            currentMusic.volume = gameState.settings.musicVolume;
        }
    }

    function openInventoryForForgeSelection(slotIndex) {
        currentForgeSelectionTarget = slotIndex;
        updateInventoryUI();
        forgeModal.classList.remove('visible');
        inventoryModal.classList.add('visible');
        document.getElementById("inventory-prompt-text").textContent = `Select an item for Forge Slot ${slotIndex + 1}.`;
    }

    const detailedStatsModal = document.getElementById('detailed-stats-modal');
    const detailedStatsCloseBtn = document.getElementById('detailed-stats-close-btn');

    immortalGrowthBtn.addEventListener('click', () => {
        renderPotentialsTree();
        immortalGrowthModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/immortal-growth' });
    });
    immortalGrowthCloseFooterBtn.addEventListener('click', () => {
        immortalGrowthModal.classList.remove('visible');
    });
    resetPotentialsBtn.addEventListener('click', resetPotentials);
    potentialsTreeContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.immortal-upgrade-btn');
        if (button) {
            const statId = button.getAttribute('data-stat-id');
            if (statId) {
                upgradePotentialStat(statId);
            }
        }
    });
    awakeningBtn.addEventListener('click', () => {
        immortalGrowthModal.classList.remove('visible');
        renderAwakeningTree();
        awakeningModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/awakening' });
    });
    awakeningCloseBtn.addEventListener('click', () => {
        awakeningModal.classList.remove('visible');
        immortalGrowthModal.classList.add('visible');
    });
    awakeningTreeContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.awakening-upgrade-btn');
        if (button) {
            const statId = button.getAttribute('data-stat-id');
            if (statId) {
                upgradeAwakeningStat(statId);
            }
        }
    });
    skillsBtn.addEventListener('click', () => {
        renderSkillsModal();
        skillsModal.classList.add('visible');
        if (skillsModalInterval) clearInterval(skillsModalInterval);
        skillsModalInterval = setInterval(renderSkillsModal, 1000);
    });
    closeSkillsBtn.addEventListener('click', () => {
        if (skillsModalInterval) {
            clearInterval(skillsModalInterval);
            skillsModalInterval = null;
        }
        skillsModal.classList.remove('visible');
    });
    skillsTreeContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.skill-upgrade-btn');
        if (button) {
            const skillId = button.getAttribute('data-skill-id');
            if (skillId) {
                upgradeSkill(skillId);
            }
        }
    });
    startGameBtn.addEventListener('click', startGame);
    loadGameBtn.addEventListener('click', loadGame);
    characterSprite.addEventListener('click', (e) => handleTap(e, false));
    characterSprite.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleTap(e.touches[0], false);
    }, { passive: false });
    partnerSprite.addEventListener('click', (e) => handleTap(e, true));
    partnerSprite.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleTap(e.touches[0], true);
    }, { passive: false });
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('visible'));
    feedBtn.addEventListener('click', feed);
    dojoBtn.addEventListener('click', enterDojo);
    dojoExitBtn.addEventListener('click', exitDojo);
    dojoDummySprite.addEventListener('mousedown', startDojoSession);
    dojoDummySprite.addEventListener('mouseup', stopDojoSession);
    dojoDummySprite.addEventListener('mouseleave', stopDojoSession);
    dojoDummySprite.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDojoSession();
    }, { passive: false });
    dojoDummySprite.addEventListener('touchend', stopDojoSession);
    dojoDummySprite.addEventListener('touchcancel', stopDojoSession);
    gameScreen.addEventListener('click', (event) => {
        if (event.target.id === 'rewards-btn') {
            showRewardsModal();
        }
        if (event.target.id === 'toggle-modifiers-btn') {
            renderAndShowDetailedStats();
        }
    });
    closeRewardsBtn.addEventListener('click', () => rewardsModal.classList.remove('visible'));
    closeOfflineRewardsBtn.addEventListener('click', () => offlineRewardsModal.classList.remove('visible'));
    detailedStatsCloseBtn.addEventListener('click', () => {
        detailedStatsModal.classList.remove('visible');
    });
    battleBtn.addEventListener('click', startBattle);
    attackBtn.addEventListener('click', handlePlayerAttack);
    feedBattleBtn.addEventListener('click', feedInBattle);
    fleeBtn.addEventListener('click', () => endBattle(false));
    pvpBtn.addEventListener('click', enterPvpSelection);
    pvpSelectionBackBtn.addEventListener('click', () => showScreen('game-screen'));
    expeditionBtn.addEventListener('click', () => {
        generateAndShowExpeditions();
        showScreen('expedition-screen');
    });
    shopBtn.addEventListener('click', () => {
        updateShopUI();
        shopModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/shop' });
    });
    expeditionCancelBtn.addEventListener('click', () => {
        showScreen('game-screen');
        startGameGenesis();
    });
    ingameMenuBtn.addEventListener('click', () => {
        ingameMenuModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/menu' });
    });
    returnToGameBtn.addEventListener('click', () => {
        ingameMenuModal.classList.remove('visible');
    });
    saveGameBtn.addEventListener('click', () => saveGame(true));
    quitToTitleBtn.addEventListener('click', () => {
        ingameMenuModal.classList.remove('visible');
        showScreen('main-menu-screen');
    });
    inventoryBtn.addEventListener('click', () => {
        currentForgeSelectionTarget = null;
        updateInventoryUI();
        inventoryModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/inventory' });
    });
    closeInventoryBtn.addEventListener('click', () => {
        currentForgeSelectionTarget = null;
        inventoryModal.classList.remove('visible');
    });
    leaderboardBtn.addEventListener('click', () => {
        showLeaderboard('level');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/leaderboard' });
    });
    leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => showLeaderboard(tab.dataset.type));
    });
    closeLeaderboardBtn.addEventListener('click', () => {
        leaderboardModal.classList.remove('visible');
    });
    achievementsBtn.addEventListener('click', () => {
        updateAchievementsUI();
        achievementsModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/achievements' });
    });
    closeAchievementsBtn.addEventListener('click', () => {
        achievementsModal.classList.remove('visible');
    });
    ascensionBtn.addEventListener('click', () => {
        updatePerksUI();
        ascensionModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/ascension' });
    });
    closeAscensionBtn.addEventListener('click', () => {
        ascensionModal.classList.remove('visible');
    });
    confirmAscensionBtn.addEventListener('click', ascend);
    closeShopBtn.addEventListener('click', () => {
        shopModal.classList.remove('visible');
    });
    forgeBtn.addEventListener('click', () => {
        updateForgeUI();
        forgeModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/forge' });
    });
    closeForgeBtn.addEventListener('click', () => {
        forgeSlots = [null, null];
        forgeModal.classList.remove('visible');
    });
    autoForgeBtn.addEventListener('click', autoForge);
    forgeBtnAction.addEventListener('click', forgeItems);
    [forgeSlot1Div, forgeSlot2Div].forEach((slot, index) => {
        slot.addEventListener('click', () => {
            if (forgeSlots[index]) {
                forgeSlots[index] = null;
                updateForgeUI();
            } else {
                openInventoryForForgeSelection(index);
            }
        });
    });
    switchCharacterBtn.addEventListener('click', () => showScreen('partner-screen'));
    switchToMainBtn.addEventListener('click', () => showScreen('game-screen'));
    optionsBtn.addEventListener('click', () => {
        updateSettingsUI();
        optionsModal.classList.add('visible');
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/options' });
    });
    closeOptionsBtn.addEventListener('click', () => {
        saveGame();
        optionsModal.classList.remove('visible');
    });
    googleSigninBtn.addEventListener('click', () => {
        if (auth.currentUser) {
            signOut();
        } else {
            signInWithGoogle();
        }
    });
    muteAllCheckbox.addEventListener('change', (e) => {
        gameState.settings.isMuted = e.target.checked;
        updateSettingsUI();
    });
    musicVolumeSlider.addEventListener('input', (e) => {
        gameState.settings.musicVolume = parseFloat(e.target.value);
        updateSettingsUI();
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
        area.appendChild(flash);
        setTimeout(() => {
            flash.remove();
        }, 200);
    };
    characterSprite.addEventListener('click', handleVisualTap);
    characterSprite.addEventListener('touchstart', handleVisualTap, { passive: true });
    partnerSprite.addEventListener('click', handleVisualTap);
    partnerSprite.addEventListener('touchstart', handleVisualTap, { passive: true });
    growBtn.addEventListener('click', toggleGrowthMode);
    genesisArena.addEventListener('click', (e) => {
        if (!genesisState.isActive || !genesisState.player) return;

        const arenaRect = genesisArena.getBoundingClientRect();
        const clickX = e.clientX - arenaRect.left;
        const clickY = e.clientY - arenaRect.top;

        genesisState.player.manualDestination = { x: clickX, y: clickY };
    });

    toggleUiBtn.addEventListener('click', () => {
        isUiHidden = !isUiHidden;
        gameScreen.classList.toggle('ui-hidden', isUiHidden);
        toggleUiBtn.textContent = isUiHidden ? '👁️‍🗨️' : '👁️';
    });

    init();
});
