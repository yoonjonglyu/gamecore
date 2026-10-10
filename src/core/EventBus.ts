/**
 * @module EventBus
 * 시스템 간 느슨한 결합을 위한 이벤트 버스.
 * 퍼블리시/구독 패턴. 타입 안전한 이벤트 정의를 지원한다.
 *
 * @example
 * // 이벤트 타입 정의
 * interface GameEvents {
 *   'player:damaged': { entityId: number; amount: number };
 *   'item:picked': { entityId: number; itemId: number };
 * }
 * const bus = new EventBus<GameEvents>();
 * bus.on('player:damaged', ({ entityId, amount }) => { ... });
 * bus.emit('player:damaged', { entityId: 1, amount: 10 });
 */

export type EventMap = object;

type Listener<T> = (payload: T) => void;

export class EventBus<Events extends EventMap = EventMap> {
  private _listeners: Map<keyof Events, Set<Listener<any>>> = new Map();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    // 반환값은 구독 해제 함수
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this._listeners.get(event)?.forEach((listener) => listener(payload));
  }

  /**
   * 1회만 실행되고 자동으로 구독 해제되는 리스너 등록
   */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const wrapper: Listener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  /** 특정 이벤트에 등록된 리스너 개수 */
  listenerCount<K extends keyof Events>(event: K): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  /** 특정 이벤트의 모든 리스너 제거 */
  clear<K extends keyof Events>(event?: K): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

}
