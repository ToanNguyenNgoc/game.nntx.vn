/* ======================================================
   SNAKE GAME — Full implementation
   Mobile: virtual joystick + dynamic canvas sizing
   Desktop: keyboard (WASD / arrows)
   ====================================================== */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Dynamic canvas size for mobile ────────────────────
function calcCanvasSize() {
  const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
  if (isMobile) {
    // Available height = viewport - header(~70px) - joystick(~180px) - gaps(~30px)
    const isLandscape = window.innerWidth > window.innerHeight;
    const joyH = isLandscape ? 140 : 180;
    const headerH = isLandscape ? 50 : 72;
    const maxByHeight = window.innerHeight - headerH - joyH - 24;
    const maxByWidth = window.innerWidth - 20;
    const size = Math.max(200, Math.min(maxByHeight, maxByWidth, 480));
    return Math.floor(size / 25) * 25; // snap to grid multiple
  }
  return 500; // desktop
}

function applyCanvasSize() {
  const size = calcCanvasSize();
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
}

applyCanvasSize();
window.addEventListener('resize', applyCanvasSize);

const COLS = 25;
const ROWS = 25;
const CELL = canvas.width / COLS; // logical cell (always 500/25=20)

// DOM elements
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const finalEl = document.getElementById('finalScore');
const recordEl = document.getElementById('newRecord');

const overlayStart = document.getElementById('overlayStart');
const overlayPause = document.getElementById('overlayPause');
const overlayGameOver = document.getElementById('overlayGameOver');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('restartFromPause').addEventListener('click', startGame);
document.getElementById('joyPauseBtn').addEventListener('click', togglePause);

// ── Game State ─────────────────────────────────────────
let snake, dir, nextDir, food, score, level, speed;
let rafId = null;
let lastMoveTime = 0;
let paused = false;
let gameActive = false;
let highScore = parseInt(localStorage.getItem('snakeHighScore') || '0');
let particles = [];
let flashFrames = 0;

highEl.textContent = highScore;

const FOOD_TYPES = [
  { emoji: '🍎', points: 10, color: '#ff4444' },
  { emoji: '🍊', points: 15, color: '#ff8800' },
  { emoji: '🍇', points: 20, color: '#aa44ff' },
  { emoji: '⭐', points: 30, color: '#ffdd00' },
  { emoji: '💎', points: 50, color: '#00e5ff' },
];

const SNAKE_HEAD_COLOR = '#00ff88';
const SNAKE_BODY_START = '#00cc66';
const SNAKE_BODY_END = '#004422';
const GRID_COLOR = 'rgba(255,255,255,0.025)';
const BG_COLOR = '#050510';

// ── Start / Restart ────────────────────────────────────
function startGame() {
  hideAll();
  snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  level = 1;
  speed = 150;
  particles = [];
  flashFrames = 0;
  gameActive = true;
  paused = false;
  lastMoveTime = 0;

  spawnFood();
  updateHUD();

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(gameLoop);
}

function spawnFood() {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));

  const roll = Math.random();
  let type;
  if (roll < 0.40) type = FOOD_TYPES[0];
  else if (roll < 0.65) type = FOOD_TYPES[1];
  else if (roll < 0.82) type = FOOD_TYPES[2];
  else if (roll < 0.93) type = FOOD_TYPES[3];
  else type = FOOD_TYPES[4];

  food = { ...pos, ...type, scale: 0 };
}

// ── RAF Game Loop ──────────────────────────────────────
function gameLoop(timestamp) {
  if (!gameActive) return;

  if (!paused) {
    if (lastMoveTime === 0) lastMoveTime = timestamp;
    const elapsed = timestamp - lastMoveTime;

    if (elapsed >= speed) {
      lastMoveTime = timestamp;
      tick();
      if (!gameActive) return;
    }
    draw(timestamp);
  }

  rafId = requestAnimationFrame(gameLoop);
}

// ── Tick (logic) ───────────────────────────────────────
function tick() {
  dir = { ...nextDir };
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { endGame(); return; }
  if (snake.some(s => s.x === head.x && s.y === head.y)) { endGame(); return; }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += food.points * level;
    updateHUD();
    spawnParticles(food.x, food.y, food.color);
    flashFrames = 8;
    spawnFood();
    increaseLevel();
  } else {
    snake.pop();
  }
}

function increaseLevel() {
  const newLevel = Math.floor(score / 100) + 1;
  if (newLevel > level) {
    level = newLevel;
    speed = Math.max(60, 150 - (level - 1) * 12);
    levelEl.textContent = level;
  }
}

function updateHUD() {
  scoreEl.textContent = score;
  highEl.textContent = Math.max(score, highScore);
  levelEl.textContent = level;
}

// ── Draw ───────────────────────────────────────────────
function draw(timestamp) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  if (flashFrames > 0) {
    ctx.fillStyle = `rgba(0,255,136,${0.055 * flashFrames})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    flashFrames--;
  }

  food.scale = Math.min(1, food.scale + 0.08);
  drawFood(timestamp);

  updateParticles();
  drawSnake();
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, canvas.height); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(canvas.width, r * CELL); ctx.stroke();
  }
}

function drawSnake() {
  const r1 = hexToRgb(SNAKE_BODY_START);
  const r2 = hexToRgb(SNAKE_BODY_END);

  snake.forEach((seg, i) => {
    const ratio = i / (snake.length - 1 || 1);
    const r = lerp(r1.r, r2.r, ratio);
    const g = lerp(r1.g, r2.g, ratio);
    const b = lerp(r1.b, r2.b, ratio);
    const pad = i === 0 ? 1 : 2;
    const size = CELL - pad * 2;
    const radius = i === 0 ? 6 : 4;

    if (i === 0) {
      const grd = ctx.createRadialGradient(
        seg.x * CELL + CELL / 2, seg.y * CELL + CELL / 2, 0,
        seg.x * CELL + CELL / 2, seg.y * CELL + CELL / 2, CELL,
      );
      grd.addColorStop(0, 'rgba(0,255,136,0.45)');
      grd.addColorStop(1, 'rgba(0,255,136,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(seg.x * CELL - CELL / 2, seg.y * CELL - CELL / 2, CELL * 2, CELL * 2);
      ctx.fillStyle = SNAKE_HEAD_COLOR;
    } else {
      ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    }

    roundRect(ctx, seg.x * CELL + pad, seg.y * CELL + pad, size, size, radius);
    ctx.fill();

    if (i === 0) {
      ctx.fillStyle = '#050510';
      const ex = dir.x !== 0 ? CELL * 0.62 : CELL * 0.35;
      const ey = dir.y !== 0 ? CELL * 0.35 : CELL * 0.26;
      const eSize = 2.5;
      ctx.beginPath();
      ctx.arc(seg.x * CELL + ex, seg.y * CELL + ey, eSize, 0, Math.PI * 2);
      ctx.arc(seg.x * CELL + (CELL - ex), seg.y * CELL + (dir.y !== 0 ? CELL - ey : ey), eSize, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawFood(timestamp) {
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  const sc = Math.max(0.01, food.scale);
  const pulse = 1 + Math.sin(timestamp * 0.003) * 0.08;

  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL);
  grd.addColorStop(0, food.color + '55');
  grd.addColorStop(1, food.color + '00');
  ctx.fillStyle = grd;
  ctx.fillRect(cx - CELL, cy - CELL, CELL * 2, CELL * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc * pulse, sc * pulse);
  ctx.font = `${CELL * 0.75}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(food.emoji, 0, 0);
  ctx.restore();
}

// ── Particles ──────────────────────────────────────────
function spawnParticles(gx, gy, color) {
  const cx = gx * CELL + CELL / 2;
  const cy = gy * CELL + CELL / 2;
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 * i) / 16;
    const spd = Math.random() * 3 + 1;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      life: 1,
      decay: Math.random() * 0.025 + 0.02,
      size: Math.random() * 4 + 2,
      color,
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= p.decay;
    const alpha = Math.max(0, Math.round(p.life * 255)).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
    ctx.fillStyle = p.color + alpha;
    ctx.fill();
  }
}

// ── Game Over ──────────────────────────────────────────
function endGame() {
  gameActive = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const isNew = score > highScore;
  if (isNew) {
    highScore = score;
    localStorage.setItem('snakeHighScore', highScore);
    highEl.textContent = highScore;
  }

  finalEl.textContent = `Điểm của bạn: ${score}`;
  recordEl.classList.toggle('hidden', !isNew);
  drawDeathEffect();
  setTimeout(() => overlayGameOver.classList.remove('hidden'), 500);
}

function drawDeathEffect() {
  let f = 0;
  const id = setInterval(() => {
    ctx.fillStyle = `rgba(255,40,40,${0.3 - f * 0.03})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (++f > 10) clearInterval(id);
  }, 50);
}

// ── Pause ──────────────────────────────────────────────
function togglePause() {
  if (!gameActive) return;
  paused = !paused;
  overlayPause.classList.toggle('hidden', !paused);
  if (!paused) {
    lastMoveTime = 0;
    rafId = requestAnimationFrame(gameLoop);
  }
}

function hideAll() {
  overlayStart.classList.add('hidden');
  overlayPause.classList.add('hidden');
  overlayGameOver.classList.add('hidden');
}

// ── Keyboard Controls ──────────────────────────────────
function changeDir(dx, dy) {
  if (dx === -dir.x && dy === -dir.y) return;
  nextDir = { x: dx, y: dy };
  if (!gameActive) startGame();
}

document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': e.preventDefault(); changeDir(0, -1); break;
    case 'ArrowDown': case 's': case 'S': e.preventDefault(); changeDir(0, 1); break;
    case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); changeDir(-1, 0); break;
    case 'ArrowRight': case 'd': case 'D': e.preventDefault(); changeDir(1, 0); break;
    case 'p': case 'P': togglePause(); break;
    case ' ':
      e.preventDefault();
      if (!gameActive) startGame(); else togglePause();
      break;
  }
});

// ══════════════════════════════════════════════════════
//  VIRTUAL JOYSTICK
// ══════════════════════════════════════════════════════
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

const JOY_RADIUS = 75;   // half of base width (150/2)
const DEAD_ZONE = 18;   // min distance to register direction

let joyActive = false;
let joyOriginX = 0;
let joyOriginY = 0;
let joyPointerId = null;

function joyStart(e) {
  e.preventDefault();
  const touch = e.changedTouches ? e.changedTouches[0] : e;
  joyPointerId = e.changedTouches ? touch.identifier : 'mouse';
  joyActive = true;

  const rect = joystickBase.getBoundingClientRect();
  joyOriginX = rect.left + rect.width / 2;
  joyOriginY = rect.top + rect.height / 2;

  joystickKnob.classList.add('active');
  joyMove(e);

  if (!gameActive) startGame();
}

function joyMove(e) {
  if (!joyActive) return;
  e.preventDefault();

  let clientX, clientY;
  if (e.changedTouches) {
    // Find the right touch
    let touch = null;
    for (const t of e.changedTouches) {
      if (t.identifier === joyPointerId) { touch = t; break; }
    }
    if (!touch) return;
    clientX = touch.clientX;
    clientY = touch.clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  let dx = clientX - joyOriginX;
  let dy = clientY - joyOriginY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Clamp knob within base radius
  const clampedDist = Math.min(dist, JOY_RADIUS * 0.6);
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;

  joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

  // Only register direction past dead zone
  if (dist < DEAD_ZONE) return;

  // Determine dominant axis
  if (Math.abs(dx) >= Math.abs(dy)) {
    changeDir(dx > 0 ? 1 : -1, 0);
  } else {
    changeDir(0, dy > 0 ? 1 : -1);
  }
}

function joyEnd(e) {
  if (!joyActive) return;
  joyActive = false;
  joyPointerId = null;
  joystickKnob.classList.remove('active');
  // Snap knob back to centre
  joystickKnob.style.transform = 'translate(-50%, -50%)';
}

// Touch events
joystickBase.addEventListener('touchstart', joyStart, { passive: false });
document.addEventListener('touchmove', joyMove, { passive: false });
document.addEventListener('touchend', joyEnd, { passive: false });
document.addEventListener('touchcancel', joyEnd, { passive: false });

// Mouse fallback (useful for desktop testing of mobile layout)
joystickBase.addEventListener('mousedown', joyStart);
document.addEventListener('mousemove', joyMove);
document.addEventListener('mouseup', joyEnd);

// ── Canvas swipe (backup for non-joystick touch on canvas) ──
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', e => {
  // Only register swipe if joystick isn't active
  if (joyActive) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
    if (Math.abs(dx) > Math.abs(dy)) changeDir(dx > 0 ? 1 : -1, 0);
    else changeDir(0, dy > 0 ? 1 : -1);
  }
});

// ── Stars background ───────────────────────────────────
const starsEl = document.getElementById('stars');
for (let i = 0; i < 100; i++) {
  const s = document.createElement('div');
  s.className = 'star';
  s.style.left = Math.random() * 100 + '%';
  s.style.top = Math.random() * 100 + '%';
  s.style.width = s.style.height = (Math.random() * 2.5 + 0.5) + 'px';
  s.style.animationDelay = Math.random() * 4 + 's';
  s.style.animationDuration = (Math.random() * 3 + 2) + 's';
  starsEl.appendChild(s);
}

// ── Helpers ────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Initial frame
ctx.fillStyle = BG_COLOR;
ctx.fillRect(0, 0, canvas.width, canvas.height);
