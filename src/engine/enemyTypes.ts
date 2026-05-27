// Enemy type definitions and level scaling for the damage simulator

import type { TargetStats, EnemyType } from "./types";

/** A known enemy from the official wiki catalog */
export interface EnemyDef {
  id: string;
  name: string;
  nameCN?: string;        // Chinese name from CN wiki
  category: string;       // 天使, 裂地者, 沧贼, 野外生物
  enemyType: EnemyType;
  cover: string;
  /** Base stats at reference level (lv50) */
  def: number;
  physicalResist: number;
  heatResist: number;
  electricResist: number;
  cryoResist: number;
  natureResist: number;
  aetherResist: number;
  staggerThreshold: number;
  staggerDuration: number;
}

/** A user-customized enemy configuration */
export interface EnemyConfig {
  /** "existing" = picked from wiki catalog, "custom" = user-created */
  source: "existing" | "custom";
  /** Enemy def id for existing, custom id for custom */
  enemyId: string | null;
  /** Custom enemy name (for custom enemies) */
  customName: string;
  /** Level override (1-99). Default 50 for existing enemies. */
  level: number;
  /** Custom stat overrides — only used when source="custom" */
  customStats: Partial<TargetStats> | null;
}

/** Level scaling — enemy DEF and stagger scale with enemy level.
 *  Reference level is 1 (base stats in enemies.json are at level 1).
 *  At higher levels, enemies gain DEF and stagger threshold.
 *  Exact formula TBD — current values are placeholder estimates. */
export function getLevelScale(level: number): number {
  const clamped = Math.max(1, Math.min(99, level));
  // Linear scaling from level 1 to 99
  return 0.4 + 0.6 * ((clamped - 1) / 98);
}

function scaleStat(baseValue: number, level: number): number {
  return Math.round(baseValue * getLevelScale(level));
}

/** Convert an EnemyConfig to TargetStats for the simulation */
export function enemyConfigToTarget(config: EnemyConfig, enemyDefs: EnemyDef[]): TargetStats {
  if (config.source === "custom") {
    return {
      def: config.customStats?.def ?? 100,
      physicalResist: config.customStats?.physicalResist ?? 0,
      heatResist: config.customStats?.heatResist ?? 0,
      electricResist: config.customStats?.electricResist ?? 0,
      cryoResist: config.customStats?.cryoResist ?? 0,
      natureResist: config.customStats?.natureResist ?? 0,
      aetherResist: config.customStats?.aetherResist ?? 0,
      enemyType: config.customStats?.enemyType ?? "common",
      staggerThreshold: config.customStats?.staggerThreshold ?? 500,
      staggerDuration: config.customStats?.staggerDuration ?? 5,
    };
  }

  const def = enemyDefs.find(e => e.id === config.enemyId);
  if (!def) {
    return {
      def: 100, physicalResist: 0, heatResist: 0, electricResist: 0,
      cryoResist: 0, natureResist: 0, aetherResist: 0,
      enemyType: "common", staggerThreshold: 500, staggerDuration: 5,
    };
  }

  const lv = config.level || 50;
  return {
    def: scaleStat(def.def, lv),
    physicalResist: def.physicalResist,
    heatResist: def.heatResist,
    electricResist: def.electricResist,
    cryoResist: def.cryoResist,
    natureResist: def.natureResist,
    aetherResist: def.aetherResist,
    enemyType: def.enemyType,
    staggerThreshold: scaleStat(def.staggerThreshold, lv),
    staggerDuration: def.staggerDuration,
  };
}
