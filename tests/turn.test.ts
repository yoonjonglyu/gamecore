import { describe, it, expect, vi } from 'vitest';
import {
  World,
  TurnSystem,
  TurnComponent,
  StatsComponent,
} from '../src';

describe('TurnSystem', () => {
  it('속도(speed) 및 이니셔티브에 따라 내림차순으로 턴 큐가 정렬되어야 한다', () => {
    const world = new World();
    const turnSystem = new TurnSystem();
    world.addSystem(turnSystem);

    // 속도 10인 영웅
    const hero = world.createEntity('hero');
    hero.add(new StatsComponent({ maxHp: 100, speed: 10 })).add(new TurnComponent({ maxActionPoints: 2 }));

    // 속도 15인 빠른 도적
    const rogue = world.createEntity('rogue');
    rogue.add(new StatsComponent({ maxHp: 80, speed: 15 })).add(new TurnComponent());

    // 속도 5인 느린 오크
    const orc = world.createEntity('orc');
    orc.add(new StatsComponent({ maxHp: 120, speed: 5 })).add(new TurnComponent());

    // 캐시 업데이트를 위해 update 호출
    world.update(16);

    const roundStartedListener = vi.fn();
    const turnStartedListener = vi.fn();
    world.bus.on('turn:round:started', roundStartedListener);
    world.bus.on('turn:started', turnStartedListener);

    turnSystem.startRound();

    expect(turnSystem.currentRound).toBe(1);
    // 속도 순: rogue (15) -> hero (10) -> orc (5)
    expect(turnSystem.turnQueue).toEqual([rogue.id, hero.id, orc.id]);
    expect(turnSystem.currentEntityId).toBe(rogue.id);

    expect(roundStartedListener).toHaveBeenCalledWith({
      round: 1,
      turnOrder: [rogue.id, hero.id, orc.id],
    });
    expect(turnStartedListener).toHaveBeenCalledWith({
      round: 1,
      entityId: rogue.id,
      turnIndex: 0,
    });
  });

  it('nextTurn()과 endTurn()으로 순서대로 턴이 진행되고 AP가 리셋되어야 한다', () => {
    const world = new World();
    const turnSystem = new TurnSystem();
    world.addSystem(turnSystem);

    const p1 = world.createEntity('p1');
    p1.add(new StatsComponent({ speed: 20 })).add(new TurnComponent({ maxActionPoints: 3 }));

    const p2 = world.createEntity('p2');
    p2.add(new StatsComponent({ speed: 10 })).add(new TurnComponent({ maxActionPoints: 2 }));

    world.update(16);
    turnSystem.startRound();

    // 1번째 턴: p1
    expect(turnSystem.currentEntityId).toBe(p1.id);
    const turn1 = p1.get(TurnComponent)!;
    expect(turn1.actionPoints).toBe(3);
    turn1.consumeAP(2);
    expect(turn1.actionPoints).toBe(1);

    // p1 턴 종료
    const ended = turnSystem.endTurn(p1.id);
    expect(ended).toBe(true);

    // 2번째 턴: p2
    expect(turnSystem.currentEntityId).toBe(p2.id);
    const turn2 = p2.get(TurnComponent)!;
    expect(turn2.actionPoints).toBe(2);

    // p2 턴 종료 -> 라운드 종료
    const nextId = turnSystem.nextTurn();
    expect(nextId).toBeUndefined();
    expect(turnSystem.currentEntityId).toBeUndefined();
    expect(turnSystem.isRoundActive).toBe(false);
  });

  it('사망한 엔티티는 턴 순서에서 자동으로 건너뛰어야 한다', () => {
    const world = new World();
    const turnSystem = new TurnSystem();
    world.addSystem(turnSystem);

    const p1 = world.createEntity('p1');
    p1.add(new StatsComponent({ speed: 30 })).add(new TurnComponent());

    const p2 = world.createEntity('p2');
    const p2Stats = new StatsComponent({ maxHp: 50, speed: 20 });
    p2.add(p2Stats).add(new TurnComponent());

    const p3 = world.createEntity('p3');
    p3.add(new StatsComponent({ speed: 10 })).add(new TurnComponent());

    world.update(16);
    turnSystem.startRound();

    expect(turnSystem.currentEntityId).toBe(p1.id);

    // p2 사망 처리
    p2Stats.hp = 0;
    expect(p2Stats.isDead).toBe(true);

    // p1 턴 종료 -> p2 건너뛰고 바로 p3로 가야 함
    const nextId = turnSystem.nextTurn();
    expect(nextId).toBe(p3.id);
    expect(turnSystem.currentEntityId).toBe(p3.id);
  });
});
