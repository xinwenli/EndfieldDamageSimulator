import type { Stats } from "./types";

/**
 * Calculate the final stats of an operator after applying
 * weapon stats, level scaling, and talent effects.
 */
export function computeFinalStats(
  baseStats: Stats,
  weaponStats: Partial<Stats> | null,
  level: number,
): Stats {
  const levelMultiplier = 1 + (level - 1) * 0.05;

  const result: Stats = {
    hp: baseStats.hp * levelMultiplier + (weaponStats?.hp ?? 0),
    atk: baseStats.atk * levelMultiplier + (weaponStats?.atk ?? 0),
    def: baseStats.def * levelMultiplier + (weaponStats?.def ?? 0),
    res: baseStats.res * levelMultiplier + (weaponStats?.res ?? 0),
    aspd: baseStats.aspd,
    critRate: baseStats.critRate + (weaponStats?.critRate ?? 0),
    critDmg: baseStats.critDmg + (weaponStats?.critDmg ?? 0),
  };

  return result;
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
