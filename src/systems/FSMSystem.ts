/**
 * @module systems/FSMSystem
 * FSMComponent를 가진 엔티티들의 상태 지속 시간 및 자동 전이(Timeout)를 관리하는 시스템.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { FSMComponent } from '../components/FSMComponent';

export class FSMSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [FSMComponent];

  update(entities: Entity[], delta: number): void {
    for (const entity of entities) {
      const fsm = entity.get(FSMComponent);
      if (!fsm) continue;

      const result = fsm._tick(delta);
      // entity가 월드에 바인딩되지 않은 단독 사용 시에만 시스템에서 이벤트 발행 (이중 발행 방지)
      if (result.changed && !entity.world) {
        this.bus.emit('fsm:state:changed', {
          entityId: entity.id,
          prev: result.prev ?? result.current,
          next: result.current,
        });
      }
    }
  }
}
