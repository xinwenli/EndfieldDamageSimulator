// ── Core types for the Endfield DPS Simulator ──

/** A single operator (character) in the game */
export interface Operator {
  id: string;
  name: string;
  rarity: 4 | 5 | 6;
  baseStats: Stats;
  /** Skills this operator can equip */
  skills: Skill[];
  /** Talent passives */
  talents: Talent[];
}

/** Base stats of an operator at a given level */
export interface Stats {
  hp: number;
  atk: number;
  def: number;
  res: number;
  aspd: number;
  critRate: number;   // 0–1
  critDmg: number;     // e.g. 1.5 = 150%
}

/** An active skill that can be used in combat */
export interface Skill {
  id: string;
  name: string;
  spCost: number;       // SP needed to cast
  initialSp: number;    // SP at battle start
  castTime: number;     // frames to cast
  duration: number;     // frames the skill lasts (0 = instant)
  cooldown: number;     // frames before re-castable (0 = no cooldown)
  multiplier: number;   // ATK multiplier for damage
  hits: number;         // number of hits per cast
  type: SkillType;
  tags: SkillTag[];
}

export type SkillType = "physical" | "arts" | "heal" | "buff" | "debuff";
export type SkillTag = "aoe" | "single" | "auto" | "manual";

/** A passive talent */
export interface Talent {
  id: string;
  name: string;
  description: string;
  effects: TalentEffect[];
}

export interface TalentEffect {
  stat: keyof Stats;
  modifier: "add" | "multiply";
  value: number;
  condition?: string;
}

/** A weapon equipped by an operator */
export interface Weapon {
  id: string;
  name: string;
  rarity: 4 | 5 | 6;
  stats: Partial<Stats>;
  trait: string;
}

/** A configured operator in the party (operator + weapon + level) */
export interface PartyMember {
  slotIndex: number;
  operator: Operator | null;
  weapon: Weapon | null;
  level: number;
  /** Computed final stats after weapon + level scaling */
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
  damageShare: number; // 0–1 fraction of total damage
  skillBreakdown: SkillDamageResult[];
}

export interface SkillDamageResult {
  skillId: string;
  skillName: string;
  casts: number;
  totalDamage: number;
  dps: number;
}
