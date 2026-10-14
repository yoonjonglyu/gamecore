# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Offline Idle Progress Engine (`OfflineProgressEngine`)**: AFK reward simulation with time caps, non-linear growth curves, and multi-resource rates.
- **Branching Dialogue System (`DialogueSession`)**: Graph-based dialogue sessions with blackboard condition evaluations, variable replacement, and automated side-effect event triggers.
- **2D Grid FOV & LOS (`FieldOfView`)**: Raycasting field of view, line-of-sight checks, and shadowcasting fog-of-war for tilemaps and tactics.
- **Behavior Tree AI (`BehaviorTree`)**: Composable reactive AI system with `SelectorNode`, `SequenceNode`, `ActionNode`, `ConditionNode`, and `InverterNode`.
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
