import { describe, it, expect, vi } from 'vitest';
import {
  World,
  Entity,
  StatsComponent,
  IdentityComponent,
  CoreEvents,
} from '../src/index';
import { useEntity, useComponent, useWorldEntities } from '../src/react/index';

describe('Zero-dependency Observer & Subscription Pattern', () => {
  it('Entity.subscribe: 컴포넌트 추가/제거 및 태그 변경을 감지하고 버전을 증가시켜야 한다', () => {
    const entity = new Entity();
    const listener = vi.fn();

    const unsubscribe = entity.subscribe(listener);
    expect(entity.version).toBe(0);

    // 1) 컴포넌트 추가
    const stats = new StatsComponent({ maxHp: 100 });
    entity.add(stats);
    expect(entity.version).toBe(1);
    expect(listener).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ type: 'component_added', component: stats }),
    );

    // 2) 태그 추가
    entity.addTag('hero');
    expect(entity.version).toBe(2);
    expect(listener).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ type: 'tag_added', tag: 'hero' }),
    );

    // 3) 태그 제거
    entity.removeTag('hero');
    expect(entity.version).toBe(3);
    expect(listener).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ type: 'tag_removed', tag: 'hero' }),
    );

    // 4) 컴포넌트 제거
    entity.remove(StatsComponent);
    expect(entity.version).toBe(4);
    expect(listener).toHaveBeenCalledWith(
      entity,
      expect.objectContaining({ type: 'component_removed' }),
    );

    // 5) 구독 해제
    unsubscribe();
    entity.addTag('monster');
    expect(listener).toHaveBeenCalledTimes(4); // 더 이상 호출 안 됨
  });

  it('World.subscribe: 엔티티 생성 및 삭제를 감지하고 버전을 증가시켜야 한다', () => {
    const world = new World<CoreEvents>();
    const listener = vi.fn();

    const unsubscribe = world.subscribe(listener);
    expect(world.version).toBe(0);

    // 1) 엔티티 생성
    const e1 = world.createEntity('player');
    expect(world.version).toBe(1);
    expect(listener).toHaveBeenCalledWith(
      world,
      expect.objectContaining({ type: 'entity_created', entity: e1 }),
    );

    // 2) 엔티티 삭제 (지연 삭제 update 시 발생)
    world.removeEntity(e1.id);
    world.update(0);
    expect(world.version).toBe(2);
    expect(listener).toHaveBeenCalledWith(
      world,
      expect.objectContaining({ type: 'entity_removed', entity: e1 }),
    );

    // 3) 구독 해제
    unsubscribe();
    world.createEntity('enemy');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('React 19 바인딩 훅 함수(useEntity, useComponent, useWorldEntities)가 모듈로서 올바르게 노출되어야 한다', () => {
    expect(typeof useEntity).toBe('function');
    expect(typeof useComponent).toBe('function');
    expect(typeof useWorldEntities).toBe('function');
  });
});
