import { describe, it, expect, vi } from 'vitest';
import {
  World,
  Entity,
  System,
  EventBus,
  StatsComponent,
  ExtendedStatsComponent,
  IdentityComponent,
  WorldSerializer,
  CoreEvents,
} from '../src/index';

describe('Core Enhancements & Cleanups', () => {
  // ── 1. Entity Cleanup & Reset ──────────────────────────────────────────────
  describe('Entity Cleanup & Reset', () => {
    it('Entity.clear: 모든 컴포넌트와 태그를 일괄 초기화하고 알림을 발행해야 한다', () => {
      const entity = new Entity(['player', 'hero']);
      entity.add(new StatsComponent({ hp: 100 }));
      entity.add(new IdentityComponent(1, 'Hero'));

      const changeSpy = vi.fn();
      entity.subscribe(changeSpy);

      expect(entity.allComponents.length).toBe(2);
      expect(entity.tags.size).toBe(2);

      entity.clear();

      expect(entity.allComponents.length).toBe(0);
      expect(entity.tags.size).toBe(0);
      expect(changeSpy).toHaveBeenCalledWith(
        entity,
        expect.objectContaining({ type: 'cleared' }),
      );
    });

    it('Entity.removeAllComponents & clearTags: 컴포넌트와 태그를 각각 독립적으로 정리할 수 있어야 한다', () => {
      const entity = new Entity(['enemy', 'elite']);
      entity.add(new StatsComponent());

      entity.removeAllComponents();
      expect(entity.allComponents.length).toBe(0);
      expect(entity.tags.size).toBe(2); // 태그는 유지

      entity.clearTags();
      expect(entity.tags.size).toBe(0);
    });

    it('Entity.resetIdCounter: ID 카운터를 초기화할 수 있어야 한다', () => {
      Entity.resetIdCounter(100);
      const e1 = new Entity();
      const e2 = new Entity();
      expect(e1.id).toBe(100);
      expect(e2.id).toBe(101);

      Entity.resetIdCounter(0);
      const e3 = new Entity();
      expect(e3.id).toBe(0);
    });
  });

  // ── 2. World Entity Management ─────────────────────────────────────────────
  describe('World Entity Management & Queries', () => {
    it('World.clearEntities: 시스템과 EventBus는 유지한 채 모든 엔티티를 일괄 삭제해야 한다', () => {
      const world = new World<CoreEvents>();
      const customBusSpy = vi.fn();
      world.bus.on('stats:died', customBusSpy);

      const e1 = world.createEntity('player');
      const e2 = world.createEntity('monster');
      const e3 = world.createEntity('npc');

      expect(world.entityCount).toBe(3);

      const worldListener = vi.fn();
      world.subscribe(worldListener);

      world.clearEntities();

      expect(world.entityCount).toBe(0);
      expect(world.entities.length).toBe(0);
      expect(world.hasEntity(e1.id)).toBe(false);
      expect(worldListener).toHaveBeenCalledWith(
        world,
        expect.objectContaining({ type: 'entities_cleared' }),
      );

      // EventBus는 여전히 유지되어 이벤트 수신 가능
      world.bus.emit('stats:died', { entityId: 999 });
      expect(customBusSpy).toHaveBeenCalledWith({ entityId: 999 });
    });

    it('World 편의 쿼리 헬퍼: queryFirst, queryByTagFirst, findEntity, removeEntitiesByTag', () => {
      const world = new World<CoreEvents>();
      const player = world.createEntity('player');
      player.add(new IdentityComponent(1, 'Hero'));

      const enemy1 = world.createEntity('enemy');
      const enemy2 = world.createEntity('enemy');
      enemy2.add(new IdentityComponent(2, 'Boss'));

      // queryFirst
      expect(world.queryFirst([IdentityComponent])).toBe(player);

      // queryByTagFirst
      expect(world.queryByTagFirst('enemy')).toBe(enemy1);

      // findEntity
      const foundBoss = world.findEntity((e) => e.get(IdentityComponent)?.name === 'Boss');
      expect(foundBoss).toBe(enemy2);

      // removeEntitiesByTag
      const removedCount = world.removeEntitiesByTag('enemy');
      expect(removedCount).toBe(2);
      world.update(0); // flush removals
      expect(world.entityCount).toBe(1);
      expect(world.hasEntity(player.id)).toBe(true);
    });
  });

  // ── 3. System Priority & Enabled ───────────────────────────────────────────
  describe('System Priority & Enabled Control', () => {
    it('System.priority: 등록된 순서와 무관하게 priority가 높은 시스템이 먼저 실행되어야 한다', () => {
      const world = new World<CoreEvents>();
      const executionOrder: string[] = [];

      class LowPrioritySystem extends System<CoreEvents> {
        readonly query = [];
        priority = 10;
        update(): void {
          executionOrder.push('low');
        }
      }

      class HighPrioritySystem extends System<CoreEvents> {
        readonly query = [];
        priority = 100;
        update(): void {
          executionOrder.push('high');
        }
      }

      // low를 먼저 등록해도 high가 먼저 실행되어야 함
      world.addSystem(new LowPrioritySystem());
      world.addSystem(new HighPrioritySystem());

      world.update(16);
      expect(executionOrder).toEqual(['high', 'low']);
    });

    it('System.enabled: enabled = false로 일시정지된 시스템은 update 호출이 스킵되어야 한다', () => {
      const world = new World<CoreEvents>();
      const updateSpy = vi.fn();

      class TestSystem extends System<CoreEvents> {
        readonly query = [];
        update(): void {
          updateSpy();
        }
      }

      const sys = new TestSystem();
      world.addSystem(sys);

      world.update(16);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // 시스템 일시정지
      sys.enabled = false;
      world.update(16);
      expect(updateSpy).toHaveBeenCalledTimes(1); // 호출 안 됨

      // 재개
      sys.enabled = true;
      world.update(16);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── 4. EventBus once & listenerCount ───────────────────────────────────────
  describe('EventBus once & listenerCount', () => {
    it('EventBus.once: 1회만 호출되고 자동으로 구독 해제되어야 한다', () => {
      const bus = new EventBus<{ 'test:event': { count: number } }>();
      const spy = vi.fn();

      bus.once('test:event', spy);
      expect(bus.listenerCount('test:event')).toBe(1);

      bus.emit('test:event', { count: 1 });
      expect(spy).toHaveBeenCalledWith({ count: 1 });
      expect(bus.listenerCount('test:event')).toBe(0);

      // 2번째 emit에는 반응하지 않음
      bus.emit('test:event', { count: 2 });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. ExtendedStatsComponent Serialization & Inspection ──────────────────
  describe('ExtendedStatsComponent Serialization & Inspection', () => {
    it('ExtendedStatsComponent.toRecord: 모든 활성 스탯의 계산값을 객체로 반환해야 한다', () => {
      const ext = new ExtendedStatsComponent({
        baseStats: { str: 20, dex: 15 },
      });
      ext.defineStat({
        name: 'atk',
        dependencies: ['str', 'dex'],
        formula: (r) => r.get('str') * 2 + r.get('dex'),
      });

      const record = ext.toRecord();
      expect(record.str).toBe(20);
      expect(record.dex).toBe(15);
      expect(record.atk).toBe(55);
    });

    it('ExtendedStatsComponent가 WorldSerializer를 통해 JSON 세이브/로드 시 정상 복원되어야 한다', () => {
      const world1 = new World();
      const hero = world1.createEntity('hero');
      const ext = new ExtendedStatsComponent({
        baseStats: { int: 30, wis: 25 },
        currentResources: { hp: 150 },
      });
      ext.addModifier({ sourceId: 'buff:blessing', stat: 'int', flat: 10 });
      hero.add(ext);

      // 직렬화
      const serializer = new WorldSerializer();
      const json = serializer.toJSON(world1);

      // 새 월드에 역직렬화
      const world2 = new World();
      serializer.deserialize(json, world2);

      const restoredHero = world2.queryByTagFirst('hero')!;
      expect(restoredHero).toBeDefined();

      const restoredExt = restoredHero.get(ExtendedStatsComponent)!;
      expect(restoredExt).toBeDefined();
      expect(restoredExt.getBase('int')).toBe(30);
      expect(restoredExt.get('int')).toBe(40); // 30 + 10 (버프 복원)
      expect(restoredExt.hp).toBe(150);
    });
  });
});
