import { describe, it, expect, vi } from 'vitest';
import {
  World,
  StatsComponent,
  CombatSystem,
  BarrierComponent,
  CoreEvents,
  DamageCalculator,
  CombatMiddleware,
} from '../src/index';

describe('Pluggable Combat Pipeline', () => {
  it('커스텀 DamageCalculator 전략을 주입하여 데미지 공식을 변경할 수 있어야 한다', () => {
    // 리그 오브 레전드 스타일 방어력 감소 공식: raw * (100 / (100 + defense))
    class LolDamageCalculator implements DamageCalculator {
      calculate(ctx: any): number {
        const reduction = 100 / (100 + ctx.targetDefense);
        return Math.round(ctx.rawDamage * reduction);
      }
    }

    const world = new World<CoreEvents>();
    const combat = new CombatSystem({ calculator: new LolDamageCalculator() });
    world.addSystem(combat);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 100 }));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 500, defense: 100 })); // 100방어력 -> 50% 감소

    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      critChance: 0,
    });
    world.update(16);

    // 100 * (100 / 200) = 50 damage -> HP 500 - 50 = 450
    expect(target.get(StatsComponent)!.hp).toBe(450);
  });

  it('방어관통(Armor Pen) 및 고정 피해(True Damage)가 정확히 반영되어야 한다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();
    world.addSystem(combat);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 100 }));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 500, defense: 40 }));

    // 1) 50% 방어관통: defense 40 * (1 - 0.5) = 20 -> damage = 100 - 20 = 80
    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      armorPen: 0.5,
      critChance: 0,
    });
    world.update(16);
    expect(target.get(StatsComponent)!.hp).toBe(420); // 500 - 80 = 420

    // 2) 고정 피해 (true): 방어력 40 완전 무시 -> damage = 100
    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      damageType: 'true',
      critChance: 0,
    });
    world.update(16);
    expect(target.get(StatsComponent)!.hp).toBe(320); // 420 - 100 = 320
  });

  it('BarrierComponent: HP 차감 전에 쉴드가 먼저 데미지를 흡수하고 남은 데미지만 HP에 반영되어야 한다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();
    world.addSystem(combat);

    const absorbedHandler = vi.fn();
    const brokenHandler = vi.fn();
    world.bus.on('barrier:absorbed', absorbedHandler);
    world.bus.on('barrier:broken', brokenHandler);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 60 }));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 100, defense: 0 }));
    const barrier = new BarrierComponent({ current: 40, max: 40 });
    target.add(barrier);

    // 공격력 60 -> 쉴드 40 전부 소진(깨짐) + 잔여 피해 20이 HP(100)에 들어가 잔여 HP 80
    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      critChance: 0,
    });
    world.update(16);

    expect(barrier.current).toBe(0);
    expect(barrier.isDepleted).toBe(true);
    expect(target.get(StatsComponent)!.hp).toBe(80);
    expect(absorbedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: target.id, amount: 40 }),
    );
    expect(brokenHandler).toHaveBeenCalledWith({ entityId: target.id });
  });

  it('라이프사이클 미들웨어: onPostHit에서 흡혈(lifesteal)과 반사 피해(reflected)가 올바르게 처리되어야 한다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();
    world.addSystem(combat);

    const lifestealHandler = vi.fn();
    const reflectedHandler = vi.fn();
    world.bus.on('combat:lifesteal', lifestealHandler);
    world.bus.on('combat:reflected', reflectedHandler);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ maxHp: 200, hp: 100, attack: 50 })); // 현재 HP 100
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 300, hp: 300, defense: 0 }));

    // 피해량 50, 40% 흡혈(+20), 20% 반사(-10) -> 공격자 순 HP 변화: +10 (100 -> 110)
    combat.requestAttack({
      attackerId: attacker.id,
      targetId: target.id,
      lifesteal: 0.4,
      reflected: 0.2,
      critChance: 0,
    });
    world.update(16);

    expect(target.get(StatsComponent)!.hp).toBe(250);
    expect(attacker.get(StatsComponent)!.hp).toBe(110);
    expect(lifestealHandler).toHaveBeenCalledWith({
      attackerId: attacker.id,
      targetId: target.id,
      amount: 20,
    });
    expect(reflectedHandler).toHaveBeenCalledWith({
      attackerId: attacker.id,
      targetId: target.id,
      amount: 10,
    });
  });

  it('커스텀 미들웨어: onPreHit에서 공격을 조건부 취소(무적/보호)할 수 있어야 한다', () => {
    const world = new World<CoreEvents>();
    const combat = new CombatSystem();

    const invulnerableMiddleware: CombatMiddleware = {
      name: 'InvulnerableCheck',
      onPreHit: (ctx) => {
        if (ctx.target.hasTag('invulnerable')) {
          ctx.cancelled = true;
          ctx.cancelReason = 'Target is invulnerable';
        }
      },
    };
    combat.use(invulnerableMiddleware);
    world.addSystem(combat);

    const attacker = world.createEntity();
    attacker.add(new StatsComponent({ attack: 100 }));
    const target = world.createEntity('invulnerable');
    target.add(new StatsComponent({ maxHp: 100, defense: 0 }));

    combat.requestAttack({ attackerId: attacker.id, targetId: target.id });
    world.update(16);

    // 무적으로 인해 피해를 전혀 입지 않음
    expect(target.get(StatsComponent)!.hp).toBe(100);
  });
});
