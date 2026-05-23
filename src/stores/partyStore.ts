import { create } from "zustand";
import type { PartyMember, Operator, Weapon } from "../engine/types";

interface PartyState {
  members: PartyMember[];
  maxSlots: number;
  setOperator: (slotIndex: number, operator: Operator) => void;
  setWeapon: (slotIndex: number, weapon: Weapon) => void;
  setLevel: (slotIndex: number, level: number) => void;
  removeOperator: (slotIndex: number) => void;
  clearParty: () => void;
}

function createEmptySlot(index: number): PartyMember {
  return {
    slotIndex: index,
    operator: null,
    weapon: null,
    level: 80,
    finalStats: null,
  };
}

const DEFAULT_SLOTS = 4;

export const usePartyStore = create<PartyState>((set) => ({
  members: Array.from({ length: DEFAULT_SLOTS }, (_, i) => createEmptySlot(i)),
  maxSlots: DEFAULT_SLOTS,

  setOperator: (slotIndex, operator) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], operator };
      return { members };
    }),

  setWeapon: (slotIndex, weapon) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], weapon };
      return { members };
    }),

  setLevel: (slotIndex, level) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], level };
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
      members: Array.from({ length: DEFAULT_SLOTS }, (_, i) =>
        createEmptySlot(i),
      ),
    }),
}));
