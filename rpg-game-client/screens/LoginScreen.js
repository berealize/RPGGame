import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ImageBackground, Animated, ActivityIndicator,
} from 'react-native';
import { useGame } from '../context/GameContext';

const CLASSES = [
  { id: 'warrior', label: '전사', emoji: '⚔️', desc: '강인한 체력과 방어력', color: '#e74c3c' },
  { id: 'mage',    label: '마법사', emoji: '🔮', desc: '강력한 마법 공격력', color: '#9b59b6' },
  { id: 'archer',  label: '궁수', emoji: '🏹', desc: '빠른 속도와 원거리 공격', color: '#27ae60' },
  { id: 'paladin', label: '성기사', emoji: '🛡️', desc: '균형잡힌 능력과 성스러운 힘', color: '#f39c12' },
];

export default function LoginScreen({ navigation }) {
  const { login, connected } = useGame();
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    if (!name.trim()) return alert('캐릭터 이름을 입력해주세요.');
    if (!connected) return alert('서버에 연결 중입니다...');
    setLoading(true);
    login(name.trim(), selectedClass);
    setTimeout(() => {
      setLoading(false);
      navigation.replace('Town');
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleBox}>
        <Text style={styles.titleMain}>⚔️ REALM OF LEGENDS</Text>
        <Text style={styles.titleSub}>전설의 왕국</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>캐릭터 이름</Text>
        <TextInput
          style={styles.input}
          placeholder="이름을 입력하세요"
          placeholderTextColor="#5a4a6a"
          value={name}
          onChangeText={setName}
          maxLength={12}
        />

        <Text style={styles.label}>직업 선택</Text>
        <View style={styles.classGrid}>
          {CLASSES.map(cls => (
            <TouchableOpacity
              key={cls.id}
              style={[styles.classCard, selectedClass === cls.id && { ...styles.classCardSelected, borderColor: cls.color }]}
              onPress={() => setSelectedClass(cls.id)}
            >
              <Text style={styles.classEmoji}>{cls.emoji}</Text>
              <Text style={[styles.className, selectedClass === cls.id && { color: cls.color }]}>{cls.label}</Text>
              <Text style={styles.classDesc}>{cls.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.startBtn, loading && styles.startBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#1a0a2e" />
            : <Text style={styles.startBtnText}>⚔️ 모험 시작</Text>
          }
        </TouchableOpacity>

        <View style={[styles.statusDot, { backgroundColor: connected ? '#2ecc71' : '#e74c3c' }]}>
          <Text style={styles.statusText}>{connected ? '서버 연결됨' : '연결 중...'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0618' },
  titleBox: { alignItems: 'center', paddingTop: 80, paddingBottom: 30 },
  titleMain: { fontSize: 28, fontWeight: 'bold', color: '#ffd700', letterSpacing: 2 },
  titleSub: { fontSize: 16, color: '#a070d0', marginTop: 4 },
  form: { padding: 24 },
  label: { color: '#c0a0e0', fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#1a0a2e', borderWidth: 1, borderColor: '#4a2a6a',
    borderRadius: 8, padding: 14, color: '#fff', fontSize: 16,
  },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  classCard: {
    width: '47%', backgroundColor: '#1a0a2e', borderRadius: 12,
    borderWidth: 2, borderColor: '#2a1a3e', padding: 14, alignItems: 'center',
  },
  classCardSelected: { borderWidth: 2, backgroundColor: '#2a0a3e' },
  classEmoji: { fontSize: 32, marginBottom: 6 },
  className: { color: '#e0c0ff', fontWeight: 'bold', fontSize: 16 },
  classDesc: { color: '#7a5a9a', fontSize: 11, textAlign: 'center', marginTop: 4 },
  startBtn: {
    backgroundColor: '#ffd700', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 32, shadowColor: '#ffd700', shadowOpacity: 0.5, shadowRadius: 12,
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: '#1a0a2e', fontWeight: 'bold', fontSize: 18 },
  statusDot: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 8, paddingHorizontal: 14, alignSelf: 'center', marginTop: 16 },
  statusText: { color: '#fff', fontSize: 12, marginLeft: 6 },
});
