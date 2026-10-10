import { describe, it, expect, vi } from 'vitest';
import {
  World,
  Blackboard,
  TimerScheduler,
  FSMComponent,
  FSMSystem,
  SpatialHashGrid,
  QuestsComponent,
  QuestSystem,
  CueQueue,
  createCue,
  CombatPipeline,
  DefaultDamageCalculator,
  DefaultPreHitMiddleware,
  StatsComponent,
  ProgressionComponent,
  InventoryComponent,
  defaultWorldSerializer,
} from '../src';

describe('v1.0.0 Feature Suite', () => {
  // ─── 1. Blackboard ─────────────────────────────────
  describe('Blackboard (Global State & Flags)', () => {
    it('should set, get, toggle, and increment values', () => {
      const bb = new Blackboard();
      bb.set('stage', 1);
      bb.set('boss_defeated', false);

      expect(bb.get('stage')).toBe(1);
      expect(bb.has('stage')).toBe(true);

      bb.increment('stage', 2);
      expect(bb.get('stage')).toBe(3);

      bb.toggle('boss_defeated');
      expect(bb.get('boss_defeated')).toBe(true);

      expect(bb.toJSON()).toEqual({ stage: 3, boss_defeated: true });

      const bb2 = new Blackboard();
      bb2.fromJSON({ stage: 5, difficulty: 'hard' });
      expect(bb2.get('stage')).toBe(5);
      expect(bb2.get('difficulty')).toBe('hard');
    });

    it('should notify subscribers and integrate with World events', () => {
      const world = new World();
      const events: Array<{ key: string; prev: any; next: any }> = [];

      world.events.on('blackboard:changed', (data) => {
        events.push(data);
      });

      world.blackboard.set('chapter', 'prologue');
      world.blackboard.set('chapter', 'act1');

      expect(events.length).toBe(2);
      expect(events[1]).toEqual({ key: 'chapter', prev: 'prologue', next: 'act1' });
    });
  });

  // ─── 2. TimerScheduler ─────────────────────────────
  describe('TimerScheduler (Time & Turn Delay/Repeat)', () => {
    it('should trigger delayed tasks after specified ms', () => {
      const scheduler = new TimerScheduler();
      const fn = vi.fn();

      scheduler.schedule(100, fn);

      scheduler.update(50, 'time');
      expect(fn).not.toHaveBeenCalled();

      scheduler.update(60, 'time');
      expect(fn).toHaveBeenCalledTimes(1);

      // 추가 업데이트 시 다시 실행되지 않음
      scheduler.update(100, 'time');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should repeat intervals and respect times limit', () => {
      const scheduler = new TimerScheduler();
      const fn = vi.fn();

      scheduler.scheduleEvery(100, fn, 3);

      scheduler.update(250, 'time'); // 100, 200 두 번 발생
      expect(fn).toHaveBeenCalledTimes(2);

      scheduler.update(100, 'time'); // 300 세 번째 발생 후 완료
      expect(fn).toHaveBeenCalledTimes(3);

      scheduler.update(500, 'time');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should support turn-based scheduling via World.update', () => {
      const world = new World();
      const fn = vi.fn();

      world.scheduleTurns(3, fn);

      world.update(1, 'turn');
      world.update(1, 'turn');
      expect(fn).not.toHaveBeenCalled();

      world.update(1, 'turn');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 3. FSM (Finite State Machine) ──────────────────
  describe('FSMComponent & FSMSystem', () => {
    it('should enforce state transitions and action flags', () => {
      const fsm = new FSMComponent({
        initialState: 'idle',
        states: {
          idle: {
            canMove: true,
            canCast: true,
            canAttack: true,
            allowedTransitions: ['moving', 'casting', 'stunned'],
          },
          casting: {
            canMove: false,
            canCast: false,
            canAttack: false,
            duration: 1000,
            autoTransitionTo: 'idle',
            allowedTransitions: ['idle', 'stunned'],
          },
          stunned: {
            canMove: false,
            canCast: false,
            canAttack: false,
            allowedTransitions: ['idle'],
          },
        },
      });

      expect(fsm.currentState).toBe('idle');
      expect(fsm.canMove).toBe(true);

      // 허용되지 않은 전이 시도 (idle -> unknown)
      expect(fsm.transitionTo('non_existent')).toBe(false);

      // 허용된 전이 (idle -> casting)
      expect(fsm.transitionTo('casting')).toBe(true);
      expect(fsm.currentState).toBe('casting');
      expect(fsm.canMove).toBe(false);
      expect(fsm.canCast).toBe(false);

      // casting -> moving 시도 (허용 안 됨)
      expect(fsm.transitionTo('moving')).toBe(false);
      expect(fsm.currentState).toBe('casting');
    });

    it('should auto-transition based on duration via FSMSystem', () => {
      const world = new World();
      const fsmSystem = new FSMSystem();
      world.addSystem(fsmSystem);

      const entity = world.createEntity();
      const fsm = new FSMComponent({
        initialState: 'casting',
        states: {
          casting: {
            canMove: false,
            duration: 500,
            autoTransitionTo: 'idle',
            allowedTransitions: ['idle'],
          },
          idle: {
            canMove: true,
            allowedTransitions: ['casting'],
          },
        },
      });
      entity.add(fsm);

      world.update(300);
      expect(fsm.currentState).toBe('casting');

      world.update(250); // 총 550ms 경과 -> idle로 자동 전이
      expect(fsm.currentState).toBe('idle');
      expect(fsm.canMove).toBe(true);
    });
  });

  // ─── 4. SpatialHashGrid (2D Continuous Space) ──────
  describe('SpatialHashGrid (2D Continuous Space)', () => {
    it('should insert, query by radius, and update entity positions', () => {
      const grid = new SpatialHashGrid({ cellSize: 100 });

      grid.insert(1, 50, 50);
      grid.insert(2, 60, 50); // 거리 10
      grid.insert(3, 200, 200); // 멀리 있음

      // 반경 50 내 검색
      const nearby = grid.queryRadius(50, 50, 50);
      expect(nearby.length).toBe(2);
      expect(nearby[0].entityId).toBe(1);
      expect(nearby[1].entityId).toBe(2);

      // 엔티티 이동
      grid.update(3, 55, 50);
      const nearbyAfterMove = grid.queryRadius(50, 50, 50);
      expect(nearbyAfterMove.length).toBe(3);

      // 엔티티 삭제
      grid.remove(1);
      const afterRemove = grid.queryRadius(50, 50, 50);
      expect(afterRemove.map((n) => n.entityId)).not.toContain(1);
    });

    it('should query entities within an AABB box', () => {
      const grid = new SpatialHashGrid({ cellSize: 50 });
      grid.insert(10, 10, 10);
      grid.insert(20, 40, 40);
      grid.insert(30, 150, 150);

      const insideBox = grid.queryAABB(0, 0, 50, 50);
      expect(insideBox).toEqual(expect.arrayContaining([10, 20]));
      expect(insideBox).not.toContain(30);
    });
  });

  // ─── 5. QuestsComponent & QuestSystem ───────────────
  describe('QuestsComponent & QuestSystem', () => {
    it('should track quest progress, auto-complete, and reward progression', () => {
      const world = new World();
      const questSystem = new QuestSystem(world);

      const player = world.createEntity('player');
      const quests = new QuestsComponent([
        {
          id: 'q_goblin_hunter',
          title: 'Goblin Hunter',
          autoComplete: true,
          autoReward: true,
          objectives: [
            { id: 'kill_goblin', type: 'kill', target: 2, current: 0, completed: false },
          ],
          rewards: {
            exp: 150,
          },
        },
      ]);
      const prog = new ProgressionComponent({ level: 1, currentExp: 0 });
      player.add(quests);
      player.add(prog);

      const questEvents: string[] = [];
      world.events.on('quest:completed', (data) => {
        questEvents.push(`completed:${data.questId}`);
      });
      world.events.on('quest:rewarded', (data) => {
        questEvents.push(`rewarded:${data.questId}`);
      });

      // 몬스터 처치 이벤트 발생 (1/2)
      world.events.emit('stats:died', { entityId: 999 });
      const qInstance = quests.getQuest('q_goblin_hunter')!;
      expect(qInstance.objectives[0].current).toBe(1);
      expect(qInstance.state).toBe('active');

      // 몬스터 처치 이벤트 발생 (2/2) -> 완료 및 보상 자동 지급
      world.events.emit('stats:died', { entityId: 1000 });
      expect(qInstance.objectives[0].current).toBe(2);
      expect(qInstance.state).toBe('rewarded');
      expect(prog.level).toBe(2);
      expect(prog.currentExp).toBe(50);

      expect(questEvents).toContain('completed:q_goblin_hunter');
      expect(questEvents).toContain('rewarded:q_goblin_hunter');

      questSystem.destroy();
    });
  });

  // ─── 6. CueProtocol & Presentation Queue ───────────
  describe('CueProtocol & CueQueue', () => {
    it('should enqueue visual/audio cues and flush in frame batches', () => {
      const queue = new CueQueue();
      const listenerCues: any[] = [];
      queue.subscribe((c) => listenerCues.push(c));

      queue.emit('combat:hit', {
        sfx: 'slash_heavy.wav',
        vfx: 'blood_splatter',
        shake: { intensity: 12, duration: 200 },
      }, 1, 2);

      expect(queue.length).toBe(1);
      expect(listenerCues.length).toBe(1);
      expect(listenerCues[0].payload.sfx).toBe('slash_heavy.wav');

      const flushed = queue.flush();
      expect(flushed.length).toBe(1);
      expect(queue.length).toBe(0);
    });
  });

  // ─── 7. World Serialization with Blackboard & FSM ──
  describe('World Serialization (Blackboard + FSM + Quests)', () => {
    it('should preserve blackboard and FSM/Quest components in save/load cycle', () => {
      const world1 = new World();
      world1.blackboard.set('stage', 4);
      world1.blackboard.set('hero_title', 'Champion');

      const hero = world1.createEntity('hero');
      hero.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 25 }));
      hero.add(new FSMComponent({
        initialState: 'stunned',
        states: {
          stunned: { canMove: false, canCast: false, canAttack: false },
          idle: { canMove: true, canCast: true, canAttack: true },
        },
      }));

      // 직렬화
      const serialized = defaultWorldSerializer.serialize(world1);
      expect(serialized.blackboard).toEqual({ stage: 4, hero_title: 'Champion' });

      // 새 월드로 복원
      const world2 = new World();
      defaultWorldSerializer.deserialize(serialized, world2);

      expect(world2.blackboard.get('stage')).toBe(4);
      expect(world2.blackboard.get('hero_title')).toBe('Champion');

      const loadedHero = world2.entities[0];
      const loadedFSM = loadedHero.get(FSMComponent)!;
      expect(loadedFSM.currentState).toBe('stunned');
      expect(loadedFSM.canMove).toBe(false);
    });
  });
});
