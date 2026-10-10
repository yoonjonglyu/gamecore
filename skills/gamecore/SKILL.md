---
name: gamecore
description: >-
  Develops games, mechanics, and systems using the ryuis-gamecore package. Activate when
  building games with GameCore, creating components, systems, combat pipelines,
  skills, stat pipelines, inventory, equipment, progression, loot, status effects,
  turn queues, grid movement, or integrating with React/Canvas/Node.js.
---

# GameCore Developer Skill

This skill guides the design, implementation, and extension of games built on the **GameCore** framework (`ryuis-gamecore` package).

GameCore is a platform-agnostic, data-driven, ECS (Entity-Component-System) engine designed so that **data and rules remain invariant** regardless of the frontend interface (Web Canvas, PixiJS, Terminal CLI, React, Node.js).

---

## 1. Core Principles

1. **Components are Pure Data**: Store only state in components. Never place complex calculations, mutation of other entities, or I/O inside components.
2. **Systems are Pure Logic**: Systems operate on entities queried by component types (`query: ComponentType[]`). Systems should not retain internal game state. Use `system.enabled` to pause/resume and `system.priority` to control execution order.
3. **EventBus Communication**: Systems coordinate through `world.bus.emit()`, `world.bus.on()`, and `world.bus.once()` to remain loosely coupled.
4. **Data-Driven Prefabs**: Avoid hardcoding `new StatsComponent()` directly in game scenes. Define master catalogs in `DataManager` and instantiate entities via `EntityFactory.spawn(blueprintId)`.
5. **Declarative Stat Pipeline**: Use `StatPipeline` and `ExtendedStatsComponent` for arbitrary RPG attributes (STR, INT, CritRate, FireDamage, etc.) with 4-stage calculation order:
   $$\text{Final} = (\text{Base} + \sum \text{Flat}) \times (1 + \sum \text{Percent}) \times (1 + \sum \text{Amplification})$$
   and DAG-based formula dependencies with dirty flag caching.
6. **Pluggable Combat Pipeline**: Decouple damage formulas via `DamageCalculator` strategy pattern and 4-stage lifecycle middlewares (`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`). Shield damage is absorbed by `BarrierComponent` before deducting HP.
7. **Time Abstraction**: Systems support `update(entities, delta, mode?: 'turn' | 'realtime')`. Drive execution flexibly for turn-based or real-time loop.
8. **UI-Agnostic Observer & React 19 Bindings**: Subscribe directly to entity or world changes via zero-dependency `entity.subscribe()` / `world.subscribe()`, or use `@ryuis-gamecore/react` hooks (`useEntity`, `useComponent`, `useWorldEntities`).

---

## 2. Standard Game Development Workflow

### Step 1: Initialize Master Data (`DataManager`)
```ts
import { DataManager, World, EntityFactory } from 'ryuis-gamecore';

const data = new DataManager();

// 1. Items
data.items.register({
  id: 'sword_iron',
  name: 'Iron Sword',
  category: 'weapon',
  spec: { weaponType: 'sword', attack: 15, critRate: 0.05 },
});

// 2. Skills
data.skills.register({
  id: 'fireball',
  name: 'Fireball',
  mpCost: 15,
  cooldown: 2000,
  targetType: 'single_enemy',
  effects: [
    { type: 'damage', basePower: 30, scaling: { attack: 1.2 } },
    { type: 'status', statusId: 'burn', chance: 0.5, duration: 3000 },
  ],
});

// 3. Blueprints (Prefabs)
data.blueprints.register({
  id: 'goblin',
  tags: ['enemy'],
  identity: { name: 'Goblin' },
  stats: { maxHp: 50, attack: 10, defense: 3, speed: 6 },
  extendedStats: {
    baseStats: { str: 10, dex: 12, fireResist: 0.1 },
    definitions: [
      {
        name: 'critRate',
        dependencies: ['dex'],
        formula: (r) => r.get('dex') * 0.01,
      },
    ],
  },
  skills: ['fireball'],
  inventory: [{ itemId: 'sword_iron', count: 1 }],
  equipment: { weapon: 'sword_iron' },
});
```

### Step 2: Assemble World & Systems
```ts
import {
  World,
  CombatSystem,
  SkillSystem,
  StatusEffectSystem,
  InventorySystem,
  EquipmentSystem,
  StatModSystem,
  ProgressionSystem,
  LootSystem,
  TurnSystem,
  MovementSystem,
} from 'ryuis-gamecore';

const world = new World();
const statMods = new StatModSystem();
const statusSystem = new StatusEffectSystem();

world.addSystem(new CombatSystem());
world.addSystem(statMods);
world.addSystem(statusSystem);
world.addSystem(new SkillSystem(undefined, statMods));
world.addSystem(new InventorySystem());
world.addSystem(new EquipmentSystem(data, undefined, statMods));
world.addSystem(new ProgressionSystem());
world.addSystem(new LootSystem());
```

### Step 3: Spawn Entities with EntityFactory
```ts
const factory = new EntityFactory(world, data);

// Standard spawn
const player = factory.spawn('hero');

// Override spawn (boss variant, elite mob)
const boss = factory.spawn('goblin', {
  name: 'Goblin Warlord',
  tags: ['boss'],
  overrideStats: { maxHp: 300, attack: 25 },
});
```

---

## 3. Core Architecture Patterns

### Pattern A: Custom Stat Pipeline & Dynamic Resources
```ts
import { ExtendedStatsComponent } from 'ryuis-gamecore';

const stats = new ExtendedStatsComponent({
  baseStats: { str: 20, dex: 15, int: 10 },
  currentResources: { hp: 100, stamina: 100 },
});

// 1. Define derived stat formula (DAG dependency)
stats.defineStat({
  name: 'patk',
  dependencies: ['str', 'dex'],
  formula: (r) => r.get('str') * 2.0 + r.get('dex') * 0.8,
});

// 2. Add 4-stage modifiers (Flat, Percent, Amplification)
stats.addModifier({ sourceId: 'buff:rage', stat: 'patk', flat: 10, percent: 0.2, amplification: 0.1 });

// 3. Fast O(1) query with dirty flag caching
const finalAtk = stats.get('patk');
const allStats = stats.toRecord(); // { str: 20, dex: 15, patk: 68.2, ... }
```

### Pattern B: Pluggable Combat Pipeline & Barriers
```ts
import { CombatSystem, BarrierComponent, DamageCalculator } from 'ryuis-gamecore';

class LoLDamageCalculator implements DamageCalculator {
  calculate(ctx) {
    const reduction = 100 / (100 + ctx.targetDefense);
    return Math.round(ctx.rawDamage * reduction);
  }
}

const combat = new CombatSystem({ calculator: new LoLDamageCalculator() });

// Add Barrier (absorbs damage before HP is deducted)
target.add(new BarrierComponent({ current: 50, max: 50 }));

// Attack request with pure parameters
combat.requestAttack({
  attackerId: hero.id,
  targetId: boss.id,
  damageType: 'physical',
  armorPen: 0.3,
  lifesteal: 0.2,
});
```

### Pattern C: StatusEffectSystem & DoT Lifecycle
```ts
import { StatusEffectSystem } from 'ryuis-gamecore';

const statusSystem = new StatusEffectSystem();
world.addSystem(statusSystem);

// Apply burn (DoT) and link a temporary stat modifier
statusSystem.applyStatus(enemy, 'burn', 3000, hero.id, 1, 1, {
  tickInterval: 1000,
  tickDamage: 15,
  linkedModifiers: [{ sourceId: 'slow', stat: 'speed', flat: -3 }],
});

// Ticks deal damage every 1000ms.
// When 'burn' expires after 3000ms, 'slow' modifier is automatically rolled back!
```

### Pattern D: Zero-Dependency Observer & React 19 Bindings
```ts
// 1. Zero-dependency Core Observer
entity.subscribe((entity, change) => {
  console.log(`Entity ${entity.id} updated: ${change.type}`);
});

world.subscribe((world, change) => {
  console.log(`World change: ${change.type}`);
});

// 2. React 19 useSyncExternalStore Hooks
import { useEntity, useComponent, useWorldEntities } from 'ryuis-gamecore/react';

function HealthBar({ hero }: { hero: Entity }) {
  useEntity(hero);
  const stats = useComponent(hero, StatsComponent);
  return <progress value={stats?.hp} max={stats?.maxHp} />;
}
```

---

## 4. World Lifecycle & Cleanups

* **Clear All Entities (Scene/Stage Reset)**:
  `world.clearEntities()` clears all entities while retaining registered systems and EventBus listeners.
* **Entity Pooling & Reset**:
  `entity.clear()` resets all components and tags for reuse in object pools.
* **Test Isolation**:
  `Entity.resetIdCounter()` resets the global entity ID counter back to 0.
* **System Pause/Resume**:
  Set `system.enabled = false` to pause systems (e.g. during menus, dialogue, or cutscenes).
* **System Execution Priority**:
  Assign `system.priority` (higher numbers execute first) to control pipeline order.

---

## 5. Anti-Patterns to Avoid

- ❌ **Direct stat mutation for temporary buffs**: Do NOT do `stats.attack += 10`. Use `StatModsComponent` or `ExtendedStatsComponent.addModifier()`.
- ❌ **Hardcoded entity setup**: Avoid manual `new StatsComponent()` scattered inside scene scripts. Define blueprints in `DataManager` and call `factory.spawn()`.
- ❌ **Direct inter-system coupling**: Do not import system instances into each other if an event can express the intent (`world.bus.emit('stats:died')`).
- ❌ **Ignoring lifecycle cleanups**: Always use `statusSystem.applyStatus()` with `linkedModifiers` so modifiers are safely cleaned up when statuses expire.
