/**
 * @module Component
 * ECS의 C — 순수 데이터 컨테이너.
 * 로직 없이 데이터만 보유. System이 로직을 담당한다.
 */

export type ComponentType<T extends Component = Component> = new (...args: any[]) => T;

export abstract class Component {
  /** 이 컴포넌트가 속한 Entity의 ID (World가 할당) */
  entityId: number = -1;
}
