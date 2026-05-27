import { useCallback, useEffect, useMemo, useState } from "react";
import { Timeline } from "../components/timeline/Timeline";
import { SkillPalette } from "../components/timeline/SkillPalette";
import { DPSResults } from "../components/dps/DPSResults";
import { RuntimeContext } from "../components/dps/RuntimeContext";
import { EnemySelector } from "../components/timeline/EnemySelector";
import { useTimelineStore } from "../stores/timelineStore";
import { usePartyStore } from "../stores/partyStore";
import { computeFinalStats, computePartySynergies, applySynergyBonuses } from "../engine/formulas";
import type { PartyMemberInfo } from "../engine/formulas";
import type { EnemyDef } from "../engine/enemyTypes";
import type { Operator, Stats, EnemyType } from "../engine/types";
import enemyData from "../data/enemies.json";

const ENEMY_TYPE_LABELS: Record<EnemyType, string> = {
  common: "Common",
  advanced: "Advanced",
  elite: "Elite",
  boss: "Boss",
};

export function SimulatorPage() {
  const tracks = useTimelineStore((s) => s.tracks);
  const fps = useTimelineStore((s) => s.fps);
  const simulationResult = useTimelineStore((s) => s.simulationResult);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const setCurrentFrame = useTimelineStore((s) => s.setCurrentFrame);
  const runSim = useTimelineStore((s) => s.runSim);
  const resetSimulation = useTimelineStore((s) => s.resetSimulation);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const clearTracks = useTimelineStore((s) => s.clearTracks);
  const getTarget = useTimelineStore((s) => s.getTarget);
  const loadEnemyDefs = useTimelineStore((s) => s.loadEnemyDefs);
  const enemyDefs = useTimelineStore((s) => s.enemyDefs);
  const enemyConfig = useTimelineStore((s) => s.enemyConfig);
  const setEnemyConfig = useTimelineStore((s) => s.setEnemyConfig);
  const partyMembers = usePartyStore((s) => s.members);

  // Load enemy definitions on mount and auto-select first enemy
  useEffect(() => {
    const defs = enemyData as EnemyDef[];
    loadEnemyDefs(defs);
    if (!enemyConfig.enemyId && defs.length > 0) {
      setEnemyConfig({ source: "existing", enemyId: defs[0].id });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => getTarget(), [getTarget, enemyDefs, enemyConfig]);
  const [showEnemyPanel, setShowEnemyPanel] = useState(false);

  const filledMembers = useMemo(() => partyMembers.filter(m => m.operator), [partyMembers]);

  // Sync tracks with party members: add tracks for new members, remove for removed ones.
  useEffect(() => {
    const existingTracks = useTimelineStore.getState().tracks;
    const activeOpIds = new Set(filledMembers.map(m => m.operator!.id));
    // Remove tracks for operators no longer in party
    const filtered = existingTracks.filter(t => activeOpIds.has(t.operatorId));
    // Add tracks for new party members
    let needsUpdate = filtered.length !== existingTracks.length;
    for (const member of filledMembers) {
      if (!member.operator) continue;
      if (!filtered.some(t => t.operatorId === member.operator!.id)) {
        filtered.push({ operatorId: member.operator!.id, blocks: [] });
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      useTimelineStore.setState({ tracks: filtered });
    }
  }, [filledMembers]);

  // Validation warnings
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (filledMembers.length === 0) {
      w.push("No operators in party. Add operators in the Setup tab first.");
    }
    for (const member of filledMembers) {
      if (!member.operator) continue;
      const op = member.operator;
      if (op.attackSegments.length === 0 && op.skills.length === 0) {
        w.push(`${op.name}: has no skill data`);
      }
    }
    return w;
  }, [filledMembers]);

  const handleRun = useCallback(() => {
    // First pass: compute individual stats
    const individualStats = new Map<string, Stats>();
    for (const member of partyMembers) {
      if (!member.operator) continue;
      const operator: Operator = member.operator;

      let stats: Stats;
      if (member.finalStats) {
        stats = member.finalStats;
      } else {
        const result = computeFinalStats(
          operator.id,
          member.level,
          member.potential,
          member.talentStage,
          member.weapon,
          member.weaponLevel,
          member.weaponSkillRanks,
          {
            armor: member.armor,
            gloves: member.gloves,
            kit1: member.kit1,
            kit2: member.kit2,
          },
        );
        stats = result.stats;
      }

      individualStats.set(operator.id, stats);
    }

    // Second pass: compute party synergies
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

    // Apply synergies and build opData
    const opData = new Map();
    for (const member of partyMembers) {
      if (!member.operator) continue;
      const operator: Operator = member.operator;
      const stats = individualStats.get(operator.id)!;
      const finalStats = applySynergyBonuses(stats, synergyBonuses.get(operator.id));

      opData.set(operator.id, {
        operator,
        stats: finalStats,
        skillRanks: member.skillRanks,
        level: member.level,
      });
    }

    runSim(opData);
    setIsPlaying(true);
  }, [partyMembers, runSim, setIsPlaying]);

  const maxFrame = simulationResult?.totalFrames ?? 0;

  // Keyboard frame scrubbing
  useEffect(() => {
    if (!simulationResult) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") setCurrentFrame(Math.min(currentFrame + 1, maxFrame));
      if (e.key === "ArrowLeft") setCurrentFrame(Math.max(0, currentFrame - 1));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [simulationResult, currentFrame, maxFrame, setCurrentFrame]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] flex-wrap">
        <button
          onClick={() => {
            if (!simulationResult) {
              handleRun();
            } else if (currentFrame >= simulationResult.totalFrames) {
              setCurrentFrame(0);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
          disabled={tracks.filter(t => t.blocks.length > 0).length === 0}
          className="px-4 py-1.5 rounded text-sm font-medium bg-[var(--color-accent)] text-white min-w-[160px]
            hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {!simulationResult ? "▶ Run Simulation"
            : currentFrame >= simulationResult.totalFrames ? "↺ Replay"
            : isPlaying ? "⏸ Pause"
            : "▶ Resume"}
        </button>

        {/* Party SP indicator */}
        <div className="flex items-center gap-1.5 text-xs" title="Shared party SP (3 bars max)">
          <span className="text-[var(--color-text-muted)]">SP</span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => {
              const frame = simulationResult?.frames?.[currentFrame];
              const sp = frame?.operators ? Object.values(frame.operators)[0]?.currentSP ?? 2 : 2;
              const filled = i < Math.floor(sp);
              const partial = !filled && i < Math.ceil(sp) && sp % 1 > 0;
              return (
                <div key={i} className="w-3 h-3 rounded-sm border border-[var(--color-border)]"
                  style={{
                    backgroundColor: filled ? 'var(--color-accent)' : partial ? 'var(--color-accent)' : 'transparent',
                    opacity: partial ? 0.4 : filled ? 1 : 0.2,
                  }}
                />
              );
            })}
          </div>
        </div>

        {simulationResult && (
          <>
            <button
              onClick={resetSimulation}
              className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)]
                text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
            >
              ↺ Reset
            </button>

            <button
              onClick={() => {
                const json = JSON.stringify(simulationResult, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'simulation_result.json'; a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 rounded text-sm bg-[var(--color-surface)] border border-[var(--color-border)]
                text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
              title="Export results as JSON"
            >
              ⤓ Export
            </button>

            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-[var(--color-text-muted)]">Frame:</span>
              <input
                type="range"
                min={0}
                max={maxFrame}
                value={currentFrame}
                onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
                className="w-32 h-1 accent-[var(--color-accent)]"
              />
              <input
                type="number"
                min={0}
                max={maxFrame}
                value={currentFrame}
                onChange={(e) => setCurrentFrame(parseInt(e.target.value) || 0)}
                className="w-16 px-1 py-0.5 text-xs font-mono rounded bg-[var(--color-surface)]
                  border border-[var(--color-border)] text-[var(--color-text)] text-center"
              />
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                / {maxFrame}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] ml-1">
                ({(currentFrame / fps).toFixed(1)}s)
              </span>
            </div>

            <div className="ml-auto text-xs text-[var(--color-text-muted)]">
              ← → step frame
            </div>
          </>
        )}

        {tracks.length > 0 && (
          <button
            onClick={clearTracks}
            className="px-3 py-1.5 rounded text-sm text-[var(--color-text-muted)]
              hover:text-[var(--color-text)] transition-colors"
            title="Remove all tracks and blocks"
          >
            Clear All
          </button>
        )}

        {/* Enemy selector */}
        <div className="ml-auto relative">
          <button
            onClick={() => setShowEnemyPanel(!showEnemyPanel)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-[var(--color-surface)] border border-[var(--color-border)]
              text-[var(--color-text)] hover:border-[var(--color-accent)]/50 transition-colors"
          >
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Target:</span>
            <span className="text-[var(--color-accent)]">
              {target.def} DEF
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              | {ENEMY_TYPE_LABELS[target.enemyType]}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] ml-0.5">{showEnemyPanel ? "▲" : "▼"}</span>
          </button>
          {showEnemyPanel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowEnemyPanel(false)} />
              <div className="absolute right-0 top-full mt-1 w-72 z-50 p-2 rounded bg-[var(--color-surface-alt)] border border-[var(--color-border)] shadow-lg">
                <EnemySelector />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Validation warnings */}
      {warnings.length > 0 && !simulationResult && (
        <div className="px-4 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30">
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-[var(--color-accent)] flex items-center gap-1">
              <span>⚠</span> {w}
            </div>
          ))}
        </div>
      )}

      {/* Hint when tracks exist but no blocks */}
      {!simulationResult && tracks.length > 0 && tracks.every(t => t.blocks.length === 0) && (
        <div className="px-4 py-2 bg-[var(--color-surface-alt)] border-b border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-muted)]">
            Click skills in the palette to place them on the timeline, then run simulation.
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-shrink-0 overflow-y-auto border-r border-[var(--color-border)] p-2">
          <SkillPalette />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <Timeline />
          {simulationResult && <RuntimeContext />}
          <DPSResults />
        </div>
      </div>
    </div>
  );
}
