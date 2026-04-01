const { v4: uuidv4 } = require('uuid');

const MONSTERS = {
  slime: { name: '슬라임', hp: 50, atk: 8, def: 2, exp: 15, gold: 5, lootTable: ['hp_potion'] },
  goblin: { name: '고블린', hp: 80, atk: 15, def: 5, exp: 25, gold: 10, lootTable: ['iron_sword', 'hp_potion'] },
  orc: { name: '오크', hp: 200, atk: 30, def: 15, exp: 60, gold: 25, lootTable: ['steel_armor', 'mp_potion'] },
  skeleton: { name: '스켈레톤', hp: 120, atk: 20, def: 10, exp: 40, gold: 18, lootTable: ['bone_shield'] },
  dragon: { name: '드래곤', hp: 1000, atk: 80, def: 40, exp: 500, gold: 200, lootTable: ['dragon_scale', 'legendary_sword'] },
};

const ITEMS = {
  hp_potion: { id: 'hp_potion', name: '체력 물약', type: 'consumable', effect: { hp: 50 } },
  mp_potion: { id: 'mp_potion', name: '마나 물약', type: 'consumable', effect: { mp: 30 } },
  iron_sword: { id: 'iron_sword', name: '철검', type: 'equipment', slot: 'weapon', statBonus: { atk: 10 } },
  steel_armor: { id: 'steel_armor', name: '강철 갑옷', type: 'equipment', slot: 'armor', statBonus: { def: 15 } },
  bone_shield: { id: 'bone_shield', name: '뼈 방패', type: 'equipment', slot: 'accessory', statBonus: { def: 8 } },
  dragon_scale: { id: 'dragon_scale', name: '드래곤 비늘갑옷', type: 'equipment', slot: 'armor', statBonus: { def: 50, hp: 100 } },
  legendary_sword: { id: 'legendary_sword', name: '전설의 검', type: 'equipment', slot: 'weapon', statBonus: { atk: 80 } },
};

const DUNGEONS = {
  beginner_cave: { name: '초심자 동굴', minLevel: 1, maxPlayers: 4, monsters: ['slime', 'goblin'], bossMonster: 'orc' },
  cursed_forest: { name: '저주받은 숲', minLevel: 5, maxPlayers: 4, monsters: ['goblin', 'skeleton'], bossMonster: 'dragon' },
  dragon_lair: { name: '용의 둥지', minLevel: 20, maxPlayers: 6, monsters: ['orc', 'skeleton'], bossMonster: 'dragon' },
};

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.spawnTimers = new Map();
    this.reviveTimers = new Map();
  }

  getDungeonConfig(dungeonId) {
    return DUNGEONS[dungeonId] || null;
  }

  joinRoom(dungeonId, player, socket) {
    // Rooms are created lazily so idle dungeons do not keep timers or monster state alive.
    const config = this.getDungeonConfig(dungeonId);
    if (!config) {
      return { ok: false, code: 'NOT_FOUND' };
    }

    if (player.level < config.minLevel) {
      return { ok: false, code: 'LEVEL_TOO_LOW', minLevel: config.minLevel };
    }

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
    if (room.players.size >= config.maxPlayers) {
      return { ok: false, code: 'ROOM_FULL' };
    }

    room.players.set(socket.id, player);
    socket.join(dungeonId);

    return { ok: true, room };
  }

  leaveRoom(dungeonId, socketId) {
    const room = this.rooms.get(dungeonId);
    if (!room) {
      return;
    }

    const player = room.players.get(socketId);
    if (player) {
      this.clearReviveTimer(player.socketId);
    }

    room.players.delete(socketId);
    if (room.players.size === 0) {
      this.cleanupRoom(dungeonId);
    }
  }

  getRoomInfo(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room) {
      return null;
    }

    return {
      id: room.id,
      name: room.config.name,
      wave: room.wave,
      monsters: room.monsters.map((monster) => ({
        id: monster.id,
        name: monster.name,
        hp: monster.currentHp,
        maxHp: monster.hp,
        position: monster.position,
        isBoss: Boolean(monster.isBoss),
      })),
      playerCount: room.players.size,
      minLevel: room.config.minLevel,
    };
  }

  spawnMonsters(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room) {
      return;
    }

    // Every wave rebuilds the room monster list and restarts the room AI timer.
    this.clearSpawnTimer(dungeonId);

    const count = Math.min(3 + room.wave, 8);
    room.monsters = [];

    for (let index = 0; index < count; index += 1) {
      const monsterType = room.config.monsters[Math.floor(Math.random() * room.config.monsters.length)];
      const base = MONSTERS[monsterType];
      const monster = {
        ...base,
        id: uuidv4(),
        type: monsterType,
        currentHp: base.hp * room.wave,
        hp: base.hp * room.wave,
        atk: Math.floor(base.atk * (1 + (room.wave - 1) * 0.2)),
        position: {
          x: Math.floor(Math.random() * 20),
          y: Math.floor(Math.random() * 20),
        },
      };

      room.monsters.push(monster);
    }

    this.io.to(dungeonId).emit('dungeon:monstersSpawned', {
      monsters: room.monsters.map((monster) => ({
        id: monster.id,
        name: monster.name,
        hp: monster.currentHp,
        maxHp: monster.hp,
        position: monster.position,
        isBoss: Boolean(monster.isBoss),
      })),
      wave: room.wave,
    });

    const timer = setInterval(() => {
      this.monsterAI(dungeonId);
    }, 3000);

    this.spawnTimers.set(dungeonId, timer);
  }

  monsterAI(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (!room || room.players.size === 0) {
      return;
    }

    // Only living players can be targeted; defeated players wait for revive handling.
    const alivePlayers = [...room.players.values()].filter(
      (player) => !player.isDead && player.currentHp > 0
    );

    if (alivePlayers.length === 0) {
      return;
    }

    room.monsters
      .filter((monster) => monster.currentHp > 0)
      .forEach((monster) => {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        const damage = Math.max(
          1,
          monster.atk - (target.stats?.def || 0) + Math.floor(Math.random() * 5 - 2)
        );

        target.currentHp = Math.max(0, target.currentHp - damage);

        this.io.to(dungeonId).emit('combat:monsterAttack', {
          monsterId: monster.id,
          monsterName: monster.name,
          targetId: target.id,
          targetName: target.name,
          damage,
          targetCurrentHp: target.currentHp,
        });

        if (target.currentHp <= 0 && !target.isDead) {
          target.isDead = true;
          target.currentHp = 0;
          this.io.to(target.socketId).emit('player:died', {
            message: '전투에서 패배했습니다.',
          });

          this.clearReviveTimer(target.socketId);
          const reviveTimer = setTimeout(() => {
            const activeRoom = this.rooms.get(dungeonId);
            const activePlayer = activeRoom?.players.get(target.socketId);
            if (!activePlayer) {
              return;
            }

            activePlayer.isDead = false;
            activePlayer.currentHp = Math.max(1, Math.floor(activePlayer.stats.hp * 0.3));
            this.reviveTimers.delete(target.socketId);
            this.io.to(activePlayer.socketId).emit('player:revived', {
              currentHp: activePlayer.currentHp,
              player: this.getSafePlayer(activePlayer),
            });
          }, 5000);

          this.reviveTimers.set(target.socketId, reviveTimer);
        }
      });
  }

  processAttack(attacker, targetId, skillId) {
    // Combat is resolved on the server so HP, rewards, and progression stay authoritative.
    if (!attacker.dungeonId) {
      return null;
    }

    const room = this.rooms.get(attacker.dungeonId);
    if (!room || !room.players.has(attacker.socketId)) {
      return null;
    }

    const monster = room.monsters.find((entry) => entry.id === targetId);
    if (!monster || monster.currentHp <= 0) {
      return null;
    }

    const skill = attacker.skills?.find((entry) => entry.id === skillId);
    const multiplier = skill?.multiplier || 1;
    const hits = skill?.hits || 1;

    let totalDamage = 0;
    for (let index = 0; index < hits; index += 1) {
      const baseDamage = Math.floor((attacker.stats?.atk || 20) * multiplier);
      const variance = Math.floor(Math.random() * 10 - 5);
      const damage = Math.max(1, baseDamage - (monster.def || 0) + variance);
      totalDamage += damage;
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
      room.monsters = room.monsters.filter((entry) => entry.id !== monster.id);

      if (room.bossSpawned && monster.isBoss) {
        this.handleDungeonClear(attacker.dungeonId, room, monster);
      } else if (room.monsters.length === 0) {
        this.handleWaveClear(attacker.dungeonId, room);
      }
    }

    return result;
  }

  handleWaveClear(dungeonId, room) {
    // Clearing a wave either schedules the boss or starts the next wave after a short pause.
    this.clearSpawnTimer(dungeonId);

    if (!room.bossSpawned && room.wave >= 3) {
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

      this.io.to(dungeonId).emit('dungeon:bossSpawned', {
        boss: {
          id: boss.id,
          name: boss.name,
          hp: boss.currentHp,
          maxHp: boss.hp,
          isBoss: true,
        },
      });
      return;
    }

    room.wave += 1;
    this.io.to(dungeonId).emit('dungeon:waveClear', {
      wave: room.wave - 1,
      nextWave: room.wave,
    });

    setTimeout(() => {
      if (this.rooms.has(dungeonId)) {
        this.spawnMonsters(dungeonId);
      }
    }, 5000);
  }

  handleDungeonClear(dungeonId, room, boss) {
    this.clearSpawnTimer(dungeonId);
    room.monsters = [];

    this.io.to(dungeonId).emit('dungeon:cleared', {
      dungeonId,
      name: room.config.name,
      bossName: boss.name,
      wave: room.wave,
    });
  }

  generateRewards(monster) {
    // Small reward variance keeps repeated farming from feeling completely deterministic.
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

  getSafePlayer(player) {
    const { socketId, ...safePlayer } = player;
    return safePlayer;
  }

  clearSpawnTimer(dungeonId) {
    const timer = this.spawnTimers.get(dungeonId);
    if (timer) {
      clearInterval(timer);
      this.spawnTimers.delete(dungeonId);
    }
  }

  clearReviveTimer(socketId) {
    const timer = this.reviveTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.reviveTimers.delete(socketId);
    }
  }

  cleanupRoom(dungeonId) {
    const room = this.rooms.get(dungeonId);
    if (room) {
      room.players.forEach((player) => this.clearReviveTimer(player.socketId));
    }

    this.clearSpawnTimer(dungeonId);
    this.rooms.delete(dungeonId);
    console.log(`[Dungeon closed] ${dungeonId}`);
  }
}

module.exports = GameManager;
