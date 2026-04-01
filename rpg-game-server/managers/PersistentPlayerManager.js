const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { getRedisClient, isRedisReady } = require('../lib/redis');

const BASE_CLASSES = {
  warrior: { hp: 200, mp: 50, atk: 30, def: 25, spd: 10 },
  mage: { hp: 100, mp: 200, atk: 50, def: 10, spd: 15 },
  archer: { hp: 150, mp: 100, atk: 40, def: 15, spd: 25 },
  paladin: { hp: 180, mp: 80, atk: 25, def: 30, spd: 12 },
};

const NAME_MAX_LENGTH = 12;
const ACCOUNT_MIN_LENGTH = 3;
const ACCOUNT_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 4;
const CHAT_MAX_LENGTH = 180;
const WORLD_BOUNDS = { min: 0, max: 100 };
const SAVE_DEBOUNCE_MS = 300;
const PLAYER_CACHE_PREFIX = 'rpg:player:';
const ONLINE_PREFIX = 'rpg:online:';
const LEADERBOARD_CACHE_KEY = 'rpg:leaderboard';
const SESSION_PREFIX = 'rpg:session:';
const ACCESS_EXPIRES_IN = '1h';
const REFRESH_EXPIRES_IN = '14d';

function sanitizePlayerName(name) {
  const fallback = `Hero_${Math.floor(Math.random() * 9999)}`;
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return cleaned || fallback;
}

function sanitizeAccountName(accountName) {
  return String(accountName || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, ACCOUNT_MAX_LENGTH);
}

function sanitizeCoordinate(value) {
  if (!Number.isFinite(value)) {
    return WORLD_BOUNDS.min;
  }

  return Math.max(WORLD_BOUNDS.min, Math.min(WORLD_BOUNDS.max, Math.round(value)));
}

function safeJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (Array.isArray(fallback)) {
    return Array.isArray(value) ? value : fallback;
  }

  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : fallback;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64);
  const actual = Buffer.from(hash, 'hex');
  return actual.length === candidate.length && crypto.timingSafeEqual(actual, candidate);
}

class PersistentPlayerManager {
  constructor(io, gameManager) {
    this.io = io;
    this.gameManager = gameManager;
    this.players = new Map();
    this.accountSessions = new Map();
    this.persistTimers = new Map();
    this.redis = getRedisClient();
  }

  handleConnection(socket) {
    socket.on('account:register', this.wrapAsync(socket, this.onRegister));
    socket.on('account:login', this.wrapAsync(socket, this.onAccountLogin));
    socket.on('auth:refresh', this.wrapAsync(socket, this.onRefreshSession));
    socket.on('player:move', this.wrapAsync(socket, this.onMove));
    socket.on('player:attack', this.wrapAsync(socket, this.onAttack));
    socket.on('player:useSkill', this.wrapAsync(socket, this.onUseSkill));
    socket.on('player:equipItem', this.wrapAsync(socket, this.onEquipItem));
    socket.on('chat:send', this.wrapAsync(socket, this.onChat));
    socket.on('dungeon:enter', this.wrapAsync(socket, this.onEnterDungeon));
    socket.on('dungeon:leave', this.wrapAsync(socket, this.onLeaveDungeon));
  }

  wrapAsync(socket, handler) {
    return async (payload) => {
      try {
        await handler.call(this, socket, payload || {});
      } catch (error) {
        console.error(`[PersistentPlayerManager:${handler.name}]`, error);
        socket.emit('error', { msg: 'A server error occurred.' });
      }
    };
  }

  getPlayerBySocket(socket) {
    return this.players.get(socket.id) || null;
  }

  getDefaultSkills(characterClass) {
    const skills = {
      warrior: [
        { id: 'slash', name: 'Slash', mpCost: 10, multiplier: 1.5, cooldownMs: 2500, type: 'physical' },
        { id: 'shield_bash', name: 'Shield Bash', mpCost: 15, multiplier: 1.2, cooldownMs: 5000, type: 'physical', stun: true },
      ],
      mage: [
        { id: 'fireball', name: 'Fireball', mpCost: 20, multiplier: 2, cooldownMs: 3000, type: 'magic' },
        { id: 'ice_lance', name: 'Ice Lance', mpCost: 25, multiplier: 1.8, cooldownMs: 4500, type: 'magic', slow: true },
      ],
      archer: [
        { id: 'piercing_shot', name: 'Piercing Shot', mpCost: 15, multiplier: 1.7, cooldownMs: 3000, type: 'physical' },
        { id: 'multi_shot', name: 'Multi Shot', mpCost: 20, multiplier: 1.2, cooldownMs: 5000, hits: 3, type: 'physical' },
      ],
      paladin: [
        { id: 'holy_strike', name: 'Holy Strike', mpCost: 15, multiplier: 1.6, cooldownMs: 3000, type: 'holy' },
        { id: 'divine_shield', name: 'Divine Shield', mpCost: 30, multiplier: 0, cooldownMs: 8000, type: 'buff', buffType: 'shield' },
      ],
    };

    return skills[characterClass] || skills.warrior;
  }

  recalcStats(player) {
    const base = BASE_CLASSES[player.characterClass] || BASE_CLASSES.warrior;
    player.stats = { ...base };

    Object.values(player.equipment).filter(Boolean).forEach((item) => {
      Object.entries(item.statBonus || {}).forEach(([key, value]) => {
        player.stats[key] = (player.stats[key] || 0) + value;
      });
    });

    player.stats.hp += (player.level - 1) * 20;
    player.stats.atk += (player.level - 1) * 5;
    player.stats.def += (player.level - 1) * 3;
    player.currentHp = Math.min(Math.max(0, player.currentHp), player.stats.hp);
    player.currentMp = Math.min(Math.max(0, player.currentMp), player.stats.mp);
  }

  hydratePlayer(playerRecord, accountName, socketId) {
    const player = {
      id: playerRecord.id,
      accountId: playerRecord.accountId,
      accountName,
      socketId,
      online: true,
      name: playerRecord.name,
      characterClass: BASE_CLASSES[playerRecord.characterClass] ? playerRecord.characterClass : 'warrior',
      level: playerRecord.level,
      exp: playerRecord.exp,
      expToNext: playerRecord.expToNext,
      gold: playerRecord.gold,
      position: { x: playerRecord.positionX, y: playerRecord.positionY, map: playerRecord.positionMap },
      stats: {},
      currentHp: playerRecord.currentHp,
      currentMp: playerRecord.currentMp,
      skills: this.getDefaultSkills(playerRecord.characterClass),
      skillCooldowns: safeJson(playerRecord.skillCooldowns, {}),
      inventory: safeJson(playerRecord.inventory, []),
      equipment: safeJson(playerRecord.equipment, { weapon: null, armor: null, accessory: null }),
      buffs: safeJson(playerRecord.buffs, []),
      dungeonId: playerRecord.dungeonId,
      isDead: playerRecord.isDead,
    };

    this.recalcStats(player);
    return player;
  }

  getPersistenceData(player) {
    return {
      name: player.name,
      characterClass: player.characterClass,
      level: player.level,
      exp: player.exp,
      expToNext: player.expToNext,
      gold: player.gold,
      positionX: player.position.x,
      positionY: player.position.y,
      positionMap: player.position.map,
      currentHp: player.currentHp,
      currentMp: player.currentMp,
      dungeonId: player.dungeonId,
      isDead: player.isDead,
      inventory: player.inventory,
      equipment: player.equipment,
      buffs: player.buffs,
      skillCooldowns: player.skillCooldowns,
    };
  }

  async cachePlayer(player) {
    if (!isRedisReady()) {
      return;
    }

    await this.redis.set(`${PLAYER_CACHE_PREFIX}${player.accountName}`, JSON.stringify(this.getSafePlayer(player)), {
      EX: 3600,
    });
    await this.redis.set(`${ONLINE_PREFIX}${player.accountName}`, String(Date.now()), { EX: 120 });
    await this.redis.del(LEADERBOARD_CACHE_KEY);
  }

  async clearPlayerCache(accountName) {
    if (!isRedisReady()) {
      return;
    }

    await this.redis.del(`${ONLINE_PREFIX}${accountName}`);
  }

  attachPlayerToSocket(socket, player) {
    const previousSocketId = this.accountSessions.get(player.accountName);
    if (previousSocketId && previousSocketId !== socket.id) {
      this.players.delete(previousSocketId);
      const previousSocket = this.io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.disconnect(true);
      }
    }

    player.socketId = socket.id;
    player.online = true;
    this.players.set(socket.id, player);
    this.accountSessions.set(player.accountName, socket.id);
  }

  emitLoginSuccess(socket, player, meta = {}) {
    socket.emit('player:loginSuccess', { ...this.getSafePlayer(player), ...meta });
    this.io.emit('world:playerJoined', {
      playerId: player.id,
      name: player.name,
      characterClass: player.characterClass,
    });
  }

  resetPlayerToTown(player) {
    player.dungeonId = null;
    player.isDead = false;
    player.position = { ...player.position, map: 'town', x: 0, y: 0 };
  }

  createTokens(player) {
    const accessToken = jwt.sign(
      { sub: player.accountId, accountName: player.accountName, type: 'access' },
      process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
      { expiresIn: ACCESS_EXPIRES_IN }
    );

    const sessionId = crypto.randomUUID();
    const refreshToken = jwt.sign(
      { sub: player.accountId, accountName: player.accountName, sid: sessionId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      { expiresIn: REFRESH_EXPIRES_IN }
    );

    return { accessToken, refreshToken, sessionId };
  }

  async storeRefreshSession(player, sessionId) {
    if (!isRedisReady()) {
      return;
    }

    await this.redis.set(
      `${SESSION_PREFIX}${player.accountId}`,
      JSON.stringify({ sessionId, accountName: player.accountName }),
      { EX: 60 * 60 * 24 * 14 }
    );
  }

  async issueSession(socket, player, meta = {}) {
    const { accessToken, refreshToken, sessionId } = this.createTokens(player);
    await this.storeRefreshSession(player, sessionId);
    await this.cachePlayer(player);
    this.emitLoginSuccess(socket, player, { ...meta, accessToken, refreshToken });
  }

  async persistNow(player) {
    await prisma.player.update({
      where: { id: player.id },
      data: this.getPersistenceData(player),
    });
    await this.cachePlayer(player);
  }

  persistPlayer(player, { immediate = false } = {}) {
    const existingTimer = this.persistTimers.get(player.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.persistTimers.delete(player.id);
    }

    if (immediate) {
      return this.persistNow(player);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.persistTimers.delete(player.id);
        try {
          await this.persistNow(player);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, SAVE_DEBOUNCE_MS);

      this.persistTimers.set(player.id, timer);
    });
  }

  async loadAccountPlayer(accountName) {
    const account = await prisma.account.findUnique({
      where: { accountName },
      include: { player: true },
    });

    if (!account || !account.player) {
      return null;
    }

    return {
      account,
      player: this.hydratePlayer(account.player, account.accountName, null),
    };
  }

  async handleDisconnect(socket) {
    const player = this.players.get(socket.id);
    if (!player) {
      return;
    }

    if (player.dungeonId) {
      this.gameManager.leaveRoom(player.dungeonId, socket.id);
      this.resetPlayerToTown(player);
    }

    player.socketId = null;
    player.online = false;
    this.players.delete(socket.id);

    if (this.accountSessions.get(player.accountName) === socket.id) {
      this.accountSessions.delete(player.accountName);
    }

    this.io.emit('world:playerLeft', { playerId: player.id, name: player.name });
    await this.clearPlayerCache(player.accountName);
    await this.persistPlayer(player, { immediate: true });
  }

  async onRegister(socket, { accountName, password, name, characterClass }) {
    const safeAccountName = sanitizeAccountName(accountName);
    if (safeAccountName.length < ACCOUNT_MIN_LENGTH) {
      socket.emit('error', { msg: `Account ID must be ${ACCOUNT_MIN_LENGTH}-${ACCOUNT_MAX_LENGTH} characters.` });
      return;
    }

    if (String(password || '').length < PASSWORD_MIN_LENGTH) {
      socket.emit('error', { msg: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
      return;
    }

    const existing = await prisma.account.findUnique({ where: { accountName: safeAccountName } });
    if (existing) {
      socket.emit('error', { msg: 'That account ID is already in use.' });
      return;
    }

    const safeClass = BASE_CLASSES[characterClass] ? characterClass : 'warrior';
    const baseStats = BASE_CLASSES[safeClass];
    const account = await prisma.account.create({
      data: {
        accountName: safeAccountName,
        passwordHash: hashPassword(String(password)),
        lastLoginAt: new Date(),
        player: {
          create: {
            name: sanitizePlayerName(name),
            characterClass: safeClass,
            currentHp: baseStats.hp,
            currentMp: baseStats.mp,
            inventory: [],
            equipment: { weapon: null, armor: null, accessory: null },
            buffs: [],
            skillCooldowns: {},
          },
        },
      },
      include: { player: true },
    });

    const player = this.hydratePlayer(account.player, account.accountName, socket.id);
    this.attachPlayerToSocket(socket, player);
    await this.issueSession(socket, player, { created: true, restored: false });
  }

  async onAccountLogin(socket, { accountName, password }) {
    const safeAccountName = sanitizeAccountName(accountName);
    const loaded = await this.loadAccountPlayer(safeAccountName);

    if (!loaded || !verifyPassword(String(password || ''), loaded.account.passwordHash)) {
      socket.emit('error', { msg: 'Invalid account ID or password.' });
      return;
    }

    const player = loaded.player;
    if (player.dungeonId) {
      this.resetPlayerToTown(player);
      await this.persistPlayer(player, { immediate: true });
    }

    await prisma.account.update({
      where: { id: loaded.account.id },
      data: { lastLoginAt: new Date() },
    });

    this.attachPlayerToSocket(socket, player);
    await this.issueSession(socket, player, { created: false, restored: true });
  }

  async onRefreshSession(socket, { refreshToken }) {
    try {
      const payload = jwt.verify(
        String(refreshToken || ''),
        process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret'
      );

      if (payload.type !== 'refresh') {
        throw new Error('invalid token type');
      }

      if (!isRedisReady()) {
        throw new Error('redis unavailable');
      }

      const rawSession = await this.redis.get(`${SESSION_PREFIX}${payload.sub}`);
      if (!rawSession) {
        socket.emit('auth:sessionExpired', { msg: 'Session expired. Please log in again.' });
        return;
      }

      const session = JSON.parse(rawSession);
      if (session.sessionId !== payload.sid) {
        socket.emit('auth:sessionExpired', { msg: 'Session expired. Please log in again.' });
        return;
      }

      const loaded = await this.loadAccountPlayer(session.accountName);
      if (!loaded) {
        socket.emit('auth:sessionExpired', { msg: 'Session expired. Please log in again.' });
        return;
      }

      const player = loaded.player;
      if (player.dungeonId) {
        this.resetPlayerToTown(player);
        await this.persistPlayer(player, { immediate: true });
      }

      await prisma.account.update({
        where: { id: loaded.account.id },
        data: { lastLoginAt: new Date() },
      });

      this.attachPlayerToSocket(socket, player);
      await this.issueSession(socket, player, { created: false, restored: true });
    } catch (error) {
      socket.emit('auth:sessionExpired', { msg: 'Session expired. Please log in again.' });
    }
  }

  async onMove(socket, { x, y, map }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    player.position = {
      x: sanitizeCoordinate(x),
      y: sanitizeCoordinate(y),
      map: typeof map === 'string' && map.trim() ? map.trim() : player.position.map,
    };

    if (player.dungeonId) {
      this.io.to(player.dungeonId).emit('player:moved', {
        playerId: player.id,
        x: player.position.x,
        y: player.position.y,
        map: player.position.map,
      });
    } else {
      socket.broadcast.emit('player:moved', {
        playerId: player.id,
        x: player.position.x,
        y: player.position.y,
        map: player.position.map,
      });
    }

    await this.persistPlayer(player);
  }

  async onAttack(socket, { targetId }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    if (!player.dungeonId) {
      socket.emit('error', { msg: 'You can only attack inside a dungeon.' });
      return;
    }

    if (player.isDead) {
      socket.emit('error', { msg: 'You cannot attack while defeated.' });
      return;
    }

    const result = this.gameManager.processAttack(player, targetId, 'basic');
    if (!result) {
      socket.emit('error', { msg: 'The attack target is invalid.' });
      return;
    }

    this.io.to(player.dungeonId).emit('combat:attackResult', result);

    if (result.targetDied && result.rewards) {
      await this.applyRewards(player, result.rewards);
      socket.emit('player:rewardsGained', { ...result.rewards, player: this.getSafePlayer(player) });
    } else {
      await this.persistPlayer(player);
    }
  }

  async onUseSkill(socket, { skillId, targetId }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    if (!player.dungeonId) {
      socket.emit('error', { msg: 'You can only use skills inside a dungeon.' });
      return;
    }

    if (player.isDead) {
      socket.emit('error', { msg: 'You cannot use skills while defeated.' });
      return;
    }

    const skill = player.skills.find((entry) => entry.id === skillId);
    if (!skill) {
      socket.emit('error', { msg: 'Skill not found.' });
      return;
    }

    const now = Date.now();
    const nextAvailableAt = player.skillCooldowns?.[skillId] || 0;
    if (nextAvailableAt > now) {
      socket.emit('error', { msg: `${skill.name} is on cooldown for ${Math.ceil((nextAvailableAt - now) / 1000)}s.` });
      return;
    }

    if (player.currentMp < skill.mpCost) {
      socket.emit('error', { msg: 'Not enough MP.' });
      return;
    }

    player.currentMp -= skill.mpCost;
    player.skillCooldowns = {
      ...player.skillCooldowns,
      [skillId]: now + (skill.cooldownMs || 0),
    };

    const result = this.gameManager.processAttack(player, targetId, skillId);
    if (!result) {
      player.currentMp += skill.mpCost;
      player.skillCooldowns = {
        ...player.skillCooldowns,
        [skillId]: nextAvailableAt,
      };
      socket.emit('error', { msg: 'The skill target is invalid.' });
      return;
    }

    this.io.to(player.dungeonId).emit('combat:skillResult', {
      caster: player.id,
      skillId,
      cooldownMs: skill.cooldownMs || 0,
      ...result,
    });
    socket.emit('player:mpUpdated', {
      currentMp: player.currentMp,
      player: this.getSafePlayer(player),
    });

    if (result.targetDied && result.rewards) {
      await this.applyRewards(player, result.rewards);
      socket.emit('player:rewardsGained', { ...result.rewards, player: this.getSafePlayer(player) });
    } else {
      await this.persistPlayer(player);
    }
  }

  async onEquipItem(socket, { itemId }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    const item = player.inventory.find((entry) => entry.id === itemId);
    if (!item) {
      socket.emit('error', { msg: 'Item not found.' });
      return;
    }

    if (item.type !== 'equipment' || !item.slot) {
      socket.emit('error', { msg: 'That item cannot be equipped.' });
      return;
    }

    const currentItem = player.equipment[item.slot];
    if (currentItem) {
      player.inventory.push(currentItem);
    }

    player.equipment[item.slot] = item;
    player.inventory = player.inventory.filter((entry) => entry.id !== itemId);
    this.recalcStats(player);
    await this.persistPlayer(player);

    socket.emit('player:equipUpdated', {
      equipment: player.equipment,
      inventory: player.inventory,
      stats: player.stats,
      player: this.getSafePlayer(player),
    });
  }

  async onChat(socket, { message }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    const trimmed = String(message || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) {
      return;
    }

    const payload = { playerId: player.id, name: player.name, message: trimmed, ts: Date.now() };
    if (player.dungeonId) {
      this.io.to(player.dungeonId).emit('chat:message', payload);
      return;
    }

    this.io.emit('chat:message', payload);
  }

  async onEnterDungeon(socket, { dungeonId }) {
    const player = this.getPlayerBySocket(socket);
    if (!player) {
      return;
    }

    if (player.dungeonId) {
      socket.emit('error', { msg: 'Leave your current dungeon first.' });
      return;
    }

    const joinResult = this.gameManager.joinRoom(dungeonId, player, socket);
    if (!joinResult?.ok) {
      const messages = {
        NOT_FOUND: 'Dungeon not found.',
        LEVEL_TOO_LOW: `You need to be at least level ${joinResult?.minLevel}.`,
        ROOM_FULL: 'The dungeon room is full.',
      };
      socket.emit('error', { msg: messages[joinResult?.code] || 'Failed to enter dungeon.' });
      return;
    }

    player.dungeonId = dungeonId;
    await this.persistPlayer(player);
    socket.emit('dungeon:entered', { dungeonId, room: this.gameManager.getRoomInfo(dungeonId) });
    this.io.to(dungeonId).emit('dungeon:playerJoined', { playerId: player.id, name: player.name });
  }

  async onLeaveDungeon(socket) {
    const player = this.getPlayerBySocket(socket);
    if (!player || !player.dungeonId) {
      return;
    }

    const dungeonId = player.dungeonId;
    this.gameManager.leaveRoom(dungeonId, socket.id);
    socket.leave(dungeonId);
    this.resetPlayerToTown(player);
    await this.persistPlayer(player);
    socket.emit('dungeon:left', {});
    this.io.to(dungeonId).emit('dungeon:playerLeft', { playerId: player.id });
  }

  async applyRewards(player, rewards) {
    player.gold += rewards.gold || 0;
    player.exp += rewards.exp || 0;
    if (rewards.item) {
      player.inventory.push(rewards.item);
    }
    this.checkLevelUp(player);
    await this.persistPlayer(player);
  }

  checkLevelUp(player) {
    while (player.exp >= player.expToNext) {
      player.exp -= player.expToNext;
      player.level += 1;
      player.expToNext = Math.floor(player.expToNext * 1.5);
      this.recalcStats(player);
      player.currentHp = player.stats.hp;
      player.currentMp = player.stats.mp;
      this.io.to(player.socketId).emit('player:levelUp', {
        level: player.level,
        stats: player.stats,
        player: this.getSafePlayer(player),
      });
    }
  }

  getSafePlayer(player) {
    const { socketId, online, accountId, ...safePlayer } = player;
    return safePlayer;
  }

  async getLeaderboard() {
    if (isRedisReady()) {
      const cached = await this.redis.get(LEADERBOARD_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const leaderboard = (await prisma.player.findMany({
      orderBy: [{ level: 'desc' }, { exp: 'desc' }],
      take: 10,
    })).map((player) => ({
      name: player.name,
      level: player.level,
      characterClass: player.characterClass,
      gold: player.gold,
    }));

    if (isRedisReady()) {
      await this.redis.set(LEADERBOARD_CACHE_KEY, JSON.stringify(leaderboard), { EX: 60 });
    }

    return leaderboard;
  }
}

module.exports = PersistentPlayerManager;
