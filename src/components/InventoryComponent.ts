/**
 * @module components/InventoryComponent
 * Entity가 소지한 아이템 목록을 담는 컴포넌트.
 * 기존 ItemList 로직을 ECS 방식으로 포팅.
 */

import { Component } from '../core/Component';

export interface ItemEntry {
  /** 아이템 정의 ID (ItemDef의 id/idx) */
  defId: string | number;
  /** 소지 수량 */
  quantity: number;
}

export class InventoryComponent extends Component {
  private _items: Map<string | number, ItemEntry> = new Map();
  readonly maxSlots: number;

  constructor(maxSlots = 30) {
    super();
    this.maxSlots = maxSlots;
  }

  get size(): number {
    return this._items.size;
  }

  get isFull(): boolean {
    return this._items.size >= this.maxSlots;
  }

  get items(): ItemEntry[] {
    return [...this._items.values()];
  }

  add(defId: string | number, quantity = 1): boolean {
    if (this._items.has(defId)) {
      this._items.get(defId)!.quantity += quantity;
      return true;
    }
    if (this.isFull) return false;
    this._items.set(defId, { defId, quantity });
    return true;
  }

  remove(defId: string | number, quantity = 1): boolean {
    const entry = this._items.get(defId);
    if (!entry || entry.quantity < quantity) return false;
    entry.quantity -= quantity;
    if (entry.quantity <= 0) this._items.delete(defId);
    return true;
  }

  has(defId: string | number, quantity = 1): boolean {
    return (this._items.get(defId)?.quantity ?? 0) >= quantity;
  }

  getQuantity(defId: string | number): number {
    return this._items.get(defId)?.quantity ?? 0;
  }
}
