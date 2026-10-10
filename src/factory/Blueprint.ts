/**
 * @module factory/Blueprint
 * 엔티티 프리팹/블루프린트 규격.
 * 게임 프로젝트에서 몬스터, NPC, 오브젝트 등의 데이터 명세서를 작성할 때 사용한다.
 */

import { Stats } from '../components/StatsComponent';
import { EquipSlot } from '../components/EquipmentComponent';
import { ExtendedStatsInit } from '../components/ExtendedStatsComponent';

export interface BlueprintItemEntry {
  /** 등록된 아이템 ID */
  itemId: string | number;
  /** 수량 (기본값 1) */
  count?: number;
}

export interface EntityBlueprint {
  /** 블루프린트 고유 식별자 (예: 'enemy_slime_green', 'npc_blacksmith') */
  id: string;
  /** 엔티티 기본 태그 목록 (예: ['enemy', 'monster']) */
  tags?: string[];
  /** 식별자 정보 */
  identity?: {
    idx?: number;
    name: string;
    description?: string;
  };
  /** 초기 고정 기본 스탯 */
  stats?: Partial<Stats>;
  /** 확장 커스텀 스탯 파이프라인 (str, dex, int, matk 등 다원적 스탯 및 수식) */
  extendedStats?: ExtendedStatsInit;
  /** 기본 학습 스킬 ID 목록 */
  skills?: string[];
  /** 초기 인벤토리 소지 아이템 */
  inventory?: BlueprintItemEntry[];
  /** 초기 장착 장비 (슬롯명 -> 아이템 ID) */
  equipment?: Partial<Record<EquipSlot, string | number>>;
  /**
   * 커스텀 컴포넌트 또는 프로젝트 고유 설정 데이터.
   * EntityFactory에 등록된 핸들러에 의해 처리된다.
   */
  custom?: Record<string, unknown>;
}

export interface SpawnOptions {
  /** 이름 오버라이드 (지정 시 블루프린트의 기본 이름을 덮어씀) */
  name?: string;
  /** 추가 태그 */
  tags?: string[];
  /** 스탯 오버라이드 (기본 스탯에 병합) */
  overrideStats?: Partial<Stats>;
  /** 확장 스탯 오버라이드 */
  overrideExtendedStats?: ExtendedStatsInit;
  /** 추가 스킬 ID */
  extraSkills?: string[];
  /** 추가 인벤토리 아이템 */
  extraInventory?: BlueprintItemEntry[];
  /** 추가 커스텀 데이터 오버라이드 */
  custom?: Record<string, unknown>;
}

