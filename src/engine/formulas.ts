import type { Stats } from "./types";
import operatorStats from "../data/operator_stats.json";

export interface OperatorStatEntry {
  levels: number[];
  hp: number[];
  atk: number[];
  def?: number[];
  res?: number[];
  strength?: number[];
  agility?: number[];
  intelligence?: number[];
  will?: number[];
}

export interface AbilityScores {
  strength: number;
  agility: number;
  intelligence: number;
  will: number;
}

const statsDb = operatorStats as Record<string, OperatorStatEntry>;

/** Interpolate a stat value for any level from the known level data points */
function interpolateStat(levels: number[], values: number[], targetLevel: number): number {
  if (values.length === 0) return 0;
  if (targetLevel <= levels[0]) return values[0];
  if (targetLevel >= levels[levels.length - 1]) return values[values.length - 1];

  // Find bracketing levels
  let hi = 1;
  while (hi < levels.length && levels[hi] < targetLevel) hi++;
  const lo = hi - 1;

  const t = (targetLevel - levels[lo]) / (levels[hi] - levels[lo]);
  return Math.round(values[lo] + (values[hi] - values[lo]) * t);
}

/** Get operator ability scores at a given level from the wiki data */
export function getOperatorAbilitiesAtLevel(operatorId: string, level: number): AbilityScores {
  const entry = statsDb[operatorId];
  if (!entry || !entry.strength) {
    return { strength: 0, agility: 0, intelligence: 0, will: 0 };
  }
  return {
    strength: interpolateStat(entry.levels, entry.strength!, level),
    agility: interpolateStat(entry.levels, entry.agility!, level),
    intelligence: interpolateStat(entry.levels, entry.intelligence!, level),
    will: interpolateStat(entry.levels, entry.will!, level),
  };
}

/** Get operator base stats at a given level from the wiki data */
export function getOperatorStatsAtLevel(operatorId: string, level: number): Stats {
  const entry = statsDb[operatorId];
  const hp = entry ? interpolateStat(entry.levels, entry.hp, level) : 1500;
  const atk = entry ? interpolateStat(entry.levels, entry.atk, level) : 500;
  const def = entry?.def ? interpolateStat(entry.levels, entry.def, level) : 0;

  return {
    hp,
    atk,
    def,
    critRate: 0.05,
    critDmg: 0.5,
    artsIntensity: 0,
    physicalDmgBonus: 0,
    heatDmgBonus: 0,
    electricDmgBonus: 0,
    cryoDmgBonus: 0,
    natureDmgBonus: 0,
    basicDmgBonus: 0,
    ultimateDmgBonus: 0,
    physicalResistance: 0,
    heatResistance: 0,
    electricResistance: 0,
    cryoResistance: 0,
    natureResistance: 0,
    aetherResistance: 0,
    treatmentBonus: 0,
    treatmentReceivedBonus: 0,
    comboSkillCdReduction: 0,
    ultimateGainEfficiency: 1.0,
    staggerEfficiencyBonus: 0,
  };
}

/** Interpolate weapon base ATK at a given level */
export function getWeaponAtkAtLevel(weapon: { baseAtkLv1: number; baseAtkLv90: number }, level: number): number {
  if (level <= 1) return weapon.baseAtkLv1;
  if (level >= 90) return weapon.baseAtkLv90;
  const t = (level - 1) / 89;
  return Math.round(weapon.baseAtkLv1 + (weapon.baseAtkLv90 - weapon.baseAtkLv1) * t);
}

/**
 * Calculate final stats combining operator base stats (from wiki DB at given level)
 * with weapon ATK scaled by weapon level.
 */
export function computeFinalStats(
  operatorId: string,
  level: number,
  weapon: { baseAtkLv1: number; baseAtkLv90: number } | null,
  weaponLevel: number,
): Stats {
  const base = getOperatorStatsAtLevel(operatorId, level);
  const weaponAtk = weapon ? getWeaponAtkAtLevel(weapon, weaponLevel) : 0;

  return {
    hp: base.hp,
    atk: base.atk + weaponAtk,
    def: base.def,
    critRate: base.critRate,
    critDmg: base.critDmg,
    artsIntensity: base.artsIntensity,
    physicalDmgBonus: base.physicalDmgBonus,
    heatDmgBonus: base.heatDmgBonus,
    electricDmgBonus: base.electricDmgBonus,
    cryoDmgBonus: base.cryoDmgBonus,
    natureDmgBonus: base.natureDmgBonus,
    basicDmgBonus: base.basicDmgBonus,
    ultimateDmgBonus: base.ultimateDmgBonus,
    physicalResistance: base.physicalResistance,
    heatResistance: base.heatResistance,
    electricResistance: base.electricResistance,
    cryoResistance: base.cryoResistance,
    natureResistance: base.natureResistance,
    aetherResistance: base.aetherResistance,
    treatmentBonus: base.treatmentBonus,
    treatmentReceivedBonus: base.treatmentReceivedBonus,
    comboSkillCdReduction: base.comboSkillCdReduction,
    ultimateGainEfficiency: base.ultimateGainEfficiency,
    staggerEfficiencyBonus: base.staggerEfficiencyBonus,
  };
}

/**
 * Calculate raw damage for a single hit.
 * Physical damage = ATK * multiplier - DEF
 * Arts damage = ATK * multiplier * (1 - RES / 100)
 */
export function calcHitDamage(
  atk: number,
  multiplier: number,
  def: number,
  res: number,
  critRate: number,
  critDmg: number,
  isArts: boolean,
): { damage: number; isCrit: boolean } {
  const isCrit = Math.random() < critRate;
  const critMult = isCrit ? critDmg : 1;

  let rawDamage: number;
  if (isArts) {
    rawDamage = atk * multiplier * (1 - res / 100);
  } else {
    rawDamage = Math.max(atk * multiplier - def, 0);
  }

  return {
    damage: Math.floor(rawDamage * critMult),
    isCrit,
  };
}

/**
 * Calculate expected average damage (deterministic, no RNG).
 * Use this for DPS comparisons instead of calcHitDamage.
 */
export function calcExpectedHitDamage(
  atk: number,
  multiplier: number,
  def: number,
  res: number,
  critRate: number,
  critDmg: number,
  isArts: boolean,
): number {
  const avgCritMult = 1 + critRate * (critDmg - 1);

  let rawDamage: number;
  if (isArts) {
    rawDamage = atk * multiplier * (1 - res / 100);
  } else {
    rawDamage = Math.max(atk * multiplier - def, 0);
  }

  return rawDamage * avgCritMult;
}
