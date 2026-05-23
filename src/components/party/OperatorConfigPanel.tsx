import { useState } from "react";
import { X, RefreshCw, Plus } from "lucide-react";
import { usePartyStore } from "../../stores/partyStore";
import { getElements } from "../../engine/dataLoader";
import { computeFinalStats, getOperatorAbilitiesAtLevel } from "../../engine/formulas";
import { WeaponPicker } from "./WeaponPicker";
import { assetUrl } from "../../lib/utils";
import type { PartyMember, Weapon } from "../../engine/types";

const LABEL = "text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide";
const VALUE = "text-sm font-medium tabular-nums";
const STAT_ROW = "flex justify-between items-center py-0.5";

interface Props {
  member: PartyMember;
  onChangeOperator: () => void;
}

export function OperatorConfigPanel({ member, onChangeOperator }: Props) {
  const {
    setLevel, setSkillRank, setPotential,
    setWeapon, setWeaponLevel, setWeaponSkillRank,
    setGearAssembly, removeOperator, setActiveSlot,
  } = usePartyStore();

  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false);

  const op = member.operator!;
  const el = getElements()[op.element];

  const finalStats = computeFinalStats(op.id, member.level, member.weapon, member.weaponLevel);
  const abilities = getOperatorAbilitiesAtLevel(op.id, member.level);

  function close() { setActiveSlot(null); }

  function handleRemove() {
    removeOperator(member.slotIndex);
    setActiveSlot(null);
  }

  function handleSelectWeapon(weapon: Weapon) {
    setWeapon(member.slotIndex, weapon);
    setWeaponPickerOpen(false);
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <h3 className="font-semibold text-sm">Operator Config</h3>
        <button onClick={close} className="text-[var(--color-text-muted)] hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
        {/* Operator identity */}
        <div className="flex items-center gap-3">
          {op.avatar ? (
            <img src={assetUrl(op.avatar)} alt={op.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
              style={{ backgroundColor: (el?.color ?? "#333") + "33", color: el?.color }}>
              {el?.name ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold">{op.name}</div>
            <div className="flex items-center gap-2 text-xs mt-0.5">
              <span className="text-yellow-400">{"★".repeat(op.rarity)}</span>
              <span style={{ color: el?.color }}>{el?.name}</span>
              <span className="text-[var(--color-text-muted)]">{op.profession}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={onChangeOperator} className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Change
              </button>
              <button onClick={handleRemove} className="text-[10px] text-red-400 hover:underline">
                Remove
              </button>
            </div>
          </div>
        </div>

        {/* Config grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Operator Level */}
          <div>
            <label className={LABEL}>Level</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={1} max={90} value={member.level}
                onChange={(e) => setLevel(member.slotIndex, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)] h-1" />
              <span className={VALUE}>{member.level}</span>
            </div>
          </div>

          {/* Skill Rank */}
          <div>
            <label className={LABEL}>Skill Rank</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={1} max={12} value={member.skillRank}
                onChange={(e) => setSkillRank(member.slotIndex, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)] h-1" />
              <span className={VALUE}>{member.skillRank}</span>
            </div>
          </div>

          {/* Potential */}
          <div>
            <label className={LABEL}>Potential</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={0} max={6} value={member.potential}
                onChange={(e) => setPotential(member.slotIndex, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)] h-1" />
              <span className={VALUE}>{member.potential}</span>
            </div>
          </div>

          {/* Weapon selector */}
          <div>
            <label className={LABEL}>Weapon</label>
            {member.weapon ? (
              <div className="flex items-center gap-2 mt-1">
                {member.weapon.cover ? (
                  <img src={assetUrl(member.weapon.cover)} alt={member.weapon.name} className="w-8 h-8 rounded object-cover shrink-0" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{member.weapon.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {member.weapon.rarity}★ · ATK {member.weapon.baseAtkLv1}→{member.weapon.baseAtkLv90}
                  </div>
                </div>
                <button
                  onClick={() => setWeapon(member.slotIndex, null)}
                  className="text-[10px] text-red-400 hover:underline shrink-0"
                >Clear</button>
              </div>
            ) : (
              <button
                onClick={() => setWeaponPickerOpen(true)}
                className="flex items-center gap-1 mt-1 text-xs text-[var(--color-accent)] hover:underline"
              >
                <Plus className="w-3 h-3" /> Select Weapon
              </button>
            )}
          </div>

          {/* Weapon Level */}
          <div>
            <label className={LABEL}>Weapon Lv</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={1} max={90} value={member.weaponLevel}
                onChange={(e) => setWeaponLevel(member.slotIndex, Number(e.target.value))}
                className="flex-1 accent-[var(--color-accent)] h-1" />
              <span className={VALUE}>{member.weaponLevel}</span>
            </div>
          </div>

          {/* Weapon Skill Ranks */}
          {member.weapon && member.weapon.skills.length > 0 && (
            <>
              {member.weapon.skills.map((skill, i) => (
                <div key={i}>
                  <label className={LABEL}>{skill.name} Rank</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="range" min={1} max={skill.maxRank}
                      value={member.weaponSkillRanks[i] ?? 1}
                      onChange={(e) => setWeaponSkillRank(member.slotIndex, i, Number(e.target.value))}
                      className="flex-1 accent-[var(--color-accent)] h-1" />
                    <span className={VALUE}>{member.weaponSkillRanks[i] ?? 1}/{skill.maxRank}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Gear */}
          <div>
            <label className={LABEL}>Gear</label>
            <div className="text-sm text-[var(--color-text-muted)] mt-1 italic">Empty</div>
          </div>

          {/* Gear Assembly */}
          <div>
            <label className={LABEL}>Gear Assembly</label>
            <div className="flex gap-1 mt-1">
              {(["none", "partial", "full"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setGearAssembly(member.slotIndex, a)}
                  className={`flex-1 text-xs py-1 rounded border transition capitalize ${
                    member.gearAssembly === a
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]"
                  }`}
                >{a}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Basic Stats */}
        <div className="border-t border-[var(--color-border)] pt-3">
          <h4 className={`${LABEL} mb-2`}>Basic Stats</h4>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">HP</span><span className={VALUE}>{Math.round(finalStats.hp)}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">ATK</span><span className={VALUE}>{Math.round(finalStats.atk)}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">DEF</span><span className={VALUE}>{Math.round(finalStats.def)}</span></div>
          </div>
        </div>

        {/* Ability Scores */}
        {abilities.strength > 0 && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <h4 className={`${LABEL} mb-2`}>Abilities</h4>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs">
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">STR</span><span className={VALUE}>{abilities.strength}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">AGI</span><span className={VALUE}>{abilities.agility}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">INT</span><span className={VALUE}>{abilities.intelligence}</span></div>
              <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">WIL</span><span className={VALUE}>{abilities.will}</span></div>
            </div>
          </div>
        )}

        {/* Other Stats (foldable) */}
        <details className="border-t border-[var(--color-border)] pt-3">
          <summary className={`${LABEL} cursor-pointer select-none`}>Other Stats</summary>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs mt-2">
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Crit Rate</span><span className={VALUE}>{(finalStats.critRate * 100).toFixed(1)}%</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Crit DMG</span><span className={VALUE}>{(finalStats.critDmg * 100).toFixed(1)}%</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Arts Intensity</span><span className={VALUE}>{finalStats.artsIntensity}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Phys Resist</span><span className={VALUE}>{finalStats.physicalResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Heat Resist</span><span className={VALUE}>{finalStats.heatResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Elec Resist</span><span className={VALUE}>{finalStats.electricResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Cryo Resist</span><span className={VALUE}>{finalStats.cryoResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Nature Resist</span><span className={VALUE}>{finalStats.natureResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">AEther Resist</span><span className={VALUE}>{finalStats.aetherResistance}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Treat Bonus</span><span className={VALUE}>{finalStats.treatmentBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Treat Recv</span><span className={VALUE}>{finalStats.treatmentReceivedBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Combo CDR</span><span className={VALUE}>{finalStats.comboSkillCdReduction}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Ult Gain Eff</span><span className={VALUE}>{(finalStats.ultimateGainEfficiency * 100).toFixed(0)}%</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Stagger Eff</span><span className={VALUE}>{finalStats.staggerEfficiencyBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Phys DMG+</span><span className={VALUE}>{finalStats.physicalDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Heat DMG+</span><span className={VALUE}>{finalStats.heatDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Elec DMG+</span><span className={VALUE}>{finalStats.electricDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Cryo DMG+</span><span className={VALUE}>{finalStats.cryoDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Nature DMG+</span><span className={VALUE}>{finalStats.natureDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Basic DMG+</span><span className={VALUE}>{finalStats.basicDmgBonus}</span></div>
            <div className={STAT_ROW}><span className="text-[var(--color-text-muted)]">Ult DMG+</span><span className={VALUE}>{finalStats.ultimateDmgBonus}</span></div>
          </div>
        </details>

        <p className="text-[9px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
          HP/ATK from wiki data. Other stats use game defaults.
        </p>
      </div>

      <WeaponPicker
        open={weaponPickerOpen}
        onClose={() => setWeaponPickerOpen(false)}
        onSelect={handleSelectWeapon}
        weaponType={op.weapon}
      />
    </div>
  );
}
