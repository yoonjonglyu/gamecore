/**
 * @module data/DataValidator
 * 마스터 데이터(DataManager), 대화 트리(DialogueTreeData), 가챠 풀(GachaPoolConfig)의
 * 참조 무결성, 수치 범위, 수식 순환 참조를 부팅 시점에 정적 검증하는 0-Dependency 검증기.
 */

import type { DataManager } from './DataManager';
import { StatPipeline } from '../stats/StatPipeline';
import type { DialogueTreeData } from '../dialogue/DialogueTreeEngine';
import type { GachaPoolConfig } from '../gacha/GachaEngine';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: 'item' | 'skill' | 'blueprint' | 'dialogue' | 'gacha';
  sourceId: string | number;
  field: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

function buildReport(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}

export class DataValidator {
  static validateDataManager(data: DataManager): ValidationReport {
    const issues: ValidationIssue[] = [];

    // 1. Items validation
    for (const item of data.items.all()) {
      if (typeof item.name !== 'string' || item.name.trim().length === 0) {
        issues.push({
          severity: 'error',
          category: 'item',
          sourceId: item.id,
          field: 'name',
          message: `Item '${item.id}' must have a non-empty name.`,
        });
      }
      if (item.stackLimit !== undefined && (!Number.isFinite(item.stackLimit) || item.stackLimit <= 0)) {
        issues.push({
          severity: 'error',
          category: 'item',
          sourceId: item.id,
          field: 'stackLimit',
          message: `Item '${item.id}' stackLimit must be a positive finite number.`,
        });
      }
      if (item.value !== undefined && (!Number.isFinite(item.value) || item.value < 0)) {
        issues.push({
          severity: 'error',
          category: 'item',
          sourceId: item.id,
          field: 'value',
          message: `Item '${item.id}' value must be a non-negative finite number.`,
        });
      }
    }

    // 2. Skills validation
    for (const skill of data.skills.all()) {
      if (typeof skill.name !== 'string' || skill.name.trim().length === 0) {
        issues.push({
          severity: 'error',
          category: 'skill',
          sourceId: skill.id,
          field: 'name',
          message: `Skill '${skill.id}' must have a non-empty name.`,
        });
      }
      if (!Number.isFinite(skill.mpCost) || skill.mpCost < 0) {
        issues.push({
          severity: 'error',
          category: 'skill',
          sourceId: skill.id,
          field: 'mpCost',
          message: `Skill '${skill.id}' mpCost must be a non-negative finite number.`,
        });
      }
      if (!Number.isFinite(skill.cooldown) || skill.cooldown < 0) {
        issues.push({
          severity: 'error',
          category: 'skill',
          sourceId: skill.id,
          field: 'cooldown',
          message: `Skill '${skill.id}' cooldown must be a non-negative finite number.`,
        });
      }
      for (let i = 0; i < (skill.effects?.length ?? 0); i++) {
        const eff: any = skill.effects[i];
        if (eff.chance !== undefined && (!Number.isFinite(eff.chance) || eff.chance < 0 || eff.chance > 1)) {
          issues.push({
            severity: 'error',
            category: 'skill',
            sourceId: skill.id,
            field: `effects[${i}].chance`,
            message: `Skill '${skill.id}' effect #${i} chance must be within [0, 1].`,
          });
        }
        if (eff.duration !== undefined && (!Number.isFinite(eff.duration) || eff.duration < 0)) {
          issues.push({
            severity: 'error',
            category: 'skill',
            sourceId: skill.id,
            field: `effects[${i}].duration`,
            message: `Skill '${skill.id}' effect #${i} duration must be a non-negative finite number.`,
          });
        }
      }
    }

    // 3. Blueprints cross-reference & formula cycle validation
    for (const bp of data.blueprints.all()) {
      for (const skillId of bp.skills ?? []) {
        if (!data.skills.has(skillId)) {
          issues.push({
            severity: 'error',
            category: 'blueprint',
            sourceId: bp.id,
            field: 'skills',
            message: `Blueprint '${bp.id}' references unknown skill '${skillId}'.`,
          });
        }
      }

      for (const entry of bp.inventory ?? []) {
        if (!data.items.has(entry.itemId)) {
          issues.push({
            severity: 'error',
            category: 'blueprint',
            sourceId: bp.id,
            field: 'inventory',
            message: `Blueprint '${bp.id}' inventory references unknown item '${entry.itemId}'.`,
          });
        }
        if (entry.count !== undefined && (!Number.isFinite(entry.count) || entry.count <= 0)) {
          issues.push({
            severity: 'error',
            category: 'blueprint',
            sourceId: bp.id,
            field: 'inventory',
            message: `Blueprint '${bp.id}' inventory item '${entry.itemId}' has non-positive count (${entry.count}).`,
          });
        }
      }

      if (bp.equipment) {
        for (const [slot, itemId] of Object.entries(bp.equipment)) {
          if (itemId === undefined || itemId === null || itemId === '') continue;
          if (!data.items.has(itemId)) {
            issues.push({
              severity: 'error',
              category: 'blueprint',
              sourceId: bp.id,
              field: `equipment.${slot}`,
              message: `Blueprint '${bp.id}' equipment slot '${slot}' references unknown item '${itemId}'.`,
            });
          }
        }
      }

      if (bp.stats) {
        for (const [key, val] of Object.entries(bp.stats)) {
          if (typeof val === 'number' && !Number.isFinite(val)) {
            issues.push({
              severity: 'error',
              category: 'blueprint',
              sourceId: bp.id,
              field: `stats.${key}`,
              message: `Blueprint '${bp.id}' stat '${key}' is not finite.`,
            });
          }
        }
        if (bp.stats.maxHp !== undefined && bp.stats.maxHp <= 0) {
          issues.push({
            severity: 'error',
            category: 'blueprint',
            sourceId: bp.id,
            field: 'stats.maxHp',
            message: `Blueprint '${bp.id}' maxHp must be > 0.`,
          });
        }
        if (
          bp.stats.hp !== undefined &&
          bp.stats.maxHp !== undefined &&
          bp.stats.hp > bp.stats.maxHp
        ) {
          issues.push({
            severity: 'warning',
            category: 'blueprint',
            sourceId: bp.id,
            field: 'stats.hp',
            message: `Blueprint '${bp.id}' initial hp (${bp.stats.hp}) exceeds maxHp (${bp.stats.maxHp}).`,
          });
        }
      }

      if (bp.extendedStats) {
        const pipe = new StatPipeline();
        for (const def of bp.extendedStats.definitions ?? []) {
          pipe.defineStat(def);
        }
        for (const [stat, val] of Object.entries(bp.extendedStats.baseStats ?? {})) {
          pipe.setBase(stat, val);
        }
        for (const def of bp.extendedStats.definitions ?? []) {
          try {
            pipe.get(def.name);
          } catch (err: any) {
            issues.push({
              severity: 'error',
              category: 'blueprint',
              sourceId: bp.id,
              field: `extendedStats.definitions.${def.name}`,
              message: err?.message ?? String(err),
            });
          }
        }
      }
    }

    return buildReport(issues);
  }

  static validateDialogueTree(tree: DialogueTreeData): ValidationReport {
    const issues: ValidationIssue[] = [];

    if (!tree.nodes[tree.initialNodeId]) {
      issues.push({
        severity: 'error',
        category: 'dialogue',
        sourceId: tree.id,
        field: 'initialNodeId',
        message: `Dialogue tree '${tree.id}' initialNodeId '${tree.initialNodeId}' does not exist in nodes.`,
      });
    }

    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      if (node.next !== undefined && !tree.nodes[node.next]) {
        issues.push({
          severity: 'error',
          category: 'dialogue',
          sourceId: tree.id,
          field: `nodes.${nodeId}.next`,
          message: `Node '${nodeId}' references missing next node '${node.next}'.`,
        });
      }
      for (const choice of node.choices ?? []) {
        if (!tree.nodes[choice.targetNodeId]) {
          issues.push({
            severity: 'error',
            category: 'dialogue',
            sourceId: tree.id,
            field: `nodes.${nodeId}.choices.${choice.id}.targetNodeId`,
            message: `Choice '${choice.id}' on node '${nodeId}' targets missing node '${choice.targetNodeId}'.`,
          });
        }
      }
    }

    // BFS reachability check from initialNodeId
    if (tree.nodes[tree.initialNodeId]) {
      const visited = new Set<string>();
      const queue = [tree.initialNodeId];
      while (queue.length > 0) {
        const curId = queue.shift()!;
        if (visited.has(curId)) continue;
        visited.add(curId);
        const cur = tree.nodes[curId];
        if (!cur) continue;
        if (cur.next && tree.nodes[cur.next] && !visited.has(cur.next)) {
          queue.push(cur.next);
        }
        for (const ch of cur.choices ?? []) {
          if (tree.nodes[ch.targetNodeId] && !visited.has(ch.targetNodeId)) {
            queue.push(ch.targetNodeId);
          }
        }
      }

      for (const nodeId of Object.keys(tree.nodes)) {
        if (!visited.has(nodeId)) {
          issues.push({
            severity: 'warning',
            category: 'dialogue',
            sourceId: tree.id,
            field: `nodes.${nodeId}`,
            message: `Node '${nodeId}' in dialogue tree '${tree.id}' is unreachable from '${tree.initialNodeId}'.`,
          });
        }
      }
    }

    return buildReport(issues);
  }

  static validateGachaPool(pool: GachaPoolConfig): ValidationReport {
    const issues: ValidationIssue[] = [];

    if (!pool.tiers || pool.tiers.length === 0) {
      issues.push({
        severity: 'error',
        category: 'gacha',
        sourceId: pool.id,
        field: 'tiers',
        message: `Gacha pool '${pool.id}' must define at least one tier.`,
      });
      return buildReport(issues);
    }

    let rateSum = 0;
    for (let i = 0; i < pool.tiers.length; i++) {
      const tier = pool.tiers[i];
      const itemCount = (tier.items?.length ?? 0) + (tier.pickupItems?.length ?? 0);
      if (itemCount === 0) {
        issues.push({
          severity: 'error',
          category: 'gacha',
          sourceId: pool.id,
          field: `tiers[${i}].items`,
          message: `Gacha tier '${tier.tier}' in pool '${pool.id}' has no items or pickupItems.`,
        });
      }
      if (!Number.isFinite(tier.baseRate) || tier.baseRate < 0 || tier.baseRate > 1) {
        issues.push({
          severity: 'error',
          category: 'gacha',
          sourceId: pool.id,
          field: `tiers[${i}].baseRate`,
          message: `Gacha tier '${tier.tier}' baseRate (${tier.baseRate}) must be in [0, 1].`,
        });
      } else {
        rateSum += tier.baseRate;
      }
    }

    if (rateSum < 0.999 || rateSum > 1.001) {
      issues.push({
        severity: 'warning',
        category: 'gacha',
        sourceId: pool.id,
        field: 'tiers',
        message: `Sum of tier baseRates in pool '${pool.id}' is ${rateSum.toFixed(4)} (expected ~1.0).`,
      });
    }

    if (
      pool.softPityStart !== undefined &&
      pool.hardPityCount !== undefined &&
      pool.softPityStart > 0 &&
      pool.hardPityCount > 0 &&
      pool.softPityStart > pool.hardPityCount
    ) {
      issues.push({
        severity: 'error',
        category: 'gacha',
        sourceId: pool.id,
        field: 'softPityStart',
        message: `Pool '${pool.id}' softPityStart (${pool.softPityStart}) exceeds hardPityCount (${pool.hardPityCount}).`,
      });
    }

    return buildReport(issues);
  }
}
