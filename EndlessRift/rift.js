import { world, safeHouse, skillTotems, visualEffects } from './systemsmanager.js';

let backgroundCanvas, bgCtx;

function initRift() {
    backgroundCanvas = document.createElement('canvas');
    bgCtx = backgroundCanvas.getContext('2d');
    drawStaticBackground();
}

function expandWorld(camera, player) {
    world.width *= 1.2;
    world.height *= 1.2;
    drawStaticBackground();
    visualEffects.push({
        type: 'world_expansion', x: player.x, y: player.y, radius: 10,
        maxRadius: Math.max(camera.width, camera.height), life: 1000,
        update(dt) { this.radius += (this.maxRadius / 1000) * dt; this.life -= dt; return this.life <= 0; }
    });
}

function drawStaticBackground() {
    if (!backgroundCanvas) return;
    backgroundCanvas.width = world.width;
    backgroundCanvas.height = world.height;
    bgCtx.clearRect(0, 0, world.width, world.height);
    for (let i = 0; i < 150; i++) drawCrack(bgCtx, Math.random() * world.width, Math.random() * world.height, 5 + Math.random() * 10);
    for (let i = 0; i < 50; i++) drawBoneSet(bgCtx, Math.random() * world.width, Math.random() * world.height, Math.random() * 0.8 + 0.4, Math.random() * Math.PI * 2);
}

function drawCrack(c, x, y, segments) {
    c.beginPath();
    c.moveTo(x, y);
    c.strokeStyle = 'var(--cracks-color)';
    c.lineWidth = Math.random() * 3 + 1;
    c.shadowColor = 'var(--cracks-color)';
    c.shadowBlur = 10;
    for (let i = 0; i < segments; i++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
}

function drawBoneSet(c, x, y, scale, rotation) {
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale(scale, scale);
    c.strokeStyle = 'var(--bones-color)';
    c.lineWidth = 15;
    c.lineCap = 'round';
    for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        c.beginPath();
        c.moveTo(0, i * 20);
        c.quadraticCurveTo(Math.sign(i) * 100, i * 20, 0, i * 20 + (Math.sign(i) * 30));
        c.stroke();
    }
    c.restore();
}

function getBackgroundCanvas() {
    return backgroundCanvas;
}

export { initRift, expandWorld, drawStaticBackground, getBackgroundCanvas };