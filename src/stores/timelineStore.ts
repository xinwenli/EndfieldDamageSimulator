import { create } from "zustand";
import type { TimelineTrack, SimulationResult } from "../engine/types";
import { runSimulation } from "../engine/timeline";

interface TimelineState {
  tracks: TimelineTrack[];
  fps: number;
  simulationResult: SimulationResult | null;
  isRunning: boolean;

  addTrack: (operatorId: string) => void;
  removeTrack: (operatorId: string) => void;
  clearTracks: () => void;
  runSim: (operatorStats: Map<string, import("../engine/types").Stats>, operatorSkills: Map<string, import("../engine/types").Skill[]>, bossDef?: number, bossRes?: number) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  tracks: [],
  fps: 30,
  simulationResult: null,
  isRunning: false,

  addTrack: (operatorId) =>
    set((state) => {
      if (state.tracks.some((t) => t.operatorId === operatorId)) return state;
      return {
        tracks: [...state.tracks, { operatorId, blocks: [] }],
      };
    }),

  removeTrack: (operatorId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.operatorId !== operatorId),
    })),

  clearTracks: () => set({ tracks: [], simulationResult: null }),

  runSim: (operatorStats, operatorSkills, bossDef, bossRes) =>
    set((state) => {
      const result = runSimulation(
        state.tracks,
        operatorStats,
        operatorSkills,
        bossDef,
        bossRes,
      );
      return { simulationResult: result };
    }),
}));
