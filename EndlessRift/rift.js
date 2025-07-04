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

    const baseBgColor = '#222'; // Dark background
    const accentBgColor = '#333'; // Slightly lighter for subtle patterns

    // Fill with base background color
    bgCtx.fillStyle = baseBgColor;
    bgCtx.fillRect(0, 0, world.width, world.height);

    // Add subtle, shifting "void" or "dust" particles
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * world.width;
        const y = Math.random() * world.height;
        const size = Math.random() * 1.5 + 0.5;
        const alpha = Math.random() * 0.2 + 0.05;
        bgCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        bgCtx.beginPath();
        bgCtx.arc(x, y, size, 0, Math.PI * 2);
        bgCtx.fill();
    }

    // Existing cracks, potentially with more variation or animation effect
    for (let i = 0; i < 150; i++) drawCrack(bgCtx, Math.random() * world.width, Math.random() * world.height, 5 + Math.random() * 10);
    
    // Existing bones, potentially with more details
    for (let i = 0; i < 50; i++) drawBoneSet(bgCtx, Math.random() * world.width, Math.random() * world.height, Math.random() * 0.8 + 0.4, Math.random() * Math.PI * 2);
    
    // Add some faint, distant "stars" or cosmic dust
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * world.width;
        const y = Math.random() * world.height;
        const size = Math.random() * 1 + 0.2;
        const alpha = Math.random() * 0.3 + 0.1;
        bgCtx.fillStyle = `rgba(150, 150, 200, ${alpha})`; // Faint blueish stars
        bgCtx.beginPath();
        bgCtx.arc(x, y, size, 0, Math.PI * 2);
        bgCtx.fill();
    }

    // Add subtle, larger, ethereal "clouds" or "nebulae"
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * world.width;
        const y = Math.random() * world.height;
        const radius = Math.random() * 300 + 100;
        const gradient = bgCtx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(50, 0, 100, ${Math.random() * 0.1})`); // Dark purple center
        gradient.addColorStop(0.5, `rgba(10, 0, 40, ${Math.random() * 0.05})`); // Darker purple fade
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bgCtx.fillStyle = gradient;
        bgCtx.beginPath();
        bgCtx.arc(x, y, radius, 0, Math.PI * 2);
        bgCtx.fill();
    }
}

function drawCrack(c, x, y, segments) {
    c.beginPath();
    c.moveTo(x, y);
    c.strokeStyle = 'var(--cracks-color)';
    c.lineWidth = Math.random() * 3 + 1;
    c.shadowColor = 'var(--cracks-color)';
    c.shadowBlur = 10;
    c.globalAlpha = 0.6 + Math.random() * 0.4; // Vary opacity
    for (let i = 0; i < segments; i++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
    c.globalAlpha = 1; // Reset alpha
}

function drawBoneSet(c, x, y, scale, rotation) {
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale(scale, scale);
    c.strokeStyle = 'var(--bones-color)';
    c.lineWidth = 15;
    c.lineCap = 'round';
    c.shadowColor = 'rgba(0, 0, 0, 0.5)'; // Add slight shadow for depth
    c.shadowBlur = 5;
    c.globalAlpha = 0.7 + Math.random() * 0.3; // Vary opacity
    for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        c.beginPath();
        // Make the bones slightly less uniform
        const boneLength = 20 + Math.random() * 10;
        const controlPointOffset = Math.sign(i) * (100 + Math.random() * 20);
        c.moveTo(0, i * boneLength);
        c.quadraticCurveTo(controlPointOffset, i * boneLength, 0, i * boneLength + (Math.sign(i) * 30));
        c.stroke();
    }
    c.restore();
}

function getBackgroundCanvas() {
    return backgroundCanvas;
}

export { initRift, expandWorld, drawStaticBackground, getBackgroundCanvas };