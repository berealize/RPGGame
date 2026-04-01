import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useGame } from '../context/GameContext';

const CLASSES = [
  { id: 'warrior', label: '전사', icon: '전', desc: '높은 체력과 방어력을 가진 근접형입니다.', color: '#e74c3c' },
  { id: 'mage', label: '마법사', icon: '마', desc: '강력한 마법 피해를 주는 원거리형입니다.', color: '#9b59b6' },
  { id: 'archer', label: '궁수', icon: '궁', desc: '빠른 연속 공격에 특화된 클래스입니다.', color: '#27ae60' },
  { id: 'paladin', label: '성기사', icon: '성', desc: '공수 균형이 좋은 탱커형 클래스입니다.', color: '#f39c12' },
];

export default function LoginScreen({ navigation }) {
  const { register, login, connected, connectionState, reconnectAttempts, authLoading, player } = useGame();
  const [mode, setMode] = useState('login');
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState('warrior');

  useEffect(() => {
    if (player) {
      navigation.replace('Town');
    }
  }, [navigation, player]);

  const handleLogin = () => {
    if (!connected || !accountName.trim() || !password.trim()) {
      return;
    }

    if (mode === 'create') {
      if (!name.trim()) {
        return;
      }

      register(accountName.trim(), password, name.trim(), selectedClass);
      return;
    }

    login(accountName.trim(), password);
  };

  const statusLabel = {
    connected: '서버 연결됨',
    connecting: '연결 중...',
    reconnecting: `재연결 중${reconnectAttempts > 0 ? ` (${reconnectAttempts})` : '...'}`,
    disconnected: '연결 끊김',
  }[connectionState] || '연결 중...';

  return (
    <View style={styles.container}>
      <View style={styles.titleBox}>
        <Text style={styles.titleMain}>레전드의 영역</Text>
        <Text style={styles.titleSub}>멀티플레이 던전 RPG</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>
              로그인
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'create' && styles.modeTabActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.modeTabText, mode === 'create' && styles.modeTabTextActive]}>
              계정 생성
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>계정 ID</Text>
        <TextInput
          style={styles.input}
          placeholder="계정 ID를 입력하세요"
          placeholderTextColor="#5a4a6a"
          value={accountName}
          onChangeText={setAccountName}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호를 입력하세요"
          placeholderTextColor="#5a4a6a"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {mode === 'create' && (
          <>
            <Text style={styles.label}>캐릭터 이름</Text>
            <TextInput
              style={styles.input}
              placeholder="캐릭터 이름을 입력하세요"
              placeholderTextColor="#5a4a6a"
              value={name}
              onChangeText={setName}
              maxLength={12}
              autoCapitalize="none"
            />

            <Text style={styles.label}>직업</Text>
            <View style={styles.classGrid}>
              {CLASSES.map((cls) => (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.classCard,
                    selectedClass === cls.id && {
                      ...styles.classCardSelected,
                      borderColor: cls.color,
                    },
                  ]}
                  onPress={() => setSelectedClass(cls.id)}
                >
                  <Text style={styles.classEmoji}>{cls.icon}</Text>
                  <Text style={[styles.className, selectedClass === cls.id && { color: cls.color }]}>
                    {cls.label}
                  </Text>
                  <Text style={styles.classDesc}>{cls.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.startBtn, (!connected || authLoading) && styles.startBtnDisabled]}
          onPress={handleLogin}
          disabled={!connected || authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color="#1a0a2e" />
          ) : (
            <Text style={styles.startBtnText}>
              {mode === 'create' ? '계정 생성' : '로그인'}
            </Text>
          )}
        </TouchableOpacity>

        <View
          style={[
            styles.statusDot,
            { backgroundColor: connected ? '#2ecc71' : connectionState === 'reconnecting' ? '#f39c12' : '#e74c3c' },
          ]}
        >
          <Text style={styles.statusText}>{statusLabel}</Text>
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
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#130a22',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  modeTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#2a1a4e' },
  modeTabText: { color: '#7a5a9a', fontWeight: 'bold' },
  modeTabTextActive: { color: '#ffd700' },
  label: { color: '#c0a0e0', fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#1a0a2e',
    borderWidth: 1,
    borderColor: '#4a2a6a',
    borderRadius: 8,
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  classCard: {
    width: '47%',
    backgroundColor: '#1a0a2e',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2a1a3e',
    padding: 14,
    alignItems: 'center',
  },
  classCardSelected: { borderWidth: 2, backgroundColor: '#2a0a3e' },
  classEmoji: { fontSize: 32, marginBottom: 6, color: '#ffffff' },
  className: { color: '#e0c0ff', fontWeight: 'bold', fontSize: 16 },
  classDesc: { color: '#7a5a9a', fontSize: 11, textAlign: 'center', marginTop: 4 },
  startBtn: {
    backgroundColor: '#ffd700',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#ffd700',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: '#1a0a2e', fontWeight: 'bold', fontSize: 18 },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 8,
    paddingHorizontal: 14,
    alignSelf: 'center',
    marginTop: 16,
  },
  statusText: { color: '#fff', fontSize: 12, marginLeft: 6 },
});
