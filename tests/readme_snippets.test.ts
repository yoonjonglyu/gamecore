import { describe, it, expect } from 'vitest';
import {
  GameWorldManager,
  StatsComponent,
  FSMComponent,
  PositionComponent,
  WorldDiffer,
  HierarchyComponent,
  HierarchySystem,
  SaveManager,
  World,
  Entity,
} from '../src';

describe('README Code Snippets Exact Parity Test', () => {
  it('Recipe 1: Quickstart (60 Seconds) runs without errors', () => {
    // 1. Create a deterministic game world
    const manager = new GameWorldManager({
      seed: 'dungeon-run-42',
      rounding: { mode: 'round', decimals: 0 },
    });

    // 2. Set global flags
    manager.world.blackboard.set('dungeon_level', 1);
    expect(manager.world.blackboard.get('dungeon_level')).toBe(1);

    // 3. Schedule a delayed event
    let scheduledFired = false;
    manager.world.schedule(1000, () => {
      scheduledFired = true;
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

    // 5. Run simulation tick
    manager.update(16);
    expect(hero.get(PositionComponent)?.x).toBe(100);

    // Advance 1000ms
    manager.update(1000);
    expect(scheduledFired).toBe(true);
  });

  it('Recipe 2: Multiplayer Delta Synchronization (WorldDiffer static)', () => {
    const serverWorld = new World({ seed: 'server-seed' });
    const hero = serverWorld.createEntity();
    hero.add(new PositionComponent(10, 20));

    // Server side: Capture snapshot and create diff
    const prev = WorldDiffer.captureSnapshot(serverWorld);
    // ... simulate game ...
    hero.get(PositionComponent)!.x = 55;
    const delta = WorldDiffer.createDelta(prev, serverWorld);

    // Client side: Apply lightweight network patch in one line
    const clientWorld = new World({ seed: 'client-seed' });
    WorldDiffer.applyDelta(clientWorld, delta);

    expect(clientWorld.getEntity(hero.id)?.get(PositionComponent)?.x).toBe(55);
  });

  it('Recipe 3: Entity Hierarchy Attachments (HierarchySystem)', () => {
    const world = new World();
    world.addSystem(new HierarchySystem());

    const mount = world.createEntity('mount');
    mount.add(new PositionComponent(100, 100));

    const rider = world.createEntity('rider');
    rider.add(new PositionComponent(0, 0));
    rider.add(new HierarchyComponent({
      parentId: mount.id,
      offsetX: 0,
      offsetY: -15, // Rider sits 15 units above mount
      cascadeDestroy: true,
    }));

    world.update(16); // Rider position automatically updates to (100, 85)
    expect(rider.get(PositionComponent)?.y).toBe(85);
  });

  it('Recipe 4: Save Tamper-Proofing with HMAC Signatures', () => {
    const world = new World();
    const hero = world.createEntity();
    hero.add(new StatsComponent({ hp: 100 }));

    // Serialize with custom metadata and secret key
    const saveStr = SaveManager.serialize(world, 'player-secret-key', 1, {
      metadata: { gachaPity: 45, chapter: 3 },
    });

    // Restore with cryptographic verification
    const restoredWorld = new World();
    const result = SaveManager.deserialize(saveStr, restoredWorld, 'player-secret-key');
    expect(result.success).toBe(true);
    if (result.success && result.metadata) {
      expect(result.metadata.gachaPity).toBe(45);
    }
  });

  it('Feature: World.hash() produces deterministic SHA-256 for desync detection', () => {
    Entity.resetIdCounter(0);
    const w1 = new World({ seed: 777 });
    const e1 = w1.createEntity();
    e1.add(new PositionComponent(10, 20));
    e1.add(new StatsComponent({ hp: 50 }));
    w1.blackboard.set('stage', 1);

    Entity.resetIdCounter(0);
    const w2 = new World({ seed: 777 });
    const e2 = w2.createEntity();
    e2.add(new PositionComponent(10, 20));
    e2.add(new StatsComponent({ hp: 50 }));
    w2.blackboard.set('stage', 1);

    const hash1 = w1.hash();
    const hash2 = w2.hash();

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);

    // 상태 변경 시 즉시 해시 변경 감지 (Desync detection)
    e1.get(StatsComponent)!.hp = 49;
    expect(w1.hash()).not.toBe(hash2);
  });
});
