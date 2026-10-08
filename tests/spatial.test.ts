import { describe, it, expect, vi } from 'vitest';
import {
  World,
  PositionComponent,
  GridMap,
  MovementSystem,
} from '../src';

describe('Spatial & Grid System', () => {
  function setupMap() {
    // 3x3 맵:
    // ###
    // #.#
    // ###
    const map = GridMap.fromASCII(
      [
        '###',
        '#..',
        '###',
      ],
      {
        '#': { type: 'wall', walkable: false },
        '.': { type: 'floor', walkable: true },
      },
    );

    const world = new World();
    const movement = new MovementSystem(map);
    world.addSystem(movement);

    return { world, map, movement };
  }

  it('통행 가능한 타일로는 정상 이동하고 movement:moved 이벤트가 발생해야 한다', () => {
    const { world, movement } = setupMap();

    const hero = world.createEntity('hero');
    hero.add(new PositionComponent({ x: 1, y: 1 }));

    const movedListener = vi.fn();
    world.bus.on('movement:moved', movedListener);

    // (1, 1) -> (2, 1)로 이동 (바닥)
    movement.requestMove(hero.id, 2, 1);
    world.update(16);

    const pos = hero.get(PositionComponent)!;
    expect(pos.x).toBe(2);
    expect(pos.y).toBe(1);

    expect(movedListener).toHaveBeenCalledWith({
      entityId: hero.id,
      fromX: 1,
      fromY: 1,
      toX: 2,
      toY: 1,
    });
  });

  it('벽(wall) 타일로 이동하려고 하면 이동이 차단되고 tile_blocked 이벤트가 발생해야 한다', () => {
    const { world, movement } = setupMap();

    const hero = world.createEntity('hero');
    hero.add(new PositionComponent({ x: 1, y: 1 }));

    const blockedListener = vi.fn();
    world.bus.on('movement:blocked', blockedListener);

    // (1, 1) -> (1, 0) 벽으로 이동 시도
    movement.requestMove(hero.id, 1, 0);
    world.update(16);

    const pos = hero.get(PositionComponent)!;
    expect(pos.x).toBe(1); // 위치 변경 없음
    expect(pos.y).toBe(1);

    expect(blockedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: hero.id,
        reason: 'tile_blocked',
      }),
    );
  });

  it('맵 경계 밖으로 이동하려고 하면 out_of_bounds로 차단되어야 한다', () => {
    const { world, movement } = setupMap();

    const hero = world.createEntity('hero');
    hero.add(new PositionComponent({ x: 1, y: 1 }));

    const blockedListener = vi.fn();
    world.bus.on('movement:blocked', blockedListener);

    // 맵 밖 (-1, 1)로 이동 시도
    movement.requestMove(hero.id, -1, 1);
    world.update(16);

    expect(blockedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: hero.id,
        reason: 'out_of_bounds',
      }),
    );
  });

  it('다른 isBlocked 엔티티가 이미 위치한 타일로는 이동할 수 없어야 한다', () => {
    const { world, movement } = setupMap();

    const hero = world.createEntity('hero');
    hero.add(new PositionComponent({ x: 1, y: 1, isBlocked: true }));

    const monster = world.createEntity('monster');
    monster.add(new PositionComponent({ x: 2, y: 1, isBlocked: true }));

    const blockedListener = vi.fn();
    world.bus.on('movement:blocked', blockedListener);

    // 히어로가 몬스터가 있는 (2, 1)로 이동 시도
    movement.requestMove(hero.id, 2, 1);
    world.update(16);

    const heroPos = hero.get(PositionComponent)!;
    expect(heroPos.x).toBe(1);

    expect(blockedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: hero.id,
        reason: 'entity_blocked',
      }),
    );
  });

  it('isBlocked가 false인 엔티티(아이템 등)는 타일을 공유하여 밟을 수 있어야 한다', () => {
    const { world, movement } = setupMap();

    const hero = world.createEntity('hero');
    hero.add(new PositionComponent({ x: 1, y: 1, isBlocked: true }));

    // 바닥에 떨어진 보물 (isBlocked = false)
    const item = world.createEntity('item');
    item.add(new PositionComponent({ x: 2, y: 1, isBlocked: false }));

    movement.requestMove(hero.id, 2, 1);
    world.update(16);

    const heroPos = hero.get(PositionComponent)!;
    expect(heroPos.x).toBe(2); // 겹쳐서 이동 성공
    expect(heroPos.y).toBe(1);
  });
});
