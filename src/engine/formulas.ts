import type { Stats, Weapon } from "./types";
import operatorStats from "../data/operator_stats.json";
import operatorsData from "../data/operators.json";

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
  potentials?: Array<{
    potential: number;
    strength: number;
    agility: number;
    intelligence: number;
    will: number;
    atkPercent?: number;
    critRate?: number;
    critDmg?: number;
    basicDmgBonus?: number;
    physicalDmgBonus?: number;
    heatDmgBonus?: number;
    electricDmgBonus?: number;
    cryoDmgBonus?: number;
    natureDmgBonus?: number;
  }>;
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

// Map Chinese gear stat names to internal keys
const GEAR_STAT_MAP: Record<string, string> = {
  "攻击力": "atk",
  "生命值": "hp",
  "防御力": "def",
  "力量": "strength",
  "敏捷": "agility",
  "智识": "intelligence",
  "意志": "will",
  "主能力": "primaryAbility",
  "副能力": "secondaryAbility",
  "暴击率": "critRate",
  "物理伤害加成": "physicalDmgBonus",
  "灼热和自然伤害加成": "heatNatureDmgBonus", // split between heat & nature
  "寒冷和电磁伤害加成": "cryoElecDmgBonus",  // split between cryo & electric
  "法术伤害加成": "allElementDmg", // 法术 = all elemental DMG
  "普通攻击伤害加成": "basicDmgBonus",
  "战技伤害加成": "battleSkillDmgBonus",
  "连携技伤害加成": "comboSkillDmgBonus",
  "终结技伤害加成": "ultimateDmgBonus",
  "终结技充能效率": "ultimateGainEfficiency",
  "所有技能伤害加成": "allSkillDmgBonus",
  "源石技艺强度": "artsIntensity",
  "治疗效率加成": "treatmentBonus",
  "对失衡目标伤害加成": "staggeredDmgBonus",
  "全伤害减免": "finalDmgReduction",
};

/** Parse a gear stat value string like "+56" or "+11.5%" into a number */
function parseGearValue(val: string): number {
  const isPercent = val.includes("%");
  const num = parseFloat(val.replace(/[+%]/g, ""));
  if (isNaN(num)) return 0;
  // Preserve precision for percentages
  return isPercent ? Math.floor(num * 10) / 1000 : num;
}

/** Compute cumulative bonuses from all equipped gear pieces */
function computeGearBonuses(
  armor: { baseStats: Record<string, string>; refinement: Array<{ name: string; base: string; rank1: string; rank2: string; rank3: string }>; refinementRanks?: number[] } | null,
  gloves: typeof armor,
  kit1: typeof armor,
  kit2: typeof armor,
) {
  const bonus: Record<string, number> = {
    atk: 0, atkPercent: 0, hp: 0, hpPercent: 0, def: 0, defPercent: 0,
    strength: 0, agility: 0, intelligence: 0, will: 0,
    primaryAbility: 0, secondaryAbility: 0,
    critRate: 0, critDmg: 0, artsIntensity: 0,
    physicalDmgBonus: 0, heatDmgBonus: 0, electricDmgBonus: 0,
    cryoDmgBonus: 0, natureDmgBonus: 0,
    basicDmgBonus: 0, battleSkillDmgBonus: 0, comboSkillDmgBonus: 0, ultimateDmgBonus: 0,
    allSkillDmgBonus: 0, staggeredDmgBonus: 0,
    heatNatureDmgBonus: 0, cryoElecDmgBonus: 0, allElementDmg: 0,
    physicalResistance: 0, finalDmgReduction: 0,
    treatmentBonus: 0, ultimateGainEfficiency: 0,
    staggerEfficiencyBonus: 0, comboSkillCdReduction: 0,
  };

  for (const gear of [armor, gloves, kit1, kit2]) {
    if (!gear || Object.keys(gear.baseStats).length === 0) continue;

    const ranks = gear.refinementRanks ?? gear.refinement.map(() => 3);

    for (let ri = 0; ri < gear.refinement.length; ri++) {
      const r = gear.refinement[ri];
      const rank = (ranks[ri] ?? 3);
      const rankKey = rank === 1 ? "rank1" : rank === 2 ? "rank2" : rank === 3 ? "rank3" : "base";
      const refinedVal = r[rankKey] || r.base;
      const numVal = parseGearValue(refinedVal);
      const key = GEAR_STAT_MAP[r.name];
      if (key && key in bonus) bonus[key] += numVal;
    }

    // Process baseStats that don't have refinement entries
    const refinedNames = new Set(gear.refinement.map(r => r.name));
    for (const [statName, val] of Object.entries(gear.baseStats)) {
      if (refinedNames.has(statName)) continue;
      const key = GEAR_STAT_MAP[statName];
      if (!key) continue;
      const numVal = parseGearValue(val);
      if (key in bonus) bonus[key] += numVal;
    }
  }

  // Combined element bonuses: each element gets the FULL value
  bonus.heatDmgBonus = (bonus.heatDmgBonus || 0) + (bonus.heatNatureDmgBonus || 0);
  bonus.natureDmgBonus = (bonus.natureDmgBonus || 0) + (bonus.heatNatureDmgBonus || 0);
  bonus.cryoDmgBonus = (bonus.cryoDmgBonus || 0) + (bonus.cryoElecDmgBonus || 0);
  bonus.electricDmgBonus = (bonus.electricDmgBonus || 0) + (bonus.cryoElecDmgBonus || 0);

  // 法术 = all elemental DMG: distribute to all 4 elements
  if (bonus.allElementDmg) {
    bonus.heatDmgBonus = (bonus.heatDmgBonus || 0) + bonus.allElementDmg;
    bonus.electricDmgBonus = (bonus.electricDmgBonus || 0) + bonus.allElementDmg;
    bonus.cryoDmgBonus = (bonus.cryoDmgBonus || 0) + bonus.allElementDmg;
    bonus.natureDmgBonus = (bonus.natureDmgBonus || 0) + bonus.allElementDmg;
  }

  // allSkillDmgBonus applies to all skill types
  if (bonus.allSkillDmgBonus) {
    bonus.basicDmgBonus = (bonus.basicDmgBonus || 0) + bonus.allSkillDmgBonus;
    bonus.battleSkillDmgBonus = (bonus.battleSkillDmgBonus || 0) + bonus.allSkillDmgBonus;
    bonus.comboSkillDmgBonus = (bonus.comboSkillDmgBonus || 0) + bonus.allSkillDmgBonus;
    bonus.ultimateDmgBonus = (bonus.ultimateDmgBonus || 0) + bonus.allSkillDmgBonus;
  }

  return bonus;
}

/** Compute cumulative potential bonuses for all stats */
function computePotentialBonuses(operatorId: string, potential: number) {
  const entry = statsDb[operatorId];
  const bonus = {
    strength: 0, agility: 0, intelligence: 0, will: 0,
    atkPercent: 0, critRate: 0, critDmg: 0,
    basicDmgBonus: 0, physicalDmgBonus: 0, heatDmgBonus: 0,
    electricDmgBonus: 0, cryoDmgBonus: 0, natureDmgBonus: 0,
  };
  if (!entry?.potentials) return bonus;
  for (const p of entry.potentials) {
    if (p.potential > potential) continue;
    bonus.strength += p.strength || 0;
    bonus.agility += p.agility || 0;
    bonus.intelligence += p.intelligence || 0;
    bonus.will += p.will || 0;
    bonus.atkPercent += p.atkPercent || 0;
    bonus.critRate += p.critRate || 0;
    bonus.critDmg += p.critDmg || 0;
    bonus.basicDmgBonus += p.basicDmgBonus || 0;
    bonus.physicalDmgBonus += p.physicalDmgBonus || 0;
    bonus.heatDmgBonus += p.heatDmgBonus || 0;
    bonus.electricDmgBonus += p.electricDmgBonus || 0;
    bonus.cryoDmgBonus += p.cryoDmgBonus || 0;
    bonus.natureDmgBonus += p.natureDmgBonus || 0;
  }
  return bonus;
}

/** Get operator ability scores at a given level and potential from the wiki data */
export function getOperatorAbilitiesAtLevel(operatorId: string, level: number, potential: number = 0): AbilityScores {
  const entry = statsDb[operatorId];
  if (!entry || !entry.strength) {
    return { strength: 0, agility: 0, intelligence: 0, will: 0 };
  }
  const potBonus = computePotentialBonuses(operatorId, potential);
  return {
    strength: interpolateStat(entry.levels, entry.strength!, level) + potBonus.strength,
    agility: interpolateStat(entry.levels, entry.agility!, level) + potBonus.agility,
    intelligence: interpolateStat(entry.levels, entry.intelligence!, level) + potBonus.intelligence,
    will: interpolateStat(entry.levels, entry.will!, level) + potBonus.will,
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
    battleSkillDmgBonus: 0,
    comboSkillDmgBonus: 0,
    ultimateDmgBonus: 0,
    allSkillDmgBonus: 0,
    staggeredDmgBonus: 0,
    physicalResistance: 0,
    heatResistance: 0,
    electricResistance: 0,
    cryoResistance: 0,
    natureResistance: 0,
    aetherResistance: 0,
    finalDmgReduction: 0,
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

/** Compute cumulative weapon skill bonuses at given ranks */
export function computeWeaponBonuses(
  weapon: { skills: Array<{ maxRank: number; ranks: Weapon["skills"][0]["ranks"] }> } | null,
  skillRanks: number[],
) {
  const bonus: Record<string, number> = {
    atk: 0, atkPercent: 0, hp: 0, hpPercent: 0, def: 0, defPercent: 0,
    strength: 0, agility: 0, intelligence: 0, will: 0, primaryAbility: 0, secondaryAbility: 0,
    critRate: 0, critDmg: 0, artsIntensity: 0, ultimateGainEfficiency: 0, treatmentBonus: 0,
    heatDmgBonus: 0, electricDmgBonus: 0, cryoDmgBonus: 0,
    natureDmgBonus: 0, physicalDmgBonus: 0,
    allElementDmg: 0,
  };
  if (!weapon) return bonus;

  for (let i = 0; i < weapon.skills.length; i++) {
    const rank = Math.min((skillRanks[i] ?? 1) - 1, weapon.skills[i].maxRank - 1);
    if (rank < 0) continue;
    const r = weapon.skills[i].ranks[rank];
    if (!r) continue;
    bonus.atk += r.atk || 0;
    bonus.atkPercent += r.atkPercent || 0;
    bonus.hp += r.hp || 0;
    bonus.hpPercent += r.hpPercent || 0;
    bonus.def += r.def || 0;
    bonus.defPercent += r.defPercent || 0;
    bonus.strength += r.strength || 0;
    bonus.agility += r.agility || 0;
    bonus.intelligence += r.intelligence || 0;
    bonus.will += r.will || 0;
    bonus.critRate += r.critRate || 0;
    bonus.critDmg += r.critDmg || 0;
    bonus.artsIntensity += r.artsIntensity || 0;
    bonus.ultimateGainEfficiency += r.ultimateGainEfficiency || 0;
    bonus.treatmentBonus += r.treatmentBonus || 0;
    bonus.heatDmgBonus += r.heatDmgBonus || 0;
    bonus.electricDmgBonus += r.electricDmgBonus || 0;
    bonus.cryoDmgBonus += r.cryoDmgBonus || 0;
    bonus.natureDmgBonus += r.natureDmgBonus || 0;
    bonus.physicalDmgBonus += r.physicalDmgBonus || 0;
    bonus.primaryAbility += r.primaryAbility || 0;
    bonus.secondaryAbility += r.secondaryAbility || 0;
    bonus.allElementDmg += r.allElementDmg || 0;
  }
  // 法术 = all elemental DMG: distribute to all 4 elements
  if (bonus.allElementDmg) {
    bonus.heatDmgBonus = (bonus.heatDmgBonus || 0) + bonus.allElementDmg;
    bonus.electricDmgBonus = (bonus.electricDmgBonus || 0) + bonus.allElementDmg;
    bonus.cryoDmgBonus = (bonus.cryoDmgBonus || 0) + bonus.allElementDmg;
    bonus.natureDmgBonus = (bonus.natureDmgBonus || 0) + bonus.allElementDmg;
  }
  return bonus;
}

/**
 * Calculate final stats combining operator base stats with weapon ATK and bonuses.
 * Formula: final ATK = (opATK + weaponATK) * (1 + ATK% bonus) + flat ATK bonus
 */
export function computeFinalStats(
  operatorId: string,
  level: number,
  potential: number,
  weapon: { baseAtkLv1: number; baseAtkLv90: number; skills: Weapon["skills"] } | null,
  weaponLevel: number,
  weaponSkillRanks: number[],
  gear: {
    armor: { baseStats: Record<string, string>; refinement: Array<{ name: string; base: string; rank1: string; rank2: string; rank3: string }>; refinementRanks?: number[] } | null;
    gloves: typeof gear["armor"];
    kit1: typeof gear["armor"];
    kit2: typeof gear["armor"];
  },
): Stats {
  const base = getOperatorStatsAtLevel(operatorId, level);
  const weaponAtk = weapon ? getWeaponAtkAtLevel(weapon, weaponLevel) : 0;
  const wpBonus = computeWeaponBonuses(weapon, weaponSkillRanks);
  const potBonus = computePotentialBonuses(operatorId, potential);
  const gearBonus = computeGearBonuses(gear.armor, gear.gloves, gear.kit1, gear.kit2);

  // Ability bonuses (all formulas use integer part of ability scores)
  // Include weapon skill AND gear bonuses in ability calculations
  const baseAbilities = getOperatorAbilitiesAtLevel(operatorId, level, potential);

  // Gear "主能力" boosts operator's declared primary, "副能力" boosts declared secondary
  const opData = (operatorsData as Array<{ id: string; primaryAbility: string; secondaryAbility: string }>).find(o => o.id === operatorId);
  const primaryKey = opData!.primaryAbility;
  const secondaryKey = opData!.secondaryAbility;
  if (gearBonus.primaryAbility) {
    if (primaryKey === "strength") gearBonus.strength += gearBonus.primaryAbility;
    else if (primaryKey === "agility") gearBonus.agility += gearBonus.primaryAbility;
    else if (primaryKey === "intelligence") gearBonus.intelligence += gearBonus.primaryAbility;
    else if (primaryKey === "will") gearBonus.will += gearBonus.primaryAbility;
  }
  if (gearBonus.secondaryAbility) {
    if (secondaryKey === "strength") gearBonus.strength += gearBonus.secondaryAbility;
    else if (secondaryKey === "agility") gearBonus.agility += gearBonus.secondaryAbility;
    else if (secondaryKey === "intelligence") gearBonus.intelligence += gearBonus.secondaryAbility;
    else if (secondaryKey === "will") gearBonus.will += gearBonus.secondaryAbility;
  }
  // Weapon "主能力提升" boosts operator's declared primary ability
  if (wpBonus.primaryAbility) {
    if (primaryKey === "strength") gearBonus.strength += wpBonus.primaryAbility;
    else if (primaryKey === "agility") gearBonus.agility += wpBonus.primaryAbility;
    else if (primaryKey === "intelligence") gearBonus.intelligence += wpBonus.primaryAbility;
    else if (primaryKey === "will") gearBonus.will += wpBonus.primaryAbility;
  }
  // Weapon "副能力" boosts operator's declared secondary ability
  if (wpBonus.secondaryAbility) {
    if (secondaryKey === "strength") gearBonus.strength += wpBonus.secondaryAbility;
    else if (secondaryKey === "agility") gearBonus.agility += wpBonus.secondaryAbility;
    else if (secondaryKey === "intelligence") gearBonus.intelligence += wpBonus.secondaryAbility;
    else if (secondaryKey === "will") gearBonus.will += wpBonus.secondaryAbility;
  }
  // Calculate final abilities with all bonuses applied
  const finalStr = Math.floor(baseAbilities.strength + wpBonus.strength + gearBonus.strength);
  const finalAgi = Math.floor(baseAbilities.agility + wpBonus.agility + gearBonus.agility);
  const finalInt = Math.floor(baseAbilities.intelligence + wpBonus.intelligence + gearBonus.intelligence);
  const finalWil = Math.floor(baseAbilities.will + wpBonus.will + gearBonus.will);

  // Use operator's declared primary/secondary ability
  const abilityVals = { strength: finalStr, agility: finalAgi, intelligence: finalInt, will: finalWil };
  const primaryVal = abilityVals[primaryKey as keyof typeof abilityVals] || finalInt;
  const secondaryVal = abilityVals[secondaryKey as keyof typeof abilityVals] || finalStr;

  // ATK formula:
  const atkPercentTotal = 1 + wpBonus.atkPercent + potBonus.atkPercent;
  const abilityAtkBonus = primaryVal * 0.005 + secondaryVal * 0.002;
  const step1 = (base.atk + weaponAtk) * atkPercentTotal;
  const step2 = step1 + wpBonus.atk;
  const finalAtk = Math.floor(step2 * (1 + abilityAtkBonus));

  // HP bonus from strength: 5 * strength
  const hpFromStr = 5 * finalStr;

  // Physical resistance from agility: 100 - 100 / (0.001 * agi + 1)
  const physResFromAgi = Math.round(100 - 100 / (0.001 * finalAgi + 1));

  // Elemental resistance from intelligence
  const elemResFromInt = Math.round(100 - 100 / (0.001 * finalInt + 1));

  // Treatment received from will: 0.001 * will
  const treatRecvFromWil = 0.001 * finalWil;

  // Helper to round percentage stats to 0.1% precision (3 decimal places)
  const pct = (v: number) => Math.floor(v * 1000) / 1000;

  return {
    hp: Math.round((base.hp + hpFromStr) * (1 + wpBonus.hpPercent + gearBonus.hpPercent)),
    atk: finalAtk + gearBonus.atk,
    def: Math.round((base.def + wpBonus.def + gearBonus.def) * (1 + wpBonus.defPercent)),
    critRate: pct(base.critRate + potBonus.critRate + wpBonus.critRate + gearBonus.critRate),
    critDmg: pct(base.critDmg + potBonus.critDmg + wpBonus.critDmg + gearBonus.critDmg),
    artsIntensity: base.artsIntensity + wpBonus.artsIntensity + gearBonus.artsIntensity,
    physicalDmgBonus: pct(base.physicalDmgBonus + wpBonus.physicalDmgBonus + potBonus.physicalDmgBonus + gearBonus.physicalDmgBonus),
    heatDmgBonus: pct(base.heatDmgBonus + wpBonus.heatDmgBonus + potBonus.heatDmgBonus + gearBonus.heatDmgBonus),
    electricDmgBonus: pct(base.electricDmgBonus + wpBonus.electricDmgBonus + potBonus.electricDmgBonus + gearBonus.electricDmgBonus),
    cryoDmgBonus: pct(base.cryoDmgBonus + wpBonus.cryoDmgBonus + potBonus.cryoDmgBonus + gearBonus.cryoDmgBonus),
    natureDmgBonus: pct(base.natureDmgBonus + wpBonus.natureDmgBonus + potBonus.natureDmgBonus + gearBonus.natureDmgBonus),
    basicDmgBonus: pct(base.basicDmgBonus + potBonus.basicDmgBonus + gearBonus.basicDmgBonus),
    battleSkillDmgBonus: pct(base.battleSkillDmgBonus + gearBonus.battleSkillDmgBonus),
    comboSkillDmgBonus: pct(base.comboSkillDmgBonus + gearBonus.comboSkillDmgBonus),
    ultimateDmgBonus: pct(base.ultimateDmgBonus + gearBonus.ultimateDmgBonus),
    allSkillDmgBonus: pct(base.allSkillDmgBonus + gearBonus.allSkillDmgBonus),
    staggeredDmgBonus: pct(base.staggeredDmgBonus + gearBonus.staggeredDmgBonus),
    physicalResistance: base.physicalResistance + physResFromAgi + gearBonus.physicalResistance,
    heatResistance: base.heatResistance + elemResFromInt,
    electricResistance: base.electricResistance + elemResFromInt,
    cryoResistance: base.cryoResistance + elemResFromInt,
    natureResistance: base.natureResistance + elemResFromInt,
    aetherResistance: base.aetherResistance,
    finalDmgReduction: pct(base.finalDmgReduction + gearBonus.finalDmgReduction),
    treatmentBonus: pct(base.treatmentBonus + wpBonus.treatmentBonus + gearBonus.treatmentBonus),
    treatmentReceivedBonus: pct(base.treatmentReceivedBonus + treatRecvFromWil),
    comboSkillCdReduction: pct(base.comboSkillCdReduction + gearBonus.comboSkillCdReduction),
    ultimateGainEfficiency: pct(base.ultimateGainEfficiency + wpBonus.ultimateGainEfficiency + gearBonus.ultimateGainEfficiency),
    staggerEfficiencyBonus: pct(base.staggerEfficiencyBonus + gearBonus.staggerEfficiencyBonus),
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
