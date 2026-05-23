import { create } from "zustand";
import type { PartyMember, Operator, Weapon, GearConfig } from "../engine/types";

interface PartyState {
  members: PartyMember[];
  maxSlots: number;
  activeSlot: number | null;
  setActiveSlot: (index: number | null) => void;
  setOperator: (slotIndex: number, operator: Operator) => void;
  setLevel: (slotIndex: number, level: number) => void;
  setSkillRank: (slotIndex: number, rank: number) => void;
  setPotential: (slotIndex: number, potential: number) => void;
  setWeapon: (slotIndex: number, weapon: Weapon | null) => void;
  setWeaponLevel: (slotIndex: number, level: number) => void;
  setWeaponSkillRank: (slotIndex: number, skillIndex: number, rank: number) => void;
  setGear: (slotIndex: number, gear: GearConfig | null) => void;
  setGearAssembly: (slotIndex: number, assembly: "none" | "partial" | "full") => void;
  removeOperator: (slotIndex: number) => void;
  clearParty: () => void;
}

function createEmptySlot(index: number): PartyMember {
  return {
    slotIndex: index,
    operator: null,
    level: 90,
    skillRank: 12,
    potential: 0,
    weapon: null,
    weaponLevel: 90,
    weaponSkillRanks: [9, 9, 4],
    gear: null,
    gearAssembly: "full",
    finalStats: null,
  };
}

const DEFAULT_SLOTS = 4;

export const usePartyStore = create<PartyState>((set) => ({
  members: Array.from({ length: DEFAULT_SLOTS }, (_, i) => createEmptySlot(i)),
  maxSlots: DEFAULT_SLOTS,
  activeSlot: null,

  setActiveSlot: (index) => set({ activeSlot: index }),

  setOperator: (slotIndex, operator) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], operator };
      return { members };
    }),

  setLevel: (slotIndex, level) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], level };
      return { members };
    }),

  setSkillRank: (slotIndex, rank) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], skillRank: rank };
      return { members };
    }),

  setPotential: (slotIndex, potential) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], potential };
      return { members };
    }),

  setWeapon: (slotIndex, weapon) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], weapon };
      return { members };
    }),

  setWeaponLevel: (slotIndex, level) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], weaponLevel: level };
      return { members };
    }),

  setWeaponSkillRank: (slotIndex, skillIndex, rank) =>
    set((state) => {
      const members = [...state.members];
      const ranks = [...members[slotIndex].weaponSkillRanks];
      ranks[skillIndex] = rank;
      members[slotIndex] = { ...members[slotIndex], weaponSkillRanks: ranks };
      return { members };
    }),

  setGear: (slotIndex, gear) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], gear };
      return { members };
    }),

  setGearAssembly: (slotIndex, assembly) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], gearAssembly: assembly };
      return { members };
    }),

  removeOperator: (slotIndex) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = createEmptySlot(slotIndex);
      return { members };
    }),

  clearParty: () =>
    set({
      members: Array.from({ length: DEFAULT_SLOTS }, (_, i) => createEmptySlot(i)),
    }),
}));
