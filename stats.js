const achievements = {
    tap100: { name: "Novice Tapper", desc: "Tap 100 times.", target: 100, unlocked: false, reward: { type: 'gold', amount: 500 } },
    tap1000: { name: "Adept Tapper", desc: "Tap 1,000 times.", target: 1000, unlocked: false, reward: { type: 'gold', amount: 1000000 } },
    tap10000: { name: "Master Tapper", desc: "Tap 10,000 times.", target: 10000, unlocked: false, reward: { type: 'gold', amount: 10000000 } },
    level10: { name: "Getting Stronger", desc: "Reach level 10.", target: 10, unlocked: false, reward: { type: 'item', rarity: 'rare' } },
    level25: { name: "Seasoned Guardian", desc: "Reach level 15.", target: 15, unlocked: false, reward: { type: 'item', rarity: 'rare' } },
    level50: { name: "True Champion", desc: "Reach the Ascension level.", target: 50, unlocked: false, reward: { type: 'gold', amount: 50000000 } },
    defeat10: { name: "Slayer", desc: "Defeat 10 enemies.", target: 10, unlocked: false, reward: { type: 'gold', amount: 100000 } },
    defeat100: { name: "Monster Hunter", desc: "Defeat 100 enemies.", target: 100, unlocked: false, reward: { type: 'gold', amount: 5000000 } },
    defeat500: { name: "Death Bringer", desc: "Defeat 500 enemies.", target: 500, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
    ascend1: { name: "New Beginning", desc: "Ascend for the first time.", target: 1, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
    ascend5: { name: "World Walker", desc: "Reach Ascension Tier 5.", target: 5, unlocked: false, reward: { type: 'item', rarity: 'legendary' } },
    battle1: { name: "Battle Runner", desc: "Complete a Battle sequence once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2000000 } },
    forge1: { name: "Apprentice Blacksmith", desc: "Forge an item once.", target: 1, unlocked: false, reward: { type: 'gold', amount: 75000 } },
    findLegendary: { name: "A Glimmer of Power", desc: "Find your first Legendary item.", target: 1, unlocked: false, reward: { type: 'gold', amount: 2500000 } },
    masterGuardian: { name: "Master Guardian", desc: "Reach Ascension Tier 5 and Level 50.", target: 1, unlocked: false, reward: { type: 'egg' } }
};
const perks = {
    vigor: { name: "Guardian's Vigor", desc: "+10 Max HP & Energy per level.", maxLevel: 1000, cost: [1, 1, 2, 2, 3] },
    tapXp: { name: "Tapper's Insight", desc: "+10% XP from Taps per level.", maxLevel: 1000, cost: [1, 1, 2, 2, 3] },
    goldBoost: { name: "Fortune's Favor", desc: "+5% Gold from all sources per level.", maxLevel: 1000, cost: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] },
    expeditionSpeed: { name: "Expeditionary Leader", desc: "-5% Expedition Duration per level.", maxLevel: 1000, cost: [1, 2, 2, 3, 3] }
};
const itemData = {
  rarities: {
      common: { weight: 70, budget: 1, affixes: 1 },
      uncommon: { weight: 20, budget: 1.4, affixes: 2 },
      rare: { weight: 7, budget: 1.9, affixes: 2 },
      epic: { weight: 2.5, budget: 2.5, affixes: 3 },
      legendary: { weight: 0.5, budget: 3.5, affixes: 4 }
  },
  rarityTiers: [ 'common', 'uncommon', 'rare', 'epic', 'legendary' ],
  weaponColors: ['#BDBDBD', '#4CAF50', '#FF9800', '#F44336', '#E91E63'],
  armorColors: ['#CD7F32', '#2196F3', '#9C27B0', '#FFC107', '#FFFFFF'],
  types: { weapon: { base: ['Katana', 'Hammer', 'Axe', 'Knife'], primary: 'strength' }, armor: { base: ['Helmet', 'Jacket', 'Boots', 'Armor'], primary: 'fortitude' } },
  prefixes: { strength: 'Rusty', fortitude: 'Sturdy', agility: 'Swift', critChance: 'Deadly', goldFind: 'Lucky' },
  suffixes: { strength: 'of Death', fortitude: 'of the tank', agility: 'of the Viper', critChance: 'of Piercing', goldFind: 'of Greed' },
  affixes: ['agility', 'critChance', 'goldFind']
};
const shopItems = {
    storableHealthPotion: { name: "Health Potion", desc: "A storable potion for battle. Restores 50% HP.", cost: 550, type: 'consumable' },
    energyPotion: { name: "Energy Potion", desc: "Instantly restores 10% of your Max Energy.", cost: 500, type: 'consumable' },
    xpBoost: { name: "Scroll of Wisdom", desc: "+50% XP from all sources for 15 minutes.", cost: 500, type: 'buff', duration: 900 }
};
const permanentShopUpgrades = {
    strTraining: { name: "Strength Training", desc: "Permanently increases base Strength.", stat: 'strength', bonus: 3, levelReq: 10, maxLevel: 10000, cost: (level) => 1 * Math.pow(1.5, level) },
    forTraining: { name: "Fortitude Training", desc: "Permanently increases base Fortitude.", stat: 'fortitude', bonus: 3, levelReq: 10, maxLevel: 10000, cost: (level) => 1 * Math.pow(1.5, level) },
    agiTraining: { name: "Agility Training", desc: "Permanently increases base Agility.", stat: 'agility', bonus: 1, levelReq: 10, maxLevel: 5000, cost: (level) => 1 * Math.pow(3.79, level) },
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
  { day: 1, rewards: [
      { type: 'gold', amount: 5000 }
  ]},
  { day: 2, rewards: [
      { type: 'gold', amount: 1000000 }
  ]},
  { day: 3, rewards: [
      { type: 'consumable', id: 'storableHealthPotion', amount: 200 },
      { type: 'edgestones', amount: 25 }
  ]},
  { day: 4, rewards: [
      { type: 'gold', amount: 2500000 }
  ]},
  { day: 5, rewards: [
      { type: 'consumable', id: 'storableHealthPotion', amount: 500 }
  ]},
  { day: 6, rewards: [
      { type: 'gold', amount: 5000000 },
      { type: 'edgestones', amount: 75 }
  ]},
  { day: 7, rewards: [
      { type: 'item', rarity: 'rare' }
  ]}
];
const skillsData = {
    aoeSlash: {
        name: 'Guardian\'s Blade',
        desc: 'Increases the damage of your basic attacks.',
        bonusPerLevel: 1,
        cost: (level) => Math.floor(5 * Math.pow(1.12, level)),
        maxLevel: 1000
    },
    dash: {
        name: 'Dash',
        desc: 'Increases the damage of Dash impacts.',
        bonusPerLevel: 2,
        cost: (level) => Math.floor(10 * Math.pow(1.15, level)),
        maxLevel: 1000
    },
    thunderStrike: {
        name: 'Thunder Strike',
        desc: 'Increases the damage of Thunder Strike.',
        bonusPerLevel: 2,
        cost: (level) => Math.floor(10 * Math.pow(1.15, level)),
        maxLevel: 1000
    },
    havocRage: {
        name: 'Havoc Rage',
        desc: 'Increases the damage-over-time of Havoc Rage.',
        bonusPerLevel: 3,
        cost: (level) => Math.floor(15 * Math.pow(1.18, level)),
        maxLevel: 1000
    },
};
const potentialsData = {
  attack_power_percent: {
      name: 'Attack Power (%)',
      icon: 'https://i.imgur.com/KxISF7H.png',
      cost: (level) => Math.pow(1.25, level) * 0.0001,
      bonusPerLevel: 0.5,
      formatBonus: (bonus) => `+${bonus.toFixed(2)}%`
  },
  hp_percent: {
      name: 'Health (%)',
      icon: 'https://i.imgur.com/vHq4D3x.png',
      cost: (level) => Math.pow(1.24, level) * 0.0001,
      bonusPerLevel: 0.8,
      formatBonus: (bonus) => `+${bonus.toFixed(2)}%`
  },
  crit_damage_percent: {
      name: 'Crit Damage (%)',
      icon: 'https://i.imgur.com/gYg28r0.png',
      cost: (level) => Math.pow(1.3, level) * 0.0002,
      bonusPerLevel: 1.5,
      formatBonus: (bonus) => `+${bonus.toFixed(2)}%`
  },
  gold_find_percent: {
      name: 'Gold Find (%)',
      icon: 'https://i.imgur.com/l2sOKe8.png',
      cost: (level) => Math.pow(1.2, level) * 0.00005,
      bonusPerLevel: 1,
      formatBonus: (bonus) => `+${bonus.toFixed(2)}%`
  },
  xp_gain_percent: {
      name: 'Experience Gain (%)',
      icon: 'https://i.imgur.com/rN5g4dF.png',
      cost: (level) => Math.pow(1.22, level) * 0.00008,
      bonusPerLevel: 1,
      formatBonus: (bonus) => `+${bonus.toFixed(2)}%`
  }
};
const awakeningData = {
    stamina: {
        name: 'Stamina',
        desc: 'Increases Max Energy and passive Energy Regeneration.',
        icon: 'https://i.imgur.com/your-stamina-icon.png',
        cost: (level) => Math.floor(1000 * Math.pow(1.25, level))
    },
    wisdom: {
        name: 'Wisdom',
        desc: 'Increases all Experience gained from combat and rewards.',
        icon: 'https://i.imgur.com/your-wisdom-icon.png',
        cost: (level) => Math.floor(1500 * Math.pow(1.27, level))
    },
    weaponMastery: {
        name: 'Weapon Damage',
        desc: 'Increases all damage dealt and Legendary Weapon drop rates.',
        icon: 'https://i.imgur.com/your-weapon-icon.png',
        cost: (level) => Math.floor(2000 * Math.pow(1.3, level))
    },
    armorMastery: {
        name: 'Armor Protection',
        desc: 'Increases Fortitude and Legendary Armor drop rates.',
        icon: 'https://i.imgur.com/your-armor-icon.png',
        cost: (level) => Math.floor(2000 * Math.pow(1.3, level))
    },
    attackSpeed: {
        name: 'Attack Speed',
        desc: 'Slightly increases your attack speed in combat.',
        icon: 'https://i.imgur.com/your-speed-icon.png',
        cost: (level) => Math.floor(5000 * Math.pow(1.35, level))
    }
};

const HungerSystem = {
  isExhausted: false,

  updateBar() {
      if (!gameState.satiation) return;
      const percent = (gameState.satiation / gameState.maxSatiation) * 100;
      hungerBarFill.style.height = `${percent}%`;
  },

  updatePassiveDrain() {
      if (gameState.satiation > 0) {
          const passiveCost = 0.02 * gameState.ascension.tier;
          gameState.satiation = Math.max(0, gameState.satiation - passiveCost);
          this.updateBar();
          if (gameState.satiation === 0) {
              this.handleConsequences();
          }
      }
  },

  drainOnAction(actionType) {
      if (gameState.satiation <= 0) return;
      const baseCost = actionType === 'tap' ? 0.05 : 0.003;
      const cost = baseCost * (1 + (gameState.level / 100)) * gameState.ascension.tier;

      gameState.satiation = Math.max(0, gameState.satiation - cost);
      this.updateBar();
      if (gameState.satiation === 0) {
          this.handleConsequences();
      }
  },

  replenish() {
      gameState.satiation = Math.min(gameState.maxSatiation, gameState.satiation + 500);
      this.isExhausted = false;
      this.updateBar();
  },

  canPerformAction() {
      return gameState.satiation > 0;
  },

  handleConsequences() {
      if (this.isExhausted) return;

      this.isExhausted = true;
      showToast("Your Guardian is exhausted and hungry!");
      playSound('defeat', 0.8, 'sine', 300, 100, 0.5);

      if (battleState.isActive) {
          addBattleLog("You're too hungry to fight!", "log-enemy");
          setTimeout(() => endBattle(false), 1500);
          return;
      }

      if (genesisState.isActive) {
          genesisState.enemies.forEach(enemy => {
              if (enemy.element) enemy.element.remove();
              if (enemy.healthBarContainer) enemy.healthBarContainer.remove();
          });
          genesisState.enemies = [];
      }

      const feedBtnRect = feedBtn.getBoundingClientRect();
      createFloatingText("Feed me!", feedBtnRect.left, feedBtnRect.top - 20, {
          color: 'var(--xp-color)',
          fontSize: '1.5em'
      });
  }
};

function getXpForNextLevel(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1));
}

function addXP(character, amount) {
    if (character.isPartner && gameState.expedition.active) return;
    const tierMultiplier = Math.pow(1.2, gameState.ascension.tier - 1);
    let finalAmount = amount * tierMultiplier;
    if (gameState.activeBuffs.xpBoost && !character.isPartner) {
        finalAmount *= 1.5;
    }
    finalAmount *= (1 + getPotentialBonus('xp_gain_percent') / 100);
    finalAmount *= (1 + (getAwakeningBonus('wisdom') * 0.05));
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
    } else {
        checkAllAchievements();
        submitScoreToLeaderboard();
        updateAscensionVisuals();

        let screenX, screenY;
        if (genesisState.isActive && genesisState.player) {
            const arenaRect = genesisArena.getBoundingClientRect();
            screenX = arenaRect.left + genesisState.player.x;
            screenY = arenaRect.top + genesisState.player.y - 50;
        } else {
            const spriteRect = characterSprite.getBoundingClientRect();
            screenX = spriteRect.left + (spriteRect.width / 2);
            screenY = spriteRect.top;
        }
        createFloatingText('LEVEL UP!', screenX, screenY, {
            color: 'var(--accent-color)',
            fontSize: '2.5em',
            duration: 2500
        });
    }

    saveGame();
}

function getTotalStat(stat) {
    let total = gameState.stats[stat] || 0;

    if (gameState.permanentUpgrades) {
        for (const upgradeId in gameState.permanentUpgrades) {
            const upgradeData = permanentShopUpgrades[upgradeId];
            if (upgradeData && upgradeData.stat === stat) {
                total += (gameState.permanentUpgrades[upgradeId] || 0) * upgradeData.bonus;
            }
        }
    }
    for (const slot in gameState.equipment) {
        const item = gameState.equipment[slot];
        if (item && item.stats && item.stats[stat]) {
            total += item.stats[stat];
        }
    }
    if (stat === 'goldFind' && gameState.ascension.perks) {
        total += (gameState.ascension.perks.goldBoost || 0) * 5;
    }
    if (stat === 'strength') {
        total += getAwakeningBonus('weaponMastery') * 10;
    }
    if (stat === 'fortitude') {
        total += getAwakeningBonus('armorMastery') * 10;
    }
    if (stat === 'strength') {
        const attackPowerBonus = getPotentialBonus('attack_power_percent');
        total *= (1 + attackPowerBonus / 100);
        return Math.round(total);
    }

    if (stat === 'goldFind') {
        const goldFindBonus = getPotentialBonus('gold_find_percent');
        total += goldFindBonus;
    }

    return total;
}

function ascend() {
    if (gameState.level < ASCENSION_LEVEL) {
        showNotification("Not Ready", `You must reach Level ${ASCENSION_LEVEL} to Ascend.`);
        return;
    }
    if (confirm(`Are you sure you want to Ascend?\n\nYour Level, Stats, Gold, and Equipment will be reset.\n\nYou will advance to World Tier ${gameState.ascension.tier + 1} and gain 1 Ascension Point. Your Perks and Permanent Shop Upgrades will remain.`)) {
        gameState.ascension.tier++;
        gameState.ascension.points++;
        gameState.counters.ascensionCount = (gameState.counters.ascensionCount || 0) + 1;
        checkAllAchievements();
        playSound('ascend', 1, 'sawtooth', 100, 1000, 1);
        gameState.edgeStones = (gameState.edgeStones || 0) + 50;
        gameState.level = 1;
        gameState.xp = 0;
        gameState.gold = 0;
        gameState.stats = JSON.parse(JSON.stringify(defaultState.stats));
        gameState.inventory = [];
        const oldHp = gameState.resources.hp;
        const oldEnergy = gameState.resources.energy;
        gameState.resources = JSON.parse(JSON.stringify(defaultState.resources));
        updateUI();
        gameState.resources.hp = Math.min(oldHp, gameState.resources.maxHp);
        gameState.resources.energy = Math.min(oldEnergy, gameState.resources.maxEnergy);
        submitScoreToLeaderboard();
        updateAscensionVisuals();
        saveGame();
        updateUI();
        ingameMenuModal.classList.remove('visible');
        const notificationText = `Welcome to World Tier ${gameState.ascension.tier}. You have gained 1 Ascension Point to spend.<br><br>Bonus Reward: <strong style="color: #00FFFF;">♦️ 50 EdgeStones</strong>`;
        showNotification("ASCENDED!", notificationText);
    }
}

function generateItem(forceRarity = null) {
    let chosenRarityKey = forceRarity;

    if (!chosenRarityKey) {
        let roll = Math.random() * 100;

        if (gameState.immortalGrowth) {
            const weaponBonus = getAwakeningBonus('weaponMastery') * 0.1;
            const armorBonus = getAwakeningBonus('armorMastery') * 0.1;
            roll -= (weaponBonus + armorBonus);
        }

        let cumulativeWeight = 0;
        for (const key in itemData.rarities) {
            cumulativeWeight += itemData.rarities[key].weight;
            if (roll < cumulativeWeight) {
                chosenRarityKey = key;
                break;
            }
        }
    }

    const rarity = itemData.rarities[chosenRarityKey];
    const itemTypeKey = Math.random() < 0.5 ? 'weapon' : 'armor';
    const rarityIndex = itemData.rarityTiers.indexOf(chosenRarityKey);
    const itemColor = itemTypeKey === 'weapon' ? itemData.weaponColors[rarityIndex] : itemData.armorColors[rarityIndex];
    const itemType = itemData.types[itemTypeKey];
    const baseName = itemType.base[Math.floor(Math.random() * itemType.base.length)];
    const primaryStat = itemType.primary;
    const stats = {};
    let power = 0;
    const totalBudget = (gameState.level + (gameState.ascension.tier * 5)) * rarity.budget;
    stats[primaryStat] = Math.ceil(totalBudget * 0.6);
    power += stats[primaryStat];
    let availableAffixes = [...itemData.affixes];
    let namePrefix = itemData.prefixes[primaryStat];
    let nameSuffix = '';
    for (let i = 1; i < rarity.affixes && availableAffixes.length > 0; i++) {
        const affixIndex = Math.floor(Math.random() * availableAffixes.length);
        const affix = availableAffixes.splice(affixIndex, 1)[0];
        let value;
        if (affix === 'critChance' || affix === 'goldFind') {
            value = Math.max(1, Math.ceil(totalBudget * 0.15 * (Math.random() * 0.5 + 0.75)));
            power += value * 3;
        } else {
            value = Math.ceil(totalBudget * 0.25 * (Math.random() * 0.5 + 0.75));
            power += value;
        }
        stats[affix] = value;
        if (i === 1) {
            nameSuffix = itemData.suffixes[affix];
        }
    }
    return {
        type: itemTypeKey,
        name: `${namePrefix} ${baseName} ${nameSuffix}`.trim(),
        rarity: { key: chosenRarityKey, color: itemColor },
        stats: stats,
        power: power,
        reforgeCount: 0,
        refineLevel: 0
    };
}

function equipItem(itemToEquip) {
    const itemIndex = gameState.inventory.findIndex(i => i && i.name === itemToEquip.name);
    if (itemIndex === -1) return;
    gameState.equipment[itemToEquip.type] = itemToEquip;
    updateUI();
    saveGame();
}

function refineItem(itemName) {
    const itemIndex = gameState.inventory.findIndex(i => i && i.name === itemName);
    if (itemIndex === -1) return;

    const item = gameState.inventory[itemIndex];

    if ((item.reforgeCount || 0) < 3) {
        showToast("Only fully reforged items (3/3) can be refined.");
        return;
    }

    const cost = 5;
    if ((gameState.edgeStones || 0) < cost) {
        showToast(`Not enough EdgeStones. Need ${cost}.`);
        return;
    }

    gameState.edgeStones -= cost;

    item.refineLevel = (item.refineLevel || 0) + 1;

    for (const stat in item.stats) {
        item.stats[stat] = Math.ceil(item.stats[stat] * 1.05);
    }
    item.power = Object.values(item.stats).reduce((a, b) => a + b, 0);

    item.name = item.name.replace(/ \+\d+$/, '');
    item.name += ` +${item.refineLevel}`;

    playSound('ascend', 0.8, 'sawtooth', 400, 1200, 0.3);
    showToast(`${item.name} refined!`);

    updateInventoryUI();
    updateUI();
    saveGame();
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

function buyPerk(perkId) {
    const perkData = perks[perkId];
    const currentLevel = gameState.ascension.perks[perkId] || 0;
    if (currentLevel >= perkData.maxLevel) return;
    const cost = perkData.cost[currentLevel];
    if (gameState.ascension.points >= cost) {
        gameState.ascension.points -= cost;
        gameState.ascension.perks[perkId] = (gameState.ascension.perks[perkId] || 0) + 1;
        playSound('levelUp', 0.8, 'sine', 600, 1200, 0.2);
        updatePerksUI();
        updateUI();
        saveGame();
    }
}

function buyShopItem(itemId, type) {
    if (type === 'permanent') {
        const upgrade = permanentShopUpgrades[itemId];
        const currentLevel = gameState.permanentUpgrades[itemId] || 0;
        const cost = upgrade.cost(currentLevel);
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.permanentUpgrades[itemId] = currentLevel + 1;
            showToast(`Purchased ${upgrade.name} Level ${currentLevel + 1}!`);
        }
    } else {
        const item = shopItems[itemId];
        if (gameState.gold >= item.cost) {
            gameState.gold -= item.cost;
            switch (itemId) {
                case 'storableHealthPotion':
                    gameState.healthPotions = (gameState.healthPotions || 0) + 1;
                    break;
                case 'energyPotion':
                    gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + gameState.resources.maxEnergy * 0.1);
                    break;
                case 'xpBoost':
                    gameState.activeBuffs[itemId] = { expiry: Date.now() + item.duration * 1000 };
                    break;
            }
            showToast(`Purchased ${item.name}!`);
        }
    }
    updateUI();
    updateShopUI();
    saveGame();
}

function calculateSellValue(item) {
    if (!item) return 0;

    const rarityMultiplier = {
        common: 1,
        uncommon: 2.5,
        rare: 5,
        epic: 10,
        legendary: 25
    };

    const baseValue = item.power * 2;
    const rarityMod = rarityMultiplier[item.rarity.key] || 1;

    return Math.floor(baseValue * rarityMod);
}

function getPotentialBonus(statId) {
    if (gameState.immortalGrowth && gameState.immortalGrowth.potentials && gameState.immortalGrowth.potentials[statId]) {
        const level = gameState.immortalGrowth.potentials[statId];
        const data = potentialsData[statId];
        return level * data.bonusPerLevel;
    }
    return 0;
}

function getAwakeningBonus(statId) {
    if (gameState.immortalGrowth && gameState.immortalGrowth.awakening && gameState.immortalGrowth.awakening[statId]) {
        return gameState.immortalGrowth.awakening[statId] || 0;
    }
    return 0;
}

function calculateGradeInfo(level) {
    const grades = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSR'];
    const colors = {
        D: '#9E9E9E',
        C: '#4CAF50',
        B: '#2196F3',
        A: '#9C27B0',
        S: '#FF9800',
        SS: '#F44336',
        SSR: '#E91E63',
        MAX: '#FFD700'
    };

    const MAX_POTENTIAL_LEVEL = 925;
    if (level >= MAX_POTENTIAL_LEVEL) {
        return { grade: 'MAX', color: colors.MAX };
    }

    const tier = Math.floor(level / 25);

    if (tier < grades.length) {
        const gradeKey = grades[tier];
        return { grade: gradeKey, color: colors[gradeKey] };
    } else {
        const s_tier = tier - grades.length;
        const number = Math.floor(s_tier / 3) + 1;
        const prefixKey = grades[4 + (s_tier % 3)];

        if (number > 10) {
            return { grade: 'MAX', color: colors.MAX };
        }

        return { grade: `${prefixKey}${number}`, color: colors[prefixKey] };
    }
}

function upgradePotentialStat(statId) {
    const MAX_POTENTIAL_LEVEL = 925;
    const currentLevel = gameState.immortalGrowth.potentials[statId] || 0;
    if (currentLevel >= MAX_POTENTIAL_LEVEL) {
        showToast("This potential is at its maximum grade!");
        return;
    }
    const data = potentialsData[statId];
    if (!data) return;

    const level = gameState.immortalGrowth.potentials[statId] || 0;
    const cost = data.cost(level);

    if ((gameState.edgeStones || 0) >= cost) {
        gameState.edgeStones -= cost;
        gameState.immortalGrowth.potentials[statId]++;

        playSound('levelUp', 0.5, 'sine', 800, 1000, 0.1);

        renderPotentialsTree();
        updateUI();
        saveGame();
    } else {
        showToast("Not enough EdgeStones!");
    }
}

function resetPotentials() {
    if (!confirm("Are you sure you want to reset all Potentials? You will be refunded 100% of the EdgeStones spent.")) {
        return;
    }

    let totalRefund = 0;
    for (const id in gameState.immortalGrowth.potentials) {
        const level = gameState.immortalGrowth.potentials[id];
        const data = potentialsData[id];
        for (let i = 0; i < level; i++) {
            totalRefund += data.cost(i);
        }
        gameState.immortalGrowth.potentials[id] = 0;
    }

    gameState.edgeStones = (gameState.edgeStones || 0) + totalRefund;

    showToast(`Potentials reset! Refunded ${totalRefund.toFixed(4)} EdgeStones.`);
    playSound('ascend', 0.8, 'sawtooth', 800, 100, 0.4);

    renderPotentialsTree();
    updateUI();
    saveGame();
}

function upgradeAwakeningStat(statId) {
    const data = awakeningData[statId];
    if (!data) return;

    const level = gameState.immortalGrowth.awakening[statId] || 0;
    const cost = data.cost(level);

    if (gameState.gold >= cost) {
        gameState.gold -= cost;
        gameState.immortalGrowth.awakening[statId]++;

        playSound('ascend', 0.7, 'sawtooth', 300, 900, 0.3);

        renderAwakeningTree();
        updateUI();
        saveGame();
    } else {
        showToast("Not enough Gold!");
    }
}

function getSkillBonus(skillId) {
    if (gameState.immortalGrowth && gameState.immortalGrowth.skills && gameState.immortalGrowth.skills[skillId]) {
        const level = gameState.immortalGrowth.skills[skillId];
        const data = skillsData[skillId];
        return level * data.bonusPerLevel;
    }
    return 0;
}

function upgradeSkill(skillId) {
    const data = skillsData[skillId];
    if (!data) return;

    const level = gameState.immortalGrowth.skills[skillId] || 0;
    if (level >= data.maxLevel) {
        showToast("This skill is at its maximum level!");
        return;
    }

    const cost = data.cost(level);

    if ((gameState.orbs || 0) >= cost) {
        gameState.orbs -= cost;
        gameState.immortalGrowth.skills[skillId]++;
        document.querySelector('#skills-orb-display span:last-child').textContent = (gameState.orbs || 0).toFixed(1);

        playSound('levelUp', 0.6, 'sine', 900, 1200, 0.1);

        renderSkillsModal();
        updateUI();
        saveGame();
    } else {
        showToast("Not enough Orbs!");
    }
}

function passiveResourceRegen() {
    HungerSystem.updatePassiveDrain();
    let playerUINeedsUpdate = false;
    let partnerUINeedsUpdate = false;

    if (gameState.resources && !gameState.expedition.active && !battleState.isActive) {
        if (gameState.resources.hp < gameState.resources.maxHp) {
            const hpRegenAmount = getTotalStat('stamina') * 0.05;
            gameState.resources.hp = Math.min(gameState.resources.maxHp, gameState.resources.hp + hpRegenAmount);
            playerUINeedsUpdate = true;
        }
        if (gameState.resources.energy < gameState.resources.maxEnergy) {
            const baseRegen = 0.15;
            const staminaRegenBonus = getAwakeningBonus('stamina') * 0.05;
            gameState.resources.energy = Math.min(gameState.resources.maxEnergy, gameState.resources.energy + baseRegen + staminaRegenBonus);
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