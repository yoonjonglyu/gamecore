/**
 * @module core/Blackboard
 * 엔티티에 종속되지 않는 전역 게임 상태(퀘스트 플래그, 시나리오 진행도, 날씨, 챕터 등)를 저장하는 블랙보드.
 * 세이브/로드 시 WorldSerializer 및 SaveManager와 연동된다.
 */

export type BlackboardListener = (key: string, prevValue: any, nextValue: any) => void;

export class Blackboard {
  private _data: Map<string, any> = new Map();
  private _listeners: Set<BlackboardListener> = new Set();

  /**
   * 값 조회
   */
  get<T = any>(key: string, defaultValue?: T): T {
    if (this._data.has(key)) {
      return this._data.get(key) as T;
    }
    return defaultValue as T;
  }

  /**
   * 값 설정 (리스너에 변경 통지)
   */
  set<T = any>(key: string, value: T): this {
    const prev = this._data.get(key);
    this._data.set(key, value);
    if (prev !== value) {
      for (const listener of this._listeners) {
        listener(key, prev, value);
      }
    }
    return this;
  }

  has(key: string): boolean {
    return this._data.has(key);
  }

  delete(key: string): boolean {
    if (this._data.has(key)) {
      const prev = this._data.get(key);
      this._data.delete(key);
      for (const listener of this._listeners) {
        listener(key, prev, undefined);
      }
      return true;
    }
    return false;
  }

  clear(): void {
    this._data.clear();
  }

  // ──────────────────────────────────────────────
  // 숫자 및 플래그 편의 메서드
  // ──────────────────────────────────────────────

  increment(key: string, delta: number = 1): number {
    const current = Number(this.get(key, 0)) || 0;
    const next = current + delta;
    this.set(key, next);
    return next;
  }

  toggle(key: string): boolean {
    const current = Boolean(this.get(key, false));
    const next = !current;
    this.set(key, next);
    return next;
  }

  setFlag(flag: string, value: boolean = true): this {
    return this.set(flag, value);
  }

  hasFlag(flag: string): boolean {
    return this.get<boolean>(flag, false) === true;
  }

  // ──────────────────────────────────────────────
  // 직렬화 & 옵저버
  // ──────────────────────────────────────────────

  subscribe(listener: BlackboardListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  toRecord(): Record<string, any> {
    return Object.fromEntries(this._data.entries());
  }

  fromRecord(record: Record<string, any>): this {
    this._data.clear();
    if (record && typeof record === 'object') {
      for (const [k, v] of Object.entries(record)) {
        this._data.set(k, v);
      }
    }
    return this;
  }

  toJSON(): Record<string, any> {
    return this.toRecord();
  }

  fromJSON(record: Record<string, any>): this {
    return this.fromRecord(record);
  }
}
