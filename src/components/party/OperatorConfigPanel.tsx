import { useState } from "react";
import { X, RefreshCw, Plus } from "lucide-react";
import { usePartyStore } from "../../stores/partyStore";
import { getElements } from "../../engine/dataLoader";
import { computeFinalStats, getOperatorAbilitiesAtLevel, computeWeaponBonuses } from "../../engine/formulas";
import { WeaponPicker } from "./WeaponPicker";
import { GearPicker } from "./GearPicker";
import { assetUrl } from "../../lib/utils";
import type { PartyMember, Weapon, GearPiece } from "../../engine/types";

const LABEL = "text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide";
const VALUE = "text-sm font-medium tabular-nums";
const STAT_ROW = "flex justify-between items-center py-0.5";
const SECTION = "border-t border-[var(--color-border)] pt-4 mt-4 pb-1 first:border-t-0 first:pt-0 first:mt-0";

interface Props {
  member: PartyMember;
  onChangeOperator: () => void;
}

export function OperatorConfigPanel({ member, onChangeOperator }: Props) {
  const {
    setLevel, setSkillRank, setPotential,
    setWeapon, setWeaponLevel, setWeaponSkillRank,
    setArmor, setGloves, setKit1, setKit2,
    removeOperator, setActiveSlot,
  } = usePartyStore();

  const SKILL_LABELS = ["BaseAttack", "BattleSkill", "ComboSkill", "Ultimate"];
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

  const finalStats = computeFinalStats(op.id, member.level, member.potential, member.weapon, member.weaponLevel, member.weaponSkillRanks, {
    armor: member.armor,
    gloves: member.gloves,
    kit1: member.kit1,
    kit2: member.kit2,
  });
  const baseAbilities = getOperatorAbilitiesAtLevel(op.id, member.level, member.potential);
  const wpBonus = computeWeaponBonuses(member.weapon, member.weaponSkillRanks);

  // Compute gear ability bonuses, routing 主能力/副能力 to operator's declared primary/secondary
  const primaryKey = op.primaryAbility;
  const secondaryKey = op.secondaryAbility;
  const abilityKeyMap: Record<string, string> = { "力量": "strength", "敏捷": "agility", "智识": "intelligence", "意志": "will" };
  let gearAbilityBonus: Record<string, number> = { strength: 0, agility: 0, intelligence: 0, will: 0 };
  for (const gear of [member.armor, member.gloves, member.kit1, member.kit2]) {
    if (!gear || Object.keys(gear.baseStats).length === 0) continue;
    const ranks = gear.refinementRanks ?? gear.refinement.map(() => 3);
    const refinedNames = new Set(gear.refinement.map(r => r.name));
    // Process refined stats
    for (let ri = 0; ri < gear.refinement.length; ri++) {
      const r = gear.refinement[ri];
      const rank = ranks[ri] ?? 3;
      const rankKey = rank === 1 ? "rank1" : rank === 2 ? "rank2" : rank === 3 ? "rank3" : "base";
      const val = r[rankKey] || r.base;
      const numVal = parseFloat(String(val).replace(/[+%]/g, "")) || 0;
      if (r.name === "主能力") gearAbilityBonus[primaryKey] = (gearAbilityBonus[primaryKey] ?? 0) + numVal;
      else if (r.name === "副能力") gearAbilityBonus[secondaryKey] = (gearAbilityBonus[secondaryKey] ?? 0) + numVal;
      else if (abilityKeyMap[r.name]) gearAbilityBonus[abilityKeyMap[r.name]] += numVal;
    }
    // Process unrefined base stats
    for (const [statName, val] of Object.entries(gear.baseStats)) {
      if (refinedNames.has(statName)) continue;
      const numVal = parseFloat(String(val).replace(/[+%]/g, "")) || 0;
      if (statName === "主能力") gearAbilityBonus[primaryKey] = (gearAbilityBonus[primaryKey] ?? 0) + numVal;
      else if (statName === "副能力") gearAbilityBonus[secondaryKey] = (gearAbilityBonus[secondaryKey] ?? 0) + numVal;
      else if (abilityKeyMap[statName]) gearAbilityBonus[abilityKeyMap[statName]] += numVal;
    }
  }

  const abilities = {
    strength: baseAbilities.strength + wpBonus.strength + gearAbilityBonus.strength + (op.primaryAbility === "strength" ? (wpBonus.primaryAbility || 0) : 0),
    agility: baseAbilities.agility + wpBonus.agility + gearAbilityBonus.agility + (op.primaryAbility === "agility" ? (wpBonus.primaryAbility || 0) : 0),
    intelligence: baseAbilities.intelligence + wpBonus.intelligence + gearAbilityBonus.intelligence + (op.primaryAbility === "intelligence" ? (wpBonus.primaryAbility || 0) : 0),
    will: baseAbilities.will + wpBonus.will + gearAbilityBonus.will + (op.primaryAbility === "will" ? (wpBonus.primaryAbility || 0) : 0),
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
              style={{ backgroundColor: (el?.color ?? "#333") + "33", color: el?.color }}>{el?.name ?? "?"}</div>
          )}
          <div>
            <div className="font-semibold text-sm">{op.name}</div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-yellow-400">{"★".repeat(op.rarity)}</span>
              <span style={{ color: el?.color }}>{el?.name}</span>
              <span className="text-[var(--color-text-muted)]">{op.profession} · {op.weapon}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onChangeOperator} className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Change
          </button>
          <button onClick={handleRemove} className="text-[10px] text-red-400 hover:underline">Remove</button>
          <button onClick={close} className="text-[var(--color-text-muted)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-0 max-h-[75vh] overflow-auto">

        {/* ── Operator ── */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Operator</h3>
          <div className="flex items-center gap-8 text-xs">
            <span className="flex items-center gap-1 flex-1">
              <span className="text-[var(--color-text-muted)]">Lv</span>
              <select value={member.level} onChange={(e) => setLevel(member.slotIndex, Number(e.target.value))}
                className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                {LEVELS.map(lv=><option key={lv} value={lv}>{lv}</option>)}
              </select>
            </span>
            <span className="flex items-center gap-1 flex-1">
              <span className="text-[var(--color-text-muted)]">Potential</span>
              <select value={member.potential} onChange={(e) => setPotential(member.slotIndex, Number(e.target.value))}
                className="bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded px-1.5 py-1 flex-1">
                {[0,1,2,3,4,5].map(p=><option key={p} value={p}>{p}/5</option>)}
              </select>
            </span>
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
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">STR</span><span className={VALUE}>{abilities.strength}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">AGI</span><span className={VALUE}>{abilities.agility}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">INT</span><span className={VALUE}>{abilities.intelligence}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">WIL</span><span className={VALUE}>{abilities.will}</span></div>
            </div>
          )}
        </div>

        {/* ── Weapon ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Weapon</h3>
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
                <span className="text-xs font-medium truncate">{member.weapon.name}</span>
                <span className="flex items-center gap-1">
                  <span className="text-xs text-[var(--color-text-muted)]">Lv</span>
                  <select value={member.weaponLevel} onChange={(e) => setWeaponLevel(member.slotIndex, Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 w-14">
                    {LEVELS.map(lv=><option key={lv} value={lv}>{lv}</option>)}
                  </select>
                </span>
                {member.weapon.skills.map((skill, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-xs text-[var(--color-text-muted)] truncate" title={skill.name}>{skill.name}</span>
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
              >Clear</span>
            </button>
          ) : (
            <button onClick={() => setWeaponPickerOpen(true)}
              className="flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline">
              <Plus className="w-4 h-4" /> Select Weapon
            </button>
          )}
        </div>

        {/* ── Gear ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Gear</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Armor", gear: member.armor, slot: "Armor" as const },
              { label: "Gloves", gear: member.gloves, slot: "Gloves" as const },
              { label: "Kit 1", gear: member.kit1, slot: "Kit" as const, ki: 0 },
              { label: "Kit 2", gear: member.kit2, slot: "Kit" as const, ki: 1 },
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
                    <span className="text-xs font-medium truncate">{gear.name}</span>
                    {gear.refinement.map((r, ri) => (
                      <span key={ri} className="flex items-center gap-1">
                        <span className="text-xs text-[var(--color-text-muted)]">{r.name}</span>
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
                  <span className="text-xs italic text-[var(--color-text-muted)]">Empty</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className={SECTION}>
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Stats</h3>

          {/* Basic Stats */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">HP</span><span className={VALUE}>{Math.round(finalStats.hp)}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">ATK</span><span className={VALUE}>{Math.round(finalStats.atk)}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">DEF</span><span className={VALUE}>{Math.round(finalStats.def)}</span></div>
          </div>

          {/* Other Stats (foldable) */}
          <details className="mt-2">
            <summary className={`${LABEL} cursor-pointer select-none`}>Other Stats</summary>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2">
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Crit Rate</span><span className={VALUE}>{(finalStats.critRate * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Crit DMG</span><span className={VALUE}>{(finalStats.critDmg * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Arts Intensity</span><span className={VALUE}>{finalStats.artsIntensity}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Phys Resist</span><span className={VALUE}>{Math.round(finalStats.physicalResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Heat Resist</span><span className={VALUE}>{Math.round(finalStats.heatResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Elec Resist</span><span className={VALUE}>{Math.round(finalStats.electricResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Cryo Resist</span><span className={VALUE}>{Math.round(finalStats.cryoResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Nature Resist</span><span className={VALUE}>{Math.round(finalStats.natureResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">AEther Resist</span><span className={VALUE}>{Math.round(finalStats.aetherResistance)}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Treat Bonus</span><span className={VALUE}>{(finalStats.treatmentBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Treat Recv</span><span className={VALUE}>{(finalStats.treatmentReceivedBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Combo CDR</span><span className={VALUE}>{(finalStats.comboSkillCdReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Ult Gain Eff</span><span className={VALUE}>{(finalStats.ultimateGainEfficiency * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Stagger Eff</span><span className={VALUE}>{(finalStats.staggerEfficiencyBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Phys DMG+</span><span className={VALUE}>{(finalStats.physicalDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Heat DMG+</span><span className={VALUE}>{(finalStats.heatDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Elec DMG+</span><span className={VALUE}>{(finalStats.electricDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Cryo DMG+</span><span className={VALUE}>{(finalStats.cryoDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Nature DMG+</span><span className={VALUE}>{(finalStats.natureDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Basic ATK DMG+</span><span className={VALUE}>{(finalStats.basicDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Battle Skill DMG+</span><span className={VALUE}>{(finalStats.battleSkillDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Combo Skill DMG+</span><span className={VALUE}>{(finalStats.comboSkillDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Ult Skill DMG+</span><span className={VALUE}>{(finalStats.ultimateDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Staggered DMG+</span><span className={VALUE}>{(finalStats.staggeredDmgBonus * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Phys DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Heat DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Elec DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Cryo DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Nature DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">AEther DMG Reduc</span><span className={VALUE}>{(finalStats.finalDmgReduction * 100).toFixed(1)}%</span></div>
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
