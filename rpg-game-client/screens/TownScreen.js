import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useGame } from '../context/GameContext';

const DUNGEONS = [
  { id: 'beginner_cave', name: '초보자의 동굴', emoji: '🦇', minLevel: 1,  difficulty: '쉬움', color: '#2ecc71' },
  { id: 'cursed_forest', name: '저주받은 숲',   emoji: '🌲', minLevel: 5,  difficulty: '보통', color: '#f39c12' },
  { id: 'dragon_lair',   name: '드래곤의 소굴', emoji: '🐉', minLevel: 20, difficulty: '어려움', color: '#e74c3c' },
];

export default function TownScreen({ navigation }) {
  const { player, chatMessages, sendChat, enterDungeon, notifications } = useGame();
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState('dungeon'); // dungeon | chat

  const handleEnterDungeon = (dungeon) => {
    if (!player) return;
    if (player.level < dungeon.minLevel) {
      return Alert.alert('레벨 부족', `이 던전은 Lv.${dungeon.minLevel} 이상 입장 가능합니다.`);
    }
    Alert.alert(
      dungeon.name,
      `난이도: ${dungeon.difficulty}\n입장하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '입장', onPress: () => { enterDungeon(dungeon.id); navigation.navigate('Dungeon'); } }
      ]
    );
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput('');
  };

  if (!player) return null;

  const expPercent = Math.floor((player.exp / player.expToNext) * 100);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 플레이어 상태 바 */}
      <View style={styles.playerBar}>
        <View>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerClass}>{player.characterClass.toUpperCase()} · Lv.{player.level}</Text>
        </View>
        <View style={styles.playerStats}>
          <Text style={styles.statHp}>❤️ {player.currentHp}/{player.stats.hp}</Text>
          <Text style={styles.statMp}>💙 {player.currentMp}/{player.stats.mp}</Text>
          <Text style={styles.statGold}>💰 {player.gold}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Character')} style={styles.charBtn}>
          <Text style={styles.charBtnText}>👤</Text>
        </TouchableOpacity>
      </View>

      {/* EXP 바 */}
      <View style={styles.expBarBg}>
        <View style={[styles.expBarFill, { width: `${expPercent}%` }]} />
        <Text style={styles.expText}>EXP {player.exp}/{player.expToNext}</Text>
      </View>

      {/* 알림 */}
      {notifications.map(n => (
        <View key={n.id} style={[styles.notification, styles[`notif_${n.type}`] || styles.notif_info]}>
          <Text style={styles.notificationText}>{n.message}</Text>
        </View>
      ))}

      {/* 탭 */}
      <View style={styles.tabs}>
        {['dungeon', 'chat'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'dungeon' ? '⚔️ 던전' : '💬 채팅'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'dungeon' ? (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>🗺️ 던전 선택</Text>
          {DUNGEONS.map(dungeon => {
            const locked = player.level < dungeon.minLevel;
            return (
              <TouchableOpacity
                key={dungeon.id}
                style={[styles.dungeonCard, locked && styles.dungeonCardLocked]}
                onPress={() => handleEnterDungeon(dungeon)}
                disabled={locked}
              >
                <Text style={styles.dungeonEmoji}>{dungeon.emoji}</Text>
                <View style={styles.dungeonInfo}>
                  <Text style={styles.dungeonName}>{dungeon.name}</Text>
                  <Text style={styles.dungeonMeta}>최소 레벨: {dungeon.minLevel}</Text>
                </View>
                <View style={[styles.diffBadge, { backgroundColor: dungeon.color + '33', borderColor: dungeon.color }]}>
                  <Text style={[styles.diffText, { color: dungeon.color }]}>{dungeon.difficulty}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.chatContainer}>
          <ScrollView style={styles.chatMessages} contentContainerStyle={{ paddingBottom: 8 }}>
            {chatMessages.length === 0 && <Text style={styles.chatEmpty}>채팅이 없습니다.</Text>}
            {chatMessages.map((msg, i) => (
              <View key={i} style={styles.chatBubble}>
                <Text style={styles.chatName}>{msg.name}</Text>
                <Text style={styles.chatMsg}>{msg.message}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="메시지 입력..."
              placeholderTextColor="#5a4a6a"
              onSubmitEditing={handleSendChat}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
              <Text style={styles.sendBtnText}>전송</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0618' },
  playerBar: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#1a0a2e', borderBottomWidth: 1, borderBottomColor: '#2a1a4e',
  },
  playerName: { color: '#ffd700', fontWeight: 'bold', fontSize: 16 },
  playerClass: { color: '#a070d0', fontSize: 12 },
  playerStats: { flex: 1, paddingHorizontal: 12 },
  statHp: { color: '#e74c3c', fontSize: 12 },
  statMp: { color: '#3498db', fontSize: 12 },
  statGold: { color: '#f1c40f', fontSize: 12 },
  charBtn: { backgroundColor: '#2a1a4e', padding: 10, borderRadius: 8 },
  charBtnText: { fontSize: 20 },
  expBarBg: { height: 18, backgroundColor: '#1a0a2e', position: 'relative' },
  expBarFill: { position: 'absolute', height: '100%', backgroundColor: '#9b59b6', opacity: 0.7 },
  expText: { position: 'absolute', width: '100%', textAlign: 'center', color: '#e0c0ff', fontSize: 11, lineHeight: 18 },
  notification: { margin: 8, marginBottom: 0, padding: 10, borderRadius: 8, borderLeftWidth: 4 },
  notif_info: { backgroundColor: '#1a2a4e', borderLeftColor: '#3498db' },
  notif_success: { backgroundColor: '#0a2a1a', borderLeftColor: '#2ecc71' },
  notif_error: { backgroundColor: '#2a0a0a', borderLeftColor: '#e74c3c' },
  notif_levelup: { backgroundColor: '#2a1a0a', borderLeftColor: '#ffd700' },
  notif_boss: { backgroundColor: '#2a0a0a', borderLeftColor: '#e74c3c' },
  notificationText: { color: '#fff', fontSize: 13 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a1a4e' },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#ffd700' },
  tabText: { color: '#7a5a9a', fontWeight: 'bold' },
  tabTextActive: { color: '#ffd700' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { color: '#c0a0e0', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  dungeonCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a0a2e',
    borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2a1a4e',
  },
  dungeonCardLocked: { opacity: 0.4 },
  dungeonEmoji: { fontSize: 36, marginRight: 14 },
  dungeonInfo: { flex: 1 },
  dungeonName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  dungeonMeta: { color: '#7a5a9a', fontSize: 12, marginTop: 2 },
  diffBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  diffText: { fontWeight: 'bold', fontSize: 12 },
  chatContainer: { flex: 1 },
  chatMessages: { flex: 1, padding: 12 },
  chatEmpty: { color: '#5a4a6a', textAlign: 'center', marginTop: 40 },
  chatBubble: { backgroundColor: '#1a0a2e', borderRadius: 8, padding: 10, marginBottom: 8 },
  chatName: { color: '#a070d0', fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
  chatMsg: { color: '#e0d0f0', fontSize: 14 },
  chatInputRow: {
    flexDirection: 'row', padding: 12, gap: 8,
    borderTopWidth: 1, borderTopColor: '#2a1a4e',
  },
  chatInput: {
    flex: 1, backgroundColor: '#1a0a2e', borderRadius: 8,
    paddingHorizontal: 14, color: '#fff', borderWidth: 1, borderColor: '#3a2a5e',
  },
  sendBtn: { backgroundColor: '#ffd700', borderRadius: 8, padding: 12 },
  sendBtnText: { color: '#1a0a2e', fontWeight: 'bold' },
});
