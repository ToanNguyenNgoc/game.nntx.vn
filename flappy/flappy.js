/* ======================================================
   FLAPPY BIRD — Full implementation
   • Procedurally drawn bird (body, beak, eye, wing flap)
   • Scrolling parallax background (sky, clouds, mountains)
   • Pipes with gradient + rounded caps
   • Particle burst on score
   • Progressive difficulty (speed + gap shrink)
   • requestAnimationFrame game loop
   • Keyboard / mouse / touch controls
   ====================================================== */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Canvas sizing ─────────────────────────────────────
const BASE_W = 360;
const BASE_H = 600;

function resizeCanvas() {
    const wrap = canvas.parentElement;
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    // Keep aspect ratio BASE_W:BASE_H
    const scale = Math.min(wrapW / BASE_W, wrapH / BASE_H, 1.4);
    canvas.style.width = Math.floor(BASE_W * scale) + 'px';
    canvas.style.height = Math.floor(BASE_H * scale) + 'px';
    canvas.width = BASE_W;
    canvas.height = BASE_H;
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); if (!gameActive) drawIdleFrame(); });

// ── Constants ───────────────────────────────────────────
const GRAVITY = 0.20;   // rơi chậm
const FLAP_VEL = -5.2;   // bật nhẹ
const BASE_SPEED = 1.7;    // tốc độ ban đầu
const PIPE_GAP_MIN = 108;
const PIPE_GAP_DEF = 158;
const PIPE_INTERVAL_MAX = 2000;  // ms giữa 2 cột lúc đầu (xa nhau)
const PIPE_INTERVAL_MIN = 900;   // ms giữa 2 cột lúc khó nhất
const GROUND_H = 60;
const PIPE_W = 52;

// ── DOM ───────────────────────────────────────────────
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('highScore');
const finalEl = document.getElementById('finalScore');
const recEl = document.getElementById('newRecord');

const overlayStart = document.getElementById('overlayStart');
const overlayGameOver = document.getElementById('overlayGameOver');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

let highScore = parseInt(localStorage.getItem('flappyHigh') || '0');
highEl.textContent = highScore;

// ── State ─────────────────────────────────────────────
let bird, pipes, particles, clouds, score;
let gameActive = false, started = false;
let rafId = null, lastTime = 0;
let pipeTimer = 0;
let speed, pipeGap;
let groundOffset = 0;
let bgOffset = 0;
let wingPhase = 0;   // for wing animation

// Bird model
function newBird() {
    return {
        x: 80, y: BASE_H / 2 - 20,
        vy: 0,
        r: 16,          // radius
        rot: 0,         // rotation angle
        wingAngle: 0,   // flapping wing angle
        dead: false,
        deathTimer: 0,
    };
}

// ── Game Control ──────────────────────────────────────
function difficultyAt(s) {
    // Returns { speed, pipeInterval, pipeGap } for a given score s
    return {
        speed: Math.min(BASE_SPEED + s * 0.06, 5.8),
        pipeInterval: Math.max(PIPE_INTERVAL_MIN,
            PIPE_INTERVAL_MAX - s * 55),   // fewer ms = more pipes
        pipeGap: Math.max(PIPE_GAP_MIN, PIPE_GAP_DEF - s * 2),
    };
}

function startGame() {
    overlayStart.classList.add('hidden');
    overlayGameOver.classList.add('hidden');
    bird = newBird();
    pipes = [];
    particles = [];
    clouds = initClouds();
    score = 0;
    const d = difficultyAt(0);
    speed = d.speed;
    pipeGap = d.pipeGap;
    pipeTimer = 0;
    groundOffset = 0;
    bgOffset = 0;
    wingPhase = 0;
    gameActive = true;
    started = false;
    updateHUD();

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

function endGame() {
    bird.dead = true;
    gameActive = false;

    const isNew = score > highScore;
    if (isNew) {
        highScore = score;
        localStorage.setItem('flappyHigh', highScore);
        highEl.textContent = highScore;
    }

    finalEl.textContent = `Điểm của bạn: ${score}`;
    recEl.classList.toggle('hidden', !isNew);

    // Show game over after short death animation
    setTimeout(() => overlayGameOver.classList.remove('hidden'), 900);
}

function flap() {
    if (bird.dead) return;
    if (!started) { started = true; }
    bird.vy = FLAP_VEL;
    bird.rot = -0.45;   // tilt up on flap
    // Wing burst particles
    for (let i = 0; i < 4; i++) {
        const a = Math.PI + (Math.random() - 0.5) * 1.2;
        particles.push({
            x: bird.x, y: bird.y + bird.r * 0.4,
            vx: Math.cos(a) * (Math.random() * 2 + 1),
            vy: Math.sin(a) * (Math.random() * 2 + 0.5),
            life: 1, decay: 0.07,
            size: Math.random() * 4 + 2,
            color: '#ffdd00',
        });
    }
}

function updateHUD() {
    scoreEl.textContent = score;
    highEl.textContent = Math.max(score, highScore);
}

// ── Input ─────────────────────────────────────────────
function handleInput() {
    if (!gameActive && !bird) return;
    if (gameActive) flap();
}

document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (!gameActive) startGame();
        else handleInput();
    }
});
canvas.addEventListener('click', () => { if (!gameActive) startGame(); else handleInput(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); if (!gameActive) startGame(); else handleInput(); }, { passive: false });
document.addEventListener('touchstart', e => {
    // Only on game area (not overlays/buttons)
    if (gameActive && e.target === canvas) { e.preventDefault(); handleInput(); }
}, { passive: false });

// ── Clouds ────────────────────────────────────────────
function initClouds() {
    const cs = [];
    for (let i = 0; i < 5; i++) {
        cs.push({
            x: Math.random() * BASE_W,
            y: 40 + Math.random() * 180,
            w: 60 + Math.random() * 80,
            h: 20 + Math.random() * 20,
            speed: 0.3 + Math.random() * 0.4,
            alpha: 0.3 + Math.random() * 0.3,
        });
    }
    return cs;
}

// ── Pipe spawning ─────────────────────────────────────
function spawnPipe(ts) {
    const minTop = 60;
    const maxTop = BASE_H - GROUND_H - pipeGap - 60;
    const topH = minTop + Math.random() * (maxTop - minTop);
    pipes.push({
        x: BASE_W + PIPE_W,
        topH,
        botY: topH + pipeGap,
        botH: BASE_H - GROUND_H - topH - pipeGap,
        scored: false,
        sway: Math.random() * Math.PI * 2,  // slight wobble phase
    });
}

// ── Collision ─────────────────────────────────────────
function checkCollision() {
    const bx = bird.x, by = bird.y, br = bird.r - 4;  // slightly forgiving

    // Ground & ceiling
    if (by + br >= BASE_H - GROUND_H || by - br <= 0) return true;

    // Pipes
    for (const p of pipes) {
        const px = p.x, pw = PIPE_W;
        // Within horizontal range?
        if (bx + br > px && bx - br < px + pw) {
            if (by - br < p.topH || by + br > p.botY) return true;
        }
    }
    return false;
}

// ── Score milestone particles ─────────────────────────
function spawnScoreParticles(x, y) {
    for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const s = Math.random() * 3 + 2;
        particles.push({
            x, y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 1, decay: 0.03,
            size: Math.random() * 5 + 3,
            color: ['#ffdd00', '#00e5ff', '#00ff88', '#ff8800'][Math.floor(Math.random() * 4)],
        });
    }
}

// ── Main Loop ──────────────────────────────────────────
function loop(ts) {
    if (!gameActive && !bird?.dead) return;

    const dt = Math.min(ts - lastTime, 50); // cap delta at 50ms
    lastTime = ts;

    if (started && !bird.dead) {
        // Physics
        bird.vy += GRAVITY;
        bird.y += bird.vy;
        bird.rot = Math.max(-0.5, Math.min(1.4, bird.rot + 0.07)); // drift nose down
        wingPhase += 0.25;

        // Spawn pipes — interval shrinks as score grows
        pipeTimer += dt;
        const curInterval = difficultyAt(score).pipeInterval;
        if (pipeTimer >= curInterval) {
            pipeTimer -= curInterval;
            spawnPipe(ts);
        }

        // Move pipes & score
        for (const p of pipes) {
            p.x -= speed;
            p.sway += 0.02;
            if (!p.scored && p.x + PIPE_W < bird.x) {
                p.scored = true;
                score++;
                updateHUD();
                spawnScoreParticles(bird.x, bird.y - 30);
                // Difficulty ramp — recalculate every point
                const d = difficultyAt(score);
                speed = d.speed;
                pipeGap = d.pipeGap;
                // pipeInterval is used live via difficultyAt(score) in spawn logic
            }
        }
        pipes = pipes.filter(p => p.x > -PIPE_W - 10);

        // Scroll BG
        bgOffset = (bgOffset + speed * 0.3) % BASE_W;
        groundOffset = (groundOffset + speed) % 40;

        // Clouds
        for (const c of clouds) {
            c.x -= c.speed;
            if (c.x + c.w < 0) { c.x = BASE_W + 10; c.y = 40 + Math.random() * 180; }
        }

        // Collision
        if (checkCollision()) {
            endGame();
        }
    } else if (!started && !bird.dead) {
        // Idle bob before first flap
        bird.y = BASE_H / 2 - 20 + Math.sin(ts * 0.003) * 8;
        wingPhase += 0.1;
        bgOffset = (bgOffset + 0.4) % BASE_W;
        groundOffset = (groundOffset + 0.8) % 40;
        for (const c of clouds) { c.x -= c.speed * 0.3; if (c.x + c.w < 0) c.x = BASE_W + 10; }
    }

    // Death fall-through animation
    if (bird.dead) {
        bird.vy += GRAVITY * 1.2;
        bird.y += bird.vy;
        bird.rot = Math.min(bird.rot + 0.15, Math.PI / 2);
        bird.deathTimer++;
        if (bird.deathTimer > 80) { rafId = null; return; }
    }

    draw(ts);
    rafId = requestAnimationFrame(loop);
}

// ── Drawing ───────────────────────────────────────────
function draw(ts) {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, BASE_H - GROUND_H);
    sky.addColorStop(0, '#0a0f2e');
    sky.addColorStop(0.5, '#0d1f4a');
    sky.addColorStop(1, '#0e2a5a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, BASE_W, BASE_H - GROUND_H);

    drawClouds();
    drawMountains();
    drawPipes();
    drawGround();
    drawBird(ts);
    drawParticlesAll();
    drawHUDCanvas();
}

function drawIdleFrame() {
    if (!bird) return;
    draw(performance.now());
}

// Sky elements
function drawClouds() {
    for (const c of clouds) {
        ctx.save();
        ctx.globalAlpha = c.alpha;
        ctx.fillStyle = 'rgba(180,220,255,0.6)';
        // Puff cloud shape
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - c.w * 0.2, cy + c.h * 0.1, c.w * 0.3, c.h * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + c.w * 0.2, cy + c.h * 0.1, c.w * 0.28, c.h * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawMountains() {
    // Far mountains (parallax)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#4488bb';
    const mOff = bgOffset * 0.15;
    for (let i = -1; i < 4; i++) {
        const mx = i * 130 - mOff % 130;
        ctx.beginPath();
        ctx.moveTo(mx, BASE_H - GROUND_H);
        ctx.lineTo(mx + 65, BASE_H - GROUND_H - 140);
        ctx.lineTo(mx + 130, BASE_H - GROUND_H);
        ctx.fill();
    }
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#2266aa';
    const mOff2 = bgOffset * 0.25;
    for (let i = -1; i < 4; i++) {
        const mx = i * 90 - mOff2 % 90 + 20;
        ctx.beginPath();
        ctx.moveTo(mx, BASE_H - GROUND_H);
        ctx.lineTo(mx + 45, BASE_H - GROUND_H - 90);
        ctx.lineTo(mx + 90, BASE_H - GROUND_H);
        ctx.fill();
    }
    ctx.restore();
}

// ── Pipes ─────────────────────────────────────────────
function drawPipes() {
    for (const p of pipes) {
        const grd = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
        grd.addColorStop(0, '#1a5c2a');
        grd.addColorStop(0.3, '#2ecc52');
        grd.addColorStop(0.7, '#27a845');
        grd.addColorStop(1, '#1a5c2a');

        // Top pipe
        ctx.fillStyle = grd;
        ctx.fillRect(p.x, 0, PIPE_W, p.topH - 12);
        // Top pipe cap
        drawPipeCap(p.x - 5, p.topH - 28, PIPE_W + 10, 28, 'bottom');

        // Bottom pipe
        ctx.fillRect(p.x, p.botY + 12, PIPE_W, p.botH - 12);
        // Bottom pipe cap
        drawPipeCap(p.x - 5, p.botY, PIPE_W + 10, 28, 'top');

        // Pipe highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(p.x + 6, 0, 8, p.topH - 12);
        ctx.fillRect(p.x + 6, p.botY + 12, 8, p.botH - 12);
    }
}

function drawPipeCap(x, y, w, h, side) {
    const r = 6;
    ctx.fillStyle = '#27a845';
    ctx.beginPath();
    if (side === 'bottom') {
        // rounded bottom
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y);
    }
    ctx.fill();

    // Cap highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 7, y + 4, 10, h - 8);
}

// ── Ground ────────────────────────────────────────────
function drawGround() {
    // Base
    const grd = ctx.createLinearGradient(0, BASE_H - GROUND_H, 0, BASE_H);
    grd.addColorStop(0, '#8b6914');
    grd.addColorStop(0.3, '#c8960f');
    grd.addColorStop(1, '#6b4f10');
    ctx.fillStyle = grd;
    ctx.fillRect(0, BASE_H - GROUND_H, BASE_W, GROUND_H);

    // Grass strip
    ctx.fillStyle = '#4a9e2e';
    ctx.fillRect(0, BASE_H - GROUND_H, BASE_W, 14);

    // Scrolling stripe texture
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < BASE_W + 40; i += 40) {
        const sx = (i - groundOffset) % BASE_W;
        ctx.fillRect(sx, BASE_H - GROUND_H + 14, 20, GROUND_H - 14);
    }

    // Top grass blades
    ctx.fillStyle = '#5cb836';
    for (let i = -2; i < BASE_W + 40; i += 14) {
        const sx = (i - groundOffset * 0.7) % (BASE_W + 14);
        ctx.fillRect(sx, BASE_H - GROUND_H - 4, 4, 10);
    }
}

// ── Bird ──────────────────────────────────────────────
function drawBird(ts) {
    const bx = bird.x, by = bird.y;
    const r = bird.r;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(bird.rot);

    // Wing shadow
    const wingY = r * 0.25;
    const wingA = Math.sin(wingPhase) * 0.8;  // -0.8..0.8 rad

    // Wing (lower)
    ctx.save();
    ctx.rotate(wingA);
    ctx.fillStyle = '#c8960f';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, wingY, r * 0.75, r * 0.35, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    const bodyGrd = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r);
    bodyGrd.addColorStop(0, '#ffe566');
    bodyGrd.addColorStop(0.6, '#ffc107');
    bodyGrd.addColorStop(1, '#e6890a');
    ctx.fillStyle = bodyGrd;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye white
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(r * 0.35, -r * 0.25, r * 0.35, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.ellipse(r * 0.45, -r * 0.22, r * 0.16, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(r * 0.5, -r * 0.3, r * 0.07, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.05);
    ctx.lineTo(r * 1.15, r * 0.1);
    ctx.lineTo(r * 0.5, r * 0.25);
    ctx.closePath();
    ctx.fill();
    // Beak divider
    ctx.strokeStyle = '#cc4400';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.1);
    ctx.lineTo(r * 1.1, r * 0.1);
    ctx.stroke();

    // Cheek blush
    ctx.fillStyle = 'rgba(255,100,80,0.4)';
    ctx.beginPath();
    ctx.ellipse(r * 0.3, r * 0.2, r * 0.22, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Glow aura when alive
    if (!bird.dead) {
        const aura = ctx.createRadialGradient(bx, by, r * 0.5, bx, by, r * 2);
        aura.addColorStop(0, 'rgba(255,220,50,0.18)');
        aura.addColorStop(1, 'rgba(255,220,50,0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(bx, by, r * 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── Particles ─────────────────────────────────────────
function drawParticlesAll() {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.vx *= 0.96;
        p.life -= p.decay;
        const alpha = Math.max(0, Math.round(p.life * 255)).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
        ctx.fillStyle = p.color + alpha;
        ctx.fill();
    }
}

// ── HUD on canvas ─────────────────────────────────────
function drawHUDCanvas() {
    // Score
    ctx.save();
    ctx.shadowColor = 'rgba(0,229,255,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(score, BASE_W / 2, 54);
    ctx.restore();

    // "TAP TO FLAP" hint before start
    if (!started && !bird?.dead) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.004) * 0.5;
        ctx.fillStyle = '#fff';
        ctx.font = '14px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👆  Chạm để bắt đầu', BASE_W / 2, BASE_H / 2 + 68);
        ctx.restore();
    }
}

// ── Stars ─────────────────────────────────────────────
const starsEl = document.getElementById('stars');
for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.width = s.style.height = (Math.random() * 2 + 0.5) + 'px';
    s.style.animationDelay = Math.random() * 4 + 's';
    s.style.animationDuration = (Math.random() * 3 + 2) + 's';
    starsEl.appendChild(s);
}

// Mobile/desktop hints
if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600) {
    document.getElementById('keyHint').classList.add('hidden');
    document.getElementById('touchHint').classList.remove('hidden');
}

// Initial frame
bird = newBird();
clouds = initClouds();
pipes = []; particles = []; score = 0; pipeGap = PIPE_GAP_DEF; speed = BASE_SPEED;
rafId = requestAnimationFrame(ts => { lastTime = ts; loop(ts); });
