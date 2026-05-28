import type { Element } from "./types";

export type TraitTrigger = "on_crit" | "on_skill" | "on_combo" | "on_ultimate" | "on_apply_status";
export type TraitTarget = "self" | "team" | "other_allies";
export type TraitSkillCondition = "basic" | "battle" | "combo" | "ultimate";
export type TraitStatusConditionMode = "apply" | "consume" | "present";

export type ParsedTraitTrigger =
  | TraitTrigger
  | "always"
  | "hp_above"
  | "hp_below"
  | "on_heal"
  | "on_energy_recover"
  | "on_amp_gain"
  | "on_heavy_hit"
  | "on_kill"
  | "on_damaged"
  | "on_stack_cap"
  | "on_stagger_or_cc";

export type ParsedTraitTarget = TraitTarget | "controlled" | "affected_ally" | "different_element_allies" | "trigger_actor" | "enemy";

export type ParsedTraitKind =
  | "stat_buff"
  | "extra_damage"
  | "heal"
  | "shield"
  | "resource"
  | "damage_reduction"
  | "stagger_bonus"
  | "protection";

export interface ParsedTraitEffect {
  name: string;
  kind: ParsedTraitKind;
  trigger: ParsedTraitTrigger;
  triggers?: ParsedTraitTrigger[];
  target: ParsedTraitTarget;
  sourceText: string;
  stat?: string;
  value?: number;
  valuePerConsumedStack?: number;
  valuePerEnemy?: number;
  maxEnemyValue?: number;
  flatValue?: number;
  flatValueStat?: "will";
  flatValueStatMultiplier?: number;
  duration?: number;
  maxStacks?: number;
  refreshOnStack?: boolean;
  stackGainFromConsumedStacks?: boolean;
  element?: Element | "arts";
  conditionValue?: number;
  skillConditions?: TraitSkillCondition[];
  affectedSkillConditions?: TraitSkillCondition[];
  statusConditions?: string[];
  statusConditionMode?: TraitStatusConditionMode;
  statusMinStacks?: number;
  consumeOnSkillEnd?: boolean;
  healOverflowCondition?: "required" | "absent";
  triggerSource?: "team";
  cooldown?: number;
  oncePerBattle?: boolean;
  runtimeSupported?: boolean;
}

export interface WeaponTrait {
  name: string;
  stat: string;
  value: number;
  duration: number;
  trigger: TraitTrigger;
  target: TraitTarget;
  maxStacks?: number;
  burstStat?: string;
  burstValue?: number;
  burstDuration?: number;
  refreshOnStack?: boolean;
}

const ELEMENT_STAT_BY_CN: Array<[string, string, Element]> = [
  ["物理", "physicalDmgBonus", "physical"],
  ["灼热", "heatDmgBonus", "heat"],
  ["电磁", "electricDmgBonus", "electric"],
  ["寒冷", "cryoDmgBonus", "cryo"],
  ["自然", "natureDmgBonus", "nature"],
];

const ARTS_STATUS_TYPES = ["combustion", "electrification", "solidification", "corrosion"];

const RUNTIME_TRIGGERS = new Set<ParsedTraitTrigger>([
  "on_crit",
  "on_skill",
  "on_combo",
  "on_ultimate",
  "on_apply_status",
]);

function normalizeTraitText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/；/g, "。")
    .replace(/;/g, "。")
    .trim();
}

function parsePercentAfterPlus(text: string): number | null {
  const match = text.match(/[+＋]\s*[[【]?\s*([\d.]+)\s*%/);
  return match ? parseFloat(match[1]) / 100 : null;
}

function parseConsumedStackFormula(text: string): { baseValue: number; valuePerConsumedStack?: number } | null {
  const combined = text.match(/[+＋]\s*[[【]?\s*([\d.]+)\s*%\s*[+＋]\s*([\d.]+)\s*%\s*[×xX]\s*消耗(?:消耗)?层数/);
  if (combined) {
    return {
      baseValue: parseFloat(combined[1]) / 100,
      valuePerConsumedStack: parseFloat(combined[2]) / 100,
    };
  }

  const perStackOnly = text.match(/[+＋]\s*[[【]?\s*([\d.]+)\s*%\s*[×xX]\s*消耗(?:消耗)?层数/);
  return perStackOnly ? { baseValue: 0, valuePerConsumedStack: parseFloat(perStackOnly[1]) / 100 } : null;
}

function parsePerEnemyScaling(text: string): { valuePerEnemy?: number; maxEnemyValue?: number } {
  if (!text.includes("\u6bcf\u6709\u4e00\u4e2a")) return {};
  const extra = text.match(/\u989d\u5916\s*[+＋]\s*([\d.]+)\s*%/u);
  const max = text.match(/\u6700\u591a\s*[+＋]\s*([\d.]+)\s*%/u);
  return extra && max ? {
    valuePerEnemy: parseFloat(extra[1]) / 100,
    maxEnemyValue: parseFloat(max[1]) / 100,
  } : {};
}

function parsePercentAfterMinus(text: string): number | null {
  const match = text.match(/[-－]\s*\[?\s*([\d.]+)\s*%/);
  return match ? parseFloat(match[1]) / 100 : null;
}

function parseNumberAfterLabel(text: string, label: string): number | null {
  const match = text.match(new RegExp(`${label}\\s*[+＋]\\s*([\\d.]+)(?!\\s*%)`));
  return match ? parseFloat(match[1]) : null;
}

function parseDuration(text: string, fallback: number = 15): number {
  const match = text.match(/(?:持续|在)\s*(\d+(?:\.\d+)?)\s*秒(?:内)?/);
  return match ? parseFloat(match[1]) : fallback;
}

function parseCooldown(text: string): number | undefined {
  const match = text.match(/每\s*(\d+(?:\.\d+)?)\s*秒最多触发一次/);
  return match ? parseFloat(match[1]) : undefined;
}

function parseMaxStacks(text: string): number | undefined {
  if (/无法叠加/.test(text)) return 1;
  const match = text.match(/(?:最多(?:可)?叠加|最多存在|最多叠加至)\s*(\d+)\s*层/);
  return match ? parseInt(match[1]) : undefined;
}

function parseHpThreshold(text: string): { trigger: ParsedTraitTrigger; conditionValue: number } | null {
  const high = text.match(/生命值(?:高于|大于)\s*(\d+(?:\.\d+)?)\s*%/);
  if (high) return { trigger: "hp_above", conditionValue: parseFloat(high[1]) / 100 };

  const low = text.match(/生命值(?:低于|小于)\s*(\d+(?:\.\d+)?)\s*%/);
  if (low) return { trigger: "hp_below", conditionValue: parseFloat(low[1]) / 100 };

  return null;
}

function parseRuntimeTriggers(text: string): TraitTrigger[] {
  const triggers: TraitTrigger[] = [];
  if (/暴击|触发暴击/.test(text)) return ["on_crit"];
  const skillConditions = parseSkillConditions(text) ?? [];
  if (skillConditions.includes("battle")) triggers.push("on_skill");
  if (skillConditions.includes("combo")) triggers.push("on_combo");
  if (skillConditions.includes("ultimate")) triggers.push("on_ultimate");
  return triggers;
}

function parseTraitTrigger(text: string): { trigger: ParsedTraitTrigger; triggers?: ParsedTraitTrigger[]; conditionValue?: number } {
  const hp = parseHpThreshold(text);
  if (hp) return hp;

  if (/达到\s*\d+\s*层(?:及以上)?(?:法术附着|破防)/.test(text)) return { trigger: "on_apply_status" };
  if (/治疗.*后/.test(text)) return { trigger: "on_heal" };
  if (/恢复技力|返还.*技力|获得连击状态/.test(text)) return { trigger: "on_energy_recover" };
  if (/击败敌人/.test(text)) return { trigger: "on_kill" };
  if (/受到伤害后/.test(text)) return { trigger: "on_damaged" };
  if (/获得.*增幅/.test(text)) return { trigger: "on_amp_gain" };
  if (/重击/.test(text)) return { trigger: "on_heavy_hit" };

  if (/施加|消耗|燃烧|导电|冻结|腐蚀|法术异常|物理异常|法术爆发|附着/.test(text)) {
    return { trigger: "on_apply_status" };
  }

  if (/叠加至\s*\d+\s*层|叠加到\s*\d+\s*层/.test(text)) return { trigger: "on_stack_cap" };
  if (/击飞|破防层数|破防状态|失衡/.test(text)) return { trigger: "on_stagger_or_cc" };

  const runtimeTriggers = parseRuntimeTriggers(text);
  if (runtimeTriggers.length > 0) {
    const deduped = [...new Set(runtimeTriggers)];
    return { trigger: deduped[0], triggers: deduped.length > 1 ? deduped : undefined };
  }
  return { trigger: "always" };
}

function parseSkillConditions(text: string): TraitSkillCondition[] | undefined {
  const skills: TraitSkillCondition[] = [];
  if (/(?:施放|释放|通过|自身)?普通攻击(?:命中|施加|消耗|治疗|造成.*(?:暴击|异常|爆发)|时|后)/.test(text)) skills.push("basic");
  if (/(?:施放|释放)战技|通过(?:自身)?战技|战技(?:命中|施加|消耗|治疗|造成.*(?:暴击|异常|爆发)|时|后)|战技(?:或|和)(?:连携技|终结技)(?:命中|施加|消耗|治疗|造成)/.test(text)) skills.push("battle");
  if (/(?:施放|释放)连携技|通过(?:自身)?连携技|连携技(?:命中|施加|消耗|治疗|造成.*(?:暴击|异常|爆发|击飞)|时|后)|战技(?:或|和)连携技(?:命中|施加|消耗|治疗|造成)/.test(text)) skills.push("combo");
  if (/(?:施放|释放)终结技|通过(?:自身)?终结技|终结技(?:命中|施加|消耗|治疗|造成.*(?:暴击|异常|爆发)|时|后)|战技(?:或|和)终结技(?:命中|施加|消耗|治疗|造成)/.test(text)) skills.push("ultimate");
  if (skills.length === 0 && /(?:通过|自身)?技能(?:施加|消耗|治疗|恢复|造成)|施放技能/.test(text)) skills.push("battle", "combo", "ultimate");
  return skills.length > 0 ? [...new Set(skills)] : undefined;
}

function parseStatusConditions(text: string): { statusConditions?: string[]; statusConditionMode?: TraitStatusConditionMode; statusMinStacks?: number } {
  const statuses: string[] = [];
  if (/燃烧/.test(text)) statuses.push("combustion");
  if (/导电/.test(text)) statuses.push("electrification");
  if (/冻结|寒冷附着|源石结晶/.test(text)) statuses.push("solidification");
  if (/腐蚀|自然附着/.test(text)) statuses.push("corrosion");
  if (/破防|物理异常|物理脆弱/.test(text)) statuses.push("breach");
  if (/法术异常|法术附着/.test(text)) statuses.push(...ARTS_STATUS_TYPES);
  if (/法术爆发/.test(text)) statuses.push("artsReaction");
  const minStackMatch = text.match(/达到\s*(\d+)\s*层(?:及以上)?(?:法术附着|破防)/);

  let mode: TraitStatusConditionMode | undefined;
  if (/消耗/.test(text)) mode = "consume";
  else if (/处于|场上有|每有|被施加|达到/.test(text)) mode = "present";
  else if (/施加|造成.*异常|造成法术爆发/.test(text)) mode = "apply";

  return {
    statusConditions: statuses.length > 0 ? [...new Set(statuses)] : undefined,
    statusConditionMode: mode,
    statusMinStacks: minStackMatch ? parseInt(minStackMatch[1]) : undefined,
  };
}

function parseConditionMetadata(text: string): Pick<ParsedTraitEffect, "skillConditions" | "affectedSkillConditions" | "statusConditions" | "statusConditionMode" | "statusMinStacks" | "consumeOnSkillEnd" | "triggerSource"> {
  return {
    skillConditions: parseSkillConditions(text),
    affectedSkillConditions: parseAffectedSkillConditions(text),
    consumeOnSkillEnd: /下(?:一)?次/.test(text) ? true : undefined,
    triggerSource: /小队内任意干员/.test(text) ? "team" : undefined,
    ...parseStatusConditions(text),
  };
}

function parseAffectedSkillConditions(text: string): TraitSkillCondition[] | undefined {
  const skills: TraitSkillCondition[] = [];
  if (/普通攻击[^，。；]*伤害/.test(text)) skills.push("basic");
  if (/战技[^，。；]*伤害|战技造成/.test(text)) skills.push("battle");
  if (/连携技[^，。；]*伤害|连携技造成/.test(text)) skills.push("combo");
  if (/终结技[^，。；]*伤害|终结技造成/.test(text)) skills.push("ultimate");
  if (/所有技能伤害|技能伤害/.test(text)) skills.push("battle", "combo", "ultimate");
  return skills.length > 0 ? [...new Set(skills)] : undefined;
}

function elementFromText(text: string): Element | "arts" | undefined {
  if (/法术/.test(text)) return "arts";
  for (const [label, , element] of ELEMENT_STAT_BY_CN) {
    if (text.includes(label)) return element;
  }
  return undefined;
}

function statsFromText(text: string, defaultElement: Element): string[] {
  if (/暴击率\s*[+＋]/.test(text)) return ["critRate"];
  if (/暴击伤害\s*[+＋]/.test(text)) return ["critDmg"];
  if (/防御力\s*[+＋]/.test(text)) return ["defPercent"];
  if (/全能力\s*[+＋]/.test(text)) return ["allAbilityPercent"];
  if (/攻击力?\s*(?:\[[^\]]+\]\s*)?[+＋]/.test(text)) return ["atkPercent"];
  if (/对应属性的伤害\s*[+＋]/.test(text)) return ["correspondingElementDmg"];
  if (/法术伤害(?:额外)?\s*[+＋]/.test(text)) return ["allElementDmg"];

  const stats: string[] = [];
  for (const [label, stat] of ELEMENT_STAT_BY_CN) {
    if (new RegExp(`${label}[^，。；]*伤害(?:额外)?\\s*[+＋]`).test(text)) stats.push(stat);
  }

  if (stats.length > 0) return stats;

  if (/普通攻击[^，。；]*伤害\s*[+＋]/.test(text)) return ["basicDmgBonus"];
  if (/战技[^，。；]*伤害\s*[+＋]/.test(text)) return ["battleSkillDmgBonus"];
  if (/连携技[^，。；]*伤害\s*[+＋]/.test(text)) return ["comboSkillDmgBonus"];
  if (/终结技[^，。；]*伤害\s*[+＋]/.test(text)) return ["ultimateDmgBonus"];
  if (/(?:所有技能伤害|技能伤害)\s*[+＋]/.test(text)) return ["allSkillDmgBonus"];
  if (/造成的伤害\s*[+＋]/.test(text)) return ["multiplicative"];

  switch (defaultElement) {
    case "physical": return ["physicalDmgBonus"];
    case "heat": return ["heatDmgBonus"];
    case "electric": return ["electricDmgBonus"];
    case "cryo": return ["cryoDmgBonus"];
    case "nature": return ["natureDmgBonus"];
    default: return [];
  }
}

function parseTarget(text: string): ParsedTraitTarget {
  const plusIndex = text.search(/[+＋]\s*[[【]?\s*[\d.]+/);
  const beforeBonus = plusIndex >= 0 ? text.slice(0, plusIndex) : text;
  const lastSeparator = Math.max(
    beforeBonus.lastIndexOf("，"),
    beforeBonus.lastIndexOf("。"),
    beforeBonus.lastIndexOf("；"),
    beforeBonus.lastIndexOf(";"),
  );
  const bonusClause = beforeBonus.slice(lastSeparator + 1);

  if (/小队内其他|队内其他/.test(bonusClause)) return "other_allies";
  if (/属性不同/.test(bonusClause)) return "different_element_allies";
  if (/全队|我方/.test(bonusClause)) return "team";
  if (/主控/.test(bonusClause)) return "controlled";
  if (/该干员/.test(bonusClause)) return "trigger_actor";
  if (/该目标|受到治疗/.test(bonusClause)) return "affected_ally";
  if (/敌人|目标/.test(bonusClause) && /受到/.test(bonusClause)) return "enemy";
  return "self";
}

function runtimeTarget(target: ParsedTraitTarget): TraitTarget | null {
  if (target === "self" || target === "team" || target === "other_allies") return target;
  return null;
}

function statSuffix(stat: string): string {
  switch (stat) {
    case "physicalDmgBonus": return "物理";
    case "heatDmgBonus": return "灼热";
    case "electricDmgBonus": return "电磁";
    case "cryoDmgBonus": return "寒冷";
    case "natureDmgBonus": return "自然";
    case "allElementDmg": return "法术";
    case "correspondingElementDmg": return "对应属性";
    case "atkPercent": return "攻击";
    case "critRate": return "暴击率";
    case "critDmg": return "暴击伤害";
    case "defPercent": return "防御";
    case "allAbilityPercent": return "全能力";
    case "artsIntensity": return "源石技艺强度";
    case "basicDmgBonus": return "普攻";
    case "battleSkillDmgBonus": return "战技";
    case "comboSkillDmgBonus": return "连携";
    case "ultimateDmgBonus": return "终结";
    case "allSkillDmgBonus": return "技能";
    case "healingBonus": return "治疗";
    default: return stat;
  }
}

function parseOtherAlliesBonus(text: string): number | undefined {
  const match = text.match(/小队内其他干员[^，。；]*[+＋]\s*([\d.]+)\s*%/);
  return match ? parseFloat(match[1]) / 100 : undefined;
}

function pushFlatStatBuffEffects(
  effects: ParsedTraitEffect[],
  name: string,
  text: string,
  sourceText: string,
): void {
  if (!/源石技艺强度\s*[+＋]/.test(text)) return;

  const value = parseNumberAfterLabel(text, "源石技艺强度");
  if (value === null) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  const duration = parseDuration(text);
  const maxStacks = parseMaxStacks(sourceText);
  const target = parseTarget(text);
  const refreshOnStack = /每层单独计算持续时间|无法叠加/.test(sourceText) || trigger === "on_crit";
  effects.push({
    name: `${name}:${statSuffix("artsIntensity")}`,
    kind: "stat_buff",
    stat: "artsIntensity",
    value,
    duration,
    trigger,
    triggers,
    target,
    sourceText: text,
    maxStacks,
    refreshOnStack: maxStacks ? refreshOnStack : undefined,
    conditionValue,
    cooldown: parseCooldown(sourceText),
  });
}

function pushStatBuffEffects(
  effects: ParsedTraitEffect[],
  name: string,
  text: string,
  defaultElement: Element,
  sourceText: string,
): void {
  const consumedStackFormula = parseConsumedStackFormula(text);
  const perEnemyScaling = parsePerEnemyScaling(text);
  const value = perEnemyScaling.valuePerEnemy !== undefined && text.includes("\u6bcf\u6709\u4e00\u4e2a")
    ? 0
    : consumedStackFormula?.baseValue ?? parsePercentAfterPlus(text);
  if (value === null) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  const duration = parseDuration(text);
  const maxStacks = parseMaxStacks(sourceText);
  const target = parseTarget(text);
  const refreshOnStack = /每层单独计算持续时间|无法叠加/.test(sourceText) || trigger === "on_crit";

  let stats = statsFromText(text, defaultElement);
  if (/治疗效果\s*[+＋]/.test(text)) stats = ["healingBonus"];

  for (const stat of stats) {
    const effect: ParsedTraitEffect = {
      name: `${name}:${statSuffix(stat)}`,
      kind: "stat_buff",
      stat,
      value,
      valuePerConsumedStack: consumedStackFormula?.valuePerConsumedStack,
      ...perEnemyScaling,
      duration,
      trigger,
      triggers,
      target,
      sourceText: text,
      maxStacks,
      refreshOnStack: maxStacks ? refreshOnStack : undefined,
      stackGainFromConsumedStacks: /相同层数/.test(sourceText) ? true : undefined,
      element: elementFromText(text),
      conditionValue,
      cooldown: parseCooldown(sourceText),
      runtimeSupported: RUNTIME_TRIGGERS.has(trigger) && runtimeTarget(target) !== null && stat !== "healingBonus",
    };
    effects.push(effect);
    const otherAlliesValue = parseOtherAlliesBonus(text);
    if (target === "self" && otherAlliesValue !== undefined && !/一半的效果/.test(text)) {
      effects.push({
        ...effect,
        name: `${effect.name}:其他`,
        target: "other_allies",
        value: otherAlliesValue,
      });
    }
    if (/一半的效果/.test(text) && target === "self") {
      effects.push({
        ...effect,
        name: `${effect.name}:半效`,
        target: "other_allies",
        value: effect.value !== undefined ? effect.value / 2 : undefined,
        valuePerConsumedStack: effect.valuePerConsumedStack !== undefined ? effect.valuePerConsumedStack / 2 : undefined,
        valuePerEnemy: effect.valuePerEnemy !== undefined ? effect.valuePerEnemy / 2 : undefined,
        maxEnemyValue: effect.maxEnemyValue !== undefined ? effect.maxEnemyValue / 2 : undefined,
      });
    }
  }
}

function pushExtraDamageEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  if (!/额外造成/.test(text)) return;

  const match = text.match(/额外造成.*?(?:(\d+(?:\.\d+)?)\s*%\s*(?:自身)?(?:攻击力|攻击大|攻击)|(?:自身)?(?:攻击力|攻击大|攻击)\s*(\d+(?:\.\d+)?)\s*%).*?伤害/);
  if (!match) return;

  const value = parseFloat(match[1] ?? match[2]) / 100;
  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:额外伤害`,
    kind: "extra_damage",
    trigger,
    triggers,
    target: "enemy",
    stat: "atkMultiplier",
    value,
    duration: 0,
    sourceText: text,
    element: elementFromText(text),
    conditionValue,
    cooldown: parseCooldown(text),
  });
}

function pushHealEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  const flatHeal = text.match(/回复\s*(\d+(?:\.\d+)?)\s*点生命值/);
  const formulaHeal = text.match(/回复\s*\[\s*(\d+(?:\.\d+)?)\s*[+＋][^\]]+\]\s*点生命值/);
  const formulaHealWithStat = text.match(/回复\s*\[\s*(\d+(?:\.\d+)?)\s*[+＋]\s*意志\s*[×xX]\s*([\d.]+)\s*\]\s*点生命值/);
  if (!flatHeal && !formulaHeal && !formulaHealWithStat) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:治疗`,
    kind: "heal",
    trigger,
    triggers,
    target: parseTarget(text),
    stat: (formulaHeal ?? formulaHealWithStat) ? "flatHpFormula" : "flatHp",
    flatValue: parseFloat((flatHeal ?? formulaHealWithStat ?? formulaHeal)![1]),
    flatValueStat: formulaHealWithStat ? "will" : undefined,
    flatValueStatMultiplier: formulaHealWithStat ? parseFloat(formulaHealWithStat[2]) : undefined,
    duration: 0,
    sourceText: text,
    conditionValue,
    cooldown: parseCooldown(text),
  });
}

function pushShieldEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  if (!/护盾/.test(text)) return;

  const percentShield = text.match(/([\d.]+)\s*%\s*×[^，。；]*生命值/);
  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:护盾`,
    kind: "shield",
    trigger,
    triggers,
    target: parseTarget(text),
    stat: percentShield ? "maxHpPercent" : "shield",
    value: percentShield ? parseFloat(percentShield[1]) / 100 : undefined,
    duration: parseDuration(text),
    sourceText: text,
    conditionValue,
    cooldown: parseCooldown(text),
  });
}

function pushResourceEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  const energy = text.match(/(?:返还|恢复)\s*(\d+(?:\.\d+)?)\s*点?技力/);
  if (!energy) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:技力`,
    kind: "resource",
    trigger: /释放战技/.test(text) ? "on_skill" : trigger,
    triggers: /释放战技/.test(text) ? undefined : triggers,
    target: "self",
    stat: "skillPoint",
    flatValue: parseFloat(energy[1]),
    duration: 0,
    sourceText: text,
    conditionValue,
    cooldown: parseCooldown(text),
    oncePerBattle: /每场战斗最多触发一次/.test(text),
  });
}

function isHealOverflowClause(text: string): boolean {
  return /治疗量溢出/.test(text);
}

function pushDamageReductionEffectForText(
  effects: ParsedTraitEffect[],
  name: string,
  text: string,
  options: {
    sourceText: string;
    triggerText?: string;
    targetText?: string;
    target?: ParsedTraitTarget;
    durationText?: string;
    healOverflowCondition?: "required" | "absent";
  },
): void {
  const value = parsePercentAfterMinus(text);
  if (value === null) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(options.triggerText ?? text);
  effects.push({
    name: `${name}:减伤`,
    kind: "damage_reduction",
    trigger,
    triggers,
    target: options.target ?? parseTarget(options.targetText ?? text),
    stat: "incomingDmgReduction",
    value,
    duration: parseDuration(options.durationText ?? text),
    sourceText: options.sourceText,
    conditionValue,
    healOverflowCondition: options.healOverflowCondition,
    cooldown: parseCooldown(options.sourceText),
  });
}

function pushDamageReductionEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  if (!/受到.*伤害\s*[-－]/.test(text)) return;

  const overflowIndex = text.search(/(?:如果|若).*治疗量溢出/);
  if (overflowIndex >= 0) {
    const baseText = text.slice(0, overflowIndex);
    const overflowText = text.slice(overflowIndex);
    if (/受到.*伤害\s*[-－]/.test(baseText)) {
      pushDamageReductionEffectForText(effects, name, baseText, {
        sourceText: text,
        durationText: text,
        healOverflowCondition: "absent",
      });
    }
    if (/受到.*伤害\s*[-－]/.test(overflowText)) {
      pushDamageReductionEffectForText(effects, name, overflowText, {
        sourceText: text,
        triggerText: text,
        target: "affected_ally",
        durationText: text,
        healOverflowCondition: "required",
      });
    }
    return;
  }

  pushDamageReductionEffectForText(effects, name, text, {
    sourceText: text,
  });
}

function pushStaggerEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  const percent = text.match(/失衡值\s*[+＋]\s*([\d.]+)\s*%/);
  const flat = text.match(/\[(\d+(?:\.\d+)?)\s*点失衡值\]/);
  if (!percent && !flat) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:失衡`,
    kind: "stagger_bonus",
    trigger,
    triggers,
    target: "enemy",
    stat: percent ? "staggerPercent" : "staggerFlat",
    value: percent ? parseFloat(percent[1]) / 100 : undefined,
    flatValue: flat ? parseFloat(flat[1]) : undefined,
    duration: parseDuration(text, 0),
    sourceText: text,
    conditionValue,
    cooldown: parseCooldown(text),
  });
}

function pushProtectionEffect(effects: ParsedTraitEffect[], name: string, text: string): void {
  const protect = text.match(/获得\s*([\d.]+)\s*%\s*庇护/);
  if (!protect) return;

  const { trigger, triggers, conditionValue } = parseTraitTrigger(text);
  effects.push({
    name: `${name}:庇护`,
    kind: "protection",
    trigger,
    triggers,
    target: parseTarget(text),
    stat: "protect",
    value: parseFloat(protect[1]) / 100,
    duration: parseDuration(text),
    sourceText: text,
    conditionValue,
    cooldown: parseCooldown(text),
  });
}

function pushParsedTraitEffects(
  effects: ParsedTraitEffect[],
  name: string,
  text: string,
  defaultElement: Element,
  sourceText: string,
): void {
  const start = effects.length;
  pushStatBuffEffects(effects, name, text, defaultElement, sourceText);
  pushFlatStatBuffEffects(effects, name, text, sourceText);
  pushExtraDamageEffect(effects, name, text);
  pushHealEffect(effects, name, text);
  pushShieldEffect(effects, name, text);
  pushResourceEffect(effects, name, text);
  pushDamageReductionEffect(effects, name, text);
  pushStaggerEffect(effects, name, text);
  pushProtectionEffect(effects, name, text);
  const metadata = parseConditionMetadata(text);
  for (let i = start; i < effects.length; i++) {
    Object.assign(effects[i], metadata);
  }
}

export function parseBattleTraitEffects(name: string, traitText: string, defaultElement: Element): ParsedTraitEffect[] {
  const normalized = normalizeTraitText(traitText);
  const clauses = normalized.split("。").map(part => part.trim()).filter(Boolean);
  const effects: ParsedTraitEffect[] = [];

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const next = clauses[i + 1];

    if (next && isHealOverflowClause(next)) {
      pushParsedTraitEffects(effects, name, `${clause} ${next}`, defaultElement, normalized);
      i++;
      continue;
    }

    pushParsedTraitEffects(effects, name, clause, defaultElement, normalized);

    const clauseTrigger = parseTraitTrigger(clause).trigger;
    if (next && clauseTrigger !== "always" && parseTraitTrigger(next).trigger === "always") {
      pushParsedTraitEffects(effects, name, `${clause} ${next}`, defaultElement, normalized);
    }
  }

  return dedupeParsedEffects(effects);
}

export function parseWeaponTrait(name: string, traitText: string, defaultElement: Element): WeaponTrait[] {
  return parseBattleTraitEffects(name, traitText, defaultElement)
    .filter((effect): effect is ParsedTraitEffect & {
      kind: "stat_buff";
      stat: string;
      value: number;
      duration: number;
      trigger: TraitTrigger;
      target: TraitTarget;
    } => (
      effect.kind === "stat_buff"
      && effect.runtimeSupported === true
      && typeof effect.stat === "string"
      && typeof effect.value === "number"
      && typeof effect.duration === "number"
      && RUNTIME_TRIGGERS.has(effect.trigger)
      && runtimeTarget(effect.target) !== null
    ))
    .map(effect => ({
      name: effect.name,
      stat: effect.stat,
      value: effect.value,
      duration: effect.duration,
      trigger: effect.trigger,
      target: effect.target,
      maxStacks: effect.maxStacks,
      refreshOnStack: effect.maxStacks ? effect.refreshOnStack : undefined,
    }));
}

export function parseGearSetTrait(name: string, traitText: string, defaultElement: Element): WeaponTrait[] {
  return parseWeaponTrait(name, traitText, defaultElement);
}

function dedupeParsedEffects(effects: ParsedTraitEffect[]): ParsedTraitEffect[] {
  const seen = new Set<string>();
  const result: ParsedTraitEffect[] = [];
  for (const effect of effects) {
    const key = [
      effect.name,
      effect.kind,
      effect.trigger,
      effect.triggers?.join(",") ?? "",
      effect.target,
      effect.stat ?? "",
      effect.value ?? "",
      effect.valuePerConsumedStack ?? "",
      effect.valuePerEnemy ?? "",
      effect.maxEnemyValue ?? "",
      effect.flatValue ?? "",
      effect.flatValueStat ?? "",
      effect.flatValueStatMultiplier ?? "",
      effect.duration ?? "",
      effect.maxStacks ?? "",
      effect.stackGainFromConsumedStacks ? "stackGainFromConsumedStacks" : "",
      effect.conditionValue ?? "",
      effect.skillConditions?.join(",") ?? "",
      effect.affectedSkillConditions?.join(",") ?? "",
      effect.statusConditions?.join(",") ?? "",
      effect.statusConditionMode ?? "",
      effect.statusMinStacks ?? "",
      effect.consumeOnSkillEnd ? "consume" : "",
      effect.healOverflowCondition ?? "",
      effect.triggerSource ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(effect);
  }
  return result;
}
