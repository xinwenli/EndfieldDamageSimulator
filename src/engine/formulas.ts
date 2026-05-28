import type { Stats, Weapon, TargetStats, DamageContext, Element, EnemyType, PartySynergyDef, OperatorTalentMeta, Profession } from "./types";
import operatorStats from "../data/operator_stats.json";
import operatorsData from "../data/operators.json";
import setEffects from "../data/set_effects.json";

type GearWithSet = {
  baseStats: Record<string, string>;
  refinement: Array<{ name: string; base: string; rank1: string; rank2: string; rank3: string }>;
  refinementRanks?: number[];
  setId?: string;
};

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
  talentStages?: Array<{ strength: number; agility: number; intelligence: number; will: number }>;
  potentials?: Array<{
    potential: number;
    strength: number;
    agility: number;
    intelligence: number;
    will: number;
    atkPercent?: number;
    hpPercent?: number;
    defPercent?: number;
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

const statsRaw = operatorStats as Record<string, unknown>;
const statsDb = statsRaw as Record<string, OperatorStatEntry>;

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
    atkPercent: 0, hpPercent: 0, defPercent: 0,
    critRate: 0, critDmg: 0,
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
    bonus.hpPercent += p.hpPercent || 0;
    bonus.defPercent += p.defPercent || 0;
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
export function getOperatorAbilitiesAtLevel(operatorId: string, level: number, potential: number = 0, talentStage: number = 4): AbilityScores {
  const entry = statsDb[operatorId];
  if (!entry || !entry.strength) {
    return { strength: 0, agility: 0, intelligence: 0, will: 0 };
  }
  const potBonus = computePotentialBonuses(operatorId, potential);
  // Add active talent stages (talentStage = number of unlocked stages, 0-4)
  const talentBonus = { strength: 0, agility: 0, intelligence: 0, will: 0 };
  if (entry.talentStages && talentStage > 0) {
    for (let s = 0; s < Math.min(talentStage, entry.talentStages.length); s++) {
      talentBonus.strength += entry.talentStages[s].strength || 0;
      talentBonus.agility += entry.talentStages[s].agility || 0;
      talentBonus.intelligence += entry.talentStages[s].intelligence || 0;
      talentBonus.will += entry.talentStages[s].will || 0;
    }
  }
  return {
    strength: interpolateStat(entry.levels, entry.strength!, level) + potBonus.strength + talentBonus.strength,
    agility: interpolateStat(entry.levels, entry.agility!, level) + potBonus.agility + talentBonus.agility,
    intelligence: interpolateStat(entry.levels, entry.intelligence!, level) + potBonus.intelligence + talentBonus.intelligence,
    will: interpolateStat(entry.levels, entry.will!, level) + potBonus.will + talentBonus.will,
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
  return Math.floor(weapon.baseAtkLv1 + (weapon.baseAtkLv90 - weapon.baseAtkLv1) * t);
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
export interface StatBreakdown {
  opBaseAtk: number;
  weaponBaseAtk: number;
  atkPercent: number;
  atkFlatBonus: number;
  atkBeforeAbility: number;
  abilityAtkBonus: number;
  opHp: number;
  hpFromStr: number;
  hpPercent: number;
}

export function computeFinalStats(
  operatorId: string,
  level: number,
  potential: number,
  talentStage: number,
  weapon: { baseAtkLv1: number; baseAtkLv90: number; skills: Weapon["skills"] } | null,
  weaponLevel: number,
  weaponSkillRanks: number[],
  gear: {
    armor: GearWithSet | null;
    gloves: typeof gear["armor"];
    kit1: typeof gear["armor"];
    kit2: typeof gear["armor"];
  },
): { stats: Stats; breakdown: StatBreakdown } {
  const base = getOperatorStatsAtLevel(operatorId, level);
  const weaponAtk = weapon ? getWeaponAtkAtLevel(weapon, weaponLevel) : 0;
  const wpBonus = computeWeaponBonuses(weapon, weaponSkillRanks);
  const potBonus = computePotentialBonuses(operatorId, potential);
  const gearBonus = computeGearBonuses(gear.armor, gear.gloves, gear.kit1, gear.kit2);

  // Gear set bonus: count pieces per set, apply if 3+
  const gearSetBonus = { atkPercent: 0, hp: 0, strength: 0, agility: 0, intelligence: 0, will: 0, critRate: 0, allSkillDmgBonus: 0, artsIntensity: 0, ultimateGainEfficiency: 0, staggerEfficiencyBonus: 0, treatmentBonus: 0, comboSkillCdReduction: 0 };
  const setCounts: Record<string, number> = {};
  for (const g of [gear.armor, gear.gloves, gear.kit1, gear.kit2]) {
    if (g?.setId) setCounts[g.setId] = (setCounts[g.setId] || 0) + 1;
  }
  const effects = setEffects as Record<string, { name: string; stat: string; trait?: string }>;
  for (const [setId, count] of Object.entries(setCounts)) {
    if (count >= 3 && effects[setId]) {
      const e = effects[setId]?.stat || "";
      const numMatch = e.match(/([\d.]+)/);
      const num = numMatch ? parseFloat(numMatch[1]) : 0;
      if (e.includes("攻击力")) gearSetBonus.atkPercent += num / 100;
      else if (e.includes("生命值")) gearSetBonus.hp += num;
      else if (e.includes("力量")) gearSetBonus.strength += num;
      else if (e.includes("敏捷")) gearSetBonus.agility += num;
      else if (e.includes("智识")) gearSetBonus.intelligence += num;
      else if (e.includes("意志")) gearSetBonus.will += num;
      else if (e.includes("暴击率")) gearSetBonus.critRate += num / 100;
      else if (e.includes("所有技能伤害")) gearSetBonus.allSkillDmgBonus += num / 100;
      else if (e.includes("源石技艺强度")) gearSetBonus.artsIntensity += num;
      else if (e.includes("终结技充能效率")) gearSetBonus.ultimateGainEfficiency += num / 100;
      else if (e.includes("失衡效率加成")) gearSetBonus.staggerEfficiencyBonus += num / 100;
      else if (e.includes("治疗效率")) gearSetBonus.treatmentBonus += num / 100;
      else if (e.includes("连携技冷却缩减")) gearSetBonus.comboSkillCdReduction += num / 100;
    }
  }
  // Apply set ability bonuses to operator's abilities
  if (gearSetBonus.strength) gearBonus.strength = (gearBonus.strength || 0) + gearSetBonus.strength;
  if (gearSetBonus.agility) gearBonus.agility = (gearBonus.agility || 0) + gearSetBonus.agility;
  if (gearSetBonus.intelligence) gearBonus.intelligence = (gearBonus.intelligence || 0) + gearSetBonus.intelligence;
  if (gearSetBonus.will) gearBonus.will = (gearBonus.will || 0) + gearSetBonus.will;

  // Ability bonuses (all formulas use integer part of ability scores)
  // Include weapon skill AND gear bonuses in ability calculations
  const baseAbilities = getOperatorAbilitiesAtLevel(operatorId, level, potential, talentStage);

  // Gear "主能力"/"副能力" are PERCENTAGE boosts applied to total ability (base + flat gear/wp)
  // Weapon "主能力提升"/"副能力" are FLAT boosts (e.g. +16 to ability)
  const opData = (operatorsData as Array<{ id: string; primaryAbility: string; secondaryAbility: string }>).find(o => o.id === operatorId);
  const primaryKey = opData!.primaryAbility;
  const secondaryKey = opData!.secondaryAbility;
  // Calculate pre-% ability totals for applying gear % bonuses
  const prePct = {
    strength: baseAbilities.strength + wpBonus.strength + gearBonus.strength,
    agility: baseAbilities.agility + wpBonus.agility + gearBonus.agility,
    intelligence: baseAbilities.intelligence + wpBonus.intelligence + gearBonus.intelligence,
    will: baseAbilities.will + wpBonus.will + gearBonus.will,
  };
  if (gearBonus.primaryAbility) {
    const pct = gearBonus.primaryAbility;
    if (primaryKey === "strength") gearBonus.strength += Math.round(prePct.strength * pct);
    else if (primaryKey === "agility") gearBonus.agility += Math.round(prePct.agility * pct);
    else if (primaryKey === "intelligence") gearBonus.intelligence += Math.round(prePct.intelligence * pct);
    else if (primaryKey === "will") gearBonus.will += Math.round(prePct.will * pct);
  }
  if (gearBonus.secondaryAbility) {
    const pct = gearBonus.secondaryAbility;
    if (secondaryKey === "strength") gearBonus.strength += Math.round(prePct.strength * pct);
    else if (secondaryKey === "agility") gearBonus.agility += Math.round(prePct.agility * pct);
    else if (secondaryKey === "intelligence") gearBonus.intelligence += Math.round(prePct.intelligence * pct);
    else if (secondaryKey === "will") gearBonus.will += Math.round(prePct.will * pct);
  }
  // Weapon "主能力提升"/"副能力" are also PERCENTAGE boosts (e.g. +11.0% of total ability)
  if (wpBonus.primaryAbility) {
    const pct = wpBonus.primaryAbility;
    if (primaryKey === "strength") gearBonus.strength += Math.round(prePct.strength * pct);
    else if (primaryKey === "agility") gearBonus.agility += Math.round(prePct.agility * pct);
    else if (primaryKey === "intelligence") gearBonus.intelligence += Math.round(prePct.intelligence * pct);
    else if (primaryKey === "will") gearBonus.will += Math.round(prePct.will * pct);
  }
  if (wpBonus.secondaryAbility) {
    const pct = wpBonus.secondaryAbility;
    if (secondaryKey === "strength") gearBonus.strength += Math.round(prePct.strength * pct);
    else if (secondaryKey === "agility") gearBonus.agility += Math.round(prePct.agility * pct);
    else if (secondaryKey === "intelligence") gearBonus.intelligence += Math.round(prePct.intelligence * pct);
    else if (secondaryKey === "will") gearBonus.will += Math.round(prePct.will * pct);
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
  const atkPercentTotal = 1 + wpBonus.atkPercent + potBonus.atkPercent + gearSetBonus.atkPercent;
  const abilityAtkBonus = primaryVal * 0.005 + secondaryVal * 0.002;
  const step1 = (base.atk + weaponAtk) * atkPercentTotal;
  const step2 = step1 + wpBonus.atk;
  const finalAtk = Math.floor(step2 * (1 + abilityAtkBonus)) + gearBonus.atk;

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

  const atkBeforeAbility = Math.floor((base.atk + weaponAtk) * atkPercentTotal + wpBonus.atk);

  const stats: Stats = {
    hp: Math.round((base.hp + hpFromStr + gearSetBonus.hp) * (1 + wpBonus.hpPercent + gearBonus.hpPercent + potBonus.hpPercent)),
    atk: finalAtk,
    def: Math.round((base.def + wpBonus.def + gearBonus.def) * (1 + wpBonus.defPercent + potBonus.defPercent)),
    strength: finalStr,
    agility: finalAgi,
    intelligence: finalInt,
    will: finalWil,
    atkBeforeAbility,
    abilityAtkBonus,
    critRate: pct(base.critRate + potBonus.critRate + wpBonus.critRate + gearBonus.critRate + gearSetBonus.critRate),
    critDmg: pct(base.critDmg + potBonus.critDmg + wpBonus.critDmg + gearBonus.critDmg),
    artsIntensity: base.artsIntensity + wpBonus.artsIntensity + gearBonus.artsIntensity + gearSetBonus.artsIntensity,
    physicalDmgBonus: pct(base.physicalDmgBonus + wpBonus.physicalDmgBonus + potBonus.physicalDmgBonus + gearBonus.physicalDmgBonus),
    heatDmgBonus: pct(base.heatDmgBonus + wpBonus.heatDmgBonus + potBonus.heatDmgBonus + gearBonus.heatDmgBonus),
    electricDmgBonus: pct(base.electricDmgBonus + wpBonus.electricDmgBonus + potBonus.electricDmgBonus + gearBonus.electricDmgBonus),
    cryoDmgBonus: pct(base.cryoDmgBonus + wpBonus.cryoDmgBonus + potBonus.cryoDmgBonus + gearBonus.cryoDmgBonus),
    natureDmgBonus: pct(base.natureDmgBonus + wpBonus.natureDmgBonus + potBonus.natureDmgBonus + gearBonus.natureDmgBonus),
    basicDmgBonus: pct(base.basicDmgBonus + potBonus.basicDmgBonus + gearBonus.basicDmgBonus + gearSetBonus.allSkillDmgBonus),
    battleSkillDmgBonus: pct(base.battleSkillDmgBonus + gearBonus.battleSkillDmgBonus + gearSetBonus.allSkillDmgBonus),
    comboSkillDmgBonus: pct(base.comboSkillDmgBonus + gearBonus.comboSkillDmgBonus + gearSetBonus.allSkillDmgBonus),
    ultimateDmgBonus: pct(base.ultimateDmgBonus + gearBonus.ultimateDmgBonus + gearSetBonus.allSkillDmgBonus),
    allSkillDmgBonus: pct(base.allSkillDmgBonus + gearBonus.allSkillDmgBonus),
    staggeredDmgBonus: pct(base.staggeredDmgBonus + gearBonus.staggeredDmgBonus),
    physicalResistance: base.physicalResistance + physResFromAgi + gearBonus.physicalResistance,
    heatResistance: base.heatResistance + elemResFromInt,
    electricResistance: base.electricResistance + elemResFromInt,
    cryoResistance: base.cryoResistance + elemResFromInt,
    natureResistance: base.natureResistance + elemResFromInt,
    aetherResistance: base.aetherResistance,
    finalDmgReduction: pct(base.finalDmgReduction + gearBonus.finalDmgReduction),
    treatmentBonus: pct(base.treatmentBonus + wpBonus.treatmentBonus + gearBonus.treatmentBonus + gearSetBonus.treatmentBonus),
    treatmentReceivedBonus: pct(base.treatmentReceivedBonus + treatRecvFromWil),
    comboSkillCdReduction: pct(base.comboSkillCdReduction + gearBonus.comboSkillCdReduction + gearSetBonus.comboSkillCdReduction),
    ultimateGainEfficiency: pct(base.ultimateGainEfficiency + wpBonus.ultimateGainEfficiency + gearBonus.ultimateGainEfficiency + gearSetBonus.ultimateGainEfficiency),
    staggerEfficiencyBonus: pct(base.staggerEfficiencyBonus + gearBonus.staggerEfficiencyBonus + gearSetBonus.staggerEfficiencyBonus),
  };

  return {
    stats,
    breakdown: {
      opBaseAtk: base.atk,
      weaponBaseAtk: weaponAtk,
      atkPercent: wpBonus.atkPercent + potBonus.atkPercent,
      atkFlatBonus: wpBonus.atk,
      atkBeforeAbility,
      abilityAtkBonus,
      opHp: base.hp,
      hpFromStr,
      hpPercent: wpBonus.hpPercent + gearBonus.hpPercent,
    },
  };
}

// ── Damage Calculation ──
// Full formula from https://endfield.wiki.gg/wiki/Damage_calculation
//
// Damage = ATK × BaseMult × MultGroup × CritMult × AmpMult × StaggerMult
//        × FinisherMult × LinkMult × WeakenMult × SusceptMult
//        × IncDMGTakenMult × DMGRedMult × ProtectMult × DEFMult
//        × ResistMult × MultiplicativeMult

// types already imported at top of file

/** Default target (enemy) stats */
export const DEFAULT_TARGET: TargetStats = {
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

/** Default damage context (no buffs/debuffs active) */
export const DEFAULT_CONTEXT: DamageContext = {
  isStaggered: false,
  isFinisher: false,
  finisherEnemyType: "common",
  linkStacks: 0,
  weakenEffects: [],
  susceptibilityEffects: [],
  incDMGTakenEffects: [],
  dmgRedEffects: [],
  protectEffect: 0,
  corrosionEffect: 0,
  multiplicativeBonuses: [],
  ampEffects: [],
  isArts: false,
};

/** Get elemental resistance from target stats */
export function getTargetResist(target: TargetStats, element: Element): number {
  switch (element) {
    case "physical": return target.physicalResist;
    case "heat": return target.heatResist;
    case "electric": return target.electricResist;
    case "cryo": return target.cryoResist;
    case "nature": return target.natureResist;
    default: return 0;
  }
}

/** Get the operator's damage bonus for a specific element */
function getElementDmgBonus(stats: Stats, element: Element): number {
  switch (element) {
    case "physical": return stats.physicalDmgBonus;
    case "heat": return stats.heatDmgBonus;
    case "electric": return stats.electricDmgBonus;
    case "cryo": return stats.cryoDmgBonus;
    case "nature": return stats.natureDmgBonus;
    default: return 0;
  }
}

const FINISHER_TABLE: Record<EnemyType, number> = {
  common: 1.0,
  advanced: 1.25,
  elite: 1.50,
  boss: 1.75,
};

const LINK_TABLE = {
  battle: [0.30, 0.45, 0.60, 0.75],
  ultimate: [0.20, 0.30, 0.40, 0.50],
};

/** DEF multiplier: 100/(def+100) if def≥0, 2−0.99^(−def) if def<0 */
export function getDEFMult(def: number): number {
  if (def >= 0) return 100 / (def + 100);
  return 2 - Math.pow(0.99, -def);
}

/** Resist multiplier for operators (from ability-based resistance) */
export function getResistMult(resist: number): number {
  return 1 - resist / 100;
}

/**
 * Calculate final damage using the complete 16-multiplier formula.
 * @param isCrit - whether this hit is a critical hit (determined by simulation RNG).
 *                 When true, critDmg is applied. When false, crit multiplier is 1.0.
 */
export function calcFinalDamage(
  atk: number,
  baseMult: number,
  opStats: Stats,
  target: TargetStats,
  context: DamageContext,
  skillType: "basic" | "battle" | "combo" | "ultimate" = "battle",
  element: Element = "physical",
  isCrit: boolean = false,
): number {
  // 1. Base ATK already computed. Apply attribute bonus inline (already in ATK).

  // 2. Base multiplier
  let damage = atk * baseMult;

  // 3. Multiplier Group: 1 + Σ(DamageBonuses)
  let multGroup = 1;
  // Type-specific damage bonus (elemental)
  multGroup += getElementDmgBonus(opStats, element);
  // Skill-type-specific damage bonus
  switch (skillType) {
    case "basic": multGroup += opStats.basicDmgBonus; break;
    case "battle": multGroup += opStats.battleSkillDmgBonus; break;
    case "combo": multGroup += opStats.comboSkillDmgBonus; break;
    case "ultimate": multGroup += opStats.ultimateDmgBonus; break;
  }
  // Staggered damage bonus
  if (context.isStaggered) multGroup += opStats.staggeredDmgBonus;
  damage *= multGroup;

  // 4. Critical multiplier — discrete crit/non-crit per hit (supports on-crit triggers)
  damage *= isCrit ? (1 + opStats.critDmg) : 1;

  // 5. Amp multiplier: 1 + Σ(AmpBonuses)
  let ampMult = 1;
  for (const amp of context.ampEffects) {
    ampMult += amp;
  }
  damage *= ampMult;

  // 6. Stagger multiplier
  if (context.isStaggered) damage *= 1.3;

  // 7. Finisher multiplier
  if (context.isFinisher) damage *= (FINISHER_TABLE[context.finisherEnemyType] || 1.0);

  // 8. Link multiplier
  if (context.linkStacks > 0) {
    const stackIndex = Math.min(context.linkStacks - 1, 3);
    const linkBonus = skillType === "ultimate"
      ? LINK_TABLE.ultimate[stackIndex]
      : LINK_TABLE.battle[stackIndex];
    damage *= (1 + linkBonus);
  }

  // 9. Weaken multiplier: ∏(1 − weakenEffect)
  for (const w of context.weakenEffects) {
    damage *= (1 - w);
  }

  // 10. Susceptibility multiplier: 1 + Σ(susceptibilityEffects)
  let susceptBonus = 1;
  for (const s of context.susceptibilityEffects) {
    susceptBonus += s;
  }
  damage *= susceptBonus;

  // 11. Increased DMG Taken: 1 + Σ(incDMGTaken)
  let incDmgTaken = 1;
  for (const d of context.incDMGTakenEffects) {
    incDmgTaken += d;
  }
  damage *= incDmgTaken;

  // 12. DMG Reduction: ∏(1 − dmgRedEffect)
  for (const r of context.dmgRedEffects) {
    damage *= (1 - r);
  }

  // 13. Protection: 1 − max(protectionEffect)
  if (context.protectEffect > 0) {
    damage *= (1 - context.protectEffect);
  }

  // 14. DEF multiplier (applies to all damage types)
  damage *= getDEFMult(target.def);

  // 15. Resist multiplier (applies to all damage types — physical has its own resist)
  const resist = getTargetResist(target, element);
  damage *= getResistMult(resist);

  // 16. Multiplicative multiplier: ∏(1 + bonus)
  for (const m of context.multiplicativeBonuses) {
    damage *= (1 + m);
  }

  return Math.max(0, Math.floor(damage));
}

/**
 * Calculate damage for a single hit with RNG crit (for non-deterministic display).
 * @deprecated Use calcFinalDamage for deterministic DPS comparison.
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
  const critMult = isCrit ? (1 + critDmg) : 1;
  let rawDamage: number;
  if (isArts) {
    rawDamage = atk * multiplier * getResistMult(res);
  } else {
    rawDamage = atk * multiplier * getDEFMult(def);
  }
  return { damage: Math.floor(rawDamage * critMult), isCrit };
}

/**
 * Calculate expected average damage (deterministic, no RNG).
 * @deprecated Use calcFinalDamage for the complete formula.
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
  const avgCritMult = 1 + critRate * critDmg;
  let rawDamage: number;
  if (isArts) {
    rawDamage = atk * multiplier * getResistMult(res);
  } else {
    rawDamage = atk * multiplier * getDEFMult(def);
  }
  return rawDamage * avgCritMult;
}

// ── Status / Reaction Damage ──

/** Base multipliers for Physical Statuses, Arts Bursts, and Arts Reactions */
const STATUS_BASE_MULTS: Record<string, number> = {
  lift: 1.2,
  knockDown: 1.2,
  crush: 1.5,           // + 1.5 per Vulnerable stack
  breach: 0.5,           // + 0.5 per Vulnerable stack
  artsBurst: 1.6,
  artsReaction: 0.8,     // + 0.8 per infliction stack
  shatter: 1.2,           // + 1.2 per Status Level
  combustion: 0.12,       // + 0.12 per Status Level (DoT)
};

/**
 * Calculate base multiplier for status effects (Crush, Breach, Burst, etc.)
 * Includes the hidden level-dependent multiplier and Arts Intensity bonus.
 */
export function calcStatusDamage(
  atk: number,
  statusType: string,
  _stacks: number,
  operatorLevel: number,
  artsIntensity: number,
  extraMultiplier: number = 0, // e.g. per Vulnerable stack for Crush/Breach
): number {
  const baseMult = (STATUS_BASE_MULTS[statusType] || 0) + extraMultiplier;

  // Hidden level-dependent multiplier from wiki.gg damage calculation.
  let hiddenMult = 1;
  if (statusType === "lift" || statusType === "knockDown" || statusType === "crush" || statusType === "breach") {
    hiddenMult = 1 + (operatorLevel - 1) / 392;
  } else if (statusType === "artsBurst" || statusType === "artsReaction" || statusType === "shatter" || statusType === "combustion") {
    hiddenMult = 1 + (operatorLevel - 1) / 196;
  }

  // Arts Intensity multiplier: 1 + ArtsIntensity / 100
  const artsIntensityMult = 1 + artsIntensity / 100;

  return atk * baseMult * hiddenMult * artsIntensityMult;
}

// ── Party Synergies ──

/** Minimal info about a party member needed for synergy calculation */
export interface PartyMemberInfo {
  operatorId: string;
  profession: Profession;
  potential: number;
  attributeTalentStage: number;
  talentSkill1Stage: number;
  talentSkill2Stage: number;
}

const talentMetaDb = (operatorStats as Record<string, unknown>)._talentMeta as Record<string, OperatorTalentMeta> | undefined;
const synergyDb = (operatorStats as Record<string, unknown>)._partySynergies as Record<string, PartySynergyDef> | undefined;

/** Get the talent meta for a specific operator, or null if not defined */
export function getOperatorTalentMeta(operatorId: string): OperatorTalentMeta | null {
  return talentMetaDb?.[operatorId] ?? null;
}

/** Resolve which talent stage a talentId maps to for a given member */
function getTalentStage(member: PartyMemberInfo, talentId: string): number {
  const meta = talentMetaDb?.[member.operatorId];
  if (!meta) return 0;
  if (meta.attribute.talentId === talentId) return member.attributeTalentStage;
  if (meta.skill1.talentId === talentId) return member.talentSkill1Stage;
  if (meta.skill2.talentId === talentId) return member.talentSkill2Stage;
  return 0;
}

/**
 * Compute party-wide synergy bonuses.
 * Returns a Map from operatorId → stat bonuses (additive).
 */
export function computePartySynergies(members: PartyMemberInfo[]): Map<string, Record<string, number>> {
  const bonusMap = new Map<string, Record<string, number>>();
  if (!synergyDb) return bonusMap;

  for (const member of members) {
    const def = synergyDb[member.operatorId];
    if (!def) continue;

    const talentStage = getTalentStage(member, def.talentId);

    for (const effect of def.effects) {
      if (talentStage < effect.requiredTalentStage) continue;
      if (member.potential < effect.requiredPotential) continue;

      for (const target of members) {
        if (effect.targetProfessions.length > 0 && !effect.targetProfessions.includes(target.profession)) continue;

        let bonuses = bonusMap.get(target.operatorId);
        if (!bonuses) {
          bonuses = {};
          bonusMap.set(target.operatorId, bonuses);
        }

        for (const [stat, value] of Object.entries(effect.bonuses)) {
          bonuses[stat] = (bonuses[stat] || 0) + value;
        }
      }
    }
  }

  return bonusMap;
}

/** Apply synergy bonuses to a Stats object (returns new object, does not mutate input) */
export function applySynergyBonuses(stats: Stats, bonuses: Record<string, number> | undefined): Stats {
  if (!bonuses || Object.keys(bonuses).length === 0) return stats;
  const result = { ...stats };
  for (const [stat, value] of Object.entries(bonuses)) {
    if (stat in result) {
      (result as Record<string, number>)[stat] = (result as Record<string, number>)[stat] + value;
    }
  }
  return result;
}
