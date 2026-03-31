const { v4: uuidv4 } = require('uuid');

class PlayerManager {
  constructor(io, gameManager) {
    this.io = io;
    this.gameManager = gameManager;
    this.players = new Map(); // socketId -> player
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
    if (player) {
      if (player.dungeonId) {
        this.gameManager.leaveRoom(player.dungeonId, socket.id);
      }
      this.players.delete(socket.id);
      this.io.emit('world:playerLeft', { playerId: player.id, name: player.name });
    }
  }

  onLogin(socket, { name, characterClass }) {
    const classes = {
      warrior:  { hp: 200, mp: 50,  atk: 30, def: 25, spd: 10 },
      mage:     { hp: 100, mp: 200, atk: 50, def: 10, spd: 15 },
      archer:   { hp: 150, mp: 100, atk: 40, def: 15, spd: 25 },
      paladin:  { hp: 180, mp: 80,  atk: 25, def: 30, spd: 12 },
    };

    const base = classes[characterClass] || classes.warrior;
    const player = {
      id: uuidv4(),
      socketId: socket.id,
      name: name || `모험가_${Math.floor(Math.random() * 9999)}`,
      characterClass: characterClass || 'warrior',
      level: 1,
      exp: 0,
      expToNext: 100,
      gold: 50,
      position: { x: 0, y: 0, map: 'town' },
      stats: { ...base },
      currentHp: base.hp,
      currentMp: base.mp,
      skills: this.getDefaultSkills(characterClass),
      inventory: [],
      equipment: { weapon: null, armor: null, accessory: null },
      buffs: [],
      dungeonId: null,
    };

    this.players.set(socket.id, player);
    socket.emit('player:loginSuccess', player);
    this.io.emit('world:playerJoined', { playerId: player.id, name: player.name, characterClass: player.characterClass });
    console.log(`[로그인] ${player.name} (${player.characterClass})`);
  }

  onMove(socket, { x, y, map }) {
    const player = this.players.get(socket.id);
    if (!player) return;
    player.position = { x, y, map: map || player.position.map };

    if (player.dungeonId) {
      this.io.to(player.dungeonId).emit('player:moved', {
        playerId: player.id, x, y, map: player.position.map
      });
    } else {
      socket.broadcast.emit('player:moved', {
        playerId: player.id, x, y, map: player.position.map
      });
    }
  }

  onAttack(socket, { targetId }) {
    const attacker = this.players.get(socket.id);
    if (!attacker) return;

    const result = this.gameManager.processAttack(attacker, targetId, 'basic');
    if (result) {
      const room = attacker.dungeonId ? this.io.to(attacker.dungeonId) : this.io;
      room.emit('combat:attackResult', result);

      if (result.targetDied && result.rewards) {
        this.applyRewards(attacker, result.rewards);
        socket.emit('player:rewardsGained', { ...result.rewards, player: this.getSafePlayer(attacker) });
      }
    }
  }

  onUseSkill(socket, { skillId, targetId }) {
    const player = this.players.get(socket.id);
    if (!player) return;

    const skill = player.skills.find(s => s.id === skillId);
    if (!skill) return socket.emit('error', { msg: '스킬을 찾을 수 없습니다.' });
    if (player.currentMp < skill.mpCost) return socket.emit('error', { msg: 'MP가 부족합니다.' });

    player.currentMp -= skill.mpCost;
    const result = this.gameManager.processAttack(player, targetId, skillId);
    if (result) {
      const room = player.dungeonId ? this.io.to(player.dungeonId) : this.io;
      room.emit('combat:skillResult', { caster: player.id, skillId, ...result });
      socket.emit('player:mpUpdated', { currentMp: player.currentMp });

      if (result.targetDied && result.rewards) {
        this.applyRewards(player, result.rewards);
        socket.emit('player:rewardsGained', { ...result.rewards, player: this.getSafePlayer(player) });
      }
    }
  }

  onEquipItem(socket, { itemId }) {
    const player = this.players.get(socket.id);
    if (!player) return;
    const item = player.inventory.find(i => i.id === itemId);
    if (!item) return socket.emit('error', { msg: '아이템을 찾을 수 없습니다.' });

    player.equipment[item.slot] = item;
    player.inventory = player.inventory.filter(i => i.id !== itemId);
    this.recalcStats(player);
    socket.emit('player:equipUpdated', { equipment: player.equipment, stats: player.stats });
  }

  onChat(socket, { message }) {
    const player = this.players.get(socket.id);
    if (!player) return;

    const payload = { playerId: player.id, name: player.name, message, ts: Date.now() };
    if (player.dungeonId) {
      this.io.to(player.dungeonId).emit('chat:message', payload);
    } else {
      this.io.emit('chat:message', payload);
    }
  }

  onEnterDungeon(socket, { dungeonId }) {
    const player = this.players.get(socket.id);
    if (!player) return;

    const room = this.gameManager.joinRoom(dungeonId, player, socket);
    if (room) {
      player.dungeonId = dungeonId;
      socket.emit('dungeon:entered', { dungeonId, room: this.gameManager.getRoomInfo(dungeonId) });
      this.io.to(dungeonId).emit('dungeon:playerJoined', { playerId: player.id, name: player.name });
    } else {
      socket.emit('error', { msg: '던전 입장 실패' });
    }
  }

  onLeaveDungeon(socket) {
    const player = this.players.get(socket.id);
    if (!player || !player.dungeonId) return;

    const dungeonId = player.dungeonId;
    this.gameManager.leaveRoom(dungeonId, socket.id);
    socket.leave(dungeonId);
    player.dungeonId = null;
    socket.emit('dungeon:left', {});
    this.io.to(dungeonId).emit('dungeon:playerLeft', { playerId: player.id });
  }

  applyRewards(player, rewards) {
    player.gold += rewards.gold || 0;
    player.exp += rewards.exp || 0;
    if (rewards.item) player.inventory.push(rewards.item);
    this.checkLevelUp(player);
  }

  checkLevelUp(player) {
    while (player.exp >= player.expToNext) {
      player.exp -= player.expToNext;
      player.level += 1;
      player.expToNext = Math.floor(player.expToNext * 1.5);
      player.stats.hp += 20; player.stats.atk += 5; player.stats.def += 3;
      player.currentHp = player.stats.hp;
      player.currentMp = player.stats.mp;
      this.io.to(player.socketId).emit('player:levelUp', { level: player.level, stats: player.stats });
      console.log(`[레벨업] ${player.name} → Lv.${player.level}`);
    }
  }

  recalcStats(player) {
    const base = { warrior: { hp:200, mp:50, atk:30, def:25, spd:10 }, mage: { hp:100, mp:200, atk:50, def:10, spd:15 }, archer: { hp:150, mp:100, atk:40, def:15, spd:25 }, paladin: { hp:180, mp:80, atk:25, def:30, spd:12 } };
    const b = base[player.characterClass] || base.warrior;
    player.stats = { ...b };
    Object.values(player.equipment).filter(Boolean).forEach(item => {
      if (item.statBonus) Object.entries(item.statBonus).forEach(([k, v]) => { player.stats[k] = (player.stats[k] || 0) + v; });
    });
    player.stats.hp += (player.level - 1) * 20;
    player.stats.atk += (player.level - 1) * 5;
    player.stats.def += (player.level - 1) * 3;
  }

  getDefaultSkills(characterClass) {
    const skills = {
      warrior: [
        { id: 'slash', name: '강베기', mpCost: 10, multiplier: 1.5, type: 'physical' },
        { id: 'shield_bash', name: '방패 강타', mpCost: 15, multiplier: 1.2, type: 'physical', stun: true },
      ],
      mage: [
        { id: 'fireball', name: '파이어볼', mpCost: 20, multiplier: 2.0, type: 'magic' },
        { id: 'ice_lance', name: '얼음 창', mpCost: 25, multiplier: 1.8, type: 'magic', slow: true },
      ],
      archer: [
        { id: 'piercing_shot', name: '관통 화살', mpCost: 15, multiplier: 1.7, type: 'physical' },
        { id: 'multi_shot', name: '연속 사격', mpCost: 20, multiplier: 1.2, hits: 3, type: 'physical' },
      ],
      paladin: [
        { id: 'holy_strike', name: '성스러운 타격', mpCost: 15, multiplier: 1.6, type: 'holy' },
        { id: 'divine_shield', name: '신성 방어막', mpCost: 30, multiplier: 0, type: 'buff', buffType: 'shield' },
      ],
    };
    return skills[characterClass] || skills.warrior;
  }

  getSafePlayer(player) {
    const { socketId, ...safe } = player;
    return safe;
  }

  getLeaderboard() {
    return [...this.players.values()]
      .sort((a, b) => b.level - a.level || b.exp - a.exp)
      .slice(0, 10)
      .map(p => ({ name: p.name, level: p.level, characterClass: p.characterClass, gold: p.gold }));
  }
}

module.exports = PlayerManager;
