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
const PlayerManager = require('./managers/PersistentPlayerManager');

const gameManager = new GameManager(io);
const playerManager = new PlayerManager(io, gameManager);

// REST API
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/leaderboard', async (req, res) => {
  try {
    res.json(await playerManager.getLeaderboard());
  } catch (error) {
    console.error('[Leaderboard error]', error);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// Socket.io 연결
io.on('connection', (socket) => {
  console.log(`[연결] 소켓 ID: ${socket.id}`);
  playerManager.handleConnection(socket);

  socket.on('disconnect', () => {
    console.log(`[해제] 소켓 ID: ${socket.id}`);
    Promise.resolve(playerManager.handleDisconnect(socket)).catch((error) => {
      console.error('[Disconnect error]', error);
    });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🗡️  RPG 게임 서버 실행 중 - 포트: ${PORT}`);
});
