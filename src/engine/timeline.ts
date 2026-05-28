import type {
  Stats,
  Operator,
  TimelineTrack,
  TimelineBlock,
  SimFrame,
  SimEvent,
  OperatorSnapshot,
  SimulationResultFull,
  BuffInstance,
  DamageContext,
  TargetStats,
  Element,
} from "./types";
import { calcFinalDamage, calcStatusDamage, DEFAULT_TARGET, getDEFMult, getOperatorTalentMeta } from "./formulas";
import type { ParsedTraitEffect, ParsedTraitTrigger, TraitSkillCondition, TraitTarget } from "./traitParser";
import { isBattleRelatedOperatorTalent, parseOperatorTalentTraitEffects } from "./operatorTalentParser";

// ── Simulation Constants ──
export const DEFAULT_FPS = 60;

// ── Seeded RNG for deterministic crit rolls ──
// Simple mulberry32 PRNG seeded per hit for reproducibility
function seededRandom(seed: number): number {
  let s = seed | 0;
  s ^= s >>> 16; s = Math.imul(s, 0x85ebca6b);
  s ^= s >>> 13; s = Math.imul(s, 0xc2b2ae35);
  s ^= s >>> 16;
  return (s >>> 0) / 0xffffffff;
}

// ── Internal State ──

interface SkillInstance {
  block: TimelineBlock;
  startFrame: number;
  durationFrames: number;
  progress: number; // frames elapsed
  firedTicks: Set<number>; // indices of damageTicks already fired
}

interface OpState {
  operatorId: string;
  operator: Operator;
  stats: Stats;
  skillRanks: number[];      // [basic, battle, combo, ultimate]
  currentEnergy: number;
  maxEnergy: number;
  currentHp: number;
  shieldHp: number;
  activeCooldowns: Map<string, number>; // skillId -> seconds remaining
  activeBuffs: BuffInstance[];
  comboSkillReady: boolean;
  currentCasting: SkillInstance | null;
  totalDamage: number;
  skillDamage: Map<string, { casts: number; damage: number }>;
  ultimateActive: boolean;
  ultimateRemaining: number; // seconds remaining in ultimate state
  linkStacks: number;        // accumulated link stacks (consumed by battle skill / ultimate)
  talentEffects: TalentEffect[]; // stored talent effects for conditional activation
  level: number;             // operator level for status damage scaling
  hitCounter: number;        // running count of damage hits for deterministic crit seeding
  stackEffects: Map<string, { stacks: number; maxStacks: number; buffDuration: number; refreshOnStack: boolean; burstStat: string; burstValue: number; burstDuration: number; burstTimer: number; burstActive: boolean }>;
  traitEffects: ParsedTraitEffect[];
  traitCooldowns: Map<string, number>;
  usedOnceTraits: Set<string>;
  hpConditionStates: Set<string>;
}

interface SimState {
  operators: Map<string, OpState>;
  controlledOperatorId?: string;
  target: TargetStats;
  targetStagger: number;
  targetStaggered: boolean;
  targetStaggerTimer: number; // seconds since stagger started
  targetBuffs: BuffInstance[];
  targetStatuses: Map<string, { stacks: number; remaining: number; sourceOpId: string; sourceSkillType?: TraitSkillCondition }>;
  partySP: number;           // shared party SP (max 3 bars)
  maxPartySP: number;
  currentFrame: number;
  events: SimEvent[];
  fps: number;
  runSeed: number;           // varies per simulation invocation for crit variation
}

interface TraitRuntimeContext {
  skillType?: TraitSkillCondition;
  statusType?: string;
  statusStacks?: number;
  triggerOperatorId?: string;
  consumedStatusTypes?: string[];
  consumedStatusStacks?: number;
  consumedStatusStacksByType?: Record<string, number>;
  affectedAllyId?: string;
  healOverflow?: boolean;
  hpRatio?: number;
}

// ── Skill Rank Index Mapping ──
// skillRanks array: [basic(0), battle(1), combo(2), ultimate(3)]
// Each operator has exactly: Basic ATK, Battle Skill, Combo Skill, Ultimate

function getRankIndex(op: OpState, skillId: string): number {
  switch (skillId) {
    case "basic":    return Math.min((op.skillRanks[0] ?? 1) - 1, 11);
    case "skill_1":  return Math.min((op.skillRanks[1] ?? 1) - 1, 11);
    case "combo":    return Math.min((op.skillRanks[2] ?? 1) - 1, 11);
    case "ultimate": return Math.min((op.skillRanks[3] ?? 1) - 1, 11);
    default:         return 0;
  }
}

// ── Buff Helpers ──

function skillTypeFromSkillId(skillId: string): TraitSkillCondition | undefined {
  if (skillId === "basic") return "basic";
  if (skillId.startsWith("skill_")) return "battle";
  if (skillId === "combo") return "combo";
  if (skillId === "ultimate") return "ultimate";
  return undefined;
}

function resetStackEffectForBuff(op: OpState, buff: BuffInstance): void {
  if (!buff.stackKey) return;
  const stackEffect = op.stackEffects.get(buff.stackKey);
  if (!stackEffect) return;
  stackEffect.stacks = 0;
  stackEffect.burstActive = false;
}

function refreshShieldHp(op: OpState): void {
  op.shieldHp = Math.max(0, ...op.activeBuffs.filter(b => b.stat === "shield").map(b => b.value));
}

function absorbShieldDamage(op: OpState, amount: number): number {
  let remaining = amount;
  const shieldBuffs = op.activeBuffs
    .filter(b => b.stat === "shield" && b.value > 0)
    .sort((a, b) => b.value - a.value);

  for (const buff of shieldBuffs) {
    if (remaining <= 0) break;
    const absorbed = Math.min(buff.value, remaining);
    buff.value -= absorbed;
    remaining -= absorbed;
  }

  op.activeBuffs = op.activeBuffs.filter(b => b.stat !== "shield" || b.value > 0);
  refreshShieldHp(op);
  return amount - remaining;
}

function tickBuffs(state: SimState): void {
  const dt = 1 / state.fps;
  for (const [, op] of state.operators) {
    let shieldChanged = false;
    op.activeBuffs = op.activeBuffs.filter((b) => {
      b.remaining -= dt;
      if (b.remaining <= 0) {
        resetStackEffectForBuff(op, b);
        if (b.stat === "shield") shieldChanged = true;
        state.events.push({
          frame: state.currentFrame,
          time: state.currentFrame / state.fps,
          type: "buff_expire",
          operatorId: op.operatorId,
          detail: `${b.name} expired`,
        });
        return false;
      }
      return true;
    });
    if (shieldChanged) refreshShieldHp(op);
  }
}

function consumeSkillEndBuffs(state: SimState, op: OpState, skillType?: TraitSkillCondition): void {
  if (!skillType) return;
  let shieldChanged = false;
  op.activeBuffs = op.activeBuffs.filter((b) => {
    if (!b.consumeOnSkillEnd) return true;
    if (b.skillTypes && !b.skillTypes.includes(skillType)) return true;
    resetStackEffectForBuff(op, b);
    if (b.stat === "shield") shieldChanged = true;
    state.events.push({
      frame: state.currentFrame,
      time: state.currentFrame / state.fps,
      type: "buff_expire",
      operatorId: op.operatorId,
      detail: `${b.name} consumed by ${skillType} skill`,
    });
    return false;
  });
  if (shieldChanged) refreshShieldHp(op);
}

function addBuff(state: SimState, op: OpState, buff: BuffInstance): void {
  op.activeBuffs = op.activeBuffs.filter(b => b.id !== buff.id);
  op.activeBuffs.push({ ...buff });
  if (buff.stat === "shield") refreshShieldHp(op);
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "buff_apply",
    operatorId: op.operatorId,
    detail: `${buff.name}: ${buff.stat} ${buff.value >= 0 ? "+" : ""}${buff.value}`,
  });

  if (buff.stat === "amp") {
    fireTraitEffects(state, op, "on_amp_gain", {});
  }
}

function addTargetBuff(state: SimState, buff: BuffInstance): void {
  state.targetBuffs = state.targetBuffs.filter(b => b.id !== buff.id);
  state.targetBuffs.push({ ...buff });
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "buff_apply",
    operatorId: buff.source,
    detail: `Target ${buff.name}: ${buff.stat} ${buff.value >= 0 ? "+" : ""}${buff.value}`,
  });
}

function tickTargetBuffs(state: SimState): void {
  const dt = 1 / state.fps;
  state.targetBuffs = state.targetBuffs.filter((b) => {
    b.remaining -= dt;
    if (b.remaining <= 0) {
      state.events.push({
        frame: state.currentFrame,
        time: state.currentFrame / state.fps,
        type: "buff_expire",
        operatorId: b.source,
        detail: `Target ${b.name} expired`,
      });
      return false;
    }
    return true;
  });
}

function buffAppliesToDamage(
  buff: BuffInstance,
  isArts: boolean,
  skillType?: TraitSkillCondition,
  element?: Element,
): boolean {
  if (buff.skillTypes && (!skillType || !buff.skillTypes.includes(skillType))) return false;
  if (buff.stat === "allElementDmg") return isArts;
  if (buff.stat === "physicalDmgBonus") return element === "physical";
  if (buff.stat === "heatDmgBonus") return element === "heat";
  if (buff.stat === "electricDmgBonus") return element === "electric";
  if (buff.stat === "cryoDmgBonus") return element === "cryo";
  if (buff.stat === "natureDmgBonus") return element === "nature";
  return true;
}

// ── Damage Context Builder ──

function resistanceFromAbility(value: number): number {
  return Math.round(100 - 100 / (0.001 * value + 1));
}

function applyAllAbilityPercentBuff(op: OpState, stats: Stats, percent: number): number {
  if (percent === 0) return 0;
  const strength = op.stats.strength;
  const agility = op.stats.agility;
  const intelligence = op.stats.intelligence;
  const will = op.stats.will;
  if (strength === undefined || agility === undefined || intelligence === undefined || will === undefined) return 0;

  const nextStrength = Math.floor(strength * (1 + percent));
  const nextAgility = Math.floor(agility * (1 + percent));
  const nextIntelligence = Math.floor(intelligence * (1 + percent));
  const nextWill = Math.floor(will * (1 + percent));
  const abilityValues = { strength, agility, intelligence, will };
  const nextAbilityValues = {
    strength: nextStrength,
    agility: nextAgility,
    intelligence: nextIntelligence,
    will: nextWill,
  };

  const primary = op.operator.primaryAbility;
  const secondary = op.operator.secondaryAbility;
  const oldPrimary = abilityValues[primary] ?? intelligence;
  const oldSecondary = abilityValues[secondary] ?? strength;
  const nextPrimary = nextAbilityValues[primary] ?? nextIntelligence;
  const nextSecondary = nextAbilityValues[secondary] ?? nextStrength;
  const oldAbilityAtkBonus = op.stats.abilityAtkBonus ?? (oldPrimary * 0.005 + oldSecondary * 0.002);
  const nextAbilityAtkBonus = nextPrimary * 0.005 + nextSecondary * 0.002;
  const atkBeforeAbility = op.stats.atkBeforeAbility ?? Math.floor(op.stats.atk / (1 + oldAbilityAtkBonus));
  const oldAtk = Math.floor(atkBeforeAbility * (1 + oldAbilityAtkBonus));
  const nextAtk = Math.floor(atkBeforeAbility * (1 + nextAbilityAtkBonus));
  const atkDelta = nextAtk - oldAtk;

  stats.hp += 5 * (nextStrength - strength);
  stats.physicalResistance += resistanceFromAbility(nextAgility) - resistanceFromAbility(agility);
  const elementalResistanceDelta = resistanceFromAbility(nextIntelligence) - resistanceFromAbility(intelligence);
  stats.heatResistance += elementalResistanceDelta;
  stats.electricResistance += elementalResistanceDelta;
  stats.cryoResistance += elementalResistanceDelta;
  stats.natureResistance += elementalResistanceDelta;
  stats.treatmentReceivedBonus += 0.001 * (nextWill - will);
  stats.atk += atkDelta;
  return atkDelta;
}

function buildDamageContext(
  op: OpState,
  state: SimState,
  isArts: boolean,
  isFinisher: boolean = false,
  element?: Element,
  skillType?: TraitSkillCondition,
): DamageContext {
  const context: DamageContext = {
    isStaggered: state.targetStaggered,
    isFinisher,
    finisherEnemyType: state.target.enemyType,
    linkStacks: op.linkStacks,
    weakenEffects: [],
    susceptibilityEffects: [],
    incDMGTakenEffects: [],
    dmgRedEffects: [],
    protectEffect: 0,
    corrosionEffect: 0,
    multiplicativeBonuses: [],
    ampEffects: [],
    isArts,
  };

  // Compute buff contributions from all buffs on this operator
  for (const buff of op.activeBuffs) {
    if (!buffAppliesToDamage(buff, isArts, skillType, element)) continue;
    switch (buff.stat) {
      case "amp":
        context.ampEffects.push(buff.value);
        break;
      case "susceptibility":
        context.susceptibilityEffects.push(buff.value);
        break;
      case "incDMGTaken":
        context.incDMGTakenEffects.push(buff.value);
        break;
      case "weaken":
        context.weakenEffects.push(buff.value);
        break;
      case "dmgReduction":
        context.dmgRedEffects.push(buff.value);
        break;
      case "protect":
        context.protectEffect = Math.max(context.protectEffect, buff.value);
        break;
      case "multiplicative":
        context.multiplicativeBonuses.push(buff.value);
        break;
      case "corrosion":
        context.corrosionEffect += buff.value;
        break;
    }
  }

  for (const buff of state.targetBuffs) {
    if (!buffAppliesToDamage(buff, isArts, skillType, element)) continue;
    switch (buff.stat) {
      case "allElementDmg":
      case "physicalDmgBonus":
      case "heatDmgBonus":
      case "electricDmgBonus":
      case "cryoDmgBonus":
      case "natureDmgBonus":
      case "incDMGTaken":
        context.incDMGTakenEffects.push(buff.value);
        break;
      case "multiplicative":
        context.multiplicativeBonuses.push(buff.value);
        break;
      case "susceptibility":
        context.susceptibilityEffects.push(buff.value);
        break;
      case "weaken":
        context.weakenEffects.push(buff.value);
        break;
    }
  }

  return context;
}

// ── Damage Application ──

function recordSkillDamage(op: OpState, skillId: string, damage: number, hits: number = 1): void {
  const sd = op.skillDamage.get(skillId);
  if (sd) {
    sd.casts += hits;
    sd.damage += damage;
  } else {
    op.skillDamage.set(skillId, { casts: hits, damage });
  }
}

function getBuffedDamageInputs(
  op: OpState,
  skillType: TraitSkillCondition | undefined,
  element: Element | undefined,
): { atk: number; stats: Stats } {
  const buffedStats = { ...op.stats };
  let atkPercent = 0;
  let allAbilityPercent = 0;
  for (const buff of op.activeBuffs) {
    if (!buffAppliesToDamage(buff, element !== "physical", skillType, element)) continue;
    if (buff.stat === "atkPercent") {
      atkPercent += buff.value;
    } else if (buff.stat === "critRate") {
      buffedStats.critRate += buff.value;
    } else if (buff.stat === "critDmg") {
      buffedStats.critDmg += buff.value;
    } else if (buff.stat === "artsIntensity") {
      buffedStats.artsIntensity += buff.value;
    } else if (buff.stat === "physicalDmgBonus") {
      buffedStats.physicalDmgBonus += buff.value;
    } else if (buff.stat === "heatDmgBonus") {
      buffedStats.heatDmgBonus += buff.value;
    } else if (buff.stat === "electricDmgBonus") {
      buffedStats.electricDmgBonus += buff.value;
    } else if (buff.stat === "cryoDmgBonus") {
      buffedStats.cryoDmgBonus += buff.value;
    } else if (buff.stat === "natureDmgBonus") {
      buffedStats.natureDmgBonus += buff.value;
    } else if (buff.stat === "allElementDmg") {
      buffedStats.heatDmgBonus += buff.value;
      buffedStats.electricDmgBonus += buff.value;
      buffedStats.cryoDmgBonus += buff.value;
      buffedStats.natureDmgBonus += buff.value;
    } else if (buff.stat === "basicDmgBonus") {
      buffedStats.basicDmgBonus += buff.value;
    } else if (buff.stat === "battleSkillDmgBonus") {
      buffedStats.battleSkillDmgBonus += buff.value;
    } else if (buff.stat === "comboSkillDmgBonus") {
      buffedStats.comboSkillDmgBonus += buff.value;
    } else if (buff.stat === "ultimateDmgBonus") {
      buffedStats.ultimateDmgBonus += buff.value;
    } else if (buff.stat === "allSkillDmgBonus") {
      buffedStats.basicDmgBonus += buff.value;
      buffedStats.battleSkillDmgBonus += buff.value;
      buffedStats.comboSkillDmgBonus += buff.value;
      buffedStats.ultimateDmgBonus += buff.value;
    } else if (buff.stat === "allAbilityPercent") {
      allAbilityPercent += buff.value;
    }
  }
  const abilityAtkDelta = applyAllAbilityPercentBuff(op, buffedStats, allAbilityPercent);
  return {
    atk: Math.floor((op.stats.atk + abilityAtkDelta) * (1 + atkPercent)),
    stats: buffedStats,
  };
}

function applyDamage(
  state: SimState,
  op: OpState,
  baseMult: number,
  skillType: "basic" | "battle" | "combo" | "ultimate",
  element: Element,
  skillId: string,
  skillName: string,
  isFinisher: boolean = false,
): { damage: number; isCrit: boolean } {
  const { atk: buffedAtk, stats: buffedOpStats } = getBuffedDamageInputs(op, skillType, element);

  // Crit roll: deterministic per-run but varies across simulation invocations.
  // Using the simulation start time as a run-level seed so re-runs differ.
  op.hitCounter++;
  let idHash = 0;
  for (let i = 0; i < op.operatorId.length; i++) {
    idHash = ((idHash << 5) - idHash) + op.operatorId.charCodeAt(i);
    idHash |= 0;
  }
  const seed = idHash * 100000 + state.runSeed + state.currentFrame * 100 + op.hitCounter;
  const roll = seededRandom(seed);
  const isCrit = roll < buffedOpStats.critRate;

  const isArts = element !== "physical";
  const context = buildDamageContext(op, state, isArts, isFinisher, element, skillType);
  const damage = calcFinalDamage(buffedAtk, baseMult, buffedOpStats, state.target, context, skillType, element, isCrit);

  op.totalDamage += damage;
  recordSkillDamage(op, skillId, damage);

  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "damage",
    operatorId: op.operatorId,
    skillId,
    skillName,
    damage,
    isCrit,
    detail: `${skillName}: ${damage} damage${isCrit ? " (CRIT)" : ""}`,
  });

  if (isCrit) fireTraitEffects(state, op, "on_crit", { skillType });

  return { damage, isCrit };
}

function getIncomingDamageMultiplier(op: OpState): number {
  let multiplier = 1;
  let protect = 0;
  for (const buff of op.activeBuffs) {
    if (buff.stat === "dmgReduction" || buff.stat === "incomingDmgReduction") {
      multiplier *= (1 - buff.value);
    } else if (buff.stat === "protect") {
      protect = Math.max(protect, buff.value);
    }
  }
  return multiplier * (1 - protect);
}

function getBuffedIncomingDef(op: OpState): number {
  let defPercent = 0;
  for (const buff of op.activeBuffs) {
    if (buff.stat === "defPercent") defPercent += buff.value;
  }
  return Math.floor(op.stats.def * (1 + defPercent));
}

function applyIncomingDamageEvent(state: SimState, op: OpState, rawAmount: number): void {
  const amount = Math.max(0, Math.floor(rawAmount * getDEFMult(getBuffedIncomingDef(op)) * getIncomingDamageMultiplier(op)));
  const shieldAbsorbed = absorbShieldDamage(op, amount);
  const hpDamage = amount - shieldAbsorbed;
  op.currentHp = Math.max(0, op.currentHp - hpDamage);

  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "incoming_damage",
    operatorId: op.operatorId,
    damage: hpDamage,
    detail: `Incoming damage: ${hpDamage} HP damage${shieldAbsorbed > 0 ? `, ${shieldAbsorbed} shield absorbed` : ""}`,
  });

  fireTraitEffects(state, op, "on_damaged");
  fireHpThresholdTraits(state, op);
}

function applyEnemyKillEvent(state: SimState, op: OpState, count: number): void {
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "enemy_kill",
    operatorId: op.operatorId,
    detail: `Enemy kill x${Math.max(1, Math.floor(count))}`,
  });
  fireTraitEffects(state, op, "on_kill");
}

// ── Skill Casting ──

function startCasting(state: SimState, op: OpState, block: TimelineBlock): void {
  // block.duration is in frames (already converted by store)
  const durationFrames = Math.max(1, block.duration);
  op.currentCasting = { block, startFrame: state.currentFrame, durationFrames, progress: 0, firedTicks: new Set() };

  // Consume link stacks when casting battle skill or ultimate
  if (block.skillId.startsWith("skill_") || block.skillId === "ultimate") {
    if (op.linkStacks > 0) {
      state.events.push({
        frame: state.currentFrame,
        time: state.currentFrame / state.fps,
        type: "buff_expire",
        operatorId: op.operatorId,
        detail: `Link x${op.linkStacks} consumed`,
      });
    }
    op.linkStacks = 0;
  }

  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "skill_start",
    operatorId: op.operatorId,
    skillId: block.skillId,
    skillName: block.label,
    detail: `${block.label} cast start (${block.duration}s)`,
  });

  // Fire trigger-based buffs for this skill type
  const triggerType = block.skillId.startsWith("skill_") ? "on_skill"
    : block.skillId === "combo" ? "on_combo"
    : block.skillId === "ultimate" ? "on_ultimate" : null;
  if (triggerType) {
    const skillType = triggerType === "on_skill" ? "battle"
      : triggerType === "on_combo" ? "combo"
      : "ultimate";
    fireSkillTraitEffects(state, op, triggerType, skillType);
  }
}

function getTraitTargetOps(
  state: SimState,
  sourceOp: OpState,
  trait: ParsedTraitEffect,
  context: TraitRuntimeContext = {},
): OpState[] {
  if (trait.target === "team") return [...state.operators.values()];
  if (trait.target === "other_allies") {
    return [...state.operators.values()].filter(op => op.operatorId !== sourceOp.operatorId);
  }
  if (trait.target === "different_element_allies") {
    return [...state.operators.values()].filter(op =>
      op.operatorId !== sourceOp.operatorId && op.operator.element !== sourceOp.operator.element
    );
  }
  if (trait.target === "controlled") {
    const controlledOp = state.controlledOperatorId ? state.operators.get(state.controlledOperatorId) : undefined;
    return controlledOp ? [controlledOp] : [sourceOp];
  }
  if (trait.target === "affected_ally") {
    const affectedOp = context.affectedAllyId ? state.operators.get(context.affectedAllyId) : undefined;
    return affectedOp ? [affectedOp] : [sourceOp];
  }
  if (trait.target === "trigger_actor") {
    const triggerOp = context.triggerOperatorId ? state.operators.get(context.triggerOperatorId) : undefined;
    return triggerOp ? [triggerOp] : [sourceOp];
  }
  return [sourceOp];
}

function removeTraitBuffFromAllTargets(state: SimState, buffId: string): void {
  for (const [, targetOp] of state.operators) {
    targetOp.activeBuffs = targetOp.activeBuffs.filter(b => b.id !== buffId);
  }
}

function traitKey(trait: ParsedTraitEffect): string {
  return [
    trait.name,
    trait.kind,
    trait.trigger,
    trait.target,
    trait.stat ?? "",
    trait.value ?? "",
    trait.valuePerConsumedStack ?? "",
    trait.valuePerEnemy ?? "",
    trait.maxEnemyValue ?? "",
    trait.stackGainFromConsumedStacks ? "stackGainFromConsumedStacks" : "",
    trait.flatValue ?? "",
  ].join("|");
}

function isHpThresholdTrait(trait: ParsedTraitEffect): boolean {
  return trait.trigger === "hp_above" || trait.trigger === "hp_below";
}

function traitBuffId(sourceOp: OpState, targetId: string, trait: ParsedTraitEffect, frame: number): string {
  const suffix = isHpThresholdTrait(trait) ? "hp_condition" : String(frame);
  return `${sourceOp.operatorId}_${targetId}_${traitKey(trait)}_${suffix}`;
}

function traitBuffDuration(trait: ParsedTraitEffect): number {
  return isHpThresholdTrait(trait) ? 999999 : (trait.duration ?? 15);
}

function removeHpThresholdTraitEffects(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  if (!isHpThresholdTrait(trait)) return;
  if (trait.target === "enemy") {
    const id = traitBuffId(op, "enemy", trait, state.currentFrame);
    state.targetBuffs = state.targetBuffs.filter(b => b.id !== id);
    return;
  }

  for (const targetOp of getTraitTargetOps(state, op, trait, context)) {
    const id = traitBuffId(op, targetOp.operatorId, trait, state.currentFrame);
    targetOp.activeBuffs = targetOp.activeBuffs.filter(b => b.id !== id);
    refreshShieldHp(targetOp);
  }
}

function beginTraitActivation(op: OpState, trait: ParsedTraitEffect): boolean {
  const key = traitKey(trait);
  if (trait.oncePerBattle && op.usedOnceTraits.has(key)) return false;
  if ((op.traitCooldowns.get(key) ?? 0) > 0) return false;

  if (trait.oncePerBattle) op.usedOnceTraits.add(key);
  if (trait.cooldown && trait.cooldown > 0) op.traitCooldowns.set(key, trait.cooldown);
  return true;
}

function statDisplay(stat: string): string {
  return stat === "physicalDmgBonus" ? "phys DMG"
    : stat === "heatDmgBonus" ? "heat DMG"
    : stat === "electricDmgBonus" ? "electric DMG"
    : stat === "cryoDmgBonus" ? "cryo DMG"
    : stat === "natureDmgBonus" ? "nature DMG"
    : stat === "allElementDmg" ? "arts DMG"
    : stat === "correspondingElementDmg" ? "corresponding DMG"
    : stat === "atkPercent" ? "ATK"
    : stat === "critRate" ? "crit rate"
    : stat === "artsIntensity" ? "arts intensity"
    : stat === "defPercent" ? "DEF"
    : stat === "allAbilityPercent" ? "all ability"
    : stat === "staggerPercent" ? "stagger"
    : stat;
}

function statusDamageStat(statusType: string): string | undefined {
  const element = elementForStatusDamage(statusType);
  if (element === "physical") return "physicalDmgBonus";
  if (element === "heat") return "heatDmgBonus";
  if (element === "electric") return "electricDmgBonus";
  if (element === "cryo") return "cryoDmgBonus";
  if (element === "nature") return "natureDmgBonus";
  return undefined;
}

function resolveTraitStat(trait: ParsedTraitEffect, context: TraitRuntimeContext): string | undefined {
  if (trait.stat !== "correspondingElementDmg") return trait.stat;
  const statusType = context.consumedStatusTypes?.[0] ?? context.statusType;
  return statusType ? statusDamageStat(statusType) : undefined;
}

function resolveTraitValue(state: SimState, trait: ParsedTraitEffect, context: TraitRuntimeContext): number | undefined {
  if (trait.value === undefined) return undefined;
  const consumedStackValue = (trait.valuePerConsumedStack ?? 0) * (context.consumedStatusStacks ?? 1);
  const enemyCountValue = Math.min(
    (trait.valuePerEnemy ?? 0) * (state.target.enemyCount ?? 1),
    trait.maxEnemyValue ?? Number.POSITIVE_INFINITY,
  );
  return trait.value + consumedStackValue + enemyCountValue;
}

function resolveTraitFlatValue(op: OpState, trait: ParsedTraitEffect): number {
  const base = trait.flatValue ?? 0;
  if (trait.flatValueStat === "will") return base + (op.stats.will ?? 0) * (trait.flatValueStatMultiplier ?? 0);
  return base;
}

function isTraitTarget(target: ParsedTraitEffect["target"]): target is TraitTarget {
  return target === "self" || target === "team" || target === "other_allies";
}

function applyTraitStatBuff(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  if (!trait.stat || trait.value === undefined) return;

  const stat = resolveTraitStat(trait, context);
  if (!stat) return;
  const value = resolveTraitValue(state, trait, context);
  if (value === undefined) return;
  const duration = traitBuffDuration(trait);
  const maxStacks = trait.maxStacks;
  const targetOps = trait.target === "enemy" ? [] : getTraitTargetOps(state, op, trait, context);
  const buffTarget = trait.target === "enemy" ? "enemy" : "self";

  if (trait.target === "enemy") {
    addTargetBuff(state, {
      id: traitBuffId(op, "enemy", trait, state.currentFrame),
      name: trait.name,
      source: op.operatorId,
      target: "enemy",
      stat,
      value,
      remaining: duration,
      maxDuration: duration,
      skillTypes: trait.affectedSkillConditions,
      consumeOnSkillEnd: trait.consumeOnSkillEnd,
    });
    return;
  }

  if (!isTraitTarget(trait.target)
    && trait.target !== "controlled"
    && trait.target !== "affected_ally"
    && trait.target !== "different_element_allies"
    && trait.target !== "trigger_actor") return;

  if (maxStacks && maxStacks > 0) {
    const se = op.stackEffects.get(trait.name);
    if (se) {
      if (se.burstActive) return;
      const gainsConsumedStacks = trait.stackGainFromConsumedStacks === true || /相同层数/.test(trait.sourceText);
      const matchedConsumedStackValue = trait.statusConditions
        ?.map(statusType => context.consumedStatusStacksByType?.[statusType])
        .find((stacks): stacks is number => typeof stacks === "number");
      const stackGain = gainsConsumedStacks
        ? Math.max(1, matchedConsumedStackValue ?? context.consumedStatusStacks ?? 1)
        : 1;
      se.stacks = Math.min(se.stacks + stackGain, se.maxStacks);
      const stackBuffId = `${op.operatorId}_${trait.name}_stack`;
      const totalVal = value * se.stacks;
      for (const targetOp of targetOps) {
        const existingStack = targetOp.activeBuffs.find(b => b.id === stackBuffId);
        if (existingStack) {
          existingStack.name = `${trait.name} x${se.stacks} (+${(totalVal * 100).toFixed(1)}% ${statDisplay(stat)})`;
          existingStack.value = totalVal;
          existingStack.stat = stat;
          existingStack.remaining = se.refreshOnStack ? se.buffDuration : existingStack.remaining;
          existingStack.maxDuration = se.refreshOnStack ? se.buffDuration : existingStack.maxDuration;
          existingStack.skillTypes = trait.affectedSkillConditions;
          existingStack.consumeOnSkillEnd = trait.consumeOnSkillEnd;
          existingStack.stackKey = trait.name;
        } else {
          addBuff(state, targetOp, {
            id: stackBuffId,
            name: `${trait.name} x${se.stacks} (+${(totalVal * 100).toFixed(1)}% ${statDisplay(stat)})`,
            source: op.operatorId,
            target: "self",
            stat,
            value: totalVal,
            remaining: se.refreshOnStack ? se.buffDuration : 9999,
            maxDuration: se.refreshOnStack ? se.buffDuration : 100,
            skillTypes: trait.affectedSkillConditions,
            consumeOnSkillEnd: trait.consumeOnSkillEnd,
            stackKey: trait.name,
          });
        }
      }
      if (se.stacks >= se.maxStacks) {
        fireTraitEffects(state, op, "on_stack_cap");
      }
    }
    return;
  }

  for (const targetOp of targetOps) {
    addBuff(state, targetOp, {
      id: traitBuffId(op, targetOp.operatorId, trait, state.currentFrame),
      name: trait.name,
      source: op.operatorId,
      target: buffTarget,
      stat,
      value,
      remaining: duration,
      maxDuration: duration,
      skillTypes: trait.affectedSkillConditions,
      consumeOnSkillEnd: trait.consumeOnSkillEnd,
    });
  }
}

function applyTraitExtraDamage(state: SimState, op: OpState, trait: ParsedTraitEffect): void {
  if (!trait.value) return;
  const element = trait.element && trait.element !== "arts" ? trait.element : op.operator.element;
  const context = buildDamageContext(op, state, element !== "physical", false, element);
  const { atk, stats } = getBuffedDamageInputs(op, undefined, element);
  const damage = calcFinalDamage(atk, trait.value, stats, state.target, context, "battle", element, false);
  op.totalDamage += damage;
  recordSkillDamage(op, "trait", damage);
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "damage",
    operatorId: op.operatorId,
    skillId: "trait",
    skillName: trait.name,
    damage,
    detail: `${trait.name}: ${damage} extra damage`,
  });
}

function applyTraitResource(state: SimState, trait: ParsedTraitEffect): void {
  if (trait.stat === "skillPoint" && trait.flatValue) {
    gainPartySP(state, trait.flatValue / 100);
  }
}

function applyTraitStagger(state: SimState, op: OpState, trait: ParsedTraitEffect): void {
  if (trait.flatValue) {
    applyStagger(state, trait.flatValue, op);
  } else if (trait.stat === "staggerPercent" && trait.value !== undefined) {
    addBuff(state, op, {
      id: `${op.operatorId}_${trait.name}_${state.currentFrame}`,
      name: trait.name,
      source: op.operatorId,
      target: "self",
      stat: "staggerPercent",
      value: trait.value,
      remaining: trait.duration || 9999,
      maxDuration: trait.duration || 100,
    });
  }
}

function getHealingBonus(op: OpState): number {
  let bonus = op.stats.treatmentBonus;
  for (const buff of op.activeBuffs) {
    if (buff.stat === "healingBonus") bonus += buff.value;
  }
  return bonus;
}

function applyTraitHeal(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  const amount = Math.floor(resolveTraitFlatValue(op, trait) * (1 + getHealingBonus(op)));
  if (amount <= 0) return;

  for (const targetOp of getTraitTargetOps(state, op, trait, context)) {
    const missingHp = Math.max(0, targetOp.stats.hp - targetOp.currentHp);
    const healOverflow = amount > missingHp;
    targetOp.currentHp = Math.min(targetOp.stats.hp, targetOp.currentHp + amount);
    state.events.push({
      frame: state.currentFrame,
      time: state.currentFrame / state.fps,
      type: "buff_apply",
      operatorId: targetOp.operatorId,
      detail: `${trait.name}: healed ${amount} HP`,
    });
    fireHpThresholdTraits(state, targetOp);
    fireTraitEffects(state, op, "on_heal", { affectedAllyId: targetOp.operatorId, healOverflow });
  }
}

function applyTraitShield(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  for (const targetOp of getTraitTargetOps(state, op, trait, context)) {
    const amount = Math.floor((trait.value ?? 0) * op.stats.hp);
    const duration = traitBuffDuration(trait);
    targetOp.shieldHp = Math.max(targetOp.shieldHp, amount);
    addBuff(state, targetOp, {
      id: traitBuffId(op, targetOp.operatorId, trait, state.currentFrame),
      name: trait.name,
      source: op.operatorId,
      target: "self",
      stat: "shield",
      value: amount,
      remaining: duration,
      maxDuration: duration,
    });
  }
}

function applyTraitDamageReduction(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  if (trait.value === undefined) return;
  const duration = traitBuffDuration(trait);
  for (const targetOp of getTraitTargetOps(state, op, trait, context)) {
    addBuff(state, targetOp, {
      id: traitBuffId(op, targetOp.operatorId, trait, state.currentFrame),
      name: trait.name,
      source: op.operatorId,
      target: "self",
      stat: "dmgReduction",
      value: trait.value,
      remaining: duration,
      maxDuration: duration,
    });
  }
}

function applyTraitProtection(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  if (trait.value === undefined) return;
  const duration = traitBuffDuration(trait);
  for (const targetOp of getTraitTargetOps(state, op, trait, context)) {
    addBuff(state, targetOp, {
      id: traitBuffId(op, targetOp.operatorId, trait, state.currentFrame),
      name: trait.name,
      source: op.operatorId,
      target: "self",
      stat: "protect",
      value: trait.value,
      remaining: duration,
      maxDuration: duration,
    });
  }
}

function applyTraitEffect(state: SimState, op: OpState, trait: ParsedTraitEffect, context: TraitRuntimeContext): void {
  if (!beginTraitActivation(op, trait)) return;
  switch (trait.kind) {
    case "stat_buff":
      applyTraitStatBuff(state, op, trait, context);
      break;
    case "extra_damage":
      applyTraitExtraDamage(state, op, trait);
      break;
    case "resource":
      applyTraitResource(state, trait);
      break;
    case "stagger_bonus":
      applyTraitStagger(state, op, trait);
      break;
    case "heal":
      applyTraitHeal(state, op, trait, context);
      break;
    case "shield":
      applyTraitShield(state, op, trait, context);
      break;
    case "damage_reduction":
      applyTraitDamageReduction(state, op, trait, context);
      break;
    case "protection":
      applyTraitProtection(state, op, trait, context);
      break;
  }
}

function traitMatchesTrigger(trait: ParsedTraitEffect, trigger: ParsedTraitTrigger): boolean {
  return trait.trigger === trigger || trait.triggers?.includes(trigger) === true;
}

function traitMatchesSkillCondition(trait: ParsedTraitEffect, context: TraitRuntimeContext): boolean {
  if (!trait.skillConditions || trait.skillConditions.length === 0) return true;
  return context.skillType ? trait.skillConditions.includes(context.skillType) : false;
}

function traitMatchesStatusCondition(state: SimState, trait: ParsedTraitEffect, context: TraitRuntimeContext): boolean {
  if (!trait.statusConditions || trait.statusConditions.length === 0) return true;

  const statusMatches = (statusType: string): boolean => trait.statusConditions?.includes(statusType) === true;
  const hasEnoughStacks = (statusType: string): boolean => {
    if (trait.statusMinStacks === undefined) return true;
    return (state.targetStatuses.get(statusType)?.stacks ?? 0) >= trait.statusMinStacks;
  };
  if (trait.statusConditionMode === "present") {
    return [...state.targetStatuses.keys()].some(statusType => statusMatches(statusType) && hasEnoughStacks(statusType));
  }
  if (trait.statusConditionMode === "consume") {
    return (context.consumedStatusTypes ?? []).some(statusMatches);
  }
  return context.statusType ? statusMatches(context.statusType) && hasEnoughStacks(context.statusType) : false;
}

function traitMatchesHpCondition(trait: ParsedTraitEffect, context: TraitRuntimeContext): boolean {
  if (trait.trigger !== "hp_above" && trait.trigger !== "hp_below") return true;
  if (trait.conditionValue === undefined) return true;
  if (context.hpRatio === undefined) return false;
  return trait.trigger === "hp_above"
    ? context.hpRatio > trait.conditionValue
    : context.hpRatio < trait.conditionValue;
}

function traitMatchesHealOverflowCondition(trait: ParsedTraitEffect, context: TraitRuntimeContext): boolean {
  if (!trait.healOverflowCondition) return true;
  if (context.healOverflow === undefined) return false;
  return trait.healOverflowCondition === "required" ? context.healOverflow : !context.healOverflow;
}

function traitMatchesContext(state: SimState, trait: ParsedTraitEffect, context: TraitRuntimeContext): boolean {
  return traitMatchesSkillCondition(trait, context)
    && traitMatchesStatusCondition(state, trait, context)
    && traitMatchesHpCondition(trait, context)
    && traitMatchesHealOverflowCondition(trait, context);
}

function fireTraitEffects(
  state: SimState,
  op: OpState,
  trigger: ParsedTraitTrigger,
  context: TraitRuntimeContext = {},
  options: { teamOnly?: boolean } = {},
): void {
  for (const trait of op.traitEffects) {
    if (options.teamOnly && trait.triggerSource !== "team") continue;
    if (!options.teamOnly && trait.triggerSource === "team") continue;
    if (traitMatchesTrigger(trait, trigger) && traitMatchesContext(state, trait, context)) {
      applyTraitEffect(state, op, trait, context);
    }
  }
}

function fireSkillTraitEffects(
  state: SimState,
  caster: OpState,
  trigger: ParsedTraitTrigger,
  skillType: TraitSkillCondition,
): void {
  const context = { skillType, triggerOperatorId: caster.operatorId };
  fireTraitEffects(state, caster, trigger, context);
  for (const [, op] of state.operators) {
    fireTraitEffects(state, op, trigger, context, { teamOnly: true });
  }
}

function fireHpThresholdTraits(state: SimState, op: OpState): void {
  const hpRatio = op.stats.hp > 0 ? op.currentHp / op.stats.hp : 0;
  for (const trait of op.traitEffects) {
    if (trait.trigger !== "hp_above" && trait.trigger !== "hp_below") continue;
    const key = traitKey(trait);
    const active = op.hpConditionStates.has(key);
    const matches = traitMatchesContext(state, trait, { hpRatio });
    if (matches && !active) {
      op.hpConditionStates.add(key);
      applyTraitEffect(state, op, trait, { hpRatio });
    } else if (!matches && active) {
      op.hpConditionStates.delete(key);
      removeHpThresholdTraitEffects(state, op, trait, { hpRatio });
    }
  }
}

// ── Process damage ticks during casting ──

function processDamageTicks(state: SimState, op: OpState): void {
  if (!op.currentCasting) return;
  const { block, progress } = op.currentCasting;
  const elapsed = progress / state.fps; // seconds elapsed

  const rankIdx = getRankIndex(op, block.skillId);
  const element: Element = op.operator.element;

  // Get the skill/attack data to find damage ticks
  let damageTicks: Array<{ offset: number; stagger: number; sp: number; boundEffects?: string[]; multiplier?: number }> = [];
  let skillType: "basic" | "battle" | "combo" | "ultimate" = "battle";
  let baseMults: number[] = [];

  if (block.skillId === "basic") {
    skillType = "basic";
    // During ultimate, use enhanced multipliers if available
    const enhanced = op.ultimateActive ? op.operator.ultimate?.ultEnhancedMultipliers : undefined;
    let cumulativeTime = 0;
    for (let si = 0; si < op.operator.attackSegments.length; si++) {
      const seg = op.operator.attackSegments[si];
      const segMult = enhanced?.[si] ?? seg.multipliers;
      for (const tick of (seg.damageTicks || [])) {
        damageTicks.push({
          ...tick,
          offset: tick.offset + cumulativeTime,
          multiplier: tick.multiplier ?? segMult?.[rankIdx],
        });
      }
      cumulativeTime += seg.duration;
    }
    baseMults = op.operator.attackSegments[0]?.multipliers ?? [];
  } else if (block.skillId.startsWith("skill_")) {
    skillType = "battle";
    const skill = op.operator.skills.find(s => s.id === block.skillId);
    damageTicks = skill?.damageTicks ?? [{ offset: skill?.duration ?? 1.5, stagger: 10, sp: 10, boundEffects: [] }];
    baseMults = skill?.multipliers ?? [];
  } else if (block.skillId === "combo") {
    skillType = "combo";
    damageTicks = op.operator.linkSkill?.damageTicks ?? [{ offset: op.operator.linkSkill?.duration ?? 1, stagger: 10, sp: 10, boundEffects: [] }];
    baseMults = op.operator.linkSkill?.multipliers ?? [];
  } else if (block.skillId === "ultimate") {
    skillType = "ultimate";
    damageTicks = op.operator.ultimate?.damageTicks ?? [{ offset: op.operator.ultimate?.duration ?? 2.5, stagger: 20, sp: 0, boundEffects: [] }];
    baseMults = op.operator.ultimate?.multipliers ?? [];
  }

  const baseMult = baseMults[rankIdx] ?? 1;

  // Fire each tick at its appointed offset
  for (let i = 0; i < damageTicks.length; i++) {
    if (op.currentCasting.firedTicks.has(i)) continue;
    const tick = damageTicks[i];
    if (elapsed >= tick.offset) {
      op.currentCasting.firedTicks.add(i);
      const tickMult = tick.multiplier ?? baseMult;
      applyDamage(state, op, tickMult, skillType, element, block.skillId,
        `${block.label} hit ${i + 1}`);
      if (tick.stagger) applyStagger(state, tick.stagger, op);
      if (tick.sp) {
        gainPartySP(state, tick.sp * 0.1); // scale tick SP to party SP bars
        gainEnergy(op, tick.sp * 0.5, state, skillType);
      }
      // Apply bound effects
      for (const effect of tick.boundEffects || []) {
        if (effect) applyStatus(state, effect, 1, 5, op.operatorId, skillType);
      }
    }
  }
}

function finishCasting(state: SimState, op: OpState): void {
  if (!op.currentCasting) return;
  const { block } = op.currentCasting;

  const rankIdx = getRankIndex(op, block.skillId);
  const element: Element = op.operator.element;
  const finishedSkillType = skillTypeFromSkillId(block.skillId);

  if (block.skillId === "basic") {
    // Fire any remaining ticks
    processDamageTicks(state, op);

    // Final Strike: last hit of basic attack restores SP
    gainPartySP(state, 0.5);

    // Trigger combo skills that activate on heavy hit
    tryAutoTriggerCombo(state, op.operatorId);
    fireTraitEffects(state, op, "on_heavy_hit", { skillType: "basic" });

    // Finisher: only first basic attack on newly staggered target
    if (state.targetStaggered && state.targetStaggerTimer <= 0.1) {
      const finisherMult = op.operator.finisherMultipliers?.[rankIdx]
        ?? op.operator.attackSegments[0]?.multipliers?.[rankIdx]
        ?? 1;
      applyDamage(state, op, finisherMult, "basic", element, block.skillId, "Finisher", true);
      // Trigger combo skills that need heavy/finisher + status
      tryAutoTriggerCombo(state, op.operatorId);
    }
  } else if (block.skillId === "combo") {
    const baseCd = op.operator.linkSkill?.cooldown ?? 20;
    const cdr = op.stats.comboSkillCdReduction;
    const effectiveCd = baseCd * (1 - cdr);
    op.activeCooldowns.set("combo", effectiveCd);
    op.comboSkillReady = false;
    // Build link stacks (diminishing returns: stack 1=30%, 2=45%, 3=60%, 4=75%)
    op.linkStacks = Math.min(op.linkStacks + 1, 4);
  } else if (block.skillId === "ultimate") {
    op.currentEnergy = 0;
    const enhancementTime = op.operator.ultimate?.enhancementTime ?? 0;
    if (enhancementTime > 0) {
      op.ultimateActive = true;
      op.ultimateRemaining = enhancementTime;
    }
  }

  // Apply anomalies from the skill
  const skill = block.skillId.startsWith("skill_")
    ? op.operator.skills.find(s => s.id === block.skillId)
    : block.skillId === "ultimate" ? op.operator.ultimate
    : block.skillId === "combo" ? op.operator.linkSkill
    : null;
  if (skill && "anomalies" in skill && skill.anomalies) {
    for (const anomaly of skill.anomalies) {
      applyStatus(state, anomaly.type, anomaly.stacks, anomaly.duration, op.operatorId, finishedSkillType);
    }
  }

  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "skill_end",
    operatorId: op.operatorId,
    skillId: block.skillId,
    skillName: block.label,
  });

  consumeSkillEndBuffs(state, op, finishedSkillType);
  op.currentCasting = null;
}

// ── Status Effects ──

function applyStatus(
  state: SimState,
  type: string,
  stacks: number,
  duration: number,
  sourceOpId?: string,
  sourceSkillType?: TraitSkillCondition,
): void {
  const srcId = sourceOpId || "";
  const existing = state.targetStatuses.get(type);
  if (existing) {
    existing.stacks = Math.min(existing.stacks + stacks, 10);
    existing.remaining = Math.max(existing.remaining, duration);
    existing.sourceOpId = srcId || existing.sourceOpId;
    existing.sourceSkillType = sourceSkillType ?? existing.sourceSkillType;
  } else {
    state.targetStatuses.set(type, { stacks, remaining: duration, sourceOpId: srcId, sourceSkillType });
  }
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "status_apply",
    operatorId: sourceOpId || "",
    detail: `${type} x${stacks} applied (${duration}s)`,
  });

  // Fire on_apply_status buffs for the operator who applied the status
  if (sourceOpId) {
    const srcOp = state.operators.get(sourceOpId);
    if (srcOp) {
      const statusStacks = state.targetStatuses.get(type)?.stacks ?? stacks;
      fireTraitEffects(state, srcOp, "on_apply_status", { statusType: type, statusStacks, skillType: sourceSkillType });
    }
  }

  // Check for elemental reaction: two different statuses → Arts Reaction
  if (state.targetStatuses.size >= 2) {
    const statusTypes = [...state.targetStatuses.keys()];
    // Find two different elemental statuses
    const elementalStatuses = statusTypes.filter(s =>
      ['combustion','electrification','solidification','corrosion','燃烧','导电','冻结','腐蚀'].includes(s)
    );
    if (elementalStatuses.length >= 2) {
      // Trigger Arts Reaction — attribute to the operator who applied the newest status
      const newestStatus = elementalStatuses[elementalStatuses.length - 1];
      const newestSrcId = state.targetStatuses.get(newestStatus)?.sourceOpId;
      const reactionSkillType = state.targetStatuses.get(newestStatus)?.sourceSkillType ?? sourceSkillType;
      const reactionOp = newestSrcId ? state.operators.get(newestSrcId) : state.operators.values().next().value;
      if (reactionOp) {
        const totalStacks = elementalStatuses.reduce((sum, s) => sum + (state.targetStatuses.get(s)?.stacks || 1), 0);
        const { atk, stats } = getBuffedDamageInputs(reactionOp, reactionSkillType, undefined);
        const reactionDmg = calcStatusDamage(
          atk, 'artsReaction', totalStacks,
          reactionOp.level, stats.artsIntensity,
          (totalStacks - 1) * 0.8
        );
        const damage = Math.floor(reactionDmg);
        reactionOp.totalDamage += damage;
        recordSkillDamage(reactionOp, "reaction", damage);
        state.events.push({
          frame: state.currentFrame,
          time: state.currentFrame / state.fps,
          type: 'damage',
          operatorId: reactionOp.operatorId,
          skillId: 'reaction',
          skillName: 'Arts Reaction',
          damage,
          detail: `Arts Reaction (${elementalStatuses.join('+')}): ${damage} damage`,
        });
        // Consume the oldest status
        const consumedStatusStacksByType = Object.fromEntries(
          elementalStatuses.map(statusType => [statusType, state.targetStatuses.get(statusType)?.stacks ?? 1]),
        );
        const consumedStatus = elementalStatuses[0];
        const consumedStatusStacks = state.targetStatuses.get(consumedStatus)?.stacks ?? 1;
        state.targetStatuses.delete(consumedStatus);
        fireTraitEffects(state, reactionOp, "on_apply_status", {
          statusType: "artsReaction",
          consumedStatusTypes: [consumedStatus],
          consumedStatusStacks,
          consumedStatusStacksByType,
          skillType: reactionSkillType,
        });
      }
    }
  }

  // Auto-trigger combo skills based on parsed trigger conditions
  if (sourceOpId) {
    tryAutoTriggerCombo(state, sourceOpId, type);
  }
}

// Check combo trigger conditions and auto-cast if met
function tryAutoTriggerCombo(state: SimState, sourceOpId: string, appliedStatus?: string): void {
  for (const [, op] of state.operators) {
    if (op.operatorId === sourceOpId) continue;
    if (op.currentCasting) continue;
    if (!op.comboSkillReady || op.activeCooldowns.has("combo")) continue;

    const trigger = op.operator.linkSkill?.comboTrigger;
    if (!trigger) continue;

    let shouldTrigger = false;

    switch (trigger.type) {
      case "on_status_applied":
        // Trigger when any of the required statuses are applied
        if (appliedStatus && trigger.statusTypes) {
          shouldTrigger = trigger.statusTypes.some(s =>
            appliedStatus === s || appliedStatus.includes(s) || s.includes(appliedStatus)
          );
        }
        break;
      case "on_dual_status":
        // Trigger when both required statuses are present on target
        if (trigger.statusTypes && trigger.requireBoth) {
          const activeStatuses = [...state.targetStatuses.keys()];
          const required = trigger.statusTypes.map(s =>
            s === 'elemental' ? ['combustion','electrification','solidification','corrosion','燃烧','导电','冻结','腐蚀'] : [s]
          );
          shouldTrigger = required.every(types =>
            activeStatuses.some(as => types.some(t => as === t || as.includes(t) || t.includes(as)))
          );
        }
        break;
      case "on_heavy_hit":
        // Already checked by caller (basic attack completion)
        shouldTrigger = true;
        break;
      case "on_status_hit":
        // Heavy/finisher hit on enemy with specific status
        if (appliedStatus && trigger.statusTypes) {
          const activeStatuses = [...state.targetStatuses.keys()];
          shouldTrigger = trigger.statusTypes.some(s =>
            activeStatuses.some(as => as === s || as.includes(s) || s.includes(as))
          );
        }
        break;
      case "on_finisher_hit":
        shouldTrigger = state.targetStaggered;
        break;
    }

    if (shouldTrigger) {
      const comboBlock: TimelineBlock = {
        id: `auto_combo_${op.operatorId}_${state.currentFrame}`,
        skillId: "combo",
        operatorId: op.operatorId,
        startFrame: state.currentFrame,
        duration: Math.round((op.operator.linkSkill?.duration ?? 1) * state.fps),
        label: op.operator.linkSkill?.name ?? "Combo Skill",
      };
      startCasting(state, op, comboBlock);
    }
  }
}

function tickStatuses(state: SimState): void {
  const dt = 1 / state.fps;
  for (const [type, status] of state.targetStatuses) {
    status.remaining -= dt;
    if (status.remaining <= 0) {
      state.targetStatuses.delete(type);
    }
  }
}

function elementForStatusDamage(statusType: string): Element | undefined {
  if (statusType === "combustion") return "heat";
  if (statusType === "electrification") return "electric";
  if (statusType === "solidification") return "cryo";
  if (statusType === "corrosion") return "nature";
  if (statusType === "shatter") return "cryo";
  if (statusType === "breach" || statusType === "crush" || statusType === "lift" || statusType === "knockDown") return "physical";
  return undefined;
}

// Apply damage-over-time from status effects (Combustion, Electrification, etc.)
function tickStatusDamage(state: SimState): void {
  const dt = 1 / state.fps;
  const tickInterval = 1.0; // DoT ticks every 1 second

  for (const [type, status] of state.targetStatuses) {
    const sourceOp = state.operators.get(status.sourceOpId || "");
    if (!sourceOp) continue;

    let statusType: string | null = null;
    if (type === "combustion" || type === "燃烧") statusType = "combustion";
    if (type === "electrification" || type === "导电") statusType = "electrification";
    if (!statusType) continue;

    const { atk, stats } = getBuffedDamageInputs(sourceOp, status.sourceSkillType, elementForStatusDamage(statusType));
    const dmgPerTick = calcStatusDamage(
      atk,
      statusType,
      status.stacks,
      sourceOp.level,
      stats.artsIntensity,
      (status.stacks - 1) * (statusType === "combustion" ? 0.12 : 0.08),
    );
    const frameDmg = dmgPerTick * dt / tickInterval;
    if (frameDmg > 0) {
      sourceOp.totalDamage += frameDmg;
      recordSkillDamage(sourceOp, "status", frameDmg, 0);
      state.events.push({
        frame: state.currentFrame,
        time: state.currentFrame / state.fps,
        type: "damage",
        operatorId: sourceOp.operatorId,
        skillId: "status",
        skillName: type,
        damage: frameDmg,
        detail: `${type} DoT: ${frameDmg.toFixed(2)} damage`,
      });
    }
  }
}

// ── SP & Energy ──

function gainPartySP(state: SimState, amount: number): void {
  state.partySP = Math.min(state.partySP + amount, state.maxPartySP);
  if (amount > 0) {
    state.events.push({
      frame: state.currentFrame,
      time: state.currentFrame / state.fps,
      type: "sp_gain",
      operatorId: "",
      detail: `+${amount.toFixed(1)} Party SP (total: ${state.partySP.toFixed(1)}/${state.maxPartySP})`,
    });
  }
}

// SP regenerates ~1 bar per 15 seconds during combat
function tickPartySP(state: SimState): void {
  const dt = 1 / state.fps;
  const regenRate = 1 / 15; // 1 SP bar per 15 seconds
  gainPartySP(state, regenRate * dt);
}

function gainEnergy(op: OpState, amount: number, state: SimState, skillType?: TraitSkillCondition): void {
  const efficiency = op.stats.ultimateGainEfficiency;
  const gained = amount * efficiency;
  op.currentEnergy = Math.min(op.currentEnergy + gained, op.maxEnergy);
  if (gained > 0.01) {
    fireTraitEffects(state, op, "on_energy_recover", { skillType });
    state.events.push({
      frame: state.currentFrame,
      time: state.currentFrame / state.fps,
      type: "energy_gain",
      operatorId: op.operatorId,
      detail: `+${gained.toFixed(1)} Ultimate Energy (${Math.floor(op.currentEnergy)}/${op.maxEnergy})`,
    });
  }
}

// ── Stagger ──

function applyStagger(state: SimState, amount: number, sourceOp?: OpState): void {
  let adjustedAmount = amount;
  if (sourceOp) {
    for (const buff of sourceOp.activeBuffs) {
      if (buff.stat === "staggerPercent") adjustedAmount *= (1 + buff.value);
      if (buff.stat === "staggerFlat") adjustedAmount += buff.value;
    }
    adjustedAmount *= (1 + sourceOp.stats.staggerEfficiencyBonus);
  }

  state.targetStagger += adjustedAmount;
  if (state.targetStagger >= state.target.staggerThreshold && !state.targetStaggered) {
    state.targetStaggered = true;
    state.targetStaggerTimer = 0;
    state.targetStagger = state.target.staggerThreshold;
    state.events.push({
      frame: state.currentFrame,
      time: state.currentFrame / state.fps,
      type: "stagger",
      operatorId: "",
      detail: "Target staggered!",
    });
    if (sourceOp) fireTraitEffects(state, sourceOp, "on_stagger_or_cc");
  }
}

function tickStagger(state: SimState): void {
  const dt = 1 / state.fps;
  if (state.targetStaggered) {
    state.targetStaggerTimer += dt;
    if (state.targetStaggerTimer >= state.target.staggerDuration) {
      state.targetStaggered = false;
      state.targetStagger = 0;
      state.targetStaggerTimer = 0;
    }
  }
}

// ── Cooldowns ──

function tickCooldowns(op: OpState, state: SimState): void {
  const dt = 1 / state.fps;
  for (const [skillId, remaining] of op.activeCooldowns) {
    const newRemaining = remaining - dt;
    if (newRemaining <= 0) {
      op.activeCooldowns.delete(skillId);
      if (skillId === "combo") {
        op.comboSkillReady = true;
        state.events.push({
          frame: state.currentFrame,
          time: state.currentFrame / state.fps,
          type: "combo_ready",
          operatorId: op.operatorId,
          detail: "Combo skill ready",
        });
      }
    } else {
      op.activeCooldowns.set(skillId, newRemaining);
    }
  }
}

function tickTraitCooldowns(op: OpState, state: SimState): void {
  const dt = 1 / state.fps;
  for (const [key, remaining] of op.traitCooldowns) {
    const newRemaining = remaining - dt;
    if (newRemaining <= 0) {
      op.traitCooldowns.delete(key);
    } else {
      op.traitCooldowns.set(key, newRemaining);
    }
  }
}

// ── Ultimate Enhancement ──

function tickUltimateState(op: OpState, state: SimState): void {
  if (!op.ultimateActive) return;
  const dt = 1 / state.fps;
  op.ultimateRemaining -= dt;
  if (op.ultimateRemaining <= 0) {
    op.ultimateActive = false;
    op.ultimateRemaining = 0;
  }
}

// ── Snapshot ──

function takeSnapshot(state: SimState): SimFrame {
  const operators: Record<string, OperatorSnapshot> = {};
  for (const [id, op] of state.operators) {
    const cooldowns: Record<string, number> = {};
    for (const [k, v] of op.activeCooldowns) {
      cooldowns[k] = Math.max(0, Math.round(v * 10) / 10);
    }
    operators[id] = {
      operatorId: id,
      currentSP: Math.floor(state.partySP),
      currentEnergy: Math.floor(op.currentEnergy),
      currentHp: Math.floor(op.currentHp),
      shieldHp: Math.floor(op.shieldHp),
      activeCooldowns: cooldowns,
      activeBuffs: [...op.activeBuffs],
      comboSkillReady: op.comboSkillReady,
      isCasting: op.currentCasting !== null,
      castingSkillId: op.currentCasting?.block.skillId ?? null,
      castingProgress: op.currentCasting ? op.currentCasting.progress / state.fps : 0,
    };
  }

  return {
    frame: state.currentFrame,
    time: Math.round(state.currentFrame / state.fps * 100) / 100,
    events: [...state.events],
    operators,
    targetStagger: state.targetStagger,
    targetStaggered: state.targetStaggered,
  };
}

// ── Talent-Based Buff Initialization ──

// Talent description patterns → mechanical effects
interface TalentEffect {
  stat: string;
  value: number;
  target: "self" | "team" | "enemy";
  condition: string; // when this effect applies (e.g. "always", "on_stagger", "on_combo")
  conditionValue?: number;
}

/**
 * Parse a talent description into mechanical buff effects.
 * Handles common patterns in CN talent text.
 */
export function parseTalentEffect(name: string, description: string): TalentEffect[] {
  const effects: TalentEffect[] = [];
  const fullText = name + " " + description;
  const lowHpMatch = fullText.match(/生命值(?:低于|不高于)\s*(\d+)\s*%/);
  const lowHpThreshold = lowHpMatch ? parseInt(lowHpMatch[1]) / 100 : 0.4;

  // Pattern: ability +N (e.g. "智识能力值提升10" → INT +10)
  const abilityMatch = fullText.match(/(力量|敏捷|智识|意志).*?提升(\d+)/);
  if (abilityMatch) {
    const abilityMap: Record<string, string> = { "力量": "strength", "敏捷": "agility", "智识": "intelligence", "意志": "will" };
    effects.push({
      stat: abilityMap[abilityMatch[1]] || "intelligence",
      value: parseInt(abilityMatch[2]),
      target: "self",
      condition: "always",
    });
  }

  // Pattern: ATK +N% (e.g. "攻击力+15%" or "攻击力+30%")
  const atkMatch = fullText.match(/攻击力\s*[+＋]\s*(\d+)\s*%/);
  if (atkMatch) {
    effects.push({
      stat: "atkPercent",
      value: parseInt(atkMatch[1]) / 100,
      target: "self",
      condition: "always",
    });
  }

  // Pattern: damage vs staggered +N% (e.g. "对失衡的敌人造成的伤害+20%")
  const staggerMatch = fullText.match(/对失衡.*?伤害\s*[+＋]\s*(\d+)\s*%/);
  if (staggerMatch) {
    effects.push({
      stat: "staggeredDmgBonus",
      value: parseInt(staggerMatch[1]) / 100,
      target: "self",
      condition: "on_stagger",
    });
  }

  // Pattern: elemental damage +N% (e.g. "灼热伤害+20%" or "造成的灼热伤害+30%")
  const elemMatch = fullText.match(/(灼热|电磁|寒冷|自然|物理)伤害\s*[+＋]\s*(\d+)\s*%/);
  if (elemMatch) {
    const elemMap: Record<string, string> = { "灼热": "heatDmgBonus", "电磁": "electricDmgBonus", "寒冷": "cryoDmgBonus", "自然": "natureDmgBonus", "物理": "physicalDmgBonus" };
    effects.push({
      stat: elemMap[elemMatch[1]] || "heatDmgBonus",
      value: parseInt(elemMatch[2]) / 100,
      target: "self",
      condition: "always",
    });
  }

  // Pattern: crit rate +N% (e.g. "暴击率+30%")
  const critMatch = fullText.match(/暴击率\s*[+＋]\s*(\d+)\s*%/);
  if (critMatch) {
    effects.push({
      stat: "critRate",
      value: parseInt(critMatch[1]) / 100,
      target: "self",
      condition: "always",
    });
  }

  // Pattern: protection/shield (e.g. "获得90%庇护" → 90% protection)
  const protectMatch = fullText.match(/获得\s*(\d+)\s*%\s*庇护/);
  if (protectMatch) {
    effects.push({
      stat: "protect",
      value: parseInt(protectMatch[1]) / 100,
      target: "self",
      condition: "low_hp",
      conditionValue: lowHpThreshold,
    });
  }

  // Pattern: HP recovery (e.g. "每秒回复5%最大生命值")
  const healMatch = fullText.match(/每秒回复\s*(\d+)\s*%\s*最大生命值/);
  if (healMatch) {
    effects.push({
      stat: "hpRegenPercent",
      value: parseInt(healMatch[1]) / 100,
      target: "self",
      condition: "low_hp",
      conditionValue: lowHpThreshold,
    });
  }

  // Pattern: ally buff (e.g. "小队内其他干员获得..." → buff for team)
  const allyMatch = fullText.match(/小队内.*?获得/);
  if (allyMatch) {
    for (const e of effects) e.target = "team";
  }

  // Pattern: Amp effect (e.g. "施加9%电磁增幅" → Amp +9%)
  const ampMatch = fullText.match(/施加\s*(\d+)\s*%\s*(电磁|灼热|寒冷|自然)增幅/);
  if (ampMatch) {
    effects.push({
      stat: "amp",
      value: parseInt(ampMatch[1]) / 100,
      target: "self",
      condition: "on_skill",
    });
  }

  // Pattern: team speed/stat buff (e.g. "友方干员获得10%加速" → team buff)
  const teamSpeedMatch = fullText.match(/友方干员获得\s*(\d+)\s*%\s*加速/);
  if (teamSpeedMatch) {
    effects.push({
      stat: "attackSpeed",
      value: parseInt(teamSpeedMatch[1]) / 100,
      target: "team",
      condition: "always",
    });
  }

  // Pattern: combo skill DMG bonus (e.g. "连携技伤害+20%" or "连携技造成的伤害+15%")
  const comboDmgMatch = fullText.match(/连携技.*?伤害\s*[+＋]\s*(\d+)\s*%/);
  if (comboDmgMatch) {
    effects.push({
      stat: "comboSkillDmgBonus",
      value: parseInt(comboDmgMatch[1]) / 100,
      target: "self",
      condition: "always",
    });
  }

  // Pattern: ultimate DMG bonus (e.g. "终结技伤害+20%")
  const ultDmgMatch = fullText.match(/终结技.*?伤害\s*[+＋]\s*(\d+)\s*%/);
  if (ultDmgMatch) {
    effects.push({
      stat: "ultimateDmgBonus",
      value: parseInt(ultDmgMatch[1]) / 100,
      target: "self",
      condition: "always",
    });
  }

  // Pattern: bonus damage on hit (e.g. "额外触发一次攻击力12%的灼热伤害")
  const bonusDmgMatch = fullText.match(/额外触发.*?攻击力\s*(\d+)\s*%\s*的\s*(灼热|电磁|寒冷|自然|物理)伤害/);
  if (bonusDmgMatch) {
    const bonusElemMap: Record<string, string> = { "灼热": "heatDmgBonus", "电磁": "electricDmgBonus", "寒冷": "cryoDmgBonus", "自然": "natureDmgBonus", "物理": "physicalDmgBonus" };
    effects.push({
      stat: bonusElemMap[bonusDmgMatch[2]] || "heatDmgBonus",
      value: parseInt(bonusDmgMatch[1]) / 100,
      target: "self",
      condition: "on_crit",
    });
  }

  // Pattern: enemy takes more DMG (e.g. "敌人受到的伤害+10%")
  const enemyDmgMatch = fullText.match(/敌人受到的.*?伤害\s*[+＋]\s*(\d+)\s*%/);
  if (enemyDmgMatch) {
    effects.push({
      stat: "incDMGTaken",
      value: parseInt(enemyDmgMatch[1]) / 100,
      target: "enemy",
      condition: "always",
    });
  }

  return effects;
}

/**
 * Initialize buffs from operator talents at simulation start.
 */
function initTalentBuffs(operator: Operator, op: OpState, state: SimState): void {
  for (const talent of operator.talents) {
    if (isBattleRelatedOperatorTalent(talent.name, talent.description)) continue;
    const effects = parseTalentEffect(talent.name, talent.description);
    for (const effect of effects) {
      op.talentEffects.push(effect);
      // Only apply "always" buffs at init; conditional ones are applied per-frame
      if (effect.condition === "always") {
        applyTalentBuff(state, op, effect, talent);
      }
    }
  }
}

function applyTalentBuff(state: SimState, op: OpState, effect: TalentEffect, talent: import('./types').Talent): void {
  const buff: BuffInstance = {
    id: `${talent.id}_${effect.stat}`,
    name: talent.name,
    source: op.operatorId,
    target: effect.target,
    stat: effect.stat,
    value: effect.value,
    remaining: 999999,
    maxDuration: 999999,
  };
  if (effect.target === "self") {
    addBuff(state, op, buff);
  } else if (effect.target === "team") {
    for (const [, otherOp] of state.operators) {
      addBuff(state, otherOp, { ...buff, target: "self" });
    }
  }
}

function removeTalentBuff(state: SimState, op: OpState, talentId: string, stat: string): void {
  const buffId = `${talentId}_${stat}`;
  op.activeBuffs = op.activeBuffs.filter(b => b.id !== buffId);
  for (const [, otherOp] of state.operators) {
    otherOp.activeBuffs = otherOp.activeBuffs.filter(b => b.id !== buffId);
  }
}

function tickHpRegen(state: SimState, op: OpState): void {
  const dt = 1 / state.fps;
  let regenPercent = 0;
  for (const buff of op.activeBuffs) {
    if (buff.stat === "hpRegenPercent") regenPercent += buff.value;
  }
  if (regenPercent <= 0 || op.currentHp >= op.stats.hp) return;
  op.currentHp = Math.min(op.stats.hp, op.currentHp + op.stats.hp * regenPercent * dt);
  fireHpThresholdTraits(state, op);
}

// Per-frame: check stack effect burst timers and clear on expire
function tickStackEffects(state: SimState, op: OpState): void {
  const dt = 1 / state.fps;
  for (const [name, se] of op.stackEffects) {
    const stackBuffId = `${op.operatorId}_${name}_stack`;
    const burstBuffId = `${op.operatorId}_${name}_burst`;
    if (se.refreshOnStack) {
      // Refresh mechanic: check if stack buff expired (not refreshed in time)
      const stackBuff = [...state.operators.values()].some(targetOp =>
        targetOp.activeBuffs.some(b => b.id === stackBuffId)
      );
      if (!stackBuff && se.stacks > 0) {
        // Buff was removed (expired via tickBuffs) — reset stacks
        se.stacks = 0;
        se.burstActive = false;
        se.burstTimer = 0;
        removeTraitBuffFromAllTargets(state, stackBuffId);
        removeTraitBuffFromAllTargets(state, burstBuffId);
      }
    }
    if (!se.burstActive) continue;
    se.burstTimer -= dt;
    if (se.burstTimer <= 0) {
      se.burstActive = false;
      se.burstTimer = 0;
      se.stacks = 0;
      removeTraitBuffFromAllTargets(state, stackBuffId);
      removeTraitBuffFromAllTargets(state, burstBuffId);
      state.events.push({
        frame: state.currentFrame,
        time: state.currentFrame / state.fps,
        type: "buff_expire",
        operatorId: op.operatorId,
        detail: `${name} expired (all stacks cleared)`,
      });
    }
  }
}

// Per-frame: check conditional talent buffs
function tickConditionalBuffs(state: SimState, op: OpState): void {
  for (const effect of op.talentEffects) {
    if (effect.condition === "always") continue;

    const hasBuff = op.activeBuffs.some(b => b.stat === effect.stat && b.value === effect.value);

    let shouldApply = false;

    switch (effect.condition) {
      case "on_stagger":
        shouldApply = state.targetStaggered;
        break;
      case "low_hp":
        shouldApply = op.stats.hp > 0 && op.currentHp / op.stats.hp < (effect.conditionValue ?? 0.4);
        break;
      case "on_combo":
        shouldApply = !op.comboSkillReady; // combo was recently used (on cooldown)
        break;
    }

    const talent = op.operator.talents.find(t =>
      parseTalentEffect(t.name, t.description).some(e => e.stat === effect.stat && e.value === effect.value)
    );

    if (shouldApply && !hasBuff) {
      if (talent) applyTalentBuff(state, op, effect, talent);
    } else if (!shouldApply && hasBuff) {
      if (talent) removeTalentBuff(state, op, talent.id, effect.stat);
    }
  }
}

// ── Main Simulation ──

interface OperatorSkillData {
  operator: Operator;
  stats: Stats;
  skillRanks: number[];
  level: number;
  traitEffects?: ParsedTraitEffect[];
  talentStage?: number;
  talentSkill1Stage?: number;
  talentSkill2Stage?: number;
}

function operatorTalentSourcesForRuntime(data: OperatorSkillData) {
  const meta = getOperatorTalentMeta(data.operator.id);
  return [
    ...data.operator.talents.map(talent => {
      const stage = meta?.attribute.name === talent.name
        ? data.talentStage
        : meta?.skill1.name === talent.name
          ? data.talentSkill1Stage
          : meta?.skill2.name === talent.name
            ? data.talentSkill2Stage
            : undefined;
      return { name: talent.name, description: talent.description, stage };
    }),
    ...(data.operator.potentialTalents ?? []).map(talent => ({
      name: talent.name,
      description: talent.description,
    })),
  ];
}

/**
 * Run a frame-by-frame simulation of the timeline.
 * @param fps Frames per second (default 60)
 */
export function runSimulation(
  tracks: TimelineTrack[],
  operatorData: Map<string, OperatorSkillData>,
  target: TargetStats = DEFAULT_TARGET,
  maxFrames?: number,
  fps: number = DEFAULT_FPS,
): SimulationResultFull {
  // Initialize state
  const state: SimState = {
    operators: new Map(),
    controlledOperatorId: tracks[0]?.operatorId,
    target: { ...target },
    targetStagger: 0,
    targetStaggered: false,
    targetStaggerTimer: 0,
    targetBuffs: [],
    targetStatuses: new Map(),
    runSeed: Date.now() & 0x7fffffff, // varies per run for different crit patterns
    partySP: 2,       // start with 2 bars
    maxPartySP: 3,
    currentFrame: 0,
    events: [],
    fps,
  };

  // Create operator states
  for (const track of tracks) {
    const data = operatorData.get(track.operatorId);
    if (!data) continue;
    state.operators.set(track.operatorId, {
      operatorId: track.operatorId,
      operator: data.operator,
      stats: data.stats,
      skillRanks: data.skillRanks,
      currentEnergy: data.operator.ultimate?.gaugeReply ?? 0,
      maxEnergy: data.operator.ultimate?.gaugeMax ?? 80,
      currentHp: data.stats.hp,
      shieldHp: 0,
      activeCooldowns: new Map(),
      activeBuffs: [],
      comboSkillReady: true,
      currentCasting: null,
      totalDamage: 0,
      skillDamage: new Map(),
      ultimateActive: false,
      ultimateRemaining: 0,
      linkStacks: 0,
      talentEffects: [],
      hitCounter: 0,
      stackEffects: new Map(),
      traitEffects: [
        ...parseOperatorTalentTraitEffects(
          operatorTalentSourcesForRuntime(data),
          data.operator.element,
        ),
        ...(data.traitEffects ?? []),
      ],
      traitCooldowns: new Map(),
      usedOnceTraits: new Set(),
      hpConditionStates: new Set(),
      level: data.level || 90,
    });
    {
      // Init stack effects for traits with maxStacks
      for (const trait of state.operators.get(track.operatorId)!.traitEffects) {
        if (trait.maxStacks && trait.maxStacks > 0) {
          state.operators.get(track.operatorId)!.stackEffects.set(trait.name, {
            stacks: 0,
            maxStacks: trait.maxStacks,
            buffDuration: trait.duration ?? 15,
            refreshOnStack: trait.refreshOnStack || false,
            burstStat: "",
            burstValue: 0,
            burstDuration: 0,
            burstTimer: 0,
            burstActive: false,
          });
        }
      }
    }
  }

  // Initialize talent-based buffs for all operators
  for (const [, op] of state.operators) {
    initTalentBuffs(op.operator, op, state);
    fireTraitEffects(state, op, "always");
    fireHpThresholdTraits(state, op);
  }

  // Build sorted queue of skill blocks
  const allBlocks: { block: TimelineBlock; operatorId: string }[] = [];
  for (const track of tracks) {
    for (const block of track.blocks) {
      allBlocks.push({ block, operatorId: track.operatorId });
    }
  }
  allBlocks.sort((a, b) => a.block.startFrame - b.block.startFrame);

  // Determine max frames
  // NOTE: block.startFrame and block.duration are BOTH in frames (store converts seconds→frames)
  let maxFrame = 0;
  for (const track of tracks) {
    for (const block of track.blocks) {
      const end = block.startFrame + block.duration;
      if (end > maxFrame) maxFrame = end;
    }
  }
  if (maxFrames) maxFrame = Math.min(maxFrame, maxFrames);
  maxFrame = Math.max(maxFrame, fps); // at least 1 second

  const frames: SimFrame[] = [];

  // ── Frame Loop ──
  for (let frame = 0; frame <= maxFrame; frame++) {
    state.currentFrame = frame;
    state.events = [];

    for (const [, op] of state.operators) {
      // 1. Process casting
      if (op.currentCasting) {
        op.currentCasting.progress++;
        // Fire damage ticks at their scheduled offsets
        processDamageTicks(state, op);
        if (op.currentCasting.progress >= op.currentCasting.durationFrames) {
          finishCasting(state, op);
        }
      }

      // 2. Check for queued skill block at this frame
      if (!op.currentCasting) {
        const queued = allBlocks.find(
          (b) => b.operatorId === op.operatorId && b.block.startFrame === frame,
        );
        if (queued) {
          if (queued.block.eventType === "incoming_damage") {
            applyIncomingDamageEvent(state, op, queued.block.eventValue ?? 1000);
          } else if (queued.block.eventType === "enemy_kill") {
            applyEnemyKillEvent(state, op, queued.block.eventValue ?? 1);
          } else {
            let canCast = true;
            if (queued.block.skillId.startsWith("skill_")) {
              // Battle skills cost 1 shared SP bar
              if (state.partySP < 1) canCast = false;
              if (canCast) state.partySP -= 1;
            } else if (queued.block.skillId === "ultimate") {
              if (op.currentEnergy < op.maxEnergy) canCast = false;
            } else if (queued.block.skillId === "combo") {
              if (!op.comboSkillReady) canCast = false;
              if (op.activeCooldowns.has("combo")) canCast = false;
            }

            if (canCast) {
              startCasting(state, op, queued.block);
            }
          }
        }
      }

      // 3. Tick cooldowns
      tickCooldowns(op, state);
      tickTraitCooldowns(op, state);

      // 4. Tick ultimate state
      tickUltimateState(op, state);

      // 5. Tick conditional talent buffs
      tickConditionalBuffs(state, op);
      tickHpRegen(state, op);

      // 5b. Tick stack effects (burst timers, clear on expire)
      tickStackEffects(state, op);
    }

    // 6. Tick buffs
    tickBuffs(state);
    tickTargetBuffs(state);

    // 7. Tick status effects on target
    tickStatuses(state);

    // 8. Tick status damage (DoT)
    tickStatusDamage(state);

    // 9. Tick stagger timer
    tickStagger(state);

    // 10. Regenerate party SP over time
    tickPartySP(state);

    // Record frame snapshot
    frames.push(takeSnapshot(state));
  }

  // ── Build Results ──
  const totalFrames = frames.length;
  const totalTime = totalFrames / fps;
  const operatorResults = [];
  let grandTotalDamage = 0;

  for (const [, op] of state.operators) {
    grandTotalDamage += op.totalDamage;
  }

  for (const [, op] of state.operators) {
    const skillBreakdown = [];
    for (const [skillId, data] of op.skillDamage) {
      const labelMap: Record<string, string> = {
        "basic": "Basic ATK", "skill_1": "Battle Skill",
        "combo": "Combo Skill", "ultimate": "Ultimate",
        "status": "Status DoT", "reaction": "Arts Reaction", "trait": "Trait",
      };
      skillBreakdown.push({
        skillId,
        skillName: labelMap[skillId] || skillId,
        casts: data.casts,
        totalDamage: data.damage,
        dps: totalTime > 0 ? data.damage / totalTime : 0,
      });
    }

    operatorResults.push({
      operatorId: op.operatorId,
      operatorName: op.operator.name,
      totalDamage: op.totalDamage,
      dps: totalTime > 0 ? op.totalDamage / totalTime : 0,
      damageShare: grandTotalDamage > 0 ? op.totalDamage / grandTotalDamage : 0,
      skillBreakdown,
    });
  }

  return {
    totalDamage: grandTotalDamage,
    totalFrames,
    dps: totalTime > 0 ? grandTotalDamage / totalTime : 0,
    operatorResults,
    frames,
  };
}

/** Compute the total number of frames in a set of timeline tracks */
export function computeTotalFrames(tracks: TimelineTrack[]): number {
  let maxFrame = 0;
  for (const track of tracks) {
    for (const block of track.blocks) {
      const end = block.startFrame + block.duration;
      if (end > maxFrame) maxFrame = end;
    }
  }
  return maxFrame;
}
