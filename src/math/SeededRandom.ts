/**
 * @module math/SeededRandom
 * 시드 기반 결정론적 난수 생성기 (PCG32 알고리즘 기반).
 * 동일한 시드와 호출 순서에 대해 플랫폼에 무관하게 100% 동일한 난수를 생성한다.
 *
 * 서버 리플레이 검증, 치트 방지, 절차적 맵/전리품 생성에 활용된다.
 */

export interface PRNGState {
  state: string; // BigInt 직렬화용 문자열
  inc: string;
}

export class SeededRandom {
  // 64-bit BigInt constants for PCG32
  private static readonly MULTIPLIER = 6364136223846793005n;
  private static readonly MASK64 = 0xffffffffffffffffn;
  private static readonly MASK32 = 0xffffffffn;

  private _state: bigint;
  private _inc: bigint;

  constructor(seed: number | string = Date.now()) {
    let numericSeed: bigint;
    if (typeof seed === 'string') {
      numericSeed = SeededRandom.hashString(seed);
    } else if (typeof seed === 'number' && Number.isFinite(seed)) {
      numericSeed = BigInt(Math.floor(seed));
    } else {
      // NaN, Infinity 또는 비정상 입력 방어
      numericSeed = SeededRandom.hashString(String(seed));
    }

    // Default stream sequence
    this._inc = 1442695040888963407n | 1n; // Must be odd
    this._state = 0n;

    // Initialize state
    this._step();
    this._state = (this._state + (numericSeed & SeededRandom.MASK64)) & SeededRandom.MASK64;
    this._step();
  }

  /** 문자열 시드를 64비트 정수로 변환하는 FNV-1a 해시 */
  static hashString(str: string): bigint {
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * prime) & SeededRandom.MASK64;
    }
    return hash;
  }

  private _step(): void {
    this._state = (this._state * SeededRandom.MULTIPLIER + this._inc) & SeededRandom.MASK64;
  }

  /**
   * 32비트 부호 없는 정수 난수 생성 [0, 2^32 - 1]
   */
  nextUint32(): number {
    const oldState = this._state;
    this._step();

    // PCG32 output function (XSH-RR: xorshift high, random rotate)
    const xorShifted = Number(((oldState >> 18n) ^ oldState) >> 27n) >>> 0;
    const rot = Number(oldState >> 59n);

    return ((xorShifted >>> rot) | (xorShifted << ((-rot) & 31))) >>> 0;
  }

  /**
   * 0 이상 1 미만의 균등 난수 반환 [0, 1)
   */
  next(): number {
    return this.nextUint32() / 4294967296; // 2^32
  }

  /**
   * min 이상 max 이하의 정수 반환 [min, max]
   */
  nextInt(min: number, max: number): number {
    if (min > max) [min, max] = [max, min];
    const range = max - min + 1;
    return min + Math.floor(this.next() * range);
  }

  /**
   * min 이상 max 미만의 실수 반환 [min, max)
   */
  nextFloat(min: number, max: number): number {
    if (min > max) [min, max] = [max, min];
    return min + this.next() * (max - min);
  }

  /**
   * 확률(0~1)에 따라 성공 여부 반환
   * @param probability 0.0 ~ 1.0
   */
  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.next() < probability;
  }

  /**
   * 배열에서 무작위 원소 1개 선택 (배열이 비어있으면 undefined)
   */
  pick<T>(array: readonly T[]): T | undefined {
    if (array.length === 0) return undefined;
    const index = Math.floor(this.next() * array.length);
    return array[index];
  }

  /**
   * 배열의 원소를 무작위로 섞은 새 배열 반환 (Fisher-Yates 알고리즘)
   */
  shuffle<T>(array: readonly T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * 현재 상태로부터 파생된 독립적인 하위 PRNG 인스턴스 생성 (64비트 합성 시드)
   */
  fork(): SeededRandom {
    const hi = BigInt(this.nextUint32());
    const lo = BigInt(this.nextUint32());
    const combinedSeed = ((hi << 32n) | lo).toString();
    const child = new SeededRandom(combinedSeed);
    return child;
  }

  /**
   * 내부 PRNG 상태를 직렬화 가능한 객체로 추출
   */
  exportState(): PRNGState {
    return {
      state: this._state.toString(),
      inc: this._inc.toString(),
    };
  }

  /**
   * 직렬화된 PRNG 상태 복원
   */
  importState(state: PRNGState): void {
    this._state = BigInt(state.state);
    this._inc = BigInt(state.inc);
  }
}
