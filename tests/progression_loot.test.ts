import { describe, it, expect, vi } from 'vitest';
import {
  World,
  ProgressionComponent,
  ProgressionSystem,
  LootComponent,
  LootSystem,
  StatsComponent,
  InventoryComponent,
  ClassComponent,
} from '../src';

describe('Progression & Loot System', () => {
  describe('ProgressionSystem', () => {
    it('경험치 추가 시 레벨업 및 스탯 상승이 올바르게 반영되어야 한다', () => {
      const world = new World();
      const progSystem = new ProgressionSystem();
      world.addSystem(progSystem);

      const player = world.createEntity('player');
      player
        .add(new StatsComponent({ maxHp: 100, attack: 10, defense: 5 }))
        .add(
          new ProgressionComponent({
            level: 1,
            expFormula: () => 100, // 테스트용: 레벨당 항상 100 EXP 필요
            growth: { maxHp: 20, attack: 5, defense: 2 },
          }),
        )
        .add(new ClassComponent('warrior', 1));

      const levelUpListener = vi.fn();
      world.bus.on('progression:levelup', levelUpListener);

      // 150 EXP 추가 -> 1 레벨업 (Level 2), 남은 경험치 50
      progSystem.addExp(player.id, 150);
      world.update(16);

      const prog = player.get(ProgressionComponent)!;
      const stats = player.get(StatsComponent)!;
      const cls = player.get(ClassComponent)!;

      expect(prog.level).toBe(2);
      expect(prog.currentExp).toBe(50);
      expect(cls.level).toBe(2); // ClassComponent 동기화

      // 스탯 성장 확인
      expect(stats.maxHp).toBe(120); // 100 + 20
      expect(stats.hp).toBe(120); // 풀 회복
      expect(stats.attack).toBe(15); // 10 + 5
      expect(stats.defense).toBe(7); // 5 + 2

      expect(levelUpListener).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: player.id,
          oldLevel: 1,
          newLevel: 2,
          levelsGained: 1,
          statsGained: { maxHp: 20, attack: 5, defense: 2 },
        }),
      );
    });

    it('한 번에 다량의 경험치를 얻으면 다중 레벨업을 처리해야 한다', () => {
      const world = new World();
      const progSystem = new ProgressionSystem();
      world.addSystem(progSystem);

      const player = world.createEntity('player');
      player
        .add(new StatsComponent({ maxHp: 100, attack: 10 }))
        .add(
          new ProgressionComponent({
            level: 1,
            expFormula: () => 100,
            growth: { maxHp: 10, attack: 2 },
          }),
        );

      // 350 EXP -> 3 레벨업 (Level 4), 남은 경험치 50
      progSystem.addExp(player.id, 350);
      world.update(16);

      const prog = player.get(ProgressionComponent)!;
      const stats = player.get(StatsComponent)!;

      expect(prog.level).toBe(4);
      expect(prog.currentExp).toBe(50);
      expect(stats.maxHp).toBe(130); // 100 + 10*3
      expect(stats.attack).toBe(16); // 10 + 2*3
    });
  });

  describe('LootSystem', () => {
    it('전리품 산출 시 킬러의 인벤토리로 아이템이 들어가고 경험치가 전달되어야 한다', () => {
      const world = new World();
      const progSystem = new ProgressionSystem();
      const lootSystem = new LootSystem(progSystem);

      world.addSystem(progSystem);
      world.addSystem(lootSystem);

      const player = world.createEntity('player');
      player
        .add(new InventoryComponent())
        .add(new StatsComponent({ maxHp: 100 }))
        .add(new ProgressionComponent({ level: 1, expFormula: () => 200 }));

      const monster = world.createEntity('monster');
      monster.add(
        new LootComponent({
          exp: 50,
          items: [
            { itemId: 'gold_coin', chance: 1.0, min: 10, max: 10 }, // 100% 확률로 10개
            { itemId: 'rare_gem', chance: 0.0 }, // 0% 확률
          ],
        }),
      );

      const lootListener = vi.fn();
      world.bus.on('loot:dropped', lootListener);

      // 전리품 처리 요청
      lootSystem.processLoot(monster.id, player.id);
      world.update(16);

      const inv = player.get(InventoryComponent)!;
      const prog = player.get(ProgressionComponent)!;

      expect(inv.getQuantity('gold_coin')).toBe(10);
      expect(inv.has('rare_gem')).toBe(false);
      expect(prog.currentExp).toBe(50); // 50 EXP 획득

      expect(lootListener).toHaveBeenCalledWith({
        deadEntityId: monster.id,
        receiverId: player.id,
        items: [{ itemId: 'gold_coin', quantity: 10 }],
        exp: 50,
      });
    });
  });
});
