# GameCore (`ryuis-gamecore`)

<p align="center">
  <strong>Headless, Deterministic, Universal Game State & Simulation Framework</strong><br>
  A zero-dependency, platform-agnostic ECS engine designed to encapsulate game state, math models, rule validation, combat simulation, and presentation protocols.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ryuis-gamecore"><img src="https://img.shields.io/npm/v/ryuis-gamecore.svg" alt="npm version" /></a>
  <a href="https://github.com/yoonjonglyu/gamecore/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg" alt="TypeScript Strict" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Dependencies-0-brightgreen.svg" alt="Zero Dependencies" /></a>
  <a href="https://github.com/yoonjonglyu/gamecore/actions/workflows/ci.yml"><img src="https://github.com/yoonjonglyu/gamecore/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.ko.md">한국어 (Korean)</a>
</p>

---

## 💡 Why GameCore?

Traditional game logic is often entangled with rendering engines (Three.js, Pixi.js, Canvas, React, or Godot).  
**GameCore decouples the entire game state and simulation into a pure, headless TypeScript core**:

* **Zero Runtime Dependencies**: Ultra-lightweight, 0 external npm dependencies in production.
* **100% Platform Agnostic**: Runs identically in Web browsers, Node.js/Bun game servers, React Native, Wasm, or embedded V8 engines (Puerts in Unity / Unreal Engine).
* **Deterministic Verification (PCG32 PRNG)**: Seeded pseudo-random numbers ensure identical simulation results across clients for server-side anti-cheat and replay playback.
* **Declarative Stat & Combat Pipelines**: 4-stage formula calculations with shield absorption, damage mitigations, and elemental reaction registries.
* **Multiplayer Delta Sync (`WorldDiffer`)**: Capture lightweight diffs between snapshots and replicate state across clients in a single line.
* **Tamper-Proof Save Integrity (`SaveManager`)**: Built-in HMAC-SHA256 signature packaging with schema migration chains.
* **First-Class React 19 Bindings**: Tear-free, zero-leak state synchronization using React 19 `useSyncExternalStore`.

---

## 🏛 Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                   External Game Project (Consumer)                     │
│  - Master Data Injection (items.json, skills.json, blueprints.json)    │
│  - Custom Components & Systems (Game-specific rules & content)         │
│  - Rendering Layer (React 19, Pixi.js, Three.js, Canvas, Unity/Unreal) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Data Injection & System Extensions
┌───────────────────────────────────▼────────────────────────────────────┐
│                        ryuis-gamecore (Engine v1.1)                    │
│                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   GameWorldManager      │  │   SeededRandom (PCG32 PRNG)         │  │
│  │   (Facade Orchestrator) │  │   Deterministic replay & rolls      │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────────────────────────▼──────────────────┐  │
│  │  World (ECS Core) & EventBus                                     │  │
│  │  - Blackboard (Typed global flags, stage & story states)         │  │
│  │  - TimerScheduler (Tick/turn-accurate task scheduling)          │  │
│  │  - Reactive Component Events (`ecs:component:updated/removed`)   │  │
│  │  - `world.batchUpdates(fn)` (Bulk update deduplication)          │  │
│  │  - Zero-dependency `subscribe()` Observer (React 19 bindings)    │  │
│  └────────────┬──────────────────────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────┐    ┌──────────────▼──────────────────┐  │
│  │  Pipelines & Systems      │    │  Spatial, AI & Protocols        │  │
│  │  - Custom Stat Pipeline   │    │  - SpatialHashGrid (Continuous) │  │
│  │  - Pluggable Combat Pipe  │    │  - FSM (Action Gating States)   │  │
│  │  - Precision Rounding     │    │  - Quest & Achievement Tracking │  │
│  │  - High-Level Skill Pipe  │    │  - CueProtocol (SFX/VFX events) │  │
│  │  - Status & Equipment     │    │  - WorldDiffer (Delta-Sync)     │  │
│  │  - Turn Queue & Grid Move │    │  - HierarchySystem (Parent/Child)│ │
│  │  - Save Integrity (HMAC)  │    │  - BehaviorTreeRunner & Gacha   │  │
│  └───────────────────────────┘    └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Feature Matrix

| Feature | Core Class | Highlights |
|---|---|---|
| **ECS Core** | `World`, `Entity`, `Component` | Tag querying, query caching (`auto`/`always`), batch updates. |
| **Simulation Runtime** | `CommandBus`, `FixedStepRunner` | Unified command routing, fixed-timestep loop, auto-recording & replay verification. |
| **Deterministic PRNG** | `SeededRandom` | PCG32 generator, state serialization, reproducible dice/crits. |
| **4-Stage Stat Pipeline** | `StatPipeline`, `ExtendedStatsComponent` | $\text{Final} = (\text{Base} + \sum \text{Flat}) \times (1 + \sum \%) \times (1 + \sum \text{Amp})$. |
| **Combat Strategy** | `CombatPipeline`, `BarrierComponent` | Pre-hit, damage calculate, shield absorb, and post-hit hooks. |
| **Global Blackboard** | `Blackboard` | Global game flags with `increment()`, `toggle()`, and save serialization. |
| **Action Gating (FSM)** | `FSMComponent`, `FSMSystem` | States (`idle`, `casting`, `stunned`), `canMove`, `canCast`, `canAttack`. |
| **2D Spatial Hash** | `SpatialHashGrid`, `SpatialGridSystem`| $O(1)$ radius and bounding-box queries for continuous 2D coordinates. |
| **Delta Synchronization** | `WorldDiffer` | Micro-patches for multiplayer networking and client state replication. |
| **Entity Hierarchy** | `HierarchyComponent`, `HierarchySystem`| Parent-child attachments, coordinate offsets, and cascade destroy. |
| **Behavior Tree AI** | `BehaviorTreeRunner`, `SelectorNode` | Composable decision nodes (`Sequence`, `Selector`, `Action`, `Condition`). |
| **Gacha Engine** | `GachaEngine` | Deterministic soft/hard pity counters, banner rate-ups, and guarantees. |
| **Save Integrity** | `SaveManager` | Pure TS HMAC-SHA256 signature verification & schema migration. |
| **Presentation Protocol** | `CueQueue`, `CueProtocol` | Decoupled audio/VFX event queue (`sfx`, `vfx`, `shake`, `flash`). |

---

## 🚀 Quick Start (60 Seconds)

### 1. Installation
```bash
npm install ryuis-gamecore
# or
pnpm add ryuis-gamecore
```

### 2. One-Line Bootstrap with `GameWorldManager`
```ts
import { GameWorldManager, StatsComponent, FSMComponent, PositionComponent } from 'ryuis-gamecore';

// 1. Create a deterministic game world
const manager = new GameWorldManager({
  seed: 'dungeon-run-42',
  rounding: { mode: 'round', decimals: 0 },
});

// 2. Set global flags
manager.world.blackboard.set('dungeon_level', 1);

// 3. Schedule a delayed event (e.g. 1000ms delay)
manager.world.schedule(1000, () => {
  console.log('1 second elapsed in simulation time!');
});

// 4. Create an entity with components
const hero = manager.world.createEntity('hero');
hero.add(new PositionComponent(100, 200));
hero.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 35, defense: 10 }));
hero.add(new FSMComponent({
  initialState: 'idle',
  states: {
    idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['casting'] },
    casting: { canMove: false, duration: 1500, autoTransitionTo: 'idle' },
  },
}));

// 5. Run simulation tick (updates FSM, schedulers, and systems)
manager.update(16); // 16ms delta
```

---

## 📖 Key Recipes

### Multiplayer Delta Synchronization (`WorldDiffer`)
```ts
import { WorldDiffer } from 'ryuis-gamecore';

// Server side: Capture snapshot and create diff
const prev = WorldDiffer.captureSnapshot(serverWorld);
// ... simulate game ...
const delta = WorldDiffer.createDelta(prev, serverWorld);

// Client side: Apply lightweight network patch in one line
WorldDiffer.applyDelta(clientWorld, delta);
```

### Entity Hierarchy Attachments (`HierarchySystem`)
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
  offsetY: -15, // Rider sits 15 units above mount
  cascadeDestroy: true, // Rider is destroyed when mount is destroyed
}));

world.update(16); // Rider position automatically updates to (100, 85)
```

### Save Integrity: Tamper-Proofing (HMAC) vs Corruption Detection (SHA-256)
* **With Secret Key**: Generates an **HMAC-SHA256 cryptographic signature** over version, timestamp, data, and metadata to protect against tampering, replay attacks, and version downgrade.
* **Without Secret Key**: Computes a standard SHA-256 checksum for **accidental corruption detection**.

```ts
import { SaveManager } from 'ryuis-gamecore';

// 1. Serialize with custom metadata and secret key (Tamper-Proof)
const saveStr = SaveManager.serialize(world, 'player-secret-key', 1, {
  metadata: { gachaPity: 45, chapter: 3 },
});

// 2. Restore with cryptographic verification (Discriminated Union)
const result = SaveManager.deserialize(saveStr, restoredWorld, 'player-secret-key');
if (result.success && result.metadata) {
  console.log(result.metadata.gachaPity); // 45
} else if (!result.success) {
  console.error('Save rejected:', result.error, 'Tampered:', result.tampered);
}
```

### Deterministic State Hashing (`world.hash()`)
Quickly detect real-time multiplayer desynchronization and verify replay checkpoints:
```ts
// Calculate 64-character SHA-256 digest of normalized world state
const currentHash = world.hash();
if (serverHash !== clientHash) {
  console.warn('Desynchronization detected! Requesting delta sync patch...');
}
```

> **Deterministic Simulation Note**:
> JavaScript floating-point operations (`Math.sin`, division) may exhibit subtle cross-architecture discrepancies. For strict cross-platform determinism (e.g. Web vs Native V8), use integer math or GameCore's built-in `CombatRoundingConfig` (`applyRounding`) to truncate/round fractional results.

---

## 🆕 What's New in v1.2.0

### Unified `CommandBus` + `FixedStepRunner`
Route all player/AI inputs through a single deterministic command layer, drive fixed-timestep updates regardless of client frame rate, and verify replays automatically:
```ts
import { GameWorldManager, StatsComponent } from 'ryuis-gamecore';

const manager = new GameWorldManager({ seed: 'match-1', stepMs: 16 });
const hero = manager.world.createEntity('hero');
hero.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 20 }));

manager.startRecording({ checkpointInterval: 5 });
manager.enqueue('combat:attack', { attackerId: hero.id, targetId: enemy.id }, { tick: 1 });
const frame = manager.advance(24); // executes 1 fixed 16ms step; frame.alpha === 0.5
const replayData = manager.stopRecording()!;

// Deterministically replay & verify world hash checkpoints on another instance
const result = playbackManager.runner.replay(replayData);
console.log(result.completed, result.desynced); // true, false
```

### Data Integrity, Client Reconciliation & Debug Inspector
* **Static Validation (`data.validate()`)**: Detects broken `skillId`/`itemId`/`equipment` references, circular `StatPipeline` formulas, dangling dialogue targets, and invalid gacha pity configs at startup.
* **Client Prediction Rollback (`SnapshotBuffer`)**: `snapshots.reconcile({ serverTick, serverState, serverHash, world, runner, unackedCommands })` confirms matching ticks or rolls back and replays unacknowledged commands cleanly.
* **Read-Only Debug Diff (`WorldInspector`)**: `WorldInspector.inspectWorld(world)`, `WorldInspector.diffWorlds(worldA, worldB)`, and bounded event timeline logging.
* **Tree-Shakeable Subpaths**: Import only what you need from `ryuis-gamecore/core`, `/combat`, `/spatial`, `/serialization`, `/ai`, `/data`, or `/react` (each with dual ESM/CJS bundles & NodeNext `.d.ts`/`.d.cts` declarations).

### Benchmarks (`pnpm run bench`)
Measured on Node `v22.17.1` (`benchmarks/core.bench.ts`, hardware-dependent):

| Workload | Throughput | Mean Latency |
|---|---|---|
| `ECS queryEntities (1000 entities)` | `10,220 ops/s` | `0.0978 ms/op` |
| `SpatialHashGrid queryRadius (1000 entities)` | `34,570 ops/s` | `0.0289 ms/op` |
| `World.hash() (100 entities)` | `616 ops/s` | `1.6223 ms/op` |
| `WorldDiffer.createDelta() (100 entities)` | `2,757 ops/s` | `0.3627 ms/op` |
| `CommandBus + FixedStepRunner.step(1)` | `37,671 ops/s` | `0.0265 ms/op` |

---

## 🆕 What's New in v1.1.3 & v1.1.4

### v1.1.4 Highlights
* **NodeNext ESM + CJS Dual Type Declarations**: Split `package.json` `exports` for `"import"` (`.d.ts`/`.js`) and `"require"` (`.d.cts`/`.cjs`) with `.js`/`.cjs` relative declaration specifiers so TypeScript `--moduleResolution NodeNext` consumers work out of the box.
* **Canonical `World.hash()` & Full `ComponentRegistry`**: Canonical JSON hashing sorts keys deterministically, excludes pending removals, and covers `SkillsComponent`, `StatusEffectsComponent`, `StatModsComponent`, `QuestsComponent`, `ItemDefComponent`, and `InventoryComponent.maxWeight`.
* **Hardened `SaveManager` & `WorldDiffer`**: Rejects legacy v1.1.0/v1.1.1 signatures unless explicitly opted in (`{ allowLegacySignature: true }`), guards migration cycles/downgrades, and syncs entity tags and deleted blackboard keys cleanly across deltas.
* **Core Determinism, Combat & Subsystem Fixes**: Eliminated non-deterministic timestamps/IDs in `QuestsComponent` and `InventoryComponent`, added `magicPen` support in `DefaultDamageCalculator`, prevented `SkillSystem`/`StatusEffectSystem` double-ticking, fixed `ExtendedStatsComponent` defaults, isolated `MovementSystem` collisions by `mapId`, and tightened AI/Gacha/Factory edge cases.

### v1.1.3 Highlights
* Fixed React `useComponent` re-renders via `entity.version` snapshots, wired runtime `CueQueue` / `cue:triggered` emissions, raised A* default `maxSteps` to `10000` with `maxStepsExceeded`, disabled pity on `hardPityCount <= 0`, enforced fail-closed custom constraints, isolated `EventBus` listener exceptions, and automated death loot drops via `killerId`.

---

## 🛠️ Testing & Verification

GameCore includes a comprehensive test suite (261 tests across 30 suites) covering every subsystem:

```bash
# Run unit & integration tests
pnpm test

# Typecheck without emit
pnpm run typecheck

# Build distribution bundle
pnpm run build
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup and guidelines.

---

## 📜 License

GameCore is open-source software licensed under the **[Apache License 2.0](./LICENSE)**.  
Copyright © 2026 ISA (Yoonjong Ryu).
