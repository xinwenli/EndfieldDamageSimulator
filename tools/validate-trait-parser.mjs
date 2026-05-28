import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseBattleTraitEffects,
} from "../src/engine/traitParser.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const weapons = readJson("src/data/weapons.json");
const setEffects = readJson("src/data/set_effects.json");

const kindCounts = new Map();
const triggerCounts = new Map();
const affectedSkillCounts = new Map();
const statCounts = new Map();
const misses = [];
const unsupported = [];
let weaponTraitRanks = 0;
let weaponTraitRanksParsed = 0;
let weaponParsedEffects = 0;
let gearSetTraits = 0;
let gearSetTraitsParsed = 0;
let gearParsedEffects = 0;
let consumeOnSkillEndEffects = 0;
let consumedStackFormulaEffects = 0;
let halfEffectTargets = 0;
let flatStatFormulaEffects = 0;
let perEnemyScalingEffects = 0;
let healOverflowConditionEffects = 0;
let statusStackConditionEffects = 0;
let teamTriggerEffects = 0;
let splitOtherAlliesEffects = 0;
let consumedStackGainEffects = 0;

const RUNTIME_EFFECT_KINDS = new Set([
  "stat_buff",
  "extra_damage",
  "heal",
  "shield",
  "resource",
  "damage_reduction",
  "stagger_bonus",
  "protection",
]);

const RUNTIME_TRIGGERS = new Set([
  "always",
  "hp_above",
  "hp_below",
  "on_amp_gain",
  "on_apply_status",
  "on_combo",
  "on_crit",
  "on_damaged",
  "on_energy_recover",
  "on_heal",
  "on_heavy_hit",
  "on_kill",
  "on_skill",
  "on_stack_cap",
  "on_stagger_or_cc",
  "on_ultimate",
]);

const RUNTIME_TARGETS = new Set([
  "self",
  "team",
  "other_allies",
  "controlled",
  "affected_ally",
  "different_element_allies",
  "trigger_actor",
  "enemy",
]);

const RUNTIME_STATS = new Set([
  "allAbilityPercent",
  "allElementDmg",
  "allSkillDmgBonus",
  "artsIntensity",
  "atkMultiplier",
  "atkPercent",
  "basicDmgBonus",
  "battleSkillDmgBonus",
  "comboSkillDmgBonus",
  "correspondingElementDmg",
  "critRate",
  "cryoDmgBonus",
  "defPercent",
  "electricDmgBonus",
  "flatHp",
  "flatHpFormula",
  "healingBonus",
  "heatDmgBonus",
  "incomingDmgReduction",
  "maxHpPercent",
  "multiplicative",
  "natureDmgBonus",
  "physicalDmgBonus",
  "skillPoint",
  "staggerFlat",
  "staggerPercent",
  "ultimateDmgBonus",
]);

function countKinds(effects) {
  for (const effect of effects) {
    kindCounts.set(effect.kind, (kindCounts.get(effect.kind) ?? 0) + 1);
    triggerCounts.set(effect.trigger, (triggerCounts.get(effect.trigger) ?? 0) + 1);
    for (const skill of effect.affectedSkillConditions ?? []) {
      affectedSkillCounts.set(skill, (affectedSkillCounts.get(skill) ?? 0) + 1);
    }
    if (effect.stat) statCounts.set(effect.stat, (statCounts.get(effect.stat) ?? 0) + 1);
    if (effect.consumeOnSkillEnd) consumeOnSkillEndEffects++;
    if (effect.valuePerConsumedStack !== undefined) consumedStackFormulaEffects++;
    if (effect.name.includes("半效")) halfEffectTargets++;
    if (effect.flatValueStatMultiplier !== undefined) flatStatFormulaEffects++;
    if (effect.valuePerEnemy !== undefined) perEnemyScalingEffects++;
    if (effect.healOverflowCondition !== undefined) healOverflowConditionEffects++;
    if (effect.statusMinStacks !== undefined) statusStackConditionEffects++;
    if (effect.triggerSource === "team") teamTriggerEffects++;
    if (effect.name.includes(":其他")) splitOtherAlliesEffects++;
    if (effect.stackGainFromConsumedStacks) consumedStackGainEffects++;
    validateRuntimeCoverage(effect);
  }
}

function validateRuntimeCoverage(effect) {
  if (!RUNTIME_EFFECT_KINDS.has(effect.kind)) {
    unsupported.push(`${effect.name}: unsupported kind ${effect.kind}`);
  }
  for (const trigger of [effect.trigger, ...(effect.triggers ?? [])]) {
    if (!RUNTIME_TRIGGERS.has(trigger)) {
      unsupported.push(`${effect.name}: unsupported trigger ${trigger}`);
    }
  }
  if (!RUNTIME_TARGETS.has(effect.target)) {
    unsupported.push(`${effect.name}: unsupported target ${effect.target}`);
  }
  if (effect.stat && !RUNTIME_STATS.has(effect.stat)) {
    unsupported.push(`${effect.name}: unsupported stat ${effect.stat}`);
  }
}

for (const weapon of weapons) {
  for (const skill of weapon.skills ?? []) {
    for (const rank of skill.ranks ?? []) {
      if (!rank.trait) continue;

      weaponTraitRanks++;
      const parsed = parseBattleTraitEffects(skill.name, rank.trait, "heat");
      weaponParsedEffects += parsed.length;

      if (parsed.length > 0) {
        weaponTraitRanksParsed++;
        countKinds(parsed);
      } else {
        misses.push({
          source: "weapon",
          item: weapon.name,
          skill: skill.name,
          trait: rank.trait,
        });
      }
    }
  }
}

for (const [setId, effect] of Object.entries(setEffects)) {
  if (!effect.trait) continue;

  gearSetTraits++;
  const parsed = parseBattleTraitEffects(effect.name, effect.trait, "heat");
  gearParsedEffects += parsed.length;

  if (parsed.length > 0) {
    gearSetTraitsParsed++;
    countKinds(parsed);
  } else {
    misses.push({
      source: "gear",
      item: effect.name,
      skill: setId,
      trait: effect.trait,
    });
  }
}

console.log("Trait parser validation");
console.log("-----------------------");
console.log(`weapon trait ranks: ${weaponTraitRanksParsed}/${weaponTraitRanks}`);
console.log(`weapon parsed effects: ${weaponParsedEffects}`);
console.log(`gear set traits: ${gearSetTraitsParsed}/${gearSetTraits}`);
console.log(`gear parsed effects: ${gearParsedEffects}`);
console.log("parsed effect kinds:");
for (const [kind, count] of [...kindCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${kind}: ${count}`);
}
console.log("parsed triggers:");
for (const [trigger, count] of [...triggerCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${trigger}: ${count}`);
}
console.log("affected skill scopes:");
for (const [skill, count] of [...affectedSkillCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${skill}: ${count}`);
}
console.log("parsed stats:");
for (const [stat, count] of [...statCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${stat}: ${count}`);
}
console.log(`consume-on-skill-end effects: ${consumeOnSkillEndEffects}`);
console.log(`consumed-stack formula effects: ${consumedStackFormulaEffects}`);
console.log(`half-effect target effects: ${halfEffectTargets}`);
console.log(`flat stat formula effects: ${flatStatFormulaEffects}`);
console.log(`per-enemy scaling effects: ${perEnemyScalingEffects}`);
console.log(`heal-overflow condition effects: ${healOverflowConditionEffects}`);
console.log(`status-stack condition effects: ${statusStackConditionEffects}`);
console.log(`team-trigger effects: ${teamTriggerEffects}`);
console.log(`split other-allies effects: ${splitOtherAlliesEffects}`);
console.log(`consumed-stack gain effects: ${consumedStackGainEffects}`);

if (unsupported.length > 0) {
  console.log("");
  console.log("Unsupported parsed trait mechanics:");
  for (const item of unsupported) {
    console.log(`- ${item}`);
  }
  process.exitCode = 1;
}

if (misses.length > 0) {
  console.log("");
  console.log("Unparsed battle traits:");
  for (const miss of misses) {
    console.log(`- [${miss.source}] ${miss.item} / ${miss.skill}: ${miss.trait}`);
  }
  process.exitCode = 1;
} else if (unsupported.length === 0) {
  console.log("No unparsed battle traits found.");
  console.log("All parsed trait mechanics have runtime coverage declarations.");
}
