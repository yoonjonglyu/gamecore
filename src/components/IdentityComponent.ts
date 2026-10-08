/**
 * @module components/IdentityComponent
 * Entity의 이름, 고유 idx 등 식별 정보를 담는 컴포넌트.
 */

import { Component } from '../core/Component';

export class IdentityComponent extends Component {
  idx: number;
  name: string;
  description: string;

  constructor(idx: number, name: string, description = '') {
    super();
    this.idx = idx;
    this.name = name;
    this.description = description;
  }
}
