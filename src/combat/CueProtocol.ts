/**
 * @module combat/CueProtocol
 * 게임 엔진과 렌더러/오디오 엔진(Pixi, Phaser, Three.js, Howler, Godot, Web Audio 등) 간의
 * 비주얼 및 사운드 연출(Cue)을 규격화하여 전달하는 프로토콜.
 */

export interface CueShakeConfig {
  intensity: number;
  duration: number; // ms
}

export interface CueFlashConfig {
  color: string;
  duration: number; // ms
}

export interface CuePayload {
  /** 오디오 이펙트 식별자 (예: 'sfx_slash_heavy', 'sword_hit_01') */
  sfx?: string;
  /** 시각 이펙트 식별자 (예: 'vfx_blood_splatter', 'slash_crit') */
  vfx?: string;
  /** 화면 흔들림 강도 (숫자) 또는 상세 설정 */
  shake?: number | CueShakeConfig;
  /** 화면 플래시 색상 또는 상세 설정 */
  flash?: string | CueFlashConfig;
  /** 애니메이션 재생 트리거 (예: 'hit_reaction', 'spell_cast') */
  anim?: string;
  /** 카테고리 태그 (예: 'combat', 'ui', 'dialogue') */
  tag?: string;
  /** 임의의 커스텀 추가 파라미터 (위치, 스케일 등) */
  custom?: Record<string, any>;
}

export interface CueEvent {
  id: string;
  type: string;
  sourceId?: number;
  targetId?: number;
  payload: CuePayload;
  timestamp: number;
}

let _cueCounter = 0;

/**
 * CueEvent 인스턴스를 생성하는 팩토리 함수
 */
export function createCue(
  type: string,
  payload: CuePayload,
  sourceId?: number,
  targetId?: number
): CueEvent {
  _cueCounter++;
  return {
    id: `cue_${Date.now()}_${_cueCounter}`,
    type,
    sourceId,
    targetId,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * 프레임 기반 렌더러 루프나 오디오 서브시스템에서
 * 발생한 Cue 이벤트를 수집하고 배치(Batch)로 비우거나 실시간 처리할 수 있는 큐
 */
export class CueQueue {
  private _queue: CueEvent[] = [];
  private _subscribers: Array<(cue: CueEvent) => void> = [];

  /**
   * 큐에 새 Cue를 삽입합니다. 구독자가 있다면 즉시 통지합니다.
   */
  push(cue: CueEvent): void {
    this._queue.push(cue);
    for (const sub of this._subscribers) {
      try {
        sub(cue);
      } catch (err) {
        console.error('[CueQueue] subscriber error:', err);
      }
    }
  }

  /**
   * 편의 메서드: payload를 직접 전달하여 새 Cue를 생성하고 삽입합니다.
   */
  emit(type: string, payload: CuePayload, sourceId?: number, targetId?: number): CueEvent {
    const cue = createCue(type, payload, sourceId, targetId);
    this.push(cue);
    return cue;
  }

  /**
   * 큐 맨 앞의 Cue를 하나 꺼냅니다.
   */
  pop(): CueEvent | undefined {
    return this._queue.shift();
  }

  /**
   * 현재 쌓인 모든 Cue를 비우고 배열로 반환합니다 (매 렌더링 프레임 소비용).
   */
  flush(): CueEvent[] {
    const cues = this._queue;
    this._queue = [];
    return cues;
  }

  /**
   * 큐를 비웁니다.
   */
  clear(): void {
    this._queue = [];
  }

  /**
   * 실시간 Cue 구독 리스너 등록
   */
  subscribe(fn: (cue: CueEvent) => void): () => void {
    this._subscribers.push(fn);
    return () => {
      this._subscribers = this._subscribers.filter((s) => s !== fn);
    };
  }

  get length(): number {
    return this._queue.length;
  }
}
