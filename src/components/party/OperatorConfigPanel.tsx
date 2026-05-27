import { useState } from "react";
import { X, RefreshCw, Plus } from "lucide-react";
import { usePartyStore } from "../../stores/partyStore";
import { getElements } from "../../engine/dataLoader";
import { computeFinalStats, getOperatorAbilitiesAtLevel, computeWeaponBonuses, computePartySynergies, getOperatorTalentMeta } from "../../engine/formulas";
import type { PartyMemberInfo } from "../../engine/formulas";
import { WeaponPicker } from "./WeaponPicker";
import { GearPicker } from "./GearPicker";
import { assetUrl } from "../../lib/utils";
import { useLangStore } from "../../i18n/context";
import { t, displayName } from "../../i18n/translations";
import type { PartyMember, Weapon, GearPiece } from "../../engine/types";

const LABEL = "text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide";
const VALUE = "text-sm font-medium tabular-nums";
const STAT_ROW = "flex justify-between items-center py-0.5";
const SECTION = "border-t border-[var(--color-border)] pt-4 mt-4 pb-1 first:border-t-0 first:pt-0 first:mt-0";

function HoverTooltip({ label, value, children }: { label: string; value: string | number; children: React.ReactNode }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [show, setShow] = useState(false);
  return (
    <div className={STAT_ROW}
      onMouseEnter={() => setShow(true)}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={VALUE}>{value}</span>
      {show && (
        <div className="fixed z-50 pointer-events-none" style={{ left: pos.x + 12, top: pos.y - 10 }}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[10px] leading-relaxed whitespace-nowrap shadow-lg">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  member: PartyMember;
  onChangeOperator: () => void;
}

export function OperatorConfigPanel({ member, onChangeOperator }: Props) {
  const {
    setLevel, setSkillRank, setPotential, setTalentStage,
    setTalentSkill1Stage, setTalentSkill2Stage,
    setWeapon, setWeaponLevel, setWeaponSkillRank,
    setArmor, setGloves, setKit1, setKit2,
    removeOperator, setActiveSlot,
  } = usePartyStore();

  const { lang } = useLangStore();
  const SKILL_LABELS = [t("baseAttack", lang), t("battleSkill", lang), t("comboSkill", lang), t("ultimate", lang)];
  const LEVELS = Array.from({ length: 90 }, (_, i) => i + 1);
  const SKILL_RANKS = Array.from({ length: 12 }, (_, i) => i + 1);

  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false);
  const [gearPicker, setGearPicker] = useState<{ slot: "Armor" | "Gloves" | "Kit"; kitIndex?: number } | null>(null);

  function handleSelectGear(gear: GearPiece) {
    if (!gearPicker) return;
    if (gearPicker.slot === "Armor") setArmor(member.slotIndex, gear);
    else if (gearPicker.slot === "Gloves") setGloves(member.slotIndex, gear);
    else if (gearPicker.kitIndex === 0) setKit1(member.slotIndex, gear);
    else setKit2(member.slotIndex, gear);
    setGearPicker(null);
  }

  const op = member.operator!;
  const el = getElements()[op.element];

  const { stats: finalStats, breakdown } = computeFinalStats(op.id, member.level, member.potential, member.talentStage, member.weapon, member.weaponLevel, member.weaponSkillRanks, {
    armor: member.armor,
    gloves: member.gloves,
    kit1: member.kit1,
    kit2: member.kit2,
  });

  // Compute party synergy bonuses for this operator
  const partyMembers = usePartyStore(s => s.members);
  const synergyMembers: PartyMemberInfo[] = partyMembers
    .filter(m => m.operator)
    .map(m => ({
      operatorId: m.operator!.id,
      profession: m.operator!.profession,
      potential: m.potential,
      attributeTalentStage: m.talentStage,
      talentSkill1Stage: m.talentSkill1Stage,
      talentSkill2Stage: m.talentSkill2Stage,
    }));
  const synergyBonuses = computePartySynergies(synergyMembers);
  const synergyBonus = synergyBonuses.get(op.id);
  const synergyUltGain = synergyBonus?.ultimateGainEfficiency || 0;
  const totalUltGainEff = finalStats.ultimateGainEfficiency + synergyUltGain;

  const talentMeta = getOperatorTalentMeta(op.id);

  const baseAbilities = getOperatorAbilitiesAtLevel(op.id, member.level, member.potential, member.talentStage);
  const wpBonus = computeWeaponBonuses(member.weapon, member.weaponSkillRanks);

  // Compute gear ability bonuses using the same logic as computeGearBonuses in formulas.ts
  const gearAbilityBonus = { strength: 0, agility: 0, intelligence: 0, will: 0 };
  for (const gear of [member.armor, member.gloves, member.kit1, member.kit2]) {
    if (!gear || Object.keys(gear.baseStats).length === 0) continue;
    const ranks = gear.refinementRanks ?? gear.refinement.map(() => 3);
    // Process refined stats
    for (let ri = 0; ri < gear.refinement.length; ri++) {
      const r = gear.refinement[ri];
      const rank = ranks[ri] ?? 3;
      const rankKey = rank === 1 ? "rank1" : rank === 2 ? "rank2" : rank === 3 ? "rank3" : "base";
      const val = r[rankKey] || r.base;
      const numVal = parseFloat(String(val).replace(/[+%]/g, "")) || 0;
      if (r.name === "力量") gearAbilityBonus.strength += numVal;
      else if (r.name === "敏捷") gearAbilityBonus.agility += numVal;
      else if (r.name === "智识") gearAbilityBonus.intelligence += numVal;
      else if (r.name === "意志") gearAbilityBonus.will += numVal;
    }
  }

  // Pre-compute gear Ult Gain Eff for tooltip
  let gearUltGain = 0;
  for (const gear of [member.armor, member.gloves, member.kit1, member.kit2]) {
    if (!gear) continue;
    const rks = gear.refinementRanks ?? gear.refinement.map(() => 3);
    gear.refinement.forEach((r, ri) => {
      if (r.name !== "终结技充能效率") return;
      const rk = rks[ri] ?? 3;
      const k = rk === 1 ? "rank1" : rk === 2 ? "rank2" : rk === 3 ? "rank3" : "base";
      gearUltGain += parseFloat((r[k] || r.base).replace(/[+%]/g, "")) || 0;
    });
  }

  // Weapon/gear "主能力"/"副能力" are PERCENTAGE boosts on pre-% total
  const primaryKey = op.primaryAbility;
  const secondaryKey = op.secondaryAbility;

  const prePctAbilities = {
    strength: baseAbilities.strength + wpBonus.strength + gearAbilityBonus.strength,
    agility: baseAbilities.agility + wpBonus.agility + gearAbilityBonus.agility,
    intelligence: baseAbilities.intelligence + wpBonus.intelligence + gearAbilityBonus.intelligence,
    will: baseAbilities.will + wpBonus.will + gearAbilityBonus.will,
  };

  // Collect gear + weapon primary/secondary % bonuses
  let totalPrimaryPct = wpBonus.primaryAbility || 0;
  let totalSecondaryPct = wpBonus.secondaryAbility || 0;
  for (const gear of [member.armor, member.gloves, member.kit1, member.kit2]) {
    if (!gear || Object.keys(gear.baseStats).length === 0) continue;
    const ranks = gear.refinementRanks ?? gear.refinement.map(() => 3);
    for (let ri = 0; ri < gear.refinement.length; ri++) {
      const r = gear.refinement[ri];
      const rank = ranks[ri] ?? 3;
      const rankKey = rank === 1 ? "rank1" : rank === 2 ? "rank2" : rank === 3 ? "rank3" : "base";
      const val = r[rankKey] || r.base;
      const numVal = parseFloat(String(val).replace(/[+%]/g, "")) || 0;
      const isPct = String(val).includes("%");
      if (r.name === "主能力") totalPrimaryPct += isPct ? numVal / 100 : numVal;
      else if (r.name === "副能力") totalSecondaryPct += isPct ? numVal / 100 : numVal;
    }
  }

  let pctStr = 0, pctAgi = 0, pctInt = 0, pctWil = 0;
  if (totalPrimaryPct) {
    if (primaryKey === "strength") pctStr = Math.round(prePctAbilities.strength * totalPrimaryPct);
    else if (primaryKey === "agility") pctAgi = Math.round(prePctAbilities.agility * totalPrimaryPct);
    else if (primaryKey === "intelligence") pctInt = Math.round(prePctAbilities.intelligence * totalPrimaryPct);
    else if (primaryKey === "will") pctWil = Math.round(prePctAbilities.will * totalPrimaryPct);
  }
  if (totalSecondaryPct) {
    if (secondaryKey === "strength") pctStr += Math.round(prePctAbilities.strength * totalSecondaryPct);
    else if (secondaryKey === "agility") pctAgi += Math.round(prePctAbilities.agility * totalSecondaryPct);
    else if (secondaryKey === "intelligence") pctInt += Math.round(prePctAbilities.intelligence * totalSecondaryPct);
    else if (secondaryKey === "will") pctWil += Math.round(prePctAbilities.will * totalSecondaryPct);
  }

  const abilities = {
    strength: prePctAbilities.strength + pctStr,
    agility: prePctAbilities.agility + pctAgi,
    intelligence: prePctAbilities.intelligence + pctInt,
    will: prePctAbilities.will + pctWil,
  };

  function close() { setActiveSlot(null); }
  function handleRemove() { removeOperator(member.slotIndex); setActiveSlot(null); }
  function handleSelectWeapon(weapon: Weapon) { setWeapon(member.slotIndex, weapon); setWeaponPickerOpen(false); }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-8">
          {op.avatar ? (
            <img src={assetUrl(op.avatar)} alt={op.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: (el?.color ?? "#333") + "33", color: el?.color }}>{t(op.element.charAt(0).toUpperCase()+op.element.slice(1), lang)}</div>
          )}
          <div>
            <div className="font-semibold text-sm">{displayName(op, lang)}</div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-yellow-400">{"★".repeat(op.rarity)}</span>
              <span style={{ color: el?.color }}>{t(op.element.charAt(0).toUpperCase()+op.element.slice(1), lang)}</span>
              <span className="text-[var(--color-text-muted)]">{t(op.profession, lang)} · {t(op.weapon, lang)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onChangeOperator} className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> {t("operator.change", lang)}
          </button>
          <button onClick={handleRemove} className="text-[10px] text-red-400 hover:underline">{t("operator.remove", lang)}</button>
          <button onClick={close} className="text-[var(--color-text-muted)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-0 max-h-[75vh] overflow-auto">

        {/* ── Operator ── */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">{t("operator", lang)}</h3>
          <div className="flex items-center gap-8 text-xs flex-wrap">
            <span className="flex items-center gap-1 flex-1">
              <span className="text-[var(--color-text-muted)]">{t("level", lang)}</span>
              <select value={member.level} onChange={(e) => setLevel(member.slotIndex, Number(e.target.value))}
                className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                {LEVELS.map(lv=><option key={lv} value={lv}>{lv}</option>)}
              </select>
            </span>
            <span className="flex items-center gap-1 flex-1">
              <span className="text-[var(--color-text-muted)]">{t("potential", lang)}</span>
              <select value={member.potential} onChange={(e) => setPotential(member.slotIndex, Number(e.target.value))}
                className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                {[0,1,2,3,4,5].map(p=><option key={p} value={p}>{p}/5</option>)}
              </select>
            </span>
            {/* Attribute Talent */}
            <span className="flex items-center gap-1 flex-1">
              <span className="text-[var(--color-text-muted)] truncate" title={`天赋加成·${talentMeta?.attribute.name ?? t("talent", lang)}`}>天赋加成·{talentMeta?.attribute.name ?? t("talent", lang)}</span>
              <select value={member.talentStage} onChange={(e) => setTalentStage(member.slotIndex, Number(e.target.value))}
                className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                {Array.from({length: (talentMeta?.attribute.maxStage ?? 4) + 1}, (_, i) => i).map(s => <option key={s} value={s}>{s}/{talentMeta?.attribute.maxStage ?? 4}</option>)}
              </select>
            </span>
            {/* Talent Skill 1 */}
            {talentMeta?.skill1 && talentMeta.skill1.maxStage > 0 && (
              <span className="flex items-center gap-1 flex-1">
                <span className="text-[var(--color-text-muted)] truncate" title={`天赋技能1·${talentMeta.skill1.name}`}>天赋技能1·{talentMeta.skill1.name}</span>
                <select value={Math.min(member.talentSkill1Stage, talentMeta.skill1.maxStage)} onChange={(e) => setTalentSkill1Stage(member.slotIndex, Number(e.target.value))}
                  className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                  {Array.from({length: talentMeta.skill1.maxStage + 1}, (_, i) => i).map(s => <option key={s} value={s}>{s}/{talentMeta.skill1.maxStage}</option>)}
                </select>
              </span>
            )}
            {/* Talent Skill 2 */}
            {talentMeta?.skill2 && talentMeta.skill2.maxStage > 0 && (
              <span className="flex items-center gap-1 flex-1">
                <span className="text-[var(--color-text-muted)] truncate" title={`天赋技能2·${talentMeta.skill2.name}`}>天赋技能2·{talentMeta.skill2.name}</span>
                <select value={Math.min(member.talentSkill2Stage, talentMeta.skill2.maxStage)} onChange={(e) => setTalentSkill2Stage(member.slotIndex, Number(e.target.value))}
                  className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                  {Array.from({length: talentMeta.skill2.maxStage + 1}, (_, i) => i).map(s => <option key={s} value={s}>{s}/{talentMeta.skill2.maxStage}</option>)}
                </select>
              </span>
            )}
            {SKILL_LABELS.map((label, i) => (
              <span key={i} className="flex items-center gap-1 flex-1">
                <span className="text-[var(--color-text-muted)] truncate">{label}</span>
                <select value={member.skillRanks[i] ?? 12}
                  onChange={(e) => setSkillRank(member.slotIndex, i, Number(e.target.value))}
                  className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                  {SKILL_RANKS.map(r=><option key={r} value={r}>{r}/12</option>)}
                </select>
              </span>
            ))}
          </div>

          {/* Abilities */}
          {abilities.strength > 0 && (
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 mt-3 text-xs">
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("STR", lang)}</span><span className={VALUE}>{abilities.strength}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("AGI", lang)}</span><span className={VALUE}>{abilities.agility}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("INT", lang)}</span><span className={VALUE}>{abilities.intelligence}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("WIL", lang)}</span><span className={VALUE}>{abilities.will}</span></div>
            </div>
          )}
        </div>

        {/* ── Weapon ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">{t("weapon", lang)}</h3>
          {member.weapon ? (
            <button
              onClick={() => setWeaponPickerOpen(true)}
              className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition text-left w-full"
            >
              {member.weapon.cover ? (
                <img src={assetUrl(member.weapon.cover)} alt={member.weapon.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--color-border)] shrink-0" />
              )}
              <div className="flex items-center gap-8 min-w-0 flex-1 flex-wrap">
                <span className="text-xs font-medium truncate">{displayName(member.weapon, lang)}</span>
                <span className="flex items-center gap-1">
                  <span className="text-xs text-[var(--color-text-muted)]">{t("level", lang)}</span>
                  <select value={member.weaponLevel} onChange={(e) => setWeaponLevel(member.slotIndex, Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 w-14">
                    {LEVELS.map(lv=><option key={lv} value={lv}>{lv}</option>)}
                  </select>
                </span>
                {member.weapon.skills.map((skill, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-xs text-[var(--color-text-muted)] truncate" title={skill.name}>{(lang === "en" && skill.nameEn) ? skill.nameEn : skill.name}</span>
                    <select value={member.weaponSkillRanks[i] ?? 1}
                      onChange={(e) => setWeaponSkillRank(member.slotIndex, i, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 w-14">
                      {Array.from({length:skill.maxRank},(_,r)=>r+1).map(r => <option key={r} value={r}>{r}/{skill.maxRank}</option>)}
                    </select>
                  </span>
                ))}
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); setWeapon(member.slotIndex, null); }}
                className="text-[10px] text-red-400 hover:underline shrink-0"
              >{t("weapon.clear", lang)}</span>
            </button>
          ) : (
            <button onClick={() => setWeaponPickerOpen(true)}
              className="flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline">
              <Plus className="w-4 h-4" /> {t("weapon.select", lang)}
            </button>
          )}
        </div>

        {/* ── Gear ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">{t("gear", lang)}</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t("gear.armor", lang), gear: member.armor, slot: "Armor" as const },
              { label: t("gear.gloves", lang), gear: member.gloves, slot: "Gloves" as const },
              { label: t("gear.kit1", lang), gear: member.kit1, slot: "Kit" as const, ki: 0 },
              { label: t("gear.kit2", lang), gear: member.kit2, slot: "Kit" as const, ki: 1 },
            ].map(({ label, gear, slot, ki }) => (
              <button
                key={label}
                onClick={() => setGearPicker({ slot, kitIndex: ki })}
                className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition text-left"
              >
                <span className="text-xs text-[var(--color-text-muted)] shrink-0">{label}</span>
                {gear ? (
                  <div className="flex items-center gap-8 min-w-0 flex-1 flex-wrap">
                    {gear.cover && <img src={assetUrl(gear.cover)} alt={gear.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                    <span className="text-xs font-medium truncate">{displayName(gear, lang)}</span>
                    {gear.refinement.map((r, ri) => (
                      <span key={ri} className="flex items-center gap-1">
                        <span className="text-xs text-[var(--color-text-muted)]">{t(r.name, lang)}</span>
                        <select
                          value={gear.refinementRanks?.[ri] ?? 3}
                          onChange={(e) => {
                            e.stopPropagation();
                            const ranks = [...(gear.refinementRanks ?? gear.refinement.map(() => 3))];
                            ranks[ri] = Number(e.target.value);
                            const updated = { ...gear, refinementRanks: ranks };
                            if (slot === "Armor") setArmor(member.slotIndex, updated);
                            else if (slot === "Gloves") setGloves(member.slotIndex, updated);
                            else if (ki === 0) setKit1(member.slotIndex, updated);
                            else setKit2(member.slotIndex, updated);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1"
                        >
                          <option value={0}>0/3</option>
                          <option value={1}>1/3</option>
                          <option value={2}>2/3</option>
                          <option value={3}>3/3</option>
                        </select>
                      </span>
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (slot === "Armor") setArmor(member.slotIndex, null);
                        else if (slot === "Gloves") setGloves(member.slotIndex, null);
                        else if (ki === 0) setKit1(member.slotIndex, null);
                        else setKit2(member.slotIndex, null);
                      }}
                      className="text-[10px] text-red-400 hover:underline shrink-0 ml-auto"
                    >Clear</button>
                  </div>
                ) : (
                  <span className="text-xs italic text-[var(--color-text-muted)]">{t("gear.empty", lang)}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">{t("stats", lang)}</h3>

          {/* Basic Stats */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <HoverTooltip label={t("HP", lang)} value={Math.round(finalStats.hp)}>
              <div className="text-[var(--color-text-muted)]">{lang==="zh"?"基础":"Op Base"}<span className="text-white">{breakdown.opHp}</span></div>
              <div className="text-[var(--color-text-muted)]">{t("STR", lang)} ×5: <span className="text-white">+{breakdown.hpFromStr}</span></div>
              {breakdown.hpPercent > 0 && <div className="text-[var(--color-text-muted)]">HP%: <span className="text-white">×{1+breakdown.hpPercent}</span></div>}
              <div className="border-t border-[var(--color-border)] mt-1 pt-1 text-white font-medium">= {Math.round(finalStats.hp)}</div>
            </HoverTooltip>
            <HoverTooltip label={t("ATK", lang)} value={Math.round(finalStats.atk)}>
              <div className="text-[var(--color-text-muted)]">{lang==="zh"?"基础":"Op Base"}<span className="text-white">{breakdown.opBaseAtk}</span></div>
              <div className="text-[var(--color-text-muted)]">{lang==="zh"?"武器":"Weapon"}<span className="text-white">+{breakdown.weaponBaseAtk}</span></div>
              {breakdown.atkPercent > 0 && <div className="text-[var(--color-text-muted)]">{lang==="zh"?"攻击%":"ATK%"}<span className="text-white">×{1+breakdown.atkPercent}</span></div>}
              {breakdown.atkFlatBonus > 0 && <div className="text-[var(--color-text-muted)]">{lang==="zh"?"固定攻击":"Flat ATK"}<span className="text-white">+{breakdown.atkFlatBonus}</span></div>}
              <div className="text-[var(--color-text-muted)] mt-0.5">{lang==="zh"?"能力加成前":"Before Ability"}<span className="text-white">{breakdown.atkBeforeAbility}</span></div>
              <div className="text-[var(--color-text-muted)]">{lang==="zh"?"能力加成":"Ability"}<span className="text-white">×{1+breakdown.abilityAtkBonus}</span></div>
              <div className="border-t border-[var(--color-border)] mt-1 pt-1 text-white font-medium">= {Math.round(finalStats.atk)}</div>
            </HoverTooltip>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("DEF", lang)}</span><span className={VALUE}>{Math.round(finalStats.def)}</span></div>
          </div>

          {/* Other Stats (foldable) */}
          <details className="mt-2">
            <summary className={`${LABEL} cursor-pointer select-none`}>{t("stats.other", lang)}</summary>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2">
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Crit Rate", lang)}</span><span className={VALUE}>{(finalStats.critRate*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Crit DMG", lang)}</span><span className={VALUE}>{(finalStats.critDmg*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Arts Intensity", lang)}</span><span className={VALUE}>{finalStats.artsIntensity}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Phys Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.physicalResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Heat Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.heatResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Elec Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.electricResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Cryo Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.cryoResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Nature Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.natureResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("AEther Resist", lang)}</span><span className={VALUE}>{Math.round(finalStats.aetherResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Treat Bonus", lang)}</span><span className={VALUE}>{(finalStats.treatmentBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Treat Recv", lang)}</span><span className={VALUE}>{(finalStats.treatmentReceivedBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Combo CDR", lang)}</span><span className={VALUE}>{(finalStats.comboSkillCdReduction*100).toFixed(1)}%</span></div>
              <HoverTooltip label={t("Ult Gain Eff", lang)} value={(totalUltGainEff*100).toFixed(1)+'%'}>
                <div className="text-[var(--color-text-muted)]">{lang==="zh"?"基础":"Base"}<span className="text-white">100%</span></div>
                {wpBonus.ultimateGainEfficiency > 0 && <div className="text-[var(--color-text-muted)]">{lang==="zh"?"武器":"Weapon"}<span className="text-white">+{(wpBonus.ultimateGainEfficiency*100).toFixed(1)}%</span></div>}
                {gearUltGain > 0 && <div className="text-[var(--color-text-muted)]">{lang==="zh"?"装备":"Gear"}<span className="text-white">+{gearUltGain.toFixed(1)}%</span></div>}
                {synergyUltGain > 0 && <div className="text-[var(--color-text-muted)]">{lang==="zh"?"协同":"Synergy"}<span className="text-[var(--color-accent)]">+{(synergyUltGain*100).toFixed(1)}%</span></div>}
                <div className="border-t border-[var(--color-border)] mt-1 pt-1 text-white font-medium">= {(totalUltGainEff*100).toFixed(1)}%</div>
              </HoverTooltip>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Stagger Eff", lang)}</span><span className={VALUE}>{(finalStats.staggerEfficiencyBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Phys DMG+", lang)}</span><span className={VALUE}>{(finalStats.physicalDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Heat DMG+", lang)}</span><span className={VALUE}>{(finalStats.heatDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Elec DMG+", lang)}</span><span className={VALUE}>{(finalStats.electricDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Cryo DMG+", lang)}</span><span className={VALUE}>{(finalStats.cryoDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Nature DMG+", lang)}</span><span className={VALUE}>{(finalStats.natureDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Basic ATK DMG+", lang)}</span><span className={VALUE}>{(finalStats.basicDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Battle Skill DMG+", lang)}</span><span className={VALUE}>{(finalStats.battleSkillDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Combo Skill DMG+", lang)}</span><span className={VALUE}>{(finalStats.comboSkillDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Ult Skill DMG+", lang)}</span><span className={VALUE}>{(finalStats.ultimateDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Staggered DMG+", lang)}</span><span className={VALUE}>{(finalStats.staggeredDmgBonus*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Phys DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Heat DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Elec DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Cryo DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("Nature DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">{t("AEther DMG Reduc", lang)}</span><span className={VALUE}>{(finalStats.finalDmgReduction*100).toFixed(1)}%</span></div>
            </div>
          </details>
        </div>
      </div>

      <WeaponPicker
        open={weaponPickerOpen}
        onClose={() => setWeaponPickerOpen(false)}
        onSelect={handleSelectWeapon}
        weaponType={op.weapon}
      />
      <GearPicker
        open={gearPicker !== null}
        onClose={() => setGearPicker(null)}
        onSelect={handleSelectGear}
        slot={gearPicker?.slot || "Kit"}
      />
    </div>
  );
}
