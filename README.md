# GameCore (`ryuis-gamecore`)

> **Headless, Deterministic, Universal Game Engine & State Framework**  
> 특정 실행 환경(Web Canvas, React, Node.js 서버, React Native, Godot/Wasm 브릿지 등)에 구애받지 않고 **게임의 상태, 수치 연산, 룰 검증, 시뮬레이션 및 연출 프로토콜**을 완벽히 캡슐화하는 범용 0-Dependency 게임 코어 엔진입니다.

[![npm version](https://img.shields.io/npm/v/ryuis-gamecore.svg)](https://www.npmjs.com/package/ryuis-gamecore)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![0-Dependency](https://img.shields.io/badge/Dependencies-0-green)](package.json)

---

## 🏛 아키텍처 다이어그램

```
┌────────────────────────────────────────────────────────────────────────┐
│                   External Game Project (Consumer)                     │
│  - items.json, skills.json, blueprints.json (마스터 데이터 주입)         │
│  - Custom Components & Systems (게임별 고유 룰/컨텐츠 구현)               │
│  - Interface Layer (React 19, Pixi.js, Three.js, Canvas, Godot, Wasm)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Data Injection & Plugins
┌───────────────────────────────────▼────────────────────────────────────┐
│                        ryuis-gamecore (Engine v1.0)                    │
│                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   GameWorldManager      │  │   SeededRandom (PCG32 PRNG)         │  │
│  │   (Facade Orchestrator) │  │   결정론적 난수 & 리플레이 검증 지원   │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────────────────────────▼──────────────────┐  │
│  │  World (ECS Core) & EventBus                                     │  │
│  │  - Blackboard (전역 상태 & 시나리오 플래그 저장소)                │  │
│  │  - TimerScheduler (시간 ms & 턴 단위 지연/반복 스케줄러)         │  │
│  │  - Reactive Component Events (`ecs:component:updated/removed`)   │  │
│  │  - `world.batchUpdates(fn)` (대량 연산 지연 및 Deduplication)    │  │
│  │  - Zero-dependency `subscribe()` Observer (React 19 훅 바인딩)   │  │
│  └────────────┬──────────────────────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────┐    ┌──────────────▼──────────────────┐  │
│  │  Pipelines & Systems      │    │  Spatial, Quests & Presentation │  │
│  │  - Custom Stat Pipeline   │    │  - SpatialHashGrid (2D 연속 공간)│  │
│  │  - Pluggable Combat Pipe  │    │  - FSM (유한 상태 머신 시스템)  │  │
│  │  - Precision Rounding     │    │  - QuestSystem (퀘스트/업적)    │  │
│  │  - High-Level Skill Pipe  │    │  - CueProtocol (SFX/VFX 큐)     │  │
│  │  - Status & Equipment     │    │  - SaveManager (HMAC-SHA256     │  │
│  │  - Turn Queue & Grid Move │    │    변조 방지 & 버전 마이그레이션) │  │
│  └───────────────────────────┘    └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ v1.0.0 핵심 모듈 일람

| 모듈 | 핵심 클래스 및 유틸 | 상세 설명 |
|------|-------------------|-----------|
| **1) 전역 블랙보드** | `Blackboard`, `World.blackboard` | 엔티티에 종속되지 않는 전역 상태(스테이지, 날씨, 챕터 플래그) 관리. `increment`, `toggle`, 변경 감지 옵저버 및 세이브 일괄 직렬화. |
| **2) 타이머 스케줄러** | `TimerScheduler`, `world.schedule`, `world.scheduleEvery`, `world.scheduleTurns` | 실시간(ms) 및 턴(turn) 기반 지연/반복 스케줄러. World update 틱과 일원화되어 프레임/턴 단위 정밀 실행. |
| **3) 유한 상태 머신 (FSM)** | `FSMComponent`, `FSMSystem` | 엔티티 상태(Idle, Casting, Stunned, Dead 등) 전이 규칙 검증. `canMove`, `canCast`, `canAttack` 배타적 제어 및 지속시간 만료 시 자동 복귀. |
| **4) 2D 연속 공간 해시** | `SpatialHashGrid` | 실수 평면 `(x, y)` 상에서 대규모 엔티티의 반경 검색(`queryRadius`) 및 사각 영역 검색(`queryAABB`)을 O(1)로 수행. |
| **5) 퀘스트 & 업적 엔진** | `QuestsComponent`, `QuestSystem` | 몬스터 처치, 아이템 수집, 전역 플래그 달성 등 이벤트 기반 자동 집계, 자동 완료(`autoComplete`) 및 보상 지급(`autoReward`). |
| **6) 연출 큐 프로토콜** | `CueProtocol`, `CueQueue`, `createCue` | 게임 로직과 렌더러/오디오 엔진(Pixi, Phaser, Howler, Godot 등) 간의 SFX, VFX, 화면 흔들림(shake), 플래시 규격화 연동. |
| **7) 결정론적 PRNG 엔진** | `SeededRandom`, `GameWorldManager` | PCG32 알고리즘 기반. 시드 주입(`number \| string`), 전투/회피/크리티컬 판정 재현, 상태 직렬화(`exportState/importState`). |
| **8) 수치 정밀도 라운딩** | `CombatRoundingConfig`, `applyRounding` | 부동소수점 오차(`14.799999999999999`) 원천 차단. `round`, `floor`, `ceil`, `raw` 모드 및 소수점 자리수 제어. |
| **9) 세이브 무결성 & 마이그레이션** | `SaveManager`, `sha256`, `hmacSha256` | 0-Dependency 순수 TS HMAC-SHA256 전자 서명 체크섬. 변조 감지 시 복원 차단. 스키마 버전 마이그레이션 파이프라인. |
| **10) 반응형 ECS 이벤트 & 배치** | `World.batchUpdates()`, `Entity.notifyUpdated()` | 컴포넌트 추가/수정/삭제 시 `ecs:component:updated`, `ecs:component:removed` 자동 발행. 배치 연산 시 중복 제거 후 1회 발행. |
| **11) 전략형 전투 & 스탯 파이프라인** | `CombatPipeline`, `StatPipeline`, `BarrierComponent` | 4단계 전투 훅(onPreHit ➔ onDamageCalculate ➔ onShieldAbsorb ➔ onPostHit), 실드 흡수, DAG 의존 수식 스탯 파이프라인. |
| **12) React 19 바인딩** | `ryuis-gamecore/react` | React 19 `useSyncExternalStore` 기반 무누수, 무티어링 렌더링 훅 (`useEntity`, `useComponent`, `useWorldEntities`). |

---

## 🚀 빠른 시작 (Quick Start)

### 1. 패키지 설치
```bash
npm install ryuis-gamecore
# 또는
pnpm add ryuis-gamecore
```

### 2. GameWorldManager를 통한 1줄 부트스트랩
```ts
import { GameWorldManager, StatsComponent, FSMComponent, QuestsComponent } from 'ryuis-gamecore';

// 시드 기반 결정론적 게임 월드 생성 (전투, 스킬, 퀘스트, FSM 시스템 자동 등록)
const manager = new GameWorldManager({
  seed: 'dungeon-run-seed-1234',
  rounding: { mode: 'round', decimals: 0 },
});

// 전역 플래그 설정
manager.world.blackboard.set('chapter', 1);
manager.world.blackboard.set('difficulty', 'heroic');

// 지연 작업 스케줄링 (3000ms 후 또는 5턴 후)
manager.world.schedule(3000, () => {
  console.log('3초 경과 이벤트 발동!');
});

// 플레이어 엔티티 생성
const player = manager.world.createEntity('player');
player.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 35, defense: 10 }));
player.add(new FSMComponent({
  initialState: 'idle',
  states: {
    idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['casting'] },
    casting: { canMove: false, duration: 1500, autoTransitionTo: 'idle' },
  },
}));

// 게임 루프 틱 실행 (FSM 및 타이머 스케줄러 자동 갱신)
manager.update(16); // 16ms 틱
```

---

## 🌟 v1.1.0 신규 업데이트 및 개선점

### 1. 세이브 데이터 PRNG 상태 선택적 직렬화 (`includePrngState`)
완전한 난수 시뮬레이션 재현이 필요한 경우 세이브 파일에 PCG32 내부 상태(`state`, `inc`)를 저장하고, 기존 세이브와의 호환성을 유지하거나 파일 용량을 아끼려는 경우 생략할 수 있습니다.
```ts
// PRNG 상태를 포함하여 직렬화 (완전 재현)
const saveJson = manager.save({ includePrngState: true });

// 복원 시 자동으로 난수 상태까지 완벽 복원
const newManager = new GameWorldManager();
newManager.load(saveJson);
```

### 2. 증분 dirty 쿼리 캐싱 & 기존 전체 스캔 선택 모드 (`queryCacheMode`)
매 프레임 엔티티 목록을 풀스캔하던 방식에서, 컴포넌트 추가/제거 시에만 캐시를 dirty 처리하는 고성능 증분 캐싱을 기본 탑재했습니다. 기존 전체 스캔 동작을 원할 경우 `always` 모드로 지정할 수 있습니다.
```ts
// 기본값: 컴포넌트 변경 시에만 재계산 ('auto')
world.queryCacheMode = 'auto';

// 기존 호환 모드: 매 틱 전체 재계산 ('always')
world.queryCacheMode = 'always';

// 수동 캐시 무효화가 필요한 경우 언제든 호출 가능
world.invalidateCache();
```

### 3. PositionComponent ↔ SpatialHashGrid 자동 동기화 시스템 (`SpatialGridSystem`)
엔티티의 `PositionComponent` 좌표가 이동할 때마다 수동으로 공간 해시를 업데이트할 필요 없이, 시스템 틱마다 위치 변경을 감지하여 자동으로 그리드를 동기화합니다.
```ts
import { SpatialGridSystem, PositionComponent } from 'ryuis-gamecore';

const spatialSys = new SpatialGridSystem();
world.addSystem(spatialSys);

const mob = world.createEntity();
mob.add(new PositionComponent(10, 20));

world.update(16);

// 반경 검색 (SpatialHashGrid 직접 래핑)
const nearby = spatialSys.queryRadius(10, 20, 15);
```

### 4. 게임 루프 시간 배속 및 일시정지 제어 (`timeScale`, `isPaused`)
월드 단위로 시간 배속(슬로우 모션, 2배속 등) 및 일시정지/재개를 즉시 제어할 수 있습니다.
```ts
world.timeScale = 2.0; // 2배속 재생
world.pause();         // 일시정지 (update 호출되어도 시스템 로직 정지)
world.resume();        // 재개
```

### 5. FSMComponent 상태 전이 리스너 & 이벤트 보장
`fsm.transitionTo(state)` 수동 호출 시에도 `worldBus.emit('fsm:state:changed')` 이벤트가 100% 자동 발행되며, 컴포넌트 단위 `onTransition` 리스너를 등록할 수 있습니다.
```ts
fsm.onTransition((from, to) => {
  console.log(`상태 전이: ${from} -> ${to}`);
});
```

### 6. StatsComponent ↔ ExtendedStatsComponent 어댑터 (`StatAdapter`)
경량 고정 스탯 컴포넌트와 4단계 연산 파이프라인 확장 스탯 간의 상호 변환 및 수치 동기화를 간편하게 지원합니다.
```ts
import { StatAdapter, StatsComponent } from 'ryuis-gamecore';

const basicStats = new StatsComponent({ hp: 100, maxHp: 100, attack: 20 });
const extended = StatAdapter.toExtended(basicStats);

// 4단계 파이프라인에서 버프 적용 후 다시 경량 스탯으로 동기화
extended.addModifier({ stat: 'attack', stage: 'amplification', value: 1.5, sourceId: 'buff' });
StatAdapter.syncToStats(extended, basicStats);
console.log(basicStats.attack); // 30
```

### 7. 2D 타일맵 A* 경로 탐색 (`GridPathfinder`, `map.findPath`)
장애물 회피, 대각선 이동(4/8방향), 지형 가중치 및 동적 유닛 장애물(`extraObstacles`)을 지원하는 A* 최단 경로 알고리즘을 내장했습니다.
```ts
import { GridMap } from 'ryuis-gamecore';

const map = GridMap.fromASCII([
  '.....',
  '.###.',
  '.....',
], {
  '.': { type: 'floor', walkable: true },
  '#': { type: 'wall', walkable: false },
});

// 벽을 우회하는 최단 경로 탐색
const result = map.findPath({ x: 0, y: 1 }, { x: 4, y: 1 });
console.log(result.found, result.path);
```

### 8. 인벤토리 고도화 (스택 분할, 자동 병합, 정렬, 무게 제한)
아이템별 `maxStack` 분할 슬롯 수용, `autoStack()` 병합, 무게 제한(`maxWeight`, `getCurrentWeight`), 다축 정렬(`sortBy`), 다른 인벤토리로의 전송(`transferTo`)을 완벽 지원합니다.
```ts
import { InventoryComponent } from 'ryuis-gamecore';

const inv = new InventoryComponent({ maxSlots: 30, maxWeight: 50.0 });
inv.add('potion', 20, { maxStack: 5 }); // 5개씩 4개 슬롯으로 분할 저장
inv.autoStack(); // 쪼개진 슬롯 자동 압축
inv.sortBy('rarity', 'desc', itemMetaLookup); // 희귀도 내림차순 정렬
```

### 9. 상태이상 Decay 중첩 & 원소 상호작용 엔진 (`StatusReactionRegistry`)
- `decay` 모드: 지속시간 만료 시 일괄 삭제 대신 1스택씩 감소하고 duration 리셋.
- 원소 반응 엔진: 두 상태이상(화염+기름, 물+얼음 등)이 만났을 때 보너스 데미지, 상태 소모, 신규 상태 전환을 자동 트리거.
```ts
import { StatusEffectSystem } from 'ryuis-gamecore';

statusSys.registerReaction({
  name: 'combustion',
  statuses: ['fire', 'oil'],
  bonusDamage: 50,
  consume: 'both',
});

// 1스택씩 차감되는 decay 상태이상 부여
statusSys.applyStatus(target, 'poison', 2000, casterId, 3, 3, {
  stackBehavior: 'decay',
});
```

### 10. 결정론적 전투 리플레이 녹화 & 재생기 (`ReplayRecorder`, `ReplayPlayer`)
PRNG 시드와 시간대별 플레이어 입력을 압축 기록하고, 재생 시 동일한 시퀀스로 재현되며 체크포인트 해시 대조로 디싱크(Desync) 발생 여부를 검증합니다.
```ts
import { ReplayRecorder, ReplayPlayer } from 'ryuis-gamecore';

// 녹화
const recorder = new ReplayRecorder('seed-1234');
recorder.recordAction(0, 'cast_skill', { skillId: 'slash' });
recorder.recordCheckpoint(1, 'state_hash_abc');
const replayJson = recorder.toJSON();

// 재생 및 결정론적 검증
const player = new ReplayPlayer(replayJson);
const result = player.playToEnd(
  (tick) => world.update(16),
  (action) => executeAction(action),
  () => calculateWorldHash(world)
);
console.log('재생 완료:', result.completed, '디싱크 여부:', result.desynced);
```

### 11. 오프라인 경과 시간 누적 & 수확 엔진 (`OfflineProgressEngine`)
방치형(Idle) 및 모바일 타이쿤 장르를 위한 오프라인 자원/스태미나 누적 및 스테이지 클리어 전리품 일괄 시뮬레이션 엔진입니다.
```ts
import { OfflineProgressEngine } from 'ryuis-gamecore';

const result = OfflineProgressEngine.calculate({
  lastTimestamp: lastSavedTime,
  maxOfflineSeconds: 12 * 3600, // 최대 12시간 상한선
  rates: { gold: 25, exp: 5 },
  stamina: { current: 20, max: 120, secondsPerPoint: 360 },
});
console.log('누적 골드:', result.accumulated.gold, '회복 스태미나:', result.stamina?.recovered);
```

### 12. 스토리 대화 트리 & 분기 선택지 엔진 (`DialogueSession`)
비주얼 노벨, 퀘스트 NPC 대화, 미연시/호감도 분기 선택지를 위한 노드 기반 대화 엔진입니다.
```ts
import { DialogueSession, Blackboard } from 'ryuis-gamecore';

const session = new DialogueSession(questDialogueTree, world.blackboard);
console.log(session.currentNode.speaker, session.currentNode.text);

// 선택지 선택
session.selectChoice('choice_accept_quest');
```

### 13. 2D 타일맵 시야(FOV) & 가시선(LOS) 판정 (`LineOfSight`, `FieldOfView`)
Bresenham 알고리즘 기반 사선 장애물 차단 검사 및 원형 반경 내 가시 타일(Fog of War)을 계산합니다.
```ts
import { GridMap } from 'ryuis-gamecore';

// 두 좌표 사이에 장애물이 없는지 검사
const canSee = map.hasLineOfSight(playerX, playerY, targetX, targetY);

// 시야 반경 내 보이는 타일 목록 계산
const visibleTiles = map.computeFOV(playerX, playerY, 6);
```

### 14. 몬스터/동료 AI 비헤이비어 트리 (`BehaviorTree`)
복합 판단(체력이 30% 이하이면 포션, 사거리 밖이면 이동, 사거리 내면 공격)을 선언적으로 구축할 수 있는 모듈형 BT 엔진입니다.
```ts
import { SelectorNode, SequenceNode, ConditionNode, ActionNode, BehaviorTreeRunner } from 'ryuis-gamecore';

const root = new SelectorNode([
  new SequenceNode([
    new ConditionNode((ctx) => ctx.hp < 30),
    new ActionNode((ctx) => useHealSkill(ctx)),
  ]),
  new ActionNode((ctx) => attackTarget(ctx)),
]);

const ai = new BehaviorTreeRunner(root, { hp: 20 });
ai.tick(); // 체력이 낮으므로 힐 스킬 발동
```

### 15. 수집형 가챠(소환) & 천장 시스템 (`GachaEngine`)
티어별 기본 확률, 소프트 천장(확률 점진 증가), 하드 천장(100% 확정), 픽업 및 픽뚫 후 확천 메커니즘을 지원합니다.
```ts
import { GachaEngine } from 'ryuis-gamecore';

const gacha = new GachaEngine([pickupPool]);
const result = gacha.pull('hero_pickup');
console.log(result.tier, result.itemId, result.isPickUp);

// 세이브/로드를 위한 Pity 상태 직렬화
const pityState = gacha.exportPityState();
```

### 16. 세이브 데이터 일원화 & 커스텀 메타데이터 (`SaveEnvelope.metadata`)
단일 세이브 파일 안에 가챠 천장 상태(`pityState`), 대화 진행 노드, 유저 커스텀 세이브 정보를 월드 상태와 함께 HMAC-SHA256 전자 서명에 포함하여 원스톱 저장/복원합니다.
```ts
import { SaveManager } from 'ryuis-gamecore';

// 세이브 시 부가 메타데이터 함께 패키징 및 암호 서명
const saveStr = SaveManager.serialize(world, 'secret-key', 1, {
  metadata: { gachaPity: 75, chapter: 3 },
});

// 복원 시 무결성 검증과 함께 메타데이터 추출
const result = SaveManager.deserialize(saveStr, newWorld, 'secret-key');
console.log(result.metadata.gachaPity); // 75
```

### 17. 멀티플레이 & 서버-클라이언트 델타 패치 (`WorldDiffer`)
매 프레임/매 틱 전체 월드를 전송하는 대신, 직전 스냅샷 대비 생성/수정/삭제된 엔티티 및 컴포넌트만 컴팩트하게 추출하고 클라이언트에 1줄로 동기화합니다.
```ts
import { WorldDiffer } from 'ryuis-gamecore';

const differ = new WorldDiffer();
differ.captureSnapshot(serverWorld);

// 변경 발생 후 델타 패킷 추출 (네트워크 전송)
const delta = differ.createDelta(serverWorld);

// 클라이언트 측에서 1줄로 즉시 패치 적용
differ.applyDelta(clientWorld, delta);
```

### 18. 엔티티 부모-자식 계층 구조 (`HierarchyComponent`, `HierarchySystem`)
소환수/펫, 탈것(Mount), 멀티파트 보스(본체-날개-팔)를 위한 상대 오프셋 좌표 추종 및 종속 삭제(`cascadeDestroy`)를 지원합니다.
```ts
import { HierarchyComponent, HierarchySystem, PositionComponent } from 'ryuis-gamecore';

world.addSystem(new HierarchySystem());

// 부모(주인)
const hero = world.createEntity();
hero.add(new PositionComponent(10, 20));

// 자식(소환수/펫): 오프셋 (+2, -3)
const pet = world.createEntity();
pet.add(new PositionComponent(0, 0));
pet.add(new HierarchyComponent({ parentId: hero.id, offsetX: 2, offsetY: -3 }));

world.update(16); // pet 좌표가 (12, 17)로 자동 동기화
```

---

## 📄 라이선스
ISC License © ISA (류윤종)



