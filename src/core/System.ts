/**
 * @module System
 * ECS의 S — 특정 컴포넌트 조합을 가진 Entity에 로직을 적용한다.
 * 각 System은 자신이 처리할 컴포넌트 타입 목록(query)을 선언한다.
 */

import { Component, ComponentType } from './Component';
import { Entity } from './Entity';
import { EventBus, EventMap } from './EventBus';

export abstract class System<Events extends EventMap = EventMap> {
  /** 이 System이 필요로 하는 컴포넌트 타입들 (쿼리 필터) */
  abstract readonly query: ComponentType[];

  /** World가 주입하는 이벤트 버스 */
  protected bus!: EventBus<Events>;

  /** World 초기화 시 호출 — 이벤트 구독 등 초기 작업 */
  onInit?(bus: EventBus<Events>): void;

  /** 매 틱(update) 마다 호출 */
  abstract update(entities: Entity[], delta: number): void;

  /** World 해제 시 호출 */
  onDestroy?(): void;

  /** @internal World가 bus를 주입할 때 사용 */
  _init(bus: EventBus<Events>): void {
    this.bus = bus;
    this.onInit?.(bus);
  }
}
