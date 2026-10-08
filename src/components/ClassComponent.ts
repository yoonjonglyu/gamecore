/**
 * @module components/ClassComponent
 * Entity의 직업(클래스), 레벨, 속성(element)을 담는 컴포넌트.
 * WeaponConstraint / LevelConstraint / ClassConstraint 평가에 사용.
 */

import { Component } from '../core/Component';

export class ClassComponent extends Component {
  /** 직업 식별자 (예: 'warrior', 'mage', 'rogue') */
  classId: string;
  /** 현재 레벨 */
  level: number;
  /** 속성 (예: 'fire', 'water', 'none') — 없으면 빈 배열 */
  elements: string[];

  constructor(props: {
    classId: string;
    level?: number;
    elements?: string[];
  }) {
    super();
    this.classId = props.classId;
    this.level = props.level ?? 1;
    this.elements = props.elements ?? [];
  }

  hasElement(element: string): boolean {
    return this.elements.includes(element);
  }
}
