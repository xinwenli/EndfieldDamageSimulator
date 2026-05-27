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
import { calcFinalDamage, calcStatusDamage, DEFAULT_TARGET } from "./formulas";

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
}

interface SimState {
  operators: Map<string, OpState>;
  target: TargetStats;
  targetStagger: number;
  targetStaggered: boolean;
  targetStaggerTimer: number; // seconds since stagger started
  targetStatuses: Map<string, { stacks: number; remaining: number; sourceOpId: string }>;
  partySP: number;           // shared party SP (max 3 bars)
  maxPartySP: number;
  currentFrame: number;
  events: SimEvent[];
  fps: number;
  runSeed: number;           // varies per simulation invocation for crit variation
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

function tickBuffs(state: SimState): void {
  const dt = 1 / state.fps;
  for (const [, op] of state.operators) {
    op.activeBuffs = op.activeBuffs.filter((b) => {
      b.remaining -= dt;
      if (b.remaining <= 0) {
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
  }
}

function addBuff(state: SimState, op: OpState, buff: BuffInstance): void {
  op.activeBuffs.push({ ...buff });
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "buff_apply",
    operatorId: op.operatorId,
    detail: `${buff.name}: ${buff.stat} ${buff.value >= 0 ? "+" : ""}${buff.value}`,
  });
}

// ── Damage Context Builder ──

function buildDamageContext(op: OpState, state: SimState, isArts: boolean, isFinisher: boolean = false): DamageContext {
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

  return context;
}

// ── Damage Application ──

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
  const isCrit = roll < op.stats.critRate;

  const isArts = element !== "physical";
  const context = buildDamageContext(op, state, isArts, isFinisher);
  const damage = calcFinalDamage(op.stats.atk, baseMult, op.stats, state.target, context, skillType, element, isCrit);

  op.totalDamage += damage;
  const sd = op.skillDamage.get(skillId);
  if (sd) {
    sd.casts += 1;
    sd.damage += damage;
  } else {
    op.skillDamage.set(skillId, { casts: 1, damage });
  }

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

  return { damage, isCrit };
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
      if (tick.stagger) applyStagger(state, tick.stagger);
      if (tick.sp) {
        gainPartySP(state, tick.sp * 0.1); // scale tick SP to party SP bars
        gainEnergy(op, tick.sp * 0.5, state);
      }
      // Apply bound effects
      for (const effect of tick.boundEffects || []) {
        if (effect) applyStatus(state, effect, 1, 5, op.operatorId);
      }
    }
  }
}

function finishCasting(state: SimState, op: OpState): void {
  if (!op.currentCasting) return;
  const { block } = op.currentCasting;

  const rankIdx = getRankIndex(op, block.skillId);
  const element: Element = op.operator.element;

  if (block.skillId === "basic") {
    // Fire any remaining ticks
    processDamageTicks(state, op);

    // Final Strike: last hit of basic attack restores SP
    gainPartySP(state, 0.5);

    // Trigger combo skills that activate on heavy hit
    tryAutoTriggerCombo(state, op.operatorId);

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
      applyStatus(state, anomaly.type, anomaly.stacks, anomaly.duration, op.operatorId);
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

  op.currentCasting = null;
}

// ── Status Effects ──

function applyStatus(state: SimState, type: string, stacks: number, duration: number, sourceOpId?: string): void {
  const srcId = sourceOpId || "";
  const existing = state.targetStatuses.get(type);
  if (existing) {
    existing.stacks = Math.min(existing.stacks + stacks, 10);
    existing.remaining = Math.max(existing.remaining, duration);
    existing.sourceOpId = srcId || existing.sourceOpId;
  } else {
    state.targetStatuses.set(type, { stacks, remaining: duration, sourceOpId: srcId });
  }
  state.events.push({
    frame: state.currentFrame,
    time: state.currentFrame / state.fps,
    type: "status_apply",
    operatorId: sourceOpId || "",
    detail: `${type} x${stacks} applied (${duration}s)`,
  });

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
      const reactionOp = newestSrcId ? state.operators.get(newestSrcId) : state.operators.values().next().value;
      if (reactionOp) {
        const totalStacks = elementalStatuses.reduce((sum, s) => sum + (state.targetStatuses.get(s)?.stacks || 1), 0);
        const reactionDmg = calcStatusDamage(
          reactionOp.stats.atk, 'artsReaction', totalStacks,
          reactionOp.level, reactionOp.stats.artsIntensity,
          (totalStacks - 1) * 0.8
        );
        reactionOp.totalDamage += reactionDmg;
        state.events.push({
          frame: state.currentFrame,
          time: state.currentFrame / state.fps,
          type: 'damage',
          operatorId: reactionOp.operatorId,
          skillId: 'reaction',
          skillName: 'Arts Reaction',
          damage: Math.floor(reactionDmg),
          detail: `Arts Reaction (${elementalStatuses.join('+')}): ${Math.floor(reactionDmg)} damage`,
        });
        // Consume the oldest status
        state.targetStatuses.delete(elementalStatuses[0]);
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

    const dmgPerTick = calcStatusDamage(
      sourceOp.stats.atk,
      statusType,
      status.stacks,
      sourceOp.level,
      sourceOp.stats.artsIntensity,
      (status.stacks - 1) * (statusType === "combustion" ? 0.12 : 0.08),
    );
    const frameDmg = dmgPerTick * dt / tickInterval;
    if (frameDmg > 0) {
      sourceOp.totalDamage += frameDmg;
      state.events.push({
        frame: state.currentFrame,
        time: state.currentFrame / state.fps,
        type: "damage",
        operatorId: sourceOp.operatorId,
        skillId: "status",
        skillName: type,
        damage: Math.floor(frameDmg),
        detail: `${type} DoT: ${Math.floor(frameDmg)} damage`,
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

function gainEnergy(op: OpState, amount: number, state: SimState): void {
  const efficiency = op.stats.ultimateGainEfficiency;
  const gained = amount * efficiency;
  op.currentEnergy = Math.min(op.currentEnergy + gained, op.maxEnergy);
  if (gained > 0.01) {
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

function applyStagger(state: SimState, amount: number): void {
  state.targetStagger += amount;
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
}

/**
 * Parse a talent description into mechanical buff effects.
 * Handles common patterns in CN talent text.
 */
export function parseTalentEffect(name: string, description: string): TalentEffect[] {
  const effects: TalentEffect[] = [];
  const fullText = name + " " + description;

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
      stat: "comboDmgBonus",
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
        // Low HP condition: assume triggers when operator would be low (simulate with stagger state for now)
        shouldApply = false; // HP tracking not implemented
        break;
      case "on_combo":
        shouldApply = !op.comboSkillReady; // combo was recently used (on cooldown)
        break;
    }

    if (shouldApply && !hasBuff) {
      const talent = op.operator.talents.find(t =>
        parseTalentEffect(t.name, t.description).some(e => e.stat === effect.stat && e.value === effect.value)
      );
      if (talent) applyTalentBuff(state, op, effect, talent);
    } else if (!shouldApply && hasBuff) {
      removeTalentBuff(state, op, `talent_${op.operatorId}`, effect.stat);
    }
  }
}

// ── Main Simulation ──

interface OperatorSkillData {
  operator: Operator;
  stats: Stats;
  skillRanks: number[];
  level: number;
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
    target: { ...target },
    targetStagger: 0,
    targetStaggered: false,
    targetStaggerTimer: 0,
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
      level: data.level || 90,
    });
  }

  // Initialize talent-based buffs for all operators
  for (const [, op] of state.operators) {
    initTalentBuffs(op.operator, op, state);
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

      // 3. Tick cooldowns
      tickCooldowns(op, state);

      // 4. Tick ultimate state
      tickUltimateState(op, state);

      // 5. Tick conditional talent buffs
      tickConditionalBuffs(state, op);
    }

    // 6. Tick buffs
    tickBuffs(state);

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
        "combo": "Combo Skill", "ultimate": "Ultimate", "status": "Status DoT",
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
