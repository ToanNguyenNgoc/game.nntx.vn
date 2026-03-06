/**
 * Caro (Gomoku) Socket.io Service
 * Handles real-time multiplayer Caro game
 *
 * Events (client → server):
 *   create_room   → creates a new room, returns { roomId }
 *   join_room     → joins existing room, starts game if 2 players
 *   make_move     → place a piece { roomId, row, col }
 *   leave_room    → explicit leave
 *
 * Events (server → client):
 *   room_created  → { roomId, playerSymbol: 'X' }
 *   room_joined   → { roomId, playerSymbol: 'O' }
 *   room_error    → { message }
 *   game_start    → { board, currentTurn, players }
 *   move_made     → { board, row, col, symbol, currentTurn }
 *   game_over     → { winner, winCells, isDraw }
 *   player_disconnected → { message }
 *   waiting_opponent    → { message }
 */

const BOARD_SIZE = 20;
const WIN_COUNT = 5;

// In-memory room store
const rooms = new Map();

/**
 * Generate a short random room ID
 */
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return rooms.has(id) ? generateRoomId() : id;
}

/**
 * Create an empty 20x20 board
 */
function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

/**
 * Check for a winner starting from (row, col)
 * Returns { winner, winCells } or null
 */
function checkWin(board, row, col, symbol) {
    const directions = [
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal ↘
        [1, -1],  // diagonal ↙
    ];

    for (const [dr, dc] of directions) {
        const cells = [[row, col]];

        // Forward
        for (let i = 1; i < WIN_COUNT; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
            cells.push([r, c]);
        }

        // Backward
        for (let i = 1; i < WIN_COUNT; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== symbol) break;
            cells.push([r, c]);
        }

        if (cells.length >= WIN_COUNT) {
            return { winner: symbol, winCells: cells };
        }
    }

    return null;
}

/**
 * Check if the board is full (draw)
 */
function isBoardFull(board) {
    return board.every(row => row.every(cell => cell !== null));
}

module.exports = function caroSocket(io) {
    const nsp = io.of('/caro');

    nsp.on('connection', (socket) => {
        console.log(`[Caro] Player connected: ${socket.id}`);

        // ─────────────────────────────────────────────
        // CREATE ROOM
        // ─────────────────────────────────────────────
        socket.on('create_room', ({ playerName }) => {
            const roomId = generateRoomId();
            const room = {
                id: roomId,
                board: createBoard(),
                players: [
                    { id: socket.id, name: playerName || 'Player 1', symbol: 'X' }
                ],
                currentTurn: 'X',
                gameOver: false,
                moveCount: 0,
            };
            rooms.set(roomId, room);
            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.symbol = 'X';

            socket.emit('room_created', { roomId, playerSymbol: 'X', playerName: room.players[0].name });
            console.log(`[Caro] Room created: ${roomId} by ${socket.id}`);
        });

        // ─────────────────────────────────────────────
        // JOIN ROOM
        // ─────────────────────────────────────────────
        socket.on('join_room', ({ roomId, playerName }) => {
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

            room.players.push({ id: socket.id, name: playerName || 'Player 2', symbol: 'O' });
            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.symbol = 'O';

            // Notify joining player
            socket.emit('room_joined', { roomId, playerSymbol: 'O', playerName: playerName || 'Player 2' });

            // Start game for both
            const gameStartPayload = {
                board: room.board,
                currentTurn: room.currentTurn,
                players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
            };
            nsp.to(roomId).emit('game_start', gameStartPayload);
            console.log(`[Caro] Game started in room: ${roomId}`);
        });

        // ─────────────────────────────────────────────
        // MAKE MOVE
        // ─────────────────────────────────────────────
        socket.on('make_move', ({ roomId, row, col }) => {
            const room = rooms.get(roomId);
            if (!room) return;
            if (room.gameOver) return;
            if (room.board[row][col] !== null) {
                socket.emit('move_error', { message: 'Ô này đã được đánh rồi.' });
                return;
            }

            // Validate it's this player's turn
            const player = room.players.find(p => p.id === socket.id);
            if (!player || player.symbol !== room.currentTurn) {
                socket.emit('move_error', { message: 'Không phải lượt của bạn.' });
                return;
            }

            // Place the piece
            room.board[row][col] = player.symbol;
            room.moveCount++;

            // Check win
            const result = checkWin(room.board, row, col, player.symbol);
            if (result) {
                room.gameOver = true;
                nsp.to(roomId).emit('move_made', {
                    board: room.board,
                    row, col,
                    symbol: player.symbol,
                    currentTurn: null
                });
                nsp.to(roomId).emit('game_over', {
                    winner: player.symbol,
                    winnerName: player.name,
                    winCells: result.winCells,
                    isDraw: false
                });
                console.log(`[Caro] Game over in room ${roomId}. Winner: ${player.symbol}`);
                return;
            }

            // Check draw
            if (isBoardFull(room.board)) {
                room.gameOver = true;
                nsp.to(roomId).emit('move_made', {
                    board: room.board,
                    row, col,
                    symbol: player.symbol,
                    currentTurn: null
                });
                nsp.to(roomId).emit('game_over', { winner: null, winCells: [], isDraw: true });
                return;
            }

            // Switch turn
            room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';

            nsp.to(roomId).emit('move_made', {
                board: room.board,
                row, col,
                symbol: player.symbol,
                currentTurn: room.currentTurn
            });
        });

        // ─────────────────────────────────────────────
        // REMATCH REQUEST
        // ─────────────────────────────────────────────
        socket.on('request_rematch', ({ roomId }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            // Reset game state
            room.board = createBoard();
            room.currentTurn = 'X';
            room.gameOver = false;
            room.moveCount = 0;

            nsp.to(roomId).emit('game_start', {
                board: room.board,
                currentTurn: room.currentTurn,
                players: room.players.map(p => ({ name: p.name, symbol: p.symbol })),
            });
            console.log(`[Caro] Rematch in room: ${roomId}`);
        });

        // ─────────────────────────────────────────────
        // DISCONNECT
        // ─────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Caro] Player disconnected: ${socket.id}`);
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (!room) return;

            // Notify the other player
            socket.to(roomId).emit('player_disconnected', {
                message: 'Đối thủ đã rời phòng. Trận đấu kết thúc.'
            });

            // Clean up the room
            rooms.delete(roomId);
            console.log(`[Caro] Room ${roomId} deleted.`);
        });
    });
};
