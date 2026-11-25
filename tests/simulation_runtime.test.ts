import { describe, it, expect, vi } from 'vitest';
import {
  World,
  GameWorldManager,
  CommandBus,
  FixedStepRunner,
  ReplayRecorder,
  StatsComponent,
  SkillsComponent,
  InventoryComponent,
  EquipmentComponent,
  PositionComponent,
  FSMComponent,
  TurnComponent,
  GridMap,
} from '../src';

describe('Simulation Runtime: CommandBus & FixedStepRunner (v1.2.0)', () => {
  describe('CommandBus', () => {
    it('supports register, unregister, hasHandler, validation, middleware, and error isolation', () => {
      const world = new World({ seed: 'cmd-1' });
      const bus = new CommandBus<{ ping: { count: number }; secret: { ok: boolean } }>();
      bus.bindEventBus(world.bus);

      const dispatched: any[] = [];
      const rejected: any[] = [];
      world.bus.on('command:dispatched', (e) => dispatched.push(e));
      world.bus.on('command:rejected', (e) => rejected.push(e));

      const hookCalls: boolean[] = [];
      const unsubHook = bus.onDispatched((res) => hookCalls.push(res.ok));

      // Missing handler -> rejected cleanly
      const missing = bus.dispatch('ping', { count: 1 }, { tick: 1 });
      expect(missing.ok).toBe(false);
      expect(rejected.length).toBe(1);

      // Register with validator
      let lastSeenCount = 0;
      bus.register(
        'ping',
        (payload) => {
          lastSeenCount = payload.count;
          payload.count = 999; // Mutating internal payload must not mutate caller object
        },
        (payload) => (payload.count > 0 ? true : { ok: false, reason: 'count must be > 0' }),
      );
      expect(bus.hasHandler('ping')).toBe(true);

      const callerObj = { count: 5 };
      const okRes = bus.dispatch('ping', callerObj, { actorId: 'p1', tick: 2 });
      expect(okRes.ok).toBe(true);
      expect(lastSeenCount).toBe(5);
      expect(callerObj.count).toBe(5);
      expect(dispatched.length).toBe(1);

      // Per-command validator rejection
      const badVal = bus.dispatch('ping', { count: 0 }, { tick: 3 });
      expect(badVal.ok).toBe(false);
      expect(badVal.reason).toBe('count must be > 0');

      // Middleware rejection & unsubscribe
      const unsubMw = bus.addMiddleware((cmd) =>
        cmd.actorId === 'banned' ? { ok: false, reason: 'banned actor' } : true,
      );
      const bannedRes = bus.dispatch('ping', { count: 2 }, { actorId: 'banned', tick: 4 });
      expect(bannedRes.ok).toBe(false);
      expect(bannedRes.reason).toBe('banned actor');
      unsubMw();
      expect(bus.dispatch('ping', { count: 2 }, { actorId: 'banned', tick: 5 }).ok).toBe(true);

      // Exception inside handler is caught cleanly
      bus.register('secret', () => {
        throw new Error('handler crashed');
      });
      const throwRes = bus.dispatch('secret', { ok: true }, { tick: 6 });
      expect(throwRes.ok).toBe(false);
      expect(throwRes.reason).toBe('handler crashed');

      unsubHook();
      bus.unregister('ping');
      expect(bus.hasHandler('ping')).toBe(false);
      expect(hookCalls.length).toBe(6);
    });

    it('defers future-tick queued commands until flush reaches their tick and records to ReplayRecorder', () => {
      const bus = new CommandBus<{ act: { step: number } }>();
      const recorder = new ReplayRecorder('rec-seed', { timestamp: 1000 });
      bus.bindRecorder(recorder);

      const seen: number[] = [];
      bus.register('act', (p) => seen.push(p.step));

      bus.enqueue('act', { step: 3 }, { tick: 3 });
      bus.enqueue('act', { step: 1 }, { tick: 1 });
      bus.enqueue('act', { step: 0 }); // immediate due on next flush

      expect(bus.pendingCount).toBe(3);
      bus.flush(1);
      expect(seen).toEqual([1, 0]);
      expect(bus.pendingCount).toBe(1);

      bus.flush(2);
      expect(seen).toEqual([1, 0]);

      bus.flush(3);
      expect(seen).toEqual([1, 0, 3]);
      expect(bus.pendingCount).toBe(0);

      const data = JSON.parse(recorder.toJSON());
      expect(data.actions.map((a: any) => [a.tick, a.payload.step])).toEqual([
        [1, 1],
        [1, 0],
        [3, 3],
      ]);
    });
  });

  describe('FixedStepRunner', () => {
    it('advances fixed steps deterministically across variable deltas, computes alpha, and clamps spiral of death', () => {
      const world = new World({ seed: 'runner-1' });
      const ticks: number[] = [];
      world.bus.on('simulation:tick', (e) => ticks.push(e.tick));

      const runner = new FixedStepRunner(world, {
        stepMs: 20,
        maxStepsPerFrame: 4,
      });

      const r1 = runner.advance(30); // 1 step, 10ms remaining -> alpha 0.5
      expect(r1.stepsExecuted).toBe(1);
      expect(r1.currentTick).toBe(1);
      expect(r1.accumulatorMs).toBe(10);
      expect(r1.alpha).toBeCloseTo(0.5, 6);
      expect(r1.clamped).toBe(false);

      const r2 = runner.advance(10); // completes step 2 cleanly
      expect(r2.stepsExecuted).toBe(1);
      expect(r2.currentTick).toBe(2);
      expect(r2.accumulatorMs).toBe(0);
      expect(r2.alpha).toBe(0);

      // Spiral-of-death clamp (> maxStepsPerFrame * stepMs = 80ms)
      const r3 = runner.advance(500);
      expect(r3.stepsExecuted).toBe(4);
      expect(r3.currentTick).toBe(6);
      expect(r3.clamped).toBe(true);

      // Pause blocks stepping
      world.pause();
      const r4 = runner.advance(100);
      expect(r4.stepsExecuted).toBe(0);
      expect(runner.step(5)).toBe(0);

      world.resume();
      expect(ticks).toEqual([1, 2, 3, 4, 5, 6]);

      // Export & import runner state
      const state = runner.exportState();
      expect(state.tick).toBe(6);
      runner.reset();
      expect(runner.tick).toBe(0);
      runner.importState(state);
      expect(runner.tick).toBe(6);
    });
  });

  describe('GameWorldManager Integration & CoreCommands', () => {
    it('routes built-in CoreCommands, records automatically, and detects both valid replays and tampering', () => {
      function createArena(seed: string) {
        const mgr = new GameWorldManager({ seed, stepMs: 16 });
        mgr.movementSystem!.map = GridMap.fromASCII(['.....', '.....'], {
          '.': { type: 'floor', walkable: true },
        });

        const hero = mgr.world.createEntity('hero');
        hero
          .add(new PositionComponent({ x: 0, y: 0 }))
          .add(new StatsComponent({ hp: 100, maxHp: 100, mp: 50, maxMp: 50, attack: 25, speed: 12 }))
          .add(new InventoryComponent({ maxSlots: 10 }))
          .add(new EquipmentComponent())
          .add(new TurnComponent({ maxActionPoints: 2 }))
          .add(
            new FSMComponent({
              initialState: 'idle',
              states: {
                idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['guard'] },
                guard: { canMove: false, duration: 32, autoTransitionTo: 'idle' },
              },
            }),
          )
          .add(
            new SkillsComponent([
              {
                id: 'slash',
                name: 'Slash',
                mpCost: 10,
                cooldown: 100,
                targetType: 'single_enemy',
                effects: [{ type: 'damage', basePower: 15 }],
              },
            ]),
          );

        const slime = mgr.world.createEntity('slime');
        slime
          .add(new PositionComponent({ x: 3, y: 0 }))
          .add(new StatsComponent({ hp: 80, maxHp: 80, attack: 5, defense: 0, speed: 8 }))
          .add(new TurnComponent({ maxActionPoints: 1 }));

        return { mgr, hero, slime };
      }

      const sim = createArena('arena-v120');
      sim.mgr.turnSystem!.startRound(sim.mgr.world.entities);
      sim.mgr.startRecording({ checkpointInterval: 1 });

      expect(sim.mgr.dispatch('inventory:add', { entityId: sim.hero.id, itemId: 'potion', quantity: 3 }).ok).toBe(true);
      expect(sim.mgr.dispatch('movement:move', { entityId: sim.hero.id, targetX: 1, targetY: 0 }).ok).toBe(true);
      sim.mgr.step(1);

      expect(sim.mgr.dispatch('combat:attack', { attackerId: sim.hero.id, targetId: sim.slime.id }).ok).toBe(true);
      sim.mgr.step(1);

      expect(
        sim.mgr.dispatch('skill:use', { casterId: sim.hero.id, skillId: 'slash', targetIds: [sim.slime.id] }).ok,
      ).toBe(true);
      sim.mgr.step(1);

      expect(sim.mgr.dispatch('inventory:remove', { entityId: sim.hero.id, itemId: 'potion', quantity: 1 }).ok).toBe(true);
      expect(sim.mgr.dispatch('fsm:transition', { entityId: sim.hero.id, nextState: 'guard' }).ok).toBe(true);
      expect(sim.mgr.dispatch('turn:end', { entityId: sim.hero.id }).ok).toBe(true);
      sim.mgr.step(2);

      const expectedHash = sim.mgr.world.hash();
      const replayData = sim.mgr.stopRecording()!;
      expect(replayData.actions.length).toBe(7);
      expect(replayData.checkpoints.length).toBeGreaterThanOrEqual(2);

      expect(sim.hero.get(InventoryComponent)!.getQuantity('potion')).toBe(2);
      expect(sim.hero.get(PositionComponent)!.x).toBe(1);
      expect(sim.slime.get(StatsComponent)!.hp).toBeLessThan(80);

      // Replay into fresh world
      const replayArena = createArena('arena-v120');
      replayArena.mgr.turnSystem!.startRound(replayArena.mgr.world.entities);
      const result = replayArena.mgr.runner.replay(replayData);
      expect(result.completed).toBe(true);
      expect(result.desynced).toBe(false);
      expect(replayArena.mgr.world.hash()).toBe(expectedHash);

      // Mutate an action in replay and confirm desync detection
      const tampered = structuredClone(replayData);
      tampered.actions = tampered.actions.map((a, idx) =>
        idx === 2 ? { ...a, actionType: 'inventory:add', payload: { entityId: sim.hero.id, itemId: 'cheat', quantity: 99 } } : a,
      );
      const cheatArena = createArena('arena-v120');
      cheatArena.mgr.turnSystem!.startRound(cheatArena.mgr.world.entities);
      const cheatResult = cheatArena.mgr.runner.replay(tampered);
      expect(cheatResult.desynced).toBe(true);
    });
  });
});
