import { describe, it, expect, vi } from 'vitest';
import {
  World,
  SeededRandom,
  StatsComponent,
  PositionComponent,
  FSMComponent,
  SpatialGridSystem,
  StatAdapter,
  WorldSerializer,
  SaveManager,
  WorldDiffer,
  System,
} from '../src';

describe('v1.1.0 Enhancements Suite', () => {
  // ─── 1. Optional PRNG State Serialization ─────────
  describe('Optional PRNG State Serialization (Deterministic Resumption)', () => {
    it('should optionally persist and restore PRNG sequence when includePrngState is true', () => {
      const world1 = new World({ seed: 12345 });
      // 난수 3회 소모
      world1.random.next();
      world1.random.next();
      world1.random.next();

      const serializer = new WorldSerializer();
      // includePrngState = true로 직렬화
      const serialized = serializer.serialize(world1, { includePrngState: true });
      expect(serialized.prngState).toBeDefined();

      const world2 = new World();
      serializer.deserialize(serialized, world2);

      // 복원된 월드와 원래 월드의 다음 난수가 100% 동일하게 진행되는지 검증
      const nextVal1 = world1.random.next();
      const nextVal2 = world2.random.next();
      expect(nextVal1).toBe(nextVal2);
    });

    it('should NOT include prngState when option is omitted or false (default backward compatibility)', () => {
      const world1 = new World({ seed: 9999 });
      const serializer = new WorldSerializer();
      const serialized = serializer.serialize(world1);

      expect(serialized.prngState).toBeUndefined();

      // SaveManager.serialize 연동 검증
      const saveStr = SaveManager.serialize(world1, 'my-secret', 1, { includePrngState: true });
      const envelope = JSON.parse(saveStr);
      expect(envelope.data.prngState).toBeDefined();
    });
  });

  // ─── 2. Query Cache Modes & Performance ───────────
  describe('Query Cache Modes (Auto Dirty vs Always Rebuild)', () => {
    class DummySystem extends System {
      query = [StatsComponent];
      updateCount = 0;
      update(entities: any[]) {
        this.updateCount += entities.length;
      }
    }

    it('should reuse cached query results when entities do not change in auto mode', () => {
      const world = new World({ queryCacheMode: 'auto' });
      const sys = new DummySystem();
      world.addSystem(sys);

      const e1 = world.createEntity();
      e1.add(new StatsComponent());

      // 첫 틱 실행 -> 캐시 빌드
      world.update(16);
      expect(sys.updateCount).toBe(1);

      // 컴포넌트 추가/삭제 없이 두 번째 틱 실행 -> 풀스캔 재빌드 없이 캐시 재사용
      world.update(16);
      expect(sys.updateCount).toBe(2);

      // 수동으로 invalidateCache 호출 시 정상 재빌드
      world.invalidateCache();
      world.update(16);
      expect(sys.updateCount).toBe(3);
    });

    it('should support always rebuild mode when explicitly configured', () => {
      const world = new World({ queryCacheMode: 'always' });
      const sys = new DummySystem();
      world.addSystem(sys);

      const e1 = world.createEntity();
      e1.add(new StatsComponent());

      world.update(16);
      expect(sys.updateCount).toBe(1);
    });
  });

  // ─── 3. SpatialGridSystem (Auto Position Sync) ────
  describe('SpatialGridSystem (Automatic PositionComponent Synchronization)', () => {
    it('should automatically track entity positions and removals in SpatialHashGrid', () => {
      const world = new World();
      const spatialSys = new SpatialGridSystem({
        gridOptions: { cellSize: 50 },
      });
      world.addSystem(spatialSys);

      const player = world.createEntity('player');
      const pos = new PositionComponent({ x: 20, y: 20 });
      player.add(pos);

      // 틱 1회 실행 -> 그리드에 자동 동기화
      world.update(16);

      let nearby = spatialSys.queryRadius(20, 20, 10);
      expect(nearby.length).toBe(1);
      expect(nearby[0].entityId).toBe(player.id);

      // 위치 이동
      pos.x = 100;
      pos.y = 100;
      world.update(16);

      // 이전 위치에서는 검색되지 않고 새 위치에서 검색되어야 함
      expect(spatialSys.queryRadius(20, 20, 10).length).toBe(0);
      nearby = spatialSys.queryRadius(100, 100, 10);
      expect(nearby.length).toBe(1);
      expect(nearby[0].entityId).toBe(player.id);

      // 엔티티 삭제 시 그리드에서도 자동 제거
      world.removeEntity(player.id);
      world.update(16);
      expect(spatialSys.queryRadius(100, 100, 50).length).toBe(0);
    });
  });

  // ─── 4. Time Scaling & Pause Controls ──────────────
  describe('Time Scaling & Pause Controls', () => {
    it('should freeze timers and systems when world is paused', () => {
      const world = new World();
      const fn = vi.fn();
      world.schedule(100, fn);

      world.pause();
      expect(world.isPaused).toBe(true);

      // 일시정지 중 200ms 경과해도 실행되지 않음
      world.update(200);
      expect(fn).not.toHaveBeenCalled();

      // 재개 후 실행
      world.resume();
      expect(world.isPaused).toBe(false);
      world.update(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should scale delta elapsed when timeScale is modified', () => {
      const world = new World();
      const fn = vi.fn();
      world.schedule(200, fn);

      // 2배속 모드
      world.setTimeScale(2.0);
      expect(world.timeScale).toBe(2.0);

      // 100ms 틱이지만 2배속이라 실질 200ms가 경과하여 즉시 완료
      world.update(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. FSM Transition Event Guarantees ───────────
  describe('FSM Transition Event Guarantees', () => {
    it('should emit fsm:state:changed on manual transitionTo', () => {
      const world = new World();
      const events: Array<{ entityId: number; prev: string; next: string }> = [];

      world.events.on('fsm:state:changed', (data) => {
        events.push(data);
      });

      const hero = world.createEntity();
      const fsm = new FSMComponent({
        initialState: 'idle',
        states: {
          idle: { canMove: true, allowedTransitions: ['casting'] },
          casting: { canMove: false, allowedTransitions: ['idle'] },
        },
      });
      hero.add(fsm);

      // 리스너 콜백 테스트
      const onTransFn = vi.fn();
      fsm.onTransition(onTransFn);

      // 수동 전이 실행
      const success = fsm.transitionTo('casting');
      expect(success).toBe(true);

      expect(onTransFn).toHaveBeenCalledWith('idle', 'casting');
      expect(events.length).toBe(1);
      expect(events[0]).toEqual({
        entityId: hero.id,
        prev: 'idle',
        next: 'casting',
      });
    });
  });

  // ─── 6. StatAdapter (Bidirectional Compatibility) ──
  describe('StatAdapter (StatsComponent <-> ExtendedStatsComponent)', () => {
    it('should convert StatsComponent to ExtendedStatsComponent and sync back', () => {
      const basic = new StatsComponent({
        hp: 80,
        maxHp: 100,
        mp: 40,
        maxMp: 50,
        attack: 25,
        defense: 10,
        speed: 15,
      });

      // 1. ExtendedStatsComponent로 변환
      const extended = StatAdapter.toExtended(basic);
      expect(extended.get('attack')).toBe(25);
      expect(extended.getResource('hp')).toBe(80);

      // 2. 확장 스탯 파이프라인으로 버프 부여 (+20% 공격력)
      extended.addModifier({
        sourceId: 'buff_might',
        stat: 'attack',
        percent: 0.2,
      });
      expect(extended.get('attack')).toBe(30);

      // 3. 기본 StatsComponent로 동기화
      StatAdapter.syncToStats(extended, basic);
      expect(basic.attack).toBe(30);
    });
  });

  // ─── 7. WorldDiffer Static API Verification ───────
  describe('WorldDiffer Static Helpers & Compatibility', () => {
    it('should support static captureSnapshot, createDelta, and applyDelta', () => {
      const serverWorld = new World();
      const hero = serverWorld.createEntity();
      hero.add(new PositionComponent(10, 20));

      // 1. Static capture
      const prev = WorldDiffer.captureSnapshot(serverWorld);
      expect(prev.entities.length).toBe(1);

      // 2. State modification
      const heroPos = hero.get(PositionComponent)!;
      heroPos.x = 50;

      // 3. Static createDelta (prev, current)
      const delta = WorldDiffer.createDelta(prev, serverWorld);
      expect(delta.updatedComponents.length).toBe(1);
      expect(delta.updatedComponents[0].component.data.x).toBe(50);

      // 4. Static applyDelta to clientWorld
      const clientWorld = new World();
      WorldDiffer.applyDelta(clientWorld, delta);
      const clientHero = clientWorld.getEntity(hero.id);
      expect(clientHero).toBeDefined();
      expect(clientHero?.get(PositionComponent)?.x).toBe(50);
    });
  });

  // ─── 8. SaveManager Version & Timestamp Tamper Defenses ────
  describe('SaveManager Enhanced Signature Scope', () => {
    it('should detect tampering of version and timestamp', () => {
      const world = new World();
      const saveStr = SaveManager.serialize(world, 'secret-key-123', 1);
      const envelope = JSON.parse(saveStr);

      // 1. 정상 복원 확인
      const normalResult = SaveManager.deserialize(saveStr, new World(), 'secret-key-123');
      expect(normalResult.success).toBe(true);

      // 2. version 변조 (예: 다운그레이드) 시 감지
      const tamperedVersion = { ...envelope, version: 99 };
      const vResult = SaveManager.deserialize(JSON.stringify(tamperedVersion), new World(), 'secret-key-123');
      expect(vResult.success).toBe(false);
      expect(vResult.tampered).toBe(true);

      // 3. timestamp 변조 (재사용/리플레이) 시 감지
      const tamperedTime = { ...envelope, timestamp: envelope.timestamp + 10000 };
      const tResult = SaveManager.deserialize(JSON.stringify(tamperedTime), new World(), 'secret-key-123');
      expect(tResult.success).toBe(false);
      expect(tResult.tampered).toBe(true);
    });
  });

  // ─── 9. SeededRandom NaN/Infinity Safeguards & 64-bit fork ───
  describe('SeededRandom Safeguards & fork entropy', () => {
    it('should safely handle NaN, Infinity, and non-finite seeds without throwing', () => {
      expect(() => new SeededRandom(NaN)).not.toThrow();
      expect(() => new SeededRandom(Infinity)).not.toThrow();
      expect(() => new SeededRandom(-Infinity)).not.toThrow();

      const rng = new SeededRandom(NaN);
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });

    it('should fork with distinct deterministic entropy', () => {
      const parent = new SeededRandom('parent-seed');
      const child1 = parent.fork();
      const child2 = parent.fork();

      expect(child1.next()).not.toBe(child2.next());
    });
  });
});

