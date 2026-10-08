/**
 * @module data/Registry
 * 제네릭 인메모리 정의 데이터 저장소.
 * 게임 프로젝트에서 아이템, 스킬, 몬스터 블루프린트 등
 * 고유 ID를 가진 마스터 데이터를 등록하고 조회하는 데 사용한다.
 */

export interface Identifiable<TId extends string | number = string | number> {
  id: TId;
}

export class Registry<T extends Identifiable> {
  private _items: Map<T['id'], T> = new Map();

  constructor(initialItems: T[] = []) {
    this.registerMany(initialItems);
  }

  /** 항목 등록. 이미 존재하는 ID면 덮어쓴다. */
  register(item: T): this {
    this._items.set(item.id, item);
    return this;
  }

  /** 여러 항목 일괄 등록 */
  registerMany(items: T[]): this {
    for (const item of items) {
      this.register(item);
    }
    return this;
  }

  /** ID로 항목 조회. 없으면 undefined */
  get(id: T['id']): T | undefined {
    return this._items.get(id);
  }

  /** ID로 항목 조회. 없으면 Error throw */
  getOrThrow(id: T['id']): T {
    const item = this.get(id);
    if (!item) {
      throw new Error(`[Registry] Entry with ID '${String(id)}' not found.`);
    }
    return item;
  }

  /** ID 존재 여부 확인 */
  has(id: T['id']): boolean {
    return this._items.has(id);
  }

  /** 항목 제거 */
  remove(id: T['id']): boolean {
    return this._items.delete(id);
  }

  /** 모든 항목 목록 반환 */
  all(): T[] {
    return [...this._items.values()];
  }

  /** 모든 ID 목록 반환 */
  keys(): T['id'][] {
    return [...this._items.keys()];
  }

  /** 조건에 맞는 첫 번째 항목 검색 */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this._items.values()) {
      if (predicate(item)) return item;
    }
    return undefined;
  }

  /** 조건에 맞는 모든 항목 필터링 */
  filter(predicate: (item: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  /** 전체 비우기 */
  clear(): void {
    this._items.clear();
  }

  /** 등록된 항목 개수 */
  get size(): number {
    return this._items.size;
  }

  /** JSON 직렬화용 배열 반환 */
  toJSON(): T[] {
    return this.all();
  }
}
