/**
 * @module components/InventoryComponent
 * Entity가 소지한 아이템 목록을 담는 범용 인벤토리 컴포넌트.
 *
 * 지원 기능:
 * 1) 슬롯 수(maxSlots) 및 소지 중량(maxWeight) 제한
 * 2) 아이템별 최대 스택(maxStack) 분할 및 자동 병합(autoStack)
 * 3) 기준별 자동 정렬(sortBy: id, quantity, rarity, name, value 등) 및 커스텀 필터링
 * 4) 다른 인벤토리와의 아이템 전송(transferTo)
 * 5) 기존 API(add, remove, has, items, isFull)와 100% 하위 호환
 */

import { Component } from '../core/Component';

export interface ItemEntry {
  /** 아이템 고유 슬롯 식별자 (내부 관리용) */
  slotId?: string;
  /** 아이템 정의 ID (ItemDef의 id/idx) */
  defId: string | number;
  /** 소지 수량 */
  quantity: number;
}

export interface ItemMeta {
  id: string | number;
  name?: string;
  category?: string;
  rarity?: number | string;
  weight?: number;
  maxStack?: number;
  value?: number;
}

export type ItemMetaLookup = (defId: string | number) => ItemMeta | undefined;

export interface InventoryOptions {
  maxSlots?: number;
  maxWeight?: number;
}

export class InventoryComponent extends Component {
  private _slots: ItemEntry[] = [];
  readonly maxSlots: number;
  maxWeight?: number;

  constructor(optionsOrMaxSlots: number | InventoryOptions = 30) {
    super();
    if (typeof optionsOrMaxSlots === 'number') {
      this.maxSlots = optionsOrMaxSlots;
      this.maxWeight = undefined;
    } else {
      this.maxSlots = optionsOrMaxSlots.maxSlots ?? 30;
      this.maxWeight = optionsOrMaxSlots.maxWeight;
    }
  }

  // ──────────────────────────────────────────────
  // 기본 상태 조회
  // ──────────────────────────────────────────────

  /** 현재 사용 중인 슬롯 수 */
  get size(): number {
    return this._slots.length;
  }

  /** 슬롯이 모두 가득 찼는지 여부 */
  get isFull(): boolean {
    return this._slots.length >= this.maxSlots;
  }

  /** 인벤토리에 들어있는 모든 아이템 슬롯 복사본 */
  get items(): ItemEntry[] {
    return this._slots.map((s) => ({ ...s }));
  }

  /**
   * 메타데이터 조회를 바탕으로 현재 총 적재 무게를 계산합니다.
   */
  getCurrentWeight(metaLookup?: ItemMetaLookup): number {
    if (!metaLookup) return 0;
    let total = 0;
    for (const slot of this._slots) {
      const meta = metaLookup(slot.defId);
      if (meta?.weight) {
        total += meta.weight * slot.quantity;
      }
    }
    return total;
  }

  /**
   * 현재 인벤토리가 최대 소지 중량을 초과했는지 확인합니다.
   */
  isOverweight(metaLookup?: ItemMetaLookup): boolean {
    if (this.maxWeight === undefined) return false;
    return this.getCurrentWeight(metaLookup) > this.maxWeight;
  }

  /**
   * 특정 아이템의 총 소지 수량을 반환합니다 (분할된 슬롯들의 합산).
   */
  getQuantity(defId: string | number): number {
    let total = 0;
    for (const slot of this._slots) {
      if (slot.defId === defId) {
        total += slot.quantity;
      }
    }
    return total;
  }

  /**
   * 특정 아이템을 지정 수량 이상 소지하고 있는지 확인합니다.
   */
  has(defId: string | number, quantity = 1): boolean {
    return this.getQuantity(defId) >= quantity;
  }

  // ──────────────────────────────────────────────
  // 아이템 추가 & 제거
  // ──────────────────────────────────────────────

  /**
   * 아이템을 인벤토리에 추가합니다.
   * maxStack이 설정되어 있으면 기존 스택을 채우고 남은 수량은 새 슬롯에 분할 저장합니다.
   * maxWeight가 설정되어 있으면 무게 초과 시 추가가 거절됩니다.
   */
  add(
    defId: string | number,
    quantity = 1,
    options?: {
      maxStack?: number;
      metaLookup?: ItemMetaLookup;
    },
  ): boolean {
    if (quantity <= 0) return true;

    const meta = options?.metaLookup ? options.metaLookup(defId) : undefined;
    const maxStack = options?.maxStack ?? meta?.maxStack ?? Infinity;
    const itemWeight = meta?.weight ?? 0;

    // 무게 제한 검사
    if (this.maxWeight !== undefined && itemWeight > 0) {
      const currentWeight = this.getCurrentWeight(options?.metaLookup);
      const addedWeight = itemWeight * quantity;
      if (currentWeight + addedWeight > this.maxWeight) {
        return false;
      }
    }

    let remainingToAdd = quantity;

    // 1. 기존 슬롯 중 공간이 남아있는 동일 아이템 슬롯에 먼저 채우기
    if (maxStack < Infinity) {
      for (const slot of this._slots) {
        if (slot.defId === defId && slot.quantity < maxStack) {
          const available = maxStack - slot.quantity;
          const toAdd = Math.min(available, remainingToAdd);
          slot.quantity += toAdd;
          remainingToAdd -= toAdd;
          if (remainingToAdd <= 0) break;
        }
      }
    } else {
      // maxStack 제한이 없는 기본 모드: 기존 단일 슬롯에 전부 누적
      const existing = this._slots.find((s) => s.defId === defId);
      if (existing) {
        existing.quantity += remainingToAdd;
        return true;
      }
    }

    if (remainingToAdd <= 0) {
      return true;
    }

    // 2. 남은 수량을 채울 새 슬롯 개수 산출 및 슬롯 제한 검사
    const slotsNeeded =
      maxStack < Infinity ? Math.ceil(remainingToAdd / maxStack) : 1;

    if (this._slots.length + slotsNeeded > this.maxSlots) {
      return false;
    }

    // 3. 새 슬롯 추가
    while (remainingToAdd > 0) {
      const toAdd = Math.min(maxStack, remainingToAdd);
      this._slots.push({
        slotId: `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        defId,
        quantity: toAdd,
      });
      remainingToAdd -= toAdd;
    }

    return true;
  }

  /**
   * 아이템을 인벤토리에서 차감/제거합니다.
   * 여러 슬롯에 나뉘어 저장된 경우 순차적으로 차감합니다.
   */
  remove(defId: string | number, quantity = 1): boolean {
    if (quantity <= 0) return true;
    if (!this.has(defId, quantity)) return false;

    let remainingToRemove = quantity;

    for (let i = this._slots.length - 1; i >= 0; i--) {
      const slot = this._slots[i];
      if (slot.defId === defId) {
        if (slot.quantity <= remainingToRemove) {
          remainingToRemove -= slot.quantity;
          this._slots.splice(i, 1);
        } else {
          slot.quantity -= remainingToRemove;
          remainingToRemove = 0;
        }

        if (remainingToRemove <= 0) break;
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // 고도화 유틸: 자동 병합, 정렬, 필터링, 전송
  // ──────────────────────────────────────────────

  /**
   * 쪼개진 동일 아이템 슬롯들을 maxStack 한도 내로 자동 병합(Auto-stacking)하여 슬롯을 압축합니다.
   */
  autoStack(metaLookup?: ItemMetaLookup): void {
    const itemTotals = new Map<string | number, number>();
    for (const slot of this._slots) {
      itemTotals.set(slot.defId, (itemTotals.get(slot.defId) ?? 0) + slot.quantity);
    }

    const newSlots: ItemEntry[] = [];

    for (const [defId, totalQty] of itemTotals.entries()) {
      const meta = metaLookup ? metaLookup(defId) : undefined;
      const maxStack = meta?.maxStack ?? Infinity;

      let remaining = totalQty;
      while (remaining > 0) {
        const take = Math.min(maxStack, remaining);
        newSlots.push({
          slotId: `slot_${newSlots.length}`,
          defId,
          quantity: take,
        });
        remaining -= take;
      }
    }

    this._slots = newSlots;
  }

  /**
   * 커스텀 비교 함수로 슬롯을 정렬합니다.
   */
  sort(comparator: (a: ItemEntry, b: ItemEntry) => number): void {
    this._slots.sort(comparator);
  }

  /**
   * 기준에 따라 아이템 슬롯을 자동 정렬합니다.
   */
  sortBy(
    criteria: 'id' | 'quantity' | 'rarity' | 'name' | 'value',
    order: 'asc' | 'desc' = 'asc',
    metaLookup?: ItemMetaLookup,
  ): void {
    const mult = order === 'asc' ? 1 : -1;

    this.sort((a, b) => {
      const metaA = metaLookup ? metaLookup(a.defId) : undefined;
      const metaB = metaLookup ? metaLookup(b.defId) : undefined;

      switch (criteria) {
        case 'id':
          return mult * String(a.defId).localeCompare(String(b.defId));
        case 'quantity':
          return mult * (a.quantity - b.quantity);
        case 'rarity': {
          const rA = Number(metaA?.rarity ?? 0);
          const rB = Number(metaB?.rarity ?? 0);
          return mult * (rA - rB);
        }
        case 'name': {
          const nA = metaA?.name ?? String(a.defId);
          const nB = metaB?.name ?? String(b.defId);
          return mult * nA.localeCompare(nB);
        }
        case 'value': {
          const vA = metaA?.value ?? 0;
          const vB = metaB?.value ?? 0;
          return mult * (vA - vB);
        }
        default:
          return 0;
      }
    });
  }

  /**
   * 조건에 맞는 아이템 슬롯 목록을 필터링하여 반환합니다.
   */
  filter(predicate: (item: ItemEntry) => boolean): ItemEntry[] {
    return this._slots.filter(predicate).map((s) => ({ ...s }));
  }

  /**
   * 특정 카테고리의 아이템들만 조회합니다.
   */
  getByCategory(category: string, metaLookup: ItemMetaLookup): ItemEntry[] {
    return this.filter((item) => {
      const meta = metaLookup(item.defId);
      return meta?.category === category;
    });
  }

  /**
   * 다른 대상 인벤토리로 아이템을 안전하게 전송(이동)합니다.
   */
  transferTo(
    target: InventoryComponent,
    defId: string | number,
    quantity?: number,
    metaLookup?: ItemMetaLookup,
  ): { transferred: number; remaining: number } {
    const available = this.getQuantity(defId);
    const toTransfer = quantity !== undefined ? Math.min(available, quantity) : available;

    if (toTransfer <= 0) {
      return { transferred: 0, remaining: available };
    }

    const meta = metaLookup ? metaLookup(defId) : undefined;
    const added = target.add(defId, toTransfer, {
      maxStack: meta?.maxStack,
      metaLookup,
    });

    if (added) {
      this.remove(defId, toTransfer);
      return {
        transferred: toTransfer,
        remaining: this.getQuantity(defId),
      };
    }

    return { transferred: 0, remaining: available };
  }

  /** 인벤토리 전체 비우기 */
  clear(): void {
    this._slots = [];
  }
}
