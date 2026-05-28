// ── Core types for the Endfield Damage Simulator ──

export type Element = "physical" | "heat" | "electric" | "cryo" | "nature";
export type WeaponType = "Sword" | "ArtsUnit" | "Greatsword" | "Handcannon" | "Polearm";
export type Profession = "Guard" | "Caster" | "Striker" | "Vanguard" | "Defender" | "Supporter";
export type Ability = "strength" | "agility" | "intelligence" | "will";
export type SkillType = "basic" | "battle" | "combo" | "ultimate";
export type EnemyType = "common" | "advanced" | "elite" | "boss";

/** A damage tick within a skill/attack sequence */
export interface DamageTick {
  offset: number;       // seconds from start
  stagger: number;      // stagger value
  sp: number;           // SP/gauge gain
  boundEffects: string[];
  /** Optional per-tick multiplier override. If set, this tick uses its own multiplier instead of the skill's base. */
  multiplier?: number;
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
  multipliers: number[]; // damage multiplier per rank (index 0 = rank 1, length 12)
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
  multipliers: number[]; // damage multiplier per rank (index 0 = rank 1, length 12)
  /** Parsed trigger condition from combo skill description */
  comboTrigger?: ComboTrigger;
}

export interface ComboTrigger {
  type: "on_status_applied" | "on_heavy_hit" | "on_finisher_hit" | "on_dual_status" | "on_status_hit";
  /** Status types required (for status-based triggers) */
  statusTypes?: string[];
  /** Both statuses must be present (for dual_status trigger) */
  requireBoth?: boolean;
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
  /** Enhanced basic attack multipliers during ultimate (per rank, same length as attackSegments) */
  ultEnhancedMultipliers?: number[][];
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
  multipliers: number[]; // damage multiplier per rank (index 0 = rank 1, length 12)
}

/** Normal attack segment */
export interface AttackSegment {
  index: number;
  duration: number;
  gaugeGain: number;
  damageTicks: DamageTick[];
  allowedTypes: string[];
  multipliers: number[]; // damage multiplier per rank (index 0 = rank 1, length 12) for this segment
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
  potentialTalents?: Talent[];
  acceptTeamGauge: boolean;
  /** Per-rank finisher ATK multiplier (from wiki "处决攻击倍率" column) */
  finisherMultipliers?: number[];
  /** Per-rank dive ATK multiplier (from wiki "下落攻击倍率" column) */
  diveMultipliers?: number[];
}

/** Base stats of an operator */
export interface Stats {
  // Basic
  hp: number;
  atk: number;
  def: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  will?: number;
  atkBeforeAbility?: number;
  abilityAtkBonus?: number;
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
  /** Attribute talent stage 0-4 (0=none, 4=all stages) */
  talentStage: number;
  /** Combat talent skill 1 stage */
  talentSkill1Stage: number;
  /** Combat talent skill 2 stage */
  talentSkill2Stage: number;
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

export type TimelineEventType = "incoming_damage" | "enemy_kill";

/** A skill or battle event block placed on the timeline */
export interface TimelineBlock {
  id: string;
  skillId: string;
  operatorId: string;
  startFrame: number;
  duration: number;
  label: string;
  eventType?: TimelineEventType;
  eventValue?: number;
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

// ── Target / Enemy Stats ──

export interface TargetStats {
  enemyCount?: number;
  def: number;
  physicalResist: number;
  heatResist: number;
  electricResist: number;
  cryoResist: number;
  natureResist: number;
  aetherResist: number;
  enemyType: EnemyType;
  staggerThreshold: number; // stagger HP bar max
  staggerDuration: number;  // seconds stagger lasts (default 5)
}

// ── Damage Calculation Context ──

export interface DamageContext {
  isStaggered: boolean;
  isFinisher: boolean;
  finisherEnemyType: EnemyType;
  linkStacks: number;
  weakenEffects: number[];        // each is a (1 - weaken%) factor
  susceptibilityEffects: number[];  // additive susceptibility bonuses
  incDMGTakenEffects: number[];    // additive "increased DMG taken" bonuses
  dmgRedEffects: number[];         // each is a (1 - dmgRed%) factor
  protectEffect: number;           // only strongest applies
  corrosionEffect: number;         // reduces enemy resist multiplier
  multiplicativeBonuses: number[];  // each is a (1 + bonus) factor
  ampEffects: number[];            // additive Amp bonuses (elemental amplification)
  isArts: boolean;
}

// ── Simulation Types ──

export interface BuffInstance {
  id: string;
  name: string;
  source: string;       // operatorId that applied it
  target: "self" | "team" | "enemy";
  stat: string;         // stat key being modified
  value: number;        // amount (additive for most, flat for multipliers)
  remaining: number;    // seconds remaining
  maxDuration: number;
  skillTypes?: SkillType[];
  consumeOnSkillEnd?: boolean;
  stackKey?: string;
}

export interface SimEvent {
  frame: number;
  time: number;
  type: "damage" | "buff_apply" | "buff_expire" | "skill_start" | "skill_end"
    | "status_apply" | "stagger" | "combo_ready" | "energy_gain" | "sp_gain"
    | "incoming_damage" | "enemy_kill";
  operatorId: string;
  skillId?: string;
  skillName?: string;
  damage?: number;
  isCrit?: boolean;
  detail?: string;
}

export interface OperatorSnapshot {
  operatorId: string;
  currentSP: number;
  currentEnergy: number;
  currentHp: number;
  shieldHp: number;
  activeCooldowns: Record<string, number>;  // skillId -> seconds remaining
  activeBuffs: BuffInstance[];
  comboSkillReady: boolean;
  isCasting: boolean;
  castingSkillId: string | null;
  castingProgress: number;  // seconds elapsed since cast start
}

export interface SimFrame {
  frame: number;
  time: number;          // seconds from simulation start
  events: SimEvent[];
  operators: Record<string, OperatorSnapshot>;
  targetStagger: number;   // current stagger bar value
  targetStaggered: boolean;
}

export interface SimulationResultFull extends SimulationResult {
  frames: SimFrame[];
}

// ── Party Synergy (cross-operator aura effects) ──

export interface TalentMetaEntry {
  talentId: string;
  name: string;
  maxStage: number;
}

export interface OperatorTalentMeta {
  attribute: TalentMetaEntry;
  skill1: TalentMetaEntry;
  skill2: TalentMetaEntry;
}

export interface PartySynergyEffect {
  /** Minimum talent stage required for this effect tier */
  requiredTalentStage: number;
  /** Minimum potential of source operator for this effect tier */
  requiredPotential: number;
  /** Target professions this effect applies to (empty = all professions) */
  targetProfessions: Profession[];
  /** Stat bonuses (additive) — keys match Stats fields */
  bonuses: Record<string, number>;
}

export interface PartySynergyDef {
  /** Operator ID that provides this synergy */
  sourceOperatorId: string;
  /** Which talent provides this synergy */
  talentId: string;
  /** Multiple tiers of this effect (base + potential upgrades) */
  effects: PartySynergyEffect[];
}
