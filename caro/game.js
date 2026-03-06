/**
 * Caro (Gomoku) Game Logic
 * Mode 1: vs AI (Easy / Medium / Hard)
 * Mode 2: Online (Socket.io)
 */

const BOARD_SIZE = 20;
const WIN_COUNT = 5;
// const SERVER_URL = 'http://localhost:3000'; // DEV
const SERVER_URL = 'https://server-game.nntx.vn'; // LIVE

/* ══════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════ */
const state = {
    mode: null,           // 'ai' | 'online'
    difficulty: null,     // 'easy' | 'medium' | 'hard'
    board: [],            // 2D array
    currentTurn: 'X',
    playerSymbol: 'X',    // human is X in AI mode; assigned by server in online mode
    gameOver: false,
    isMyTurn: false,
    aiThinking: false,
    roomId: null,
    playerName: 'Người chơi',
    opponentName: 'Đối thủ',
    socket: null,
    winCells: [],
    scores: { X: 0, O: 0 },
};

/* ══════════════════════════════════════════════
   CANVAS SETUP
   ══════════════════════════════════════════════ */
const canvas = document.getElementById('caro-canvas');
const ctx = canvas.getContext('2d');
let CELL_SIZE = 30;

function resizeCanvas() {
    const container = document.querySelector('.board-container');
    const maxW = container ? container.clientWidth - 20 : window.innerWidth - 40;
    const maxH = window.innerHeight - 220;
    const cellW = Math.floor(Math.min(maxW, maxH) / BOARD_SIZE);
    CELL_SIZE = Math.max(22, Math.min(36, cellW));
    canvas.width = BOARD_SIZE * CELL_SIZE;
    canvas.height = BOARD_SIZE * CELL_SIZE;
    drawBoard();
}

/* ══════════════════════════════════════════════
   DRAWING
   ══════════════════════════════════════════════ */
function drawBoard() {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(width, i * CELL_SIZE);
        ctx.stroke();
    }

    // Center dot
    const mid = Math.floor(BOARD_SIZE / 2);
    ctx.fillStyle = 'rgba(76,201,240,0.5)';
    ctx.beginPath();
    ctx.arc(mid * CELL_SIZE + CELL_SIZE / 2, mid * CELL_SIZE + CELL_SIZE / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Pieces
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (state.board[r][c]) {
                drawPiece(r, c, state.board[r][c], false);
            }
        }
    }

    // Highlight win cells
    if (state.winCells.length > 0) {
        state.winCells.forEach(([r, c]) => {
            drawPiece(r, c, state.board[r][c], true);
        });
    }
}

function drawPiece(row, col, symbol, highlight) {
    const x = col * CELL_SIZE + CELL_SIZE / 2;
    const y = row * CELL_SIZE + CELL_SIZE / 2;
    const r = CELL_SIZE * 0.36;

    const colorX = highlight ? '#ff6b8a' : '#ff4d6d';
    const colorO = highlight ? '#7ae3ff' : '#4cc9f0';
    const color = symbol === 'X' ? colorX : colorO;
    const glow = symbol === 'X' ? 'rgba(255,77,109,0.5)' : 'rgba(76,201,240,0.5)';

    // Glow
    if (highlight) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
    } else {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 8;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner letter
    ctx.fillStyle = highlight ? '#fff' : 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.max(10, CELL_SIZE * 0.42)}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x, y + 1);
}

function drawHover(row, col) {
    drawBoard();
    if (state.board[row][col] || state.gameOver) return;
    const x = col * CELL_SIZE + CELL_SIZE / 2;
    const y = row * CELL_SIZE + CELL_SIZE / 2;
    const symbol = state.playerSymbol;
    const color = symbol === 'X' ? 'rgba(255,77,109,0.35)' : 'rgba(76,201,240,0.35)';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, CELL_SIZE * 0.36, 0, Math.PI * 2);
    ctx.fill();
}

/* ══════════════════════════════════════════════
   WIN CHECK
   ══════════════════════════════════════════════ */
function checkWin(board, row, col, symbol) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        const cells = [[row, col]];
        for (let i = 1; i < WIN_COUNT; i++) {
            const r = row + dr * i, c = col + dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
            cells.push([r, c]);
        }
        for (let i = 1; i < WIN_COUNT; i++) {
            const r = row - dr * i, c = col - dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
            cells.push([r, c]);
        }
        if (cells.length >= WIN_COUNT) return cells;
    }
    return null;
}

function isBoardFull(board) {
    return board.every(r => r.every(c => c !== null));
}

/* ══════════════════════════════════════════════
   AI ENGINE
   ══════════════════════════════════════════════ */
const AI_SYMBOL = 'O';
const HUMAN_SYMBOL = 'X';

function getEmptyCells(board) {
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (!board[r][c]) cells.push([r, c]);
    return cells;
}

// Get candidate cells near existing pieces (for efficiency in medium/hard)
function getCandidateCells(board, radius = 2) {
    const used = new Set();
    const candidates = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!board[r][c]) continue;
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
                    if (board[nr][nc]) continue;
                    const key = `${nr},${nc}`;
                    if (!used.has(key)) { used.add(key); candidates.push([nr, nc]); }
                }
            }
        }
    }
    // fallback to center if board is empty
    if (candidates.length === 0) candidates.push([Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2)]);
    return candidates;
}

function scoreDirection(board, row, col, dr, dc, symbol) {
    let count = 0, openEnds = 0;
    // Forward
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
        count++; r += dr; c += dc;
    }
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c]) openEnds++;
    // Backward
    r = row - dr; c = col - dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
        count++; r -= dr; c -= dc;
    }
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c]) openEnds++;
    return { count, openEnds };
}

function evaluateCell(board, row, col, symbol) {
    let score = 0;
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    board[row][col] = symbol;
    for (const [dr, dc] of dirs) {
        const { count, openEnds } = scoreDirection(board, row, col, dr, dc, symbol);
        const total = count + 1;
        if (total >= 5) score += 1000000;
        else if (total === 4) score += openEnds === 2 ? 50000 : 10000;
        else if (total === 3) score += openEnds === 2 ? 5000 : 500;
        else if (total === 2) score += openEnds === 2 ? 100 : 10;
    }
    board[row][col] = null;
    return score;
}

function heuristicScore(board, row, col) {
    return evaluateCell(board, row, col, AI_SYMBOL) + evaluateCell(board, row, col, HUMAN_SYMBOL) * 0.9;
}

// ── Easy: random
function aiMoveEasy(board) {
    const empty = getEmptyCells(board);
    return empty[Math.floor(Math.random() * empty.length)];
}

// ── Medium: best single-step heuristic
function aiMoveMedium(board) {
    const candidates = getCandidateCells(board, 2);
    let best = -Infinity, move = candidates[0];
    for (const [r, c] of candidates) {
        // check immediate win
        board[r][c] = AI_SYMBOL;
        if (checkWin(board, r, c, AI_SYMBOL)) { board[r][c] = null; return [r, c]; }
        board[r][c] = null;
        // check block
        board[r][c] = HUMAN_SYMBOL;
        if (checkWin(board, r, c, HUMAN_SYMBOL)) { board[r][c] = null; return [r, c]; }
        board[r][c] = null;
        const s = heuristicScore(board, r, c);
        if (s > best) { best = s; move = [r, c]; }
    }
    return move;
}

// ── Hard: minimax with alpha-beta (depth 4)
function minimax(board, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
        const candidates = getCandidateCells(board, 1);
        let total = 0;
        for (const [r, c] of candidates) total += heuristicScore(board, r, c);
        return total;
    }

    const candidates = getCandidateCells(board, 2).slice(0, 12);
    if (candidates.length === 0) return 0;

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (const [r, c] of candidates) {
            board[r][c] = AI_SYMBOL;
            if (checkWin(board, r, c, AI_SYMBOL)) { board[r][c] = null; return 999999 + depth; }
            const s = minimax(board, depth - 1, alpha, beta, false);
            board[r][c] = null;
            maxScore = Math.max(maxScore, s);
            alpha = Math.max(alpha, s);
            if (beta <= alpha) break;
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (const [r, c] of candidates) {
            board[r][c] = HUMAN_SYMBOL;
            if (checkWin(board, r, c, HUMAN_SYMBOL)) { board[r][c] = null; return -999999 - depth; }
            const s = minimax(board, depth - 1, alpha, beta, true);
            board[r][c] = null;
            minScore = Math.min(minScore, s);
            beta = Math.min(beta, s);
            if (beta <= alpha) break;
        }
        return minScore;
    }
}

function aiMoveHard(board) {
    // Check immediate win first
    const candidates = getCandidateCells(board, 2).slice(0, 15);
    for (const [r, c] of candidates) {
        board[r][c] = AI_SYMBOL;
        if (checkWin(board, r, c, AI_SYMBOL)) { board[r][c] = null; return [r, c]; }
        board[r][c] = null;
    }
    // Check block immediate loss
    for (const [r, c] of candidates) {
        board[r][c] = HUMAN_SYMBOL;
        if (checkWin(board, r, c, HUMAN_SYMBOL)) { board[r][c] = null; return [r, c]; }
        board[r][c] = null;
    }

    let best = -Infinity, move = candidates[0];
    for (const [r, c] of candidates) {
        board[r][c] = AI_SYMBOL;
        const s = minimax(board, 3, -Infinity, Infinity, false);
        board[r][c] = null;
        if (s > best) { best = s; move = [r, c]; }
    }
    return move;
}

function getAIMove(board, difficulty) {
    if (difficulty === 'easy') return aiMoveEasy(board);
    if (difficulty === 'medium') return aiMoveMedium(board);
    return aiMoveHard(board);
}

/* ══════════════════════════════════════════════
   GAME LOGIC
   ══════════════════════════════════════════════ */
function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function placePiece(row, col, symbol) {
    state.board[row][col] = symbol;
    drawBoard();

    const winCells = checkWin(state.board, row, col, symbol);
    if (winCells) {
        state.gameOver = true;
        state.winCells = winCells;
        state.scores[symbol]++;
        drawBoard();
        setTimeout(() => showOverlay('win', symbol), 400);
        return;
    }
    if (isBoardFull(state.board)) {
        state.gameOver = true;
        setTimeout(() => showOverlay('draw', null), 400);
        return;
    }
}

function handleAITurn() {
    if (state.gameOver || state.currentTurn !== AI_SYMBOL) return;
    state.aiThinking = true;
    updateStatus();

    setTimeout(() => {
        if (state.gameOver) { state.aiThinking = false; return; }
        const [r, c] = getAIMove(state.board, state.difficulty);
        state.aiThinking = false;
        state.currentTurn = HUMAN_SYMBOL;
        state.isMyTurn = true;
        updateStatus();
        placePiece(r, c, AI_SYMBOL);
    }, state.difficulty === 'hard' ? 300 : 100);
}

/* ══════════════════════════════════════════════
   SOCKET.IO CLIENT
   ══════════════════════════════════════════════ */
function connectSocket() {
    if (state.socket && state.socket.connected) return state.socket;

    const socket = io(SERVER_URL + '/caro', { transports: ['websocket', 'polling'] });
    state.socket = socket;

    updateConnBadge('connecting');

    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        updateConnBadge('connected');
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Disconnected');
        updateConnBadge('disconnected');
    });

    socket.on('room_created', ({ roomId, playerSymbol }) => {
        state.roomId = roomId;
        state.playerSymbol = playerSymbol;
        document.getElementById('room-id-display').textContent = roomId;
        showScreen('waiting');
    });

    socket.on('room_joined', ({ roomId, playerSymbol }) => {
        state.roomId = roomId;
        state.playerSymbol = playerSymbol;
    });

    socket.on('room_error', ({ message }) => {
        showToast(message, 'error');
    });

    socket.on('game_start', ({ board, currentTurn, players }) => {
        state.board = board;
        state.currentTurn = currentTurn;
        state.gameOver = false;
        state.winCells = [];

        const me = players.find(p => p.symbol === state.playerSymbol);
        const opp = players.find(p => p.symbol !== state.playerSymbol);
        state.playerName = me ? me.name : 'Bạn';
        state.opponentName = opp ? opp.name : 'Đối thủ';

        state.isMyTurn = state.currentTurn === state.playerSymbol;
        showScreen('game');
        updatePlayerInfoUI();
        updateStatus();
        drawBoard();
    });

    socket.on('move_made', ({ board, row, col, symbol, currentTurn }) => {
        state.board = board;
        state.currentTurn = currentTurn;
        state.isMyTurn = currentTurn === state.playerSymbol;
        updateStatus();
        drawBoard();
    });

    socket.on('game_over', ({ winner, winnerName, winCells, isDraw }) => {
        state.gameOver = true;
        state.winCells = winCells || [];
        drawBoard();
        if (isDraw) {
            setTimeout(() => showOverlay('draw', null), 400);
        } else {
            state.scores[winner]++;
            setTimeout(() => showOverlay('win-online', winner, winnerName), 400);
        }
    });

    socket.on('player_disconnected', ({ message }) => {
        state.gameOver = true;
        showOverlay('disconnected', null, message);
    });

    return socket;
}

/* ══════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════ */
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    if (name === 'game') setTimeout(resizeCanvas, 50);
    if (name !== 'game') canvas.className = '';
}

function updateStatus() {
    const bar = document.getElementById('status-bar');
    if (!bar) return;
    if (state.gameOver) { bar.textContent = 'KẾT THÚC'; bar.className = 'status-bar'; return; }

    if (state.mode === 'ai') {
        if (state.aiThinking) {
            bar.textContent = 'AI ĐANG SUY NGHĨ...';
            bar.className = 'status-bar';
        } else if (state.isMyTurn) {
            bar.textContent = 'LƯỢT CỦA BẠN';
            bar.className = 'status-bar your-turn';
        } else {
            bar.textContent = 'LƯỢT CỦA AI';
            bar.className = 'status-bar';
        }
    } else {
        if (state.isMyTurn) {
            bar.textContent = 'LƯỢT CỦA BẠN';
            bar.className = 'status-bar your-turn';
        } else {
            bar.textContent = 'LƯỢT ĐỐI THỦ';
            bar.className = 'status-bar';
        }
    }

    // Update canvas cursor class
    if (state.gameOver) {
        canvas.className = 'game-over';
    } else if (!state.isMyTurn || state.aiThinking) {
        canvas.className = 'not-my-turn';
    } else {
        canvas.className = '';
    }

    // Highlight active player
    const px = document.getElementById('player-x');
    const po = document.getElementById('player-o');
    if (px && po) {
        if (state.currentTurn === 'X' && !state.gameOver) {
            px.classList.add('active-turn', 'x-player');
            po.classList.remove('active-turn');
        } else if (state.currentTurn === 'O' && !state.gameOver) {
            po.classList.add('active-turn');
            po.classList.remove('x-player');
            px.classList.remove('active-turn', 'x-player');
        } else {
            px.classList.remove('active-turn', 'x-player');
            po.classList.remove('active-turn');
        }
    }
}

function updatePlayerInfoUI() {
    const xName = document.getElementById('x-name');
    const oName = document.getElementById('o-name');
    const xTag = document.getElementById('x-tag');
    const oTag = document.getElementById('o-tag');
    if (!xName) return;
    if (state.mode === 'ai') {
        xName.textContent = state.playerName || 'Bạn';
        oName.textContent = `AI (${diffLabel(state.difficulty)})`;
        xTag.textContent = 'NGƯỜI CHƠI';
        oTag.textContent = 'MÁY TÍNH';
    } else {
        if (state.playerSymbol === 'X') {
            xName.textContent = state.playerName;
            oName.textContent = state.opponentName;
            xTag.textContent = 'BẠN';
            oTag.textContent = 'ĐỐI THỦ';
        } else {
            xName.textContent = state.opponentName;
            oName.textContent = state.playerName;
            xTag.textContent = 'ĐỐI THỦ';
            oTag.textContent = 'BẠN';
        }
    }
}

function diffLabel(d) {
    return d === 'easy' ? 'Dễ' : d === 'medium' ? 'TB' : 'Khó';
}

function showOverlay(type, symbol, extraMsg) {
    const overlay = document.getElementById('overlay');
    const icon = document.getElementById('overlay-icon');
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const btns = document.getElementById('overlay-btns');

    overlay.classList.add('active');
    btns.innerHTML = '';

    if (type === 'win') {
        const isHuman = symbol === HUMAN_SYMBOL;
        icon.textContent = isHuman ? '🏆' : '🤖';
        title.textContent = isHuman ? 'BẠN THẮNG!' : 'AI THẮNG!';
        title.className = `overlay-title ${isHuman ? 'win-x' : 'win-o'}`;
        sub.textContent = isHuman ? 'Xuất sắc! Bạn đã đánh bại máy!' : 'Hãy thử lại và chinh phục AI!';
        btns.innerHTML = `
      <button class="btn btn-primary" onclick="restartGame()">🔄 CHƠI LẠI</button>
      <button class="btn btn-ghost"   onclick="quitGame()">🏠 TRANG CHỦ</button>`;
    } else if (type === 'win-online') {
        const isWinner = symbol === state.playerSymbol;
        icon.textContent = isWinner ? '🏆' : '😞';
        title.textContent = isWinner ? 'BẠN THẮNG!' : (extraMsg || 'ĐỐI THỦ THẮNG!');
        title.className = `overlay-title ${symbol === 'X' ? 'win-x' : 'win-o'}`;
        sub.textContent = isWinner ? 'Xuất sắc! Bạn đã chiến thắng!' : 'Cố lên! Hãy thử lại!';
        btns.innerHTML = `
      <button class="btn btn-primary" onclick="requestRematch()">🔄 CHƠI TIẾP</button>
      <button class="btn btn-ghost"   onclick="quitGame()">🏠 TRANG CHỦ</button>`;
    } else if (type === 'draw') {
        icon.textContent = '🤝';
        title.textContent = 'HÒA!';
        title.className = 'overlay-title draw';
        sub.textContent = 'Thật khó quyết!';
        const rematchBtn = state.mode === 'online'
            ? `<button class="btn btn-primary" onclick="requestRematch()">🔄 CHƠI TIẾP</button>`
            : `<button class="btn btn-primary" onclick="restartGame()">🔄 CHƠI LẠI</button>`;
        btns.innerHTML = rematchBtn + `<button class="btn btn-ghost" onclick="quitGame()">🏠 TRANG CHỦ</button>`;
    } else if (type === 'disconnected') {
        icon.textContent = '🔌';
        title.textContent = 'MẤT KẾT NỐI';
        title.className = 'overlay-title draw';
        sub.textContent = extraMsg || 'Đối thủ đã ngắt kết nối.';
        btns.innerHTML = `<button class="btn btn-ghost" onclick="quitGame()">🏠 TRANG CHỦ</button>`;
    }
}

function hideOverlay() {
    document.getElementById('overlay').classList.remove('active');
}

function showToast(msg, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show' + (type === 'success' ? ' success' : '');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function updateConnBadge(status) {
    const badge = document.getElementById('conn-badge');
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (!badge) return;
    badge.classList.add('visible');
    dot.className = 'conn-dot ' + (status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : '');
    label.textContent = status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'ĐANG KẾT NỐI...' : 'OFFLINE';
}

/* ══════════════════════════════════════════════
   CANVAS EVENTS
   ══════════════════════════════════════════════ */
canvas.addEventListener('click', (e) => {
    if (state.gameOver) return;
    if (!state.isMyTurn) return;
    if (state.aiThinking) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const row = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
    if (state.board[row][col]) { showToast('Ô này đã được đánh rồi!'); return; }

    if (state.mode === 'ai') {
        state.isMyTurn = false;
        state.currentTurn = AI_SYMBOL;
        updateStatus();
        placePiece(row, col, HUMAN_SYMBOL);
        if (!state.gameOver) setTimeout(handleAITurn, 100);
    } else {
        // Online mode: emit to server
        state.socket.emit('make_move', { roomId: state.roomId, row, col });
        state.isMyTurn = false; // optimistic: wait for server confirmation
        updateStatus();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (state.gameOver || !state.isMyTurn || state.aiThinking) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const col = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const row = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) { drawBoard(); return; }
    drawHover(row, col);
});
canvas.addEventListener('mouseleave', () => drawBoard());

/* ══════════════════════════════════════════════
   GAME ACTIONS (called from HTML)
   ══════════════════════════════════════════════ */
function startAIMode() {
    showScreen('difficulty');
}

function startAIGame(difficulty) {
    state.mode = 'ai';
    state.difficulty = difficulty;
    state.board = createBoard();
    state.currentTurn = HUMAN_SYMBOL;
    state.playerSymbol = HUMAN_SYMBOL;
    state.isMyTurn = true;
    state.gameOver = false;
    state.winCells = [];
    state.aiThinking = false;
    state.playerName = document.getElementById('ai-player-name')?.value?.trim() || 'Bạn';

    showScreen('game');
    updatePlayerInfoUI();
    updateStatus();
}

function startOnlineMode() {
    showScreen('lobby');
    connectSocket();
}

function createRoom() {
    const name = document.getElementById('lobby-name')?.value?.trim() || 'Người chơi';
    state.playerName = name;
    state.socket.emit('create_room', { playerName: name });
}

function joinRoom() {
    const name = document.getElementById('lobby-name')?.value?.trim() || 'Người chơi';
    const roomId = document.getElementById('join-room-id')?.value?.trim().toUpperCase();
    if (!roomId) { showToast('Vui lòng nhập mã phòng!'); return; }
    state.playerName = name;
    state.socket.emit('join_room', { roomId, playerName: name });
}

function copyRoomId() {
    const id = state.roomId;
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.getElementById('copy-btn');
        if (btn) { btn.textContent = '✅ ĐÃ SAO CHÉP'; btn.classList.add('copied'); }
        showToast('Đã sao chép mã phòng!', 'success');
        setTimeout(() => { if (btn) { btn.textContent = '📋 SAO CHÉP'; btn.classList.remove('copied'); } }, 2000);
    });
}

function restartGame() {
    hideOverlay();
    if (state.mode === 'ai') {
        state.board = createBoard();
        state.currentTurn = HUMAN_SYMBOL;
        state.isMyTurn = true;
        state.gameOver = false;
        state.winCells = [];
        state.aiThinking = false;
        updateStatus();
        drawBoard();
    }
}

function requestRematch() {
    hideOverlay();
    if (state.socket && state.roomId) {
        state.socket.emit('request_rematch', { roomId: state.roomId });
    }
}

function quitGame() {
    hideOverlay();
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
        document.getElementById('conn-badge').classList.remove('visible');
    }
    state.board = [];
    state.gameOver = false;
    state.winCells = [];
    showScreen('mode');
}

function goBack() {
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
    }
    const active = document.querySelector('.screen.active')?.id;
    if (active === 'screen-difficulty' || active === 'screen-lobby') showScreen('mode');
    else if (active === 'screen-waiting') { showScreen('lobby'); }
    else if (active === 'screen-game') { showScreen('mode'); }
    else showScreen('mode');
}

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */
window.addEventListener('resize', () => {
    if (document.getElementById('screen-game').classList.contains('active')) resizeCanvas();
});

// Show mode selection on load
showScreen('mode');
