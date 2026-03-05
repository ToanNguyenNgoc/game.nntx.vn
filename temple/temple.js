/* ======================================================
   TEMPLE RUN — Game Engine implementation
   • 3-Lane Perspective Engine (Pseudo-3D)
   • Player states: jumping, sliding, lane-switching
   • Dynamic obstacles and collectibles
   • Swipe & Arrow Key controls
   ====================================================== */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Canvas Sizing ─────────────────────────────────────
const BASE_W = 360;
const BASE_H = 600;

function resizeCanvas() {
    const wrap = document.getElementById('canvasWrap');
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;

    // Maintain aspect ratio
    const scale = Math.min(wrapW / BASE_W, wrapH / BASE_H, 1.2);
    canvas.style.width = Math.floor(BASE_W * scale) + 'px';
    canvas.style.height = Math.floor(BASE_H * scale) + 'px';
    canvas.width = BASE_W;
    canvas.height = BASE_H;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Constants & Config ────────────────────────────────
const GROUND_Y = 520;
const HORIZON_Y = 180;
const LANES = [-1, 0, 1]; // Left, Center, Right
const LANE_WIDTH_BASE = 120;
const BASE_SPEED = 7;
const MAX_SPEED = 15;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;

// ── Game State ────────────────────────────────────────
let gameActive = false;
let score = 0;
let highScore = parseInt(localStorage.getItem('templeHigh') || '0');
let speed = BASE_SPEED;
let distance = 0;
let lastTime = 0;
let rafId = null;

let stars = [];
let particles = [];
let coinsCollected = 0;
let rushMode = false;
let rushTimer = 0;

let player = {
    lane: 0,        // -1, 0, 1
    targetLane: 0,
    laneX: 0,       // current animated X offset
    y: 0,           // altitude for jumping
    vy: 0,
    isJumping: false,
    isSliding: false,
    slideTimer: 0,
    animFrame: 0
};

let objects = []; // Coins and obstacles
let trackSegments = [];

// ── Initialize ────────────────────────────────────────
document.getElementById('highScore').textContent = highScore;

const overlayStart = document.getElementById('overlayStart');
const overlayGameOver = document.getElementById('overlayGameOver');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

function startGame() {
    overlayStart.classList.add('hidden');
    overlayGameOver.classList.add('hidden');

    gameActive = true;
    score = 0;
    speed = BASE_SPEED;
    distance = 0;
    objects = [];
    trackSegments = [];

    player = {
        lane: 0, targetLane: 0, laneX: 0,
        y: 0, vy: 0,
        isJumping: false, isSliding: false, slideTimer: 0,
        animFrame: 0
    };

    // Pre-fill track
    for (let i = 0; i < 20; i++) {
        trackSegments.push({ z: i * 50 });
    }

    updateScore();
    initStars();
    lastTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
}

function initStars() {
    stars = [];
    for (let i = 0; i < 100; i++) {
        stars.push({
            x: Math.random() * BASE_W,
            y: Math.random() * HORIZON_Y,
            size: Math.random() * 2,
            speed: Math.random() * 0.5 + 0.1
        });
    }
}

function endGame() {
    gameActive = false;
    cancelAnimationFrame(rafId);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('templeHigh', highScore);
        document.getElementById('highScore').textContent = highScore;
        document.getElementById('newRecord').classList.remove('hidden');
    } else {
        document.getElementById('newRecord').classList.add('hidden');
    }

    document.getElementById('finalScore').textContent = `Điểm của bạn: ${score}`;
    overlayGameOver.classList.remove('hidden');
}

// ── Controls ──────────────────────────────────────────
function moveLeft() {
    if (player.targetLane > -1) player.targetLane--;
}
function moveRight() {
    if (player.targetLane < 1) player.targetLane++;
}
function jump() {
    if (!player.isJumping && !player.isSliding) {
        player.isJumping = true;
        player.vy = JUMP_FORCE;
    }
}
function slide() {
    if (!player.isJumping && !player.isSliding) {
        player.isSliding = true;
        player.slideTimer = 40;
    }
}

window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    if (e.key === 'ArrowLeft') moveLeft();
    if (e.key === 'ArrowRight') moveRight();
    if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); jump(); }
    if (e.key === 'ArrowDown' || e.key === 'Shift') { e.preventDefault(); slide(); }
});

// Swipe detection
let touchStartX = 0;
let touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
    if (!gameActive) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 30) moveRight();
        else if (dx < -30) moveLeft();
    } else {
        if (dy > 30) slide();
        else if (dy < -30) jump();
    }
}, { passive: true });

// ── Core Loop ─────────────────────────────────────────
function gameLoop(ts) {
    if (!gameActive) return;
    const dt = (ts - lastTime) / 16;
    lastTime = ts;

    update(dt);
    draw(ts);

    rafId = requestAnimationFrame(gameLoop);
}

function update(dt) {
    distance += speed * dt;
    speed = Math.min(MAX_SPEED, BASE_SPEED + distance / 5000);

    // Lane animation
    const targetX = player.targetLane * 80;
    player.laneX += (targetX - player.laneX) * 0.2 * dt;

    // Jump physics
    if (player.isJumping) {
        player.y += player.vy * dt;
        player.vy += GRAVITY * dt;
        if (player.y >= 0) {
            player.y = 0;
            player.isJumping = false;
        }
    }

    // Slide mechanics
    if (player.isSliding) {
        player.slideTimer -= dt;
        if (player.slideTimer <= 0) {
            player.isSliding = false;
        }
    }

    // Rush Mode logic
    if (rushMode) {
        rushTimer -= dt;
        if (rushTimer <= 0) rushMode = false;
    }

    // Objects logic
    updateObjects(dt);
    updateParticles(dt);
    updateStars(dt);

    // Scoring
    score = Math.floor(distance / 10) + coinsCollected * 50;
    updateScore();
}

function updateStars(dt) {
    stars.forEach(s => {
        s.y += s.speed * dt;
        if (s.y > HORIZON_Y) s.y = 0;
    });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.02 * dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 1,
            color: color
        });
    }
}

function updateObjects(dt) {
    // Spawn objects
    if (Math.random() < 0.05) {
        const lane = LANES[Math.floor(Math.random() * 3)];
        const type = Math.random() < 0.3 ? 'coin' : (Math.random() < 0.5 ? 'h-barrier' : 'l-barrier');

        // Don't overlap too much
        const recentlySpawned = objects.some(o => o.z > 800);
        if (!recentlySpawned) {
            objects.push({
                x: lane,
                z: 1000,
                type: type,
                collected: false
            });
        }
    }

    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        obj.z -= speed * dt;

        // Collision detection
        if (obj.z > 20 && obj.z < 100) {
            const inCorrectLane = Math.abs(obj.x - player.targetLane) < 0.5;
            if (inCorrectLane && !obj.collected) {
                if (obj.type === 'coin') {
                    obj.collected = true;
                    coinsCollected++;
                    spawnParticles(BASE_W / 2 + player.laneX, GROUND_Y + player.y - 30, '#ffdd00');

                    if (coinsCollected % 20 === 0) {
                        rushMode = true;
                        rushTimer = 300; // ~5 seconds
                    }
                } else if (!rushMode) {
                    if (obj.type === 'h-barrier') {
                        if (!player.isJumping) endGame();
                    } else if (obj.type === 'l-barrier') {
                        if (!player.isSliding) endGame();
                    }
                }
            }
        }

        if (obj.z < -50) objects.splice(i, 1);
    }
}

function updateScore() {
    document.getElementById('score').textContent = score;
}

// ── Rendering ─────────────────────────────────────────
function draw(ts) {
    ctx.clearRect(0, 0, BASE_W, BASE_H);

    drawBackground();
    drawStars();
    drawTrack();
    drawObjects();
    drawParticles();
    drawPlayer(ts);

    if (rushMode) drawRushOverlay();
}

function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(s => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1;
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function drawRushOverlay() {
    ctx.strokeStyle = 'rgba(255, 221, 0, 0.5)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, BASE_W - 10, BASE_H - 10);

    ctx.fillStyle = 'rgba(255, 221, 0, 0.2)';
    ctx.font = 'bold 24px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('RUSH MODE!', BASE_W / 2, 100);
}

function drawBackground() {
    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, '#0a0a20');
    sky.addColorStop(1, '#1a1a40');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, BASE_W, HORIZON_Y);

    // Distant Walls/Jungle
    ctx.fillStyle = '#051005';
    ctx.fillRect(0, HORIZON_Y, BASE_W, BASE_H - HORIZON_Y);
}

function drawTrack() {
    const laneColors = ['#2a2a2a', '#333333', '#2a2a2a'];

    // Draw 3 lanes
    for (let i = 0; i < 3; i++) {
        const laneVal = LANES[i];
        ctx.fillStyle = laneColors[i];

        ctx.beginPath();
        // Top coordinates (horizon)
        const tX1 = BASE_W / 2 + (laneVal - 0.5) * 20;
        const tX2 = BASE_W / 2 + (laneVal + 0.5) * 20;
        // Bottom coordinates
        const bX1 = BASE_W / 2 + (laneVal - 0.5) * 160;
        const bX2 = BASE_W / 2 + (laneVal + 0.5) * 160;

        ctx.moveTo(tX1, HORIZON_Y);
        ctx.lineTo(tX2, HORIZON_Y);
        ctx.lineTo(bX2, BASE_H);
        ctx.lineTo(bX1, BASE_H);
        ctx.closePath();
        ctx.fill();

        // Lane lines
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Moving stripes to show speed
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    const offset = (distance % 100);
    for (let z = 1000; z >= 0; z -= 100) {
        const cz = z - offset;
        if (cz < 0) continue;
        const factor = cz / 1000;
        const y = HORIZON_Y + (1 - factor) * (BASE_H - HORIZON_Y);
        const w = 40 + (1 - factor) * 320;
        ctx.beginPath();
        ctx.moveTo(BASE_W / 2 - w / 2, y);
        ctx.lineTo(BASE_W / 2 + w / 2, y);
        ctx.stroke();
    }
}

function drawObjects() {
    objects.forEach(obj => {
        if (obj.collected) return;

        const factor = obj.z / 1000;
        const y = HORIZON_Y + (1 - factor) * (BASE_H - HORIZON_Y);
        const scale = 0.2 + (1 - factor) * 0.8;
        const x = BASE_W / 2 + (obj.x * 120 * (1 - factor));

        if (obj.type === 'coin') {
            ctx.fillStyle = '#ffdd00';
            ctx.beginPath();
            ctx.arc(x, y - 20 * scale, 10 * scale, 0, Math.PI * 2);
            ctx.fill();
            // Glow
            ctx.shadowBlur = 10 * scale;
            ctx.shadowColor = '#ffdd00';
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (obj.type === 'h-barrier') {
            // Hurdle
            ctx.fillStyle = '#ff3e3e';
            ctx.fillRect(x - 40 * scale, y - 10 * scale, 80 * scale, 10 * scale);
            ctx.fillStyle = '#880000';
            ctx.fillRect(x - 40 * scale, y - 40 * scale, 10 * scale, 40 * scale);
            ctx.fillRect(x + 30 * scale, y - 40 * scale, 10 * scale, 40 * scale);
        } else if (obj.type === 'l-barrier') {
            // High Beam (must slide)
            ctx.fillStyle = '#ff3e3e';
            ctx.fillRect(x - 60 * scale, y - 80 * scale, 120 * scale, 20 * scale);
            ctx.fillStyle = '#880000';
            ctx.fillRect(x - 60 * scale, y - 80 * scale, 10 * scale, 80 * scale);
            ctx.fillRect(x + 50 * scale, y - 80 * scale, 10 * scale, 80 * scale);
        }
    });
}

function drawPlayer(ts) {
    const py = GROUND_Y + player.y;
    const isRush = rushMode;

    // Animation bob
    const bob = Math.sin(ts * 0.01) * (player.isJumping ? 0 : 3);
    const legAnim = Math.sin(ts * 0.02) * 10;

    ctx.save();
    ctx.translate(BASE_W / 2 + player.laneX, py);

    if (player.isSliding) {
        // Slide pose - Cyan glowy streak
        const gradient = ctx.createLinearGradient(0, 0, 0, -20);
        gradient.addColorStop(0, '#00e5ff');
        gradient.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, -5, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00e5ff';
        ctx.stroke();
    } else {
        // Body color
        ctx.fillStyle = isRush ? '#ffcc00' : '#00e5ff';

        // Legs
        if (!player.isJumping) {
            ctx.fillRect(-8, -10, 4, 10 + legAnim);
            ctx.fillRect(4, -10, 4, 10 - legAnim);
        } else {
            ctx.fillRect(-8, -10, 4, 5);
            ctx.fillRect(4, -10, 4, 5);
        }

        // Body
        const h = player.isJumping ? 40 : 45;
        const w = 20;
        ctx.fillRect(-w / 2, -h + bob - 10, w, h);

        // Arms (swinging)
        const armSwing = Math.sin(ts * 0.02) * 15;
        ctx.fillRect(-w / 2 - 5, -h + bob, 4, 20 + armSwing);
        ctx.fillRect(w / 2 + 1, -h + bob, 4, 20 - armSwing);

        // Head
        ctx.beginPath();
        ctx.arc(0, -h - 20 + bob, 10, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = ctx.fillStyle;
        ctx.stroke();
    }

    ctx.restore();
}

// Draw initial frame
draw();
