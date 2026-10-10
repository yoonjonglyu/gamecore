---
name: gamecore-developer
description: >-
  Architects, develops, and extends games and game systems using the GameCore ECS framework.
  Activate when designing games, building RPG/strategy/action/idle/roguelike mechanics
  (deterministic PRNG, precision rounding, stat pipelines, pluggable combat, skills, inventory,
  equipment, progression, loot & affix tables, save integrity, status effects, turn queues, grid movement,
  global blackboard, timer scheduling, FSM state machines, 2D continuous spatial hash, quests/achievements,
  and audio/VFX cue protocols), or integrating with React/Canvas/Node.js/Godot/Wasm.
---

# GameCore Developer Skill (v1.0.0)

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
