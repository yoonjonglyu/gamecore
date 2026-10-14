# GameCore (`ryuis-gamecore`)

> **Headless, Deterministic, Universal Game Engine & State Framework**  
> 특정 실행 환경(Web Canvas, React, Node.js 서버, React Native, Godot/Wasm 브릿지 등)에 구애받지 않고 **게임의 상태, 수치 연산, 룰 검증, 시뮬레이션 및 연출 프로토콜**을 완벽히 캡슐화하는 범용 0-Dependency 게임 코어 엔진입니다.

[![npm version](https://img.shields.io/npm/v/ryuis-gamecore.svg)](https://www.npmjs.com/package/ryuis-gamecore)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![0-Dependency](https://img.shields.io/badge/Dependencies-0-green)](package.json)
[![CI Status](https://github.com/yoonjonglyu/gamecore/actions/workflows/ci.yml/badge.svg)](https://github.com/yoonjonglyu/gamecore/actions)

[English Documentation](./README.md) | [한국어 문서](./README.ko.md)

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
│                        ryuis-gamecore (Engine v1.1)                    │
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
│  │  Pipelines & Systems      │    │  Spatial, AI, Quests & Gameplay │  │
│  │  - Custom Stat Pipeline   │    │  - SpatialHashGrid (2D 연속 공간)│  │
│  │  - Pluggable Combat Pipe  │    │  - FSM (유한 상태 머신 시스템)  │  │
│  │  - Precision Rounding     │    │  - QuestSystem (퀘스트/업적)    │  │
│  │  - High-Level Skill Pipe  │    │  - CueProtocol (SFX/VFX 큐)     │  │
│  │  - Status & Equipment     │    │  - SaveManager (HMAC-SHA256)    │  │
│  │  - Turn Queue & Grid Move │    │  - WorldDiffer (델타 동기화)    │  │
│  │  - HierarchySystem (부모자식)  │  - BehaviorTree & GachaEngine   │  │
│  └───────────────────────────┘    └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ v1.1.0 핵심 모듈 일람

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
| **13) 델타 동기화 엔진** | `WorldDiffer` | 이전 스냅샷과 비교하여 변경된 엔티티/컴포넌트만 경량 패치로 추출 및 1줄 동기화. 멀티플레이어 / 관전 모드 지원. |
| **14) 엔티티 계층 구조** | `HierarchyComponent`, `HierarchySystem` | 펫/소환수, 탈것, 멀티파트 보스의 상대 오프셋 좌표 자동 추종 및 연쇄 삭제(`cascadeDestroy`). |
| **15) 방치형 / 대화 / FOV / BT / 가챠** | `OfflineProgressEngine`, `DialogueSession`, `FieldOfView`, `BehaviorTree`, `GachaEngine` | 오프라인 누적 보상, 분기 대화, 타일맵 가시선/시야각, 복합 AI 판단 트리, 소프트/하드 천장 가챠. |

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
```ts
const saveJson = manager.save({ includePrngState: true });
const newManager = new GameWorldManager();
newManager.load(saveJson);
```

### 2. 멀티플레이 & 서버-클라이언트 델타 패치 (`WorldDiffer`)
```ts
import { WorldDiffer } from 'ryuis-gamecore';

const prev = WorldDiffer.captureSnapshot(serverWorld);
// ... 시뮬레이션 진행 ...
const delta = WorldDiffer.createDelta(prev, serverWorld);

// 클라이언트 측에서 1줄로 패치 적용
WorldDiffer.applyDelta(clientWorld, delta);
```

### 3. 엔티티 부모-자식 계층 구조 (`HierarchyComponent`, `HierarchySystem`)
```ts
import { HierarchyComponent, HierarchySystem, PositionComponent } from 'ryuis-gamecore';

world.addSystem(new HierarchySystem());

const hero = world.createEntity();
hero.add(new PositionComponent(10, 20));

const pet = world.createEntity();
pet.add(new PositionComponent(0, 0));
pet.add(new HierarchyComponent({ parentId: hero.id, offsetX: 2, offsetY: -3, cascadeDestroy: true }));

world.update(16); // pet 좌표가 (12, 17)로 자동 동기화
```

### 4. 세이브 무결성: 변조 방지(HMAC) vs 손상 감지(SHA-256)
* **비밀키 지정 시**: 버전, 타임스탬프, 데이터, 메타데이터를 일괄 서명하는 **HMAC-SHA256 암호학적 서명**을 생성하여 버전 다운그레이드 및 리플레이 공격을 원천 차단합니다 (Tamper-Proof).
* **비밀키 미지정 시**: 단순 데이터 손상 감지(Corruption Detection)용 SHA-256 체크섬을 사용합니다.

```ts
import { SaveManager } from 'ryuis-gamecore';

const saveStr = SaveManager.serialize(world, 'secret-key-123', 1, {
  metadata: { gachaPity: 45 },
});

// 판별 유니온 (Discriminated Union)으로 안전하게 타입 좁히기
const result = SaveManager.deserialize(saveStr, newWorld, 'secret-key-123');
if (result.success && result.metadata) {
  console.log('로드 성공! 천장 카운트:', result.metadata.gachaPity);
} else if (!result.success) {
  console.error('로드 거부:', result.error, '변조 여부:', result.tampered);
}
```

### 5. 결정론적 월드 상태 해시 (`world.hash()`)
멀티플레이어 실시간 디싱크(Desync) 감지 및 리플레이 체크포인트 자동 검증:
```ts
// 정규화된 64자리 SHA-256 상태 해시 산출
const currentHash = world.hash();
if (serverHash !== clientHash) {
  console.warn('디싱크 감지! 델타 동기화 패치 요청 중...');
}
```

> **결정론 시뮬레이션 주의사항**:
> JavaScript의 부동소수점 연산(`Math.sin`, 나눗셈 등)은 하드웨어/V8 버전에 따라 미세한 비트 차이가 발생할 수 있습니다. 완벽한 크로스 플랫폼 결정론을 위해서는 정수 연산이나 GameCore의 `CombatRoundingConfig`(`applyRounding`)를 사용하여 소수점을 제어하는 것을 권장합니다.

---

## 📄 라이선스
Apache License 2.0 © ISA (Yoonjong Ryu / 류윤종)
