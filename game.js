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
      let currentForgeSelectionTarget = null;
      let partnerTimerInterval = null;
      const musicFileUrls = { main: 'main.mp3', battle: 'battle.mp3', expedition: 'expedition.mp3' };
      const musicManager = { isInitialized: false, audio: {}, currentTrack: null, fadeInterval: null };
      let tapCombo = { counter: 0, lastTapTime: 0, currentMultiplier: 1, frenzyTimeout: null };
      let expeditionInterval = null;
      let dojoState = { isActive: false, timerId: null, damageIntervalId: null, beamAnimationId: null, totalSessionDamage: 0 };
      // --- GENESIS ARENA STATE ---
      let genesisState = {
        isActive: false,
        gameLoopId: null,
        player: null,
        enemies: [],
        lootOrbs: [],
        
        // Endless Mode state
        lastEnemySpawn: 0,
        difficultyLevel: 1,
        lastDifficultyIncrease: 0,
        
        // NEW: Battle Mode state
        isBattleMode: false,
        currentWave: 0,
        totalWaves: 20,
        enemiesToSpawnThisWave: 0,
        enemiesSpawnedThisWave: 0,
        boss: null,
        waveTransitionActive: false,
        totalDamageDealtThisBattle: 0, // --- FIX: Added variable to track damage in battles.
      };
      
  
      // --- FIXED/MERGED ---: Added all missing constant data from the working file.
      const achievements = {
          tap100: { name: "Novice Tapper", desc: "Tap 100 times.", target: 100, unlocked: false, reward: { type: 'gold', amount: 500 } },
          tap1000: { name: "Adept Tapper", desc: "Tap 1,000 times.", target: 1000, unlocked: false, reward: { type: 'gold', amount: 2500 } },
          tap10000: { name: "Master Tapper", desc: "Tap 10,000 times.", target: 10000, unlocked: false, reward: { type: 'gold', amount: 10000 } },
          level10: { name: "Getting Stronger", desc: "Reach level 10.", target: 10, unlocked: false, reward: { type: 'item', rarity: 'uncommon' } },
          level25: { name: "Seasoned Guardian", desc: "Reach level 15.", target: 15, unlocked: false, reward: { type: 'item', rarity: 'rare' } },
          level50: { name: "True Champion", desc: "Reach the Ascension level.", target: 50, unlocked: false, reward: { type: 'gold', amount: 50000 } },
          defeat10: { name: "Slayer", desc: "Defeat 10 enemies.", target: 10, unlocked: false, reward: { type: 'gold', amount: 100 } },
          defeat100: { name: "Monster Hunter", desc: "Defeat 100 enemies.", target: 100, unlocked: false, reward: { type: 'gold', amount: 500 } },
          defeat500: { name: "Death Bringer", desc: "Defeat 500 enemies.", target: 500, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
          ascend1: { name: "New Beginning", desc: "Ascend for the first time.", target: 1, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
          ascend5: { name: "World Walker", desc: "Reach Ascension Tier 5.", target: 5, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
          battle1: { name: "Battle Runner", desc: "Complete a Battle sequence once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2000 } },
          forge1: { name: "Apprentice Blacksmith", desc: "Forge an item once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 750 } },
          findLegendary: { name: "A Glimmer of Power", desc: "Find your first Legendary item.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2500 } },
          masterGuardian: { name: "Master Guardian", desc: "Reach Ascension Tier 5 and Level 50.", target: 1, unlocked: false, reward: { type: 'egg' } }
      };
      const perks = {
          vigor: { name: "Guardian's Vigor", desc: "+10 Max HP & Energy per level.", maxLevel: 1000, cost: [1, 1, 2, 2, 3] },
          tapXp: { name: "Tapper's Insight", desc: "+10% XP from Taps per level.", maxLevel: 1000, cost: [1, 1, 2, 2, 3] },
          goldBoost: { name: "Fortune's Favor", desc: "+5% Gold from all sources per level.", maxLevel: 1000, cost: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] },
          expeditionSpeed: { name: "Expeditionary Leader", desc: "-5% Expedition Duration per level.", maxLevel: 1000, cost: [1, 2, 2, 3, 3] }
      };
      const itemData = {
        // We keep the old rarities for weights and affix counts
        rarities: { 
            common: { weight: 70, budget: 1, affixes: 1 }, 
            uncommon: { weight: 20, budget: 1.4, affixes: 2 }, 
            rare: { weight: 7, budget: 1.9, affixes: 2 }, 
            epic: { weight: 2.5, budget: 2.5, affixes: 3 }, 
            legendary: { weight: 0.5, budget: 3.5, affixes: 4 } 
        },
        // NEW: Tier-based color schemes
        rarityTiers: [ 'common', 'uncommon', 'rare', 'epic', 'legendary' ],
        weaponColors: ['#BDBDBD', '#4CAF50', '#FF9800', '#F44336', '#E91E63'], // Grey, Green, Orange, Red, Pink
        armorColors: ['#CD7F32', '#2196F3', '#9C27B0', '#FFC107', '#FFFFFF'], // Bronze, Blue, Purple, Gold, White
        types: { weapon: { base: ['Katana', 'Hammer', 'Axe', 'Knife'], primary: 'strength' }, armor: { base: ['Helmet', 'Jacket', 'Boots', 'Armor'], primary: 'fortitude' } },
        prefixes: { strength: 'Rusty', fortitude: 'Sturdy', agility: 'Swift', critChance: 'Deadly', goldFind: 'Lucky' },
        suffixes: { strength: 'of Death', fortitude: 'of the tank', agility: 'of the Viper', critChance: 'of Piercing', goldFind: 'of Greed' },
        affixes: ['agility', 'critChance', 'goldFind']
      };
      const shopItems = {
          storableHealthPotion: { name: "Health Potion", desc: "A storable potion for battle. Restores 50% HP.", cost: 550, type: 'consumable' },
          energyPotion: { name: "Energy Potion", desc: "Instantly restores 50% of your Max Energy.", cost: 500, type: 'consumable' },
          xpBoost: { name: "Scroll of Wisdom", desc: "+50% XP from all sources for 15 minutes.", cost: 500, type: 'buff', duration: 900 }
      };
      const permanentShopUpgrades = {
          strTraining: { name: "Strength Training", desc: "Permanently increases base Strength.", stat: 'strength', bonus: 1, levelReq: 10, maxLevel: 10000, cost: (level) => 1000 * Math.pow(2, level) },
          forTraining: { name: "Fortitude Training", desc: "Permanently increases base Fortitude.", stat: 'fortitude', bonus: 1, levelReq: 10, maxLevel: 10000, cost: (level) => 1000 * Math.pow(2, level) },
          agiTraining: { name: "Agility Training", desc: "Permanently increases base Agility.", stat: 'agility', bonus: 1, levelReq: 10, maxLevel: 5000, cost: (level) => 5000 * Math.pow(3, level) },
          energyTraining: { 
            name: "Energy Discipline", 
            desc: "Permanently increases Max Energy by 25.", 
            bonus: 25, 
            levelReq: 15, 
            maxLevel: 1000, 
            cost: (level) => 1500 * Math.pow(2.2, level) 
        }
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
      const reforgeNameData = {
          prefixes: ["Forged", "Tempered", "Masterwork", "Infused", "Runed", "Shaped"],
          bases: {
              weapon: ["Smasher", "Edge", "Cleaver", "Point", "Ripper", "Breaker"],
              armor: ["Bulwark", "Aegis", "Carapace", "Wall", "Guard", "Bastion"]
          },
          suffixes: ["of Power", "of Doom", "of Glory", "of the Forge", "of Titans"]
      };
      const dailyRewards = [
        { day: 1, type: 'gold', amount: 500 },
        { day: 2, type: 'gold', amount: 1000 },
        { day: 3, type: 'consumable', id: 'storableHealthPotion', amount: 2 },
        { day: 4, type: 'gold', amount: 2500 },
        { day: 5, type: 'consumable', id: 'energyPotion', amount: 5 },
        { day: 6, type: 'gold', amount: 5000 },
        { day: 7, type: 'item', rarity: 'rare' } // Day 7 is a rare item!
      ];
      const defaultState = {
          version: GAME_VERSION,
          playerName: "Guardian", tutorialCompleted: false, level: 1, xp: 0, gold: 0, healthPotions: 3,
          highestBattleLevelCompleted: 0,
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
          settings: { musicVolume: 0.5, sfxVolume: 1.0, isMuted: false, isAutoBattle: false }, dojoPersonalBest: 0,
          lastDailyClaim: 0,
          dailyStreak: 0 
      };
  
      const ASCENSION_LEVEL = 50;
      const BATTLE_UNLOCK_LEVEL = 20;
      const MAX_ENEMIES = 45;
      const FORGE_UNLOCK_LEVEL = 10;
      const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      
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
      const playerStatPanel = document.getElementById('player-stat-panel');
      const buffDisplay = document.getElementById('buff-display');
      const worldTierDisplay = document.getElementById('world-tier-display');
      const startGameBtn = document.getElementById('start-game-btn');
      const growBtn = document.getElementById('grow-btn');
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
      // --- DOJO ELEMENTS ---
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
      function createStarfield() { 
        const container = document.getElementById('background-stars'); 
        for(let i=0; i<100; i++) { 
            const star = document.createElement('div'); 
            star.className = 'star'; 
            const size = Math.random() * 2 + 1; 
            star.style.width = `${size}px`; 
            star.style.height = `${size}px`; 
            star.style.top = `${Math.random() * 100}%`; 
            star.style.left = `${Math.random() * 100}%`; 
            star.style.animationDuration = `${Math.random() * 50 + 25}s`; 
            star.style.animationDelay = `${Math.random() * 50}s`; 
            container.appendChild(star); 
        } 
    } // <--- This brace ENDS the createStarfield function.
    
    // The new function starts on a new line, AFTER createStarfield is finished.
    async function displayTopPlayersOnMenu() {
        const loadingText = document.getElementById('leaderboard-loading-text');
        try {
            const query = db.collection("leaderboard")
                .orderBy("tier", "desc")
                .limit(10);
            
            const snapshot = await query.get();
    
            if (snapshot.empty) {
                loadingText.textContent = "No Legends Have Risen Yet.";
                return;
            }
    
            let players = snapshot.docs.map(doc => doc.data());
    
            players.sort((a, b) => {
                if (a.tier > b.tier) return -1;
                if (a.tier < b.tier) return 1;
                return b.level - a.level;
            });
    
            const top3Players = players.slice(0, 3);
    
            top3Players.forEach((data, index) => {
                const rank = index + 1;
                const container = document.getElementById(`top-player-${rank}-container`);
                const sprite = document.getElementById(`top-player-${rank}-sprite`);
                const nameEl = document.getElementById(`top-player-${rank}-name`);
    
                if (container && sprite && nameEl) {
                    nameEl.textContent = data.name;
                    sprite.classList.remove('aura-level-10', 'aura-ascended');
                    let newAnimation = 'idle-breathe 4s ease-in-out infinite';
                    if (data.tier >= 3) {
                        sprite.classList.add('aura-ascended');
                        newAnimation = 'idle-breathe 2s ease-in-out infinite, super-aura-anim 1s ease-in-out infinite alternate';
                    } else if (data.level >= 10) {
                        sprite.classList.add('aura-level-10');
                        newAnimation = 'idle-breathe 4s ease-in-out infinite, aura-level-10-anim 2s ease-in-out infinite';
                    }
                    sprite.style.animation = newAnimation;
                    container.classList.add('visible');
                }
            });
            
            loadingText.style.display = 'none';
    
        } catch (error) {
            console.error("Error fetching top players:", error);
            loadingText.textContent = "Could not load leaderboard.";
        }
    } // <--- This brace ENDS the displayTopPlayersOnMenu function.
    
    function showScreen(screenId) { 
        screens.forEach(s => s.classList.remove('active')); 
        const screenToShow = document.getElementById(screenId);
        if(screenToShow) screenToShow.classList.add('active'); 
    
        if (screenId !== 'game-screen' && genesisState.isActive) {
            stopGameGenesis();
        }
    
        if (screenId === 'battle-screen') { playMusic('battle'); } 
        else if (screenId === 'game-screen' || screenId === 'main-menu-screen' || screenId === 'partner-screen') { 
            if (!gameState.expedition || !gameState.expedition.active) { playMusic('main'); } 
        }
        let virtualPagePath = '/' + screenId.replace('-screen', '');
        gtag('config', 'G-4686TXHCHN', { 'page_path': virtualPagePath });
    }
      
      // --- FIXED/MERGED ---: Integrated init with Auth logic.
      function init() { 
          displayTopPlayersOnMenu();
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
          startGameGenesis();
          checkWeeklyRewards();
          checkDailyRewards(); 
          await saveGame(); 
      }
  
      function rehydrateItemRarity(item) {
        if (!item) return null;
        // Fix for rarity object structure
        if (typeof item.rarity === 'string') {
            const rarityKey = item.rarity;
            const rarityIndex = itemData.rarityTiers.indexOf(rarityKey);
            if (rarityIndex > -1) {
                item.rarity = {
                    key: rarityKey,
                    color: item.type === 'weapon' ? itemData.weaponColors[rarityIndex] : itemData.armorColors[rarityIndex]
                };
            }
        }
        return item;
    }
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
              loadedState.highestBattleLevelCompleted = loadedState.highestBattleLevelCompleted || 0;
              loadedState.dojoPersonalBest = loadedState.dojoPersonalBest || 0;
              loadedState.lastDailyClaim = loadedState.lastDailyClaim || 0;
              loadedState.dailyStreak = loadedState.dailyStreak || 0;
              if (loadedState.equipment.weapon) {
                  rehydrateItemRarity(loadedState.equipment.weapon);
              }
              if (loadedState.equipment.armor) {
                  rehydrateItemRarity(loadedState.equipment.armor);
              }
              if (loadedState.inventory && Array.isArray(loadedState.inventory)) {
                  loadedState.inventory = loadedState.inventory.map(item => rehydrateItemRarity(item));
              }
              
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
              startGameGenesis(); 
              checkWeeklyRewards();
              checkDailyRewards();
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
      function formatNumber(num) {
        if (num < 1000) return num.toString(); // Return as is if less than 1000
        const suffixes = ["", "K", "M", "B", "T"]; // K for thousand, M for million, etc.
        const i = Math.floor(Math.log(num) / Math.log(1000));
        let formattedNum = (num / Math.pow(1000, i)).toFixed(2);
        
        // Remove trailing .00 if it exists
        if (formattedNum.endsWith('.00')) {
          formattedNum = formattedNum.slice(0, -3);
        }
        
        return formattedNum + suffixes[i];
      }
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
          let energyUpgradeBonus = 0;
          if (gameState.permanentUpgrades.energyTraining) {
              const upgradeLevel = gameState.permanentUpgrades.energyTraining;
              const upgradeData = permanentShopUpgrades.energyTraining;
              energyUpgradeBonus = upgradeLevel * upgradeData.bonus;
          }
          gameState.resources.maxHp = baseMaxHp + vigorBonus;
          gameState.resources.maxEnergy = baseMaxEnergy + vigorBonus + energyUpgradeBonus;
          playerNameLevel.textContent = `${gameState.playerName} Lv. ${gameState.level}`;
          worldTierDisplay.textContent = `World Tier: ${gameState.ascension.tier}`;
          const xpForNext = getXpForNextLevel(gameState.level);
          healthBarFill.style.width = `${(gameState.resources.hp / gameState.resources.maxHp) * 100}%`;
          healthBarLabel.textContent = `HP: ${Math.floor(gameState.resources.hp)} / ${gameState.resources.maxHp}`;
          energyBarFill.style.width = `${(gameState.resources.energy / gameState.resources.maxEnergy) * 100}%`;
          energyBarLabel.textContent = `Energy: ${Math.floor(gameState.resources.energy)} / ${gameState.resources.maxEnergy}`;
          
          // --- THIS LINE WAS MISSING ---
          xpBarFill.style.width = `${(gameState.xp / xpForNext) * 100}%`;
          // --- END OF FIX ---

          xpBarLabel.textContent = `XP: ${formatNumber(Math.floor(gameState.xp))} / ${formatNumber(xpForNext)}`;
          
          const defaultStatColor = 'var(--text-color)';
          const statColors = {};
          const statSourceRarityIndex = {};
            
          const statKeys = ['strength', 'fortitude', 'agility', 'stamina', 'critChance', 'goldFind'];
          statKeys.forEach(key => {
              statColors[key] = defaultStatColor;
              statSourceRarityIndex[key] = -1;
          });

          for (const slot in gameState.equipment) {
              const item = gameState.equipment[slot];
              if (item) {
                  const itemRarityIndex = RARITY_ORDER.indexOf(item.rarity.key);
                  for (const statName in item.stats) {
                        if (statSourceRarityIndex.hasOwnProperty(statName) && itemRarityIndex > statSourceRarityIndex[statName]) {
                            statSourceRarityIndex[statName] = itemRarityIndex;
                            statColors[statName] = item.rarity.color;
                        }
                    }
              }
          }
            
          let panelHtml = '';
          const createStatRow = (label, value, statKey) => {
            const color = statColors[statKey] || defaultStatColor;
            const starIcon = color !== defaultStatColor ? '<span class="equipped-icon">⭐</span>' : '';
            const extraClass = (statKey === 'gold') ? 'stat-value-gold' : '';

            return `
                <div class="stat-item">
                    <span class="stat-label">${label}</span>
                    <span class="stat-value ${extraClass}" style="color: ${color};">${value} ${starIcon}</span>
                </div>
            `;
          };

          panelHtml += createStatRow('STR', getTotalStat('strength'), 'strength');
          panelHtml += createStatRow('FOR', getTotalStat('fortitude'), 'fortitude');
          panelHtml += createStatRow('AGI', getTotalStat('agility'), 'agility');
          panelHtml += createStatRow('STA', getTotalStat('stamina'), 'stamina');
          panelHtml += '<hr class="stat-divider">';
          panelHtml += createStatRow('Crit %', `${getTotalStat('critChance').toFixed(2)}%`, 'critChance');
          panelHtml += createStatRow('Gold %', `${getTotalStat('goldFind').toFixed(2)}%`, 'goldFind');
          panelHtml += '<hr class="stat-divider">';
          panelHtml += `
          <div class="stat-item">
              <span class="stat-label">Gold</span>
              <div class="gold-rewards-row">
                  <span class="stat-value stat-value-gold">${formatNumber(Math.floor(gameState.gold))}</span>
                  <span class="potion-display">
                      <span>🧪</span>
                      <span>${gameState.healthPotions || 0}</span>
                  </span>
                  <button id="rewards-btn" title="View Daily & Weekly Rewards">📅</button>
              </div>
          </div>
        `;

        playerStatPanel.innerHTML = panelHtml;
        updateBuffDisplay();
        const onExpedition = gameState.expedition.active;
        characterSprite.style.display = onExpedition ? 'none' : 'block';
        expeditionTimerDisplay.style.display = onExpedition ? 'block' : 'none';
        windAnimationContainer.style.display = onExpedition ? 'block' : 'none';
  
        const canUseBattle = gameState.level >= BATTLE_UNLOCK_LEVEL;
        battleBtn.disabled = onExpedition || !canUseBattle;
        battleUnlockText.textContent = canUseBattle ? "" : `Unlocks at LVL ${BATTLE_UNLOCK_LEVEL}`;
        if (canUseBattle) {
            battleBtn.textContent = `Battle (Lvl ${gameState.highestBattleLevelCompleted + 1})`;
        } else {
            battleBtn.textContent = 'Battle';
        }                
        const canUseForge = gameState.level >= FORGE_UNLOCK_LEVEL;
        forgeBtn.disabled = onExpedition || !canUseForge;
        forgeUnlockText.textContent = canUseForge ? "" : `Unlocks at LVL ${FORGE_UNLOCK_LEVEL}`;
        if (ascensionBtn) {
          if (gameState.level >= ASCENSION_LEVEL || gameState.ascension.tier > 1) {
              ascensionBtn.style.display = 'block';
          } else {
              ascensionBtn.style.display = 'none';
          }
        }
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
        const xpOver = character.xp - getXpForNextLevel(character.level);
        character.level++;
        character.xp = xpOver;
        character.stats.strength += 2;
        character.stats.agility += 2;
        character.stats.fortitude += 1;
        character.stats.stamina += 1;
        character.resources.maxHp += 10;
        character.resources.hp = character.resources.maxHp;
        character.resources.maxEnergy += 5;
        character.resources.energy = character.resources.maxEnergy;
        
        playSound('levelUp', 1, 'triangle', 440, 880);
        triggerScreenShake(400);
    
        if (character.isPartner) {
            showToast(`${character.name || 'Partner'} is now Level ${character.level}!`);
        }
        else {
            checkAllAchievements();
            submitScoreToLeaderboard();
            updateAscensionVisuals();
    
            let screenX, screenY;
            if (genesisState.isActive && genesisState.player) {
                const arenaRect = genesisArena.getBoundingClientRect();
                screenX = arenaRect.left + genesisState.player.x;
                screenY = arenaRect.top + genesisState.player.y - 50;
            }
            else {
                const spriteRect = characterSprite.getBoundingClientRect();
                screenX = spriteRect.left + (spriteRect.width / 2);
                screenY = spriteRect.top; // Position it at the top of the sprite
            }
            createFloatingText('LEVEL UP!', screenX, screenY, { 
                color: 'var(--accent-color)',
                fontSize: '2.5em',
                duration: 2500
            });
        }
        
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
    
        // --- NEW ENHANCED VISUALS ---
        // 1. Scaled Screen Shake: The shake gets longer and more intense with higher combos.
        const shakeDuration = Math.min(800, 200 + (tapCombo.currentMultiplier * 5));
        triggerScreenShake(shakeDuration);

        // 2. More Particles: Burst more particles as the combo grows.
        createParticles({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
        if (tapCombo.currentMultiplier > 30) {
            createParticles({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
        }

        // 3. Screen Flash for huge combos
        if (tapCombo.currentMultiplier >= 100) {
            triggerScreenFlash();
        }
        // --- END OF ENHANCED VISUALS ---

        updateFrenzyVisuals(); 
        tapCombo.frenzyTimeout = setTimeout(deactivateFrenzy, 7000);
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
          orbContainer.innerHTML = `<div class="xp-orb"></div><div class="xp-orb-text">+${formatNumber(xpGain)}</div>`;
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
              if (Math.random() < 0.005) {
                createXpBubble();
              }
              if (gameState.resources.energy <= 0) return;
              gameState.counters.taps = (gameState.counters.taps || 0) + 1; checkAllAchievements();
              playSound('tap', 0.5, 'square', 150, 100, 0.05); const now = Date.now();
              if (now - tapCombo.lastTapTime < 1500) { tapCombo.counter++; } else { tapCombo.counter = 1; }
              tapCombo.lastTapTime = now;
              if (tapCombo.counter > 0 && tapCombo.counter % 5 === 0) { if (Math.random() < 0.60) { activateFrenzy(); } }
              if (Math.random() < 0.1) { triggerScreenShake(150); }
              let xpGain = 0.25 * tapCombo.currentMultiplier;
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
                      scoreText = `Damage: ${formatNumber(data.totalDamage)}`;
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
          const itemTypeKey = Math.random() < 0.5 ? 'weapon' : 'armor'; // Define the type first
          const rarityIndex = itemData.rarityTiers.indexOf(chosenRarityKey);
          const itemColor = itemTypeKey === 'weapon' ? itemData.weaponColors[rarityIndex] : itemData.armorColors[rarityIndex]; // Now we can use the type to get the color
          const itemType = itemData.types[itemTypeKey];
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
          return { type: itemTypeKey, name: `${namePrefix} ${baseName} ${nameSuffix}`.trim(), rarity: { key: chosenRarityKey, color: itemColor }, stats: stats, power: power, reforgeCount: 0 };
      }
      
      function equipItem(itemToEquip) {
          const itemIndex = gameState.inventory.findIndex(i => i && i.name === itemToEquip.name);
          if (itemIndex === -1) return;
          gameState.equipment[itemToEquip.type] = itemToEquip;
          updateUI(); saveGame();
      }
      
      function updateInventoryUI() {
        const weaponsContainer = document.getElementById('inventory-weapons');
        const armorContainer = document.getElementById('inventory-armor');
        weaponsContainer.innerHTML = '';
        armorContainer.innerHTML = '';
    
        const weapons = gameState.inventory.filter(i => i && i.type === 'weapon').sort((a,b) => b.power - a.power);
        const armors = gameState.inventory.filter(i => i && i.type === 'armor').sort((a,b) => b.power - a.power);
  
        const buildItemHtml = (item) => {
            let statsHtml = '';
            for (const stat in item.stats) {
                const value = item.stats[stat];
                const suffix = (stat === 'critChance' || stat === 'goldFind') ? '%' : '';
                statsHtml += `<div>+${value}${suffix} ${stat.charAt(0).toUpperCase() + stat.slice(1)}</div>`;
            }
        
            let actionButtonHtml = '';
  
            if (currentForgeSelectionTarget !== null) {
                actionButtonHtml = `<button onclick="selectItemForForge('${item.name}')">Select</button>`;
            } else {
                const isEquipped = gameState.equipment[item.type] && gameState.equipment[item.type].name === item.name;
                actionButtonHtml = isEquipped 
                    ? '<button disabled>Equipped</button>' 
                    : `<button onclick="equipItemByName('${item.name}')">Equip</button>`;
            }
  
            return `
                <div class="inventory-item">
                    <div class="inventory-item-info">
                        <strong style="color:${item.rarity.color}">${item.name}</strong>
                        <div class="item-stats">${statsHtml}Reforged: ${item.reforgeCount}/3</div>
                    </div>
                    ${actionButtonHtml}
                </div>
            `;
        };
  
        weapons.forEach(item => weaponsContainer.innerHTML += buildItemHtml(item));
        armors.forEach(item => armorContainer.innerHTML += buildItemHtml(item));
    }
    function equipItemByName(itemName) {
        const itemToEquip = gameState.inventory.find(i => i.name === itemName);
        if (itemToEquip) {
            equipItem(itemToEquip);
            updateInventoryUI(); 
        }
    }


    function selectItemForForge(itemName) {
        const item = gameState.inventory.find(i => i.name === itemName);
        if (!item) return;

        const otherSlotIndex = currentForgeSelectionTarget === 0 ? 1 : 0;
        const otherItem = forgeSlots[otherSlotIndex];
        if (otherItem && otherItem.name === item.name) {
            showToast("Item is already in the other slot.");
            return;
        }
        if (otherItem && otherItem.type !== item.type) {
            showToast("Items must be the same type (weapon/armor).");
            return;
        }

        forgeSlots[currentForgeSelectionTarget] = item;
        currentForgeSelectionTarget = null; 
        inventoryModal.classList.remove('visible');
        forgeModal.classList.add('visible');
        updateForgeUI();
    }

    window.equipItemByName = equipItemByName;
    window.selectItemForForge = selectItemForForge;
  
      function generateAndShowExpeditions() {
          availableExpeditions = [];
          expeditionListContainer.innerHTML = '';
          for (let i = 0; i < 5; i++) {
              const action = expeditionData.actions[Math.floor(Math.random() * expeditionData.actions.length)];
              const location = expeditionData.locations[Math.floor(Math.random() * expeditionData.locations.length)];
              const modKeys = Object.keys(expeditionData.modifiers);
              const modKey = modKeys[Math.floor(Math.random() * modKeys.length)];
              const modifier = expeditionData.modifiers[modKey];
              const duration = (Math.floor(Math.random() * 10) + 20) * 60;

              const expedition = {
                  name: `${action} ${location}`,
                  description: modifier.description,
                  duration: duration,
                  modifiers: {
                      goldMod: modifier.goldMod ?? 1,
                      itemMod: modifier.itemMod ?? 1,
                      xpMod: modifier.xpMod ?? 1
                  },
                  index: i
              };
  
              availableExpeditions.push(expedition);
              const itemEl = document.createElement('div');
              itemEl.className = 'expedition-item';
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
      function triggerScreenFlash() {
        const flashOverlay = document.getElementById('screen-flash-overlay');
        flashOverlay.classList.add('flash');
        // The animation is short, so we use a timeout to remove the class
        setTimeout(() => {
            flashOverlay.classList.remove('flash');
        }, 300);
      }
      function createXpBubble() {
        if (document.querySelector('.xp-bubble')) return; // Only one bubble at a time

        const container = document.getElementById('floating-rewards-container');
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'xp-bubble';
        bubbleEl.innerHTML = 'XP<span></span><span></span><span></span><span></span><span></span>';

        // Randomize the animation slightly to make it less predictable
        bubbleEl.style.animationDuration = `${12 + Math.random() * 6}s`;

        bubbleEl.onclick = () => {
            if (bubbleEl.classList.contains('popped')) return;

            // Grant a large, random amount of XP
            const reward = Math.floor(getXpForNextLevel(gameState.level) * (Math.random() * 0.15 + 0.05)); // 5% to 20% of next level's XP
            addXP(gameState, reward);
            showToast(`+${reward} XP!`);
            playSound('feed', 1, 'sine', 400, 800, 0.2); // A nice "collect" sound

            // Pop effect and removal
            bubbleEl.classList.add('popped');
            setTimeout(() => {
                if (bubbleEl) bubbleEl.remove();
            }, 200);
        };

        container.appendChild(bubbleEl);

        // Remove the bubble if it's ignored after its animation finishes
        setTimeout(() => {
            if (bubbleEl && !bubbleEl.classList.contains('popped')) {
                bubbleEl.remove();
            }
        }, parseFloat(bubbleEl.style.animationDuration) * 1000);
      }
      function createFloatingText(text, x, y, options = {}) {
        // Set default values for options if they aren't provided
        const { color = 'white', fontSize = '1.2em', duration = 1500 } = options;
    
        const textEl = document.createElement('div');
        textEl.className = 'floating-text';
        textEl.textContent = text;
        
        // Apply styles
        textEl.style.left = `${x}px`;
        textEl.style.top = `${y}px`;
        textEl.style.color = color;
        textEl.style.fontSize = fontSize;
        
        // Add the element to the page
        document.body.appendChild(textEl);
    
        // Automatically remove the element after its animation is done
        setTimeout(() => {
            textEl.remove();
        }, duration);
    }
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
          if (confirmAscensionBtn) {
              confirmAscensionBtn.textContent = `Ascend to World Tier ${gameState.ascension.tier + 1} (1 AP)`;
              confirmAscensionBtn.disabled = gameState.level < ASCENSION_LEVEL; }
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
              const buyBtn = document.createElement('button'); buyBtn.textContent = `Buy (${formatNumber(itemData.cost)} G)`;
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
              else { const cost = upgradeData.cost(currentLevel); buyBtn.textContent = `Upgrade (${formatNumber(Math.floor(cost))} G)`; if (gameState.gold < cost) { buyBtn.disabled = true; } buyBtn.onclick = () => buyShopItem(upgradeId, 'permanent'); }
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
                      case 'storableHealthPotion': gameState.healthPotions = (gameState.healthPotions || 0) + 1; break;
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
  
          const randomPrefix = reforgeNameData.prefixes[Math.floor(Math.random() * reforgeNameData.prefixes.length)];
          const randomBaseList = item1.type === 'weapon' ? reforgeNameData.bases.weapon : reforgeNameData.bases.armor;
          const randomBase = randomBaseList[Math.floor(Math.random() * randomBaseList.length)];
          const randomSuffix = reforgeNameData.suffixes[Math.floor(Math.random() * reforgeNameData.suffixes.length)];
          const newName = `${randomPrefix} ${randomBase} ${randomSuffix}`;
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
              partnerHealthBarLabel.textContent = `HP: ${formatNumber(Math.floor(partner.resources.hp))} / ${formatNumber(partner.resources.maxHp)}`;

              partnerEnergyBarFill.style.width = `${(partner.resources.energy / partner.resources.maxEnergy) * 100}%`;
              partnerEnergyBarLabel.textContent = `Energy: ${formatNumber(Math.floor(partner.resources.energy))} / ${formatNumber(partner.resources.maxEnergy)}`;
              
              partnerXpBarFill.style.width = `${(partner.xp / xpForNext) * 100}%`;
              partnerXpBarLabel.textContent = `XP: ${formatNumber(Math.floor(partner.xp))} / ${formatNumber(xpForNext)}`;
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
              // FIX #1: Read from the new, public "gameConfig" collection instead of the protected "admin" collection.
              const rewardDocRef = db.collection("gameConfig").doc("weeklyReward");
              const rewardDoc = await rewardDocRef.get();
              const weekInMs = 7 * 24 * 60 * 60 * 1000;
              const now = Date.now();
              
              // This logic now correctly checks if the document exists AND if the reward period has passed.
              if (rewardDoc.exists && now > rewardDoc.data().nextRewardTime) {
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
                  
                  // FIX #2: REMOVED the insecure line that tried to write to the database.
                  // The client is no longer allowed to (and shouldn't) reset the timer for everyone.
                  // const nextTime = now + weekInMs;
                  // await rewardDocRef.set({ nextRewardTime: nextTime });
              }
          } catch(e) { console.error("Could not check weekly rewards:", e); }
      }
      // Helper function to check if two timestamps are on different calendar days
      function isNewDay(lastClaimTimestamp) {
        if (lastClaimTimestamp === 0) return true; // First time ever
        const now = new Date();
        const lastClaim = new Date(lastClaimTimestamp);
        // Compare year, month, and date. Ignore the time.
        return now.getFullYear() > lastClaim.getFullYear() ||
               now.getMonth() > lastClaim.getMonth() ||
               now.getDate() > lastClaim.getDate();
      }

      function checkDailyRewards() {
        if (!isNewDay(gameState.lastDailyClaim)) {
            // It's not a new day, so do nothing.
            return;
        }

        const now = new Date();
        const lastClaim = new Date(gameState.lastDailyClaim);
        
        // Check if the streak is broken (logged in more than a day ago)
        const oneDay = 24 * 60 * 60 * 1000;
        if (now.getTime() - lastClaim.getTime() > (2 * oneDay)) {
            gameState.dailyStreak = 0; // Reset streak
        }

        // Increment streak and get the reward
        gameState.dailyStreak++;
        
        // Use modulo to loop rewards after Day 7
        const rewardIndex = (gameState.dailyStreak - 1) % dailyRewards.length;
        const reward = dailyRewards[rewardIndex];

        let rewardText = "";
        let rewardTitle = `Daily Login: Day ${gameState.dailyStreak}`;

        // Grant the reward based on its type
        switch (reward.type) {
            case 'gold':
                gameState.gold += reward.amount;
                rewardText = `You received ${reward.amount} Gold!`;
                break;
            case 'consumable':
                if (reward.id === 'storableHealthPotion') {
                    gameState.healthPotions = (gameState.healthPotions || 0) + reward.amount;
                }
                // We can add more consumable types here later
                rewardText = `You received ${reward.amount}x ${shopItems[reward.id].name}!`;
                break;
            case 'item':
                const newItem = generateItem(reward.rarity);
                gameState.inventory.push(newItem);
                rewardText = `You received a special item: <strong style="color:${newItem.rarity.color}">${newItem.name}</strong>!`;
                break;
        }

        showNotification(rewardTitle, `${rewardText}<br><br>Come back tomorrow for your next reward!`);
        playSound('victory', 0.8, 'triangle', 600, 1200, 0.3);

        // Update the claim time and save
        gameState.lastDailyClaim = Date.now();
        saveGame();
        updateUI();
      }

      function showRewardsModal() {
        // 1. Populate Daily Rewards
        dailyRewardsContainer.innerHTML = ''; // Clear previous content
        const canClaimToday = isNewDay(gameState.lastDailyClaim);
    
        dailyRewards.forEach(reward => {
            const itemEl = document.createElement('div');
            itemEl.className = 'reward-item';
    
            // Determine the state of the reward
            if (reward.day < gameState.dailyStreak) {
                itemEl.classList.add('claimed');
            } else if (reward.day === gameState.dailyStreak && canClaimToday) {
                itemEl.classList.add('claimable');
            }
    
            // Create the description text
            let desc = '';
            switch (reward.type) {
                case 'gold':
                    desc = `${reward.amount.toLocaleString()} Gold`;
                    break;
                case 'consumable':
                    desc = `${reward.amount}x ${shopItems[reward.id].name}`;
                    break;
                case 'item':
                    desc = `1x ${reward.rarity.charAt(0).toUpperCase() + reward.rarity.slice(1)} Item`;
                    break;
            }
    
            itemEl.innerHTML = `<div class="day-label">Day ${reward.day}</div><div class="reward-desc">${desc}</div>`;
            dailyRewardsContainer.appendChild(itemEl);
        });
    
        // 2. Populate Weekly Reward Info
        weeklyRewardsContainer.innerHTML = `<p>Be #1 on the Damage Leaderboard at the end of the week to earn a special <strong>Legendary</strong> item!</p>`;
    
        // 3. Show the modal
        rewardsModal.classList.add('visible');
    }

// =======================================================
// --- DOJO SYSTEM (FINAL, CORRECTED VERSION) ---
// =======================================================
const DOJO_DAMAGE_MULTIPLIER = 233;
function enterDojo() {
    showScreen('dojo-screen');
    dojoSessionTotalDisplay.textContent = "";
    dojoTimerBarContainer.style.visibility = 'hidden';

    // Resize canvas to match its display size
    dojoLightningCanvas.width = dojoLightningCanvas.clientWidth;
    dojoLightningCanvas.height = dojoLightningCanvas.clientHeight;
    
    // Update the personal best display when entering
    updateDojoUI();
}

function exitDojo() {
    // Make sure to stop any running session if the user exits prematurely
    if (dojoState.isActive) {
        stopDojoSession();
    }
    showScreen('game-screen');
    startGameGenesis();
}

function updateDojoUI() {
    dojoPersonalBestDisplay.textContent = `Personal Best: ${formatNumber(Math.floor(gameState.dojoPersonalBest))}`;
}

function startDojoSession() {
    if (dojoState.isActive) return;

    dojoState = {
        isActive: true,
        timerId: null,
        damageIntervalId: null,
        beamAnimationId: null,
        totalSessionDamage: 0,
        timeLeft: 7.0
    };

    // Reset and show UI
    dojoTimerBarContainer.style.visibility = 'visible';
    dojoSessionTotalDisplay.textContent = formatNumber(0);
    playSound('ascend', 0.5, 'sawtooth', 100, 500, 0.5); // Power-up sound
    dojoDummySprite.classList.add('zapped'); // Apply zapped effect

    // Start the visual beam
    startDojoBeam();

    // Start the main countdown timer (updates the bar)
    dojoState.timerId = setInterval(() => {
        dojoState.timeLeft -= 0.1;
        
        const percentage = (dojoState.timeLeft / 7.0) * 100;
        dojoTimerBarFill.style.width = `${percentage}%`;
        dojoTimerBarLabel.textContent = `${dojoState.timeLeft.toFixed(1)}s`;

        if (dojoState.timeLeft <= 0) {
            stopDojoSession();
        }
    }, 100);

    // Start the damage dealer (ticks faster than the timer for rapid numbers)
    dojoState.damageIntervalId = setInterval(() => {
        const isCrit = Math.random() < (getTotalStat('critChance') / 100);
        const baseDamage = getTotalStat('strength') * (Math.random() * 0.4 + 0.8); // 80% to 120% of STR
        const damage = Math.floor(baseDamage * (isCrit ? 2.5 : 1) * DOJO_DAMAGE_MULTIPLIER); // Crits do 2.5x
        
        dojoState.totalSessionDamage += damage;
        
        createDojoDamageNumber(damage, isCrit);
        dojoSessionTotalDisplay.textContent = formatNumber(Math.floor(dojoState.totalSessionDamage));
        playSound('tap', 0.3, 'square', 200, 150, 0.05); // Rapid hit sound
    }, 150);
}

async function stopDojoSession() {
    if (!dojoState.isActive) return;

    // Stop all intervals and animations
    clearInterval(dojoState.timerId);
    clearInterval(dojoState.damageIntervalId);
    stopDojoBeam();
    dojoDummySprite.classList.remove('zapped'); // Remove zapped effect

    dojoState.isActive = false;
    dojoTimerBarContainer.style.visibility = 'hidden';
    
    // Check for a new personal best
    if (dojoState.totalSessionDamage > gameState.dojoPersonalBest) {
        gameState.dojoPersonalBest = dojoState.totalSessionDamage;
        showToast("New Personal Best!");
        playSound('victory', 1, 'triangle', 523, 1046, 0.4);
        updateDojoUI(); // Update the display immediately
        
        // Try to submit the new score to the damage leaderboard
        try {
            await db.collection("damageLeaderboard").doc(gameState.playerName).set({
                name: gameState.playerName,
                totalDamage: Math.floor(gameState.dojoPersonalBest)
            }, { merge: true });
            showToast("New score submitted to leaderboard!");
        } catch(e) {
            console.error("Failed to submit damage score", e);
        }

        saveGame();
    }
}
function applyDamageToEnemy(enemy, damageAmount, isCrit = false) {
    if (!enemy || enemy.hp <= 0) return false; // Don't damage already dead enemies

    const finalDamage = Math.floor(damageAmount);
    enemy.hp -= finalDamage;
    genesisState.totalDamageDealtThisBattle += finalDamage;

    const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    if (enemy.healthBarFill) enemy.healthBarFill.style.width = `${hpPercent}%`;

    const textEl = document.createElement('div');
    textEl.className = 'enemy-damage-text';
    textEl.textContent = formatNumber(finalDamage);
    textEl.style.left = `${enemy.x}px`;
    textEl.style.top = `${enemy.y - 20}px`;
    textEl.style.color = isCrit ? 'var(--xp-color)' : '#ff4136';

    if (isCrit) {
        textEl.style.fontSize = '1.8em';
        textEl.style.fontWeight = '900';
    } else {
        textEl.style.fontSize = '1.2em';
    }

    genesisArena.appendChild(textEl);
    setTimeout(() => textEl.remove(), 1200);

    // --- NEW UNIFIED DEATH LOGIC ---
    if (enemy.hp <= 0) {
        addXP(gameState, 5 * (genesisState.isBattleMode ? (gameState.highestBattleLevelCompleted + 1) : gameState.level));
        createLootOrb(enemy.x, enemy.y); // This function correctly handles not dropping loot in battle mode
        
        // Remove the visuals from the game
        if (enemy.element) enemy.element.remove();
        if (enemy.healthBarContainer) enemy.healthBarContainer.remove();

        return true; // The enemy was defeated
    }
    
    return false; // The enemy survived
}

function createDojoDamageNumber(amount, isCrit) {
    const num = document.createElement('div');
    num.textContent = amount.toLocaleString();
    num.className = 'damage-text player-damage'; // Use existing player damage style
    if (isCrit) {
        num.classList.add('crit');
    }
    // Position it over the dummy
    num.style.top = '40%';
    num.style.left = `${45 + Math.random() * 10}%`;
    
    document.getElementById('dojo-arena').appendChild(num);
    
    // Animate and remove
    setTimeout(() => {
        num.style.transform = `translateY(-${80 + Math.random() * 40}px)`; // Vary the float height
        num.style.opacity = '0';
    }, 10);
    setTimeout(() => { num.remove(); }, 800);
}

// --- Beam/Lightning Canvas Animation (UPGRADED) ---
function startDojoBeam() {
    if (dojoState.beamAnimationId) cancelAnimationFrame(dojoState.beamAnimationId);

    function drawBeam() {
        const canvas = dojoLightningCanvas;
        const ctx = dojoCanvasCtx;
        const canvasRect = canvas.getBoundingClientRect();
        const dummyRect = dojoDummySprite.getBoundingClientRect();
        const startX = canvas.width / 2;
        const startY = canvas.height;
        const endX = (dummyRect.left + dummyRect.width / 2) - canvasRect.left;
        const endY = (dummyRect.top + dummyRect.height / 2) - canvasRect.top;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawLightningSegment(ctx, startX, startY, endX, endY, 'rgba(0, 255, 255, 0.2)', 30, 25);
        drawLightningSegment(ctx, startX, startY, endX, endY, 'rgba(255, 255, 255, 0.5)', 15, 20);
        drawLightningSegment(ctx, startX, startY, endX, endY, '#FFFFFF', 5, 15);
        dojoState.beamAnimationId = requestAnimationFrame(drawBeam);
    }
    drawBeam();
}

function stopDojoBeam() {
    if (dojoState.beamAnimationId) {
        cancelAnimationFrame(dojoState.beamAnimationId);
        dojoState.beamAnimationId = null;
    }
    dojoCanvasCtx.clearRect(0, 0, dojoLightningCanvas.width, dojoLightningCanvas.height);
}

function drawLightningSegment(ctx, x1, y1, x2, y2, color, lineWidth, jaggedness) {
    const segments = 20;
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;

    ctx.beginPath();
    ctx.moveTo(x1, y1);

    for (let i = 1; i < segments; i++) {
        const midX = x1 + dx * i;
        const midY = y1 + dy * i;
        const offsetX = (Math.random() - 0.5) * jaggedness * (1 - (i/segments));
        const offsetY = (Math.random() - 0.5) * jaggedness * (1 - (i/segments));
        ctx.lineTo(midX + offsetX, midY + offsetY);
    }
    ctx.lineTo(x2, y2);

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = 'cyan';
    ctx.shadowBlur = 20;
    ctx.stroke();
    
    ctx.shadowBlur = 0; 
}
      
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
          potionCountDisplay.textContent = `Potions: ${(gameState.healthPotions || 0) - battleState.potionsUsedThisBattle}`;
      }
        // =======================================================
        // --- GENESIS ARENA SYSTEM (FINAL, ROCK-SOLID FIX) ---
        // =======================================================

        function clamp(value, min, max) {
            return Math.max(min, Math.min(value, max));
        }

        function startGameGenesis() {
            if (genesisState.isActive) return;

            genesisArena.style.display = 'block';
            characterArea.style.display = 'none';

            console.log("Starting Genesis Arena...");
            genesisState.isActive = true;

            const playerEl = document.createElement('img');
            playerEl.src = 'player.PNG';
            playerEl.className = 'genesis-player';
            genesisArena.appendChild(playerEl);

            genesisState.player = {
                element: playerEl,
                x: 0, 
                y: 0,
                isInitialized: false,
                speed: 5,
                width: 80,
                height: 80,
                attackRange: 70,
                //attackCooldown: 300, //
                lastAttackTime: 0,
                target: null,
                manualDestination: null,
                isDashing: false,
                dashTarget: null,
                dashDuration:280,
                dashCooldown: 3200,
                lastDashTime: 0,
                thunderStrikeCooldown: 4500,
                lastThunderStrikeTime: 0,
                lastDamagedTime: 0,
                havocRageCooldown: 10000,
                lastHavocRageTime: 0,
                isChargingHavoc: false,
                
            };

            // --- THIS LOGIC IS NEW/MODIFIED ---
            // It now handles starting positions for both game modes.
            if (genesisState.isBattleMode) {
                const arenaRect = genesisArena.getBoundingClientRect();
                // Player starts on the left for battles
                genesisState.player.x = 100;
                genesisState.player.y = arenaRect.height / 2;

                // Define the patrol zone parameters for the player
                genesisState.player.patrolCenterX = 150; // Center of the patrol zone (X-axis)
                genesisState.player.patrolCenterY = arenaRect.height / 2;
                genesisState.player.patrolRadius = 120; // The radius the player can move in
            }
            // Endless mode is handled inside the gameLoop's initialization check

            characterArea.style.display = 'none';
            genesisState.gameLoopId = requestAnimationFrame(gameLoop);
        }

        function stopGameGenesis() {
            genesisState.isActive = false;
            if (genesisState.gameLoopId) {
                cancelAnimationFrame(genesisState.gameLoopId);
                genesisState.gameLoopId = null;
            }
            
            // --- NEW, TARGETED REMOVAL LOGIC ---
            // Get all dynamically created game objects
            const dynamicElements = genesisArena.querySelectorAll('.genesis-player, .genesis-enemy, .genesis-loot-orb');
            // Remove each one individually, leaving the wave display intact
            dynamicElements.forEach(el => el.remove());
            
            genesisState.player = null;
            genesisState.enemies = [];
            if(genesisState.lootOrbs) genesisState.lootOrbs = [];
        
            // Now it's safe to hide the permanent UI elements for the next state
            genesisWaveDisplay.style.display = 'none';
            bossHealthContainer.style.display = 'none';
            genesisState.isBattleMode = false;
        }
        function toggleGrowthMode() {
            // Check if the Genesis Arena is currently active
            if (genesisState.isActive) {
                // If it is, stop it and show the static character
                stopGameGenesis();
                characterArea.style.display = 'flex'; // Show static tap area
                genesisArena.style.display = 'none';  // Hide the arena
                growBtn.textContent = 'Endless'; // Change button text
            } else {
                // If it's not active, start it up again
                genesisArena.style.display = 'block'; // Show the arena
                characterArea.style.display = 'none'; // Hide static tap area
                startGameGenesis(); // Start the endless mode
                growBtn.textContent = 'Grow'; // Change button text back
            }
        }
        function handleLootCollection() {
            const player = genesisState.player;
            if (!player || !genesisState.lootOrbs) return;
        
            const arenaRect = genesisArena.getBoundingClientRect();
        
            genesisState.lootOrbs = genesisState.lootOrbs.filter(orb => {
                const dx = player.x - orb.x;
                const dy = player.y - orb.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
        
                if (distance <= orb.collectionRadius) {
                    gameState.gold += orb.amount;
        
                    const screenX = arenaRect.left + player.x;
                    const screenY = arenaRect.top + player.y;
                    
                    createFloatingText(`+${formatNumber(orb.amount)} Gold`, screenX, screenY, { color: 'var(--xp-color)' });
        
                    playSound('feed', 0.5, 'sine', 600, 800, 0.1);
                    orb.element.remove();
                    return false;
                }
                return true;
            });
        }
        function gameLoop(timestamp) {
            if (!genesisState.isActive || !genesisState.player) return;

            // --- Player Damage Flash Reset ---
            if (timestamp - genesisState.player.lastDamagedTime > 200) {
                genesisState.player.element.style.filter = '';
            }

            // --- ENDLESS MODE: Difficulty Scaling ---
            if (!genesisState.isBattleMode) {
                const DIFFICULTY_INTERVAL = 15000;
                if (timestamp - genesisState.lastDifficultyIncrease > DIFFICULTY_INTERVAL) {
                    if (genesisState.lastDifficultyIncrease !== 0) {
                        genesisState.difficultyLevel++;
                        showToast(`Challenge Level ${genesisState.difficultyLevel}!`);
                        playSound('levelUp', 0.5, 'sawtooth', 300, 400, 0.2);
                    }
                    genesisState.lastDifficultyIncrease = timestamp;
                }
            }

            // --- BATTLE MODE: Wave Completion Check ---
            if (genesisState.isBattleMode &&
                genesisState.enemies.length === 0 &&
                genesisState.enemiesSpawnedThisWave >= genesisState.enemiesToSpawnThisWave &&
                !genesisState.waveTransitionActive &&
                genesisState.currentWave < genesisState.totalWaves // <-- This condition is correct
            ) {
                genesisState.waveTransitionActive = true;
            
                // 1. Immediately show that the wave is cleared.
                genesisWaveDisplay.textContent = `Wave ${genesisState.currentWave} Cleared!`;
                genesisWaveDisplay.style.display = 'block';
                playSound('levelUp', 0.6, 'triangle', 440, 880, 0.3);
            
                // 2. After 1.5 seconds, update the text to prepare the player for the next wave.
                setTimeout(() => {
                    if (!genesisState.isActive || !genesisState.waveTransitionActive) return;
            
                    // Check if the NEXT wave is the final (boss) wave
                    if (genesisState.currentWave + 1 === genesisState.totalWaves) {
                        genesisWaveDisplay.textContent = 'BOSS INCOMING!';
                        playSound('ascend', 0.7, 'sawtooth', 500, 100, 0.4);
                    } else {
                        genesisWaveDisplay.textContent = 'Next Wave Incoming...';
                    }
            
                }, 1500);
            
                // 3. After a total of 3 seconds, start the actual next wave.
                setTimeout(() => {
                    if (!genesisState.isActive) return;
                    startNextBattleWave(); 
                    if (genesisState.isActive) {
                        genesisState.waveTransitionActive = false;
                    }
                }, 3000);
            }

            // --- Core Updates ---
            updatePlayerTarget();
            movePlayer();
            moveEnemies();
            moveLootOrbs();
            handleBurnDamage(timestamp);

            // --- Attacks ---
            let actionTaken = false;
            actionTaken = handleGenesisThunderStrike(timestamp);
            if (!actionTaken) {
                actionTaken = handleGenesisHavocRage(timestamp);
            }
            if (!actionTaken) actionTaken = initiateGenesisPlayerDash(timestamp);
            if (!actionTaken) handleGenesisPlayerAttack(timestamp);
            if (genesisState.isBattleMode) handleEnemyAttacks(timestamp);

            // --- Post-action updates ---
            handleLootCollection();
            if(genesisState.boss) updateBossHealthBar();
            
            // --- Update Positions ---
            genesisState.player.element.style.left = `${genesisState.player.x}px`;
            genesisState.player.element.style.top = `${genesisState.player.y}px`;
            genesisState.enemies.forEach(enemy => {
                enemy.element.style.left = `${enemy.x}px`;
                enemy.element.style.top = `${enemy.y}px`;
            });
            genesisState.lootOrbs.forEach(orb => {
                const orbTranslateX = orb.x - (orb.element.offsetWidth / 2);
                const orbTranslateY = orb.y - (orb.element.offsetHeight / 2);
                orb.element.style.transform = `translate(${orbTranslateX}px, ${orbTranslateY}px)`;
            });

            spawnEnemies(timestamp);
            
            // --- FIX: WIN/LOSS CONDITIONS ---
            // Win Condition: The boss exists, is defeated, and the game is still active.
            if (genesisState.isBattleMode && genesisState.boss && genesisState.boss.hp <= 0 && genesisState.isActive) {
                genesisState.isActive = false; // Prevent this from firing multiple times
                endBattle(true);
                return; // Stop the loop
            }
            
            // Loss Condition
            if (gameState.resources.hp <= 0 && genesisState.isActive) {
                genesisState.isActive = false; // Prevent multiple calls
                endBattle(false);
                return; // Stop the loop
            }
            
            genesisState.gameLoopId = requestAnimationFrame(gameLoop);
        }
        function spawnEnemies(timestamp) {
            if (genesisState.isBattleMode) {
                const waveSpawnInterval = 200;
                if (genesisState.enemiesSpawnedThisWave < genesisState.enemiesToSpawnThisWave && timestamp - genesisState.lastEnemySpawn > waveSpawnInterval) {
                    genesisState.lastEnemySpawn = timestamp;
                    genesisState.enemiesSpawnedThisWave++;
                    
                    const arenaRect = genesisArena.getBoundingClientRect();
                    const difficulty = gameState.highestBattleLevelCompleted + 1;
                    const waveMultiplier = 1 + (genesisState.currentWave / genesisState.totalWaves);

                    const enemy = {
                        element: document.createElement('img'),
                        healthBarContainer: document.createElement('div'),
                        healthBarFill: document.createElement('div'),
                        x: 0,
                        y: 0,
                        speed: (0.5 + Math.random() * 2.0) * waveMultiplier,
                        width: 40, height: 40,
                        maxHp: (40 + (10 * difficulty)) * waveMultiplier,
                        hp: (40 + (10 * difficulty)) * waveMultiplier,
                        id: Date.now() + Math.random(),
                        attackRange: 25,
                        attackCooldown: 2000,
                        lastAttackTime: 0
                    };
                    
                    const padding = 50;
                    enemy.x = padding + (Math.random() * (arenaRect.width - padding * 2));
                    enemy.y = padding + (Math.random() * (arenaRect.height - padding * 2));

                    enemy.healthBarContainer.className = 'enemy-health-bar-container';
                    enemy.healthBarFill.className = 'enemy-health-bar-fill';
                    enemy.healthBarContainer.appendChild(enemy.healthBarFill);
                    
                    enemy.element.src = 'player.PNG';
                    enemy.element.className = 'genesis-enemy';
                    enemy.element.style.filter = `hue-rotate(${Math.random() * 360}deg) saturate(1.5)`;

                    genesisArena.appendChild(enemy.element);
                    genesisArena.appendChild(enemy.healthBarContainer);
                    genesisState.enemies.push(enemy);
                }
            } else {
                if (genesisState.enemies.length >= MAX_ENEMIES) return;

                const baseSpawnInterval = 700;
                const minSpawnInterval = 200;
                const dynamicSpawnInterval = Math.max(minSpawnInterval, baseSpawnInterval / genesisState.difficultyLevel);
                const arenaRect = genesisArena.getBoundingClientRect();

                if (timestamp - genesisState.lastEnemySpawn > dynamicSpawnInterval && arenaRect.width > 0) {
                    genesisState.lastEnemySpawn = timestamp;
                    const difficulty = genesisState.difficultyLevel;
                    const enemyHp = Math.floor((5 * gameState.level * gameState.ascension.tier) + (difficulty * 5));
                    
                    const baseSpeed = 0.5 + Math.random() * 2.0;
                    const speedMultiplier = 1 + (difficulty - 1) * 0.25;
                    const enemySpeed = baseSpeed * speedMultiplier;
            
                    const enemy = {
                        element: document.createElement('img'),
                        healthBarContainer: document.createElement('div'),
                        healthBarFill: document.createElement('div'),
                        x: 0, y: 0,
                        speed: enemySpeed,
                        width: 40, height: 40,
                        maxHp: enemyHp,
                        hp: enemyHp,
                        id: Date.now() + Math.random(),
                        attackRange: 25,
                        attackCooldown: 2000,
                        lastAttackTime: 0,
                    };

                    const padding = 50;
                    enemy.x = padding + (Math.random() * (arenaRect.width - padding * 2));
                    enemy.y = padding + (Math.random() * (arenaRect.height - padding * 2));

                    enemy.healthBarContainer.className = 'enemy-health-bar-container';
                    enemy.healthBarFill.className = 'enemy-health-bar-fill';
                    enemy.healthBarContainer.appendChild(enemy.healthBarFill);

                    enemy.element.src = 'player.PNG';
                    enemy.element.className = 'genesis-enemy';
                    enemy.element.style.filter = `hue-rotate(${Math.random() * 360}deg) saturate(1.5)`;

                    genesisArena.appendChild(enemy.element);
                    genesisArena.appendChild(enemy.healthBarContainer);
                    genesisState.enemies.push(enemy);
                }
            }
        }

        function moveEnemies() {
            if (!genesisState.player) return;
            genesisState.enemies.forEach(enemy => {
                const dx = genesisState.player.x - enemy.x;
                const dy = genesisState.player.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > enemy.attackRange) {
                    enemy.x += (dx / distance) * enemy.speed;
                    enemy.y += (dy / distance) * enemy.speed;
                }
            });
        }
        function handleEnemyAttacks(timestamp) {
            const player = genesisState.player;
            if (!player || player.isDashing) return; // Enemies can't hit a dashing player
        
            genesisState.enemies.forEach(enemy => {
                // Check if the player is in range AND the enemy's attack is off cooldown
                if (timestamp - enemy.lastAttackTime > enemy.attackCooldown) {
                    const dx = player.x - enemy.x;
                    const dy = player.y - enemy.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
        
                    if (distance <= enemy.attackRange) {
                        enemy.lastAttackTime = timestamp;
                        const damage = Math.max(1, (enemy.isBoss ? 20 : 5) * (gameState.highestBattleLevelCompleted + 1) - getTotalStat('fortitude'));
                        
                        gameState.resources.hp -= damage;
                        
                        // Visual feedback for getting hit
                        player.lastDamagedTime = timestamp;
                        player.element.style.filter = 'brightness(3) drop-shadow(0 0 5px red)';
                        
                        createImpactEffect(player.x, player.y);
        
                        // --- NEW: AUTO-POTION LOGIC ---
                        // Check health AFTER taking damage but BEFORE updating UI
                        const healthThreshold = gameState.resources.maxHp * 0.3;
                        if (gameState.resources.hp > 0 && gameState.resources.hp <= healthThreshold) {
                            if (gameState.healthPotions > 0) {
                                gameState.healthPotions--;
                                const healAmount = Math.floor(gameState.resources.maxHp * 0.5);
                                gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + healAmount);
                                
                                showToast("Used a Health Potion!");
                                playSound('feed', 1, 'sine', 200, 600, 0.2);
        
                                // Create a floating heal text
                                const arenaRect = genesisArena.getBoundingClientRect();
                                const screenX = arenaRect.left + player.x;
                                const screenY = arenaRect.top + player.y;
                                createFloatingText(`+${healAmount} HP`, screenX, screenY, { color: 'var(--accent-color)' });
                            }
                        }
                        // --- END OF AUTO-POTION LOGIC ---
        
                        updateUI();
                    }
                }
            });
        }

        function updatePlayerTarget() {
            const player = genesisState.player;
            if (!player) return;
        
            // We no longer need the arenaRect for this function
            // const arenaRect = genesisArena.getBoundingClientRect(); 
            
            // --- THIS IS THE ACTUAL CHANGE ---
            // We remove the entire if/else block that filtered targets.
            // The player should always consider all enemies on screen as potential targets.
            let validTargets = genesisState.enemies;
            // --- END OF ACTUAL CHANGE ---

            let closestEnemy = null;
            let minDistance = Infinity;
        
            // Find the closest enemy from the (now unfiltered) list of valid targets.
            validTargets.forEach(enemy => {
                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestEnemy = enemy;
                }
            });

            // Set the player's target.
            player.target = closestEnemy;
        }
        function movePlayer() {
            const player = genesisState.player;
            if (!player) return;
        
            let targetX = null;
            let targetY = null;
            let currentSpeed = player.speed;
        
            if (player.isDashing && player.dashTarget) {
                targetX = player.dashTarget.x;
                targetY = player.dashTarget.y;
                currentSpeed = player.speed * 5;
                createDashTrailEffect(player);
            } 
            else if (player.manualDestination) {
                targetX = player.manualDestination.x;
                targetY = player.manualDestination.y;
                const dx = targetX - player.x;
                const dy = targetY - player.y;
                if (Math.sqrt(dx * dx + dy * dy) < 10) {
                    player.manualDestination = null;
                }
            } 
            else {
                if (player.target) {
                    if (genesisState.isBattleMode) {
                        const enemyTargetX = player.target.x;
                        const enemyTargetY = player.target.y;
                        const vectorX = enemyTargetX - player.patrolCenterX;
                        const vectorY = enemyTargetY - player.patrolCenterY;
                        const distFromPatrolCenter = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
        
                        if (distFromPatrolCenter > player.patrolRadius) {
                            const normX = vectorX / distFromPatrolCenter;
                            const normY = vectorY / distFromPatrolCenter;
                            targetX = player.patrolCenterX + normX * player.patrolRadius;
                            targetY = player.patrolCenterY + normY * player.patrolRadius;
                        } else {
                            targetX = enemyTargetX;
                            targetY = enemyTargetY;
                        }
                    }
                    else {
                         const dx = player.target.x - player.x;
                         const dy = player.target.y - player.y;
                         const distanceToTarget = Math.sqrt(dx*dx + dy*dy);
                         if (distanceToTarget > player.attackRange * 0.4) {
                            targetX = player.target.x;
                            targetY = player.target.y;
                         }
                    }
                }
                else {
                    if (genesisState.isBattleMode) {
                        const dx = player.patrolCenterX - player.x;
                        const dy = player.patrolCenterY - player.y;
                        if (Math.sqrt(dx * dx + dy * dy) > 5) {
                            targetX = player.patrolCenterX;
                            targetY = player.patrolCenterY;
                        }
                    }
                }
            }
        
            if (targetX !== null && targetY !== null) {
                const moveDx = targetX - player.x;
                const moveDy = targetY - player.y;
                const moveDistance = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
                
                if (moveDistance > 1) {
                    const moveAmount = Math.min(currentSpeed, moveDistance);
                    player.x += (moveDx / moveDistance) * moveAmount;
                    player.y += (moveDy / moveDistance) * moveAmount;
                }
            }
        
            const arenaRect = genesisArena.getBoundingClientRect();
            if (arenaRect.width > 0) {
                player.x = clamp(player.x, player.width / 2, arenaRect.width - player.width / 2);
                player.y = clamp(player.y, player.height / 2, arenaRect.height - player.height / 2);
            }
        }
        
        function initiateGenesisPlayerDash(timestamp) {
            const player = genesisState.player;
            if (!player || player.isDashing || genesisState.enemies.length === 0) return false;
            if (timestamp - player.lastDashTime < player.dashCooldown) return false;

            let bestTarget = null;
            let maxCount = 0;
            const clusterRadius = 350;

            genesisState.enemies.forEach(potentialTarget => {
                let nearbyCount = 0;
                genesisState.enemies.forEach(otherEnemy => {
                    const dx = potentialTarget.x - otherEnemy.x;
                    const dy = potentialTarget.y - otherEnemy.y;
                    if (Math.sqrt(dx * dx + dy * dy) < clusterRadius) {
                        nearbyCount++;
                    }
                });
                if (nearbyCount > maxCount) {
                    maxCount = nearbyCount;
                    bestTarget = potentialTarget;
                }
            });
            
            if (!bestTarget) {
                 bestTarget = player.target;
            }

            if (bestTarget) {
                const dx = player.x - bestTarget.x;
                const dy = player.y - bestTarget.y;
                const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
                const maxDashRange = 600; 

                if (distanceToTarget > maxDashRange) {
                    return false; 
                }

                player.lastDashTime = timestamp;

                const chainChance = 0.30;
                const shouldChain = Math.random() < chainChance;
                const maxChains = shouldChain ? 4 : 1;
                
                const arenaRect = genesisArena.getBoundingClientRect();
                const screenX = arenaRect.left + player.x;
                const screenY = arenaRect.top + player.y - 80;
                
                if (shouldChain) {
                    createFloatingText("Dash Chain!", screenX, screenY, { color: '#ff8c00', fontSize: '2.2em' });
                } else {
                    createFloatingText("Dash!", screenX, screenY, { color: '#ff8c00', fontSize: '1.8em' });
                }
                
                performDash(bestTarget, 1, maxChains);
                
                return true;
            }
            
            return false;
        }

        function performDash(target, currentChain, maxChains) {
            const player = genesisState.player;
            if (!player || !target) {
                if(player) player.isDashing = false;
                return;
            };

            player.isDashing = true;
            player.dashTarget = { x: target.x, y: target.y };
            playSound('hit', 1, 'sawtooth', 800, 200, 0.2);

            setTimeout(() => {
                if (!genesisState.player) return;

                const explosionX = player.x;
                const explosionY = player.y;
                createDashExplosionEffect(explosionX, explosionY);
                playSound('crit', 1, 'square', 400, 50, 0.4);
                triggerScreenShake(300);

                const explosionRadius = 150;
                const dashDamage = getTotalStat('strength') * 5;

                genesisState.enemies.forEach(enemy => {
                    const dx = explosionX - enemy.x;
                    const dy = explosionY - enemy.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= explosionRadius) {
                        const isCrit = Math.random() < (getTotalStat('critChance') / 100);
                        const finalDamage = dashDamage * (isCrit ? 2.5 : 1);
                        applyDamageToEnemy(enemy, finalDamage, isCrit);
                    }
                });

                genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);

                if (currentChain < maxChains && genesisState.enemies.length > 0) {
                    let furthestEnemy = null;
                    let maxDistance = -1;
                    genesisState.enemies.forEach(enemy => {
                        const dx = player.x - enemy.x;
                        const dy = player.y - enemy.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance > maxDistance) {
                            maxDistance = distance;
                            furthestEnemy = enemy;
                        }
                    });

                    if (furthestEnemy) {
                        performDash(furthestEnemy, currentChain + 1, maxChains);
                    } else {
                        player.isDashing = false;
                    }
                } else {
                    player.isDashing = false;
                }

            }, player.dashDuration);
        }

        function createHavocShockwaveEffect(x, y, range) {
            const numberOfBolts = 8;

            for (let i = 0; i < numberOfBolts; i++) {
                const bolt = document.createElement('div');
                bolt.className = 'havoc-starburst-bolt';
                
                bolt.style.left = `${x}px`;
                bolt.style.top = `${y}px`;

                const angle = (360 / numberOfBolts) * i;
                bolt.style.transform = `rotate(${angle}deg)`;
                
                bolt.style.animationDelay = `${Math.random() * 0.15}s`;
                
                genesisArena.appendChild(bolt);

                setTimeout(() => {
                    if (bolt) bolt.remove();
                }, 600);
            }
        }

        function createBurnParticles(enemy) {
            if (!enemy || !enemy.element) return;
            const particle = document.createElement('div');
            particle.className = 'enemy-fire-particle';
            
            const offsetX = (Math.random() - 0.5) * enemy.width;
            const offsetY = (Math.random() - 0.5) * enemy.height;
            particle.style.left = `${enemy.x + offsetX}px`;
            particle.style.top = `${enemy.y + offsetY}px`;
            
            genesisArena.appendChild(particle);
            setTimeout(() => particle.remove(), 500);
        }

        function createChainLightningEffect(targets) {
            const canvas = document.createElement('canvas');
            canvas.className = 'genesis-chain-lightning';
            const arenaRect = genesisArena.getBoundingClientRect();
            canvas.width = arenaRect.width;
            canvas.height = arenaRect.height;
            genesisArena.appendChild(canvas);

            const ctx = canvas.getContext('2d');

            for (let i = 0; i < targets.length - 1; i++) {
                const start = targets[i];
                const end = targets[i+1];
                drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(0, 255, 255, 0.2)', 20, 15);
                drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(255, 255, 255, 0.5)', 10, 12);
                drawLightningSegment(ctx, start.x, start.y, end.x, end.y, '#FFFFFF', 4, 10);
            }

            setTimeout(() => canvas.remove(), 400);
        }

        function handleGenesisThunderStrike(timestamp) {
            const player = genesisState.player;
            if (!player || player.isChargingHavoc || genesisState.enemies.length === 0) return false;
            if (timestamp - player.lastThunderStrikeTime < player.thunderStrikeCooldown) return false;

            const thunderStrikeProximity = 50;
            let isEnemyClose = false;
            for (const enemy of genesisState.enemies) {
                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;
                if (Math.sqrt(dx * dx + dy * dy) <= thunderStrikeProximity) {
                    isEnemyClose = true;
                    break;
                }
            }
            if (!isEnemyClose) {
                return false;
            }

            // --- THIS IS THE FIX: MOVE THIS BLOCK UP ---
            let potentialTargets = [...genesisState.enemies];
            let chainTargets = [player];
            const maxChain = 17; 

            for (let i = 0; i < maxChain && potentialTargets.length > 0; i++) {
                const lastTarget = chainTargets[chainTargets.length - 1];
                let closestEnemy = null;
                let minDistance = Infinity;

                potentialTargets.forEach(enemy => {
                    const dx = lastTarget.x - enemy.x;
                    const dy = lastTarget.y - enemy.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestEnemy = enemy;
                    }
                });

                if (closestEnemy) {
                    chainTargets.push(closestEnemy);
                    potentialTargets = potentialTargets.filter(e => e.id !== closestEnemy.id);
                }
            }
            // --- END OF MOVED BLOCK ---

            if (chainTargets.length > 1) {
                player.lastThunderStrikeTime = timestamp;
                playSound('ascend', 0.8, 'sawtooth', 100, 800, 0.3);
                triggerScreenShake(200);

                const arenaRect = genesisArena.getBoundingClientRect();
                const screenX = arenaRect.left + player.x;
                const screenY = arenaRect.top + player.y - 80;
                createFloatingText("Thunder Strike!", screenX, screenY, {
                    color: '#00ffff',
                    fontSize: '2.2em'
                });

                // Now this line will work correctly because chainTargets is defined
                createChainLightningEffect(chainTargets); 

                const thunderDamage = getTotalStat('strength') * 4.5;

                for (let i = 1; i < chainTargets.length; i++) {
                    const enemy = chainTargets[i];
                    const isCrit = Math.random() < (getTotalStat('critChance') / 100);
                    const finalDamage = thunderDamage * (isCrit ? 2.5 : 1);
                    applyDamageToEnemy(enemy, finalDamage, isCrit);
                }
                
                genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
                return true;
            }
            return false;
        }
        
        function handleGenesisHavocRage(timestamp) {
            const player = genesisState.player;
            if (!player || genesisState.enemies.length === 0) return false;
            if (timestamp - player.lastHavocRageTime < player.havocRageCooldown) return false;
        
            player.lastHavocRageTime = timestamp;
        
            playSound('crit', 1, 'sawtooth', 300, 50, 0.5); 
            triggerScreenShake(400);
        
            const arenaRect = genesisArena.getBoundingClientRect();
            const screenX = arenaRect.left + player.x;
            const screenY = arenaRect.top + player.y - 80;
            createFloatingText("Havoc Rage!", screenX, screenY, {
                color: '#dc143c',
                fontSize: '2.2em'
            });
        
            player.element.style.filter = 'invert(1)';
            setTimeout(() => {
                if (player && player.element) {
                    player.element.style.filter = '';
                }
            }, 250);
        
            const effectRadius = 200;
            createHavocShockwaveEffect(player.x, player.y, effectRadius);
        
            genesisState.enemies.forEach(enemy => {
                enemy.burn = {
                    expiryTime: timestamp + 5000,
                    damagePerTick: getTotalStat('strength') * 0.25,
                    lastTickTime: timestamp
                };
                enemy.element.classList.add('burning');
            });
            
            return true;
        }

        function handleBurnDamage(timestamp) {
            if (genesisState.enemies.length === 0) return;

            for (let i = genesisState.enemies.length - 1; i >= 0; i--) {
                const enemy = genesisState.enemies[i];
                
                if (enemy && enemy.burn) {
                    if (timestamp > enemy.burn.expiryTime) {
                        delete enemy.burn;
                        if(enemy.element) enemy.element.classList.remove('burning');
                        continue;
                    }

                    if (timestamp - enemy.burn.lastTickTime > 250) {
                        const tickDamage = enemy.burn.damagePerTick / 4;
                        createBurnParticles(enemy);
                        
                        applyDamageToEnemy(enemy, tickDamage, false);
                        
                        if (enemy.hp > 0) {
                            enemy.burn.lastTickTime = timestamp;
                        }
                    }
                }
            }
            genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
        }

        function handleGenesisPlayerAttack(timestamp) {
            const player = genesisState.player;
            const baseCooldown = 300;
            const reductionPerAgi = 1;
            const minimumCooldown = 95;
            
            const agility = getTotalStat('agility');
            const dynamicAttackCooldown = Math.max(minimumCooldown, baseCooldown - (agility * reductionPerAgi));

            if (!player || player.isDashing || (timestamp - player.lastAttackTime < dynamicAttackCooldown)) {
                return;
            }
            if (!player.target) return;
            
            const dx = player.x - player.target.x;
            const dy = player.y - player.target.y;
            const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

            if (distanceToTarget > player.attackRange) return;
            
            player.lastAttackTime = timestamp;
            createAoeSlashEffect(player.x, player.y, player.attackRange);
            
            genesisState.enemies.forEach(enemy => {
                const d_enemy_x = player.x - enemy.x;
                const d_enemy_y = player.y - enemy.y;
                const distance_to_enemy = Math.sqrt(d_enemy_x * d_enemy_x + d_enemy_y * d_enemy_y);
        
                if (distance_to_enemy <= player.attackRange) {
                    const isCrit = Math.random() < (getTotalStat('critChance') / 100);
                    const damage = getTotalStat('strength') * (isCrit ? 2.5 : 1);
                    applyDamageToEnemy(enemy, damage, isCrit);
                }
            });

            genesisState.enemies = genesisState.enemies.filter(e => e.hp > 0);
        }

        function createSlashEffect(source, target) {
            const slashEl = document.createElement('div');
            slashEl.className = 'genesis-slash';
            genesisArena.appendChild(slashEl);
        
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const angle = Math.atan2(target.y - source.y, target.x - source.x) * (180 / Math.PI);
        
            slashEl.style.left = `${midX}px`;
            slashEl.style.top = `${midY}px`;
            slashEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            setTimeout(() => slashEl.remove(), 200);
        }
        function createAoeSlashEffect(x, y, range) {
            const pulseEl = document.createElement('div');
            pulseEl.className = 'genesis-aoe-pulse';
            
            pulseEl.style.width = `${range * 2}px`;
            pulseEl.style.height = `${range * 2}px`;
        
            pulseEl.style.left = `${x}px`;
            pulseEl.style.top = `${y}px`;
            genesisArena.appendChild(pulseEl);
            setTimeout(() => pulseEl.remove(), 300);
        }

        function createImpactEffect(x, y) {
            const impactEl = document.createElement('div');
            impactEl.className = 'genesis-impact';
            genesisArena.appendChild(impactEl);
            
            impactEl.style.left = `${x}px`;
            impactEl.style.top = `${y}px`;
            impactEl.style.transform = `translate(-50%, -50%)`;
            setTimeout(() => impactEl.remove(), 300);
        }
        function createDashTrailEffect(player) {
            if (!player || !player.element) return;
            const trailEl = player.element.cloneNode(); 
            trailEl.className = 'genesis-player genesis-dash-ghost';
            
            trailEl.style.position = 'absolute';
            trailEl.style.left = `${player.x}px`;
            trailEl.style.top = `${player.y}px`;
        
            genesisArena.appendChild(trailEl);
        
            requestAnimationFrame(() => {
                trailEl.style.opacity = '0';
            });
            
            setTimeout(() => trailEl.remove(), 400);
        }

        function createDashExplosionEffect(x, y) {
            const explosion = document.createElement('div');
            explosion.className = 'genesis-dash-explosion';
            const explosionRadius = 150; 
            explosion.style.width = `${explosionRadius * 2}px`;
            explosion.style.height = `${explosionRadius * 2}px`;
            explosion.style.left = `${x}px`;
            explosion.style.top = `${y}px`;
            genesisArena.appendChild(explosion);
            setTimeout(() => explosion.remove(), 500);
        }

        function createLootOrb(x, y) {
            if (genesisState.isBattleMode) {
                return; 
            }
            const orb = {
                element: document.createElement('div'),
                x: x, y: y, type: 'gold',
                amount: Math.floor(5 + (Math.random() * 5 * gameState.level)),
                collectionRadius: 690,
                magnetRadius: 2550,
                magnetSpeed: 13

            };
            orb.element.className = 'genesis-loot-orb';
            genesisArena.appendChild(orb.element);
            
            if (!genesisState.lootOrbs) genesisState.lootOrbs = [];
            genesisState.lootOrbs.push(orb);
        }
        function moveLootOrbs() {
            const player = genesisState.player;
            if (!player || !genesisState.lootOrbs) return;
        
            genesisState.lootOrbs.forEach(orb => {
                const dx = player.x - orb.x;
                const dy = player.y - orb.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
        
                if (distance < orb.magnetRadius && distance > 1) { 
                    orb.x += (dx / distance) * orb.magnetSpeed;
                    orb.y += (dy / distance) * orb.magnetSpeed;
                }
            });
        }
  
        function startBattle() {
            stopGameGenesis(); 
            genesisState.isBattleMode = true;
            genesisState.currentWave = 0;
            genesisState.boss = null;
            genesisState.totalDamageDealtThisBattle = 0; // --- FIX: Reset damage counter for the new battle.
            genesisWaveDisplay.style.display = 'block';
            gameState.resources.hp = gameState.resources.maxHp;
            updateUI();

            startGameGenesis();

            startNextBattleWave();
        }

        function startNextBattleWave() {
            genesisState.currentWave++;
            genesisState.enemiesSpawnedThisWave = 0;
            
            if (genesisState.currentWave > genesisState.totalWaves) {
                // This case should be handled by the win condition in the game loop, but as a fallback:
                endBattle(true);
                return;
            }
            
            genesisWaveDisplay.textContent = `Wave ${genesisState.currentWave} / ${genesisState.totalWaves}`;
            genesisWaveDisplay.style.display = 'block';

            if (genesisState.currentWave === genesisState.totalWaves) {
                // It's the Boss Wave!
                genesisState.enemiesToSpawnThisWave = 30; // Minions for the boss
                spawnBoss();
            } else {
                // Regular wave: 5 enemies on wave 1, scaling up to 100 on wave 19
                const baseMinEnemies = 3;
                const baseMaxEnemies = 18;
                const waveBonus = Math.floor(genesisState.currentWave * 1.5);
                const minEnemies = baseMinEnemies + waveBonus;
                const maxEnemies = baseMaxEnemies + waveBonus;
                genesisState.enemiesToSpawnThisWave = Math.floor(Math.random() * (maxEnemies - minEnemies + 1)) + minEnemies;
            }
        }
        
        function spawnBoss() {
            const arenaRect = genesisArena.getBoundingClientRect();
            const difficulty = gameState.highestBattleLevelCompleted + 1;
            
            const boss = {
                element: document.createElement('img'),
                x: arenaRect.width - 100,
                y: arenaRect.height / 2,
                speed: 1,
                width: 160, height: 160, // Much larger
                maxHp: 500 * difficulty * gameState.ascension.tier,
                hp: 500 * difficulty * gameState.ascension.tier,
                id: 'BOSS',
                isBoss: true,
                attackRange: 80,
                attackCooldown: 1000,
                lastAttackTime: 0
            };
            
            boss.element.src = 'player.PNG';
            boss.element.className = 'genesis-enemy';
            boss.element.style.width = `${boss.width}px`;
            boss.element.style.height = `${boss.height}px`;
            boss.element.style.filter = 'grayscale(1) sepia(1) hue-rotate(320deg) saturate(5)';
            
            genesisArena.appendChild(boss.element);
            genesisState.enemies.push(boss);
            genesisState.boss = boss;

            // Show and update the boss health bar
            bossHealthContainer.style.display = 'block';
            bossNameDisplay.textContent = `Level ${difficulty} Hellspawn King`;
            updateBossHealthBar();
        }

        function updateBossHealthBar() {
            if (genesisState.boss) {
                const percent = (genesisState.boss.hp / genesisState.boss.maxHp) * 100;
                bossHealthFill.style.width = `${percent}%`;
            }
        }
  
      function startNextWave() {
          battleState.currentWave++;
  
          // --- NEW LOGIC ---
          // We no longer use the player's level to calculate enemy stats.
          // Instead, we use the fixed battle level for this entire battle instance.
          const enemyLevel = battleState.targetBattleLevel;
          const tierMultiplier = gameState.ascension.tier;
          const waveMultiplier = 1 + (battleState.currentWave - 1) * 0.2;
          let isBoss = battleState.currentWave === battleState.totalWaves;
          let enemy;
          
          // The formulas now scale with `enemyLevel`, not the player's level.
          if (isBoss) {
              enemy = {
                  name: `Level ${enemyLevel} Hellspawn King`,
                  hp: Math.floor((150 + 20 * enemyLevel) * tierMultiplier * waveMultiplier),
                  strength: Math.floor((10 + 4 * enemyLevel) * tierMultiplier * waveMultiplier),
                  agility: Math.floor((5 + 2 * enemyLevel) * tierMultiplier * waveMultiplier),
                  fortitude: Math.floor((8 + 3 * enemyLevel) * tierMultiplier * waveMultiplier),
                  xpReward: Math.floor((100 * enemyLevel) * tierMultiplier * waveMultiplier),
                  goldReward: Math.floor((75 * enemyLevel) * tierMultiplier * waveMultiplier)
              };
          } else {
              enemy = {
                  name: `Wave ${battleState.currentWave} Goblin`,
                  hp: Math.floor((60 + 8 * enemyLevel) * tierMultiplier * waveMultiplier),
                  strength: Math.floor((3 + 2 * enemyLevel) * tierMultiplier * waveMultiplier),
                  agility: Math.floor((3 + 1 * enemyLevel) * tierMultiplier * waveMultiplier),
                  fortitude: Math.floor((3 + 1 * enemyLevel) * tierMultiplier * waveMultiplier),
                  xpReward: Math.floor((25 * enemyLevel) * tierMultiplier * waveMultiplier),
                  goldReward: Math.floor((15 * enemyLevel) * tierMultiplier * waveMultiplier)
              };
          }
          enemy.maxHp = enemy.hp;
          battleState.enemy = enemy;
          updateBattleHud();
          addBattleLog(`A wild ${battleState.enemy.name} appears!`, "log-system");
          attackBtn.disabled = true; fleeBtn.disabled = true; feedBattleBtn.disabled = true;
  
          setTimeout(() => {
              if (battleState.enemy.agility > getTotalStat('agility')) {
                  addBattleLog(`${battleState.enemy.name} is faster and attacks first!`, "log-enemy");
                  handleEnemyAttack();
              } else {
                  addBattleLog("You are faster! Your turn.", "log-player");
                  if (gameState.settings && gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); } 
                  else { attackBtn.disabled = false; fleeBtn.disabled = false; feedBattleBtn.disabled = false; }
              }
          }, 1000);
      }
      
      function handlePlayerAttack() {
          if (!battleState.isActive) return;
          attackBtn.disabled = true; fleeBtn.disabled = true; feedBattleBtn.disabled = true;
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
              else { attackBtn.disabled = false; fleeBtn.disabled = false; feedBattleBtn.disabled = false; }
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
          else { if (gameState.settings && gameState.settings.isAutoBattle) { setTimeout(handlePlayerAttack, 1000); } else { attackBtn.disabled = false; fleeBtn.disabled = false; feedBattleBtn.disabled = false; } }
      }
  
      async function endBattle(playerWon) {
          // --- FIX: This block now handles damage submission for the new Genesis battle system. ---
          if (genesisState.isBattleMode && genesisState.totalDamageDealtThisBattle > gameState.dojoPersonalBest) {
              gameState.dojoPersonalBest = genesisState.totalDamageDealtThisBattle;
              showToast("New Personal Damage Record!");
              playSound('victory', 1, 'triangle', 523, 1046, 0.4);
              updateDojoUI(); // This will update the text on the dojo screen for next time
      
              // Submit the new high score to the damage leaderboard
              try {
                  await db.collection("damageLeaderboard").doc(gameState.playerName).set({
                      name: gameState.playerName,
                      totalDamage: Math.floor(gameState.dojoPersonalBest)
                  }, { merge: true });
                  showToast("New damage score submitted to leaderboard!");
              } catch(e) {
                  console.error("Failed to submit damage score", e);
              }
          }
      
          // This part handles the old turn-based battle system state
          battleState.isActive = false;
          gameState.healthPotions = (gameState.healthPotions || 0) - battleState.potionsUsedThisBattle;
          
          let title = ""; 
          let rewardText = "";
      
          if (playerWon) {
              // This is the logic path for winning a Genesis Arena battle
              if (genesisState.isBattleMode) {
                  const battleLevel = gameState.highestBattleLevelCompleted + 1;
                  gameState.highestBattleLevelCompleted = battleLevel;
                  gameState.counters.battlesCompleted = (gameState.counters.battlesCompleted || 0) + 1;
                  checkAllAchievements();
                  playSound('victory', 1, 'triangle', 523, 1046, 0.4);
                  
                  let bonusItem = generateItem();
                  title = `Battle Level ${battleLevel} Complete!`;
                  
                  const goldReward = 100 * battleLevel;
                  const xpReward = 200 * battleLevel;
                  gameState.gold += goldReward;
                  addXP(gameState, xpReward);
                  
                  const totalDamageDealt = Math.floor(genesisState.totalDamageDealtThisBattle);
                  
                  // --- FIX: The reward prompt now includes the total damage dealt. ---
                  rewardText = `You are victorious!<br><br>Total Rewards:<br>+${goldReward.toLocaleString()} Gold<br>+${xpReward.toLocaleString()} XP<br>Total Damage Dealt: ${totalDamageDealt.toLocaleString()}<br><br>Completion Bonus:<br><strong style="color:${bonusItem.rarity.color}">${bonusItem.name}</strong>`;
                  
                  gameState.inventory.push(bonusItem);
              }
          } else { // Player lost
              playSound('defeat', 1, 'sine', 440, 110, 0.8);
              if (gameState.resources.hp <= 0) {
                  title = "Defeated!";
                  rewardText = "You black out and wake up back home. You lost half your current gold.";
                  gameState.gold = Math.floor(gameState.gold / 2);
                  gameState.resources.hp = 1; // Restore 1 HP so the player isn't stuck
              } else {
                  title = "Fled from Battle";
                  rewardText = "You escaped, but gained no rewards.";
              }
          }
          
          stopGameGenesis(); // Stop the arena visualization
          setTimeout(() => { 
              showScreen('game-screen');
              startGameGenesis(); // Restart in endless mode
              if (title) showNotification(title, rewardText);
              saveGame(); 
              updateUI(); 
          }, 500); // A short delay before showing the results
      }
  
      function feedInBattle() {
          if (!battleState.isActive) return;
      
          const availablePotions = (gameState.healthPotions || 0) - battleState.potionsUsedThisBattle;
          if (availablePotions <= 0) {
              showToast("No potions left!");
              return;
          }
          if (battleState.playerHp >= gameState.resources.maxHp) {
              showToast("Health is already full!");
              return;
          }
      
          attackBtn.disabled = true;
          fleeBtn.disabled = true;
          feedBattleBtn.disabled = true;
      
          battleState.potionsUsedThisBattle++;
          const healAmount = Math.floor(gameState.resources.maxHp * 0.5);
          battleState.playerHp = Math.min(gameState.resources.maxHp, battleState.playerHp + healAmount);
      
          playSound('feed', 1, 'sine', 200, 600, 0.2);
          addBattleLog(`You use a potion and heal for ${healAmount} HP!`, 'log-player');
          updateBattleHud();
      
          // The enemy attacks after you heal
          setTimeout(handleEnemyAttack, 1500);
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
  
       // --- EVENT LISTENERS (Corrected) ---
       startGameBtn.addEventListener('click', startGame);
       loadGameBtn.addEventListener('click', loadGame);
       characterSprite.addEventListener('click', (e) => handleTap(e, false)); 
       characterSprite.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e.touches[0], false); }, {passive: false});
       partnerSprite.addEventListener('click', (e) => handleTap(e, true)); 
       partnerSprite.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(e.touches[0], true); }, {passive: false});
       modalCloseBtn.addEventListener('click', () => modal.classList.remove('visible'));
       feedBtn.addEventListener('click', feed); 
       // --- DOJO EVENT LISTENERS ---
      dojoBtn.addEventListener('click', enterDojo);
      dojoExitBtn.addEventListener('click', exitDojo);

        // Handle both mouse and touch for the hold-to-attack mechanic
      dojoDummySprite.addEventListener('mousedown', startDojoSession);
      dojoDummySprite.addEventListener('mouseup', stopDojoSession);
      dojoDummySprite.addEventListener('mouseleave', stopDojoSession); // Stop if mouse leaves the dummy
      dojoDummySprite.addEventListener('touchstart', (e) => {
           e.preventDefault(); // Important for mobile to prevent scrolling
           startDojoSession();
       }, { passive: false });
      dojoDummySprite.addEventListener('touchend', stopDojoSession);
      dojoDummySprite.addEventListener('touchcancel', stopDojoSession);
      
      // vvv ADD THIS NEW LISTENER vvv
      // Use Event Delegation for the dynamically created rewards button
      playerStatPanel.addEventListener('click', (event) => {
          // Check if the element that was actually clicked has the ID 'rewards-btn'
          if (event.target && event.target.id === 'rewards-btn') {
              // If it is our button, run the function!
              showRewardsModal();
          }
      });
      // ^^^ END OF NEW LISTENER ^^^
        
      closeRewardsBtn.addEventListener('click', () => rewardsModal.classList.remove('visible'));
      battleBtn.addEventListener('click', startBattle);
      attackBtn.addEventListener('click', handlePlayerAttack);
      feedBattleBtn.addEventListener('click', feedInBattle); 
      fleeBtn.addEventListener('click', () => endBattle(false));
 
      expeditionBtn.addEventListener('click', () => { generateAndShowExpeditions(); showScreen('expedition-screen'); }); 
 
      shopBtn.addEventListener('click', () => { 
          updateShopUI(); 
          shopModal.classList.add('visible'); 
          gtag('config', 'G-4686TXHCHN', { 'page_path': '/shop' });
      });
      
 
      expeditionCancelBtn.addEventListener('click', () => {
        showScreen('game-screen');
        startGameGenesis(); // <-- ADD THIS LINE
      });
 
      ingameMenuBtn.addEventListener('click', () => {
          /*if (gameState.level >= ASCENSION_LEVEL || gameState.ascension.tier > 1) {
              ascensionBtn.style.display = 'block';
          } else {
              ascensionBtn.style.display = 'none';
          }*/
          ingameMenuModal.classList.add('visible');
          gtag('config', 'G-4686TXHCHN', { 'page_path': '/menu' });
      });
 
      returnToGameBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); });
      saveGameBtn.addEventListener('click', () => saveGame(true));
      quitToTitleBtn.addEventListener('click', () => { ingameMenuModal.classList.remove('visible'); showScreen('main-menu-screen'); });
 
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
      closeLeaderboardBtn.addEventListener('click', () => { leaderboardModal.classList.remove('visible'); });
  
      achievementsBtn.addEventListener('click', () => { 
          updateAchievementsUI(); 
          achievementsModal.classList.add('visible'); 
          gtag('config', 'G-4686TXHCHN', { 'page_path': '/achievements' }); 
      }); 
      closeAchievementsBtn.addEventListener('click', () => { achievementsModal.classList.remove('visible'); });
  
      ascensionBtn.addEventListener('click', () => { 
          updatePerksUI(); 
          ascensionModal.classList.add('visible'); 
          gtag('config', 'G-4686TXHCHN', { 'page_path': '/ascension' });
      });
      closeAscensionBtn.addEventListener('click', () => { ascensionModal.classList.remove('visible'); }); confirmAscensionBtn.addEventListener('click', ascend);
  
      closeShopBtn.addEventListener('click', () => { shopModal.classList.remove('visible'); });
  
      forgeBtn.addEventListener('click', () => { 
          updateForgeUI(); 
          forgeModal.classList.add('visible'); 
          gtag('config', 'G-4686TXHCHN', { 'page_path': '/forge' });
      });
      closeForgeBtn.addEventListener('click', () => { forgeSlots = [null, null]; forgeModal.classList.remove('visible'); });
      forgeBtnAction.addEventListener('click', forgeItems);
      function openInventoryForForgeSelection(slotIndex) {
        currentForgeSelectionTarget = slotIndex;
        updateInventoryUI(); // Update inventory to use forge selection logic
        forgeModal.classList.remove('visible');
        inventoryModal.classList.add('visible');
        // Update prompt text in inventory
        document.getElementById("inventory-prompt-text").textContent = `Select an item for Forge Slot ${slotIndex + 1}.`;
    }
      
      [forgeSlot1Div, forgeSlot2Div].forEach((slot, index) => {
          slot.addEventListener('click', () => {
              if (forgeSlots[index]) {
                  // If slot is filled, click to clear it
                  forgeSlots[index] = null;
                  updateForgeUI();
              } else {
                  // If slot is empty, click to open inventory for selection
                  openInventoryForForgeSelection(index);
              }
          });
      });
      switchCharacterBtn.addEventListener('click', () => showScreen('partner-screen'));
      switchToMainBtn.addEventListener('click', () => showScreen('game-screen'));
      
      // Auth and Settings listeners
      optionsBtn.addEventListener('click', () => { 
        updateSettingsUI(); 
        optionsModal.classList.add('visible'); 
        gtag('config', 'G-4686TXHCHN', { 'page_path': '/options' }); // <-- Now it's inside
      });      
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
        
      closeRewardsBtn.addEventListener('click', () => rewardsModal.classList.remove('visible'));
      
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
      growBtn.addEventListener('click', toggleGrowthMode);
      genesisArena.addEventListener('click', (e) => {
        if (!genesisState.isActive || !genesisState.player) return;
    
        const arenaRect = genesisArena.getBoundingClientRect();
        const clickX = e.clientX - arenaRect.left;
        const clickY = e.clientY - arenaRect.top;
    
        genesisState.player.manualDestination = { x: clickX, y: clickY };
      });
      init();
  });
