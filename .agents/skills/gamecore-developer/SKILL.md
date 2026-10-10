---
name: gamecore-developer
description: >-
  Architects, develops, and extends games and game systems using the GameCore ECS framework.
  Activate when designing games, building RPG/strategy/action/idle/roguelike mechanics
  (deterministic PRNG, precision rounding, stat pipelines, pluggable combat, skills, inventory,
  equipment, progression, loot & affix tables, save integrity, status effects, turn queues, grid movement),
  or integrating with React/Canvas/Node.js.
---

# GameCore Developer Skill (v0.3.0)

This skill guides the design, implementation, and extension of games built on the **GameCore** framework (`ryuis-gamecore` package).

GameCore is a platform-agnostic, deterministic, 0-dependency, ECS (Entity-Component-System) engine designed so that **data and rules remain invariant** regardless of the frontend interface (Web Canvas, PixiJS, Terminal CLI, React, Node.js).

---

## 1. Core Principles

1. **Components are Pure Data**: Never put business logic or methods that alter other entities inside components.
2. **Systems are Pure Logic**: Systems operate on entities queried by component types (`query: ComponentType[]`). Systems should not hold game-state; state belongs in components. Use `system.enabled` to pause/resume and `system.priority` to control execution order.
3. **Deterministic Verification (PRNG)**: Use `SeededRandom` (PCG32) for all chance/crit/evasion/loot rolls. Never use `Math.random()` in core simulation to ensure replayability and server-side anti-cheat verification.
4. **Precision & Rounding Control**: Use `CombatRoundingConfig` and `applyRounding()` to eliminate floating-point precision anomalies (e.g. `14.799999999999999` -> `15`).
5. **Save Integrity & Migrations**: Use `SaveManager` with HMAC-SHA256 checksum signatures and version migration chains to detect tampering and migrate save schemas safely.
6. **Reactive ECS & Batching**: Observe component additions, mutations, and removals via `ecs:component:updated` and `ecs:component:removed`. Use `world.batchUpdates(fn)` to suppress repetitive updates during bulk calculations.
7. **Declarative Stat Pipeline**: Use `StatPipeline` and `ExtendedStatsComponent` for arbitrary RPG attributes (STR, INT, CritRate, FireDamage, etc.) with 4-stage calculation order:
   $$\text{Final} = (\text{Base} + \sum \text{Flat}) \times (1 + \sum \text{Percent}) \times (1 + \sum \text{Amplification})$$
   and DAG-based formula dependencies with dirty flag caching.
8. **Pluggable Combat Pipeline**: Decouple damage formulas via `DamageCalculator` strategy pattern and 4-stage lifecycle middlewares (`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`). Shield damage is absorbed by `BarrierComponent` before deducting HP.
9. **High-Level Skill Execution**: Use `skillSys.canCast()` to auto-validate MP/energy, cooldowns, constraints, and alive state; use `skillSys.castSkill()` for one-stop execution.
10. **Procedural Loot & Affixes**: Use `DropTable` for independent and weighted rolls, and `AffixGenerator` to roll ARPG-style prefix/suffix pools with scaled stats.
11. **UI-Agnostic Observer & React 19 Bindings**: Subscribe directly via zero-dependency `entity.subscribe()` / `world.subscribe()`, or use `@ryuis-gamecore/react` hooks (`useEntity`, `useComponent`, `useWorldEntities`).

---

## 2. Standard Recipes & Code Examples

### A. GameWorldManager (One-line Bootstrap with Seeded PRNG)
```ts
import { GameWorldManager, StatsComponent } from 'ryuis-gamecore';

const manager = new GameWorldManager({
  seed: 'dungeon-42',
  rounding: { mode: 'round', decimals: 0 },
});

const hero = manager.world.createEntity('hero');
hero.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 25 }));
```

### B. High-Level Skill Pipeline
```ts
const skillDef = {
  id: 'fireball',
  name: '파이어볼',
  mpCost: 30,
  cooldown: 5000,
  targetType: 'single_enemy',
  effects: [{ type: 'damage', basePower: 45, damageType: 'magical' }],
};

// 1. Can Cast check
const check = manager.skillSystem.canCast(caster, skillDef);
if (check.ok) {
  // 2. Immediate Cast (deducts MP, registers cooldown, applies effects, emits events)
  const result = manager.skillSystem.castSkill(caster, [target], skillDef);
}
```

### C. SaveManager with HMAC-SHA256 & Migrations
```ts
import { SaveManager } from 'ryuis-gamecore';

// Save with tamper-evident HMAC signature
const payload = SaveManager.serialize(world, 'secret-salt', 1);

// Register schema migration v1 -> v2
SaveManager.registerMigration(1, 2, (data) => {
  // transform schema
  return data;
});

// Restore & verify
const result = SaveManager.deserialize(payload, newWorld, 'secret-salt');
if (!result.success && result.tampered) {
  console.error('Tampered save data detected!');
}
```

### D. Procedural Loot & Affix Generation
```ts
import { DropTable, AffixGenerator } from 'ryuis-gamecore';

const table = new DropTable('mob_drop', [
  { itemId: 'gold', chance: 1.0, min: 10, max: 20 },
  { itemId: 'sword', weight: 10 },
]);

const dropped = table.rollIndependent(world.random);

const affixGen = new AffixGenerator();
affixGen.registerAffix('rare', {
  id: 'flame',
  name: '화염의',
  type: 'prefix',
  stat: 'attack',
  minValue: 5,
  maxValue: 10,
});

const rolledItem = affixGen.generate({ id: 'sword', name: '검', baseStats: { attack: 20 } }, 'rare', world.random);
```

### E. Batch Updates for High-Frequency Systems
```ts
world.batchUpdates(() => {
  for (let i = 0; i < 1000; i++) {
    stats.hp = i;
    entity.notifyUpdated(StatsComponent);
  }
}); // Emits single deduplicated ecs:component:updated event
```
