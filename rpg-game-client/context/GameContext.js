import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';

const GameContext = createContext(null);

//const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const SERVER_URL = "http://221.162.168.243:3000";
const AUTH_STORAGE_KEY = 'rpg.auth.session';

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const notificationTimersRef = useRef(new Set());
  const playerRef = useRef(null);
  const sessionRef = useRef(null);
  const sessionLoadedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [player, setPlayer] = useState(null);
  const [combatLog, setCombatLog] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [dungeonState, setDungeonState] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const persistSession = useCallback(async (session) => {
    sessionRef.current = session;
    if (session) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      return;
    }

    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          sessionRef.current = JSON.parse(stored);
        }
      })
      .catch(() => {})
      .finally(() => {
        sessionLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!sessionLoadedRef.current || !connected || !sessionRef.current?.refreshToken) {
      return;
    }

    socketRef.current?.emit('auth:refresh', { refreshToken: sessionRef.current.refreshToken });
    setAuthLoading(true);
  }, [connected]);

  const addLog = useCallback((msg, type = 'info') => {
    const entry = {
      id: `${Date.now()}-${Math.random()}`,
      msg,
      type,
      ts: new Date().toLocaleTimeString(),
    };
    setCombatLog((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const addNotification = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    const timeoutId = setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
      notificationTimersRef.current.delete(timeoutId);
    }, 3000);

    notificationTimersRef.current.add(timeoutId);
    setNotifications((prev) => [...prev, { id, message, type }]);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;
    const manager = socket.io;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionState('connected');
      setReconnectAttempts(0);

      if (sessionLoadedRef.current && !sessionRef.current?.refreshToken) {
        addNotification('서버에 연결되었습니다.', 'success');
      }
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setConnectionState(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
      setAuthLoading(false);
      if (reason !== 'io client disconnect') {
        addNotification('연결이 끊어졌습니다. 다시 연결 중입니다.', 'error');
      }
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionState('reconnecting');
    });

    socket.on('error', ({ msg }) => {
      setAuthLoading(false);
      addNotification(msg || '알 수 없는 오류가 발생했습니다.', 'error');

      if ((msg || '') === '계정 ID 또는 비밀번호가 올바르지 않습니다.') {
        setPlayer(null);
        setDungeonState(null);
      }
    });

    socket.on('player:loginSuccess', (data) => {
      const { restored, accessToken, refreshToken, ...safeData } = data;
      setAuthLoading(false);
      setPlayer(safeData);
      persistSession({ accessToken, refreshToken });

      if (!restored) {
        setCombatLog([]);
        setChatMessages([]);
        setNotifications([]);
        setDungeonState(null);
        addNotification(`${safeData.name}님, 환영합니다.`, 'success');
      } else {
        if (!safeData.dungeonId) {
          setDungeonState(null);
        }
        addNotification(`${safeData.name}님의 세션이 복구되었습니다.`, 'success');
      }
    });

    socket.on('auth:sessionExpired', ({ msg }) => {
      setAuthLoading(false);
      setPlayer(null);
      setDungeonState(null);
      setCombatLog([]);
      persistSession(null);
      addNotification(msg || '세션이 만료되었습니다. 다시 로그인해 주세요.', 'error');
    });

    socket.on('player:levelUp', ({ level, stats, player: updatedPlayer }) => {
      setPlayer((prev) => (updatedPlayer ? updatedPlayer : prev ? { ...prev, level, stats } : prev));
      addNotification(`레벨 업! 레벨 ${level}에 도달했습니다.`, 'levelup');
      addLog(`레벨 ${level}에 도달했습니다.`, 'levelup');
    });

    socket.on('player:rewardsGained', ({ exp, gold, item, player: updatedPlayer }) => {
      if (updatedPlayer) {
        setPlayer(updatedPlayer);
      }

      const parts = [`보상: 경험치 +${exp}`, `골드 +${gold}`];
      if (item) {
        parts.push(`아이템: ${item.name}`);
      }
      addLog(parts.join(', '), 'reward');
    });

    socket.on('player:mpUpdated', ({ currentMp, player: updatedPlayer }) => {
      setPlayer((prev) => (updatedPlayer ? updatedPlayer : prev ? { ...prev, currentMp } : prev));
    });

    socket.on('player:equipUpdated', ({ equipment, stats, inventory, player: updatedPlayer }) => {
      setPlayer((prev) => (
        updatedPlayer ? updatedPlayer : prev ? { ...prev, equipment, stats, inventory } : prev
      ));
      addNotification('장비가 변경되었습니다.', 'success');
    });

    socket.on('player:died', ({ message }) => {
      setPlayer((prev) => (prev ? { ...prev, currentHp: 0, isDead: true } : prev));
      addNotification(message || '전투에서 패배했습니다.', 'error');
      addLog('쓰러졌습니다. 5초 후 부활합니다.', 'danger');
    });

    socket.on('player:revived', ({ currentHp, player: updatedPlayer }) => {
      setPlayer((prev) => (
        updatedPlayer ? updatedPlayer : prev ? { ...prev, currentHp, isDead: false } : prev
      ));
      addNotification('부활했습니다.', 'success');
    });

    socket.on('combat:attackResult', (data) => {
      const { attackerId, targetId, targetName, damage, targetCurrentHp, targetMaxHp, targetDied } = data;
      const isMe = playerRef.current?.id === attackerId;

      addLog(
        `${isMe ? '내가' : '파티가'} ${targetName}에게 ${damage} 피해를 입혔습니다. (${targetCurrentHp}/${targetMaxHp})`,
        isMe ? 'attack' : 'party'
      );

      if (targetDied) {
        addLog(`${targetName} 처치 완료.`, 'kill');
      }

      setDungeonState((prev) => {
        if (!prev) {
          return prev;
        }

        const monsters = prev.monsters
          .map((monster) => (monster.id === targetId ? { ...monster, hp: targetCurrentHp } : monster))
          .filter((monster) => monster.hp > 0);

        return { ...prev, monsters };
      });
    });

    socket.on('combat:skillResult', (data) => {
      const isMe = playerRef.current?.id === data.caster;

      addLog(
        `${isMe ? '내가' : '파티가'} ${data.targetName}에게 ${data.skillId}로 ${data.damage} 피해를 입혔습니다.`,
        'skill'
      );

      setDungeonState((prev) => {
        if (!prev) {
          return prev;
        }

        const monsters = prev.monsters
          .map((monster) => (monster.id === data.targetId ? { ...monster, hp: data.targetCurrentHp } : monster))
          .filter((monster) => monster.hp > 0);

        return { ...prev, monsters };
      });
    });

    socket.on('combat:monsterAttack', ({ monsterName, targetId, targetName, damage, targetCurrentHp }) => {
      const isMe = playerRef.current?.id === targetId;

      if (isMe) {
        setPlayer((prev) => (prev ? { ...prev, currentHp: targetCurrentHp } : prev));
      }

      addLog(
        `${monsterName}이 ${isMe ? '당신' : targetName}에게 ${damage} 피해를 입혔습니다.`,
        isMe ? 'danger' : 'info'
      );
    });

    socket.on('dungeon:entered', ({ dungeonId, room }) => {
      setDungeonState({ dungeonId, ...room });
      setPlayer((prev) => (prev ? { ...prev, dungeonId } : prev));
      addLog(`${room.name}에 입장했습니다.`, 'info');
    });

    socket.on('dungeon:left', () => {
      setDungeonState(null);
      setPlayer((prev) => (prev ? { ...prev, dungeonId: null, isDead: false } : prev));
      addLog('던전에서 나왔습니다.', 'info');
    });

    socket.on('dungeon:monstersSpawned', ({ monsters, wave }) => {
      setDungeonState((prev) => (prev ? { ...prev, monsters, wave } : prev));
      addLog(`${wave} 웨이브 시작. 몬스터 ${monsters.length}마리가 등장했습니다.`, 'wave');
    });

    socket.on('dungeon:waveClear', ({ wave, nextWave }) => {
      addLog(`${wave} 웨이브를 클리어했습니다. 다음 웨이브: ${nextWave}.`, 'success');
      addNotification(`${wave} 웨이브 클리어.`, 'success');
    });

    socket.on('dungeon:bossSpawned', ({ boss }) => {
      addLog(`보스 등장: ${boss.name}.`, 'boss');
      addNotification(`보스 ${boss.name}이(가) 등장했습니다.`, 'boss');
      setDungeonState((prev) => (prev ? { ...prev, monsters: [{ ...boss, maxHp: boss.hp, isBoss: true }] } : prev));
    });

    socket.on('dungeon:cleared', ({ name, bossName }) => {
      setDungeonState((prev) => (prev ? { ...prev, monsters: [] } : prev));
      addLog(`${name}을(를) 클리어했습니다. ${bossName} 처치 완료.`, 'success');
      addNotification(`${name} 클리어 완료.`, 'success');
    });

    socket.on('dungeon:playerJoined', ({ name }) => {
      addLog(`${name}님이 파티에 합류했습니다.`, 'party');
    });

    socket.on('dungeon:playerLeft', ({ playerId }) => {
      if (playerRef.current?.id !== playerId) {
        addLog('파티원이 던전을 떠났습니다.', 'info');
      }
    });

    socket.on('chat:message', (data) => {
      setChatMessages((prev) => [...prev, data].slice(-100));
    });

    manager.on('reconnect_attempt', (attempt) => {
      setConnectionState('reconnecting');
      setReconnectAttempts(attempt);
    });

    manager.on('reconnect_failed', () => {
      setConnectionState('disconnected');
      addNotification('서버에 다시 연결하지 못했습니다.', 'error');
    });

    manager.on('reconnect_error', () => {
      setConnectionState('reconnecting');
    });

    return () => {
      manager.removeAllListeners();
      socket.removeAllListeners();
      notificationTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      notificationTimersRef.current.clear();
      socket.disconnect();
    };
  }, [addLog, addNotification, persistSession]);

  const emit = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const register = useCallback((accountName, password, name, characterClass) => {
    setAuthLoading(true);
    emit('account:register', { accountName, password, name, characterClass });
  }, [emit]);

  const login = useCallback((accountName, password) => {
    setAuthLoading(true);
    emit('account:login', { accountName, password });
  }, [emit]);

  const move = useCallback((x, y, map) => {
    emit('player:move', { x, y, map });
  }, [emit]);

  const attack = useCallback((targetId) => {
    emit('player:attack', { targetId });
  }, [emit]);

  const useSkill = useCallback((skillId, targetId) => {
    emit('player:useSkill', { skillId, targetId });
  }, [emit]);

  const equipItem = useCallback((itemId) => {
    emit('player:equipItem', { itemId });
  }, [emit]);

  const sendChat = useCallback((message) => {
    emit('chat:send', { message });
  }, [emit]);

  const enterDungeon = useCallback((dungeonId) => {
    emit('dungeon:enter', { dungeonId });
  }, [emit]);

  const leaveDungeon = useCallback(() => {
    emit('dungeon:leave');
  }, [emit]);

  return (
    <GameContext.Provider
      value={{
        connected,
        connectionState,
        reconnectAttempts,
        authLoading,
        player,
        combatLog,
        chatMessages,
        dungeonState,
        notifications,
        register,
        login,
        move,
        attack,
        useSkill,
        equipItem,
        sendChat,
        enterDungeon,
        leaveDungeon,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within GameProvider');
  }
  return ctx;
};
