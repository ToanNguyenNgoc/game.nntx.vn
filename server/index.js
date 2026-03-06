const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log('✅ MongoDB connected:', process.env.MONGO_URL))
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.json({ limit: '50mb' }));

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
