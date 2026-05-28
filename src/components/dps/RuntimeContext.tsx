import { useTimelineStore } from "../../stores/timelineStore";
import { usePartyStore } from "../../stores/partyStore";
import { getOperatorById } from "../../engine/dataLoader";
import { useMemo } from "react";

function formatNumber(n: number): string {
  if (n >= 10_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 100_000) return (n / 1_000).toFixed(1) + "K";
  return Math.floor(n).toString();
}

export function RuntimeContext() {
  const simulationResult = useTimelineStore((s) => s.simulationResult);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const partyMembers = usePartyStore((s) => s.members);

  const frameData = simulationResult?.frames?.[currentFrame] ?? null;

  // Accumulate damage per operator up to current frame
  const cumDamage = useMemo(() => {
    if (!simulationResult) return new Map<string, number>();
    const dmg = new Map<string, number>();
    for (let f = 0; f <= Math.min(currentFrame, simulationResult.frames.length - 1); f++) {
      for (const evt of simulationResult.frames[f].events) {
        if (evt.type === "damage" && evt.damage) {
          dmg.set(evt.operatorId, (dmg.get(evt.operatorId) || 0) + evt.damage);
        }
      }
    }
    return dmg;
  }, [simulationResult, currentFrame]);

  if (!simulationResult || !frameData) {
    return null;
  }

  const totalDmg = [...cumDamage.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Runtime Context
        </h3>
        <div className="flex items-center gap-3">
          {/* Party SP */}
          <div className="flex items-center gap-1" title={`Party SP: ${frameData.operators ? Object.values(frameData.operators)[0]?.currentSP ?? 2 : 2}`}>
            <span className="text-[10px] text-[var(--color-text-muted)]">SP</span>
            <div className="flex gap-0.5">
              {[0, 1, 2].map(i => {
                const sp = Object.values(frameData.operators)[0]?.currentSP ?? 2;
                const filled = i < Math.floor(sp);
                const partial = !filled && i < Math.ceil(sp) && sp % 1 > 0;
                return (
                  <div key={i} className="w-2.5 h-2.5 rounded-sm border border-[var(--color-border)]"
                    style={{
                      backgroundColor: filled ? 'var(--color-accent)' : partial ? 'var(--color-accent)' : 'transparent',
                      opacity: partial ? 0.4 : filled ? 1 : 0.2,
                    }}
                  />
                );
              })}
            </div>
          </div>
          <span className="text-[10px] font-mono text-[var(--color-accent)]">
            t={frameData.time.toFixed(2)}s &middot; frame {currentFrame}/{simulationResult.totalFrames}
            &middot; Σ {formatNumber(totalDmg)} dmg
          </span>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(frameData.operators).map(([opId, snap]) => {
          const opName = getOperatorById(opId)?.name || opId;
          const opDmg = cumDamage.get(opId) || 0;
          const member = partyMembers.find(m => m.operator?.id === opId);
          const maxEnergy = member?.operator?.ultimate?.gaugeMax ?? 80;

          return (
            <div key={opId} className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[var(--color-text)] truncate">{opName}</span>
                <span className="text-[10px] font-mono text-[var(--color-accent)]">{formatNumber(opDmg)}</span>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">SP</span>
                  <span className="font-mono">{snap.currentSP}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Energy</span>
                  <span className="font-mono">{snap.currentEnergy}/{maxEnergy}</span>
                </div>

                {snap.isCasting && (
                  <div className="text-[var(--color-accent)] text-[10px] leading-tight">
                    Casting: {snap.castingSkillId}<br />
                    <span className="opacity-70">{snap.castingProgress.toFixed(1)}s</span>
                  </div>
                )}

                {Object.entries(snap.activeCooldowns).map(([sk, cd]) => (
                  <div key={sk} className="flex justify-between">
                    <span className="text-[var(--color-text-muted)]">CD {sk}</span>
                    <span className="font-mono">{cd.toFixed(1)}s</span>
                  </div>
                ))}

                {snap.comboSkillReady && (
                  <div className="text-[var(--color-accent)]">Combo Ready</div>
                )}

                {snap.activeBuffs.filter(b => b.remaining > 0 && b.maxDuration < 999).slice(0, 4).map((b, i) => {
                  const justTriggered = b.maxDuration - b.remaining < 0.5;
                  return (
                  <div key={i} className={`truncate text-[9px] ${justTriggered ? "text-green-400 font-bold" : "text-[var(--color-accent)]"}`}
                    title={`${b.name} (${b.remaining.toFixed(1)}s)${justTriggered ? " — JUST TRIGGERED" : ""}`}>
                    {justTriggered ? "✦ " : ""}{b.name} ({b.remaining.toFixed(1)}s)
                  </div>
                  );
                })}
                {snap.activeBuffs.filter(b => b.remaining > 0 && b.maxDuration < 999).length > 4 && (
                  <div className="text-[var(--color-text-muted)] text-[9px]">
                    +{snap.activeBuffs.filter(b => b.remaining > 0 && b.maxDuration < 999).length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Target status */}
        <div className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="text-[11px] font-medium text-[var(--color-text)] mb-1.5">Target</div>
          <div className="space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Stagger</span>
              <span className="font-mono">{frameData.targetStagger}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Status</span>
              <span className={frameData.targetStaggered ? "text-[var(--color-accent)]" : "font-mono"}>
                {frameData.targetStaggered ? "STAGGERED" : "Normal"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Events at current frame */}
      {frameData.events.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[10px] font-medium text-[var(--color-text-muted)] mb-1">
            Events ({frameData.events.length})
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {frameData.events.map((evt, i) => {
              const typeColor =
                evt.type === "damage" ? (evt.isCrit ? "text-yellow-300" : "text-[var(--color-accent)]") :
                evt.type === "buff_apply" ? "text-green-400" :
                evt.type === "buff_expire" ? "text-gray-400" :
                evt.type === "skill_start" ? "text-blue-400" :
                evt.type === "skill_end" ? "text-blue-300" :
                evt.type === "stagger" ? "text-orange-400" :
                evt.type === "combo_ready" ? "text-purple-400" :
                "text-[var(--color-text-muted)]";
              return (
              <div key={i} className="text-[10px] font-mono text-[var(--color-text)] flex gap-2">
                <span className={`shrink-0 ${typeColor}`}>[{evt.type}]</span>
                <span className="truncate">{evt.operatorId || "sys"}</span>
                {evt.damage && (
                  <span className={`shrink-0 ${evt.isCrit ? "text-yellow-300 font-bold" : "text-[var(--color-accent)]"}`}>
                    {formatNumber(evt.damage)}{evt.isCrit ? " CRIT" : ""}
                  </span>
                )}
                {evt.detail && (
                  <span className="text-[var(--color-text-muted)] truncate hidden sm:inline">{evt.detail}</span>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
