const { v4: uuidv4 } = require('uuid');

const BASE_CLASSES = {
  warrior: { hp: 200, mp: 50, atk: 30, def: 25, spd: 10 },
  mage: { hp: 100, mp: 200, atk: 50, def: 10, spd: 15 },
  archer: { hp: 150, mp: 100, atk: 40, def: 15, spd: 25 },
  paladin: { hp: 180, mp: 80, atk: 25, def: 30, spd: 12 },
};

const NAME_MAX_LENGTH = 12;
const CHAT_MAX_LENGTH = 180;
const WORLD_BOUNDS = { min: 0, max: 100 };

function sanitizePlayerName(name) {
  const fallback = `Hero_${Math.floor(Math.random() * 9999)}`;
  const cleaned = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);

  return cleaned || fallback;
}

function sanitizeCoordinate(value) {
  if (!Number.isFinite(value)) {
    return WORLD_BOUNDS.min;
  }

  return Math.max(WORLD_BOUNDS.min, Math.min(WORLD_BOUNDS.max, Math.round(value)));
}

class PlayerManager {
  constructor(io, gameManager) {
    this.io = io;
    this.gameManager = gameManager;
    this.players = new Map();
  }

  handleConnection(socket) {
    socket.on('player:login', (data) => this.onLogin(socket, data));
    socket.on('player:move', (data) => this.onMove(socket, data));
    socket.on('player:attack', (data) => this.onAttack(socket, data));
    socket.on('player:useSkill', (data) => this.onUseSkill(socket, data));
    socket.on('player:equipItem', (data) => this.onEquipItem(socket, data));
    socket.on('chat:send', (data) => this.onChat(socket, data));
    socket.on('dungeon:enter', (data) => this.onEnterDungeon(socket, data));
    socket.on('dungeon:leave', () => this.onLeaveDungeon(socket));
  }

  handleDisconnect(socket) {
    const player = this.players.get(socket.id);
    if (!player) {
      return;
    }

    if (player.dungeonId) {
      this.gameManager.leaveRoom(player.dungeonId, socket.id);
    }

    this.players.delete(socket.id);
    this.io.emit('world:playerLeft', { playerId: player.id, name: player.name });
  }

  onLogin(socket, { name, characterClass }) {
    const safeClass = BASE_CLASSES[characterClass] ? characterClass : 'warrior';
    const baseStats = BASE_CLASSES[safeClass];
    const player = {
      id: uuidv4(),
      socketId: socket.id,
      name: sanitizePlayerName(name),
      characterClass: safeClass,
      level: 1,
      exp: 0,
      expToNext: 100,
      gold: 50,
      position: { x: 0, y: 0, map: 'town' },
      stats: { ...baseStats },
      currentHp: baseStats.hp,
      currentMp: baseStats.mp,
      skills: this.getDefaultSkills(safeClass),
      inventory: [],
      equipment: { weapon: null, armor: null, accessory: null },
      buffs: [],
      dungeonId: null,
      isDead: false,
    };

    this.players.set(socket.id, player);
    socket.emit('player:loginSuccess', this.getSafePlayer(player));
    this.io.emit('world:playerJoined', {
      playerId: player.id,
      name: player.name,
      characterClass: player.characterClass,
    });
    console.log(`[Login] ${player.name} (${player.characterClass})`);
  }

  onMove(socket, { x, y, map }) {
    const player = this.players.get(socket.id);
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
      return;
    }

    socket.broadcast.emit('player:moved', {
      playerId: player.id,
      x: player.position.x,
      y: player.position.y,
      map: player.position.map,
    });
  }

  onAttack(socket, { targetId }) {
    const attacker = this.players.get(socket.id);
    if (!attacker) {
      return;
    }

    if (!attacker.dungeonId) {
      socket.emit('error', { msg: 'You can only attack inside a dungeon.' });
      return;
    }

    if (attacker.isDead) {
      socket.emit('error', { msg: 'You cannot attack while defeated.' });
      return;
    }

    const result = this.gameManager.processAttack(attacker, targetId, 'basic');
    if (!result) {
      socket.emit('error', { msg: 'The attack target is invalid.' });
      return;
    }

    this.io.to(attacker.dungeonId).emit('combat:attackResult', result);

    if (result.targetDied && result.rewards) {
      this.applyRewards(attacker, result.rewards);
      socket.emit('player:rewardsGained', {
        ...result.rewards,
        player: this.getSafePlayer(attacker),
      });
    }
  }

  onUseSkill(socket, { skillId, targetId }) {
    const player = this.players.get(socket.id);
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

    if (player.currentMp < skill.mpCost) {
      socket.emit('error', { msg: 'Not enough MP.' });
      return;
    }

    player.currentMp -= skill.mpCost;
    const result = this.gameManager.processAttack(player, targetId, skillId);
    if (!result) {
      player.currentMp += skill.mpCost;
      socket.emit('error', { msg: 'The skill target is invalid.' });
      return;
    }

    this.io.to(player.dungeonId).emit('combat:skillResult', {
      caster: player.id,
      skillId,
      ...result,
    });
    socket.emit('player:mpUpdated', {
      currentMp: player.currentMp,
      player: this.getSafePlayer(player),
    });

    if (result.targetDied && result.rewards) {
      this.applyRewards(player, result.rewards);
      socket.emit('player:rewardsGained', {
        ...result.rewards,
        player: this.getSafePlayer(player),
      });
    }
  }

  onEquipItem(socket, { itemId }) {
    const player = this.players.get(socket.id);
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

    socket.emit('player:equipUpdated', {
      equipment: player.equipment,
      inventory: player.inventory,
      stats: player.stats,
      player: this.getSafePlayer(player),
    });
  }

  onChat(socket, { message }) {
    const player = this.players.get(socket.id);
    if (!player) {
      return;
    }

    const trimmed = String(message || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) {
      return;
    }

    const payload = {
      playerId: player.id,
      name: player.name,
      message: trimmed,
      ts: Date.now(),
    };

    if (player.dungeonId) {
      this.io.to(player.dungeonId).emit('chat:message', payload);
      return;
    }

    this.io.emit('chat:message', payload);
  }

  onEnterDungeon(socket, { dungeonId }) {
    const player = this.players.get(socket.id);
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
    socket.emit('dungeon:entered', {
      dungeonId,
      room: this.gameManager.getRoomInfo(dungeonId),
    });
    this.io.to(dungeonId).emit('dungeon:playerJoined', {
      playerId: player.id,
      name: player.name,
    });
  }

  onLeaveDungeon(socket) {
    const player = this.players.get(socket.id);
    if (!player || !player.dungeonId) {
      return;
    }

    const dungeonId = player.dungeonId;
    this.gameManager.leaveRoom(dungeonId, socket.id);
    socket.leave(dungeonId);
    player.dungeonId = null;
    player.isDead = false;
    player.position = { ...player.position, map: 'town', x: 0, y: 0 };
    socket.emit('dungeon:left', {});
    this.io.to(dungeonId).emit('dungeon:playerLeft', { playerId: player.id });
  }

  applyRewards(player, rewards) {
    player.gold += rewards.gold || 0;
    player.exp += rewards.exp || 0;
    if (rewards.item) {
      player.inventory.push(rewards.item);
    }
    this.checkLevelUp(player);
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
      console.log(`[Level Up] ${player.name} -> Lv.${player.level}`);
    }
  }

  recalcStats(player) {
    const base = BASE_CLASSES[player.characterClass] || BASE_CLASSES.warrior;
    player.stats = { ...base };

    Object.values(player.equipment)
      .filter(Boolean)
      .forEach((item) => {
        if (!item.statBonus) {
          return;
        }

        Object.entries(item.statBonus).forEach(([key, value]) => {
          player.stats[key] = (player.stats[key] || 0) + value;
        });
      });

    player.stats.hp += (player.level - 1) * 20;
    player.stats.atk += (player.level - 1) * 5;
    player.stats.def += (player.level - 1) * 3;

    player.currentHp = Math.min(player.currentHp, player.stats.hp);
    player.currentMp = Math.min(player.currentMp, player.stats.mp);
  }

  getDefaultSkills(characterClass) {
    const skills = {
      warrior: [
        { id: 'slash', name: 'Slash', mpCost: 10, multiplier: 1.5, type: 'physical' },
        { id: 'shield_bash', name: 'Shield Bash', mpCost: 15, multiplier: 1.2, type: 'physical', stun: true },
      ],
      mage: [
        { id: 'fireball', name: 'Fireball', mpCost: 20, multiplier: 2, type: 'magic' },
        { id: 'ice_lance', name: 'Ice Lance', mpCost: 25, multiplier: 1.8, type: 'magic', slow: true },
      ],
      archer: [
        { id: 'piercing_shot', name: 'Piercing Shot', mpCost: 15, multiplier: 1.7, type: 'physical' },
        { id: 'multi_shot', name: 'Multi Shot', mpCost: 20, multiplier: 1.2, hits: 3, type: 'physical' },
      ],
      paladin: [
        { id: 'holy_strike', name: 'Holy Strike', mpCost: 15, multiplier: 1.6, type: 'holy' },
        { id: 'divine_shield', name: 'Divine Shield', mpCost: 30, multiplier: 0, type: 'buff', buffType: 'shield' },
      ],
    };

    return skills[characterClass] || skills.warrior;
  }

  getSafePlayer(player) {
    const { socketId, ...safePlayer } = player;
    return safePlayer;
  }

  getLeaderboard() {
    return [...this.players.values()]
      .sort((left, right) => right.level - left.level || right.exp - left.exp)
      .slice(0, 10)
      .map((player) => ({
        name: player.name,
        level: player.level,
        characterClass: player.characterClass,
        gold: player.gold,
      }));
  }
}

module.exports = PlayerManager;
