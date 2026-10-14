/**
 * @module serialization/SaveManager
 * 세이브 데이터 무결성 검증, 위변조 방지 체크섬, 버전 마이그레이션을 지원하는 고수준 세이브 매니저.
 * 플랫폼 독립적으로 순수 문자열 기반으로 동작한다 (Node.js, 브라우저, Web Worker, React Native 등).
 */

import { World } from '../core/World';
import { Entity } from '../core/Entity';
import { WorldSerializer, SerializedWorld } from './WorldSerializer';
import { sha256, hmacSha256 } from './crypto';

export interface SaveEnvelope {
  /** 스키마 버전 (정수) */
  version: number;
  /** 저장 타임스탬프 (ms) */
  timestamp: number;
  /** 직렬화된 월드 데이터 */
  data: SerializedWorld;
  /** SHA-256 또는 HMAC-SHA256 기반 무결성 검증 서명 */
  checksum: string;
  /** 게임 부가 메타데이터 (가챠 천장, 대화 진행 노드, 유저 커스텀 세이브 등) */
  metadata?: Record<string, any>;
}

export type DeserializationResult =
  | {
      success: true;
      world: World<any>;
      version: number;
      entities: Entity[];
      metadata?: Record<string, any>;
    }
  | {
      success: false;
      error: string;
      tampered?: boolean;
    };

export type MigrationFunction = (data: any) => any;

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  migrator: MigrationFunction;
}

export class SaveManager {
  /** 기본 최신 스키마 버전 */
  static currentVersion: number = 1;

  private static _migrations: MigrationStep[] = [];
  private static _serializer = new WorldSerializer();

  /**
   * 스키마 버전 마이그레이션 함수를 등록한다.
   * 예: v1 -> v2 필드명 변경, 신규 기본값 추가 등
   */
  static registerMigration(
    fromVersion: number,
    toVersion: number,
    migrator: MigrationFunction,
  ): void {
    SaveManager._migrations.push({ fromVersion, toVersion, migrator });
    // 최신 버전 번호 자동 동기화
    if (toVersion > SaveManager.currentVersion) {
      SaveManager.currentVersion = toVersion;
    }
  }

  /**
   * 등록된 모든 마이그레이션을 초기화한다 (테스트 격리용).
   */
  static clearMigrations(): void {
    SaveManager._migrations = [];
    SaveManager.currentVersion = 1;
  }

  /**
   * World 상태를 직렬화하고, 변조 방지 체크섬 서명을 첨부한 세이브 문자열을 반환한다.
   * @param world 세이브할 월드 인스턴스
   * @param secretKey HMAC-SHA256 서명용 비밀키 (지정하지 않을 시 순수 SHA-256 체크섬)
   * @param version 저장할 스키마 버전 (기본값: currentVersion)
   * @param options 직렬화 옵션 및 추가 메타데이터
   */
  static serialize(
    world: World<any>,
    secretKey?: string,
    version: number = SaveManager.currentVersion,
    options?: import('./WorldSerializer').SerializeOptions & { metadata?: Record<string, any> },
  ): string {
    const rawData = SaveManager._serializer.serialize(world, options);
    const dataStr = JSON.stringify(rawData);
    const metaStr = options?.metadata ? JSON.stringify(options.metadata) : '';
    const timestamp = Date.now();
    const payloadToSign = `v:${version}|t:${timestamp}|data:${dataStr}${metaStr ? `|meta:${metaStr}` : ''}`;

    const checksum = secretKey
      ? hmacSha256(payloadToSign, secretKey)
      : sha256(payloadToSign);

    const envelope: SaveEnvelope = {
      version,
      timestamp,
      data: rawData,
      checksum,
      metadata: options?.metadata ? { ...options.metadata } : undefined,
    };

    return JSON.stringify(envelope);
  }

  /**
   * 타이밍 공격(timing attack)을 방지하기 위한 상수 시간 문자열 비교
   */
  private static _constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * 세이브 문자열의 체크섬을 검증하고, 필요 시 마이그레이션을 거쳐 World에 복원한다.
   * 변조가 감지되면 { success: false, tampered: true }를 반환한다.
   * @param payload serialize()로 생성된 JSON 세이브 문자열
   * @param targetWorld 복원할 World 인스턴스
   * @param secretKey serialize 시 사용했던 동일한 비밀키
   */
  static deserialize(
    payload: string,
    targetWorld: World<any>,
    secretKey?: string,
  ): DeserializationResult {
    let envelope: SaveEnvelope;
    try {
      envelope = JSON.parse(payload);
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to parse save envelope JSON: ${e?.message ?? e}`,
      };
    }

    if (!envelope || typeof envelope !== 'object' || !envelope.data || typeof envelope.checksum !== 'string') {
      return {
        success: false,
        error: 'Invalid save envelope structure',
      };
    }

    // 1. 체크섬 / HMAC 서명 무결성 검증 (version, timestamp, metadata 포함)
    const dataStr = JSON.stringify(envelope.data);
    const metaStr = envelope.metadata ? JSON.stringify(envelope.metadata) : '';
    const payloadToSign = `v:${envelope.version}|t:${envelope.timestamp}|data:${dataStr}${metaStr ? `|meta:${metaStr}` : ''}`;

    const expectedChecksum = secretKey
      ? hmacSha256(payloadToSign, secretKey)
      : sha256(payloadToSign);

    let isValid = SaveManager._constantTimeEqual(envelope.checksum, expectedChecksum);

    // 하위 호환성 fallback: 이전 v1.1.0/v1.1.1 서명 형식 (dataStr + metaStr)
    if (!isValid) {
      const legacyPayload = dataStr + (metaStr ? `|meta:${metaStr}` : '');
      const legacyExpected = secretKey
        ? hmacSha256(legacyPayload, secretKey)
        : sha256(legacyPayload);
      if (SaveManager._constantTimeEqual(envelope.checksum, legacyExpected)) {
        isValid = true;
      }
    }

    if (!isValid) {
      return {
        success: false,
        tampered: true,
        error: 'Save data signature mismatch: data has been tampered with or invalid secretKey',
      };
    }

    // 2. 버전 다운그레이드 방어: 세이브 버전이 현재 엔진의 최대 지원 버전보다 높으면 거부
    const dataVersion = envelope.version ?? 1;
    if (dataVersion > SaveManager.currentVersion) {
      return {
        success: false,
        error: `Cannot load save version ${dataVersion}. Current engine supports up to version ${SaveManager.currentVersion}.`,
      };
    }

    // 3. 버전 마이그레이션 적용
    let currentData = envelope.data;
    let actualVersion = dataVersion;

    try {
      const migrationResult = SaveManager._applyMigrations(currentData, dataVersion, SaveManager.currentVersion);
      currentData = migrationResult.data;
      actualVersion = migrationResult.reachedVersion;
    } catch (e: any) {
      return {
        success: false,
        error: `Migration failed: ${e?.message ?? e}`,
      };
    }

    // 4. 월드 역직렬화
    try {
      const entities = SaveManager._serializer.deserialize(currentData, targetWorld);
      return {
        success: true,
        world: targetWorld,
        version: actualVersion,
        entities,
        metadata: envelope.metadata,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `World deserialization failed: ${e?.message ?? e}`,
      };
    }
  }

  /**
   * 등록된 마이그레이션 경로를 탐색하여 순차 변환을 실행한다.
   * 경로가 중간에 끊기면 에러를 던져 침묵하는 데이터 손상을 방지한다.
   */
  private static _applyMigrations(
    data: any,
    from: number,
    to: number,
  ): { data: any; reachedVersion: number } {
    if (from === to) return { data, reachedVersion: to };

    let ver = from;
    let transformed = JSON.parse(JSON.stringify(data));

    while (ver < to) {
      const step = SaveManager._migrations.find((m) => m.fromVersion === ver);
      if (!step) {
        throw new Error(`No migration path from version ${ver} to ${to}`);
      }
      transformed = step.migrator(transformed);
      ver = step.toVersion;
    }

    return { data: transformed, reachedVersion: ver };
  }
}
