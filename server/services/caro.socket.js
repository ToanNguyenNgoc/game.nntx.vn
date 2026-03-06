/**
 * Caro (Gomoku) Socket.io Service
 * Handles real-time multiplayer Caro game with MongoDB persistence
 *
 * Events (client → server):
 *   create_room         → { playerName, customCode? }
 *   join_room           → { roomId, playerName }
 *   get_room_list       → (no payload) — returns waiting rooms
 *   make_move           → { roomId, row, col }
 *   request_rematch     → { roomId }
 *   leave_room          → explicit leave
 *
 * Events (server → client):
 *   room_created        → { roomId, playerSymbol }
 *   room_joined         → { roomId, playerSymbol }
 *   room_error          → { message }
 *   room_list           → [ { roomId, creatorName, createdAt } ]
 *   room_list_updated   → broadcast when room list changes
 *   game_start          → { board, currentTurn, players }
 *   move_made           → { board, row, col, symbol, currentTurn }
 *   game_over           → { winner, winCells, isDraw }
 *   player_disconnected → { message }
 */

const BOARD_SIZE = 20;
const WIN_COUNT = 5;

const Room = require('../models/Room');
const GameHistory = require('../models/GameHistory');

// In-memory game state (board, moves, timing) — DB stores meta only
const rooms = new Map();

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(id) ? generateRoomId() : id;
}

function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function checkWin(board, row, col, symbol) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of directions) {
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
        if (cells.length >= WIN_COUNT) return { winner: symbol, winCells: cells };
    }
    return null;
}

function isBoardFull(board) {
    return board.every(row => row.every(cell => cell !== null));
}

// ─── broadcast updated room list to all in namespace ──────────────────────────
async function broadcastRoomList(nsp) {
    try {
        const waitingRooms = await Room.find({ status: 'waiting' }).sort({ createdAt: -1 }).limit(50).lean();
        nsp.emit('room_list_updated', waitingRooms.map(r => ({
            roomId: r.roomId,
            creatorName: r.creatorName,
            isPrivate: r.isPrivate,
            createdAt: r.createdAt,
        })));
    } catch (e) {
        console.error('[Caro] broadcastRoomList error:', e.message);
    }
}

module.exports = function caroSocket(io) {
    const nsp = io.of('/caro');

    nsp.on('connection', (socket) => {
        console.log(`[Caro] Player connected: ${socket.id}`);

        // ─────────────────────────────────────────────────────
        // GET ROOM LIST
        // ─────────────────────────────────────────────────────
        socket.on('get_room_list', async () => {
            try {
                const waitingRooms = await Room.find({ status: 'waiting' }).sort({ createdAt: -1 }).limit(50).lean();
                socket.emit('room_list', waitingRooms.map(r => ({
                    roomId: r.roomId,
                    creatorName: r.creatorName,
                    isPrivate: r.isPrivate,
                    createdAt: r.createdAt,
                })));
            } catch (e) {
                console.error('[Caro] get_room_list error:', e.message);
            }
        });

        // ─────────────────────────────────────────────────────
        // CREATE ROOM
        // ─────────────────────────────────────────────────────
        socket.on('create_room', async ({ playerName, isPrivate }) => {
            try {
                const roomId = generateRoomId();
                const name = playerName || 'Player 1';

                const room = {
                    id: roomId,
                    board: createBoard(),
                    players: [{ id: socket.id, name, symbol: 'X' }],
                    currentTurn: 'X',
                    gameOver: false,
                    moveCount: 0,
                    moves: [],
                    startedAt: null,
                    createdAt: new Date(),
                };
                rooms.set(roomId, room);
                socket.join(roomId);
                socket.data.roomId = roomId;
                socket.data.symbol = 'X';

                // Persist to MongoDB
                await Room.create({
                    roomId,
                    creatorName: name,
                    isPrivate: !!isPrivate,
                    status: 'waiting',
                    players: [{ socketId: socket.id, name, symbol: 'X' }],
                });

                socket.emit('room_created', { roomId, playerSymbol: 'X', playerName: name, isPrivate: !!isPrivate });
                console.log(`[Caro] Room created: ${roomId} (${isPrivate ? 'private' : 'public'}) by ${socket.id}`);


                await broadcastRoomList(nsp);
            } catch (e) {
                console.error('[Caro] create_room error:', e.message);
                socket.emit('room_error', { message: 'Lỗi tạo phòng. Vui lòng thử lại.' });
            }
        });

        // ─────────────────────────────────────────────────────
        // JOIN ROOM
        // ─────────────────────────────────────────────────────
        socket.on('join_room', async ({ roomId, playerName }) => {
            const room = rooms.get(roomId);

            if (!room) {
                socket.emit('room_error', { message: `Phòng "${roomId}" không tồn tại.` });
                return;
            }
            if (room.players.length >= 2) {
                socket.emit('room_error', { message: `Phòng "${roomId}" đã đủ người.` });
                return;
            }
            if (room.gameOver) {
                socket.emit('room_error', { message: `Trận đấu trong phòng "${roomId}" đã kết thúc.` });
                return;
            }

            const name = playerName || 'Player 2';
            room.players.push({ id: socket.id, name, symbol: 'O' });
            room.startedAt = new Date();
            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.symbol = 'O';

            socket.emit('room_joined', { roomId, playerSymbol: 'O', playerName: name });

            // Update DB
            try {
                await Room.updateOne({ roomId }, {
                    $set: { status: 'playing', startedAt: room.startedAt },
                    $push: { players: { socketId: socket.id, name, symbol: 'O' } },
                });
            } catch (e) {
                console.error('[Caro] join_room DB error:', e.message);
            }

            // Start game for both
            nsp.to(roomId).emit('game_start', {
                board: room.board,
                currentTurn: room.currentTurn,
                players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
            });
            console.log(`[Caro] Game started in room: ${roomId}`);

            await broadcastRoomList(nsp);
        });

        // ─────────────────────────────────────────────────────
        // MAKE MOVE
        // ─────────────────────────────────────────────────────
        socket.on('make_move', async ({ roomId, row, col }) => {
            const room = rooms.get(roomId);
            if (!room || room.gameOver) return;
            if (room.board[row][col] !== null) {
                socket.emit('move_error', { message: 'Ô này đã được đánh rồi.' });
                return;
            }
            const player = room.players.find(p => p.id === socket.id);
            if (!player || player.symbol !== room.currentTurn) {
                socket.emit('move_error', { message: 'Không phải lượt của bạn.' });
                return;
            }

            room.board[row][col] = player.symbol;
            room.moveCount++;
            room.moves.push({ symbol: player.symbol, playerName: player.name, row, col });

            const result = checkWin(room.board, row, col, player.symbol);
            if (result) {
                room.gameOver = true;
                nsp.to(roomId).emit('move_made', { board: room.board, row, col, symbol: player.symbol, currentTurn: null });
                nsp.to(roomId).emit('game_over', { winner: player.symbol, winnerName: player.name, winCells: result.winCells, isDraw: false });
                console.log(`[Caro] Game over in room ${roomId}. Winner: ${player.symbol}`);
                await saveHistory(room, player.symbol, player.name, false);
                return;
            }

            if (isBoardFull(room.board)) {
                room.gameOver = true;
                nsp.to(roomId).emit('move_made', { board: room.board, row, col, symbol: player.symbol, currentTurn: null });
                nsp.to(roomId).emit('game_over', { winner: null, winCells: [], isDraw: true });
                await saveHistory(room, null, null, true);
                return;
            }

            room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
            nsp.to(roomId).emit('move_made', { board: room.board, row, col, symbol: player.symbol, currentTurn: room.currentTurn });
        });

        // ─────────────────────────────────────────────────────
        // REMATCH
        // ─────────────────────────────────────────────────────
        socket.on('request_rematch', ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            room.board = createBoard();
            room.currentTurn = 'X';
            room.gameOver = false;
            room.moveCount = 0;
            room.moves = [];
            room.startedAt = new Date();
            nsp.to(roomId).emit('game_start', {
                board: room.board,
                currentTurn: room.currentTurn,
                players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
            });
            console.log(`[Caro] Rematch in room: ${roomId}`);
        });

        // ─────────────────────────────────────────────────────
        // DISCONNECT
        // ─────────────────────────────────────────────────────
        socket.on('disconnect', async () => {
            console.log(`[Caro] Player disconnected: ${socket.id}`);
            const roomId = socket.data.roomId;
            const symbol = socket.data.symbol;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room) return;

            if (symbol === 'X') {
                // ── Creator left → kick everyone, close room ──
                socket.to(roomId).emit('host_left', { message: 'Chủ phòng đã rời. Trận đấu kết thúc.' });
                rooms.delete(roomId);
                try {
                    await Room.updateOne({ roomId }, { $set: { status: 'finished', finishedAt: new Date() } });
                    await broadcastRoomList(nsp);
                } catch (e) {
                    console.error('[Caro] disconnect(host) DB error:', e.message);
                }
                console.log(`[Caro] Room ${roomId} closed (host left).`);
            } else {
                // ── Joiner left → reset room, creator stays in waiting ──
                room.players = room.players.filter(p => p.id !== socket.id);
                room.board = createBoard();
                room.currentTurn = 'X';
                room.gameOver = false;
                room.moveCount = 0;
                room.moves = [];
                room.startedAt = null;

                socket.to(roomId).emit('opponent_left', {
                    message: 'Đối thủ đã rời phòng. Đang chờ người chơi mới...',
                    roomId,
                });

                try {
                    await Room.updateOne({ roomId }, {
                        $set: { status: 'waiting' },
                        $pull: { players: { socketId: socket.id } },
                    });
                    await broadcastRoomList(nsp);
                } catch (e) {
                    console.error('[Caro] disconnect(joiner) DB error:', e.message);
                }
                console.log(`[Caro] Room ${roomId} reset to waiting (joiner left).`);
            }
        });
    });

    // ─────────────────────────────────────────────────────
    // HELPER: Save game history
    // ─────────────────────────────────────────────────────
    async function saveHistory(room, winner, winnerName, isDraw) {
        try {
            const now = new Date();
            const duration = room.startedAt ? Math.round((now - room.startedAt) / 1000) : null;
            await GameHistory.create({
                roomId: room.id,
                players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
                winner,
                winnerName,
                isDraw,
                totalMoves: room.moveCount,
                moves: room.moves,
                durationSeconds: duration,
                startedAt: room.startedAt,
                finishedAt: now,
            });
            await Room.updateOne({ roomId: room.id }, { $set: { status: 'finished', finishedAt: now } });
            console.log(`[Caro] History saved for room ${room.id}`);
        } catch (e) {
            console.error('[Caro] saveHistory error:', e.message);
        }
    }
};
