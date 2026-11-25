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
  private _onceWrappers: Map<keyof Events, WeakMap<EventHandler<any>, EventHandler<any>>> = new Map();

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
      this.off(event, listener);
      listener(payload);
    };
    let map = this._onceWrappers.get(event);
    if (!map) {
      map = new WeakMap();
      this._onceWrappers.set(event, map);
    }
    map.set(listener, wrapped);
    return this.on(event, wrapped);
  }

  off<K extends keyof Events>(event: K, listener: EventHandler<Events[K]>): void {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(listener);
    const wrapped = this._onceWrappers.get(event)?.get(listener);
    if (wrapped) {
      set.delete(wrapped);
      this._onceWrappers.get(event)?.delete(listener);
    }
    if (set.size === 0) {
      this._listeners.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    const handlers = Array.from(set);
    for (const listener of handlers) {
      if (!set.has(listener)) continue;
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
    this._onceWrappers.clear();
  }
}
