import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGame } from '../context/GameContext';

const STAT_LABELS = {
  hp: 'HP',
  mp: 'MP',
  atk: '공격력',
  def: '방어력',
  spd: '속도',
};

const SLOT_LABELS = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};

const CLASS_ICONS = {
  warrior: '전',
  mage: '마',
  archer: '궁',
  paladin: '성',
};

const CLASS_LABELS = {
  warrior: '전사',
  mage: '마법사',
  archer: '궁수',
  paladin: '성기사',
};

const TAB_LABELS = {
  stats: '능력치',
  equipment: '장비',
  inventory: '인벤토리',
  skills: '스킬',
};

const SKILL_TYPE_LABELS = {
  physical: '물리',
  magic: '마법',
  holy: '신성',
  buff: '버프',
};

export default function CharacterScreen({ navigation }) {
  const { player, equipItem } = useGame();
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    // This screen depends on an authenticated player snapshot from context.
    if (!player) {
      navigation.replace('Login');
    }
  }, [navigation, player]);

  if (!player) {
    return null;
  }

  const handleEquip = (item) => {
    // Show the stat delta first because equipping immediately changes derived stats.
    const bonuses = Object.entries(item.statBonus || {})
      .map(([key, value]) => `${STAT_LABELS[key] || key}: +${value}`)
      .join('\n');

    Alert.alert(item.name, bonuses || '추가 능력치 정보가 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '장착', onPress: () => equipItem(item.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.charEmoji}>{CLASS_ICONS[player.characterClass] || 'W'}</Text>
        <View>
          <Text style={styles.charName}>{player.name}</Text>
          <Text style={styles.charClass}>
            {CLASS_LABELS[player.characterClass] || player.characterClass} Lv.{player.level}
          </Text>
          <Text style={styles.charGold}>골드 {player.gold}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {['stats', 'equipment', 'inventory', 'skills'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabs keep the long character payload readable without one oversized panel. */}
      <ScrollView style={styles.content}>
        {activeTab === 'stats' && (
          <View>
            <Text style={styles.sectionTitle}>기본 능력치</Text>
            {Object.entries(player.stats).map(([key, value]) => (
              STAT_LABELS[key] ? (
                <View key={key} style={styles.statRow}>
                  <Text style={styles.statLabel}>{STAT_LABELS[key]}</Text>
                  <View style={styles.statBarBg}>
                    <View
                      style={[
                        styles.statBarFill,
                        { width: `${Math.min(100, (value / 500) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ) : null
            ))}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>경험치</Text>
            <View style={styles.expRow}>
              <Text style={styles.expLabel}>EXP</Text>
              <View style={styles.expBarBg}>
                <View
                  style={[
                    styles.expBarFill,
                    { width: `${Math.floor((player.exp / player.expToNext) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.expValue}>
                {player.exp} / {player.expToNext}
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'equipment' && (
          <View>
            <Text style={styles.sectionTitle}>장착 중인 장비</Text>
            {Object.entries(SLOT_LABELS).map(([slot, label]) => {
              const item = player.equipment?.[slot];
              return (
                <View key={slot} style={styles.equipSlot}>
                  <Text style={styles.equipSlotLabel}>{label}</Text>
                  {item ? (
                    <View style={styles.equipItem}>
                      <Text style={styles.equipItemName}>{item.name}</Text>
                      <Text style={styles.equipItemBonus}>
                        {Object.entries(item.statBonus || {})
                          .map(([key, value]) => `${STAT_LABELS[key] || key} +${value}`)
                          .join(' | ')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.equipEmpty}>비어 있음</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'inventory' && (
          <View>
            <Text style={styles.sectionTitle}>인벤토리 ({player.inventory?.length || 0})</Text>
            {(player.inventory || []).length === 0 && (
              <Text style={styles.emptyText}>인벤토리가 비어 있습니다.</Text>
            )}
            {(player.inventory || []).map((item) => (
              <View key={item.id} style={styles.invItem}>
                <View style={styles.invItemInfo}>
                  <Text style={styles.invItemName}>{item.name}</Text>
                  <Text style={styles.invItemType}>
                    {item.type === 'equipment'
                      ? `장비 - ${SLOT_LABELS[item.slot] || item.slot}`
                      : '소모품'}
                  </Text>
                  {item.statBonus && (
                    <Text style={styles.invItemBonus}>
                      {Object.entries(item.statBonus)
                        .map(([key, value]) => `${STAT_LABELS[key] || key} +${value}`)
                        .join(' | ')}
                    </Text>
                  )}
                </View>
                {item.type === 'equipment' && (
                  <TouchableOpacity style={styles.equipBtn} onPress={() => handleEquip(item)}>
                    <Text style={styles.equipBtnText}>장착</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'skills' && (
          <View>
            <Text style={styles.sectionTitle}>스킬</Text>
            {(player.skills || []).map((skill) => (
              <View key={skill.id} style={styles.skillCard}>
                <Text style={styles.skillName}>{skill.name}</Text>
                <View style={styles.skillMeta}>
                  <Text style={styles.skillTag}>MP {skill.mpCost}</Text>
                  <Text style={styles.skillTag}>x{skill.multiplier}</Text>
                  <Text style={styles.skillTag}>쿨 {(skill.cooldownMs || 0) / 1000}초</Text>
                  {skill.hits ? <Text style={styles.skillTag}>타수 {skill.hits}</Text> : null}
                  <Text style={styles.skillTag}>{SKILL_TYPE_LABELS[skill.type] || skill.type}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0618' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
    backgroundColor: '#1a0a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a1a4e',
  },
  charEmoji: { fontSize: 48, color: '#ffffff' },
  charName: { color: '#ffd700', fontWeight: 'bold', fontSize: 20 },
  charClass: { color: '#a070d0', fontSize: 14 },
  charGold: { color: '#f1c40f', fontSize: 13, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a1a4e' },
  tab: { flex: 1, padding: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#ffd700' },
  tabText: { color: '#5a4a7a', fontSize: 11 },
  tabTextActive: { color: '#ffd700', fontWeight: 'bold' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { color: '#c0a0e0', fontWeight: 'bold', fontSize: 16, marginBottom: 12, marginTop: 4 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statLabel: { color: '#9a7aba', width: 60, fontSize: 13 },
  statBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#1a0a2e',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  statBarFill: { height: '100%', backgroundColor: '#9b59b6', borderRadius: 4 },
  statValue: { color: '#e0d0ff', width: 40, textAlign: 'right', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#2a1a4e', marginVertical: 16 },
  expRow: { flexDirection: 'row', alignItems: 'center' },
  expLabel: { color: '#9a7aba', width: 50, fontSize: 13 },
  expBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: '#1a0a2e',
    borderRadius: 5,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  expBarFill: { height: '100%', backgroundColor: '#8e44ad', borderRadius: 5 },
  expValue: { color: '#e0d0ff', fontSize: 12, width: 80, textAlign: 'right' },
  equipSlot: {
    backgroundColor: '#1a0a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a1a4e',
  },
  equipSlotLabel: { color: '#9a7aba', fontSize: 13, marginBottom: 6 },
  equipItemName: { color: '#ffd700', fontWeight: 'bold' },
  equipItemBonus: { color: '#2ecc71', fontSize: 12, marginTop: 2 },
  equipEmpty: { color: '#3a2a5a', fontStyle: 'italic' },
  invItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a0a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a1a4e',
  },
  invItemInfo: { flex: 1 },
  invItemName: { color: '#e0c0ff', fontWeight: 'bold', fontSize: 15 },
  invItemType: { color: '#7a5a9a', fontSize: 12, marginTop: 2 },
  invItemBonus: { color: '#2ecc71', fontSize: 12, marginTop: 2 },
  equipBtn: { backgroundColor: '#4a2a7e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  equipBtnText: { color: '#c0a0ff', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#3a2a5a', textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
  skillCard: {
    backgroundColor: '#1a0a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3a1a5e',
  },
  skillName: { color: '#c0a0ff', fontWeight: 'bold', fontSize: 16, marginBottom: 8 },
  skillMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: {
    backgroundColor: '#2a1a4e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: '#9a7aba',
    fontSize: 11,
  },
});
