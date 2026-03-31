const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const GameManager = require('./managers/GameManager');
const PlayerManager = require('./managers/PlayerManager');

const gameManager = new GameManager(io);
const playerManager = new PlayerManager(io, gameManager);

// REST API
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/leaderboard', (req, res) => res.json(playerManager.getLeaderboard()));

// Socket.io 연결
io.on('connection', (socket) => {
  console.log(`[연결] 소켓 ID: ${socket.id}`);
  playerManager.handleConnection(socket);

  socket.on('disconnect', () => {
    console.log(`[해제] 소켓 ID: ${socket.id}`);
    playerManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🗡️  RPG 게임 서버 실행 중 - 포트: ${PORT}`);
});
