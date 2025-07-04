// player.js

let player = {};

function initPlayer(world) {
    player = {
        x: world.width / 2,
        y: world.height / 2,
        size: 20,
        speed: 3.5,
        health: 100,
        maxHealth: 100,
        healthRegen: 0,
        xp: 0,
        level: 1,
        xpForNextLevel: 10,
        pickupRadius: 75,
        xpGainModifier: 1,
        angle: 0,
        kills: 0,
        nextKillUpgrade: 1000,
        upgradeLevels: {},
        armor: 0,
        thorns: 0,
        lifeSteal: 0,
        dodgeChance: 0,
        magnetism: 1,
        lastHitTime: 0,

        weapon: {
            damage: 10,
            cooldown: 600,
            speed: 8,
            size: { w: 4, h: 40 },
            count: 1,
            pierce: 0,
            critChance: 0.05,
            critDamage: 2,
            explodesOnImpact: false,
            explosionRadius: 60,
            explosionDamage: 10
        },
        abilities: {
            orbitingShield: { enabled: false, angle: 0, distance: 70, damage: 5, cooldown: 500, lastHit: 0 },
            backShot: false,
            diagonalShot: false,
            novaOnLevelUp: false,
            healOnXp: false,
            critExplosion: false
        },
        skills: {
            lightning: { isUnlocked: false, damage: 5, chains: 1, shockDuration: 0, cooldown: 3000, lastStrike: 0 },
            volcano: { isUnlocked: false, damage: 10, radius: 50, burnDuration: 2000, cooldown: 5000, lastEruption: 0 },
            frostNova: { isUnlocked: false, damage: 5, radius: 150, slowAmount: 0.5, slowDuration: 2000, cooldown: 6000, lastCast: 0 },
            blackHole: { isUnlocked: false, pullStrength: 0.5, radius: 200, duration: 3000, damage: 2, cooldown: 12000, lastCast: 0 },
            bulletstorm: { isUnlocked: false, damage: 10, speed: 7, fireRate: 300, lastShotTime: 0, color: '#00FFFF', size: 10 },
            hyperBeam: { isUnlocked: false, damage: 200, width: 100, duration: 800, cooldown: 30000, lastCast: 0, chargingTime: 500, color: '#FF00FF' }
        }
    };
}

function loadPlayer(savedPlayer) {
    initPlayer({ width: 3000, height: 2000 });

    Object.assign(player, savedPlayer);

    if (savedPlayer.weapon) {
        player.weapon = { ...player.weapon, ...savedPlayer.weapon };
        if (isNaN(player.weapon.damage)) player.weapon.damage = 10;
        if (isNaN(player.weapon.cooldown)) player.weapon.cooldown = 600;
        if (isNaN(player.weapon.speed)) player.weapon.speed = 8;
        if (isNaN(player.weapon.count)) player.weapon.count = 1;
        if (isNaN(player.weapon.pierce)) player.weapon.pierce = 0;
        if (isNaN(player.weapon.critChance)) player.weapon.critChance = 0.05;
        if (isNaN(player.weapon.critDamage)) player.weapon.critDamage = 2;
        if (isNaN(player.weapon.explosionRadius)) player.weapon.explosionRadius = 60;
        if (isNaN(player.weapon.explosionDamage)) player.weapon.explosionDamage = 10;
        if (savedPlayer.weapon.size) {
            player.weapon.size = { ...player.weapon.size, ...savedPlayer.weapon.size };
            if (isNaN(player.weapon.size.w)) player.weapon.size.w = 4;
            if (isNaN(player.weapon.size.h)) player.weapon.size.h = 40;
        } else {
            player.weapon.size = { w: 4, h: 40 };
        }
    } else {
        player.weapon = { damage: 10, cooldown: 600, speed: 8, size: { w: 4, h: 40 }, count: 1, pierce: 0, critChance: 0.05, critDamage: 2, explodesOnImpact: false, explosionRadius: 60, explosionDamage: 10 };
    }

    if (savedPlayer.abilities) {
        player.abilities = { ...player.abilities, ...savedPlayer.abilities };
        if (savedPlayer.abilities.orbitingShield) {
            player.abilities.orbitingShield = { ...player.abilities.orbitingShield, ...savedPlayer.abilities.orbitingShield };
            if (isNaN(player.abilities.orbitingShield.damage)) player.abilities.orbitingShield.damage = 5;
            if (isNaN(player.abilities.orbitingShield.cooldown)) player.abilities.orbitingShield.cooldown = 500;
            if (isNaN(player.abilities.orbitingShield.distance)) player.abilities.orbitingShield.distance = 70;
            if (isNaN(player.abilities.orbitingShield.angle)) player.abilities.orbitingShield.angle = 0;
            if (isNaN(player.abilities.orbitingShield.count)) player.abilities.orbitingShield.count = 1;
        }
    } else {
        player.abilities = { orbitingShield: { enabled: false, angle: 0, distance: 70, damage: 5, cooldown: 500, lastHit: 0 }, backShot: false, diagonalShot: false, novaOnLevelUp: false, healOnXp: false, critExplosion: false };
    }

    if (savedPlayer.skills) {
        player.skills = { ...player.skills, ...savedPlayer.skills };
        for (const skillName in player.skills) {
            if (savedPlayer.skills[skillName]) {
                player.skills[skillName] = { ...player.skills[skillName], ...savedPlayer.skills[skillName] };
                if (skillName === 'bulletstorm') {
                    if (isNaN(player.skills[skillName].damage)) player.skills[skillName].damage = 10;
                    if (isNaN(player.skills[skillName].speed)) player.skills[skillName].speed = 7;
                    if (isNaN(player.skills[skillName].fireRate)) player.skills[skillName].fireRate = 300;
                    if (isNaN(player.skills[skillName].size)) player.skills[skillName].size = 10;
                }
                if (skillName === 'hyperBeam') {
                    if (isNaN(player.skills[skillName].damage)) player.skills[skillName].damage = 200;
                    if (isNaN(player.skills[skillName].width)) player.skills[skillName].width = 100;
                    if (isNaN(player.skills[skillName].duration)) player.skills[skillName].duration = 800;
                    if (isNaN(player.skills[skillName].cooldown)) player.skills[skillName].cooldown = 30000;
                    if (isNaN(player.skills[skillName].chargingTime)) player.skills[skillName].chargingTime = 500;
                }
            }
        }
    } else {
        player.skills = {
            lightning: { isUnlocked: false, damage: 5, chains: 1, shockDuration: 0, cooldown: 3000, lastStrike: 0 },
            volcano: { isUnlocked: false, damage: 10, radius: 50, burnDuration: 2000, cooldown: 5000, lastEruption: 0 },
            frostNova: { isUnlocked: false, damage: 5, radius: 150, slowAmount: 0.5, slowDuration: 2000, cooldown: 6000, lastCast: 0 },
            blackHole: { isUnlocked: false, pullStrength: 0.5, radius: 200, duration: 3000, damage: 2, cooldown: 12000, lastCast: 0 },
            bulletstorm: { isUnlocked: false, damage: 10, speed: 7, fireRate: 300, lastShotTime: 0, color: '#00FFFF', size: 10 },
            hyperBeam: { isUnlocked: false, damage: 200, width: 100, duration: 800, cooldown: 30000, lastCast: 0, chargingTime: 500, color: '#FF00FF' }
        };
    }

    if (isNaN(player.health) || typeof player.health !== 'number') {
        player.health = savedPlayer.health || player.maxHealth;
        if (isNaN(player.health)) player.health = 100;
    }
    if (isNaN(player.maxHealth) || typeof player.maxHealth !== 'number') {
        player.maxHealth = 100;
    }
    if (isNaN(player.armor) || typeof player.armor !== 'number') {
        player.armor = 0;
    }
    if (isNaN(player.lastHitTime) || typeof player.lastHitTime !== 'number') {
        player.lastHitTime = 0;
    }
    if (isNaN(player.speed) || typeof player.speed !== 'number') {
        player.speed = 3.5;
    }
    if (isNaN(player.xpGainModifier) || typeof player.xpGainModifier !== 'number') {
        player.xpGainModifier = 1;
    }
    if (isNaN(player.pickupRadius) || typeof player.pickupRadius !== 'number') {
        player.pickupRadius = 75;
    }
    if (isNaN(player.magnetism) || typeof player.magnetism !== 'number') {
        player.magnetism = 1;
    }
    player.health = Math.min(player.health, player.maxHealth);
}

function takeDamage(amount, gameTime, spawnDamageNumberCallback, screenRedFlashObject, triggerScreenShakeCallback) {
    amount = parseFloat(amount);
    if (isNaN(amount)) {
        return;
    }

    const currentArmor = parseFloat(player.armor);
    if (isNaN(currentArmor)) {
        player.armor = 0;
    }

    const IFRAME_DURATION = 1000;

    if (amount > 1 && (gameTime - (player.lastHitTime || 0) < IFRAME_DURATION)) {
        return;
    }

    if (Math.random() < player.dodgeChance) {
        spawnDamageNumberCallback(player.x, player.y + 20, "DODGE", true);
        return;
    }

    const finalDamage = Math.max(0, amount - player.armor);
    player.health -= finalDamage;

    if (amount > 1 && screenRedFlashObject) {
        screenRedFlashObject.value = 0.6;
        triggerScreenShakeCallback(5, 100);
    }

    if (amount > 1) {
        player.lastHitTime = gameTime;
    }

    if (player.health <= 0) {
        player.health = 0;
    }
}

function updatePlayer(deltaTime, world, enemies, moveVector) {
    if (moveVector.dx !== 0 || moveVector.dy !== 0) {
        const mag = Math.hypot(moveVector.dx, moveVector.dy);
        player.x += (moveVector.dx / mag) * player.speed;
        player.y += (moveVector.dy / mag) * player.speed;
    }

    player.x = Math.max(0, Math.min(world.width, player.x));
    player.y = Math.max(0, Math.min(world.height, player.y));

    player.health = Math.min(player.maxHealth, player.health + player.healthRegen * (deltaTime / 1000));

    let closestEnemy = null;
    let closestDist = Infinity;
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < closestDist) {
            closestDist = dist;
            closestEnemy = e;
        }
    });

    if (closestEnemy) {
        player.angle = Math.atan2(closestEnemy.y - player.y, closestEnemy.x - player.x);
    }
    
    return { closestEnemy, closestDist };
}

function gainXP(amount, showLevelUpOptionsCallback, expandWorldCallback, triggerNovaCallback, camera) {
    if (player.health <= 0) return;
    player.xp += amount * player.xpGainModifier;
    if (player.xp >= player.xpForNextLevel) {
        const xpOver = player.xp - player.xpForNextLevel;
        const oldLevel = player.level;
        player.level++;

        if (oldLevel < 20 && player.level >= 20) {
            player.nextKillUpgrade = Math.ceil(player.kills / 1000) * 1000;
        }

        if (player.level > 0 && player.level % 20 === 0) {
            expandWorldCallback(camera, player);
        }

        player.xp = xpOver;
        player.xpForNextLevel = Math.floor(player.xpForNextLevel * 1.6);
        player.health = player.maxHealth;
        if (player.abilities.novaOnLevelUp) triggerNovaCallback(player);
        showLevelUpOptionsCallback();
    }
    if (player.abilities.healOnXp && Math.random() < 0.1) {
        player.health = Math.min(player.maxHealth, player.health + 1);
    }
}

export { player, initPlayer, loadPlayer, updatePlayer, gainXP, takeDamage };