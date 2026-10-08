import { describe, it, expect, vi } from 'vitest';
import {
  World,
  Entity,
  StatsComponent,
  IdentityComponent,
  InventoryComponent,
  CombatSystem,
  InventorySystem,
  CoreEvents,
} from '../src/index';

// ─── Entity ──────────────────────────────────────────────────────────────────
describe('Entity', () => {
  it('컴포넌트를 추가하고 조회할 수 있다', () => {
    const entity = new Entity(['player']);
    entity.add(new StatsComponent({ maxHp: 100 }));

    const stats = entity.get(StatsComponent);
    expect(stats).toBeDefined();
    expect(stats!.maxHp).toBe(100);
    expect(stats!.hp).toBe(100);
  });

  it('컴포넌트를 제거할 수 있다', () => {
    const entity = new Entity();
    entity.add(new StatsComponent());
    entity.remove(StatsComponent);
    expect(entity.has(StatsComponent)).toBe(false);
  });

  it('hasAll — 여러 컴포넌트 존재 여부를 확인한다', () => {
    const entity = new Entity();
    entity.add(new StatsComponent()).add(new IdentityComponent(1, 'Hero'));
    expect(entity.hasAll([StatsComponent, IdentityComponent])).toBe(true);
    expect(entity.hasAll([StatsComponent, InventoryComponent])).toBe(false);
  });
});

// ─── World ───────────────────────────────────────────────────────────────────
describe('World', () => {
  it('Entity를 생성하고 태그로 조회할 수 있다', () => {
    const world = new World<CoreEvents>();
    world.createEntity('enemy').add(new StatsComponent({ maxHp: 50 }));
    world.createEntity('enemy').add(new StatsComponent({ maxHp: 30 }));
    world.createEntity('player').add(new StatsComponent({ maxHp: 200 }));

    const enemies = world.queryByTag('enemy');
    expect(enemies).toHaveLength(2);
  });

  it('Entity를 지연 삭제한다', () => {
    const world = new World<CoreEvents>();
    const e = world.createEntity();
    world.removeEntity(e.id);

    // 아직 삭제 안 됨
    expect(world.getEntity(e.id)).toBeDefined();

    // update 후 삭제
    world.update(0);
    expect(world.getEntity(e.id)).toBeUndefined();
  });
});

// ─── CombatSystem ─────────────────────────────────────────────────────────────
describe('CombatSystem', () => {
  it('데미지를 계산하고 HP를 깎는다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();
    world.addSystem(combat);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 20, defense: 0 }));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 100, defense: 5 }));

    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      critChance: 0, // 크리티컬 없이 고정 계산
    });

    world.update(16);

    const stats = target.get(StatsComponent)!;
    // 20 attack - 5 defense = 15 effective damage
    expect(stats.hp).toBe(85);
  });

  it('HP가 0이 되면 stats:died 이벤트를 발행한다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();
    world.addSystem(combat);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 999 }));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 10, defense: 0 }));

    const diedHandler = vi.fn();
    world.bus.on('stats:died', diedHandler);

    combat.requestAttack({ attackerId: attacker.id, targetId: target.id, critChance: 0 });
    world.update(16);

    expect(diedHandler).toHaveBeenCalledOnce();
    expect(target.get(StatsComponent)!.isDead).toBe(true);
  });
});

// ─── InventorySystem ──────────────────────────────────────────────────────────
describe('InventorySystem', () => {
  it('아이템을 추가하고 수량을 확인한다', () => {
    const world = new World<CoreEvents>();
    const invSystem = new InventorySystem();
    world.addSystem(invSystem);

    const player = world.createEntity('player');
    player.add(new InventoryComponent(10));

    invSystem.request({ type: 'add', entityId: player.id, defId: 1, quantity: 3 });
    world.update(0);

    expect(player.get(InventoryComponent)!.getQuantity(1)).toBe(3);
  });

  it('아이템 추가 시 이벤트를 발행한다', () => {
    const world = new World<CoreEvents>();
    const invSystem = new InventorySystem();
    world.addSystem(invSystem);

    const player = world.createEntity('player');
    player.add(new InventoryComponent());

    const addedHandler = vi.fn();
    world.bus.on('inventory:item:added', addedHandler);

    invSystem.request({ type: 'add', entityId: player.id, defId: 5, quantity: 1 });
    world.update(0);

    expect(addedHandler).toHaveBeenCalledWith({ entityId: player.id, defId: 5, quantity: 1 });
  });

  it('슬롯이 꽉 차면 inventory:full 이벤트를 발행한다', () => {
    const world = new World<CoreEvents>();
    const invSystem = new InventorySystem();
    world.addSystem(invSystem);

    const player = world.createEntity();
    player.add(new InventoryComponent(1)); // 슬롯 1개

    const fullHandler = vi.fn();
    world.bus.on('inventory:full', fullHandler);

    invSystem.request({ type: 'add', entityId: player.id, defId: 10, quantity: 1 });
    world.update(0);

    expect(fullHandler).toHaveBeenCalledOnce();
  });
});
