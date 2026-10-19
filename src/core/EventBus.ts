/**
 * @module EventBus
 * 시스템 간 느슨한 결합을 위한 이벤트 버스.
 * 퍼블리시/구독 패턴. 타입 안전한 이벤트 정의를 지원한다.
 */

export type EventMap = object;

export type EventHandler<T = any> = (payload: T) => void;
export type Listener<T = any> = EventHandler<T>;

export class EventBus<Events extends EventMap = EventMap> {
  private _listeners: Map<keyof Events, Set<EventHandler<any>>> = new Map();

  on<K extends keyof Events>(event: K, listener: EventHandler<Events[K]>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    // 반환값은 구독 해제 함수
    return () => this.off(event, listener);
  }

  /**
   * 이벤트를 단 1회만 수신하고 자동으로 구독을 해제한다.
   */
  once<K extends keyof Events>(event: K, listener: EventHandler<Events[K]>): () => void {
    const wrapped: EventHandler<Events[K]> = (payload) => {
      this.off(event, wrapped);
      listener(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof Events>(event: K, listener: EventHandler<Events[K]>): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    const handlers = Array.from(set);
    for (const listener of handlers) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[EventBus] Unhandled error in listener for event "${String(event)}":`, err);
      }
    }
  }

  /** 특정 이벤트의 등록된 리스너 수 조회 */
  listenerCount<K extends keyof Events>(event: K): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}
