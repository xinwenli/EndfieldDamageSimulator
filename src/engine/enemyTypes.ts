// Enemy type definitions for the damage simulator

import type { TargetStats, EnemyType } from "./types";

/** A known enemy from the official wiki catalog */
export interface EnemyDef {
  id: string;
  name: string;
  nameCN?: string;
  category: string;
  enemyType: EnemyType;
  cover: string;
  /** Concrete stats scraped from the enemy's wiki.gg data row */
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
  /** Custom stat overrides, only used when source is "custom" */
  customStats: Partial<TargetStats> | null;
}

/** Convert an EnemyConfig to TargetStats for the simulation */
export function enemyConfigToTarget(config: EnemyConfig, enemyDefs: EnemyDef[]): TargetStats {
  if (config.source === "custom") {
    return {
      enemyCount: config.customStats?.enemyCount ?? 1,
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
      enemyCount: 1,
      def: 100,
      physicalResist: 0,
      heatResist: 0,
      electricResist: 0,
      cryoResist: 0,
      natureResist: 0,
      aetherResist: 0,
      enemyType: "common",
      staggerThreshold: 500,
      staggerDuration: 5,
    };
  }

  return {
    enemyCount: 1,
    def: def.def,
    physicalResist: def.physicalResist,
    heatResist: def.heatResist,
    electricResist: def.electricResist,
    cryoResist: def.cryoResist,
    natureResist: def.natureResist,
    aetherResist: def.aetherResist,
    enemyType: def.enemyType,
    staggerThreshold: def.staggerThreshold,
    staggerDuration: def.staggerDuration,
  };
}
