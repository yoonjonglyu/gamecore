/**
 * @module components/EquipmentComponent
 * Entity가 현재 장착 중인 아이템 슬롯을 관리한다.
 * WeaponConstraint 평가에서 장착 무기 타입 조회에 사용.
 */

import { Component } from '../core/Component';

export type EquipSlot =
  | 'weapon'
  | 'offhand'
  | 'head'
  | 'body'
  | 'legs'
  | 'feet'
  | 'accessory1'
  | 'accessory2'
  | string; // 게임마다 슬롯 확장 가능

export interface EquippedItem {
  /** ItemDef의 idx */
  defId: number;
  /** 무기 타입 (예: 'sword', 'staff', 'bow') — ItemDefComponent.spec에서 유래 */
  weaponType?: string;
  /** 아이템에 부여된 속성 */
  elements?: string[];
}

export class EquipmentComponent extends Component {
  private _slots: Map<EquipSlot, EquippedItem> = new Map();

  equip(slot: EquipSlot, item: EquippedItem): EquippedItem | undefined {
    const prev = this._slots.get(slot);
    this._slots.set(slot, item);
    return prev; // 기존 장착 아이템 반환 (인벤토리로 되돌리기용)
  }

  unequip(slot: EquipSlot): EquippedItem | undefined {
    const item = this._slots.get(slot);
    this._slots.delete(slot);
    return item;
  }

  getSlot(slot: EquipSlot): EquippedItem | undefined {
    return this._slots.get(slot);
  }

  isEquipped(slot: EquipSlot): boolean {
    return this._slots.has(slot);
  }

  /** 현재 장착된 모든 무기 타입 목록 */
  get equippedWeaponTypes(): string[] {
    const types: string[] = [];
    for (const item of this._slots.values()) {
      if (item.weaponType) types.push(item.weaponType);
    }
    return types;
  }

  /** 현재 장착 아이템의 모든 속성 목록 */
  get equippedElements(): string[] {
    const elements: string[] = [];
    for (const item of this._slots.values()) {
      item.elements?.forEach((e) => elements.push(e));
    }
    return elements;
  }

  get allSlots(): Map<EquipSlot, EquippedItem> {
    return new Map(this._slots);
  }
}
