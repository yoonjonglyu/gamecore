---
name: gamecore
description: >-
  Architects, develops, and extends games and game systems using the GameCore ECS framework.
  Activate when designing games, building RPG/strategy/action/idle/roguelike mechanics
  (deterministic PRNG, precision rounding, stat pipelines, pluggable combat, skills, inventory,
  equipment, progression, loot & affix tables, save integrity, status effects, turn queues, grid movement,
  global blackboard, timer scheduling, FSM state machines, 2D continuous spatial hash, quests/achievements,
  and audio/VFX cue protocols), or integrating with React/Canvas/Node.js/Godot/Wasm.
---

# GameCore Framework Skill (v1.1.0)

This skill guides the design, implementation, and extension of games built on the **GameCore** framework (`ryuis-gamecore` package).

GameCore is a platform-agnostic, deterministic, 0-dependency, ECS (Entity-Component-System) engine designed so that **data, state, and rules remain invariant** regardless of the frontend interface (Web Canvas, PixiJS, Three.js, React, Node.js, Godot, Wasm).

---

## 1. Core Principles

1. **Components are Pure Data**: Never put business logic or methods that alter other entities inside components.
2. **Systems are Pure Logic**: Systems operate on entities queried by component types (`query: ComponentType[]`). Systems should not hold game-state; state belongs in components. Use `system.enabled` to pause/resume and `system.priority` to control execution order.
3. **Deterministic Verification (PRNG)**: Use `SeededRandom` (PCG32) for all chance/crit/evasion/loot rolls. Never use `Math.random()` in core simulation to ensure replayability and server-side anti-cheat verification.
4. **Precision & Rounding Control**: Use `CombatRoundingConfig` and `applyRounding()` to eliminate floating-point precision anomalies (e.g. `14.799999999999999` -> `15`).
5. **Global State & Scenarios (Blackboard)**: Use `world.blackboard` for non-entity global state (stage, difficulty, weather, dialogue flags) with `increment()`, `toggle()`, and save serialization.
6. **Unified Timing & Turns (TimerScheduler)**: Use `world.schedule()`, `world.scheduleEvery()`, `world.scheduleTurns()` for delayed/periodic actions locked to engine update ticks.
7. **Action Gating via FSM**: Use `FSMComponent` and `FSMSystem` for state validation (`idle`, `casting`, `stunned`). Check `fsm.canMove`, `fsm.canCast`, `fsm.canAttack` before performing actions.
8. **2D Continuous Spatial Queries**: Use `SpatialHashGrid` for continuous coordinate `(x, y)` games (Vampire Survivors, ARPGs) with O(1) `queryRadius()` and `queryAABB()`.
9. **Event-Driven Quests & Achievements**: Use `QuestsComponent` and `QuestSystem` to track objectives automatically on `stats:died`, `inventory:item:added`, or custom events with auto-completion and auto-rewards.
10. **Renderer Presentation Protocol (Cue)**: Decouple audio/VFX from game logic via `CueProtocol` and `CueQueue` (`sfx`, `vfx`, `shake`, `flash`).
11. **Save Integrity & Migrations**: Use `SaveManager` with HMAC-SHA256 checksum signatures and version migration chains to detect tampering and migrate save schemas safely.
12. **Reactive ECS & Batching**: Observe component additions, mutations, and removals via `ecs:component:updated` and `ecs:component:removed`. Use `world.batchUpdates(fn)` to suppress repetitive updates during bulk calculations.
13. **Declarative Stat Pipeline**: Use `StatPipeline` and `ExtendedStatsComponent` for arbitrary RPG attributes (STR, INT, CritRate, FireDamage, etc.) with 4-stage calculation order:
    $$\text{Final} = (\text{Base} + \sum \text{Flat}) \times (1 + \sum \text{Percent}) \times (1 + \sum \text{Amplification})$$
14. **Pluggable Combat Pipeline**: Decouple damage formulas via `DamageCalculator` strategy pattern and 4-stage lifecycle middlewares (`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`). Shield damage is absorbed by `BarrierComponent` before deducting HP.
15. **Offline Progress Calculation**: Use `OfflineProgressEngine` for idle/AFK gains with cap limits and multi-resource simulation.
16. **Branching Dialogue (DialogueSession)**: Graph-based dialogue with condition evaluation against `world.blackboard` and automatic side-effect triggers.
17. **2D Grid FOV & LOS (FieldOfView)**: Raycasting field-of-view, line-of-sight checks, and shadowcasting fog-of-war for roguelikes/tactics.
18. **Modular Behavior Trees**: Compose reactive AI agents using `BehaviorTree`, `SelectorNode`, `SequenceNode`, `ActionNode`, and `ConditionNode`.
19. **Gacha & Pity Engine**: Deterministic gacha banner simulations with soft/hard pity counters and guaranteed banner rate-ups.
20. **Delta Synchronization (WorldDiffer)**: Capture lightweight network delta snapshots (`added`, `updated`, `removed`, `blackboard`) for multiplayer replication and spectator syncing.
21. **Entity Hierarchies (HierarchySystem)**: Parent-child attachments with local coordinate offsets (`offsetX`, `offsetY`) and optional cascading destruction (`cascadeDestroy`).
22. **Save Envelope Metadata**: Bundle arbitrary game progress, pity counters, or quest stages directly inside HMAC-signed save envelopes.

---

## 2. Standard Recipes & Code Examples

### A. GameWorldManager (One-line Bootstrap)
```ts
import { GameWorldManager, StatsComponent, FSMComponent } from 'ryuis-gamecore';

const manager = new GameWorldManager({
  seed: 'dungeon-42',
  rounding: { mode: 'round', decimals: 0 },
});

// 전역 플래그
manager.world.blackboard.set('dungeon_level', 1);

// 지연 스케줄러 (1000ms 지연)
manager.world.schedule(1000, () => {
  console.log('1초 경과!');
});

// 엔티티 생성
const hero = manager.world.createEntity('hero');
hero.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 25 }));
hero.add(new FSMComponent({
  initialState: 'idle',
  states: {
    idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['casting'] },
    casting: { canMove: false, duration: 1500, autoTransitionTo: 'idle' },
  },
}));

// 게임 루프 틱 (FSM, 스케줄러 자동 갱신)
manager.update(16);
```

### B. FSM & Action Gating
```ts
const fsm = hero.get(FSMComponent);
if (fsm && !fsm.canCast) {
  console.log('현재 상태(캐스팅/기절)에서는 스킬을 사용할 수 없습니다.');
  return;
}
```

### C. 2D 연속 공간 해시 (SpatialHashGrid)
```ts
import { SpatialHashGrid } from 'ryuis-gamecore';

const grid = new SpatialHashGrid({ cellSize: 100 });
grid.insert(enemy1.id, 120, 80);
grid.insert(enemy2.id, 140, 90);

// 반경 50 내 주변 엔티티 O(1) 탐색
const targets = grid.queryRadius(100, 100, 50);
```

### D. 퀘스트 & 업적 추적 (QuestSystem)
```ts
import { QuestsComponent } from 'ryuis-gamecore';

hero.add(new QuestsComponent([
  {
    id: 'quest_goblin',
    title: '고블린 토벌',
    autoComplete: true,
    autoReward: true,
    objectives: [{ id: 'kill_goblin', type: 'kill', target: 5 }],
    rewards: { exp: 200 },
  },
]));

// stats:died 이벤트 발생 시 QuestSystem이 자동으로 목표 카운트 및 보상 지급
```

### E. 연출 큐 프로토콜 (CueQueue)
```ts
import { CueQueue } from 'ryuis-gamecore';

const cues = new CueQueue();
cues.emit('combat:hit', {
  sfx: 'slash.wav',
  vfx: 'blood_particle',
  shake: { intensity: 10, duration: 150 },
}, attackerId, targetId);

// 렌더러 루프에서 소비
const frameCues = cues.flush();
```

### F. 공간 해시 자동 동기화 (SpatialGridSystem)
```ts
import { SpatialGridSystem, PositionComponent } from 'ryuis-gamecore';

const spatialSys = new SpatialGridSystem();
world.addSystem(spatialSys);

const nearby = spatialSys.queryRadius(heroPos.x, heroPos.y, 75);
```

### G. 스탯 변환 & 동기화 (StatAdapter)
```ts
import { StatAdapter, StatsComponent } from 'ryuis-gamecore';

const extended = StatAdapter.toExtended(entity.get(StatsComponent)!);
extended.addModifier({ stat: 'attack', stage: 'flat', value: 10, sourceId: 'buff' });
StatAdapter.syncToStats(extended, entity.get(StatsComponent)!);
```

### H. 시간 배속 & 일시정지 (TimeScale)
```ts
world.timeScale = 1.5; // 1.5배속
world.pause();         // 게임 일시정지
world.resume();        // 게임 재개
```

### I. PRNG 상태 선택적 직렬화 & 커스텀 메타데이터
```ts
// 메타데이터(가챠 천장, 퀘스트 기록 등)와 PRNG 상태를 단일 HMAC 세이브로 보관
const saveJson = manager.save({
  includePrngState: true,
  metadata: { bannerPity: 45, chapter: 3 },
});
const result = manager.load(saveJson);
console.log(result.metadata.bannerPity); // 45
```

### J. 오프라인 방치 보상 시뮬레이터 (OfflineProgressEngine)
```ts
import { OfflineProgressEngine } from 'ryuis-gamecore';

const engine = new OfflineProgressEngine({ maxOfflineMs: 8 * 3600 * 1000 });
const progress = engine.calculate({
  lastSaveTime: Date.now() - 3600 * 1000,
  currentTime: Date.now(),
  rates: { gold: 10, wood: 2 }, // 초당 획득량
});
console.log(progress.rewards.gold); // 36000 Gold
```

### K. 분기형 대화 시스템 (DialogueSession)
```ts
import { DialogueSession } from 'ryuis-gamecore';

const session = new DialogueSession({
  tree: dialogueGraph,
  blackboard: world.blackboard,
});
session.selectChoice(0); // 선택지 선택 시 블랙보드 플래그 자동 반영
```

### L. 시야 & 가시선 판정 (FieldOfView)
```ts
import { FieldOfView } from 'ryuis-gamecore';

const fov = new FieldOfView({
  width: 50,
  height: 50,
  isBlocking: (x, y) => dungeon.isWall(x, y),
});
const visibleCoords = fov.compute(heroX, heroY, 8); // 반경 8 시야각 계산
const canSeeTarget = fov.hasLineOfSight(heroX, heroY, enemyX, enemyY);
```

### M. 행동 트리 AI (BehaviorTree)
```ts
import { BehaviorTree, SelectorNode, SequenceNode, ActionNode, ConditionNode } from 'ryuis-gamecore';

const ai = new BehaviorTree(
  new SelectorNode([
    new SequenceNode([
      new ConditionNode((ctx) => ctx.hasEnemyInRange),
      new ActionNode((ctx) => ctx.attack()),
    ]),
    new ActionNode((ctx) => ctx.patrol()),
  ])
);
ai.tick(context);
```

### N. 확정 천장 가챠 엔진 (GachaEngine)
```ts
import { GachaEngine } from 'ryuis-gamecore';

const gacha = new GachaEngine({
  baseProbability: 0.006, // 0.6% SSR
  softPityStart: 74,
  softPityIncrement: 0.06,
  hardPity: 90,
  rateUpItem: 'ssr_hero',
  guaranteedRateUpOnSecond: true,
});
const pull = gacha.pull();
```

### O. 멀티플레이어 델타 동기화 (WorldDiffer)
```ts
import { WorldDiffer } from 'ryuis-gamecore';

// 서버 측: 스냅샷 비교 후 차이점만 브로드캐스트
const prev = WorldDiffer.captureSnapshot(serverWorld);
// ... 게임 시뮬레이션 진행 ...
const delta = WorldDiffer.createDelta(prev, serverWorld);

// 클라이언트 측: 단 1줄로 수신된 패치 반영
WorldDiffer.applyDelta(clientWorld, delta);
```

### P. 부모-자식 엔티티 계층 구조 (HierarchySystem)
```ts
import { HierarchyComponent, HierarchySystem, PositionComponent } from 'ryuis-gamecore';

world.addSystem(new HierarchySystem());

const mount = world.createEntity('mount');
mount.add(new PositionComponent(100, 100));

const rider = world.createEntity('rider');
rider.add(new PositionComponent(0, 0));
rider.add(new HierarchyComponent({
  parentId: mount.id,
  offsetX: 0,
  offsetY: -15, // 탑승자 위치 오프셋
  cascadeDestroy: true, // 탈것 파괴 시 탑승자 연쇄 삭제
}));

// mount 이동 시 rider 좌표도 (100, 85)로 자동 동기화
world.update(16);
```
