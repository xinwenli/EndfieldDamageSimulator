import { create } from "zustand";
import type { TimelineTrack, SimulationResultFull, SimFrame, TargetStats } from "../engine/types";
import { runSimulation } from "../engine/timeline";
import type { Stats, Operator } from "../engine/types";
import type { EnemyDef, EnemyConfig } from "../engine/enemyTypes";
import { enemyConfigToTarget } from "../engine/enemyTypes";

interface OperatorSkillData {
  operator: Operator;
  stats: Stats;
  skillRanks: number[];
  level: number;
}

interface TimelineState {
  tracks: TimelineTrack[];
  fps: number;
  simulationResult: SimulationResultFull | null;
  isRunning: boolean;
  currentFrame: number;
  zoom: number; // pixels per second
  selectedSkill: { operatorId: string; skillId: string } | null;

  // Track management
  addTrack: (operatorId: string) => void;
  removeTrack: (operatorId: string) => void;
  clearTracks: () => void;

  // Block management
  addBlock: (operatorId: string, skillId: string, startSecond: number, duration: number, label: string) => void;
  moveBlock: (blockId: string, newStartFrame: number) => void;
  removeBlock: (blockId: string) => void;

  // Simulation
  runSim: (operatorData: Map<string, OperatorSkillData>) => void;
  resetSimulation: () => void;

  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  // Scrubbing
  setCurrentFrame: (frame: number) => void;
  getFrameSnapshot: (frame: number) => SimFrame | null;

  // Zoom
  setZoom: (zoom: number) => void;

  // Selection
  setSelectedSkill: (skill: { operatorId: string; skillId: string } | null) => void;

  // Enemy system
  enemyDefs: EnemyDef[];
  loadEnemyDefs: (defs: EnemyDef[]) => void;
  enemyConfig: EnemyConfig;
  setEnemyConfig: (config: Partial<EnemyConfig>) => void;
  /** Resolved target stats from current enemy config */
  getTarget: () => TargetStats;
}

let blockIdCounter = 0;

const DEFAULT_ENEMY_CONFIG: EnemyConfig = {
  source: "existing",
  enemyId: null,
  customName: "",
  level: 50,
  customStats: null,
};

export const useTimelineStore = create<TimelineState>((set, get) => ({
  tracks: [],
  fps: 60,
  simulationResult: null,
  isRunning: false,
  isPlaying: false,
  currentFrame: 0,
  zoom: 60, // 60px per second
  selectedSkill: null,

  enemyDefs: [],
  enemyConfig: { ...DEFAULT_ENEMY_CONFIG },
  loadEnemyDefs: (defs) => set({ enemyDefs: defs }),
  setEnemyConfig: (partial) =>
    set((state) => ({ enemyConfig: { ...state.enemyConfig, ...partial } })),
  getTarget: () => {
    const { enemyConfig, enemyDefs } = get();
    return enemyConfigToTarget(enemyConfig, enemyDefs);
  },

  addTrack: (operatorId) =>
    set((state) => {
      if (state.tracks.some((t) => t.operatorId === operatorId)) return state;
      return { tracks: [...state.tracks, { operatorId, blocks: [] }] };
    }),

  removeTrack: (operatorId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.operatorId !== operatorId),
    })),

  clearTracks: () => set({ tracks: [], simulationResult: null, currentFrame: 0 }),

  addBlock: (operatorId, skillId, startSecond, duration, label) => {
    const fps = get().fps;
    const id = `block_${++blockIdCounter}`;
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.operatorId !== operatorId) return t;
        return {
          ...t,
          blocks: [
            ...t.blocks,
            {
              id,
              skillId,
              operatorId,
              startFrame: Math.round(startSecond * fps),
              duration: Math.round(duration * fps),
              label,
            },
          ],
        };
      }),
    }));
  },

  moveBlock: (blockId, newStartFrame) =>
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        blocks: t.blocks.map((b) =>
          b.id === blockId ? { ...b, startFrame: Math.max(0, newStartFrame) } : b,
        ),
      })),
    })),

  removeBlock: (blockId) =>
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        blocks: t.blocks.filter((b) => b.id !== blockId),
      })),
    })),

  runSim: (operatorData) => {
    const state = get();
    const tracks = state.tracks.filter((t) => t.blocks.length > 0);
    if (tracks.length === 0) return set({ simulationResult: null });

    try {
      const target = get().getTarget();
      const result = runSimulation(tracks, operatorData, target, undefined, state.fps);
      set({ simulationResult: result, isRunning: false, currentFrame: 0 });
    } catch (e) {
      console.error("Simulation failed:", e);
      set({ simulationResult: null, isRunning: false });
    }
  },

  resetSimulation: () => set({ simulationResult: null, currentFrame: 0, isRunning: false, isPlaying: false }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, frame) }),

  getFrameSnapshot: (frame) => {
    const result = get().simulationResult;
    if (!result || frame < 0 || frame >= result.frames.length) return null;
    return result.frames[Math.floor(frame)];
  },

  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(300, zoom)) }),

  setSelectedSkill: (skill) => set({ selectedSkill: skill }),
}));
