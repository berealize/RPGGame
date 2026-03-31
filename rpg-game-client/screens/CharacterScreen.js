import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useGame } from '../context/GameContext';

const STAT_LABELS = { hp: '체력', mp: '마나', atk: '공격력', def: '방어력', spd: '속도' };
const SLOT_LABELS = { weapon: '🗡️ 무기', armor: '🛡️ 방어구', accessory: '💍 장신구' };

export default function CharacterScreen() {
  const { player, equipItem } = useGame();
  const [activeTab, setActiveTab] = useState('stats');

  if (!player) return null;

  const handleEquip = (item) => {
    Alert.alert(item.name, `착용하시겠습니까?\n${Object.entries(item.statBonus || {}).map(([k, v]) => `${STAT_LABELS[k]}: +${v}`).join('\n')}`,
      [{ text: '취소', style: 'cancel' }, { text: '착용', onPress: () => equipItem(item.id) }]
    );
  };

  return (
    <View style={styles.container}>
      {/* 캐릭터 헤더 */}
      <View style={styles.header}>
        <Text style={styles.charEmoji}>
          {{ warrior: '⚔️', mage: '🔮', archer: '🏹', paladin: '🛡️' }[player.characterClass] || '⚔️'}
        </Text>
        <View>
          <Text style={styles.charName}>{player.name}</Text>
          <Text style={styles.charClass}>{player.characterClass} · Lv.{player.level}</Text>
          <Text style={styles.charGold}>💰 {player.gold} 골드</Text>
        </View>
      </View>

      {/* 탭 */}
      <View style={styles.tabs}>
        {['stats', 'equipment', 'inventory', 'skills'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {{ stats: '📊 능력치', equipment: '⚔️ 장비', inventory: '🎒 인벤', skills: '✨ 스킬' }[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'stats' && (
          <View>
            <Text style={styles.sectionTitle}>기본 능력치</Text>
            {Object.entries(player.stats).map(([key, val]) => (
              STAT_LABELS[key] && (
                <View key={key} style={styles.statRow}>
                  <Text style={styles.statLabel}>{STAT_LABELS[key]}</Text>
                  <View style={styles.statBarBg}>
                    <View style={[styles.statBarFill, { width: `${Math.min(100, (val / 500) * 100)}%` }]} />
                  </View>
                  <Text style={styles.statValue}>{val}</Text>
                </View>
              )
            ))}
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>경험치</Text>
            <View style={styles.expRow}>
              <Text style={styles.expLabel}>EXP</Text>
              <View style={styles.expBarBg}>
                <View style={[styles.expBarFill, { width: `${Math.floor((player.exp / player.expToNext) * 100)}%` }]} />
              </View>
              <Text style={styles.expValue}>{player.exp} / {player.expToNext}</Text>
            </View>
          </View>
        )}

        {activeTab === 'equipment' && (
          <View>
            <Text style={styles.sectionTitle}>착용 장비</Text>
            {Object.entries(SLOT_LABELS).map(([slot, label]) => {
              const item = player.equipment?.[slot];
              return (
                <View key={slot} style={styles.equipSlot}>
                  <Text style={styles.equipSlotLabel}>{label}</Text>
                  {item ? (
                    <View style={styles.equipItem}>
                      <Text style={styles.equipItemName}>{item.name}</Text>
                      <Text style={styles.equipItemBonus}>
                        {Object.entries(item.statBonus || {}).map(([k, v]) => `${STAT_LABELS[k]} +${v}`).join(' · ')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.equipEmpty}>없음</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'inventory' && (
          <View>
            <Text style={styles.sectionTitle}>인벤토리 ({player.inventory?.length || 0}개)</Text>
            {(player.inventory || []).length === 0 && (
              <Text style={styles.emptyText}>인벤토리가 비어있습니다.</Text>
            )}
            {(player.inventory || []).map(item => (
              <TouchableOpacity key={item.id} style={styles.invItem} onPress={() => item.type === 'equipment' && handleEquip(item)}>
                <View style={styles.invItemInfo}>
                  <Text style={styles.invItemName}>{item.name}</Text>
                  <Text style={styles.invItemType}>{item.type === 'equipment' ? `장비 - ${SLOT_LABELS[item.slot] || item.slot}` : '소비 아이템'}</Text>
                  {item.statBonus && (
                    <Text style={styles.invItemBonus}>
                      {Object.entries(item.statBonus).map(([k, v]) => `${STAT_LABELS[k]} +${v}`).join(' · ')}
                    </Text>
                  )}
                </View>
                {item.type === 'equipment' && (
                  <TouchableOpacity style={styles.equipBtn} onPress={() => handleEquip(item)}>
                    <Text style={styles.equipBtnText}>착용</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'skills' && (
          <View>
            <Text style={styles.sectionTitle}>스킬 목록</Text>
            {(player.skills || []).map(skill => (
              <View key={skill.id} style={styles.skillCard}>
                <Text style={styles.skillName}>{skill.name}</Text>
                <View style={styles.skillMeta}>
                  <Text style={styles.skillTag}>💙 MP {skill.mpCost}</Text>
                  <Text style={styles.skillTag}>⚡ 배율 {skill.multiplier}x</Text>
                  {skill.hits && <Text style={styles.skillTag}>🔄 {skill.hits}회 공격</Text>}
                  <Text style={styles.skillTag}>{skill.type}</Text>
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
    flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16,
    backgroundColor: '#1a0a2e', borderBottomWidth: 1, borderBottomColor: '#2a1a4e',
  },
  charEmoji: { fontSize: 48 },
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
  statLabel: { color: '#9a7aba', width: 50, fontSize: 13 },
  statBarBg: { flex: 1, height: 8, backgroundColor: '#1a0a2e', borderRadius: 4, overflow: 'hidden', marginHorizontal: 10 },
  statBarFill: { height: '100%', backgroundColor: '#9b59b6', borderRadius: 4 },
  statValue: { color: '#e0d0ff', width: 40, textAlign: 'right', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#2a1a4e', marginVertical: 16 },
  expRow: { flexDirection: 'row', alignItems: 'center' },
  expLabel: { color: '#9a7aba', width: 50, fontSize: 13 },
  expBarBg: { flex: 1, height: 10, backgroundColor: '#1a0a2e', borderRadius: 5, overflow: 'hidden', marginHorizontal: 10 },
  expBarFill: { height: '100%', backgroundColor: '#8e44ad', borderRadius: 5 },
  expValue: { color: '#e0d0ff', fontSize: 12, width: 80, textAlign: 'right' },
  equipSlot: {
    backgroundColor: '#1a0a2e', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#2a1a4e',
  },
  equipSlotLabel: { color: '#9a7aba', fontSize: 13, marginBottom: 6 },
  equipItem: {},
  equipItemName: { color: '#ffd700', fontWeight: 'bold' },
  equipItemBonus: { color: '#2ecc71', fontSize: 12, marginTop: 2 },
  equipEmpty: { color: '#3a2a5a', fontStyle: 'italic' },
  invItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a0a2e',
    borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2a1a4e',
  },
  invItemInfo: { flex: 1 },
  invItemName: { color: '#e0c0ff', fontWeight: 'bold', fontSize: 15 },
  invItemType: { color: '#7a5a9a', fontSize: 12, marginTop: 2 },
  invItemBonus: { color: '#2ecc71', fontSize: 12, marginTop: 2 },
  equipBtn: { backgroundColor: '#4a2a7e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  equipBtnText: { color: '#c0a0ff', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#3a2a5a', textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
  skillCard: {
    backgroundColor: '#1a0a2e', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#3a1a5e',
  },
  skillName: { color: '#c0a0ff', fontWeight: 'bold', fontSize: 16, marginBottom: 8 },
  skillMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: {
    backgroundColor: '#2a1a4e', borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, color: '#9a7aba', fontSize: 11,
  },
});
