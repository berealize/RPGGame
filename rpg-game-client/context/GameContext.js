import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';

const GameContext = createContext(null);

const SERVER_URL = 'http://221.162.168.243:3000'; // 실제 서버 주소로 변경

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [player, setPlayer] = useState(null);
  const [combatLog, setCombatLog] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [dungeonState, setDungeonState] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const addLog = useCallback((msg, type = 'info') => {
    const entry = { id: Date.now() + Math.random(), msg, type, ts: new Date().toLocaleTimeString() };
    setCombatLog(prev => [entry, ...prev].slice(0, 50));
  }, []);

  const addNotification = useCallback((message, type = 'info') => {
    const notif = { id: Date.now(), message, type };
    setNotifications(prev => [...prev, notif]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 3000);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('서버 연결됨:', socket.id);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      addNotification('서버 연결이 끊어졌습니다.', 'error');
    });

    // 플레이어 이벤트
    socket.on('player:loginSuccess', (data) => {
      setPlayer(data);
      addNotification(`${data.name}님, 환영합니다!`, 'success');
    });

    socket.on('player:levelUp', ({ level, stats }) => {
      setPlayer(prev => prev ? { ...prev, level, stats } : prev);
      addNotification(`🎉 레벨 업! Lv.${level}`, 'levelup');
      addLog(`레벨 업! 현재 레벨: ${level}`, 'levelup');
    });

    socket.on('player:rewardsGained', ({ exp, gold, item, player: updatedPlayer }) => {
      if (updatedPlayer) setPlayer(updatedPlayer);
      addLog(`보상 획득 - EXP: +${exp}, 골드: +${gold}${item ? `, 아이템: ${item.name}` : ''}`, 'reward');
    });

    socket.on('player:mpUpdated', ({ currentMp }) => {
      setPlayer(prev => prev ? { ...prev, currentMp } : prev);
    });

    socket.on('player:equipUpdated', ({ equipment, stats }) => {
      setPlayer(prev => prev ? { ...prev, equipment, stats } : prev);
      addNotification('장비를 착용했습니다.', 'success');
    });

    socket.on('player:died', ({ message }) => {
      addNotification('💀 ' + message, 'error');
      addLog('전투 불능 상태! 5초 후 부활합니다...', 'danger');
    });

    socket.on('player:revived', ({ currentHp }) => {
      setPlayer(prev => prev ? { ...prev, currentHp } : prev);
      addNotification('✨ 부활했습니다!', 'success');
    });

    // 전투 이벤트
    socket.on('combat:attackResult', (data) => {
      const { attackerId, targetName, damage, targetCurrentHp, targetMaxHp, targetDied } = data;
      const isMe = player?.id === attackerId;
      const who = isMe ? '내가' : '파티원이';
      addLog(`${who} ${targetName}에게 ${damage} 데미지! (HP: ${targetCurrentHp}/${targetMaxHp})`, isMe ? 'attack' : 'party');
      if (targetDied) addLog(`${targetName} 처치!`, 'kill');

      setDungeonState(prev => {
        if (!prev) return prev;
        const monsters = prev.monsters.map(m =>
          m.id === data.targetId ? { ...m, hp: targetCurrentHp } : m
        ).filter(m => m.hp > 0);
        return { ...prev, monsters };
      });
    });

    socket.on('combat:skillResult', (data) => {
      addLog(`스킬 사용! ${data.targetName}에게 ${data.damage} 피해`, 'skill');
    });

    socket.on('combat:monsterAttack', ({ monsterName, targetName, damage, targetCurrentHp }) => {
      const isMe = player?.name === targetName;
      if (isMe) {
        setPlayer(prev => prev ? { ...prev, currentHp: targetCurrentHp } : prev);
        addLog(`${monsterName}의 공격! ${damage} 데미지 받음`, 'danger');
      } else {
        addLog(`${monsterName}가 ${targetName}를 공격 - ${damage} 데미지`, 'info');
      }
    });

    // 던전 이벤트
    socket.on('dungeon:entered', ({ dungeonId, room }) => {
      setDungeonState({ dungeonId, ...room });
      addLog(`던전 입장: ${room.name}`, 'info');
    });

    socket.on('dungeon:left', () => {
      setDungeonState(null);
      addLog('던전에서 나왔습니다.', 'info');
    });

    socket.on('dungeon:monstersSpawned', ({ monsters, wave }) => {
      setDungeonState(prev => prev ? { ...prev, monsters, wave } : prev);
      addLog(`웨이브 ${wave} 시작! 몬스터 ${monsters.length}마리 등장`, 'wave');
    });

    socket.on('dungeon:waveClear', ({ wave, nextWave }) => {
      addLog(`웨이브 ${wave} 클리어! 다음 웨이브: ${nextWave}`, 'success');
      addNotification(`웨이브 ${wave} 클리어!`, 'success');
    });

    socket.on('dungeon:bossSpawned', ({ boss }) => {
      addLog(`⚠️ 보스 등장! ${boss.name} (HP: ${boss.hp})`, 'boss');
      addNotification(`⚠️ 보스 ${boss.name} 등장!`, 'boss');
      setDungeonState(prev => prev ? { ...prev, monsters: [{ ...boss, maxHp: boss.hp }] } : prev);
    });

    socket.on('dungeon:playerJoined', ({ name }) => {
      addLog(`${name}님이 파티에 합류했습니다.`, 'party');
    });

    // 채팅
    socket.on('chat:message', (data) => {
      setChatMessages(prev => [...prev, data].slice(-100));
    });

    return () => socket.disconnect();
  }, []);

  const login = useCallback((name, characterClass) => {
    socketRef.current?.emit('player:login', { name, characterClass });
  }, []);

  const move = useCallback((x, y, map) => {
    socketRef.current?.emit('player:move', { x, y, map });
  }, []);

  const attack = useCallback((targetId) => {
    socketRef.current?.emit('player:attack', { targetId });
  }, []);

  const useSkill = useCallback((skillId, targetId) => {
    socketRef.current?.emit('player:useSkill', { skillId, targetId });
  }, []);

  const equipItem = useCallback((itemId) => {
    socketRef.current?.emit('player:equipItem', { itemId });
  }, []);

  const sendChat = useCallback((message) => {
    socketRef.current?.emit('chat:send', { message });
  }, []);

  const enterDungeon = useCallback((dungeonId) => {
    socketRef.current?.emit('dungeon:enter', { dungeonId });
  }, []);

  const leaveDungeon = useCallback(() => {
    socketRef.current?.emit('dungeon:leave');
  }, []);

  return (
    <GameContext.Provider value={{
      connected, player, combatLog, chatMessages, dungeonState, notifications,
      login, move, attack, useSkill, equipItem, sendChat, enterDungeon, leaveDungeon,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
};
