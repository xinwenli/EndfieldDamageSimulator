import type { Element } from "./types";
import type { ParsedTraitEffect, ParsedTraitTrigger, TraitSkillCondition, TraitStatusConditionMode } from "./traitParser";

export type OperatorTalentMechanicKind =
  | "stat_buff"
  | "damage_reduction"
  | "protection"
  | "heal"
  | "resource"
  | "extra_damage"
  | "status_apply"
  | "status_cleanse"
  | "skill_enhancement"
  | "extra_cast"
  | "cooldown_reduction"
  | "immunity_chance"
  | "probability_bonus"
  | "summon"
  | "custom";

export type OperatorTalentTrigger =
  | "always"
  | "on_skill"
  | "on_skill_hit"
  | "on_crit"
  | "on_damaged"
  | "on_apply_status"
  | "on_consume_status"
  | "on_status_present"
  | "on_stagger_or_cc"
  | "on_heal"
  | "hp_below"
  | "custom";

export interface ParsedOperatorTalentMechanic {
  name: string;
  kind: OperatorTalentMechanicKind;
  trigger: OperatorTalentTrigger;
  target: "self" | "team" | "enemy" | "controlled" | "trigger_actor";
  sourceText: string;
  stat?: string;
  value?: number;
  flatValue?: number;
  duration?: number;
  chance?: number;
  chancePerObject?: number;
  maxStacks?: number;
  conditionValue?: number;
  element?: Element | "arts";
  skillConditions?: TraitSkillCondition[];
  statusConditions?: string[];
  statusConditionMode?: TraitStatusConditionMode;
  runtimeSupported?: boolean;
  notes?: string;
}

export interface OperatorTalentSource {
  name: string;
  description: string;
  stage?: number;
}

const BATTLE_RELATED_TERMS = [
  "伤害", "攻击", "暴击", "治疗", "回复", "护盾", "庇护", "增幅", "抗性", "失衡",
  "技能", "战技", "连携", "终结", "异常", "燃烧", "导电", "冻结", "寒冷", "侵蚀",
  "腐蚀", "破防", "束缚", "浮空", "击倒", "倒地", "眩晕", "生命值", "防御",
  "攻速", "能量", "技力", "冷却", "免疫", "脆弱", "缓速",
];

const ELEMENT_BY_TEXT: Array<[string, Element | "arts"]> = [
  ["物理", "physical"],
  ["灼热", "heat"],
  ["电磁", "electric"],
  ["寒冷", "cryo"],
  ["自然", "nature"],
  ["法术", "arts"],
];

export function isBattleRelatedOperatorTalent(name: string, description: string): boolean {
  const text = `${name} ${description}`;
  return BATTLE_RELATED_TERMS.some(term => text.includes(term));
}

function normalizeTalentText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/；/g, "。").trim();
}

function splitRankClauses(description: string): string[] {
  const normalized = normalizeTalentText(description);
  const markers = [...normalized.matchAll(/[^\s，。；:：]+·[一二三四五六七八九十][:：]/g)];
  if (markers.length === 0) return [normalized];
  return markers
    .map((marker, index) => normalized.slice(marker.index, markers[index + 1]?.index ?? normalized.length).trim())
    .filter(Boolean);
}

function parseDuration(text: string): number | undefined {
  const match = text.match(/持续\s*(\d+(?:\.\d+)?)\s*秒/);
  return match ? parseFloat(match[1]) : undefined;
}

function parseElement(text: string, fallback: Element): Element | "arts" {
  return ELEMENT_BY_TEXT.find(([label]) => text.includes(label))?.[1] ?? fallback;
}

function parseSkillConditions(text: string): TraitSkillCondition[] | undefined {
  const skills: TraitSkillCondition[] = [];
  if (/普通攻击|重击|下落攻击/.test(text)) skills.push("basic");
  if (/战技/.test(text)) skills.push("battle");
  if (/连携技/.test(text)) skills.push("combo");
  if (/终结技/.test(text)) skills.push("ultimate");
  if (skills.length === 0 && /技能/.test(text)) skills.push("battle", "combo", "ultimate");
  return skills.length > 0 ? [...new Set(skills)] : undefined;
}

function parseStatusConditions(text: string): { statusConditions?: string[]; statusConditionMode?: TraitStatusConditionMode } {
  const statuses: string[] = [];
  if (/燃烧/.test(text)) statuses.push("combustion");
  if (/导电/.test(text)) statuses.push("electrification");
  if (/冻结|寒冷附着|源石结晶|碎冰/.test(text)) statuses.push("solidification");
  if (/腐蚀|侵蚀|自然附着/.test(text)) statuses.push("corrosion");
  if (/破防|物理异常/.test(text)) statuses.push("breach");
  if (/法术异常/.test(text)) statuses.push("combustion", "electrification", "solidification", "corrosion");
  if (/缓速/.test(text)) statuses.push("slow");

  let statusConditionMode: TraitStatusConditionMode | undefined;
  if (/消耗|被消耗/.test(text)) statusConditionMode = "consume";
  else if (/施加|附着|处于|被冻结|被附着/.test(text)) statusConditionMode = /施加/.test(text) ? "apply" : "present";

  return {
    statusConditions: statuses.length > 0 ? [...new Set(statuses)] : undefined,
    statusConditionMode,
  };
}

function pushStatBuff(
  effects: ParsedOperatorTalentMechanic[],
  name: string,
  text: string,
  stat: string,
  value: number,
  trigger: OperatorTalentTrigger,
  target: ParsedOperatorTalentMechanic["target"] = "self",
): void {
  effects.push({
    name,
    kind: "stat_buff",
    trigger,
    target,
    stat,
    value,
    duration: parseDuration(text),
    skillConditions: parseSkillConditions(text),
    ...parseStatusConditions(text),
    sourceText: text,
    runtimeSupported: false,
  });
}

function pushCustomIfEmpty(effects: ParsedOperatorTalentMechanic[], name: string, text: string): void {
  if (effects.length > 0) return;
  effects.push({
    name,
    kind: "custom",
    trigger: "custom",
    target: "self",
    sourceText: text,
    runtimeSupported: false,
    notes: "Battle-related operator talent requires bespoke operator skill modeling.",
  });
}

function mapTrigger(mechanic: ParsedOperatorTalentMechanic): Pick<ParsedTraitEffect, "trigger" | "triggers" | "statusConditionMode"> | null {
  switch (mechanic.trigger) {
    case "always":
    case "hp_below":
    case "on_crit":
    case "on_damaged":
    case "on_apply_status":
    case "on_stagger_or_cc":
      return { trigger: mechanic.trigger };
    case "on_consume_status":
      return { trigger: "on_apply_status", statusConditionMode: "consume" };
    case "on_status_present":
      return { trigger: "on_apply_status", statusConditionMode: "present" };
    case "on_skill": {
      const triggers = (mechanic.skillConditions ?? [])
        .map((skill): ParsedTraitTrigger | null => {
          if (skill === "battle") return "on_skill";
          if (skill === "combo") return "on_combo";
          if (skill === "ultimate") return "on_ultimate";
          return null;
        })
        .filter((trigger): trigger is ParsedTraitTrigger => trigger !== null);
      const uniqueTriggers = [...new Set(triggers)];
      if (uniqueTriggers.length === 0) return { trigger: "on_skill" };
      return {
        trigger: uniqueTriggers[0],
        triggers: uniqueTriggers.length > 1 ? uniqueTriggers : undefined,
      };
    }
    default:
      return null;
  }
}

function isRuntimeStat(stat: string | undefined): stat is string {
  return stat === "atkPercent"
    || stat === "critRate"
    || stat === "critDmg"
    || stat === "artsIntensity"
    || stat === "physicalDmgBonus"
    || stat === "heatDmgBonus"
    || stat === "electricDmgBonus"
    || stat === "cryoDmgBonus"
    || stat === "natureDmgBonus"
    || stat === "allElementDmg"
    || stat === "basicDmgBonus"
    || stat === "battleSkillDmgBonus"
    || stat === "comboSkillDmgBonus"
    || stat === "ultimateDmgBonus"
    || stat === "allSkillDmgBonus"
    || stat === "healingBonus"
    || stat === "hpRegenPercent"
    || stat === "amp";
}

export function operatorTalentMechanicToTraitEffect(mechanic: ParsedOperatorTalentMechanic): ParsedTraitEffect | null {
  const trigger = mapTrigger(mechanic);
  if (!trigger) return null;

  const base = {
    name: mechanic.name,
    trigger: trigger.trigger,
    triggers: trigger.triggers,
    target: mechanic.target === "trigger_actor" ? "trigger_actor" : mechanic.target,
    sourceText: mechanic.sourceText,
    duration: mechanic.duration,
    conditionValue: mechanic.conditionValue,
    skillConditions: mechanic.skillConditions,
    statusConditions: mechanic.statusConditions,
    statusConditionMode: trigger.statusConditionMode ?? mechanic.statusConditionMode,
    element: mechanic.element,
    runtimeSupported: true,
  } satisfies Partial<ParsedTraitEffect>;

  if (mechanic.kind === "stat_buff" && isRuntimeStat(mechanic.stat) && mechanic.value !== undefined) {
    return {
      ...base,
      kind: "stat_buff",
      stat: mechanic.stat,
      value: mechanic.value,
    };
  }

  if (mechanic.kind === "protection" && mechanic.value !== undefined) {
    return {
      ...base,
      kind: "protection",
      stat: "protect",
      value: mechanic.value,
    };
  }

  if (mechanic.kind === "heal" && mechanic.stat === "maxHpPercentPerSecond" && mechanic.value !== undefined) {
    return {
      ...base,
      kind: "stat_buff",
      stat: "hpRegenPercent",
      value: mechanic.value,
    };
  }

  if (mechanic.kind === "damage_reduction" && mechanic.value !== undefined && mechanic.element === undefined) {
    return {
      ...base,
      kind: "damage_reduction",
      stat: "incomingDmgReduction",
      value: mechanic.value,
    };
  }

  if (mechanic.kind === "resource" && mechanic.stat === "skillPoint" && mechanic.flatValue !== undefined) {
    return {
      ...base,
      kind: "resource",
      stat: "skillPoint",
      flatValue: mechanic.flatValue,
    };
  }

  if (mechanic.kind === "extra_damage" && mechanic.stat === "atkMultiplier" && mechanic.value !== undefined) {
    return {
      ...base,
      kind: "extra_damage",
      target: "enemy",
      stat: "atkMultiplier",
      value: mechanic.value,
    };
  }

  return null;
}

export function parseOperatorTalentTraitEffects(
  talents: OperatorTalentSource[],
  defaultElement: Element,
): ParsedTraitEffect[] {
  return talents.flatMap(talent =>
    parseOperatorTalentMechanics(talent.name, talent.description, defaultElement, talent.stage)
      .map(operatorTalentMechanicToTraitEffect)
      .filter((effect): effect is ParsedTraitEffect => effect !== null)
  );
}

export function parseOperatorTalentMechanics(
  name: string,
  description: string,
  defaultElement: Element,
  stage?: number,
): ParsedOperatorTalentMechanic[] {
  const effects: ParsedOperatorTalentMechanic[] = [];
  const rankClauses = splitRankClauses(description);
  const clauses = stage === undefined
    ? rankClauses
    : stage <= 0
      ? []
      : [rankClauses[Math.min(stage - 1, rankClauses.length - 1)]].filter(Boolean);

  for (const clause of clauses) {
    const text = normalizeTalentText(clause);
    const duration = parseDuration(text);

    const immunity = text.match(/有\s*(\d+(?:\.\d+)?)\s*%\s*的概率免疫(?:受到的|物理|法术)?伤害/);
    if (immunity) {
      effects.push({
        name,
        kind: "immunity_chance",
        trigger: "on_damaged",
        target: "self",
        chance: parseFloat(immunity[1]) / 100,
        chancePerObject: text.match(/此概率\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/) ? parseFloat(text.match(/此概率\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/)![1]) / 100 : undefined,
        element: /物理/.test(text) ? "physical" : /法术/.test(text) ? "arts" : undefined,
        duration,
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const amp = text.match(/施加\s*(\d+(?:\.\d+)?)\s*%\s*(电磁|灼热|寒冷|自然)增幅/);
    if (amp) pushStatBuff(effects, name, text, "amp", parseFloat(amp[1]) / 100, "on_skill");

    const lowHp = text.match(/生命值(?:低于|不高于)\s*(\d+(?:\.\d+)?)\s*%/);
    const protect = text.match(/获得\s*(\d+(?:\.\d+)?)\s*%\s*庇护/);
    if (protect) {
      effects.push({
        name,
        kind: "protection",
        trigger: lowHp ? "hp_below" : /施放过程中/.test(text) ? "on_skill" : "always",
        target: "self",
        stat: "protect",
        value: parseFloat(protect[1]) / 100,
        conditionValue: lowHp ? parseFloat(lowHp[1]) / 100 : undefined,
        duration,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: lowHp ? true : false,
      });
    }

    const regen = text.match(/每秒回复\s*(\d+(?:\.\d+)?)\s*%\s*最大生命值/);
    if (regen) {
      effects.push({
        name,
        kind: "heal",
        trigger: lowHp ? "hp_below" : "always",
        target: "self",
        stat: "maxHpPercentPerSecond",
        value: parseFloat(regen[1]) / 100,
        conditionValue: lowHp ? parseFloat(lowHp[1]) / 100 : undefined,
        sourceText: text,
        runtimeSupported: lowHp ? true : false,
      });
    }

    const targetStatusApply = text.match(/对目标施加(.+?)状态/);
    const vulnerableStatusApply = text.match(/对该目标施加(.+?脆弱)/);
    if (targetStatusApply || vulnerableStatusApply) {
      effects.push({
        name,
        kind: "status_apply",
        trigger: /消耗/.test(text) ? "on_consume_status" : "on_skill_hit",
        target: "enemy",
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        notes: targetStatusApply?.[1] ?? vulnerableStatusApply?.[1],
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const extraDamage = text.match(/额外(?:触发一次|造成)?攻击力\s*(\d+(?:\.\d+)?)\s*%\s*的\s*(物理|灼热|电磁|寒冷|自然|法术)?伤害/);
    if (extraDamage) {
      effects.push({
        name,
        kind: "extra_damage",
        trigger: /暴击/.test(text) ? "on_crit" : /倒地|击倒|破防|失衡/.test(text) ? "on_stagger_or_cc" : "on_skill_hit",
        target: "enemy",
        stat: "atkMultiplier",
        value: parseFloat(extraDamage[1]) / 100,
        element: parseElement(extraDamage[2] ?? text, defaultElement),
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const formulaHeal = text.match(/回复\s*\[\s*(?:智识|力量|意志)\s*[×xX]\s*([\d.]+)\s*\]\s*点生命值|回复\s*\[\s*(\d+(?:\.\d+)?)\s*[+＋]\s*(?:智识|力量|意志)\s*[×xX]\s*([\d.]+)\s*\]\s*点生命值/);
    if (formulaHeal) {
      effects.push({
        name,
        kind: "heal",
        trigger: /暴击/.test(text) ? "on_crit" : /技能伤害/.test(text) ? "on_skill_hit" : "custom",
        target: /队伍中/.test(text) ? "trigger_actor" : "self",
        stat: "flatHpFormula",
        flatValue: formulaHeal[2] ? parseFloat(formulaHeal[2]) : 0,
        value: parseFloat(formulaHeal[1] ?? formulaHeal[3]),
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const atk = text.match(/攻击力\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    const atkPerAbility = text.match(/每点智识和意志都会使攻击力额外\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (atkPerAbility) {
      pushStatBuff(effects, name, text, "atkPercentPerIntWill", parseFloat(atkPerAbility[1]) / 100, "always");
    } else if (atk) {
      const trigger: OperatorTalentTrigger = /受到来自敌人的伤害后|免疫.*之后/.test(text)
        ? "on_damaged"
        : /消耗|被消耗/.test(text)
          ? "on_consume_status"
          : /每次命中|命中敌人/.test(text)
            ? "on_skill_hit"
            : /每点/.test(text)
              ? "always"
              : "always";
      pushStatBuff(effects, name, text, "atkPercent", parseFloat(atk[1]) / 100, trigger);
    }

    const def = text.match(/防御力\s*[+＋]\s*(\d+(?:\.\d+)?)/);
    if (def) pushStatBuff(effects, name, text, "defFlatPerWill", parseFloat(def[1]), "always");

    const vulnerable = text.match(/施加\s*(\d+(?:\.\d+)?)\s*%\s*(物理|灼热|电磁|寒冷|自然|法术)?脆弱/);
    if (vulnerable) {
      const element = parseElement(vulnerable[2] ?? text, defaultElement);
      pushStatBuff(effects, name, text, element === "arts" ? "allElementDmg" : `${element}DmgBonus`, parseFloat(vulnerable[1]) / 100, "on_skill_hit", "enemy");
    }

    const critDmg = text.match(/暴击伤害\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (critDmg) pushStatBuff(effects, name, text, "critDmg", parseFloat(critDmg[1]) / 100, "on_status_present");

    const elemDmg = text.match(/(?:造成的)?(物理|灼热|电磁|寒冷|自然|法术)?伤害\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (elemDmg && !/受到的|水龙卷/.test(text)) {
      const element = parseElement(elemDmg[1] ?? text, defaultElement);
      const stat = element === "arts" ? "allElementDmg" : `${element}DmgBonus`;
      const trigger: OperatorTalentTrigger = /处于|附着|缓速|失衡/.test(text) ? "on_status_present" : /消耗/.test(text) ? "on_consume_status" : /施加/.test(text) ? "on_apply_status" : "always";
      pushStatBuff(effects, name, text, stat, parseFloat(elemDmg[2]) / 100, trigger);
    }

    const enemyTaken = text.match(/(?:敌人|目标)受到的(物理|灼热|电磁|寒冷|自然|法术)?伤害\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (enemyTaken) {
      const element = parseElement(enemyTaken[1] ?? text, defaultElement);
      const trigger: OperatorTalentTrigger = /命中/.test(text) ? "on_skill_hit" : "on_status_present";
      pushStatBuff(effects, name, text, element === "arts" ? "allElementDmg" : `${element}DmgBonus`, parseFloat(enemyTaken[2]) / 100, trigger, "enemy");
    }

    const healing = text.match(/治疗效果\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (healing) pushStatBuff(effects, name, text, "healingBonus", parseFloat(healing[1]) / 100, lowHp ? "hp_below" : "always");

    const incomingElementReduction = text.match(/受到的(物理|灼热|电磁|寒冷|自然|法术)?伤害\s*[-－]\s*(\d+(?:\.\d+)?)\s*%/);
    if (incomingElementReduction) {
      effects.push({
        name,
        kind: "damage_reduction",
        trigger: "always",
        target: "self",
        stat: "incomingDmgReduction",
        value: parseFloat(incomingElementReduction[2]) / 100,
        element: parseElement(incomingElementReduction[1] ?? text, defaultElement),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const flatStagger = text.match(/额外对其造成\s*(\d+(?:\.\d+)?)\s*点失衡/);
    if (flatStagger) {
      effects.push({
        name,
        kind: "extra_damage",
        trigger: "on_stagger_or_cc",
        target: "enemy",
        stat: "staggerFlat",
        flatValue: parseFloat(flatStagger[1]),
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const resource = text.match(/(?:返还|获得|恢复)\s*(\d+(?:\.\d+)?)\s*(?:点)?(?:终结技)?(?:技力|能量)/);
    if (resource) {
      effects.push({
        name,
        kind: "resource",
        trigger: /消耗|碎冰/.test(text) ? "on_consume_status" : /命中|反击|触发/.test(text) ? "on_skill_hit" : "custom",
        target: "self",
        stat: /能量/.test(text) ? "energy" : "skillPoint",
        flatValue: parseFloat(resource[1]),
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const probabilityPerInt = text.match(/每10点智识会使.+?概率\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (probabilityPerInt) {
      effects.push({
        name,
        kind: "probability_bonus",
        trigger: "always",
        target: "self",
        stat: "probabilityPer10Intelligence",
        value: parseFloat(probabilityPerInt[1]) / 100,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const resourceBonusPerInt = text.match(/每10点智识会使.+?技力恢复量\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (resourceBonusPerInt) {
      effects.push({
        name,
        kind: "stat_buff",
        trigger: "always",
        target: "self",
        stat: "skillPointRecoveryPercentPer10Intelligence",
        value: parseFloat(resourceBonusPerInt[1]) / 100,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const cooldown = text.match(/恢复\s*(\d+(?:\.\d+)?)\s*%\s*冷却时间/);
    if (cooldown) {
      effects.push({
        name,
        kind: "cooldown_reduction",
        trigger: "on_skill_hit",
        target: "self",
        stat: "cooldownPercent",
        value: parseFloat(cooldown[1]) / 100,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const cleanse = text.match(/净化全队的(.+?)状态/);
    if (cleanse) {
      effects.push({
        name,
        kind: "status_cleanse",
        trigger: "on_skill",
        target: "team",
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        notes: cleanse[1],
        sourceText: text,
        runtimeSupported: false,
      });
    }

    const teamElementDmgPerIntelligence = text.match(/提升全队造成的(物理|灼热|电磁|寒冷|自然|法术)?伤害，每点智识\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (teamElementDmgPerIntelligence) {
      const element = parseElement(teamElementDmgPerIntelligence[1] ?? text, defaultElement);
      effects.push({
        name,
        kind: "stat_buff",
        trigger: "on_skill_hit",
        target: "team",
        stat: element === "arts" ? "allElementDmgPerIntelligence" : `${element}DmgBonusPerIntelligence`,
        value: parseFloat(teamElementDmgPerIntelligence[2]) / 100,
        duration,
        maxStacks: /无法叠加/.test(text) ? 1 : undefined,
        conditionValue: text.match(/触发\s*(\d+(?:\.\d+)?)\s*次额外效果/) ? parseFloat(text.match(/触发\s*(\d+(?:\.\d+)?)\s*次额外效果/)![1]) : undefined,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
        notes: "Damage bonus scales per point of the caster's Intelligence after the required extra-effect count.",
      });
    }

    const waterTornado = text.match(/形成一个水龙卷，并消耗附近所有涡流使其形成额外的水龙卷。此次形成的水龙卷效果同战技.+?造成的伤害\s*[+＋]\s*(\d+(?:\.\d+)?)\s*%/);
    if (waterTornado) {
      effects.push({
        name,
        kind: "extra_cast",
        trigger: "custom",
        target: "self",
        stat: "waterTornado",
        value: parseFloat(waterTornado[1]) / 100,
        skillConditions: parseSkillConditions(text),
        sourceText: text,
        runtimeSupported: false,
        notes: "Falling attack inside Ancient Pattern ends evolution early, forms one water tornado, and forms additional tornadoes by consuming nearby vortices; generated tornado damage is increased by this value.",
      });
    }

    if (/效果加强|直接施放重击|后续效果|最后一击产生|额外净化|获得连击|立即再对其发动一次战技|还会弹射|生成|如果敌人处于.+?状态/.test(text)) {
      effects.push({
        name,
        kind: /生成/.test(text) ? "summon" : /再对其发动|弹射|产生/.test(text) ? "extra_cast" : "skill_enhancement",
        trigger: /施放/.test(text) ? "on_skill" : /命中|触发|施加|结束/.test(text) ? "on_skill_hit" : "custom",
        target: /全队/.test(text) ? "team" : "self",
        skillConditions: parseSkillConditions(text),
        ...parseStatusConditions(text),
        sourceText: text,
        runtimeSupported: false,
      });
    }
  }

  if (isBattleRelatedOperatorTalent(name, description)) {
    pushCustomIfEmpty(effects, name, normalizeTalentText(description));
  }

  return effects;
}
