// ── Core types for the Endfield Damage Simulator ──

export type Element = "physical" | "heat" | "electric" | "cryo" | "nature";
export type WeaponType = "Sword" | "ArtsUnit" | "Greatsword" | "Handcannon" | "Polearm";
export type Profession = "Guard" | "Caster" | "Striker" | "Vanguard" | "Defender" | "Supporter";
export type Ability = "strength" | "agility" | "intelligence" | "will";

/** A damage tick within a skill/attack sequence */
export interface DamageTick {
  offset: number;       // seconds from start
  stagger: number;      // stagger value
  sp: number;           // SP/gauge gain
  boundEffects: string[];
}

/** An active skill */
export interface Skill {
  id: string;
  name: string;
  spCost: number;
  initialSp: number;
  duration: number;      // seconds
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
  anomalies: Array<{ type: string; stacks: number; duration: number; offset: number }>;
}

/** Combo/link skill */
export interface LinkSkill {
  id: string;
  name: string;
  spCost: number;
  initialSp: number;
  duration: number;
  cooldown: number;
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
}

/** Ultimate skill */
export interface UltimateSkill {
  id: string;
  name: string;
  spCost: number;
  initialSp: number;
  duration: number;
  gaugeMax: number;
  gaugeReply: number;
  animationTime: number;
  enhancementTime: number;
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
}

/** Normal attack segment */
export interface AttackSegment {
  index: number;
  duration: number;
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
}

/** A single operator (character) in the game */
export interface Operator {
  id: string;
  name: string;
  nameEn?: string;
  rarity: 4 | 5 | 6;
  element: Element;
  weapon: WeaponType;
  profession: Profession;
  primaryAbility: Ability;
  secondaryAbility: Ability;
  avatar: string;
  description: string;
  skills: Skill[];
  linkSkill: LinkSkill | null;
  ultimate: UltimateSkill | null;
  attackSegments: AttackSegment[];
  talents: Talent[];
  acceptTeamGauge: boolean;
}

/** Base stats of an operator */
export interface Stats {
  // Basic
  hp: number;
  atk: number;
  def: number;
  // Offensive
  critRate: number;          // 0.05 = 5%
  critDmg: number;           // 0.5 = 50%
  artsIntensity: number;
  physicalDmgBonus: number;
  heatDmgBonus: number;
  electricDmgBonus: number;
  cryoDmgBonus: number;
  natureDmgBonus: number;
  basicDmgBonus: number;
  battleSkillDmgBonus: number;
  comboSkillDmgBonus: number;
  ultimateDmgBonus: number;
  allSkillDmgBonus: number;
  staggeredDmgBonus: number;
  // Defensive
  physicalResistance: number;
  heatResistance: number;
  electricResistance: number;
  cryoResistance: number;
  natureResistance: number;
  aetherResistance: number;
  finalDmgReduction: number;
  // Utility
  treatmentBonus: number;
  treatmentReceivedBonus: number;
  comboSkillCdReduction: number;
  ultimateGainEfficiency: number;  // 1.0 = 100%
  staggerEfficiencyBonus: number;
}

/** A passive talent */
export interface Talent {
  id: string;
  name: string;
  description: string;
}

export interface WeaponSkillRank {
  /** Flat stat bonuses at this rank */
  atk?: number;
  hp?: number;
  def?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  will?: number;
  /** Percentage bonuses at this rank (stored as fraction, e.g. 0.39 = 39%) */
  atkPercent?: number;
  hpPercent?: number;
  defPercent?: number;
  critRate?: number;
  critDmg?: number;
  artsIntensity?: number;
  ultimateGainEfficiency?: number;
  treatmentBonus?: number;
  primaryAbility?: number;
  secondaryAbility?: number;
  allElementDmg?: number;
  /** Elemental damage bonuses at this rank */
  physicalDmgBonus?: number;
  heatDmgBonus?: number;
  electricDmgBonus?: number;
  cryoDmgBonus?: number;
  natureDmgBonus?: number;
  /** Trait description at this rank */
  trait?: string;
}

export interface WeaponSkill {
  name: string;
  nameEn?: string;
  maxRank: number;
  ranks: WeaponSkillRank[];
}

/** A weapon equipped by an operator */
export interface Weapon {
  id: string;
  name: string;
  nameEn?: string;
  rarity: 3 | 4 | 5 | 6;
  weaponType: WeaponType;
  cover: string;
  description: string;
  /** Base ATK at lv1 */
  baseAtkLv1: number;
  /** Base ATK at lv90 */
  baseAtkLv90: number;
  skills: WeaponSkill[];
  trait: string;
}

export interface GearPiece {
  id: string;
  name: string;
  nameEn?: string;
  rarity: number;
  quality: string;
  slot: "Armor" | "Gloves" | "Kit";
  cover: string;
  description: string;
  baseStats: Record<string, string>;
  refinement: Array<{ name: string; base: string; rank1: string; rank2: string; rank3: string }>;
  /** Per-stat refinement ranks (index matches refinement array), default all 3 */
  refinementRanks?: number[];
}

/** A configured operator in the party */
export interface PartyMember {
  slotIndex: number;
  operator: Operator | null;
  level: number;
  /** Skill ranks for operator skills (normal attack, skill 1, skill 2, ultimate) */
  skillRanks: number[];
  /** Talent stage 0-4 (0=none, 4=all stages) */
  talentStage: number;
  potential: number;
  weapon: Weapon | null;
  weaponLevel: number;
  /** Skill ranks for weapon skills (index 0/1/2 → weapon skill 1/2/3) */
  weaponSkillRanks: number[];
  armor: GearPiece | null;
  gloves: GearPiece | null;
  kit1: GearPiece | null;
  kit2: GearPiece | null;
  finalStats: Stats | null;
}

/** A skill block placed on the timeline */
export interface TimelineBlock {
  id: string;
  skillId: string;
  operatorId: string;
  startFrame: number;
  duration: number;
  label: string;
}

/** One operator's track on the timeline */
export interface TimelineTrack {
  operatorId: string;
  blocks: TimelineBlock[];
}

/** Result of a DPS simulation run */
export interface SimulationResult {
  totalDamage: number;
  totalFrames: number;
  dps: number;
  operatorResults: OperatorResult[];
}

export interface OperatorResult {
  operatorId: string;
  operatorName: string;
  totalDamage: number;
  dps: number;
  damageShare: number;
  skillBreakdown: SkillDamageResult[];
}

export interface SkillDamageResult {
  skillId: string;
  skillName: string;
  casts: number;
  totalDamage: number;
  dps: number;
}
