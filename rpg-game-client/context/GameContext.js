import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const GameContext = createContext(null);

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const notificationTimersRef = useRef(new Set());
  const playerRef = useRef(null);
  const authRef = useRef(null);
  const authReadyRef = useRef(false);

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

      if (authReadyRef.current && authRef.current) {
        socket.emit('account:login', authRef.current);
        setAuthLoading(true);
      } else {
        addNotification('Connected to server.', 'success');
      }
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setConnectionState(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
      setAuthLoading(false);
      if (reason !== 'io client disconnect') {
        addNotification('Connection lost. Reconnecting...', 'error');
      }
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionState('reconnecting');
    });

    socket.on('error', ({ msg }) => {
      setAuthLoading(false);
      addNotification(msg || 'An unknown error occurred.', 'error');

      if ((msg || '') === 'Invalid account ID or password.') {
        authReadyRef.current = false;
        authRef.current = null;
        setPlayer(null);
        setDungeonState(null);
      }
    });

    socket.on('player:loginSuccess', (data) => {
      const { restored, ...safeData } = data;
      authReadyRef.current = true;
      setAuthLoading(false);
      setPlayer(safeData);

      if (!restored) {
        setCombatLog([]);
        setChatMessages([]);
        setNotifications([]);
        setDungeonState(null);
        addNotification(`Welcome, ${safeData.name}.`, 'success');
      } else {
        if (!safeData.dungeonId) {
          setDungeonState(null);
        }
        addNotification(`Session restored for ${safeData.name}.`, 'success');
      }
    });

    socket.on('player:levelUp', ({ level, stats, player: updatedPlayer }) => {
      setPlayer((prev) => (updatedPlayer ? updatedPlayer : prev ? { ...prev, level, stats } : prev));
      addNotification(`Level up! You reached level ${level}.`, 'levelup');
      addLog(`You are now level ${level}.`, 'levelup');
    });

    socket.on('player:rewardsGained', ({ exp, gold, item, player: updatedPlayer }) => {
      if (updatedPlayer) {
        setPlayer(updatedPlayer);
      }

      const parts = [`Rewards: EXP +${exp}`, `Gold +${gold}`];
      if (item) {
        parts.push(`Item: ${item.name}`);
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
      addNotification('Equipment updated.', 'success');
    });

    socket.on('player:died', ({ message }) => {
      setPlayer((prev) => (prev ? { ...prev, currentHp: 0, isDead: true } : prev));
      addNotification(message || 'You were defeated.', 'error');
      addLog('You are down. Revival in 5 seconds.', 'danger');
    });

    socket.on('player:revived', ({ currentHp, player: updatedPlayer }) => {
      setPlayer((prev) => (
        updatedPlayer ? updatedPlayer : prev ? { ...prev, currentHp, isDead: false } : prev
      ));
      addNotification('You have been revived.', 'success');
    });

    socket.on('combat:attackResult', (data) => {
      const { attackerId, targetId, targetName, damage, targetCurrentHp, targetMaxHp, targetDied } = data;
      const isMe = playerRef.current?.id === attackerId;

      addLog(
        `${isMe ? 'You' : 'Party'} hit ${targetName} for ${damage} damage (${targetCurrentHp}/${targetMaxHp}).`,
        isMe ? 'attack' : 'party'
      );

      if (targetDied) {
        addLog(`${targetName} was defeated.`, 'kill');
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
        `${isMe ? 'You' : 'Party'} used ${data.skillId} on ${data.targetName} for ${data.damage} damage.`,
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
        `${monsterName} attacked ${isMe ? 'you' : targetName} for ${damage} damage.`,
        isMe ? 'danger' : 'info'
      );
    });

    socket.on('dungeon:entered', ({ dungeonId, room }) => {
      setDungeonState({ dungeonId, ...room });
      setPlayer((prev) => (prev ? { ...prev, dungeonId } : prev));
      addLog(`Entered ${room.name}.`, 'info');
    });

    socket.on('dungeon:left', () => {
      setDungeonState(null);
      setPlayer((prev) => (prev ? { ...prev, dungeonId: null, isDead: false } : prev));
      addLog('You left the dungeon.', 'info');
    });

    socket.on('dungeon:monstersSpawned', ({ monsters, wave }) => {
      setDungeonState((prev) => (prev ? { ...prev, monsters, wave } : prev));
      addLog(`Wave ${wave} started. ${monsters.length} monsters appeared.`, 'wave');
    });

    socket.on('dungeon:waveClear', ({ wave, nextWave }) => {
      addLog(`Wave ${wave} cleared. Next wave: ${nextWave}.`, 'success');
      addNotification(`Wave ${wave} cleared.`, 'success');
    });

    socket.on('dungeon:bossSpawned', ({ boss }) => {
      addLog(`Boss spawned: ${boss.name}.`, 'boss');
      addNotification(`Boss ${boss.name} appeared.`, 'boss');
      setDungeonState((prev) => (prev ? { ...prev, monsters: [{ ...boss, maxHp: boss.hp, isBoss: true }] } : prev));
    });

    socket.on('dungeon:cleared', ({ name, bossName }) => {
      setDungeonState((prev) => (prev ? { ...prev, monsters: [] } : prev));
      addLog(`${name} cleared. ${bossName} was defeated.`, 'success');
      addNotification(`${name} clear complete.`, 'success');
    });

    socket.on('dungeon:playerJoined', ({ name }) => {
      addLog(`${name} joined the party.`, 'party');
    });

    socket.on('dungeon:playerLeft', ({ playerId }) => {
      if (playerRef.current?.id !== playerId) {
        addLog('A party member left the dungeon.', 'info');
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
      addNotification('Unable to reconnect to the server.', 'error');
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
  }, [addLog, addNotification]);

  const emit = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const register = useCallback((accountName, password, name, characterClass) => {
    authRef.current = { accountName, password };
    setAuthLoading(true);
    emit('account:register', { accountName, password, name, characterClass });
  }, [emit]);

  const login = useCallback((accountName, password) => {
    authRef.current = { accountName, password };
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
