const { v4: uuidv4 } = require('uuid');

const MONSTERS = {
  slime:    { name: '슬라임',    hp: 50,  atk: 8,  def: 2,  exp: 15, gold: 5,  lootTable: ['hp_potion'] },
  goblin:   { name: '고블린',    hp: 80,  atk: 15, def: 5,  exp: 25, gold: 10, lootTable: ['iron_sword', 'hp_potion'] },
  orc:      { name: '오크',      hp: 200, atk: 30, def: 15, exp: 60, gold: 25, lootTable: ['steel_armor', 'mp_potion'] },
  skeleton: { name: '해골 전사', hp: 120, atk: 20, def: 10, exp: 40, gold: 18, lootTable: ['bone_shield'] },
  dragon:   { name: '드래곤',    hp: 1000,atk: 80, def: 40, exp: 500,gold: 200,lootTable: ['dragon_scale', 'legendary_sword'] },
};

const ITEMS = {
  hp_potion:       { id: 'hp_potion', name: '체력 물약', type: 'consumable', effect: { hp: 50 } },
  mp_potion:       { id: 'mp_potion', name: '마나 물약', type: 'consumable', effect: { mp: 30 } },
  iron_sword:      { id: 'iron_sword', name: '철제 검', type: 'equipment', slot: 'weapon', statBonus: { atk: 10 } },
  steel_armor:     { id: 'steel_armor', name: '강철 갑옷', type: 'equipment', slot: 'armor', statBonus: { def: 15 } },
  bone_shield:     { id: 'bone_shield', name: '뼈 방패', type: 'equipment', slot: 'accessory', statBonus: { def: 8 } },
  dragon_scale:    { id: 'dragon_scale', name: '용의 비늘', type: 'equipment', slot: 'armor', statBonus: { def: 50, hp: 100 } },
  legendary_sword: { id: 'legendary_sword', name: '전설의 검', type: 'equipment', slot: 'weapon', statBonus: { atk: 80 } },
};

const DUNGEONS = {
  beginner_cave:  { name: '초보자의 동굴', minLevel: 1,  maxPlayers: 4, monsters: ['slime', 'goblin'], bossMonster: 'orc' },
  cursed_forest:  { name: '저주받은 숲',   minLevel: 5,  maxPlayers: 4, monsters: ['goblin', 'skeleton'], bossMonster: 'dragon' },
  dragon_lair:    { name: '드래곤의 소굴', minLevel: 20, maxPlayers: 6, monsters: ['orc', 'skeleton'], bossMonster: 'dragon' },
};

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();   // dungeonId -> room
    this.monsters = new Map(); // monsterId -> monster instance
    this.spawnTimers = new Map();
  }

  joinRoom(dungeonId, player, socket) {
    const config = DUNGEONS[dungeonId];
    if (!config) return null;

    if (!this.rooms.has(dungeonId)) {
      this.rooms.set(dungeonId, {
        id: dungeonId,
        config,
        players: new Map(),
        monsters: [],
        wave: 1,
        bossSpawned: false,
      });
      this.spawnMonsters(dungeonId);
    }

    const room = this.rooms.get(dungeonId);
    if (room.players.size >= config.maxPlayers) return null;

    room.players.set(socket.id, player);
    socket.join(dungeonId);
    return room;
  }

  leaveRoom(dungeonId, socketId) {
    const room = this.rooms.get(dungeonId);
    if (!room) return;
    room.players.delete(socketId);
    if (room.players.size === 0) {
      this.cleanupRoom(dungeonId);
    }
  }

  getRoomInfo(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room) return null;
    return {
      id: room.id,
      name: room.config.name,
      wave: room.wave,
      monsters: room.monsters.map(m => ({ id: m.id, name: m.name, hp: m.currentHp, maxHp: m.hp, position: m.position })),
      playerCount: room.players.size,
    };
  }

  spawnMonsters(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room) return;

    const config = room.config;
    const count = Math.min(3 + room.wave, 8);

    room.monsters = [];
    for (let i = 0; i < count; i++) {
      const monsterType = config.monsters[Math.floor(Math.random() * config.monsters.length)];
      const base = MONSTERS[monsterType];
      const monster = {
        ...base,
        id: uuidv4(),
        type: monsterType,
        currentHp: base.hp * room.wave,
        hp: base.hp * room.wave,
        atk: Math.floor(base.atk * (1 + (room.wave - 1) * 0.2)),
        position: { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) },
      };
      room.monsters.push(monster);
    }

    this.io.to(dungeonId).emit('dungeon:monstersSpawned', {
      monsters: room.monsters.map(m => ({ id: m.id, name: m.name, hp: m.currentHp, maxHp: m.hp, position: m.position })),
      wave: room.wave,
    });

    // 몬스터 AI: 주기적으로 가장 가까운 플레이어 공격
    const timer = setInterval(() => {
      this.monsterAI(dungeonId);
    }, 3000);
    this.spawnTimers.set(dungeonId, timer);
  }

  monsterAI(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room || room.players.size === 0) return;

    const alivePlayers = [...room.players.values()].filter(p => p.currentHp > 0);
    if (alivePlayers.length === 0) return;

    room.monsters.filter(m => m.currentHp > 0).forEach(monster => {
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const damage = Math.max(1, monster.atk - (target.stats?.def || 0) + Math.floor(Math.random() * 5 - 2));
      target.currentHp = Math.max(0, target.currentHp - damage);

      this.io.to(dungeonId).emit('combat:monsterAttack', {
        monsterId: monster.id,
        monsterName: monster.name,
        targetId: target.id,
        targetName: target.name,
        damage,
        targetCurrentHp: target.currentHp,
      });

      if (target.currentHp <= 0) {
        this.io.to(target.socketId).emit('player:died', { message: '전투에서 패배했습니다.' });
        target.currentHp = Math.floor(target.stats.hp * 0.3); // 부활
        setTimeout(() => {
          this.io.to(target.socketId).emit('player:revived', { currentHp: target.currentHp });
        }, 5000);
      }
    });
  }

  processAttack(attacker, targetId, skillId) {
    // 몬스터 대상
    let monster = null;
    let targetRoom = null;

    for (const [dungeonId, room] of this.rooms.entries()) {
      const found = room.monsters.find(m => m.id === targetId);
      if (found) { monster = found; targetRoom = { dungeonId, room }; break; }
    }

    if (!monster || monster.currentHp <= 0) return null;

    const skill = attacker.skills?.find(s => s.id === skillId);
    const multiplier = skill?.multiplier || 1.0;
    const hits = skill?.hits || 1;

    let totalDamage = 0;
    for (let i = 0; i < hits; i++) {
      const base = Math.floor((attacker.stats?.atk || 20) * multiplier);
      const variance = Math.floor(Math.random() * 10 - 5);
      const dmg = Math.max(1, base - (monster.def || 0) + variance);
      totalDamage += dmg;
    }

    monster.currentHp = Math.max(0, monster.currentHp - totalDamage);

    const result = {
      attackerId: attacker.id,
      targetId: monster.id,
      targetName: monster.name,
      damage: totalDamage,
      targetCurrentHp: monster.currentHp,
      targetMaxHp: monster.hp,
      targetDied: monster.currentHp <= 0,
      rewards: null,
    };

    if (result.targetDied) {
      result.rewards = this.generateRewards(monster);
      const { room, dungeonId } = targetRoom;
      room.monsters = room.monsters.filter(m => m.id !== monster.id);

      if (room.monsters.length === 0) {
        this.handleWaveClear(dungeonId, room);
      }
    }

    return result;
  }

  handleWaveClear(dungeonId, room) {
    clearInterval(this.spawnTimers.get(dungeonId));
    this.spawnTimers.delete(dungeonId);

    if (!room.bossSpawned && room.wave >= 3) {
      // 보스 소환
      const bossBase = MONSTERS[room.config.bossMonster];
      const boss = {
        ...bossBase,
        id: uuidv4(),
        type: room.config.bossMonster,
        isBoss: true,
        currentHp: bossBase.hp * 5,
        hp: bossBase.hp * 5,
        atk: bossBase.atk * 2,
        position: { x: 10, y: 10 },
      };
      room.monsters = [boss];
      room.bossSpawned = true;
      this.io.to(dungeonId).emit('dungeon:bossSpawned', { boss: { id: boss.id, name: boss.name, hp: boss.currentHp, maxHp: boss.hp } });
    } else {
      room.wave++;
      this.io.to(dungeonId).emit('dungeon:waveClear', { wave: room.wave - 1, nextWave: room.wave });
      setTimeout(() => this.spawnMonsters(dungeonId), 5000);
    }
  }

  generateRewards(monster) {
    const expMultiplier = 1 + Math.random() * 0.2;
    const rewards = {
      exp: Math.floor(monster.exp * expMultiplier),
      gold: monster.gold + Math.floor(Math.random() * 5),
      item: null,
    };

    if (Math.random() < 0.3 && monster.lootTable?.length > 0) {
      const itemKey = monster.lootTable[Math.floor(Math.random() * monster.lootTable.length)];
      rewards.item = { ...ITEMS[itemKey], id: uuidv4() };
    }

    return rewards;
  }

  cleanupRoom(dungeonId) {
    clearInterval(this.spawnTimers.get(dungeonId));
    this.spawnTimers.delete(dungeonId);
    this.rooms.delete(dungeonId);
    console.log(`[던전 해제] ${dungeonId}`);
  }
}

module.exports = GameManager;
