/**
 * @module components/ItemDefComponent
 * 아이템 정의(Definition) 컴포넌트.
 * 기존 Item 클래스의 정적 데이터를 ECS 방식으로 포팅.
 * 실제 아이템 인스턴스가 아닌 "아이템 종류" 를 정의하는 데이터.
 */

import { Component } from '../core/Component';
import { Constraint } from '../constraints/Constraint';

export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest' | string;

export interface ItemSpec {
  /** 아이템 종류별 추가 스펙 (무기: damage, 방어구: defense 등) */
  [key: string]: unknown;
}

export class ItemDefComponent extends Component {
  id: string | number;
  idx: number;
  name: string;
  category: ItemCategory;
  /** 슬롯당 최대 소지 수량 (0 = 중첩 불가) */
  stackLimit: number;
  /** 기본 가치 */
  value: number;
  spec: ItemSpec;
  description: string;
  /** 사용/장착 제약조건 (equip 또는 use 시 컨트롤러가 평가) */
  constraints?: Constraint[];

  constructor(props: {
    id?: string | number;
    idx?: number;
    name: string;
    category: ItemCategory;
    stackLimit?: number;
    value?: number;
    spec?: ItemSpec;
    description?: string;
    constraints?: Constraint[];
  }) {
    super();
    this.id = props.id ?? props.idx ?? 0;
    this.idx = typeof props.idx === 'number' ? props.idx : (typeof props.id === 'number' ? props.id : 0);
    this.name = props.name;
    this.category = props.category;
    this.stackLimit = props.stackLimit ?? 99;
    this.value = props.value ?? 0;
    this.spec = props.spec ?? {};
    this.description = props.description ?? '';
    this.constraints = props.constraints;
  }
}
