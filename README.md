# GameCore

> **Headless, Data-Driven, Pluggable Game Engine & Core State Framework**  
> 특정 환경(Web, Terminal, 모바일 등)에 따라 인터페이스나 그래픽 렌더링은 달라질 수 있어도 **게임의 상태, 룰, 데이터 로직은 달라지지 않는다**는 점에 착안한 범용 게임 코어 라이브러리입니다.  
> 다양한 게임 프로젝트에서 **독립 패키지(npm)**로 임포트하여 즉시 게임을 제작할 수 있도록 지원합니다.

---

## 🌟 핵심 아키텍처

```
┌────────────────────────────────────────────────────────┐
│             External Game Project (Consumer)           │
│  - items.json, skills.json, blueprints.json (마스터 데이터) │
│  - Custom Components & Systems (프로젝트 고유 로직)         │
│  - Interface Layer (Web Canvas, React, Terminal CLI 등) │
└──────────────────────────┬─────────────────────────────┘
                           │ Data Injection & Plugins
┌──────────────────────────▼─────────────────────────────┐
│                       GameCore                         │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │     Data & Registry   │   │   Factory & Prefabs  │  │
│  │ (Registry, DataManager)│──>│   (EntityFactory)    │  │
│  └───────────────────────┘   └──────────┬───────────┘  │
│                                         │ spawn()      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │              │
│  │  Entity  │ │Component │ │  System  │ │              │
│  │  (ID +   │ │ (Data)   │ │ (Logic)  │ │              │
│  │  Tags)   │ │          │ │          │ │              │
│  └──────────┘ └──────────┘ └──────────┘ │              │
│  ┌────────────────────────────────────┐ │              │
│  │    World (ECS Orchestrator)        │<┘              │
│  │    EventBus (System 간 통신)       │                │
│  └────────────────────────────────────┘                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Serialization & State (WorldSerializer)         │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 🧩 제공하는 핵심 모듈

| 분류 | 주요 클래스 / 인터페이스 | 설명 |
|------|------------------------|------|
| **Core ECS** | `World`, `Entity`, `Component`, `System`, `EventBus` | 순수 데이터와 비즈니스 로직을 분리하는 초경량 ECS 엔진 |
| **Data & Prefabs** | `DataManager`, `Registry<T>`, `EntityBlueprint`, `EntityFactory` | 외부 데이터(JSON) 주입 및 선언적 오브젝트 스폰 공장 |
| **전투 & 스킬** | `CombatSystem`, `SkillSystem`, `StatModSystem`, `ConstraintChecker` | 데미지 계산, 버프/디버프, 쿨다운, MP 코스트, 스킬 제약 검증 |
| **인벤토리 & 장비** | `InventorySystem`, `EquipmentSystem` | 아이템 보관/수량 스택, 장비 착용 및 스탯 모디파이어 자동 연동 |
| **성장 & 전리품** | `ProgressionSystem`, `LootSystem` | 경험치(EXP) 획득, 레벨업, 스탯 성장 곡선, 확률 기반 드랍 테이블 |
| **턴 & 라운드** | `TurnSystem`, `TurnComponent` | 속도/이니셔티브 기반 턴 큐 자동 정렬, AP 관리, 라운드 제어 |
| **공간 & 그리드** | `GridMap`, `PositionComponent`, `MovementSystem` | 2D 타일맵 통행 판정, 좌표 이동 및 지형/유닛 충돌 검사 |
| **세이브 & 로드** | `WorldSerializer`, `ComponentRegistry` | 게임 월드와 엔티티 상태의 JSON 직렬화 및 완전한 복원 |

---

## 🚀 빠른 시작 (Quick Start)

### 1. 패키지 설치
```bash
npm install ryuis-gamecore
# 또는
pnpm add ryuis-gamecore
```

### 2. 마스터 데이터 등록 및 팩토리 스폰
```ts
import { 
  World, 
  DataManager, 
  EntityFactory, 
  CombatSystem, 
  SkillSystem, 
  InventorySystem,
  EquipmentSystem,
  ProgressionSystem,
  LootSystem,
  TurnSystem
} from 'ryuis-gamecore';

// 1. 데이터 매니저에 게임 기획 데이터(JSON) 주입
const data = new DataManager();

data.items.register({
  id: 'iron_sword',
  name: '철검',
  category: 'weapon',
  spec: { weaponType: 'sword', attack: 15 },
});

data.skills.register({
  id: 'slash',
  name: '베기',
  mpCost: 5,
  cooldown: 0,
  targetType: 'single_enemy',
  effects: [{ type: 'damage', basePower: 25 }],
});

data.blueprints.register({
  id: 'goblin',
  tags: ['enemy'],
  identity: { name: '고블린' },
  stats: { maxHp: 50, attack: 10, defense: 3, speed: 6 },
  skills: ['slash'],
  inventory: [{ itemId: 'iron_sword', count: 1 }],
});

// 2. 월드 및 시스템 등록
const world = new World();
world.addSystem(new CombatSystem());
world.addSystem(new SkillSystem());
world.addSystem(new InventorySystem());
world.addSystem(new EquipmentSystem(data));
world.addSystem(new ProgressionSystem());
world.addSystem(new LootSystem());
world.addSystem(new TurnSystem());

// 3. 팩토리로 엔티티 자동 조립 및 스폰
const factory = new EntityFactory(world, data);
const goblin = factory.spawn('goblin');

// 런타임 오버라이드 (보스 고블린 등)
const bossGoblin = factory.spawn('goblin', {
  name: '고블린 족장',
  tags: ['boss'],
  overrideStats: { maxHp: 250, attack: 25 },
});
```

---

## 🎮 장르별 활용 예시

### 1) 턴제 RPG (Turn-based RPG)
```ts
const turn = new TurnSystem();
world.addSystem(turn);

// 라운드 시작 -> 속도(speed) 내림차순으로 턴 큐 자동 구성
turn.startRound();
console.log('현재 행동할 엔티티 ID:', turn.currentEntityId);

// 행동 종료 후 다음 턴
turn.nextTurn();
```

### 2) 장비 착용 및 스탯 자동 반영 (Equipment)
```ts
const eqSystem = new EquipmentSystem(data);
world.addSystem(eqSystem);

// 인벤토리의 'iron_sword'를 'weapon' 슬롯에 장착
// -> 인벤토리 1개 차감 + 슬롯 장착 + 공격력 +15 스탯 모디파이어 자동 등록
eqSystem.requestEquip({ entityId: player.id, slot: 'weapon', itemId: 'iron_sword' });
world.update(16);
```

### 3) 2D 타일 맵 이동 및 충돌 (Grid & Movement)
```ts
import { GridMap, MovementSystem, PositionComponent } from 'gamecore';

const map = GridMap.fromASCII([
  '####',
  '#..#',
  '####'
], {
  '#': { type: 'wall', walkable: false },
  '.': { type: 'floor', walkable: true }
});

const movement = new MovementSystem(map);
world.addSystem(movement);

// (1, 1)에서 (2, 1)로 이동 요청 -> 벽/장애물 충돌 자동 검사
movement.requestMove(player.id, 2, 1);
world.update(16);
```

### 4) 세이브 & 로드 (Save / Load)
```ts
import { WorldSerializer } from 'gamecore';

const serializer = new WorldSerializer();

// 1. 현재 월드 상태를 JSON으로 저장
const saveJson = serializer.toJSON(world);
localStorage.setItem('my_game_save', saveJson);

// 2. 다른 월드 세션에서 완벽히 복원
const loadedWorld = new World();
serializer.deserialize(saveJson, loadedWorld);
```

---

## 🔌 커스텀 컴포넌트 확장 (Pluggability)

코어에 없는 프로젝트 고유의 컴포넌트(`AIComponent`, `CardComponent`, `QuestComponent` 등)도 블루프린트와 세이브/로드에 완벽하게 결합할 수 있습니다:

```ts
import { Component, EntityFactory, defaultComponentRegistry } from 'gamecore';

// 1. 프로젝트 전용 컴포넌트 정의
class AIComponent extends Component {
  constructor(public mode: string = 'wander') {
    super();
  }
}

// 2. 팩토리 핸들러 등록 (블루프린트 custom.ai 연동)
factory.registerComponentHandler('ai', (entity, config) => {
  entity.add(new AIComponent((config as any).mode));
});

// 3. 세이브/로드 레지스트리에 등록
defaultComponentRegistry.register('AIComponent', AIComponent);
```

---

## 📂 실전 예제 코드
* [examples/dungeon_crawler.ts](file:///e:/withc/Documents/coding/gamecore/examples/dungeon_crawler.ts): 마스터 데이터 주입, 팩토리 스폰, 장비 착용, 스킬 전투, 몬스터 처치 및 전리품 획득, 레벨업, 세이브/로드 복원까지의 전 과정을 담은 완전한 턴제 던전 RPG 시뮬레이션 예제입니다.

---

## 📜 스크립트

```bash
pnpm test          # vitest 단위/통합 테스트 (80개 테스트)
pnpm test:watch    # 워치 모드 테스트
pnpm typecheck     # TypeScript 컴파일 검사 (tsc --noEmit)
pnpm build         # dist/ 라이브러리 빌드 (tsc)
```

---

## Author

dev ISA (류윤종)