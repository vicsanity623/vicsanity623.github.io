// ======================================================
// ============= ENDLESS RIFT - RIFT.JS (v2.0) ===========
// ======================================================

const Rift = {
    // --- State Management ---
    state: {
        isActive: false,
        gameLoopId: null,
        currentWave: 0,
        enemies: [],
        loot: [],
        particles: [], // For visual effects
        player: { 
            x: 0, y: 0, 
            moveVector: { x: 0, y: 0 },
            lastAttackTime: 0,
            lastDamagedTime: 0,
            sprite: new Image()
        },
        isAutoMode: false,
        keys: {}
    },

    // --- Configuration ---
    config: {
        playerBaseSpeed: 3,
        magnetBaseRadius: 150,
        enemiesBasePerWave: 5,
        playerRadius: 30,
        enemyRadius: 25,
        lootRadius: 10,
        collectionRadius: 40,
        playerAttackCooldown: 400, // ms
        enemyAttackCooldown: 1500, // ms
        riftUpgradeCost: (level) => Math.floor(10 * Math.pow(1.5, level))
    },

    // --- HTML Elements ---
    elements: {
        screen: document.getElementById('rift-screen'),
        canvas: document.getElementById('rift-canvas'),
        ctx: document.getElementById('rift-canvas').getContext('2d'),
        upgradeBtn: document.getElementById('rift-upgrade-btn'),
        exitBtn: document.getElementById('rift-exit-btn'),
        autoCheckbox: document.getElementById('rift-auto-checkbox'),
        hpBarFill: document.querySelector('#rift-player-hp-bar .stat-bar-fill'),
        hpBarLabel: document.querySelector('#rift-player-hp-bar .stat-bar-label'),
        xpBarFill: document.querySelector('#rift-player-xp-bar .stat-bar-fill'),
        xpBarLabel: document.querySelector('#rift-player-xp-bar .stat-bar-label'),
        waveDisplay: document.getElementById('rift-wave-display'),
        joystickZone: document.getElementById('rift-joystick-zone'),
    },

    joystick: null,

    // =============================================
    // =========== CORE CONTROL FUNCTIONS ==========
    // =============================================

    start: function() {
        console.log("Entering the Endless Rift...");
        this.state.isActive = true;
        this.state.player.sprite.src = 'player.PNG';

        showScreen('rift-screen');
        this.resetState();
        this.setupCanvas();
        this.setupControls();
        this.bindEvents();
        
        this.nextWave();
        this.gameLoop();
    },
    
    resetState: function() {
        this.state.currentWave = 0;
        this.state.enemies = [];
        this.state.loot = [];
        this.state.particles = [];
        this.state.player.x = window.innerWidth / 2;
        this.state.player.y = window.innerHeight / 2;
        this.state.player.moveVector = { x: 0, y: 0 };
        this.state.isAutoMode = this.elements.autoCheckbox.checked;
        // Ensure player is at full health when entering
        gameState.resources.hp = gameState.resources.maxHp;
    },
    
    setupCanvas: function() {
        this.elements.canvas.width = window.innerWidth;
        this.elements.canvas.height = window.innerHeight;
    },

    exit: function(isPlayerDefeated = false) {
        if (!this.state.isActive) return;
        console.log("Exiting the Endless Rift...");
        this.state.isActive = false;

        cancelAnimationFrame(this.state.gameLoopId);
        this.destroyControls();

        if (isPlayerDefeated) {
            showNotification("Defeated in the Rift!", `You were overwhelmed at Rift Level ${this.state.currentWave}. You keep all loot found.`);
            playSound('defeat', 1, 'sine', 440, 110, 0.8);
        }

        showScreen('game-screen');
        updateUI(); 
        saveGame(); 
        startGameGenesis(); 
    },

    gameLoop: function(timestamp) {
        if (!this.state.isActive) return;

        this.handleInput();
        this.updatePlayer(timestamp);
        this.updateEnemies(timestamp);
        this.updateLoot();
        this.updateParticles();
        this.handleCollisions();
        
        if (this.state.enemies.length === 0) {
            this.nextWave();
        }

        this.updateRiftUI();
        this.draw(timestamp);

        // --- ADDED: Player Death Condition ---
        if (gameState.resources.hp <= 0) {
            this.exit(true); // Exit the rift because the player was defeated
            return; // Stop the loop
        }

        this.state.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
    },

    bindEvents: function() {
        this.elements.exitBtn.onclick = () => this.exit(false);
        this.elements.autoCheckbox.onchange = (e) => {
            this.state.isAutoMode = e.target.checked;
        };
        // Resize canvas if window is resized
        window.onresize = () => this.setupCanvas();
    },

    // =============================================
    // ============ GAMEPLAY FUNCTIONS =============
    // =============================================

    setupControls: function() {
        this.joystick = nipplejs.create({
            zone: this.elements.joystickZone,
            mode: 'static', position: { left: '25%', top: '75%' },
            color: 'white', size: 150
        });
        this.joystick.on('move', (evt, data) => {
            if (data.vector) this.state.player.moveVector = data.vector;
        });
        this.joystick.on('end', () => this.state.player.moveVector = { x: 0, y: 0 });

        window.addEventListener('keydown', (e) => this.state.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.state.keys[e.key.toLowerCase()] = false);
    },
    
    destroyControls: function() {
        if (this.joystick) this.joystick.destroy();
        this.joystick = null;
    },

    handleInput: function() {
        if (this.state.isAutoMode) {
            this.handleAutoModeAI();
        } else {
            let moveX = 0, moveY = 0;
            if (this.state.keys['w']) moveY = -1;
            if (this.state.keys['s']) moveY = 1;
            if (this.state.keys['a']) moveX = -1;
            if (this.state.keys['d']) moveX = 1;
            
            if (moveX !== 0 || moveY !== 0) {
                // Normalize for consistent diagonal speed
                const length = Math.sqrt(moveX * moveX + moveY * moveY);
                this.state.player.moveVector = { x: moveX / length, y: moveY / length };
            } else if (this.joystick && this.joystick.get(0)) {
                 const joyData = this.joystick.get(0);
                 if(joyData.vector) this.state.player.moveVector = {x: joyData.vector.x, y: -joyData.vector.y};
            } else {
                this.state.player.moveVector = { x: 0, y: 0 };
            }
        }
    },
    
    handleAutoModeAI: function() {
        let nearestTarget = this.findNearest(this.state.enemies);
        if (!nearestTarget) nearestTarget = this.findNearest(this.state.loot);

        if (nearestTarget) {
            const dx = nearestTarget.x - this.state.player.x;
            const dy = nearestTarget.y - this.state.player.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 1) this.state.player.moveVector = { x: dx / dist, y: dy / dist };
        } else {
            this.state.player.moveVector = { x: 0, y: 0 };
        }
    },
    
    findNearest: function(objectArray) {
        let nearest = null, minDistance = Infinity;
        objectArray.forEach(obj => {
            const distance = Math.hypot(obj.x - this.state.player.x, obj.y - this.state.player.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = obj;
            }
        });
        return nearest;
    },

    updatePlayer: function(timestamp) {
        const speedMultiplier = 1 + (gameState.riftProgress.moveSpeed * 0.05);
        const speed = this.config.playerBaseSpeed * speedMultiplier;
        
        this.state.player.x += this.state.player.moveVector.x * speed;
        this.state.player.y += this.state.player.moveVector.y * speed;

        this.state.player.x = Math.max(0, Math.min(this.elements.canvas.width, this.state.player.x));
        this.state.player.y = Math.max(0, Math.min(this.elements.canvas.height, this.state.player.y));
        
        this.handlePlayerCombat(timestamp);
    },
    
    updateEnemies: function(timestamp) {
        this.state.enemies.forEach(enemy => {
            const dist = Math.hypot(this.state.player.x - enemy.x, this.state.player.y - enemy.y);
            if (dist > this.config.enemyRadius) {
                enemy.x += (this.state.player.x - enemy.x) / dist * enemy.speed;
                enemy.y += (this.state.player.y - enemy.y) / dist * enemy.speed;
            }
            this.handleEnemyCombat(enemy, timestamp);
        });
    },

    updateLoot: function() {
        const magnetMultiplier = 1 + (gameState.riftProgress.magnetRadius * 0.1);
        const magnetRadius = this.config.magnetBaseRadius * magnetMultiplier;

        this.state.loot.forEach(item => {
            const dist = Math.hypot(this.state.player.x - item.x, this.state.player.y - item.y);
            if (dist < magnetRadius) {
                item.x += (this.state.player.x - item.x) / dist * 5;
                item.y += (this.state.player.y - item.y) / dist * 5;
            }
        });
    },

    handlePlayerCombat: function(timestamp) {
        const attackRange = 50 + getTotalStat('agility') * 0.5;
        if (timestamp - this.state.player.lastAttackTime > this.config.playerAttackCooldown) {
            let attacked = false;
            this.state.enemies.forEach(enemy => {
                const dist = Math.hypot(enemy.x - this.state.player.x, enemy.y - this.state.player.y);
                if (dist < attackRange) {
                    const damage = getTotalStat('strength');
                    const isCrit = Math.random() < (getTotalStat('critChance') / 100);
                    const finalDamage = isCrit ? damage * 2 : damage;
                    
                    enemy.hp -= finalDamage;
                    this.createParticleEffect(enemy.x, enemy.y, 5, isCrit ? 'gold' : 'white');
                    this.createDamageNumber(enemy.x, enemy.y, Math.floor(finalDamage), isCrit);
                    attacked = true;
                }
            });
            if (attacked) {
                this.state.player.lastAttackTime = timestamp;
                playSound('hit', 0.4, 'square', 400, 100, 0.1);
            }
        }
    },

    handleEnemyCombat: function(enemy, timestamp) {
        if (timestamp - enemy.lastAttackTime > this.config.enemyAttackCooldown) {
            const dist = Math.hypot(this.state.player.x - enemy.x, this.state.player.y - enemy.y);
            if (dist < this.config.playerRadius + this.config.enemyRadius) {
                enemy.lastAttackTime = timestamp;
                const damage = Math.max(1, (10 * this.state.currentWave) - getTotalStat('fortitude'));
                gameState.resources.hp -= damage;
                this.state.player.lastDamagedTime = timestamp;
                playSound('hit', 0.6, 'sawtooth', 200, 50, 0.15);
                triggerScreenShake(150);
            }
        }
    },
    
    handleCollisions: function() {
        this.state.loot = this.state.loot.filter(item => {
            if (Math.hypot(item.x - this.state.player.x, item.y - this.state.player.y) < this.config.collectionRadius) {
                this.collectItem(item); return false;
            }
            return true;
        });

        this.state.enemies = this.state.enemies.filter(enemy => {
            if (enemy.hp <= 0) {
                this.createLootDrop(enemy.x, enemy.y);
                this.createParticleEffect(enemy.x, enemy.y, 20, 'red'); // Death explosion
                return false;
            }
            return true;
        });
    },

    collectItem: function(item) {
        playSound('feed', 0.5, 'sine', 600, 800, 0.1);
        const goldGainBonus = 1 + (gameState.riftProgress.goldFind * 0.1);
        const xpGainBonus = 1 + (gameState.riftProgress.xpGain * 0.1);

        switch(item.type) {
            case 'gold': gameState.gold += Math.floor(item.amount * goldGainBonus); break;
            case 'orbs': gameState.orbs = (gameState.orbs || 0) + item.amount; break;
            case 'edgestones': gameState.edgeStones = (gameState.edgeStones || 0) + item.amount; break;
            case 'xp': addXP(gameState, Math.floor(item.amount * xpGainBonus)); break;
        }
    },

    nextWave: function() {
        this.state.currentWave++;
        showToast(`Rift Level ${this.state.currentWave} starting!`);
        if (this.state.currentWave > 1 && this.state.currentWave % 10 === 0) {
            this.elements.upgradeBtn.classList.remove('hidden');
            this.elements.upgradeBtn.onclick = () => this.showUpgradeModal();
        }
        this.spawnWave();
    },

    spawnWave: function() {
        const numEnemies = this.config.enemiesBasePerWave + Math.floor(this.state.currentWave * 1.5);
        for (let i = 0; i < numEnemies; i++) {
            const edge = Math.floor(Math.random() * 4), canvas = this.elements.canvas;
            let x, y;
            if (edge === 0) { x = Math.random() * canvas.width; y = -50; }
            else if (edge === 1) { x = canvas.width + 50; y = Math.random() * canvas.height; }
            else if (edge === 2) { x = Math.random() * canvas.width; y = canvas.height + 50; }
            else { x = -50; y = Math.random() * canvas.height; }
            
            this.state.enemies.push({
                x, y,
                hp: 100 * this.state.currentWave, maxHp: 100 * this.state.currentWave,
                speed: 1 + Math.random() * 0.5 + (this.state.currentWave * 0.02),
                lastAttackTime: 0,
                sprite: this.state.player.sprite
            });
        }
    },

    createLootDrop: function(x, y) {
        this.state.loot.push({x, y, type: 'xp', amount: 50 * this.state.currentWave, color: '#ffdc00'});
        this.state.loot.push({x, y, type: 'gold', amount: 100 * this.state.currentWave, color: 'gold'});
        if (Math.random() < 0.1 + (this.state.currentWave * 0.005)) this.state.loot.push({x, y, type: 'orbs', amount: 1, color: '#87CEFA'});
        if (Math.random() < 0.05 + (this.state.currentWave * 0.002)) this.state.loot.push({x, y, type: 'edgestones', amount: 0.1, color: '#00FFFF'});
        if (this.state.currentWave >= 50 && Math.random() < 0.01) {
            const item = generateItem('legendary');
            showToast(`A Legendary item dropped in the Rift!`);
            gameState.inventory.push(item);
        }
    },

    // ==================================================
    // ============= VISUALS & DRAWING ==================
    // ==================================================
    
    updateRiftUI: function() {
        this.elements.hpBarFill.style.width = `${(gameState.resources.hp / gameState.resources.maxHp) * 100}%`;
        this.elements.hpBarLabel.textContent = `HP: ${Math.floor(gameState.resources.hp)} / ${gameState.resources.maxHp}`;
        const xpForNext = getXpForNextLevel(gameState.level);
        this.elements.xpBarFill.style.width = `${(gameState.xp / xpForNext) * 100}%`;
        this.elements.xpBarLabel.textContent = `XP: ${formatNumber(Math.floor(gameState.xp))} / ${formatNumber(xpForNext)}`;
        this.elements.waveDisplay.textContent = `Rift Level: ${this.state.currentWave}`;
    },

    createParticleEffect: function(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            this.state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 30, // frames
                color: color
            });
        }
    },
    
    createDamageNumber: function(x, y, amount, isCrit) {
        this.state.particles.push({
            x, y,
            vy: -2,
            life: 60,
            text: amount,
            color: isCrit ? 'gold' : 'white',
            isDamageNumber: true,
            fontSize: isCrit ? 24 : 16
        });
    },

    updateParticles: function() {
        this.state.particles = this.state.particles.filter(p => {
            p.x += p.vx || 0;
            p.y += p.vy || 0;
            p.life--;
            if(p.isDamageNumber) p.vy *= 0.98; // slow down vertical movement
            return p.life > 0;
        });
    },

    draw: function(timestamp) {
        const ctx = this.elements.ctx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        this.state.loot.forEach(item => {
            ctx.beginPath();
            ctx.arc(item.x, item.y, this.config.lootRadius, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.shadowColor = item.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Draw Player (with damage flash)
        const playerFlash = timestamp - this.state.player.lastDamagedTime < 200;
        if (playerFlash) {
            ctx.filter = 'brightness(2) drop-shadow(0 0 5px red)';
        }
        ctx.drawImage(this.state.player.sprite, this.state.player.x - this.config.playerRadius, this.state.player.y - this.config.playerRadius, this.config.playerRadius*2, this.config.playerRadius*2);
        ctx.filter = 'none';

        this.state.enemies.forEach(enemy => {
            ctx.filter = `hue-rotate(${enemy.x % 360}deg) saturate(1.5)`;
            ctx.drawImage(enemy.sprite, enemy.x - this.config.enemyRadius, enemy.y - this.config.enemyRadius, this.config.enemyRadius*2, this.config.enemyRadius*2);
            ctx.filter = 'none';
            // HP Bar
            ctx.fillStyle = '#333';
            ctx.fillRect(enemy.x - this.config.enemyRadius, enemy.y - this.config.enemyRadius - 10, this.config.enemyRadius*2, 5);
            ctx.fillStyle = 'red';
            ctx.fillRect(enemy.x - this.config.enemyRadius, enemy.y - this.config.enemyRadius - 10, (this.config.enemyRadius*2) * (enemy.hp / enemy.maxHp), 5);
        });

        this.state.particles.forEach(p => {
            ctx.globalAlpha = p.life / (p.isDamageNumber ? 60 : 30);
            if (p.isDamageNumber) {
                ctx.font = `bold ${p.fontSize}px Poppins`;
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 3, 3);
            }
            ctx.globalAlpha = 1.0;
        });
    },
    
    // =============================================
    // =========== RIFT UPGRADE SYSTEM =============
    // =============================================

    showUpgradeModal: function() {
        cancelAnimationFrame(this.state.gameLoopId);
        let upgradeHtml = `<h2>Rift Upgrades</h2><p>Your Orbs: ${gameState.orbs.toFixed(1)} 🔮</p>`;
        const upgrades = {
            moveSpeed: { name: 'Celerity', desc: '+5% Move Speed' },
            magnetRadius: { name: 'Greed', desc: '+10% Collection Radius' },
            goldFind: { name: 'Fortune', desc: '+10% Gold from Rift' },
            xpGain: { name: 'Insight', desc: '+10% XP from Rift' }
        };

        for (const key in upgrades) {
            const level = gameState.riftProgress[key] || 0;
            const cost = this.config.riftUpgradeCost(level);
            upgradeHtml += `
                <div class="shop-item">
                    <div class="shop-info">
                        <strong>${upgrades[key].name} (Lv. ${level})</strong>
                        <div class="shop-desc">${upgrades[key].desc}</div>
                    </div>
                    <button onclick="Rift.applyUpgrade('${key}')" ${gameState.orbs < cost ? 'disabled' : ''}>
                        Up (${cost} 🔮)
                    </button>
                </div>
            `;
        }
        showNotification("Rift Upgrades", upgradeHtml);
        modalCloseBtn.onclick = () => {
            modal.classList.remove('visible');
            this.gameLoop();
        };
    },
    
    applyUpgrade: function(key) {
        const level = gameState.riftProgress[key] || 0;
        const cost = this.config.riftUpgradeCost(level);
        if (gameState.orbs >= cost) {
            gameState.orbs -= cost;
            gameState.riftProgress[key]++;
            playSound('levelUp', 0.8, 'sine', 600, 1200, 0.2);
            this.showUpgradeModal(); 
        } else {
            showToast("Not enough Orbs!");
        }
    }
};

window.Rift = Rift;
