import { describe, it, expect } from 'vitest';
import {
  World,
  SaveManager,
  WorldDiffer,
  HierarchyComponent,
  HierarchySystem,
  PositionComponent,
  StatsComponent,
} from '../src';

describe('v1.1 Extensions: Save Metadata, WorldDiffer, Hierarchy', () => {
  // ──────────────────────────────────────────────
  // 1. SaveManager with Metadata
  // ──────────────────────────────────────────────
  describe('1. SaveManager with Metadata', () => {
    it('세이브 시 추가 메타데이터(가챠 천장, 챕터 등)를 함께 HMAC 서명하고 복원해야 한다', () => {
      const world = new World();
      const hero = world.createEntity('hero');
      hero.add(new StatsComponent({ hp: 100, maxHp: 100 }));

      const secret = 'my-secret-key';
      const customMeta = {
        gachaPity: 75,
        currentDialogueNode: 'node_chapter_2',
      };

      const saveStr = SaveManager.serialize(world, secret, 1, {
        metadata: customMeta,
      });

      const newWorld = new World();
      const result = SaveManager.deserialize(saveStr, newWorld, secret);

      expect(result.success).toBe(true);
      expect(result.tampered).toBeUndefined();
      expect(result.metadata).toEqual(customMeta);

      const restoredHero = newWorld.getEntity(hero.id);
      expect(restoredHero?.get(StatsComponent)?.hp).toBe(100);
    });

    it('메타데이터가 중간에 변조되면 tampered: true로 복원을 거부해야 한다', () => {
      const world = new World();
      const secret = 'safe-key';

      const saveStr = SaveManager.serialize(world, secret, 1, {
        metadata: { gold: 100 },
      });

      // 해커가 세이브 파일의 metadata를 악의적으로 수정
      const parsed = JSON.parse(saveStr);
      parsed.metadata.gold = 999999;
      const tamperedSaveStr = JSON.stringify(parsed);

      const newWorld = new World();
      const result = SaveManager.deserialize(tamperedSaveStr, newWorld, secret);

      expect(result.success).toBe(false);
      expect(result.tampered).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // 2. WorldDiffer (Delta Patch & Network Sync)
  // ──────────────────────────────────────────────
  describe('2. WorldDiffer (Delta Sync)', () => {
    it('직전 스냅샷 대비 생성, 수정, 삭제, 블랙보드 변경점을 컴팩트하게 추출하고 동기화해야 한다', () => {
      const serverWorld = new World();
      const differ = new WorldDiffer();

      // 초기 엔티티 생성
      const e1 = serverWorld.createEntity('player');
      e1.add(new StatsComponent({ hp: 100, maxHp: 100 }));
      serverWorld.blackboard.set('room', 'dungeon_1');

      // 클라이언트 월드 초기화 및 초기 델타 동기화
      const clientWorld = new World();
      differ.applyDelta(clientWorld, differ.createDelta(serverWorld));
      expect(clientWorld.getEntity(e1.id)?.get(StatsComponent)?.hp).toBe(100);
      expect(clientWorld.blackboard.get('room')).toBe('dungeon_1');

      // 2. 서버에서 변경 발생:
      // - e1 HP 감소 (수정)
      // - e2 몬스터 스폰 (생성)
      // - 블랙보드 변경
      e1.get(StatsComponent)!.hp = 60;
      const e2 = serverWorld.createEntity('monster');
      e2.add(new StatsComponent({ hp: 30, maxHp: 30 }));
      serverWorld.blackboard.set('room', 'dungeon_boss');

      // 델타 추출
      const delta1 = differ.createDelta(serverWorld);
      expect(delta1.created.length).toBe(1);
      expect(delta1.created[0].id).toBe(e2.id);
      expect(delta1.updatedComponents.length).toBe(1);
      expect(delta1.updatedComponents[0].entityId).toBe(e1.id);
      expect(delta1.blackboard?.room).toBe('dungeon_boss');

      // 클라이언트에 델타 적용
      differ.applyDelta(clientWorld, delta1);
      expect(clientWorld.getEntity(e1.id)?.get(StatsComponent)?.hp).toBe(60);
      expect(clientWorld.getEntity(e2.id)?.get(StatsComponent)?.hp).toBe(30);
      expect(clientWorld.blackboard.get('room')).toBe('dungeon_boss');

      // 3. 서버에서 e2 몬스터 처치 및 삭제
      serverWorld.destroyEntity(e2);
      serverWorld.update(16); // 삭제 큐 플러시
      const delta2 = differ.createDelta(serverWorld);
      expect(delta2.destroyed).toEqual([e2.id]);

      // 클라이언트에 삭제 델타 적용
      differ.applyDelta(clientWorld, delta2);
      expect(clientWorld.getEntity(e2.id)).toBeUndefined();
      expect(clientWorld.getEntity(e1.id)).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // 3. HierarchySystem (Parent-Child Relations)
  // ──────────────────────────────────────────────
  describe('3. HierarchySystem', () => {
    it('부모 엔티티의 위치 이동 시 자식 엔티티가 상대 오프셋만큼 자동 추종해야 한다', () => {
      const world = new World();
      const hierarchySys = new HierarchySystem();
      world.addSystem(hierarchySys);

      // 부모 (주인)
      const parent = world.createEntity('hero');
      parent.add(new PositionComponent(10, 20));

      // 자식 (소환수/펫): 오프셋 (+2, -3)
      const child = world.createEntity('pet');
      child.add(new PositionComponent(0, 0));
      child.add(new HierarchyComponent({ parentId: parent.id, offsetX: 2, offsetY: -3 }));

      world.update(16);

      const childPos = child.get(PositionComponent)!;
      // 10 + 2 = 12, 20 - 3 = 17
      expect(childPos.x).toBe(12);
      expect(childPos.y).toBe(17);

      // 부모 이동
      parent.get(PositionComponent)!.x = 50;
      parent.get(PositionComponent)!.y = 100;

      world.update(16);
      expect(childPos.x).toBe(52);
      expect(childPos.y).toBe(97);
    });

    it('cascadeDestroy가 true일 때 부모 엔티티가 소멸하면 자식 엔티티도 자동 파괴되어야 한다', () => {
      const world = new World();
      const hierarchySys = new HierarchySystem();
      world.addSystem(hierarchySys);

      const parent = world.createEntity('boss');
      const childPart = world.createEntity('boss_wing');
      childPart.add(new HierarchyComponent({ parentId: parent.id, cascadeDestroy: true }));

      world.update(16);
      expect(world.getEntity(childPart.id)).toBeDefined();

      // 부모 파괴 (1틱: 부모 플러시 -> 2틱: 자식 플러시)
      world.destroyEntity(parent);
      world.update(16);
      world.update(16);

      // 자식 엔티티도 함께 정리됨
      expect(world.getEntity(childPart.id)).toBeUndefined();
    });
  });
});
