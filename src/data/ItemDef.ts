/**
 * @module data/ItemDef
 * 아이템 마스터 데이터 정의.
 * 외부 JSON/데이터에서 로드되어 Registry에 등록된다.
 */

import { ItemCategory, ItemSpec } from '../components/ItemDefComponent';
import { Constraint } from '../constraints/Constraint';

export interface ItemDef {
  /** 아이템 고유 식별자 (예: 'potion_hp_small', 1001) */
  id: string | number;
  /** 표시 이름 */
  name: string;
  /** 카테고리 (weapon, armor, consumable, material, quest 등) */
  category: ItemCategory;
  /** 슬롯당 최대 소지 수량 (기본값 99) */
  stackLimit?: number;
  /** 상점/거래 기본 가치 */
  value?: number;
  /** 세부 스펙 (공격력, 방어력 등) */
  spec?: ItemSpec;
  /** 아이템 설명 */
  description?: string;
  /** 사용/장착 제약조건 */
  constraints?: Constraint[];
}
