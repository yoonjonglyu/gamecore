# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-26

### Added
- **Unified Command Bus (`CommandBus`)**: Single validation, middleware, queueing (`enqueue`/`flush` by target tick), dispatching, and auto-recording pipeline across built-in `CoreCommands` (`combat:attack`, `skill:use`, `movement:move`, `equipment:equip`, `equipment:unequip`, `inventory:add`, `inventory:remove`, `fsm:transition`, `turn:end`) and custom project commands (`command:dispatched` / `command:rejected` events).
- **Fixed-Timestep Simulation Runner (`FixedStepRunner`)**: Frame-rate-independent fixed-step simulation loop (`step`, `advance` with `alpha` interpolation factor and spiral-of-death clamping), periodic hash checkpointing, runner state export/import, and integrated replay verification (`runner.replay()`, emitting `simulation:tick`).
- **Integrated Runtime & DX API on `GameWorldManager`**: Added `manager.commands`, `manager.runner`, `manager.dispatch()`, `manager.enqueue()`, `manager.step()`, `manager.advance()`, `manager.startRecording()`, `manager.stopRecording()`, `manager.registerModule()`, optional `cueQueue` & `data` wiring, and `options` forwarding on `manager.load()`.
- **Master Data & Content Validator (`DataValidator` / `DataManager.validate()`)**: Zero-dependency static checks for blueprint skill/item/equipment cross-references, `StatPipeline` circular formula dependencies, `DialogueTreeData` dangling links and unreachable nodes, and `GachaPoolConfig` rates and pity bounds.
- **Snapshot Ring Buffer & Client Reconciliation (`SnapshotBuffer`)**: Tick-indexed snapshot ring buffer (`capture`, `restore`, `reconcile`) enabling optimistic client prediction, fast-path server hash confirmation, and rollback + unacked command replay on misprediction.
- **Tree-Shakeable Subpath Exports**: Added subpath entry points `ryuis-gamecore/core`, `ryuis-gamecore/combat`, `ryuis-gamecore/spatial`, `ryuis-gamecore/serialization`, `ryuis-gamecore/ai`, and `ryuis-gamecore/data` alongside `.` and `./react` with paired NodeNext `.d.ts`/`.d.cts` declarations.
- **Debug Inspector, Reference Demo & Benchmarks**: Added `WorldInspector` (`inspectEntity`, `inspectWorld`, `diffWorlds`, bounded event timeline), `examples/authoritative_arena.ts` (server-authoritative reconciliation & cue sync demo), and `benchmarks/core.bench.ts` (`pnpm run bench`).
- **Multi-Seed Determinism & Subsystems Verification**: Added `tests/simulation_runtime.test.ts`, `tests/determinism_property.test.ts`, `tests/stage2_data_snapshot_subpaths.test.ts`, and `tests/stage3_inspector_arena.test.ts` covering twin-seed parity, variable frame-rate invariance, mid-run Save/Load equivalence, auto-replay checks, validation, reconciliation, and inspection.

### Fixed
- **Per-World Deterministic Entity IDs**: Moved automatic entity ID allocation into `World._nextEntityId` (synced in `createEntityWithId`), eliminating cross-world static ID leakage so parallel worlds, replays, and server/client simulations start with identical deterministic IDs.

---

## [1.1.4] - 2026-11-25

### Fixed
- **Packaging & NodeNext Type Declarations**: Split `exports` conditions into `"import"` (`.d.ts`/`.js`) and `"require"` (`.d.cts`/`.cjs`), added `scripts/fix-dts.mjs` for NodeNext-compatible relative declaration specifiers, removed duplicate `src/index.js` and legacy `src/model/*` files, and exported `ItemDef` as `export type` along with spatial grid interfaces.
- **ECS Core Lifecycle & Memory Leaks**: Unbound displaced components on `Entity.add()`/`removeAllComponents()`/`clear()`, allowed `EventBus.off()` to cancel `once()` wrappers and cleaned empty listener sets, cleaned `World.destroy()` subscriptions/schedulers/maps, guarded `TimerScheduler` against non-finite deltas/counts and listener exceptions, prevented duplicate `World.addSystem()`, and fixed `Blackboard.fromRecord()` stale key cleanup.
- **Determinism, Canonical `World.hash()`, & Serialization**: Eliminated non-deterministic `Date.now()` / `Math.random()` defaults in `QuestsComponent` and `InventoryComponent`, upgraded `World.hash()` to canonical recursive key sorting with full component coverage, registered `StatusEffectsComponent`/`StatModsComponent`/`SkillsComponent`/`ItemDefComponent` and `InventoryComponent.maxWeight` in `defaultComponentRegistry`, fixed unpaired UTF-16 surrogate encoding in `crypto.ts`, synced tags & deleted blackboard keys in `WorldDiffer`, and required explicit `{ allowLegacySignature: true }` in `SaveManager.deserialize()` with migration cycle/downgrade guards.
- **Combat, Skills, Status, Equipment & Progression**: Applied `magicPen` for magical attacks in `DefaultDamageCalculator`, blocked dead attackers and emitted accurate `BarrierComponent` remainders and reflect/lifesteal events, prevented `SkillSystem` + `StatusEffectSystem` double-ticking, fixed `ExtendedStatsComponent` default HP (`100` / alive), added `StatusEffectSystem` reaction recursion guard and catch-up DoT loop, prevented swap loss when inventory is full in `EquipmentSystem`, scoped `QuestSystem` kills to `killerId`, and prevented reviving dead entities on level-up.
- **Spatial, AI, Dialogue, Idle, Gacha, Data & Factory**: Isolated `MovementSystem` entity collisions by `mapId` and snapshotted queues, fixed `SpatialHashGrid.findNearest` `Infinity` radius scans, checked integer bounds in `GridMap.inBounds`, blocked diagonal corner-cutting across dynamic obstacles in `GridPathfinding`, hardened `FieldOfView` input guards and `extraBlocking`, made `RepeatNode` stateful across `RUNNING` ticks, handled missing initial nodes in `DialogueSession`, preserved overcapped stamina in `OfflineProgressEngine`, fixed Gacha/DropTable/AffixGenerator edge cases, and applied blueprint equipment stats & `itemId: 0` in `EntityFactory`.
- **Docs, Skills & CI**: Aligned `README.md`, `README.ko.md`, `docs/*.md`, `skills/gamecore/SKILL.md`, `.agents/skills/gamecore-developer/SKILL.md`, and `examples/dungeon_crawler.ts` (`EquipmentComponent` & single auto-loot drop), bumped CI `pnpm` to `10`, and added `pnpm run smoke` to CI.

---

## [1.1.3] - 2026-10-19

### Fixed
- **React `useComponent` Hook Re-render Bug**: Changed snapshot evaluation from component reference to `entity.version`, enabling components mutated via internal properties and `entity.notifyUpdated()` to trigger React re-renders correctly.
- **A* Pathfinder Step Limit Signal**: Added `maxStepsExceeded?: boolean` to `PathResult` and raised the default `maxSteps` from 2,000 to 10,000, clearly distinguishing between unreachable targets and step-budget exhaustion.
- **Gacha Pity Zero Invalidation**: Fixed issue where `hardPityCount: 0` caused permanent 100% top-tier drops; values `<= 0` and unset pity options now safely disable pity mechanics without inflating base drop rates.
- **Fail-Closed Custom Constraints**: Unregistered custom constraint handler IDs now fail-closed (`ok: false`) to prevent accidental constraint bypass caused by typos.
- **Level Constraint Component Unification**: Enhanced `ConstraintChecker` level checks to inspect `ProgressionComponent.level` as well as `ClassComponent.level`, resolving initial level evaluation discrepancies.
- **EventBus Exception Isolation**: Enclosed individual listener dispatches within `try/catch` blocks and iterated over static snapshot arrays, ensuring that one failing listener cannot prevent subsequent listeners from executing.
- **TurnSystem Round Initialization Cache**: Updated `TurnSystem.startRound(entities)` to immediately cache supplied entities, preventing `currentEntityId` from resolving to `undefined` before `update()` is called.

### Added
- **Presentation Protocol (Cue) Runtime Wiring**: Wired `AttackRequest.cue` in `CombatSystem` and `StatusReactionRule.cueEffect` / `onReaction.emitCue` in `StatusEffectSystem` to actively dispatch `cue:triggered` events and push into optional `CueQueue` instances.
- **LootSystem Automatic Death Integration**: Extended `stats:died` payload with optional `killerId`, enabling `LootSystem.onInit` to automatically queue and distribute loot/experience to killer entities upon fatal combat.

---

## [1.1.2] - 2026-10-14

### Fixed
- **Plain Node.js ESM Import Resolution**: Bundled ESM and CJS outputs using `tsup` to resolve relative file extension requirements in raw Node.js (`ERR_MODULE_NOT_FOUND`).
- **WorldDiffer Static API Compatibility**: Added static helper methods (`WorldDiffer.captureSnapshot`, `WorldDiffer.createDelta`, `WorldDiffer.applyDelta`) matching documentation while maintaining full instance support.
- **SaveManager Security Hardening**: Expanded HMAC checksum scope to include `version` and `timestamp` (preventing version downgrade and replay attacks), and implemented constant-time comparison to protect against timing attacks.
- **SeededRandom Robustness**: Guarded seed parsing against `NaN`, `Infinity`, and non-finite numbers; upgraded `fork()` to derive child PRNGs from 64-bit entropy.
- **Package Optimization**: Disabled `.map` generation to reduce published bundle size from ~896KB down to lightweight distribution files.
- **Documentation Alignment**: Updated `SaveManager` recipes across `README.md` and `README.ko.md` to demonstrate proper `result.success` handling.

---

## [1.1.1] - 2026-10-14

### Changed
- Relicensed under **Apache License 2.0** for enhanced patent, trademark, and contributor protection.
- Updated minimum Node.js runtime requirement to `>=20.12.0` (for modern Vitest/Rolldown ESM tooling).
- Added multi-language documentation (`README.md` in English, `README.ko.md` in Korean).
- Established CI/CD automation and community templates (`.github/workflows/ci.yml`, issue/PR templates).

---

## [1.1.0] - 2026-10-11

### Added
- **Multiplayer Delta Sync (`WorldDiffer`)**: Lightweight network delta snapshotting (`createDelta`, `applyDelta`) for state replication across clients, spectator modes, and server-authoritative setups.
- **Entity Hierarchy System (`HierarchyComponent`, `HierarchySystem`)**: Parent-child relationship management with coordinate offset tracking (`offsetX`, `offsetY`) and cascading destruction (`cascadeDestroy`).
- **Save Envelope Metadata**: Arbitrary custom metadata bundling directly within HMAC-signed save envelopes (`SaveManager`).
- **Offline Idle Progress Engine (`OfflineProgressEngine`)**: AFK reward simulation with time caps, stamina recovery, and deterministic stage/drop simulation.
- **Branching Dialogue System (`DialogueSession`)**: Graph-based dialogue sessions with blackboard condition evaluations, session variables, and automated side-effect callbacks.
- **2D Grid FOV & LOS (`FieldOfView`)**: Bresenham raycasting field of view, line-of-sight checks, and fog-of-war for tilemaps and tactics.
- **Behavior Tree AI (`BehaviorTreeRunner`)**: Composable reactive AI system with `SelectorNode`, `SequenceNode`, `ActionNode`, `ConditionNode`, and `InverterNode`.
- **Gacha & Pity Engine (`GachaEngine`)**: Deterministic gacha mechanics with soft/hard pity counters, banner rate-ups, and guaranteed drop logic.
- **Developer AI Skills**: Built-in Antigravity IDE and Gemini CLI developer skill recipes for rapid game prototyping.

### Changed
- Preserved original entity IDs across deserialization and network delta patches via `World.createEntityWithId()`.
- Overloaded `PositionComponent` constructor to accept both numeric coordinates `(x, y)` and property objects `{ x, y, z }`.

---

## [1.0.0] - 2026-10-10

### Initial Release
- **Pure ECS Core**: 0-dependency, high-performance Entity-Component-System with tag querying and lifecycle hooks.
- **Event-Driven Architecture**: Decoupled `EventBus` with typed events and subscriber management.
- **Deterministic PRNG**: PCG32 pseudo-random number generator for cross-platform simulation parity and replayability.
- **Combat Pipeline**: Pluggable 4-stage combat lifecycle (`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`).
- **4-Stage Stat Pipeline**: Declarative formula calculation: `(Base + Flat) * (1 + Percent) * (1 + Amp)`.
- **Global Blackboard**: Typed global key-value store for world flags, quest states, and game progression.
- **Timer Scheduling**: Frame-accurate delayed and periodic task scheduler (`schedule`, `scheduleEvery`, `scheduleTurns`).
- **FSM State Machine**: Action gating (`canMove`, `canCast`, `canAttack`) and automated transition state machine.
- **2D Spatial Hash Grid**: High-speed continuous coordinate spatial partitioning with $O(1)$ radius and AABB queries.
- **Quest & Achievement Tracking**: Automatic event-driven objective counters and reward distribution.
- **Presentation Protocol (`CueQueue`)**: Clean decoupling of audio/VFX cues (`sfx`, `vfx`, `shake`, `flash`) from simulation logic.
- **HMAC Save Integrity**: SHA256 checksum signatures and schema migration pipeline to prevent local save tampering.
