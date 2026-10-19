/**
 * @module react
 * React 18/19 전용 useSyncExternalStore 기반 GameCore 상태 바인딩 훅.
 *
 * 외부 상태(Entity, Component, World)와 React 컴포넌트를
 * 깜빡임(tearing) 없이 실시간 동기화한다.
 *
 * @example
 * ```tsx
 * import { useEntity, useComponent } from 'ryuis-gamecore/react';
 *
 * function HeroHealth({ hero }: { hero: Entity }) {
 *   useEntity(hero); // 엔티티의 모든 컴포넌트 추가/제거 및 상태 변경 시 리렌더
 *   const stats = useComponent(hero, StatsComponent);
 *   return <div>HP: {stats?.hp} / {stats?.maxHp}</div>;
 * }
 * ```
 */

import { useSyncExternalStore, useMemo, useCallback } from 'react';
import { Entity, Component, ComponentType, World } from '../index';

/**
 * 특정 엔티티의 상태 변경을 구독하는 React 훅.
 * 엔티티에 컴포넌트가 추가/제거되거나 notifyChange가 호출될 때 자동 리렌더링된다.
 */
export function useEntity(entity: Entity | undefined): Entity | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!entity) return () => {};
      return entity.subscribe(() => onStoreChange());
    },
    [entity],
  );

  const getSnapshot = useCallback(() => {
    return entity ? entity.version : -1;
  }, [entity]);

  const getServerSnapshot = useCallback(() => {
    return -1;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return entity;
}

/**
 * 특정 엔티티의 특정 컴포넌트를 구독하고 가져오는 React 훅.
 * 엔티티가 변경되거나 해당 컴포넌트가 변경/추가/제거될 때 자동 리렌더링된다.
 */
export function useComponent<T extends Component>(
  entity: Entity | undefined,
  componentType: ComponentType<T>,
): T | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!entity) return () => {};
      return entity.subscribe((_, change) => {
        // 해당 컴포넌트 관련 변경이거나 전체 변경 시 리렌더
        if (!change.componentType || change.componentType === componentType) {
          onStoreChange();
        }
      });
    },
    [entity, componentType],
  );

  const getSnapshot = useCallback(() => {
    // entity.version을 스냅샷으로 사용하여 내부 값 변경(notifyUpdated) 감지
    return entity ? entity.version : -1;
  }, [entity]);

  const getServerSnapshot = useCallback(() => {
    return -1;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return entity ? entity.get(componentType) : undefined;
}

/**
 * 월드의 엔티티 생성/삭제를 구독하는 React 훅.
 */
export function useWorld(world: World | undefined): World | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!world) return () => {};
      return world.subscribe(() => onStoreChange());
    },
    [world],
  );

  const getSnapshot = useCallback(() => {
    return world ? world.version : -1;
  }, [world]);

  const getServerSnapshot = useCallback(() => {
    return -1;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return world;
}

/**
 * 월드에서 특정 컴포넌트들을 가진 엔티티 목록을 구독하여 가져오는 React 훅.
 */
export function useWorldEntities(world: World | undefined, query: ComponentType[] = []): Entity[] {
  useWorld(world);

  return useMemo(() => {
    if (!world) return [];
    if (query.length === 0) return world.entities;
    return world.queryEntities(query);
  }, [world, world?.version, ...query]);
}
