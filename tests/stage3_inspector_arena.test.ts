import { describe, it, expect } from 'vitest';
import {
  World,
  WorldInspector,
  GameWorldManager,
  CueQueue,
  DataManager,
  StatsComponent,
  PositionComponent,
} from '../src';
import { WorldInspector as CoreEntryInspector } from '../src/entries/core';
import { runAuthoritativeArenaDemo } from '../examples/authoritative_arena';

describe('Stage 3: WorldInspector, GameWorldManager DX & Authoritative Demo', () => {
  it('inspects entities/worlds, computes structural diffWorlds, and tracks bounded event timelines', () => {
    const w1 = new World({ seed: 'insp-1' });
    const w2 = new World({ seed: 'insp-1' });

    const e1 = w1.createEntity('hero', 'alive');
    e1.add(new StatsComponent({ hp: 100, maxHp: 100 })).add(new PositionComponent({ x: 1, y: 2 }));
    w1.blackboard.set('stage', 1);
    w1.blackboard.set('removedKey', true);

    const e2 = w2.createEntity('hero');
    e2.add(new StatsComponent({ hp: 80, maxHp: 100 })).add(new PositionComponent({ x: 1, y: 2 }));
    w2.createEntity('npc').add(new StatsComponent({ hp: 50, maxHp: 50 }));
    w2.blackboard.set('stage', 2);
    w2.blackboard.set('addedKey', 'ok');

    const entitySnap = WorldInspector.inspectEntity(e1);
    expect(entitySnap.tags).toEqual(['alive', 'hero']);
    expect(entitySnap.components.StatsComponent).toBeDefined();

    const worldSnap = WorldInspector.inspectWorld(w1, { tag: 'hero', includeHash: true });
    expect(worldSnap.entityCount).toBe(1);
    expect(worldSnap.hash).toHaveLength(64);
    expect(worldSnap.blackboard.stage).toBe(1);

    const diff = WorldInspector.diffWorlds(w1, w2);
    expect(diff.equal).toBe(false);
    expect(diff.addedEntityIds).toEqual([1]);
    expect(diff.changedEntities).toEqual([
      {
        entityId: 0,
        addedTags: [],
        removedTags: ['alive'],
        changedComponents: ['StatsComponent'],
      },
    ]);
    expect(diff.blackboardDiff).toEqual({
      added: ['addedKey'],
      removed: ['removedKey'],
      changed: ['stage'],
    });

    const inspector = new WorldInspector(w1, { maxEvents: 2 });
    inspector.attach(['blackboard:changed']);
    w1.blackboard.set('k', 1);
    w1.blackboard.set('k', 2);
    w1.blackboard.set('k', 3);

    const timeline = inspector.getTimeline();
    expect(timeline.length).toBe(2);
    expect(timeline[0].seq).toBe(2);
    expect(timeline[1].seq).toBe(3);

    inspector.destroy();
    inspector.clearTimeline();
    w1.blackboard.set('k', 4);
    expect(inspector.getTimeline().length).toBe(0);
    expect(CoreEntryInspector).toBe(WorldInspector);
  });

  it('wires cueQueue, data, and registerModule cleanly in GameWorldManager', () => {
    const cues = new CueQueue();
    const data = new DataManager({
      items: [{ id: 'dagger', name: 'Dagger', category: 'weapon', spec: { weaponType: 'dagger', attack: 10 } }],
    });

    let pluginRan = false;
    const mgr = new GameWorldManager({
      seed: 'dx-1',
      cueQueue: cues,
      data,
    }).registerModule((m) => {
      pluginRan = true;
      expect(m.cues).toBe(cues);
      expect(m.data).toBe(data);
    });

    expect(pluginRan).toBe(true);
    expect(mgr.combatSystem).toBeDefined();
    expect(mgr.statusEffectSystem?.cueQueue).toBe(cues);

    const a = mgr.world.createEntity().add(new StatsComponent({ hp: 100, maxHp: 100, attack: 20 }));
    const b = mgr.world.createEntity().add(new StatsComponent({ hp: 100, maxHp: 100, defense: 0 }));

    mgr.enqueue('combat:attack', {
      attackerId: a.id,
      targetId: b.id,
      cue: { sfx: 'hit.wav', vfx: 'spark' },
    }, { tick: 1 });
    mgr.step(1);

    expect(cues.flush().length).toBe(1);
  });

  it('runs authoritative arena server + client reconciliation demo with zero final world diff', () => {
    const result = runAuthoritativeArenaDemo();
    expect(result.reconcileResult.matched).toBe(false);
    expect(result.reconcileResult.rollbackPerformed).toBe(true);
    expect(result.reconcileResult.replayedCommands).toBe(1);
    expect(result.diffAfterReconcile.equal).toBe(true);
    expect(result.serverHeroHp).toBe(result.clientHeroHp);
    expect(result.serverCuesCount).toBeGreaterThanOrEqual(1);
  });
});
