const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

const app = express();
dotenv.config();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Arcade Hub Server is running 🎮' });
});

// Register socket services
const caroSocket = require('./services/caro.socket');
caroSocket(io);

const PORT = process.env.APP_PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 Arcade Hub Server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
