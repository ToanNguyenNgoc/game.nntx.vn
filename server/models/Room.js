const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    socketId: String,
    name: { type: String, required: true },
    symbol: { type: String, enum: ['X', 'O'], required: true },
}, { _id: false });

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true, index: true },
    creatorName: { type: String, required: true },
    isPrivate: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['waiting', 'playing', 'finished'],
        default: 'waiting',
        index: true,
    },
    players: [playerSchema],
    createdAt: { type: Date, default: Date.now, index: true },
    startedAt: Date,
    finishedAt: Date,
});

module.exports = mongoose.model('Room', roomSchema);
