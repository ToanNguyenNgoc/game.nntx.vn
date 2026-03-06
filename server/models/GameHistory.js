const mongoose = require('mongoose');

const moveSchema = new mongoose.Schema({
    symbol: String,
    playerName: String,
    row: Number,
    col: Number,
    timestamp: { type: Date, default: Date.now },
}, { _id: false });

const gameHistorySchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    players: [{
        name: String,
        symbol: String,
        _id: false,
    }],
    winner: { type: String, default: null },       // 'X' | 'O' | null (draw)
    winnerName: { type: String, default: null },
    isDraw: { type: Boolean, default: false },
    totalMoves: { type: Number, default: 0 },
    moves: [moveSchema],
    durationSeconds: Number,
    startedAt: Date,
    finishedAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('GameHistory', gameHistorySchema);
