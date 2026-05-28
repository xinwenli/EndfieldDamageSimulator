import { createServer } from "vite";
import operatorsData from "../src/data/operators.json" with { type: "json" };

const vite = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const { runSimulation } = await vite.ssrLoadModule("/src/engine/timeline.ts");

  const stats = {
    hp: 1000,
    atk: 100,
    def: 0,
    critRate: 0,
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
    ultimateGainEfficiency: 1,
    staggerEfficiencyBonus: 0,
  };

  const operator = {
    id: "op_test",
    name: "Test",
    element: "physical",
    role: "striker",
    rarity: 4,
    attackSegments: [],
    skills: [],
    talents: [],
    potentialTalents: [],
    linkSkill: null,
    ultimate: null,
  };

  const target = {
    enemyCount: 1,
    def: 0,
    physicalResist: 0,
    heatResist: 0,
    electricResist: 0,
    cryoResist: 0,
    natureResist: 0,
    aetherResist: 0,
    enemyType: "common",
    staggerThreshold: 9999,
    staggerDuration: 5,
  };

  const operatorData = new Map([[
    "op_test",
    {
      operator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [
        {
          name: "Above80",
          kind: "stat_buff",
          trigger: "hp_above",
          target: "self",
          stat: "atkPercent",
          value: 0.2,
          conditionValue: 0.8,
          sourceText: "",
        },
        {
          name: "Below50DR",
          kind: "damage_reduction",
          trigger: "hp_below",
          target: "self",
          stat: "incomingDmgReduction",
          value: 0.3,
          conditionValue: 0.5,
          sourceText: "",
        },
        {
          name: "ShieldOnHit",
          kind: "shield",
          trigger: "on_damaged",
          target: "self",
          stat: "maxHpPercent",
          value: 0.2,
          duration: 0.5,
          sourceText: "",
        },
        {
          name: "KillBuff",
          kind: "stat_buff",
          trigger: "on_kill",
          target: "self",
          stat: "atkPercent",
          value: 0.1,
          duration: 2,
          sourceText: "",
        },
      ],
    },
  ]]);

  const tracks = [{
    operatorId: "op_test",
    blocks: [
      {
        id: "hit1",
        operatorId: "op_test",
        skillId: "event_incoming_damage",
        label: "Hit1",
        startFrame: 0,
        duration: 1,
        eventType: "incoming_damage",
        eventValue: 600,
      },
      {
        id: "hit2",
        operatorId: "op_test",
        skillId: "event_incoming_damage",
        label: "Hit2",
        startFrame: 1,
        duration: 1,
        eventType: "incoming_damage",
        eventValue: 100,
      },
      {
        id: "kill1",
        operatorId: "op_test",
        skillId: "event_enemy_kill",
        label: "Kill",
        startFrame: 2,
        duration: 1,
        eventType: "enemy_kill",
        eventValue: 1,
      },
    ],
  }];

  const result = runSimulation(tracks, operatorData, target, 60, 60);
  const frame0 = result.frames[0].operators.op_test;
  const frame1 = result.frames[1];
  const frame2 = result.frames[2].operators.op_test;
  const frame40 = result.frames[40].operators.op_test;

  assert(frame0.currentHp === 400, `expected first hit to leave 400 HP, got ${frame0.currentHp}`);
  assert(!frame0.activeBuffs.some((b) => b.name === "Above80"), "hp_above buff should be removed after dropping below threshold");
  assert(frame0.activeBuffs.some((b) => b.name === "Below50DR"), "hp_below damage reduction should activate below threshold");

  const secondHit = frame1.events.find((e) => e.type === "incoming_damage");
  assert(secondHit, "expected second incoming damage event");
  assert(secondHit.damage === 0, `expected damage reduction plus shield to prevent HP loss, got ${secondHit.damage}`);
  assert(secondHit.detail.includes("70 shield absorbed"), `expected reduced hit to absorb 70 shield, got ${secondHit.detail}`);

  assert(frame2.activeBuffs.some((b) => b.name === "KillBuff"), "enemy kill event should trigger on_kill trait buff");
  assert(frame40.shieldHp === 0, `expected shield HP to expire with shield buff, got ${frame40.shieldHp}`);

  const defStats = { ...stats, def: 100 };
  const defOperatorData = new Map([[
    "op_test",
    {
      operator,
      stats: defStats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [{
        name: "DefUp",
        kind: "stat_buff",
        trigger: "always",
        target: "self",
        stat: "defPercent",
        value: 1,
        sourceText: "",
      }],
    },
  ]]);
  const defResult = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "def_hit",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Def Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 300,
    }],
  }], defOperatorData, target, 10, 60);
  const defFrame0 = defResult.frames[0].operators.op_test;
  assert(defFrame0.currentHp === 900, `expected DEF% buff to reduce 300 incoming damage to 100, got HP ${defFrame0.currentHp}`);

  const healOverflowTraits = [
    {
      name: "HealOnDamage",
      kind: "heal",
      trigger: "on_damaged",
      target: "self",
      stat: "flatHp",
      flatValue: 100,
      sourceText: "",
    },
    {
      name: "NormalHealDR",
      kind: "damage_reduction",
      trigger: "on_heal",
      target: "affected_ally",
      stat: "incomingDmgReduction",
      value: 0.15,
      duration: 10,
      healOverflowCondition: "absent",
      sourceText: "",
    },
    {
      name: "OverflowHealDR",
      kind: "damage_reduction",
      trigger: "on_heal",
      target: "affected_ally",
      stat: "incomingDmgReduction",
      value: 0.3,
      duration: 10,
      healOverflowCondition: "required",
      sourceText: "",
    },
  ];
  const healOperatorData = new Map([[
    "op_test",
    {
      operator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: healOverflowTraits,
    },
  ]]);
  const healNoOverflow = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "heal_hit",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Heal Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 200,
    }],
  }], healOperatorData, target, 10, 60).frames[0].operators.op_test;
  assert(healNoOverflow.currentHp === 900, `expected non-overflow heal to restore HP to 900, got ${healNoOverflow.currentHp}`);
  assert(healNoOverflow.activeBuffs.some((b) => b.name === "NormalHealDR"), "expected non-overflow heal DR buff");
  assert(!healNoOverflow.activeBuffs.some((b) => b.name === "OverflowHealDR"), "overflow DR buff should not apply without overheal");

  const healOverflow = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "heal_overflow_hit",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Heal Overflow Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 50,
    }],
  }], healOperatorData, target, 10, 60).frames[0].operators.op_test;
  assert(healOverflow.currentHp === 1000, `expected overflow heal to cap HP at 1000, got ${healOverflow.currentHp}`);
  assert(!healOverflow.activeBuffs.some((b) => b.name === "NormalHealDR"), "normal heal DR buff should not apply on overheal");
  assert(healOverflow.activeBuffs.some((b) => b.name === "OverflowHealDR"), "expected overflow heal DR buff");

  const statusOperator = {
    ...operator,
    skills: [{
      id: "skill_1",
      name: "Breach",
      duration: 0.01,
      multipliers: [0],
      damageTicks: [],
      anomalies: [{ type: "breach", stacks: 2, duration: 10 }],
      spCost: 0,
    }],
  };
  const statusOperatorData = new Map([[
    "op_test",
    {
      operator: statusOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [{
        name: "Breach4",
        kind: "stat_buff",
        trigger: "on_apply_status",
        target: "self",
        stat: "physicalDmgBonus",
        value: 0.16,
        duration: 10,
        statusConditions: ["breach"],
        statusConditionMode: "present",
        statusMinStacks: 4,
        sourceText: "",
      }],
    },
  ]]);
  const statusResult = runSimulation([{
    operatorId: "op_test",
    blocks: [
      {
        id: "breach1",
        operatorId: "op_test",
        skillId: "skill_1",
        label: "Breach 1",
        startFrame: 0,
        duration: 1,
      },
      {
        id: "breach2",
        operatorId: "op_test",
        skillId: "skill_1",
        label: "Breach 2",
        startFrame: 3,
        duration: 1,
      },
    ],
  }], statusOperatorData, target, 10, 60);
  const afterFirstBreach = statusResult.frames[1].operators.op_test;
  const afterSecondBreach = statusResult.frames[4].operators.op_test;
  assert(!afterFirstBreach.activeBuffs.some((b) => b.name === "Breach4"), "status stack trait should not apply below 4 breach stacks");
  assert(afterSecondBreach.activeBuffs.some((b) => b.name === "Breach4"), "status stack trait should apply at 4 breach stacks");

  const allyOperator = {
    ...operator,
    id: "op_ally",
    name: "Ally",
    skills: [{
      id: "skill_1",
      name: "Ally Battle",
      duration: 0.01,
      multipliers: [0],
      damageTicks: [],
      spCost: 0,
    }],
  };
  const teamTriggerData = new Map([
    ["op_test", {
      operator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [{
        name: "TeamSkillCombo",
        kind: "stat_buff",
        trigger: "on_skill",
        triggerSource: "team",
        target: "trigger_actor",
        stat: "comboSkillDmgBonus",
        value: 0.2,
        duration: 15,
        affectedSkillConditions: ["combo"],
        consumeOnSkillEnd: true,
        sourceText: "",
      }],
    }],
    ["op_ally", {
      operator: allyOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [],
    }],
  ]);
  const teamTriggerResult = runSimulation([
    { operatorId: "op_test", blocks: [] },
    {
      operatorId: "op_ally",
      blocks: [{
        id: "ally_skill",
        operatorId: "op_ally",
        skillId: "skill_1",
        label: "Ally Battle",
        startFrame: 0,
        duration: 1,
      }],
    },
  ], teamTriggerData, target, 10, 60);
  const teamOwnerFrame0 = teamTriggerResult.frames[0].operators.op_test;
  const teamAllyFrame0 = teamTriggerResult.frames[0].operators.op_ally;
  assert(!teamOwnerFrame0.activeBuffs.some((b) => b.name === "TeamSkillCombo"), "team trigger buff should target the battle-skill caster, not the equipment owner");
  assert(teamAllyFrame0.activeBuffs.some((b) => b.name === "TeamSkillCombo"), "team trigger buff should apply to the teammate who cast the battle skill");

  const energyOperator = {
    ...operator,
    skills: [{
      id: "skill_1",
      name: "Energy Skill",
      duration: 0.02,
      multipliers: [0],
      damageTicks: [{ offset: 0, stagger: 0, sp: 10 }],
      spCost: 0,
    }],
  };
  const energyAlly = { ...operator, id: "op_energy_ally", name: "Energy Ally" };
  const splitTargetData = new Map([
    ["op_test", {
      operator: energyOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [
        {
          name: "EnergySelf",
          kind: "stat_buff",
          trigger: "on_energy_recover",
          target: "self",
          stat: "physicalDmgBonus",
          value: 0.1,
          duration: 30,
          skillConditions: ["battle"],
          sourceText: "",
        },
        {
          name: "EnergyAlly",
          kind: "stat_buff",
          trigger: "on_energy_recover",
          target: "other_allies",
          stat: "physicalDmgBonus",
          value: 0.05,
          duration: 30,
          skillConditions: ["battle"],
          sourceText: "",
        },
      ],
    }],
    ["op_energy_ally", {
      operator: energyAlly,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [],
    }],
  ]);
  const splitTargetResult = runSimulation([
    {
      operatorId: "op_test",
      blocks: [{
        id: "energy_skill",
        operatorId: "op_test",
        skillId: "skill_1",
        label: "Energy Skill",
        startFrame: 0,
        duration: 2,
      }],
    },
    { operatorId: "op_energy_ally", blocks: [] },
  ], splitTargetData, target, 10, 60);
  const splitSelf = splitTargetResult.frames[1].operators.op_test;
  const splitAlly = splitTargetResult.frames[1].operators.op_energy_ally;
  assert(splitSelf.activeBuffs.some((b) => b.name === "EnergySelf" && b.value === 0.1), "energy recovery should apply self split buff");
  assert(!splitSelf.activeBuffs.some((b) => b.name === "EnergyAlly"), "other-allies split buff should not apply to self");
  assert(splitAlly.activeBuffs.some((b) => b.name === "EnergyAlly" && b.value === 0.05), "energy recovery should apply other-allies split buff");

  const consumeStackOperator = {
    ...operator,
    skills: [
      {
        id: "skill_1",
        name: "Electrify",
        duration: 0.01,
        multipliers: [0],
        damageTicks: [],
        anomalies: [{ type: "electrification", stacks: 3, duration: 10 }],
        spCost: 0,
      },
      {
        id: "skill_2",
        name: "Combust",
        duration: 0.01,
        multipliers: [0],
        damageTicks: [],
        anomalies: [{ type: "combustion", stacks: 1, duration: 10 }],
        spCost: 0,
      },
    ],
  };
  const consumeStackData = new Map([[
    "op_test",
    {
      operator: consumeStackOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      traitEffects: [{
        name: "ConsumedStackGain",
        kind: "stat_buff",
        trigger: "on_apply_status",
        target: "self",
        stat: "electricDmgBonus",
        value: 0.15,
        duration: 25,
        maxStacks: 3,
        refreshOnStack: true,
        stackGainFromConsumedStacks: true,
        statusConditions: ["electrification"],
        statusConditionMode: "consume",
        sourceText: "根据异常等级获得相同层数的强化状态",
      }],
    },
  ]]);
  const consumeStackResult = runSimulation([{
    operatorId: "op_test",
    blocks: [
      {
        id: "electrify",
        operatorId: "op_test",
        skillId: "skill_1",
        label: "Electrify",
        startFrame: 0,
        duration: 1,
      },
      {
        id: "combust",
        operatorId: "op_test",
        skillId: "skill_2",
        label: "Combust",
        startFrame: 3,
        duration: 1,
      },
    ],
  }], consumeStackData, target, 10, 60);
  const consumedStackBuff = consumeStackResult.frames[4].operators.op_test.activeBuffs.find((b) => b.name.startsWith("ConsumedStackGain"));
  assert(consumedStackBuff, "consuming a 3-stack status should apply consumed-stack-gain buff");
  assert(Math.abs(consumedStackBuff.value - 0.45) < 1e-9, `expected consumed-stack-gain buff value 0.45, got ${consumedStackBuff.value}`);

  const damagedTalentOperator = {
    ...operator,
    talents: [{
      id: "talent_damaged_atk",
      name: "DamagedAtk",
      description: "受到来自敌人的伤害后，攻击力+6%，持续7秒",
    }],
  };
  const damagedTalentResult = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "talent_hit",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Talent Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 100,
    }],
  }], new Map([[
    "op_test",
    {
      operator: damagedTalentOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
    },
  ]]), target, 10, 60);
  const damagedTalentBuff = damagedTalentResult.frames[0].operators.op_test.activeBuffs.find((b) => b.name === "DamagedAtk");
  assert(damagedTalentBuff?.stat === "atkPercent" && damagedTalentBuff.value === 0.06, "operator talent should apply ATK buff after taking damage");

  const stagedTalentOperator = operatorsData.find((op) => op.id === "24");
  assert(stagedTalentOperator, "expected operator 24 fixture for staged operator talent test");
  const runStagedTalent = (talentSkill2Stage) => runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: `staged_hit_${talentSkill2Stage}`,
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Staged Talent Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 100,
    }],
  }], new Map([[
    "op_test",
    {
      operator: stagedTalentOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
      talentSkill2Stage,
    },
  ]]), target, 10, 60);
  const stagedRank1Buff = runStagedTalent(1).frames[0].operators.op_test.activeBuffs.find((b) => b.stat === "atkPercent");
  const stagedRank2Buff = runStagedTalent(2).frames[0].operators.op_test.activeBuffs.find((b) => b.stat === "atkPercent");
  assert(stagedRank1Buff?.value === 0.06, `expected stage 1 operator talent value 0.06, got ${stagedRank1Buff?.value}`);
  assert(stagedRank2Buff?.value === 0.09, `expected stage 2 operator talent value 0.09, got ${stagedRank2Buff?.value}`);

  const applyStatusTalentOperator = {
    ...operator,
    element: "heat",
    talents: [{
      id: "talent_apply_burning",
      name: "ApplyBurningHeat",
      description: "每次施加燃烧后，获得灼热獠牙状态，持续10秒，该状态无法叠加。状态持续期间，自身造成的灼热伤害+20%。",
    }],
    skills: [{
      id: "skill_1",
      name: "Apply Burning",
      duration: 0.01,
      multipliers: [0],
      damageTicks: [],
      anomalies: [{ type: "combustion", stacks: 1, duration: 10 }],
      spCost: 0,
    }],
  };
  const applyStatusTalentResult = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "apply_burning",
      operatorId: "op_test",
      skillId: "skill_1",
      label: "Apply Burning",
      startFrame: 0,
      duration: 1,
    }],
  }], new Map([[
    "op_test",
    {
      operator: applyStatusTalentOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
    },
  ]]), target, 10, 60);
  const applyStatusTalentBuff = applyStatusTalentResult.frames[1].operators.op_test.activeBuffs.find((b) => b.name === "ApplyBurningHeat");
  assert(applyStatusTalentBuff?.stat === "heatDmgBonus" && applyStatusTalentBuff.value === 0.2, "operator talent should apply elemental damage buff after applying matching status");

  const lowHpTalentOperator = {
    ...operator,
    talents: [{
      id: "talent_low_hp",
      name: "Low HP Talent",
      description: "当生命值低于40%时，获得90%庇护，并每秒回复5%最大生命值",
    }],
  };
  const lowHpTalentData = new Map([[
    "op_test",
    {
      operator: lowHpTalentOperator,
      stats,
      skillRanks: [1, 1, 1, 1],
      level: 1,
    },
  ]]);
  const lowHpTalentResult = runSimulation([{
    operatorId: "op_test",
    blocks: [
      {
        id: "low_hp_hit",
        operatorId: "op_test",
        skillId: "event_incoming_damage",
        label: "Low HP Hit",
        startFrame: 0,
        duration: 1,
        eventType: "incoming_damage",
        eventValue: 700,
      },
      {
        id: "protected_hit",
        operatorId: "op_test",
        skillId: "event_incoming_damage",
        label: "Protected Hit",
        startFrame: 3,
        duration: 1,
        eventType: "incoming_damage",
        eventValue: 1000,
      },
    ],
  }], lowHpTalentData, target, 1, 60);
  const lowHpFrame0 = lowHpTalentResult.frames[0].operators.op_test;
  assert(lowHpFrame0.activeBuffs.some((b) => b.stat === "protect" && b.value === 0.9), "low-HP talent should apply protect buff");
  assert(lowHpFrame0.activeBuffs.some((b) => b.stat === "hpRegenPercent" && b.value === 0.05), "low-HP talent should apply max-HP regen buff");
  const protectedFrame = lowHpTalentResult.frames[3].operators.op_test;
  assert(protectedFrame.currentHp >= 200 && protectedFrame.currentHp <= 205, `expected low-HP protect to reduce second hit to about 100 damage, got HP ${protectedFrame.currentHp}`);

  const lowHpRegenResult = runSimulation([{
    operatorId: "op_test",
    blocks: [{
      id: "regen_hit",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Regen Hit",
      startFrame: 0,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 700,
    }, {
      id: "regen_wait",
      operatorId: "op_test",
      skillId: "event_incoming_damage",
      label: "Regen Wait",
      startFrame: 180,
      duration: 1,
      eventType: "incoming_damage",
      eventValue: 0,
    }],
  }], lowHpTalentData, target, undefined, 60);
  const recoveredFrame = lowHpRegenResult.frames[150].operators.op_test;
  assert(recoveredFrame.currentHp >= 400, `expected low-HP regen to recover to threshold, got HP ${recoveredFrame.currentHp}`);
  assert(!recoveredFrame.activeBuffs.some((b) => b.stat === "protect" || b.stat === "hpRegenPercent"), "low-HP talent buffs should be removed after recovering above threshold");

  console.log("Trait runtime validation");
  console.log("------------------------");
  console.log("HP threshold traits, DEF%, incoming damage reduction, shield lifetime, heal-overflow conditions, operator talent conversion, low-HP talent mechanics, status stack thresholds, consumed-stack gains, split ally buffs, team skill triggers, and enemy-kill triggers passed.");
} finally {
  await vite.close();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
