import { describe, it, expect, vi } from 'vitest';
import {
  World,
  DataManager,
  EquipmentSystem,
  StatModSystem,
  StatsComponent,
  InventoryComponent,
  EquipmentComponent,
  StatModsComponent,
  ClassComponent,
  ConstraintChecker,
} from '../src';

describe('EquipmentSystem', () => {
  function setup() {
    const data = new DataManager();
    const world = new World();
    const statModSystem = new StatModSystem();
    const equipmentSystem = new EquipmentSystem(data, new ConstraintChecker(), statModSystem);

    world.addSystem(statModSystem);
    world.addSystem(equipmentSystem);

    // 아이템 등록
    data.items.registerMany([
      {
        id: 'iron_sword',
        name: '철검',
        category: 'weapon',
        spec: { weaponType: 'sword', attack: 15 },
      },
      {
        id: 'mithril_sword',
        name: '미스릴 검',
        category: 'weapon',
        spec: { weaponType: 'sword', attack: 35 },
        constraints: [{ type: 'level', min: 10 }],
      },
      {
        id: 'iron_shield',
        name: '철 방패',
        category: 'armor',
        spec: { defense: 8, maxHp: 20 },
      },
    ]);

    // 플레이어 엔티티 생성
    const player = world.createEntity('player');
    player
      .add(new StatsComponent({ maxHp: 100, attack: 10, defense: 5, speed: 10 }))
      .add(new StatModsComponent())
      .add(new InventoryComponent(2)) // 2칸 슬롯
      .add(new EquipmentComponent())
      .add(new ClassComponent('warrior', 5)); // 레벨 5

    return { world, data, equipmentSystem, statModSystem, player };
  }

  it('인벤토리의 아이템을 장착하면 슬롯에 장착되고 스탯 모디파이어가 자동 적용되어야 한다', () => {
    const { world, equipmentSystem, player } = setup();
    const inv = player.get(InventoryComponent)!;
    const stats = player.get(StatsComponent)!;
    const mods = player.get(StatModsComponent)!;

    inv.add('iron_sword', 1);
    expect(inv.getQuantity('iron_sword')).toBe(1);

    equipmentSystem.requestEquip({
      entityId: player.id,
      slot: 'weapon',
      itemId: 'iron_sword',
    });
    world.update(16);

    // 인벤토리에서 차감됨
    expect(inv.getQuantity('iron_sword')).toBe(0);

    // 슬롯에 장착됨
    const eq = player.get(EquipmentComponent)!;
    expect(eq.isEquipped('weapon')).toBe(true);
    expect(eq.getSlot('weapon')?.defId).toBe('iron_sword');

    // StatMod 적용 확인 (기본 attack 10 + 무기 15 = 25)
    expect(mods.has('equip:weapon:attack')).toBe(true);
    const effectiveAtk = mods.compute('attack', stats.attack);
    expect(effectiveAtk).toBe(25);
  });

  it('제약조건(레벨 부족 등)을 만족하지 못하면 장착에 실패해야 한다', () => {
    const { world, equipmentSystem, player } = setup();
    const inv = player.get(InventoryComponent)!;
    const eq = player.get(EquipmentComponent)!;

    inv.add('mithril_sword', 1);

    const failListener = vi.fn();
    world.bus.on('equipment:failed', failListener);

    equipmentSystem.requestEquip({
      entityId: player.id,
      slot: 'weapon',
      itemId: 'mithril_sword', // 레벨 10 필요, 플레이어는 레벨 5
    });
    world.update(16);

    expect(eq.isEquipped('weapon')).toBe(false);
    expect(inv.getQuantity('mithril_sword')).toBe(1); // 차감되지 않음
    expect(failListener).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'constraint_failed',
      }),
    );
  });

  it('기존 장비가 있는 슬롯에 새 장비를 착용하면 기존 장비는 인벤토리로 환원되어야 한다', () => {
    const { world, equipmentSystem, player } = setup();
    const inv = player.get(InventoryComponent)!;
    const eq = player.get(EquipmentComponent)!;
    const stats = player.get(StatsComponent)!;
    const mods = player.get(StatModsComponent)!;

    // 플레이어 레벨을 10으로 올려서 미스릴 검 착용 가능하게 변경
    player.get(ClassComponent)!.level = 10;

    inv.add('iron_sword', 1);
    inv.add('mithril_sword', 1);

    // 1. 철검 장착
    equipmentSystem.requestEquip({ entityId: player.id, slot: 'weapon', itemId: 'iron_sword' });
    world.update(16);
    expect(eq.getSlot('weapon')?.defId).toBe('iron_sword');
    expect(inv.getQuantity('iron_sword')).toBe(0);

    // 2. 미스릴 검으로 교체
    equipmentSystem.requestEquip({ entityId: player.id, slot: 'weapon', itemId: 'mithril_sword' });
    world.update(16);

    expect(eq.getSlot('weapon')?.defId).toBe('mithril_sword');
    expect(inv.getQuantity('iron_sword')).toBe(1); // 철검이 인벤토리로 돌아옴
    expect(inv.getQuantity('mithril_sword')).toBe(0);

    // 스탯이 미스릴 검(35) 기준으로 갱신
    expect(mods.compute('attack', stats.attack)).toBe(45); // 10 + 35
  });

  it('장비를 해제하면 슬롯에서 제거되고 인벤토리로 환원되며 스탯 모디파이어가 제거되어야 한다', () => {
    const { world, equipmentSystem, player } = setup();
    const inv = player.get(InventoryComponent)!;
    const eq = player.get(EquipmentComponent)!;
    const stats = player.get(StatsComponent)!;
    const mods = player.get(StatModsComponent)!;

    inv.add('iron_sword', 1);
    equipmentSystem.requestEquip({ entityId: player.id, slot: 'weapon', itemId: 'iron_sword' });
    world.update(16);

    expect(eq.isEquipped('weapon')).toBe(true);

    // 장비 해제
    equipmentSystem.requestUnequip({ entityId: player.id, slot: 'weapon' });
    world.update(16);

    expect(eq.isEquipped('weapon')).toBe(false);
    expect(inv.getQuantity('iron_sword')).toBe(1);
    expect(mods.has('equip:weapon:attack')).toBe(false);
    expect(mods.compute('attack', stats.attack)).toBe(10); // 기본 10으로 원복
  });

  it('인벤토리가 꽉 차 있으면 장비 해제에 실패해야 한다', () => {
    const { world, equipmentSystem, player } = setup();
    const inv = player.get(InventoryComponent)!;
    const eq = player.get(EquipmentComponent)!;

    // 슬롯 2칸인 인벤토리에 무기 착용 후 나머지 2칸을 다른 아이템으로 채움
    inv.add('iron_sword', 1);
    equipmentSystem.requestEquip({ entityId: player.id, slot: 'weapon', itemId: 'iron_sword' });
    world.update(16);

    inv.add('iron_shield', 1);
    inv.add('item_dummy', 1);
    expect(inv.isFull).toBe(true);

    const failListener = vi.fn();
    world.bus.on('equipment:failed', failListener);

    equipmentSystem.requestUnequip({ entityId: player.id, slot: 'weapon' });
    world.update(16);

    expect(eq.isEquipped('weapon')).toBe(true); // 해제되지 않음
    expect(failListener).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'inventory_full',
      }),
    );
  });
});
