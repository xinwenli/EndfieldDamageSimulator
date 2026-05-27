import { useState, useRef, useCallback, useEffect } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { usePartyStore } from "../../stores/partyStore";
import type { TimelineBlock } from "../../engine/types";

const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 24;
const BLOCK_HEIGHT = 34;
const BLOCK_RADIUS = 4;

const ELEMENT_COLORS: Record<string, string> = {
  physical: "#c4a35a",
  heat: "#e87040",
  electric: "#f0c040",
  cryo: "#5bc0de",
  nature: "#6db36d",
};

const TYPE_COLORS: Record<string, string> = {
  basic: "#8b9dc3",
  battle: "#e87040",
  combo: "#9b59b6",
  ultimate: "#f0c040",
  skill_1: "#e87040",
  skill_2: "#e55d30",
};

function getBlockColor(block: TimelineBlock): string {
  if (block.skillId === "basic") return TYPE_COLORS.basic;
  if (block.skillId === "combo") return TYPE_COLORS.combo;
  if (block.skillId === "ultimate") return TYPE_COLORS.ultimate;
  return TYPE_COLORS[block.skillId] || TYPE_COLORS.battle;
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatNumber(n: number): string {
  if (n >= 10_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 100_000) return (n / 1_000).toFixed(1) + "K";
  return Math.floor(n).toString();
}

export function Timeline() {
  const tracks = useTimelineStore((s) => s.tracks);
  const fps = useTimelineStore((s) => s.fps);
  const zoom = useTimelineStore((s) => s.zoom);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const simulationResult = useTimelineStore((s) => s.simulationResult);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const setCurrentFrame = useTimelineStore((s) => s.setCurrentFrame);
  const selectedSkill = useTimelineStore((s) => s.selectedSkill);
  const setSelectedSkill = useTimelineStore((s) => s.setSelectedSkill);
  const addBlock = useTimelineStore((s) => s.addBlock);
  const moveBlock = useTimelineStore((s) => s.moveBlock);
  const removeBlock = useTimelineStore((s) => s.removeBlock);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const partyMembers = usePartyStore((s) => s.members);

  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOrigFrame, setDragOrigFrame] = useState(0);

  // Calculate time range
  const maxFrames = simulationResult
    ? simulationResult.totalFrames
    : tracks.reduce((max, t) => {
        for (const b of t.blocks) {
          const end = b.startFrame + b.duration;
          if (end > max) max = end;
        }
        return max;
      }, 30);
  const totalSeconds = Math.max(maxFrames / fps, 10);
  const canvasWidth = totalSeconds * zoom;
  const totalWidth = canvasWidth + 120; // label column

  // Time markers
  const timeMarkers: number[] = [];
  const markerInterval = totalSeconds > 60 ? 10 : totalSeconds > 30 ? 5 : 1;
  for (let t = 0; t <= totalSeconds; t += markerInterval) {
    timeMarkers.push(t);
  }

  // Find operator name
  const getOperatorName = (opId: string) => {
    const member = partyMembers.find(m => m.operator?.id === opId);
    return member?.operator?.name || opId;
  };
  const getOperatorElement = (opId: string): string | undefined => {
    const member = partyMembers.find(m => m.operator?.id === opId);
    return member?.operator?.element;
  };

  // Handle click on track to place skill
  const handleTrackClick = (e: React.MouseEvent, opId: string) => {
    if (!selectedSkill || selectedSkill.operatorId !== opId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - 120; // subtract label column
    const second = Math.max(0, x / zoom);
    const duration = getSkillDuration(selectedSkill.skillId, opId);
    addBlock(opId, selectedSkill.skillId, second, duration, getSkillLabel(selectedSkill.skillId, opId));
  };

  // Handle drop from palette
  const handleDrop = (e: React.DragEvent, opId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.operatorId !== opId) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left - 120;
      const second = Math.max(0, x / zoom);
      addBlock(opId, data.skillId, second, data.duration, data.skillName);
      setSelectedSkill(null);
    } catch {}
  };

  // Handle block drag start
  const handleBlockMouseDown = (e: React.MouseEvent, block: TimelineBlock) => {
    e.stopPropagation();
    setDraggingBlock(block.id);
    setDragStartX(e.clientX);
    setDragOrigFrame(block.startFrame);
  };

  // Global mouse move/up for block dragging
  useEffect(() => {
    if (!draggingBlock) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX;
      const frameDelta = Math.round(dx / zoom * fps);
      moveBlock(draggingBlock, dragOrigFrame + frameDelta);
    };
    const handleUp = () => setDraggingBlock(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingBlock, dragStartX, dragOrigFrame, zoom, fps, moveBlock]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || !simulationResult) return;
    const maxFrame = simulationResult.totalFrames;
    let rafId: number;
    let lastTime = performance.now();
    const frameInterval = 1000 / fps; // real-time playback at simulation fps

    const tick = (now: number) => {
      const elapsed = now - lastTime;
      if (elapsed >= frameInterval) {
        lastTime = now - (elapsed % frameInterval);
        const next = useTimelineStore.getState().currentFrame + 1;
        if (next > maxFrame) {
          setIsPlaying(false);
          return;
        }
        setCurrentFrame(next);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, simulationResult, fps, setIsPlaying, setCurrentFrame]);

  // Scroll to scrubber position
  const scrubberX = currentFrame / fps * zoom;

  // Keyboard shortcuts
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(zoom + (e.deltaY > 0 ? -10 : 10));
    }
  }, [zoom, setZoom]);

  // Get damage hit offsets for a skill block
  const getHitOffsets = (operatorId: string, skillId: string): number[] => {
    const member = partyMembers.find(m => m.operator?.id === operatorId);
    if (!member?.operator) return [];
    const op = member.operator;
    const offsets: number[] = [];
    if (skillId === "basic") {
      let cum = 0;
      for (const seg of op.attackSegments) {
        for (const tick of seg.damageTicks || []) {
          offsets.push(cum + tick.offset);
        }
        cum += seg.duration;
      }
    } else if (skillId === "combo") {
      for (const tick of op.linkSkill?.damageTicks || []) {
        offsets.push(tick.offset);
      }
    } else if (skillId === "ultimate") {
      for (const tick of op.ultimate?.damageTicks || []) {
        offsets.push(tick.offset);
      }
    } else {
      const skill = op.skills.find(s => s.id === skillId);
      for (const tick of skill?.damageTicks || []) {
        offsets.push(tick.offset);
      }
    }
    return offsets;
  };

  // Collect damage events at current frame for display
  const currentDamageEvents = simulationResult?.frames?.[currentFrame]?.events.filter(
    e => e.type === "damage" && e.damage
  ) || [];
  // Set of operator IDs that have damage at current frame (for block highlighting)
  const activeDamageOps = new Set(currentDamageEvents.map(e => e.operatorId));

  // Track list
  const allTracks = tracks.length > 0
    ? tracks
    : partyMembers.filter(m => m.operator).map(m => ({
        operatorId: m.operator!.id,
        blocks: [] as TimelineBlock[],
      }));

  return (
    <div className="flex flex-col rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Timeline
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          {simulationResult && (
            <>
              <button
                onClick={() => {
                  if (currentFrame >= simulationResult.totalFrames) setCurrentFrame(0);
                  setIsPlaying(!isPlaying);
                }}
                className="px-2 py-0.5 rounded bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors font-mono"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={() => { setIsPlaying(false); setCurrentFrame(0); }}
                className="px-2 py-0.5 rounded bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors"
                title="Stop"
              >
                ⏹
              </button>
              <span className="font-mono text-[var(--color-accent)]">
                {(currentFrame / fps).toFixed(1)}s / {(simulationResult.totalFrames / fps).toFixed(1)}s
              </span>
            </>
          )}
          <button
            onClick={() => setZoom(zoom - 10)}
            className="px-2 py-0.5 rounded bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="font-mono w-10 text-center">{zoom}px/s</span>
          <button
            onClick={() => setZoom(zoom + 10)}
            className="px-2 py-0.5 rounded bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors"
            title="Zoom in"
          >
            +
          </button>
          {selectedSkill && (
            <span className="ml-2 text-[var(--color-accent)]">
              Placing: {selectedSkill.skillId}
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-auto"
        onWheel={handleWheel}
        style={{ maxHeight: "60vh" }}
      >
        <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 bg-[var(--color-surface-alt)] border-b border-[var(--color-border)]"
            style={{ height: RULER_HEIGHT, paddingLeft: 120 }}
          >
            {timeMarkers.map((t) => (
              <div
                key={t}
                className="absolute text-[10px] text-[var(--color-text-muted)] font-mono"
                style={{
                  left: t * zoom,
                  top: 4,
                }}
              >
                {formatTime(t)}
              </div>
            ))}
            {/* Minor tick marks */}
            {Array.from({ length: Math.ceil(totalSeconds) * 5 }).map((_, i) => {
              const t = i / 5;
              if (timeMarkers.includes(t)) return null;
              return (
                <div
                  key={i}
                  className="absolute top-0 h-2 border-l border-[var(--color-border)]"
                  style={{ left: t * zoom }}
                />
              );
            })}
          </div>

          {/* Tracks */}
          {allTracks.map((track) => {
            const element = getOperatorElement(track.operatorId);
            const isDragOver = selectedSkill?.operatorId === track.operatorId;

            return (
              <div
                key={track.operatorId}
                className="relative border-b border-[var(--color-border)] hover:bg-white/[0.02] transition-colors"
                style={{ height: TRACK_HEIGHT }}
                onClick={(e) => handleTrackClick(e, track.operatorId)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDrop={(e) => handleDrop(e, track.operatorId)}
              >
                {/* Operator label */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[120px] flex items-center gap-2 px-3 bg-[var(--color-surface-alt)] border-r border-[var(--color-border)] z-[5]"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: element ? ELEMENT_COLORS[element] : "#555" }}
                  />
                  <span className="text-xs font-medium truncate text-[var(--color-text)]">
                    {getOperatorName(track.operatorId)}
                  </span>
                </div>

                {/* Track area */}
                <div className="ml-[120px] h-full relative">
                  {/* Grid lines */}
                  {timeMarkers.map((t) => (
                    <div
                      key={t}
                      className="absolute top-0 bottom-0 border-l border-[var(--color-border)] opacity-30"
                      style={{ left: t * zoom }}
                    />
                  ))}

                  {/* Blocks */}
                  {track.blocks.map((block) => {
                    const x = block.startFrame / fps * zoom;
                    const w = Math.max(block.duration / fps * zoom, 20);
                    const color = getBlockColor(block);
                    const hitOffsets = getHitOffsets(block.operatorId, block.skillId);
                    const blockDurationSec = block.duration / fps;

                    return (
                      <div
                        key={block.id}
                        className="absolute flex items-center px-2 rounded cursor-grab active:cursor-grabbing select-none transition-shadow"
                        style={{
                          left: x,
                          top: (TRACK_HEIGHT - BLOCK_HEIGHT) / 2,
                          width: w,
                          height: BLOCK_HEIGHT,
                          backgroundColor: color + "44",
                          borderLeft: `3px solid ${color}`,
                          borderRadius: BLOCK_RADIUS,
                          zIndex: draggingBlock === block.id ? 20 : 10,
                          boxShadow: draggingBlock === block.id
                            ? "0 4px 12px rgba(0,0,0,0.4)"
                            : activeDamageOps.has(block.operatorId)
                              ? `0 0 8px ${color}88`
                              : undefined,
                        }}
                        onMouseDown={(e) => handleBlockMouseDown(e, block)}
                        title={`${block.label}\nStart: ${formatTime(block.startFrame / fps)}\nDuration: ${(block.duration / fps).toFixed(1)}s\nRight-click to remove`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          removeBlock(block.id);
                        }}
                      >
                        {/* Hit markers */}
                        {hitOffsets.map((offset, i) => {
                          const hx = blockDurationSec > 0 ? (offset / blockDurationSec) * w : 0;
                          return (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0"
                              style={{
                                left: hx,
                                width: 1,
                                backgroundColor: color,
                                opacity: 0.6,
                              }}
                              title={`Hit ${i + 1}: +${offset.toFixed(2)}s`}
                            />
                          );
                        })}
                        <span className="text-[10px] font-medium truncate text-[var(--color-text)] relative z-[1] flex-1">
                          {block.label}
                        </span>
                        <button
                          className="ml-1 px-1.5 py-0.5 text-[10px] rounded opacity-60 hover:opacity-100 hover:bg-red-500/20 text-red-400 flex-shrink-0 relative z-[1] transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBlock(block.id);
                          }}
                          title="Remove block (right-click also works)"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                  {/* Drag-over highlight */}
                  {isDragOver && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Scrubber with damage labels */}
          {simulationResult && (
            <>
              {/* Damage labels at scrubber */}
              {currentDamageEvents.map((evt, i) => {
                const trackIdx = allTracks.findIndex(t => t.operatorId === evt.operatorId);
                const top = trackIdx >= 0
                  ? RULER_HEIGHT + trackIdx * TRACK_HEIGHT + TRACK_HEIGHT / 2
                  : RULER_HEIGHT;
                return (
                  <div
                    key={`dmg-${i}`}
                    className="absolute z-40 pointer-events-none"
                    style={{
                      left: scrubberX + 126,
                      top,
                      transform: "translateY(-50%)",
                    }}
                  >
                    <span className={`text-[10px] font-bold whitespace-nowrap ${evt.isCrit ? "text-yellow-300" : "text-[var(--color-accent)]"}`}
                      style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                    >
                      {formatNumber(evt.damage!)}{evt.isCrit ? " CRIT" : ""}
                    </span>
                  </div>
                );
              })}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-accent)] z-30"
                style={{ left: scrubberX + 120 }}
              >
                <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                {/* Current time label on scrubber */}
                <div className="absolute -top-5 left-1 text-[10px] font-mono text-[var(--color-accent)] whitespace-nowrap">
                  {(currentFrame / fps).toFixed(2)}s
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {allTracks.length === 0 && (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--color-text-muted)]">
          Select operators in Setup tab and add skills from the palette to build a rotation
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function getSkillDuration(skillId: string, operatorId: string): number {
  // Look up from party store
  const members = usePartyStore.getState().members;
  const member = members.find(m => m.operator?.id === operatorId);
  if (!member?.operator) return 1.5;

  const op = member.operator;
  if (skillId === "basic") {
    return op.attackSegments.reduce((s, seg) => s + seg.duration, 2);
  }
  if (skillId === "combo") return op.linkSkill?.duration ?? 1;
  if (skillId === "ultimate") return op.ultimate?.duration ?? 2.5;
  const skill = op.skills.find(s => s.id === skillId);
  return skill?.duration ?? 1.5;
}

function getSkillLabel(skillId: string, operatorId: string): string {
  const members = usePartyStore.getState().members;
  const member = members.find(m => m.operator?.id === operatorId);
  if (!member?.operator) return skillId;

  const op = member.operator;
  if (skillId === "basic") return "Basic ATK";
  if (skillId === "combo") return op.linkSkill?.name ?? "Combo";
  if (skillId === "ultimate") return op.ultimate?.name ?? "Ultimate";
  const skill = op.skills.find(s => s.id === skillId);
  return skill?.name ?? skillId;
}
