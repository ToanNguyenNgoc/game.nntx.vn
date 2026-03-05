/* ======================================================
   TETRIS — Complete implementation
   • All 7 tetrominoes (SRS rotation)
   • Ghost piece  • Hold piece  • Next preview
   • Level / speed progression
   • Line-clear scoring (single/double/triple/tetris)
   • Lock delay  • requestAnimationFrame game loop
   • Keyboard + Virtual joystick (touch/mouse)
   ====================================================== */

// ── Canvas setup ──────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCvs = document.getElementById('nextCanvas');
const nCtx = nextCvs.getContext('2d');
const holdCvs = document.getElementById('holdCanvas');
const hCtx = holdCvs.getContext('2d');

const COLS = 10;
const ROWS = 20;
const CELL = canvas.width / COLS;   // 30px

// Resize canvas to fit available height on mobile
function resizeCanvas() {
    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
    if (isMobile) {
        const isLand = window.innerWidth > window.innerHeight;
        const ctrlH = isLand ? 130 : 160;
        const headerH = isLand ? 46 : 70;
        const avail = window.innerHeight - headerH - ctrlH - 20;
        const maxW = window.innerWidth - 20;
        const h = Math.min(avail, maxW * 2, 600);   // aspect 1:2
        const w = h / 2;
        canvas.style.height = Math.max(200, h) + 'px';
        canvas.style.width = Math.max(100, w) + 'px';
    } else {
        canvas.style.width = '';
        canvas.style.height = '';
    }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Tetrominoes ───────────────────────────────────────
// Each piece: array of 4 rotation states; each state is a 2d array
const PIECES = {
    I: {
        color: '#00e5ff',
        shadow: 'rgba(0,229,255,0.3)',
        shapes: [
            [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
            [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
        ],
    },
    O: {
        color: '#ffdd00',
        shadow: 'rgba(255,221,0,0.3)',
        shapes: [
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
        ],
    },
    T: {
        color: '#a855f7',
        shadow: 'rgba(168,85,247,0.3)',
        shapes: [
            [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
            [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
            [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
            [[0, 1, 0], [1, 1, 0], [0, 1, 0]],
        ],
    },
    S: {
        color: '#00ff88',
        shadow: 'rgba(0,255,136,0.3)',
        shapes: [
            [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
            [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
            [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
            [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
        ],
    },
    Z: {
        color: '#ff3e3e',
        shadow: 'rgba(255,62,62,0.3)',
        shapes: [
            [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
            [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
            [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
            [[0, 1, 0], [1, 1, 0], [1, 0, 0]],
        ],
    },
    J: {
        color: '#3b82f6',
        shadow: 'rgba(59,130,246,0.3)',
        shapes: [
            [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
            [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
            [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
            [[0, 1, 0], [0, 1, 0], [1, 1, 0]],
        ],
    },
    L: {
        color: '#ff8800',
        shadow: 'rgba(255,136,0,0.3)',
        shapes: [
            [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
            [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
            [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
            [[1, 1, 0], [0, 1, 0], [0, 1, 0]],
        ],
    },
};

const PIECE_KEYS = Object.keys(PIECES);

// SRS wall-kick data (J/L/S/T/Z and I separate)
const KICKS_JLSTZ = [
    [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],  // 0→1
    [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],       // 1→2
    [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],      // 2→3
    [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],   // 3→0
];
const KICKS_I = [
    [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
];

// ── Game State ────────────────────────────────────────
let board, current, hold, nextBag, score, level, lines;
let gameActive = false, paused = false;
let canHold = true;
let rafId = null, lastTime = 0, dropAcc = 0;
let lockTimer = null, lockDelay = 500;
let highScore = parseInt(localStorage.getItem('tetrisHigh') || '0');

// ── Line-clear animation state ─────────────────────────
const CLEAR_DURATION = 420; // ms
let clearing = false;   // are we in clear animation?
let clearStartTime = 0;
let clearRows = [];      // row indices being cleared
let clearColors = [];      // per-row colours for particles
let particles = [];      // [{x,y,vx,vy,life,decay,size,color}]
let shakeFrames = 0;       // canvas shake counter (Tetris bonus)

// DOM
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const finalEl = document.getElementById('finalScore');
const recEl = document.getElementById('newRecord');

const overlayStart = document.getElementById('overlayStart');
const overlayPause = document.getElementById('overlayPause');
const overlayGameOver = document.getElementById('overlayGameOver');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('restartFromPause').addEventListener('click', startGame);

highEl.textContent = highScore;

// ── Bag randomizer (7-bag) ────────────────────────────
function newBag() {
    const bag = [...PIECE_KEYS];
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
}

function nextPiece() {
    if (nextBag.length < 2) nextBag.push(...newBag());
    const key = nextBag.shift();
    return createPiece(key);
}

function createPiece(key) {
    return {
        key,
        shape: 0,           // rotation index
        x: key === 'O' ? 4 : 3,
        y: key === 'I' ? -1 : 0,
    };
}

function getShape(piece) {
    return PIECES[piece.key].shapes[piece.shape];
}

// ── Collision ─────────────────────────────────────────
function collides(piece, dx = 0, dy = 0, shape = null) {
    const s = shape || getShape(piece);
    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (!s[r][c]) continue;
            const nx = piece.x + c + dx;
            const ny = piece.y + r + dy;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
        }
    }
    return false;
}

// ── Rotate (SRS) ──────────────────────────────────────
function rotate(piece, dir) { // dir: 1 = clockwise, -1 = CCW
    const states = PIECES[piece.key].shapes.length;
    const newShape = ((piece.shape + dir) + states) % states;
    const kicks = piece.key === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kickTable = dir === 1 ? kicks[piece.shape] : kicks[newShape].map(k => [-k[0], -k[1]]);
    const s = PIECES[piece.key].shapes[newShape];

    for (const [dx, dy] of kickTable) {
        if (!collides({ ...piece, shape: newShape }, dx, -dy, s)) {
            current = { ...piece, shape: newShape, x: piece.x + dx, y: piece.y - dy };
            resetLockDelay();
            return;
        }
    }
}

// ── Movement ──────────────────────────────────────────
function moveLeft() { if (!collides(current, -1, 0)) { current.x--; resetLockDelay(); } }
function moveRight() { if (!collides(current, 1, 0)) { current.x++; resetLockDelay(); } }
function softDrop() {
    if (!collides(current, 0, 1)) { current.y++; score += 1; updateHUD(); }
}
function hardDrop() {
    let dropped = 0;
    while (!collides(current, 0, 1)) { current.y++; dropped++; }
    score += dropped * 2;
    updateHUD();
    lockPiece();
}

// ── Ghost piece ───────────────────────────────────────
function ghostY() {
    let gy = current.y;
    while (!collides({ ...current, y: gy + 1 }, 0, 0)) gy++;
    return gy;
}

// ── Lock & clear ─────────────────────────────────────
function lockPiece() {
    clearLockTimer();
    const s = getShape(current);
    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (!s[r][c]) continue;
            const ny = current.y + r;
            if (ny < 0) { endGame(); return; }
            board[ny][current.x + c] = current.key;
        }
    }
    // Find full rows — start animation instead of removing immediately
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
        if (board[r].every(c => c)) fullRows.push(r);
    }
    if (fullRows.length > 0) {
        startClearAnimation(fullRows);
    } else {
        canHold = true;
        current = nextPiece();
        if (collides(current)) { endGame(); return; }
    }
}

function startClearAnimation(rows) {
    clearing = true;
    clearRows = rows;
    clearStartTime = performance.now();
    // Capture per-cell colours for particle bursts
    clearColors = rows.map(r =>
        board[r].map(key => key ? PIECES[key].color : '#ffffff')
    );
    if (rows.length >= 4) shakeFrames = 12; // Tetris!
    particles = [];
}

function finishClear() {
    // Spawn particles from cleared rows
    for (let ri = 0; ri < clearRows.length; ri++) {
        const r = clearRows[ri];
        for (let c = 0; c < COLS; c++) {
            const color = clearColors[ri][c];
            spawnCellParticles(c, r, color, clearRows.length);
        }
    }
    // Remove rows (highest first to avoid index shifting)
    const sorted = [...clearRows].sort((a, b) => b - a);
    for (const r of sorted) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
    }
    const count = clearRows.length;
    addScore(count);
    clearing = false;
    clearRows = [];
    canHold = true;
    current = nextPiece();
    if (collides(current)) { endGame(); return; }
}

function spawnCellParticles(cx, cy, color, multiplier) {
    const px = cx * CELL + CELL / 2;
    const py = cy * CELL + CELL / 2;
    const count = 4 + multiplier * 2;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1.5;
        particles.push({
            x: px, y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: Math.random() * 0.025 + 0.018,
            size: Math.random() * 5 + 2,
            color,
        });
    }
}

const LINE_SCORES = [0, 100, 300, 500, 800];
function addScore(cleared) {
    if (cleared > 0) {
        score += (LINE_SCORES[cleared] || 800) * level;
        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        updateHUD();
    }
}

// ── Hold ─────────────────────────────────────────────
function holdPiece() {
    if (!canHold) return;
    canHold = false;
    clearLockTimer();
    if (hold) {
        const tmp = hold;
        hold = { key: current.key, shape: 0, x: 0, y: 0 };
        current = createPiece(tmp.key);
    } else {
        hold = { key: current.key, shape: 0, x: 0, y: 0 };
        current = nextPiece();
    }
}

// ── Lock delay ────────────────────────────────────────
function resetLockDelay() {
    clearLockTimer();
    if (collides(current, 0, 1)) {
        lockTimer = setTimeout(() => lockPiece(), lockDelay);
    }
}
function clearLockTimer() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
}

// ── Drop speed ────────────────────────────────────────
function dropInterval() { return Math.max(50, 1000 - (level - 1) * 80); }

// ── Game Loop ─────────────────────────────────────────
function gameLoop(ts) {
    if (!gameActive || paused) return;

    if (clearing) {
        // During clear animation: only draw, no movement
        const elapsed = ts - clearStartTime;
        drawClearing(elapsed / CLEAR_DURATION);
        if (elapsed >= CLEAR_DURATION) finishClear();
        rafId = requestAnimationFrame(gameLoop);
        return;
    }

    const dt = ts - lastTime;
    lastTime = ts;
    dropAcc += dt;

    if (dropAcc >= dropInterval()) {
        dropAcc = 0;
        if (!collides(current, 0, 1)) {
            current.y++;
        } else if (!lockTimer) {
            lockTimer = setTimeout(() => lockPiece(), lockDelay);
        }
    }

    draw();
    rafId = requestAnimationFrame(gameLoop);
}

// ── Start ─────────────────────────────────────────────
function startGame() {
    hideAll();
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    nextBag = newBag();
    hold = null;
    score = 0;
    level = 1;
    lines = 0;
    canHold = true;
    gameActive = true;
    paused = false;
    dropAcc = 0;
    lastTime = 0;
    clearing = false;
    clearRows = [];
    particles = [];
    shakeFrames = 0;
    clearLockTimer();
    current = nextPiece();
    updateHUD();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(ts => { lastTime = ts; rafId = requestAnimationFrame(gameLoop); });
}

function endGame() {
    gameActive = false;
    clearLockTimer();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const isNew = score > highScore;
    if (isNew) { highScore = score; localStorage.setItem('tetrisHigh', highScore); highEl.textContent = highScore; }

    finalEl.textContent = `Điểm của bạn: ${score}`;
    recEl.classList.toggle('hidden', !isNew);
    overlayGameOver.classList.remove('hidden');
}

function togglePause() {
    if (!gameActive) return;
    paused = !paused;
    overlayPause.classList.toggle('hidden', !paused);
    if (!paused) {
        dropAcc = 0;
        lastTime = 0;
        rafId = requestAnimationFrame(ts => { lastTime = ts; rafId = requestAnimationFrame(gameLoop); });
    }
}

function hideAll() {
    overlayStart.classList.add('hidden');
    overlayPause.classList.add('hidden');
    overlayGameOver.classList.add('hidden');
}

function updateHUD() {
    scoreEl.textContent = score;
    highEl.textContent = Math.max(score, highScore);
    levelEl.textContent = level;
    linesEl.textContent = lines;
}

// ── Drawing ───────────────────────────────────────────
const BG = '#050510';
const GRID = 'rgba(255,255,255,0.04)';

function applyShake() {
    if (shakeFrames <= 0) return;
    const mag = shakeFrames * 1.2;
    ctx.translate(
        (Math.random() - 0.5) * mag,
        (Math.random() - 0.5) * mag
    );
    shakeFrames--;
}

function draw() {
    ctx.save();
    applyShake();

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

    drawGrid();

    // Ghost
    const gy = ghostY();
    if (gy !== current.y) drawPiece(ctx, current, gy, true);

    // Board
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) drawCell(ctx, c, r, PIECES[board[r][c]].color);
        }
    }

    // Current piece
    drawPiece(ctx, current, current.y, false);

    // Active particles (linger after clear finishes)
    drawParticles();

    ctx.restore();
    drawNextPreview();
    drawHoldPreview();
}

// ── Line-clear animation draw ─────────────────────────
function drawClearing(t) { // t = 0..1
    ctx.save();
    applyShake();

    ctx.fillStyle = BG;
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);
    drawGrid();

    const flashT = Math.min(1, t * 3);        // 0→1 in first 1/3
    const shrinkT = Math.max(0, (t - 0.3) / 0.7); // 0→1 in last 2/3

    for (let r = 0; r < ROWS; r++) {
        const isClearing = clearRows.includes(r);

        if (isClearing) {
            // Flash: interpolate colour → white
            const alpha = 1 - shrinkT;             // fade out
            const scaleH = 1 - shrinkT;            // row height shrinks
            const midY = r * CELL + CELL / 2;   // pivot = row centre

            ctx.save();
            ctx.translate(0, midY);
            ctx.scale(1, scaleH);
            ctx.translate(0, -midY);

            for (let c = 0; c < COLS; c++) {
                if (!board[r][c]) continue;
                // Mix cell colour with white based on flashT
                const baseColor = PIECES[board[r][c]].color;
                const mixedColor = mixWithWhite(baseColor, flashT);
                drawCellAt(ctx, c * CELL + 1, r * CELL + 1, CELL - 2, mixedColor, alpha);
            }
            // White scanline over full row during flash
            if (flashT > 0.1) {
                ctx.fillStyle = `rgba(255,255,255,${flashT * 0.55 * alpha})`;
                ctx.fillRect(0, r * CELL, canvas.width, CELL);
            }
            ctx.restore();
        } else {
            // Normal rows — draw as usual
            for (let c = 0; c < COLS; c++) {
                if (board[r][c]) drawCell(ctx, c, r, PIECES[board[r][c]].color);
            }
        }
    }

    // Ghost + current piece still visible during animation
    const gy = ghostY();
    if (gy !== current.y) drawPiece(ctx, current, gy, true);
    drawPiece(ctx, current, current.y, false);

    drawParticles();
    ctx.restore();
    drawNextPreview();
    drawHoldPreview();
}

function mixWithWhite(hex, t) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.round(r + (255 - r) * t);
    const ng = Math.round(g + (255 - g) * t);
    const nb = Math.round(b + (255 - b) * t);
    return `rgb(${nr},${ng},${nb})`;
}

function drawCellAt(c, x, y, s, color, alpha) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    roundRect(c, x, y, s, s, 4);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(c, x, y, s, 6, 2);
    c.fill();
    c.globalAlpha = 1;
}

// ── Particle system ───────────────────────────────────
function drawParticles() {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.93;
        p.vy *= 0.93;
        p.life -= p.decay;
        const alpha = Math.max(0, Math.round(p.life * 255)).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
        ctx.fillStyle = p.color + alpha;
        ctx.fill();
    }
}

function drawGrid() {
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, canvas.height); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(canvas.width, r * CELL); ctx.stroke();
    }
}

function drawPiece(c, piece, py, ghost) {
    const s = getShape(piece);
    const color = ghost ? 'rgba(255,255,255,0.1)' : PIECES[piece.key].color;
    for (let r = 0; r < s.length; r++) {
        for (let col = 0; col < s[r].length; col++) {
            if (!s[r][col]) continue;
            if (ghost) {
                drawGhostCell(c, piece.x + col, py + r);
            } else {
                drawCell(c, piece.x + col, py + r, color);
            }
        }
    }
}

function drawCell(c, cx, cy, color) {
    if (cy < 0) return;
    const x = cx * CELL + 1;
    const y = cy * CELL + 1;
    const s = CELL - 2;
    // Main fill
    c.fillStyle = color;
    roundRect(c, x, y, s, s, 4);
    c.fill();
    // Highlight
    c.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(c, x, y, s, 6, 2);
    c.fill();
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(c, x, y + s - 5, s, 5, 2);
    c.fill();
}

function drawGhostCell(c, cx, cy) {
    if (cy < 0) return;
    const x = cx * CELL + 1;
    const y = cy * CELL + 1;
    const s = CELL - 2;
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1.5;
    roundRect(c, x, y, s, s, 4);
    c.stroke();
}

// ── Preview panels ────────────────────────────────────
function drawPreview(c, cvs, key, label) {
    const W = cvs.width, H = cvs.height;
    c.fillStyle = '#050510';
    c.fillRect(0, 0, W, H);

    if (!key) return;
    const shape = PIECES[key].shapes[0];
    const color = PIECES[key].color;
    const rows = shape.length;
    const cols = shape[0].length;
    const cs = Math.min((W - 10) / cols, (H - 10) / rows);
    const ox = (W - cols * cs) / 2;
    const oy = (H - rows * cs) / 2;

    for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
            if (!shape[r][col]) continue;
            const x = ox + col * cs + 1;
            const y = oy + r * cs + 1;
            const s = cs - 2;
            c.fillStyle = color;
            roundRect(c, x, y, s, s, 3);
            c.fill();
            c.fillStyle = 'rgba(255,255,255,0.18)';
            roundRect(c, x, y, s, Math.min(5, s), 2);
            c.fill();
        }
    }
}

function drawNextPreview() {
    const nextKey = nextBag[0] || null;
    drawPreview(nCtx, nextCvs, nextKey);
}

function drawHoldPreview() {
    const hKey = hold ? hold.key : null;
    drawPreview(hCtx, holdCvs, hKey);
}

// ── Keyboard ──────────────────────────────────────────
let repeatTimer = null, repeatInterval = null;
const DAS = 150, ARR = 40;

function startRepeat(fn) {
    fn();
    clearRepeat();
    repeatTimer = setTimeout(() => {
        repeatInterval = setInterval(fn, ARR);
    }, DAS);
}
function clearRepeat() {
    clearTimeout(repeatTimer);
    clearInterval(repeatInterval);
    repeatTimer = repeatInterval = null;
}

document.addEventListener('keydown', e => {
    if (!gameActive && ['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) return;
    switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); startRepeat(moveLeft); break;
        case 'ArrowRight': e.preventDefault(); startRepeat(moveRight); break;
        case 'ArrowDown': e.preventDefault(); startRepeat(softDrop); break;
        case 'ArrowUp': case 'x': case 'X': e.preventDefault(); if (gameActive && !paused) rotate(current, 1); break;
        case 'z': case 'Z': e.preventDefault(); if (gameActive && !paused) rotate(current, -1); break;
        case ' ': e.preventDefault(); if (gameActive && !paused) hardDrop(); break;
        case 'c': case 'C': e.preventDefault(); if (gameActive && !paused) holdPiece(); break;
        case 'p': case 'P': togglePause(); break;
        case 'Enter':
            e.preventDefault();
            if (!gameActive) startGame(); else togglePause();
            break;
    }
});
document.addEventListener('keyup', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) clearRepeat();
});

// ── Mobile buttons ────────────────────────────────────
document.getElementById('btnRotateR').addEventListener('click', () => { if (gameActive && !paused) rotate(current, 1); });
document.getElementById('btnRotateL').addEventListener('click', () => { if (gameActive && !paused) rotate(current, -1); });
document.getElementById('btnHold').addEventListener('click', () => { if (gameActive && !paused) holdPiece(); });
document.getElementById('btnDrop').addEventListener('click', () => { if (gameActive && !paused) hardDrop(); });
document.getElementById('btnPause').addEventListener('click', () => togglePause());

// ══════════════════════════════════════════════════════
//  VIRTUAL JOYSTICK
// ══════════════════════════════════════════════════════
const joyBase = document.getElementById('joystickBase');
const joyKnob = document.getElementById('joystickKnob');
const JOY_R = 65;    // max knob travel (px)
const DEAD = 16;

let joyActive = false;
let joyOx = 0, joyOy = 0;
let joyPid = null;

// Auto-repeat for joystick hold
let joyRepT = null, joyRepI = null;
function joyStartRepeat(fn) {
    fn();
    clearJoyRepeat();
    joyRepT = setTimeout(() => { joyRepI = setInterval(fn, 80); }, 200);
}
function clearJoyRepeat() {
    clearTimeout(joyRepT); clearInterval(joyRepI);
    joyRepT = joyRepI = null;
}

let lastJoyDir = null;
function applyJoyDir(dx, dy) {
    if (!gameActive || paused) return;
    const dir = `${dx},${dy}`;
    if (dir !== lastJoyDir) {
        lastJoyDir = dir;
        clearJoyRepeat();
        if (dx === -1) joyStartRepeat(moveLeft);
        else if (dx === 1) joyStartRepeat(moveRight);
        else if (dy === 1) joyStartRepeat(softDrop);
        else if (dy === -1) { hardDrop(); } // up = hard drop
    }
}

function joyStart(e) {
    e.preventDefault();
    const t = e.changedTouches ? e.changedTouches[0] : e;
    joyPid = e.changedTouches ? t.identifier : 'mouse';
    joyActive = true;
    const rect = joyBase.getBoundingClientRect();
    joyOx = rect.left + rect.width / 2;
    joyOy = rect.top + rect.height / 2;
    joyKnob.classList.add('active');
    joyMove(e);
    if (!gameActive) startGame();
}

function joyMove(e) {
    if (!joyActive) return;
    e.preventDefault();
    let cx, cy;
    if (e.changedTouches) {
        let t = null;
        for (const touch of e.changedTouches) { if (touch.identifier === joyPid) { t = touch; break; } }
        if (!t) return;
        cx = t.clientX; cy = t.clientY;
    } else { cx = e.clientX; cy = e.clientY; }

    const dx = cx - joyOx, dy = cy - joyOy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, JOY_R * 0.65);
    const angle = Math.atan2(dy, dx);
    joyKnob.style.transform = `translate(calc(-50% + ${Math.cos(angle) * clamp}px), calc(-50% + ${Math.sin(angle) * clamp}px))`;

    if (dist < DEAD) { clearJoyRepeat(); lastJoyDir = null; return; }

    if (Math.abs(dx) >= Math.abs(dy)) {
        applyJoyDir(dx > 0 ? 1 : -1, 0);
    } else {
        applyJoyDir(0, dy > 0 ? 1 : -1);
    }
}

function joyEnd(e) {
    if (!joyActive) return;
    joyActive = false; joyPid = null; lastJoyDir = null;
    clearJoyRepeat();
    joyKnob.classList.remove('active');
    joyKnob.style.transform = 'translate(-50%, -50%)';
}

joyBase.addEventListener('touchstart', joyStart, { passive: false });
document.addEventListener('touchmove', joyMove, { passive: false });
document.addEventListener('touchend', joyEnd, { passive: false });
document.addEventListener('touchcancel', joyEnd, { passive: false });
joyBase.addEventListener('mousedown', joyStart);
document.addEventListener('mousemove', joyMove);
document.addEventListener('mouseup', joyEnd);

// ── Stars ─────────────────────────────────────────────
const starsEl = document.getElementById('stars');
for (let i = 0; i < 100; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.width = s.style.height = (Math.random() * 2 + 0.5) + 'px';
    s.style.animationDelay = Math.random() * 4 + 's';
    s.style.animationDuration = (Math.random() * 3 + 2) + 's';
    starsEl.appendChild(s);
}

// Mobile overlay hints
if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600) {
    document.getElementById('keyHint').classList.add('hidden');
    document.getElementById('touchHint').classList.remove('hidden');
}

// ── Helpers ───────────────────────────────────────────
function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
}

// Initial draw
ctx.fillStyle = BG;
ctx.fillRect(0, 0, canvas.width, canvas.height);
