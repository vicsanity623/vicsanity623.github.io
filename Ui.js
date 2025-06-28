const effectPool = {
    floatingText: [],
};
const MAX_POOL_SIZE = 200;

function initEffectPool() {
    const container = document.body;
    for (let i = 0; i < MAX_POOL_SIZE; i++) {
        const textEl = document.createElement('div');
        textEl.className = 'floating-text';
        textEl.style.display = 'none';
        container.appendChild(textEl);
        effectPool.floatingText.push(textEl);
    }
    console.log("Effect pool initialized with", effectPool.floatingText.length, "elements.");
}

function getEffectFromPool(type) {
    const pool = effectPool[type];
    if (pool && pool.length > 0) {
        const el = pool.pop();
        el.style.display = 'block';
        return el;
    }
    return null;
}

function returnEffectToPool(type, element) {
    if (element) {
        element.style.display = 'none';
        element.style.animation = 'none';
        void element.offsetWidth;
        const pool = effectPool[type];
        if (pool) {
            pool.push(element);
        }
    }
}

const musicFileUrls = { main: 'main.mp3', battle: 'battle.mp3', expedition: 'expedition.mp3' };
const musicManager = { isInitialized: false, audio: {}, currentTrack: null, fadeInterval: null };

function initMusic() {
    if (musicManager.isInitialized) return;
    musicManager.isInitialized = true;
    playMusic('main');
}

function playMusic(trackName) {
    if (!musicManager.isInitialized || !musicManager.audio[trackName]) return;
    if (gameState.settings && gameState.settings.isMuted) return;

    const oldTrackName = musicManager.currentTrack;
    if (oldTrackName && musicManager.audio[oldTrackName]) {
        musicManager.audio[oldTrackName].pause();
        musicManager.audio[oldTrackName].currentTime = 0;
    }
    if (oldTrackName === trackName) {
        if (musicManager.audio[trackName].paused) {
            musicManager.audio[trackName].play().catch(e => console.error("Music resume failed:", e));
        }
        return;
    }

    const newTrack = musicManager.audio[trackName];
    musicManager.currentTrack = trackName;
    if (newTrack) {
        newTrack.volume = (gameState.settings) ? gameState.settings.musicVolume : 0.5;
        newTrack.play().catch(e => console.error(`Music play failed for ${trackName}:`, e));
    }
}

function startBackgroundAssetLoading() {
    for (const key in musicFileUrls) {
        if (musicFileUrls[key]) {
            const audio = new Audio(musicFileUrls[key]);
            audio.loop = true;
            audio.preload = 'auto';
            musicManager.audio[key] = audio;
        }
    }
}

function createWindEffect() {
    for (let i = 0; i < 20; i++) {
        const streak = document.createElement('div');
        streak.className = 'wind-streak';
        streak.style.top = `${Math.random() * 100}%`;
        streak.style.width = `${Math.random() * 150 + 50}px`;
        streak.style.animationDuration = `${Math.random() * 3 + 2}s`;
        streak.style.animationDelay = `${Math.random() * 5}s`;
        windAnimationContainer.appendChild(streak);
    }
}

function createStarfield() {
    const container = document.getElementById('background-stars');
    for (let i = 0; i < 100; i++) {
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
}

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
}

function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) screenToShow.classList.add('active');

    if (screenId !== 'game-screen' && genesisState.isActive) {
        stopGameGenesis();
    }

    if (screenId === 'battle-screen') {
        playMusic('battle');
    } else if (screenId === 'game-screen' || screenId === 'main-menu-screen' || screenId === 'partner-screen') {
        if (!gameState.expedition || !gameState.expedition.active) {
            playMusic('main');
        }
    }
    let virtualPagePath = '/' + screenId.replace('-screen', '');
    gtag('config', 'G-4686TXHCHN', { 'page_path': virtualPagePath });
}

function updateUI() {
    if (!gameState.stats) return;
    HungerSystem.updateBar();

    const oldMaxHp = gameState.resources.maxHp;
    const vigorBonus = (gameState.ascension.perks.vigor || 0) * 10;
    const baseMaxHp = 100 + (gameState.level - 1) * 10;
    const baseMaxEnergy = 100 + (gameState.level - 1) * 5;
    let energyUpgradeBonus = 0;
    if (gameState.permanentUpgrades.energyTraining) {
        const upgradeLevel = gameState.permanentUpgrades.energyTraining;
        const upgradeData = permanentShopUpgrades.energyTraining;
        energyUpgradeBonus = upgradeLevel * upgradeData.bonus;
    }
    const hpPotentialBonus = getPotentialBonus('hp_percent');
    gameState.resources.maxHp = Math.round((baseMaxHp + vigorBonus) * (1 + hpPotentialBonus / 100));
    const staminaBonus = getAwakeningBonus('stamina') * 25;
    gameState.resources.maxEnergy = baseMaxEnergy + vigorBonus + energyUpgradeBonus + staminaBonus;
    if (gameState.resources.maxHp > oldMaxHp) {
        const hpIncrease = gameState.resources.maxHp - oldMaxHp;
        gameState.resources.hp += hpIncrease;
    }
    gameState.resources.hp = Math.min(gameState.resources.hp, gameState.resources.maxHp);

    playerNameLevel.textContent = `${gameState.playerName} Lv. ${gameState.level}`;
    worldTierDisplay.textContent = `World Tier: ${gameState.ascension.tier}`;
    const xpForNext = getXpForNextLevel(gameState.level);
    healthBarFill.style.width = `${(gameState.resources.hp / gameState.resources.maxHp) * 100}%`;
    healthBarLabel.textContent = `HP: ${Math.floor(gameState.resources.hp)} / ${gameState.resources.maxHp}`;
    energyBarFill.style.width = `${(gameState.resources.energy / gameState.resources.maxEnergy) * 100}%`;
    energyBarLabel.textContent = `Energy: ${Math.floor(gameState.resources.energy)} / ${gameState.resources.maxEnergy}`;
    xpBarFill.style.width = `${(gameState.xp / xpForNext) * 100}%`;
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

    const createStatRow = (label, value, statKey) => {
        const color = statColors[statKey] || defaultStatColor;
        const starIcon = color !== defaultStatColor ? '<span class="equipped-icon">⭐</span>' : '';
        return `<div class="stat-item"><span class="stat-label">${label}</span><span class="stat-value" style="color: ${color};">${value} ${starIcon}</span></div>`;
    };

    let coreStatsHtml = `
        ${createStatRow('STR', getTotalStat('strength'), 'strength')}
        ${createStatRow('FOR', getTotalStat('fortitude'), 'fortitude')}
        ${createStatRow('AGI', getTotalStat('agility'), 'agility')}
        ${createStatRow('STA', getTotalStat('stamina'), 'stamina')}
        <hr class="stat-divider">
        ${createStatRow('Crit %', `${getTotalStat('critChance').toFixed(2)}%`, 'critChance')}
        ${createStatRow('Gold %', `${getTotalStat('goldFind').toFixed(2)}%`, 'goldFind')}
        <hr class="stat-divider">
        <div class="stat-item">
            <span class="stat-label">Gold</span>
            <div class="gold-rewards-row">
                <span class="stat-value stat-value-gold">${formatNumber(Math.floor(gameState.gold))}</span>
                <span class="edgestone-display"><span>♦️</span><span>${(gameState.edgeStones || 0).toFixed(4)}</span></span>
                <span class="orb-display"><span>🔮</span><span>${(gameState.orbs || 0).toFixed(1)}</span></span>
                <span class="potion-display"><span>🧪</span><span>${gameState.healthPotions || 0}</span></span>
                <button id="rewards-btn" title="View Daily & Weekly Rewards">📅</button>
            </div>
        </div>
    `;
    playerStatPanel.innerHTML = `
        ${coreStatsHtml}
        <button id="toggle-modifiers-btn">Show Details</button>
    `;

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
    const canUsePvp = gameState.level >= PVP_UNLOCK_LEVEL;
    pvpBtn.disabled = onExpedition || !canUsePvp;
    pvpUnlockText.textContent = canUsePvp ? "" : `Unlocks at LVL ${PVP_UNLOCK_LEVEL}`;
    feedBtn.disabled = onExpedition;
    inventoryBtn.disabled = onExpedition;
    shopBtn.disabled = onExpedition;

    if (onExpedition) {
        expeditionBtn.textContent = `On Expedition`;
        expeditionBtn.disabled = true;
        if (!expeditionInterval) {
            expeditionInterval = setInterval(updateExpeditionTimer, 1000);
            updateExpeditionTimer();
        }
    } else {
        expeditionBtn.textContent = `Expedition`;
        expeditionBtn.disabled = false;
    }

    if (gameState.tutorialCompleted) {
        tutorialOverlay.classList.remove('visible');
    } else {
        tutorialOverlay.classList.add('visible');
    }

    switchCharacterBtn.style.display = gameState.hasEgg ? 'block' : 'none';
    updatePartnerUI();
}

function renderAndShowDetailedStats() {
    const listContainer = document.getElementById('detailed-stats-list');
    const modal = document.getElementById('detailed-stats-modal');
    listContainer.innerHTML = '';
    let modifiersHtml = '';
    Object.keys(potentialsData).forEach(id => {
        const level = gameState.immortalGrowth.potentials[id] || 0;
        if (level > 0) {
            const data = potentialsData[id];
            const bonus = level * data.bonusPerLevel;
            const gradeInfo = calculateGradeInfo(level);
            modifiersHtml += `<div class="modifier-row"><span class="modifier-label"><span class="modifier-grade" style="color: ${gradeInfo.color};">[${gradeInfo.grade}]</span>${data.name}</span> <span class="modifier-value">+${bonus.toFixed(2)}%</span></div>`;
        }
    });
    Object.keys(awakeningData).forEach(id => {
        const level = gameState.immortalGrowth.awakening[id] || 0;
        if (level > 0) {
            const data = awakeningData[id];
            let bonusText = '';
            if (id === 'weaponMastery') bonusText = `+${level * 10} STR`;
            else if (id === 'armorMastery') bonusText = `+${level * 10} FOR`;
            else if (id === 'attackSpeed') bonusText = `+${level * 1}% Attack Speed`;
            else if (id === 'wisdom') bonusText = `+${level * 5}% XP Gain`;
            else if (id === 'stamina') bonusText = `+${level * 25} Max Energy`;
            modifiersHtml += `<div class="modifier-row"><span class="modifier-label">${data.name} (Lv. ${level})</span> <span class="modifier-value">${bonusText}</span></div>`;
        }
    });
    Object.keys(skillsData).forEach(id => {
        const level = gameState.immortalGrowth.skills[id] || 0;
        if (level > 0) {
            const data = skillsData[id];
            const bonus = level * data.bonusPerLevel;
            modifiersHtml += `<div class="modifier-row"><span class="modifier-label">${data.name} (Lv. ${level})</span> <span class="modifier-value">+${bonus.toFixed(1)}% Damage</span></div>`;
        }
    });

    if (modifiersHtml === '') {
        modifiersHtml = '<p style="text-align: center; opacity: 0.7;">No active modifiers yet. Upgrade them in the Growth menu!</p>';
    }

    listContainer.innerHTML = modifiersHtml;
    modal.classList.add('visible');
}

function showNotification(title, text) {
    modal.classList.add('visible');
    modalTitle.textContent = title;
    modalText.innerHTML = text;
}

function updateFrenzyVisuals() {
    const multiplier = tapCombo.currentMultiplier;
    const root = document.documentElement;
    if (multiplier > 1) {
        let color = 'var(--accent-color)';
        if (multiplier >= 15) {
            color = 'var(--health-color)';
        } else if (multiplier >= 10) {
            color = 'var(--xp-color)';
        }
        root.style.setProperty('--frenzy-glow-color', color);
        frenzyDisplay.textContent = `x${multiplier}`;
        frenzyDisplay.style.color = color;
        frenzyDisplay.classList.add('active');
        characterSprite.classList.add('frenzy');
    } else {
        frenzyDisplay.classList.remove('active');
        characterSprite.classList.remove('frenzy');
    }
}

function createParticles(event) {
    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        let clientX = event.clientX || (event.touches && event.touches[0].clientX);
        let clientY = event.clientY || (event.touches && event.touches[0].clientY);
        particle.style.left = `${clientX}px`;
        particle.style.top = `${clientY}px`;
        const xEnd = (Math.random() - 0.5) * 200;
        const yEnd = (Math.random() - 0.5) * 200;
        particle.style.setProperty('--x-end', `${xEnd}px`);
        particle.style.setProperty('--y-end', `${yEnd}px`);
        document.body.appendChild(particle);
        setTimeout(() => {
            particle.remove();
        }, 800);
    }
}

function createXpOrb(event, xpGain, character) {
    let clientX = event.clientX || (event.touches && event.touches[0].clientX);
    let clientY = event.clientY || (event.touches && event.touches[0].clientY);
    const orbContainer = document.createElement('div');
    orbContainer.className = 'xp-orb-container';
    orbContainer.style.left = `${clientX - 10}px`;
    orbContainer.style.top = `${clientY - 10}px`;
    orbContainer.innerHTML = `<div class="xp-orb"></div><div class="xp-orb-text">+${formatNumber(xpGain)}</div>`;
    document.body.appendChild(orbContainer);
    const xpBarEl = character.isPartner ? '#partner-xp-bar' : '#xp-bar';
    const xpBarRect = document.querySelector(xpBarEl).getBoundingClientRect();
    const targetX = xpBarRect.left + (xpBarRect.width / 2);
    const targetY = xpBarRect.top + (xpBarRect.height / 2);
    setTimeout(() => {
        orbContainer.style.left = `${targetX}px`;
        orbContainer.style.top = `${targetY}px`;
        orbContainer.style.transform = 'scale(0)';
        orbContainer.style.opacity = '0';
    }, 50);
    setTimeout(() => {
        const xpBar = document.querySelector(xpBarEl);
        xpBar.classList.add('bar-pulse');
        addXP(character, xpGain);
        setTimeout(() => xpBar.classList.remove('bar-pulse'), 300);
        orbContainer.remove();
    }, 850);
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new(window.AudioContext || window.webkitAudioContext)();
        initMusic();
    }
}

function playSound(type, volume = 1, wave = 'sine', startFreq = 440, endFreq = 440, duration = 0.1) {
    if (!audioCtx || (gameState.settings && gameState.settings.isMuted)) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
    const finalVolume = (gameState.settings ? gameState.settings.sfxVolume : 1.0) * volume;
    gainNode.gain.setValueAtTime(finalVolume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function triggerScreenShake(duration = 500) {
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), duration);
}

function triggerScreenFlash() {
    const flashOverlay = document.getElementById('screen-flash-overlay');
    flashOverlay.classList.add('flash');
    setTimeout(() => {
        flashOverlay.classList.remove('flash');
    }, 300);
}

function createXpBubble() {
    if (document.querySelector('.xp-bubble')) return;

    const container = document.getElementById('floating-rewards-container');
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'xp-bubble';
    bubbleEl.innerHTML = 'XP<span></span><span></span><span></span><span></span><span></span>';

    bubbleEl.style.animationDuration = `${12 + Math.random() * 6}s`;

    bubbleEl.onclick = () => {
        if (bubbleEl.classList.contains('popped')) return;

        const reward = Math.floor(getXpForNextLevel(gameState.level) * (Math.random() * 0.03 + 0.01));
        addXP(gameState, reward);
        showToast(`+${reward} XP!`);
        playSound('feed', 1, 'sine', 400, 800, 0.2);

        bubbleEl.classList.add('popped');
        setTimeout(() => {
            if (bubbleEl) bubbleEl.remove();
        }, 200);
    };

    container.appendChild(bubbleEl);

    setTimeout(() => {
        if (bubbleEl && !bubbleEl.classList.contains('popped')) {
            bubbleEl.remove();
        }
    }, parseFloat(bubbleEl.style.animationDuration) * 1000);
}

function createFloatingText(text, x, y, options = {}) {
    const textEl = getEffectFromPool('floatingText');
    if (!textEl) return;

    const { color = 'white', fontSize = '1.2em', duration = 1500 } = options;

    textEl.textContent = text;
    textEl.style.left = `${x}px`;
    textEl.style.top = `${y}px`;
    textEl.style.color = color;
    textEl.style.fontSize = fontSize;
    textEl.style.animation = `float-up-fade-out ${duration / 1000}s ease-out forwards`;

    setTimeout(() => {
        returnEffectToPool('floatingText', textEl);
    }, duration);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function createDamageNumber(amount, isCrit, isPlayerSource) {
    const num = document.createElement('div');
    num.textContent = amount;
    num.className = 'damage-text';
    if (isPlayerSource) num.classList.add('player-damage');
    else num.classList.add('enemy-damage');
    if (isCrit) num.classList.add('crit');
    document.getElementById('battle-arena').appendChild(num);
    setTimeout(() => {
        num.style.transform = 'translateY(-80px)';
        num.style.opacity = '0';
    }, 10);
    setTimeout(() => {
        num.remove();
    }, 800);
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
            switch (achData.reward.type) {
                case 'gold':
                    rewardDesc = `Reward: ${achData.reward.amount} Gold`;
                    break;
                case 'item':
                    rewardDesc = `Reward: A ${achData.reward.rarity} item`;
                    break;
                case 'egg':
                    rewardDesc = 'Reward: ???';
                    break;
            }
            rewardHtml = `<div class="achievement-reward">${rewardDesc}</div>`;
        }

        li.innerHTML = `<strong>${achData.name}</strong><div class="achievement-desc">${achData.desc}</div>${rewardHtml}`;
        achievementsList.appendChild(li);
    }
}

function updatePerksUI() {
    perksContainer.innerHTML = '';
    ascensionPointsDisplay.textContent = gameState.ascension.points;
    for (const perkId in perks) {
        const perkData = perks[perkId];
        const currentLevel = gameState.ascension.perks[perkId] || 0;
        const perkItem = document.createElement('div');
        perkItem.className = 'perk-item';
        const infoDiv = document.createElement('div');
        infoDiv.className = 'perk-info';
        infoDiv.innerHTML = `<strong>${perkData.name}</strong><div class="perk-desc">${perkData.desc}</div>`;
        const levelSpan = document.createElement('span');
        levelSpan.className = 'perk-level';
        levelSpan.textContent = `Lvl ${currentLevel}/${perkData.maxLevel}`;
        const buyBtn = document.createElement('button');
        if (currentLevel >= perkData.maxLevel) {
            buyBtn.textContent = 'Maxed';
            buyBtn.disabled = true;
        } else {
            const cost = perkData.cost[currentLevel];
            buyBtn.textContent = `Up (${cost} AP)`;
            if (gameState.ascension.points < cost) {
                buyBtn.disabled = true;
            }
            buyBtn.onclick = () => buyPerk(perkId);
        }
        perkItem.appendChild(infoDiv);
        perkItem.appendChild(levelSpan);
        perkItem.appendChild(buyBtn);
        perksContainer.appendChild(perkItem);
        if (confirmAscensionBtn) {
            confirmAscensionBtn.textContent = `Ascend to World Tier ${gameState.ascension.tier + 1} (1 AP)`;
            confirmAscensionBtn.disabled = gameState.level < ASCENSION_LEVEL;
        }
    }
}

function updateShopUI() {
    shopConsumablesContainer.innerHTML = '';
    for (const itemId in shopItems) {
        const itemData = shopItems[itemId];
        const shopItem = document.createElement('div');
        shopItem.className = 'shop-item';
        const infoDiv = document.createElement('div');
        infoDiv.className = 'shop-info';
        infoDiv.innerHTML = `<strong>${itemData.name}</strong><div class="shop-desc">${itemData.desc}</div>`;
        const buyBtn = document.createElement('button');
        buyBtn.textContent = `Buy (${formatNumber(itemData.cost)} G)`;
        if (gameState.gold < itemData.cost || (itemData.type === 'buff' && gameState.activeBuffs[itemId])) {
            buyBtn.disabled = true;
        }
        buyBtn.onclick = () => buyShopItem(itemId, 'consumable');
        shopItem.appendChild(infoDiv);
        shopItem.appendChild(buyBtn);
        shopConsumablesContainer.appendChild(shopItem);
    }
    shopUpgradesContainer.innerHTML = '';
    for (const upgradeId in permanentShopUpgrades) {
        const upgradeData = permanentShopUpgrades[upgradeId];
        const currentLevel = gameState.permanentUpgrades[upgradeId] || 0;
        const shopItem = document.createElement('div');
        shopItem.className = 'shop-item';
        const infoDiv = document.createElement('div');
        infoDiv.className = 'shop-info';
        infoDiv.innerHTML = `<strong>${upgradeData.name}</strong><div class="shop-desc">${upgradeData.desc} (Lvl ${currentLevel}/${upgradeData.maxLevel})</div>`;
        const buyBtn = document.createElement('button');
        if (currentLevel >= upgradeData.maxLevel) {
            buyBtn.textContent = 'Maxed';
            buyBtn.disabled = true;
        } else if (gameState.level < upgradeData.levelReq) {
            buyBtn.textContent = `Req Lvl ${upgradeData.levelReq}`;
            buyBtn.disabled = true;
        } else {
            const cost = upgradeData.cost(currentLevel);
            buyBtn.textContent = `Upgrade (${formatNumber(Math.floor(cost))} G)`;
            if (gameState.gold < cost) {
                buyBtn.disabled = true;
            }
            buyBtn.onclick = () => buyShopItem(upgradeId, 'permanent');
        }
        shopItem.appendChild(infoDiv);
        shopItem.appendChild(buyBtn);
        shopUpgradesContainer.appendChild(shopItem);
    }
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
    if (characterSprite.classList.contains('frenzy')) {
        newAnimation += ', frenzy-glow 1s infinite';
    }
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

function updateDojoUI() {
    dojoPersonalBestDisplay.textContent = `Personal Best: ${formatNumber(Math.floor(gameState.dojoPersonalBest))}`;
}

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
        const offsetX = (Math.random() - 0.5) * jaggedness * (1 - (i / segments));
        const offsetY = (Math.random() - 0.5) * jaggedness * (1 - (i / segments));
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

function createDojoDamageNumber(amount, isCrit) {
    const num = document.createElement('div');
    num.textContent = amount.toLocaleString();
    num.className = 'damage-text player-damage';
    if (isCrit) {
        num.classList.add('crit');
    }
    num.style.top = '40%';
    num.style.left = `${45 + Math.random() * 10}%`;

    document.getElementById('dojo-arena').appendChild(num);

    setTimeout(() => {
        num.style.transform = `translateY(-${80 + Math.random() * 40}px)`;
        num.style.opacity = '0';
    }, 10);
    setTimeout(() => {
        num.remove();
    }, 800);
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
        x: x,
        y: y,
        type: 'gold',
        amount: Math.floor((100 + Math.random() * 10) * gameState.level * (1 + (gameState.ascension.tier - 1) * 0.5)),
        collectionRadius: 690,
        magnetRadius: 2550,
        magnetSpeed: 13
    };
    orb.element.className = 'genesis-loot-orb';
    genesisArena.appendChild(orb.element);

    if (!genesisState.lootOrbs) genesisState.lootOrbs = [];
    genesisState.lootOrbs.push(orb);
}

function createPvpDamageNumber(amount, isPlayerSource) {
    const numEl = document.createElement('div');
    numEl.className = 'enemy-damage-text';
    numEl.textContent = formatNumber(Math.floor(amount));

    if (isPlayerSource) {
        numEl.style.left = '75%';
        numEl.style.color = 'var(--accent-color)';
    } else {
        numEl.style.left = '25%';
        numEl.style.color = 'var(--health-color)';
    }

    numEl.style.top = `${40 + Math.random() * 20}%`;

    pvpArena.appendChild(numEl);
    setTimeout(() => numEl.remove(), 1200);
}

function updateBossHealthBar() {
    if (genesisState.boss) {
        const percent = (genesisState.boss.hp / genesisState.boss.maxHp) * 100;
        bossHealthFill.style.width = `${percent}%`;
    }
}

function updateInventoryUI() {
    const weaponsContainer = document.getElementById('inventory-weapons');
    const armorContainer = document.getElementById('inventory-armor');
    weaponsContainer.innerHTML = '';
    armorContainer.innerHTML = '';

    const weapons = gameState.inventory.filter(i => i && i.type === 'weapon').sort((a, b) => b.power - a.power);
    const armors = gameState.inventory.filter(i => i && i.type === 'armor').sort((a, b) => b.power - a.power);

    const buildItemHtml = (item) => {
        let statsHtml = '';
        for (const stat in item.stats) {
            const value = item.stats[stat];
            const suffix = (stat === 'critChance' || stat === 'goldFind') ? '%' : '';
            statsHtml += `<div>+${value}${suffix} ${stat.charAt(0).toUpperCase() + stat.slice(1)}</div>`;
        }

        let actionButtonsHtml = '';

        if (currentForgeSelectionTarget !== null) {
            actionButtonsHtml = `<button onclick="selectItemForForge('${item.name}')">Select</button>`;
        } else {
            const isEquipped = gameState.equipment[item.type] && gameState.equipment[item.type].name === item.name;

            const equipButton = isEquipped ?
                '<button disabled>Equipped</button>' :
                `<button onclick="equipItemByName('${item.name}')">Equip</button>`;

            const sellValue = calculateSellValue(item);
            const sellButton = `<button class="sell-button" onclick="sellItemByName('${item.name}')">Sell (${formatNumber(sellValue)} G)</button>`;

            let refineButton = '';
            if ((item.reforgeCount || 0) >= 3) {
                refineButton = `<button class="refine-button" onclick="refineItem('${item.name}')">Refine (5 ♦️)</button>`;
            }

            actionButtonsHtml = `<div class="inventory-button-group">${equipButton}${sellButton}${refineButton}</div>`;
        }

        let itemColor = item.rarity.color;
        if (item.reforgeCount > 0 && item.refineLevel === 0) {
            if (item.reforgeCount === 1) itemColor = '#00BFFF';
            if (item.reforgeCount === 2) itemColor = '#000080';
            if (item.reforgeCount >= 3) itemColor = '#00FFFF';
        }
        if (item.refineLevel > 0) {
            itemColor = 'var(--xp-color)';
        }

        const reforgeOrRefineText = item.refineLevel > 0 ?
            `Refined: +${item.refineLevel}` :
            `Reforged: ${item.reforgeCount || 0}/3`;

        return `
            <div class="inventory-item">
                <div class="inventory-item-info">
                    <strong style="color:${itemColor}">${item.name}</strong>
                    <div class="item-stats">${statsHtml}${reforgeOrRefineText}</div>
                </div>
                ${actionButtonsHtml}
            </div>
        `;
    };

    weapons.forEach(item => weaponsContainer.innerHTML += buildItemHtml(item));
    armors.forEach(item => armorContainer.innerHTML += buildItemHtml(item));
}

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

async function showLeaderboard(type = 'level') {
    const allLists = document.querySelectorAll('.leaderboard-list');
    allLists.forEach(l => l.classList.remove('active'));

    let targetList, collectionName, orderByField, orderByDirection, secondaryOrderByField, secondaryOrderByDirection;

    if (type === 'damage') {
        targetList = damageLeaderboardList;
        collectionName = 'damageLeaderboard';
        orderByField = 'totalDamage';
        orderByDirection = 'desc';
    } else if (type === 'pvp') {
        targetList = pvpLeaderboardList;
        collectionName = 'pvpLeaderboard';
        orderByField = 'maxDamage';
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

        if (snapshot.empty) {
            targetList.innerHTML = "<li>No scores yet. Be the first!</li>";
            return;
        }
        targetList.innerHTML = "";
        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            const li = document.createElement('li');
            let scoreText;
            if (type === 'damage') {
                scoreText = `Damage: ${formatNumber(data.totalDamage)}`;
            } else if (type === 'pvp') {
                scoreText = `Max Damage: ${formatNumber(data.maxDamage)}`;
            } else {
                scoreText = `Level ${data.level} (Tier ${data.tier})`;
            }
            li.innerHTML = `<span class="rank-name">${rank}. ${data.name}</span> <span class="rank-score">${scoreText}</span>`;
            targetList.appendChild(li);
            rank++;
        });
    } catch (error) {
        console.error("Error fetching leaderboard: ", error);
        targetList.innerHTML = "<li>Error loading scores.</li>";
    }
}

function showRewardsModal() {
    dailyRewardsContainer.innerHTML = '';
    const canClaimToday = isNewDay(gameState.lastDailyClaim);

    dailyRewards.forEach(dailyRewardData => {
        const itemEl = document.createElement('div');
        itemEl.className = 'reward-item';

        if (dailyRewardData.day < gameState.dailyStreak) {
            itemEl.classList.add('claimed');
        } else if (dailyRewardData.day === gameState.dailyStreak && canClaimToday) {
            itemEl.classList.add('claimable');
        }

        let descriptions = [];
        dailyRewardData.rewards.forEach(reward => {
            switch (reward.type) {
                case 'gold':
                    descriptions.push(`${reward.amount.toLocaleString()} Gold`);
                    break;
                case 'edgestones':
                    descriptions.push(`♦️ ${reward.amount} EdgeStones`);
                    break;
                case 'consumable':
                    descriptions.push(`${reward.amount}x ${shopItems[reward.id].name}`);
                    break;
                case 'item':
                    descriptions.push(`1x ${reward.rarity.charAt(0).toUpperCase() + reward.rarity.slice(1)} Item`);
                    break;
            }
        });
        const finalDesc = descriptions.join('<br>');
        itemEl.innerHTML = `<div class="day-label">Day ${dailyRewardData.day}</div><div class="reward-desc">${finalDesc}</div>`;
        dailyRewardsContainer.appendChild(itemEl);
    });

    weeklyRewardsContainer.innerHTML = `<p>Be #1 on the Damage Leaderboard at the end of the week to earn a special <strong>Legendary</strong> item and an <strong>Ascension Point</strong>!</p>`;

    rewardsModal.classList.add('visible');
}

function renderPotentialsTree() {
    potentialsTreeContainer.innerHTML = '';

    if (!gameState.immortalGrowth || !gameState.immortalGrowth.potentials) {
        potentialsTreeContainer.innerHTML = '<p>Error: Immortal Growth data not found.</p>';
        return;
    }

    const MAX_POTENTIAL_LEVEL = 925;

    for (const id in potentialsData) {
        const data = potentialsData[id];
        const level = gameState.immortalGrowth.potentials[id] || 0;

        const gradeInfo = calculateGradeInfo(level);

        const isMaxed = level >= MAX_POTENTIAL_LEVEL;
        const isStier = ['S', 'SS', 'SSR', 'MAX'].some(prefix => gradeInfo.grade.startsWith(prefix));
        const glowClass = isStier ? 's-tier-glow' : '';
        let upgradeButtonHtml = '';

        if (isMaxed) {
            upgradeButtonHtml = `<button class="immortal-upgrade-btn" disabled style="border-color:${gradeInfo.color}; color:${gradeInfo.color};">MAX<span class="cost">GRADE</span></button>`;
        } else {
            const cost = data.cost(level);
            const canAfford = (gameState.edgeStones || 0) >= cost;
            upgradeButtonHtml = `<button class="immortal-upgrade-btn" data-stat-id="${id}" ${canAfford ? '' : 'disabled'} style="border-color:${gradeInfo.color}; color:${gradeInfo.color};">LV UP<span class="cost">${cost.toFixed(4)} ♦️</span></button>`;
        }

        const currentBonus = level * data.bonusPerLevel;
        const nextBonus = (level + 1) * data.bonusPerLevel;

        const statRow = document.createElement('div');
        statRow.className = 'immortal-stat-row';
        statRow.innerHTML = `
        <div class="immortal-grade-box ${glowClass}">
            ${gradeInfo.grade}
        </div>
        <div class="immortal-stat-details">
            <div class="immortal-stat-info">
                <p>${data.name} (Lv. ${level})</p>
                <p class="stat-value-change">${isMaxed ? 'MAXIMUM' : `${data.formatBonus(currentBonus)} → ${data.formatBonus(nextBonus)}`}</p>
            </div>
            ${upgradeButtonHtml}
        </div>
    `;
        potentialsTreeContainer.appendChild(statRow);
    }
}

function renderAwakeningTree() {
    awakeningTreeContainer.innerHTML = '';

    if (!gameState.immortalGrowth || !gameState.immortalGrowth.awakening) {
        awakeningTreeContainer.innerHTML = '<p>Error: Awakening data not found.</p>';
        return;
    }

    for (const id in awakeningData) {
        const data = awakeningData[id];
        const level = gameState.immortalGrowth.awakening[id] || 0;
        const cost = data.cost(level);
        const canAfford = gameState.gold >= cost;

        const statRow = document.createElement('div');
        statRow.className = 'immortal-stat-row awakening-stat-row';
        statRow.setAttribute('data-stat-id', id);
        statRow.innerHTML = `
            <div class="awakening-icon"></div>
            <div class="awakening-stat-details">
                <div class="awakening-stat-info">
                    <p class="awakening-stat-name">${data.name} (Lv. ${level})</p>
                    <p class="awakening-stat-desc">${data.desc}</p>
                </div>
                <button class="awakening-upgrade-btn" data-stat-id="${id}" ${canAfford ? '' : 'disabled'}>
                    LV UP
                    <span class="cost">${formatNumber(cost)} G</span>
                </button>
            </div>
        `;
        awakeningTreeContainer.appendChild(statRow);
    }
}

function renderSkillsModal() {
    const container = document.getElementById('skills-tree-container');
    container.innerHTML = '';
    document.querySelector('#skills-orb-display span:last-child').textContent = (gameState.orbs || 0).toFixed(1);
    for (const id in skillsData) {

        const data = skillsData[id];
        const level = gameState.immortalGrowth.skills[id] || 0;
        const isMaxed = level >= data.maxLevel;
        const cost = isMaxed ? 0 : data.cost(level);
        const canAfford = (gameState.orbs || 0) >= cost;
        const bonus = getSkillBonus(id);

        const statRow = document.createElement('div');
        statRow.className = 'immortal-stat-row awakening-stat-row';

        let buttonHtml;
        if (isMaxed) {
            buttonHtml = `<button class="awakening-upgrade-btn skill-upgrade-btn" disabled>MAX</button>`;
        } else {
            buttonHtml = `<button class="awakening-upgrade-btn skill-upgrade-btn" data-skill-id="${id}" ${canAfford ? '' : 'disabled'}>
                            LV UP
                            <span class="cost">${formatNumber(cost)} 🔮</span>
                          </button>`;
        }

        statRow.innerHTML = `
            <div class="awakening-stat-details">
                <div class="awakening-stat-info">
                    <p class="awakening-stat-name">${data.name} (Lv. ${level}/${data.maxLevel})</p>
                    <p class="awakening-stat-desc">${data.desc}</p>
                    <p class="stat-value-change">Current Bonus: +${bonus.toFixed(1)}%</p>
                </div>
                ${buttonHtml}
            </div>
        `;
        container.appendChild(statRow);
    }
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
        const end = targets[i + 1];
        drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(0, 255, 255, 0.2)', 20, 15);
        drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(255, 255, 255, 0.5)', 10, 12);
        drawLightningSegment(ctx, start.x, start.y, end.x, end.y, '#FFFFFF', 4, 10);
    }

    setTimeout(() => canvas.remove(), 400);
}

function createPvpChainLightningEffect(playerSprite, opponentSprite) {
    const canvas = document.createElement('canvas');
    canvas.className = 'genesis-chain-lightning';
    const arenaRect = pvpArena.getBoundingClientRect();
    canvas.width = arenaRect.width;
    canvas.height = arenaRect.height;
    pvpArena.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    const start = { x: playerSprite.offsetLeft + playerSprite.offsetWidth / 2, y: playerSprite.offsetTop + playerSprite.offsetHeight / 2 };
    const end = { x: opponentSprite.offsetLeft + opponentSprite.offsetWidth / 2, y: opponentSprite.offsetTop + opponentSprite.offsetHeight / 2 };

    drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(0, 255, 255, 0.2)', 20, 15);
    drawLightningSegment(ctx, start.x, start.y, end.x, end.y, 'rgba(255, 255, 255, 0.5)', 10, 12);
    drawLightningSegment(ctx, start.x, start.y, end.x, end.y, '#FFFFFF', 4, 10);

    setTimeout(() => canvas.remove(), 400);
}

function createCollisionExplosion(x, y) {
    const explosion = document.createElement('div');
    explosion.className = 'pvp-collision-explosion';
    explosion.style.left = `${x}px`;
    explosion.style.top = `${y}px`;
    pvpArena.appendChild(explosion);

    playSound('crit', 1, 'square', 800, 50, 0.4);
    triggerScreenShake(400);

    setTimeout(() => explosion.remove(), 400);
}

function triggerAttackAnimation(attackerSprite) {
    if (!attackerSprite) return;
    attackerSprite.classList.add('attacking');
    setTimeout(() => {
        if (attackerSprite) attackerSprite.classList.remove('attacking');
    }, 200);
}

function triggerEvadeAnimation(evaderSprite) {
    if (!evaderSprite) return;
    evaderSprite.classList.add('evading');
    playSound('hit', 1, 'sawtooth', 800, 200, 0.2);
    createFloatingText("Evade!", evaderSprite.offsetLeft + 20, evaderSprite.offsetTop - 30, { color: 'cyan', fontSize: '1.5em' });
    setTimeout(() => {
        if (evaderSprite) evaderSprite.classList.remove('evading');
    }, 400);
}
