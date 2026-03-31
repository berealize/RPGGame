import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGame } from '../context/GameContext';

export default function DungeonScreen({ navigation }) {
  const { player, dungeonState, combatLog, attack, useSkill, leaveDungeon } = useGame();
  const [selectedTarget, setSelectedTarget] = useState(null);

  const selectedMonster = useMemo(
    () => (dungeonState?.monsters || []).find((monster) => monster.id === selectedTarget) || null,
    [dungeonState?.monsters, selectedTarget]
  );

  const handleLeave = () => {
    Alert.alert('Leave Dungeon', 'Do you want to leave this dungeon?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          leaveDungeon();
          navigation.goBack();
        },
      },
    ]);
  };

  const handleAttack = () => {
    if (!selectedTarget) {
      Alert.alert('Select Target', 'Choose a monster before attacking.');
      return;
    }

    attack(selectedTarget);
  };

  const handleSkill = (skill) => {
    if (!selectedTarget) {
      Alert.alert('Select Target', 'Choose a monster before using a skill.');
      return;
    }

    if (player.currentMp < skill.mpCost) {
      Alert.alert('Not Enough MP', `${skill.name} needs ${skill.mpCost} MP.`);
      return;
    }

    useSkill(skill.id, selectedTarget);
  };

  if (!player) {
    return null;
  }

  const hpPercent = Math.max(0, (player.currentHp / player.stats.hp) * 100);
  const mpPercent = Math.max(0, (player.currentMp / player.stats.mp) * 100);

  return (
    <View style={styles.container}>
      <View style={styles.playerStatus}>
        <View style={styles.statusRow}>
          <Text style={styles.playerName}>
            {player.name} Lv.{player.level}
          </Text>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave</Text>
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

      {dungeonState && (
        <View style={styles.dungeonInfo}>
          <Text style={styles.dungeonName}>
            {dungeonState.name} - Wave {dungeonState.wave}
          </Text>
          {selectedMonster && (
            <Text style={styles.selectedTarget}>
              Target: {selectedMonster.name} ({selectedMonster.hp}/{selectedMonster.maxHp})
            </Text>
          )}
        </View>
      )}

      <View style={styles.monstersSection}>
        <Text style={styles.sectionTitle}>Monsters</Text>
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
                <Text style={styles.monsterEmoji}>{isBoss ? 'B' : 'M'}</Text>
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
            <Text style={styles.noMonsters}>No monsters are active right now.</Text>
          )}
        </ScrollView>
      </View>

      <ScrollView style={styles.combatLog} showsVerticalScrollIndicator={false}>
        {combatLog.slice(0, 15).map((log) => (
          <Text key={log.id} style={[styles.logEntry, styles[`log_${log.type}`] || styles.log_info]}>
            [{log.ts}] {log.msg}
          </Text>
        ))}
        {combatLog.length === 0 && (
          <Text style={styles.logEmpty}>Combat log is empty.</Text>
        )}
      </ScrollView>

      <View style={styles.actionArea}>
        <TouchableOpacity style={styles.attackBtn} onPress={handleAttack} disabled={player.isDead}>
          <Text style={styles.attackBtnText}>Basic Attack</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillRow}>
          {(player.skills || []).map((skill) => (
            <TouchableOpacity
              key={skill.id}
              style={[styles.skillBtn, player.currentMp < skill.mpCost && styles.skillBtnDisabled]}
              onPress={() => handleSkill(skill)}
              disabled={player.currentMp < skill.mpCost || player.isDead}
            >
              <Text style={styles.skillName}>{skill.name}</Text>
              <Text style={styles.skillMp}>MP {skill.mpCost}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0618' },
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
});
