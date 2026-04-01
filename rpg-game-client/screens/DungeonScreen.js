import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGame } from '../context/GameContext';

export default function DungeonScreen({ navigation }) {
  const { player, dungeonState, combatLog, chatMessages, sendChat, attack, useSkill, leaveDungeon } = useGame();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [battleMode, setBattleMode] = useState('manual');
  const [clock, setClock] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [seenChatCount, setSeenChatCount] = useState(0);
  const autoActionLockRef = useRef(false);

  useEffect(() => {
    if (!player) {
      navigation.replace('Login');
    }
  }, [navigation, player]);

  const selectedMonster = useMemo(
    // Resolve the selected id once so UI text and actions refer to the same target.
    () => (dungeonState?.monsters || []).find((monster) => monster.id === selectedTarget) || null,
    [dungeonState?.monsters, selectedTarget]
  );

  useEffect(() => {
    if (!selectedTarget) {
      return;
    }

    // Drop stale target ids when a monster dies or the wave changes.
    const exists = (dungeonState?.monsters || []).some((monster) => monster.id === selectedTarget);
    if (!exists) {
      setSelectedTarget(null);
    }
  }, [dungeonState?.monsters, selectedTarget]);

  useEffect(() => {
    if (battleMode !== 'auto') {
      return;
    }

    if (!selectedTarget && dungeonState?.monsters?.length) {
      setSelectedTarget(dungeonState.monsters[0].id);
    }
  }, [battleMode, dungeonState?.monsters, selectedTarget]);

  useEffect(() => {
    if (battleMode !== 'auto' || !player || !dungeonState || player.isDead) {
      return undefined;
    }

    // Auto battle prefers the strongest usable skill and falls back to a basic attack.
    const intervalId = setInterval(() => {
      const monsters = dungeonState.monsters || [];
      const target = monsters.find((monster) => monster.id === selectedTarget) || monsters[0];
      if (!target || autoActionLockRef.current) {
        return;
      }

      const availableSkill = [...(player.skills || [])]
        .sort((left, right) => {
          const leftScore = (left.multiplier || 1) * (left.hits || 1);
          const rightScore = (right.multiplier || 1) * (right.hits || 1);
          return rightScore - leftScore;
        })
        .find((skill) => {
          const cooldownEnd = player.skillCooldowns?.[skill.id] || 0;
          return player.currentMp >= skill.mpCost && cooldownEnd <= Date.now();
        });

      autoActionLockRef.current = true;
      setSelectedTarget(target.id);

      if (availableSkill) {
        useSkill(availableSkill.id, target.id);
      } else {
        attack(target.id);
      }

      setTimeout(() => {
        autoActionLockRef.current = false;
      }, 700);
    }, 1200);

    return () => clearInterval(intervalId);
  }, [attack, battleMode, dungeonState, player, selectedTarget, useSkill]);

  const handleLeave = () => {
    Alert.alert('던전 나가기', '현재 던전에서 나가시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          setBattleMode('manual');
          leaveDungeon();
          navigation.goBack();
        },
      },
    ]);
  };

  const handleAttack = () => {
    if (!selectedTarget) {
      Alert.alert('대상 선택', '공격할 몬스터를 먼저 선택하세요.');
      return;
    }

    attack(selectedTarget);
  };

  const handleSkill = (skill) => {
    // Mirror server validation locally so the player gets instant feedback on bad casts.
    if (!selectedTarget) {
      Alert.alert('대상 선택', '스킬을 사용할 몬스터를 먼저 선택하세요.');
      return;
    }

    if (player.currentMp < skill.mpCost) {
      Alert.alert('MP 부족', `${skill.name} 사용에는 MP ${skill.mpCost}가 필요합니다.`);
      return;
    }

    const cooldownLeft = Math.max(0, (player.skillCooldowns?.[skill.id] || 0) - Date.now());
    if (cooldownLeft > 0) {
      Alert.alert('쿨타임 진행 중', `${skill.name}은 ${Math.ceil(cooldownLeft / 1000)}초 후에 사용할 수 있습니다.`);
      return;
    }

    useSkill(skill.id, selectedTarget);
  };

  useEffect(() => {
    // Cooldown labels need a lightweight clock even when no new socket event arrives.
    const intervalId = setInterval(() => {
      setClock(Date.now());
    }, 250);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (chatOpen) {
      setSeenChatCount(chatMessages.length);
    }
  }, [chatMessages.length, chatOpen]);

  if (!player) {
    return null;
  }

  if (!dungeonState) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>진행 중인 던전이 없습니다</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>마을로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hpPercent = Math.max(0, (player.currentHp / player.stats.hp) * 100);
  const mpPercent = Math.max(0, (player.currentMp / player.stats.mp) * 100);
  const autoSkill = [...(player.skills || [])]
    .sort((left, right) => ((right.multiplier || 1) * (right.hits || 1)) - ((left.multiplier || 1) * (left.hits || 1)))
    .find((skill) => {
      const cooldownEnd = player.skillCooldowns?.[skill.id] || 0;
      return player.currentMp >= skill.mpCost && cooldownEnd <= clock;
    });
  const unreadChatCount = Math.max(0, chatMessages.length - seenChatCount);

  const openChat = () => {
    // Opening the modal marks the current message count as already seen.
    setSeenChatCount(chatMessages.length);
    setChatOpen(true);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) {
      return;
    }

    // Align unread tracking with the message that is about to be appended locally.
    sendChat(chatInput.trim());
    setChatInput('');
    setSeenChatCount(chatMessages.length + 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.playerStatus}>
        <View style={styles.statusRow}>
          <Text style={styles.playerName}>
            {player.name} Lv.{player.level}
          </Text>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>나가기</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>HP</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, styles.hpFill, { width: `${hpPercent}%` }]} />
          </View>
          <Text style={styles.barValue}>{player.currentHp}/{player.stats.hp}</Text>
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>MP</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, styles.mpFill, { width: `${mpPercent}%` }]} />
          </View>
          <Text style={styles.barValue}>{player.currentMp}/{player.stats.mp}</Text>
        </View>
      </View>

      <View style={styles.dungeonInfo}>
        <Text style={styles.dungeonName}>
          {dungeonState.name} - {dungeonState.wave} 웨이브
        </Text>
        {selectedMonster && (
          <Text style={styles.selectedTarget}>
            대상: {selectedMonster.name} ({selectedMonster.hp}/{selectedMonster.maxHp})
          </Text>
        )}
      </View>

      <View style={styles.monstersSection}>
        <Text style={styles.sectionTitle}>몬스터</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monsterScroll}>
          {(dungeonState?.monsters || []).map((monster) => {
            const monsterHpPercent = Math.max(0, (monster.hp / monster.maxHp) * 100);
            const isSelected = selectedTarget === monster.id;
            const isBoss = Boolean(monster.isBoss);

            return (
              <TouchableOpacity
                key={monster.id}
                style={[
                  styles.monsterCard,
                  isSelected && styles.monsterCardSelected,
                  isBoss && styles.monsterCardBoss,
                ]}
                onPress={() => setSelectedTarget(monster.id)}
              >
                <Text style={styles.monsterEmoji}>{isBoss ? '보' : '몹'}</Text>
                <Text style={styles.monsterName}>{monster.name}</Text>
                <View style={styles.monsterHpBg}>
                  <View style={[styles.monsterHpFill, { width: `${monsterHpPercent}%` }]} />
                </View>
                <Text style={styles.monsterHpText}>
                  {monster.hp}/{monster.maxHp}
                </Text>
              </TouchableOpacity>
            );
          })}
          {(!dungeonState?.monsters || dungeonState.monsters.length === 0) && (
            <Text style={styles.noMonsters}>현재 등장한 몬스터가 없습니다.</Text>
          )}
        </ScrollView>
      </View>

      {/* The provider already caps combat history, so the screen can render it directly. */}
      <ScrollView style={styles.combatLog} showsVerticalScrollIndicator={false}>
        {combatLog.slice(0, 15).map((log) => (
          <Text key={log.id} style={[styles.logEntry, styles[`log_${log.type}`] || styles.log_info]}>
            [{log.ts}] {log.msg}
          </Text>
        ))}
        {combatLog.length === 0 && (
          <Text style={styles.logEmpty}>전투 기록이 없습니다.</Text>
        )}
      </ScrollView>

      <View style={styles.actionArea}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, battleMode === 'manual' && styles.modeBtnActive]}
            onPress={() => setBattleMode('manual')}
          >
            <Text style={[styles.modeBtnText, battleMode === 'manual' && styles.modeBtnTextActive]}>
              수동
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, battleMode === 'auto' && styles.modeBtnAutoActive]}
            onPress={() => setBattleMode('auto')}
          >
            <Text style={[styles.modeBtnText, battleMode === 'auto' && styles.modeBtnTextActive]}>
              자동
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.autoHint}>
          {battleMode === 'auto'
            ? `자동 전투: ${autoSkill ? `${autoSkill.name} 우선 사용` : '기본 공격 사용'}`
            : '수동 전투: 직접 공격 방식을 선택하세요'}
        </Text>
        <TouchableOpacity style={styles.attackBtn} onPress={handleAttack} disabled={player.isDead}>
          <Text style={styles.attackBtnText}>기본 공격</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillRow}>
          {(player.skills || []).map((skill) => (
            (() => {
              const cooldownLeft = Math.max(0, (player.skillCooldowns?.[skill.id] || 0) - clock);
              const isOnCooldown = cooldownLeft > 0;

              return (
                <TouchableOpacity
                  key={skill.id}
                  style={[
                    styles.skillBtn,
                    (player.currentMp < skill.mpCost || isOnCooldown) && styles.skillBtnDisabled,
                  ]}
                  onPress={() => handleSkill(skill)}
                  disabled={player.currentMp < skill.mpCost || isOnCooldown || player.isDead}
                >
                  <Text style={styles.skillName}>{skill.name}</Text>
                  <Text style={styles.skillMp}>MP {skill.mpCost}</Text>
                  <Text style={styles.skillCooldown}>
                    {isOnCooldown ? `쿨 ${Math.ceil(cooldownLeft / 1000)}초` : `쿨 ${(skill.cooldownMs || 0) / 1000}초`}
                  </Text>
                </TouchableOpacity>
              );
            })()
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity style={styles.chatFab} onPress={openChat}>
        <Text style={styles.chatFabIcon}>채팅</Text>
        {unreadChatCount > 0 && (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>{unreadChatCount > 9 ? '9+' : unreadChatCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <View style={styles.chatModalOverlay}>
          <View style={styles.chatModal}>
            <View style={styles.chatModalHeader}>
              <Text style={styles.chatModalTitle}>파티 채팅</Text>
              <TouchableOpacity onPress={() => setChatOpen(false)}>
                <Text style={styles.chatModalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.chatModalMessages} contentContainerStyle={styles.chatModalMessagesContent}>
              {chatMessages.length === 0 && (
                <Text style={styles.chatEmpty}>아직 채팅이 없습니다.</Text>
              )}
              {chatMessages.map((message, index) => (
                <View key={`${message.ts}-${index}`} style={styles.chatBubble}>
                  <Text style={styles.chatName}>{message.name}</Text>
                  <Text style={styles.chatMsg}>{message.message}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="메시지를 입력하세요"
                placeholderTextColor="#5a4a6a"
                onSubmitEditing={handleSendChat}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
                <Text style={styles.sendBtnText}>전송</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0618' },
  emptyContainer: { flex: 1, backgroundColor: '#0d0618', justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#e0c0ff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  backBtn: { backgroundColor: '#2a1a4e', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  backBtnText: { color: '#ffd700', fontWeight: 'bold' },
  playerStatus: {
    backgroundColor: '#1a0a2e',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a1a4e',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerName: { color: '#ffd700', fontWeight: 'bold', fontSize: 16 },
  leaveBtn: { backgroundColor: '#4a1a2e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  leaveBtnText: { color: '#e74c3c', fontSize: 13, fontWeight: 'bold' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { color: '#a080c0', width: 24, fontSize: 12 },
  barBg: {
    flex: 1,
    height: 10,
    backgroundColor: '#0d0618',
    borderRadius: 5,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: { height: '100%', borderRadius: 5 },
  hpFill: { backgroundColor: '#e74c3c' },
  mpFill: { backgroundColor: '#3498db' },
  barValue: { color: '#a080c0', fontSize: 11, width: 60, textAlign: 'right' },
  dungeonInfo: { padding: 10, backgroundColor: '#150820', alignItems: 'center' },
  dungeonName: { color: '#c0a0e0', fontWeight: 'bold' },
  selectedTarget: { color: '#f39c12', marginTop: 4, fontSize: 12 },
  monstersSection: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a0a2e' },
  sectionTitle: { color: '#c0a0e0', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  monsterScroll: {},
  monsterCard: {
    backgroundColor: '#1a0a2e',
    borderRadius: 10,
    padding: 12,
    marginRight: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2a1a3e',
    minWidth: 90,
  },
  monsterCardSelected: { borderColor: '#e74c3c', backgroundColor: '#2a0a1e' },
  monsterCardBoss: { borderColor: '#ffd700', backgroundColor: '#2a1a0e' },
  monsterEmoji: { fontSize: 28, color: '#ffffff' },
  monsterName: { color: '#e0c0ff', fontSize: 12, marginTop: 4, textAlign: 'center' },
  monsterHpBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#0d0618',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  monsterHpFill: { height: '100%', backgroundColor: '#e74c3c', borderRadius: 3 },
  monsterHpText: { color: '#a080c0', fontSize: 10, marginTop: 2 },
  noMonsters: { color: '#5a4a6a', padding: 20, fontStyle: 'italic' },
  combatLog: { flex: 1, padding: 10, backgroundColor: '#08010f' },
  logEntry: { fontSize: 12, marginBottom: 3, paddingHorizontal: 4 },
  log_info: { color: '#8a7a9a' },
  log_attack: { color: '#e74c3c' },
  log_skill: { color: '#9b59b6' },
  log_reward: { color: '#f1c40f' },
  log_levelup: { color: '#ffd700', fontWeight: 'bold' },
  log_danger: { color: '#e74c3c', fontWeight: 'bold' },
  log_kill: { color: '#2ecc71', fontWeight: 'bold' },
  log_wave: { color: '#f39c12', fontWeight: 'bold' },
  log_boss: { color: '#ff6b6b', fontWeight: 'bold' },
  log_party: { color: '#3498db' },
  log_success: { color: '#2ecc71' },
  logEmpty: { color: '#3a2a5a', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  actionArea: {
    backgroundColor: '#1a0a2e',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a1a4e',
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: '#24143f',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4a2a7e',
  },
  modeBtnActive: { backgroundColor: '#3d245f', borderColor: '#c0a0ff' },
  modeBtnAutoActive: { backgroundColor: '#244f37', borderColor: '#2ecc71' },
  modeBtnText: { color: '#9a7aba', fontWeight: 'bold' },
  modeBtnTextActive: { color: '#ffffff' },
  autoHint: { color: '#8a7a9a', fontSize: 12, marginBottom: 10, textAlign: 'center' },
  attackBtn: {
    backgroundColor: '#c0392b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  attackBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  skillRow: {},
  skillBtn: {
    backgroundColor: '#2a1a4e',
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: '#4a2a7e',
  },
  skillBtnDisabled: { opacity: 0.5 },
  skillName: { color: '#c0a0ff', fontWeight: 'bold', fontSize: 12 },
  skillMp: { color: '#3498db', fontSize: 11, marginTop: 3 },
  skillCooldown: { color: '#f39c12', fontSize: 10, marginTop: 3 },
  chatFab: {
    position: 'absolute',
    right: 18,
    bottom: 180,
    backgroundColor: '#2a1a4e',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#4a2a7e',
  },
  chatFabIcon: { color: '#ffffff', fontWeight: 'bold' },
  chatBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chatBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },
  chatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  chatModal: {
    backgroundColor: '#12091f',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '60%',
    paddingTop: 14,
  },
  chatModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a1a4e',
  },
  chatModalTitle: { color: '#ffd700', fontWeight: 'bold', fontSize: 16 },
  chatModalClose: { color: '#c0a0ff', fontWeight: 'bold' },
  chatModalMessages: { paddingHorizontal: 12 },
  chatModalMessagesContent: { paddingVertical: 12 },
  chatBubble: { backgroundColor: '#1a0a2e', borderRadius: 8, padding: 10, marginBottom: 8 },
  chatName: { color: '#a070d0', fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
  chatMsg: { color: '#e0d0f0', fontSize: 14 },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a1a4e',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1a0a2e',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a2a5e',
  },
  sendBtn: { backgroundColor: '#ffd700', borderRadius: 8, padding: 12 },
  sendBtnText: { color: '#1a0a2e', fontWeight: 'bold' },
});
