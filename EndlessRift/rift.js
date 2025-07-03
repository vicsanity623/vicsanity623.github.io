import { world, visualEffects, gameState } from './systemsmanager.js'; // Corrected import based on global PVE requirements

let backgroundCanvas, bgCtx;

// NEW: Seeded random number generator
let currentSeed = 1; // Default seed, will be set by the game state

/**
 * Sets the seed for the random number generator.
 * @param {number} seed - The seed value.
 */
function setSeed(seed) {
    currentSeed = seed;
}

/**
 * Generates a pseudo-random number between 0 (inclusive) and 1 (exclusive) using the current seed.
 * Algorithm: LCG (Linear Congruential Generator)
 * Parameters: m = 2^31 - 1, a = 1103515245, c = 12345 (simplified, common LCG parameters)
 * Chosen LCG parameters for 0-1 range: (seed * 9301 + 49297) % 233280
 */
function seededRandom() {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
}

/**
 * Initializes the rift background canvas and draws the static background.
 * The worldSeed is used to ensure consistent background generation across all clients.
 * @param {number} [worldSeed] - Optional. The seed for generating the world background.
 */
function initRift(worldSeed) {
    backgroundCanvas = document.createElement('canvas');
    bgCtx = backgroundCanvas.getContext('2d');
    // Set the initial seed based on the global world seed
    // If worldSeed is not provided (e.g., initial app load), use a temporary one.
    setSeed(worldSeed || Date.now()); 
    drawStaticBackground();
}

/**
 * Expands the game world and triggers a visual expansion effect.
 * The static background is redrawn to reflect the new world dimensions, maintaining consistency.
 * @param {object} camera - The camera object with width and height properties.
 * @param {object} player - The player object with x and y properties.
 */
function expandWorld(camera, player) {
    world.width *= 1.2;
    world.height *= 1.2;
    // Redraw the static background using the globally synchronized world seed
    drawStaticBackground();
    visualEffects.push({
        type: 'world_expansion', x: player.x, y: player.y, radius: 10,
        maxRadius: Math.max(camera.width, camera.height), life: 1000,
        update(dt) { this.radius += (this.maxRadius / 1000) * dt; this.life -= dt; return this.life <= 0; }
    });
}

/**
 * Draws the static background elements (cracks and bones) onto the background canvas.
 * The seed is reset here using the global game state's worldSeed to ensure consistency
 * whenever the background needs to be redrawn (e.g., on world expansion or initial load).
 */
function drawStaticBackground() {
    if (!backgroundCanvas) return;
    backgroundCanvas.width = world.width;
    backgroundCanvas.height = world.height;
    bgCtx.clearRect(0, 0, world.width, world.height);

    // IMPORTANT: Reset seed here before drawing to ensure the same pattern for all players
    // This guarantees that if the background is redrawn (e.g., due to world expansion),
    // the cracks and bones remain consistent for all clients.
    setSeed(gameState.worldSeed || 1); // Use the synchronized worldSeed, fallback to 1 if not yet available

    for (let i = 0; i < 150; i++) drawCrack(bgCtx, seededRandom() * world.width, seededRandom() * world.height, 5 + seededRandom() * 10);
    for (let i = 0; i < 50; i++) drawBoneSet(bgCtx, seededRandom() * world.width, seededRandom() * world.height, seededRandom() * 0.8 + 0.4, seededRandom() * Math.PI * 2);
}

/**
 * Draws a single crack element.
 * @param {CanvasRenderingContext2D} c - The 2D rendering context.
 * @param {number} x - Starting X coordinate.
 * @param {number} y - Starting Y coordinate.
 * @param {number} segments - Number of segments in the crack.
 */
function drawCrack(c, x, y, segments) {
    c.beginPath();
    c.moveTo(x, y);
    c.strokeStyle = 'var(--cracks-color)';
    c.lineWidth = seededRandom() * 3 + 1; // Resolved conflict: keep seededRandom
    c.shadowColor = 'var(--cracks-color)';
    c.shadowBlur = 10;
    for (let i = 0; i < segments; i++) {
        x += (seededRandom() - 0.5) * 40; // Resolved conflict: keep seededRandom
        y += (seededRandom() - 0.5) * 40; // Resolved conflict: keep seededRandom
        c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
}

/**
 * Draws a set of bone-like structures.
 * @param {CanvasRenderingContext2D} c - The 2D rendering context.
 * @param {number} x - Center X coordinate.
 * @param {number} y - Center Y coordinate.
 * @param {number} scale - Scaling factor for the bone set.
 * @param {number} rotation - Rotation angle for the bone set.
 */
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

/**
 * Returns the offscreen background canvas.
 * @returns {HTMLCanvasElement} The canvas containing the static background.
 */
function getBackgroundCanvas() {
    return backgroundCanvas;
}

// MODIFIED: Export setSeed and seededRandom
export { initRift, expandWorld, drawStaticBackground, getBackgroundCanvas, setSeed, seededRandom };
