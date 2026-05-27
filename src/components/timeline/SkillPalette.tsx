import { usePartyStore } from "../../stores/partyStore";
import { useTimelineStore } from "../../stores/timelineStore";
import type { Element } from "../../engine/types";

const ELEMENT_COLORS: Record<string, string> = {
  physical: "#c4a35a",
  heat: "#e87040",
  electric: "#f0c040",
  cryo: "#5bc0de",
  nature: "#6db36d",
};

const SKILL_TYPE_COLORS: Record<string, string> = {
  basic: "#8b9dc3",
  battle: "#e87040",
  combo: "#9b59b6",
  ultimate: "#f0c040",
};

function getSkillIcon(type: string): string {
  switch (type) {
    case "basic": return "⚔";
    case "battle": return "✦";
    case "combo": return "🔗";
    case "ultimate": return "★";
    default: return "•";
  }
}

interface SkillEntry {
  operatorId: string;
  operatorName: string;
  element: Element;
  skillId: string;
  skillName: string;
  type: "basic" | "battle" | "combo" | "ultimate";
  spCost: number;
  cooldown: number;
  ultimateCost: number;
  duration: number;
  multiplier: number;
  color: string;
}

function gatherSkills(): SkillEntry[] {
  const members = usePartyStore.getState().members;
  const entries: SkillEntry[] = [];

  for (const member of members) {
    if (!member.operator) continue;
    const op = member.operator;
    const skillRank = (member.skillRanks?.[0] ?? 1) - 1;

    // Basic attack
    if (op.attackSegments.length > 0) {
      const totalDuration = op.attackSegments.reduce((s, seg) => s + seg.duration, 0);
      entries.push({
        operatorId: op.id,
        operatorName: op.name,
        element: op.element,
        skillId: "basic",
        skillName: `Basic ATK (${op.attackSegments.length}-hit)`,
        type: "basic",
        spCost: 0,
        cooldown: 0,
        ultimateCost: 0,
        duration: totalDuration,
        multiplier: op.attackSegments[0]?.multipliers?.[skillRank] ?? 0,
        color: ELEMENT_COLORS[op.element] || "#888",
      });
    }

    // Battle skills
    for (const skill of op.skills) {
      entries.push({
        operatorId: op.id,
        operatorName: op.name,
        element: op.element,
        skillId: skill.id,
        skillName: skill.name || "Battle Skill",
        type: "battle",
        spCost: skill.spCost,
        cooldown: 0,
        ultimateCost: 0,
        duration: skill.duration,
        multiplier: skill.multipliers?.[skillRank] ?? 0,
        color: ELEMENT_COLORS[op.element] || "#888",
      });
    }

    // Combo/Link skill
    if (op.linkSkill) {
      entries.push({
        operatorId: op.id,
        operatorName: op.name,
        element: op.element,
        skillId: "combo",
        skillName: op.linkSkill.name || "Combo Skill",
        type: "combo",
        spCost: 0,
        cooldown: op.linkSkill.cooldown,
        ultimateCost: 0,
        duration: op.linkSkill.duration,
        multiplier: op.linkSkill.multipliers?.[skillRank] ?? 0,
        color: ELEMENT_COLORS[op.element] || "#888",
      });
    }

    // Ultimate
    if (op.ultimate) {
      entries.push({
        operatorId: op.id,
        operatorName: op.name,
        element: op.element,
        skillId: "ultimate",
        skillName: op.ultimate.name || "Ultimate",
        type: "ultimate",
        spCost: 0,
        cooldown: 0,
        ultimateCost: op.ultimate.gaugeMax,
        duration: op.ultimate.duration,
        multiplier: op.ultimate.multipliers?.[skillRank] ?? 0,
        color: ELEMENT_COLORS[op.element] || "#888",
      });
    }
  }

  return entries;
}

export function SkillPalette() {
  const selectedSkill = useTimelineStore((s) => s.selectedSkill);
  const setSelectedSkill = useTimelineStore((s) => s.setSelectedSkill);
  const tracks = useTimelineStore((s) => s.tracks);
  const addTrack = useTimelineStore((s) => s.addTrack);
  const partyMembers = usePartyStore((s) => s.members);

  const skills = gatherSkills();

  // Group skills by operator
  const grouped = new Map<string, { opName: string; element: Element; skills: SkillEntry[] }>();
  for (const s of skills) {
    if (!grouped.has(s.operatorId)) {
      grouped.set(s.operatorId, { opName: s.operatorName, element: s.element, skills: [] });
    }
    grouped.get(s.operatorId)!.skills.push(s);
  }

  const handleDragStart = (e: React.DragEvent, entry: SkillEntry) => {
    e.dataTransfer.setData("application/json", JSON.stringify({
      operatorId: entry.operatorId,
      skillId: entry.skillId,
      skillName: entry.skillName,
      type: entry.type,
      duration: entry.duration,
    }));
    e.dataTransfer.effectAllowed = "copy";
    setSelectedSkill({ operatorId: entry.operatorId, skillId: entry.skillId });
  };

  const isSelected = (opId: string, skillId: string) =>
    selectedSkill?.operatorId === opId && selectedSkill?.skillId === skillId;

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] min-w-[220px] max-w-[260px]">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Skills
      </h3>

      {partyMembers.filter(m => m.operator).length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Add operators in Setup tab first
        </p>
      )}

      {Array.from(grouped.entries()).map(([opId, group]) => (
        <div key={opId} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: ELEMENT_COLORS[group.element] || "#888" }}
            />
            <span className="text-xs font-medium text-[var(--color-text)] truncate">
              {group.opName}
            </span>
          </div>

          {group.skills.map((entry) => (
            <div
              key={`${entry.operatorId}-${entry.skillId}`}
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              onClick={() => {
                setSelectedSkill({ operatorId: entry.operatorId, skillId: entry.skillId });
                // Auto-add track if not present
                if (!tracks.some(t => t.operatorId === entry.operatorId)) {
                  addTrack(entry.operatorId);
                }
              }}
              className={`
                flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-grab
                hover:brightness-110 active:cursor-grabbing transition-all
                ${isSelected(entry.operatorId, entry.skillId)
                  ? "ring-2 ring-white/50 brightness-110"
                  : ""
                }
              `}
              style={{
                backgroundColor: SKILL_TYPE_COLORS[entry.type] + "33",
                borderLeft: `3px solid ${SKILL_TYPE_COLORS[entry.type]}`,
              }}
              title={`${entry.skillName}\nDMG: ${(entry.multiplier * 100).toFixed(0)}%` +
                (entry.spCost ? `\nSP: ${entry.spCost}` : "") +
                (entry.ultimateCost ? `\nEnergy: ${entry.ultimateCost}` : "") +
                (entry.cooldown ? `\nCD: ${entry.cooldown}s` : "")}
            >
              <span className="text-[10px]">{getSkillIcon(entry.type)}</span>
              <span className="flex-1 truncate">{entry.skillName}</span>
              {entry.ultimateCost > 0 && (
                <span className="text-[10px] opacity-60 font-mono text-[var(--color-accent)]">
                  {entry.ultimateCost}⚡
                </span>
              )}
              {entry.spCost > 0 && (
                <span className="text-[10px] opacity-60 font-mono">
                  {entry.spCost}SP
                </span>
              )}
              <span className="text-[10px] opacity-60 font-mono">
                {(entry.multiplier * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      ))}

      {skills.length > 0 && (
        <div className="mt-1 pt-2 border-t border-[var(--color-border)]">
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            Click a skill to select, then click on a timeline track to place it.
            Or drag skills directly onto tracks.
          </p>
        </div>
      )}
    </div>
  );
}
