# ⚔️ RPG 게임 - 서버 & 모바일 클라이언트

멀티플레이어 RPG 게임의 완전한 소스코드입니다.

---

## 📁 프로젝트 구조

```
rpg-game-server/          # Node.js + Socket.io 게임 서버
├── server.js             # 메인 서버 진입점
├── package.json
└── managers/
    ├── PlayerManager.js  # 플레이어 연결, 상태, 스킬 관리
    └── GameManager.js    # 던전, 몬스터, 전투, 보상 관리

rpg-game-client/          # React Native 모바일 클라이언트
├── App.js                # 내비게이션 루트
├── package.json
├── context/
│   └── GameContext.js    # Socket.io 연결 및 전역 상태
└── screens/
    ├── LoginScreen.js    # 캐릭터 생성 화면
    ├── TownScreen.js     # 마을 (던전 선택, 채팅)
    ├── DungeonScreen.js  # 전투 화면
    └── CharacterScreen.js # 캐릭터 정보 (능력치/장비/인벤)
```

---

## 🚀 빠른 시작

### 서버 실행
```bash
cd rpg-game-server
npm install
npm run dev       # 개발 모드 (nodemon)
# 또는
npm start         # 프로덕션
```
서버 기본 포트: **3000**

### 클라이언트 실행
```bash
cd rpg-game-client
npm install

# GameContext.js 에서 서버 주소 수정
# const SERVER_URL = 'http://내서버IP:3000';

npx expo start    # QR코드로 Expo Go 앱에서 실행
```

### 클라이언트 배포
```bash
eas build --platform android --profile preview
```

---

## 🎮 게임 기능

### 직업 시스템
| 직업 | 특징 |
|------|------|
| ⚔️ 전사 | 높은 HP/방어력, 근접 전투 |
| 🔮 마법사 | 높은 마법 공격력, 낮은 방어 |
| 🏹 궁수 | 빠른 속도, 연속 공격 |
| 🛡️ 성기사 | 균형 능력, 신성 스킬 |

### 던전 시스템
- **초보자의 동굴** (Lv.1+): 슬라임, 고블린 / 보스: 오크
- **저주받은 숲** (Lv.5+): 고블린, 해골 전사 / 보스: 드래곤
- **드래곤의 소굴** (Lv.20+): 오크, 해골 전사 / 보스: 드래곤

### 전투 시스템
- 웨이브 기반 전투 (3웨이브 클리어 후 보스 등장)
- 스킬별 MP 소비, 배율 데미지
- 몬스터 AI (3초마다 랜덤 플레이어 공격)
- 사망 시 5초 후 자동 부활

### 보상 시스템
- EXP / 골드 획득
- 30% 확률 아이템 드롭
- 레벨업 자동 감지 및 능력치 상승

### 멀티플레이어
- 던전 최대 4~6명 파티 플레이
- 실시간 전투 로그 공유
- 전체 채팅 및 파티 채팅

---

## 🔌 Socket.io 이벤트

### 클라이언트 → 서버
| 이벤트 | 데이터 |
|--------|--------|
| `player:login` | `{ name, characterClass }` |
| `player:move` | `{ x, y, map }` |
| `player:attack` | `{ targetId }` |
| `player:useSkill` | `{ skillId, targetId }` |
| `player:equipItem` | `{ itemId }` |
| `dungeon:enter` | `{ dungeonId }` |
| `dungeon:leave` | - |
| `chat:send` | `{ message }` |

### 서버 → 클라이언트
| 이벤트 | 설명 |
|--------|------|
| `player:loginSuccess` | 로그인 성공, 플레이어 데이터 |
| `player:levelUp` | 레벨업 정보 |
| `combat:attackResult` | 공격 결과 |
| `combat:monsterAttack` | 몬스터 공격 |
| `dungeon:monstersSpawned` | 웨이브 시작 |
| `dungeon:bossSpawned` | 보스 등장 |
| `chat:message` | 채팅 수신 |

---

## 🛠️ 확장 아이디어
- MongoDB/Redis 연동으로 데이터 영속화
- JWT 기반 인증 시스템
- 상점 시스템 (골드로 아이템 구매)
- PvP 아레나
- 길드 시스템
- 랭킹 시스템 (GET /leaderboard 이미 구현)
