import { create } from "zustand";
import type { PartyMember, Operator, Weapon, GearPiece } from "../engine/types";
import operatorsData from "../data/operators.json";
import weaponsData from "../data/weapons.json";
import gearsData from "../data/gears.json";

interface ImportData {
  slot: number;
  operatorId: string;
  level: number;
  potential: number;
  talentStage: number;
  talentSkill1Stage?: number;
  talentSkill2Stage?: number;
  skillRanks: number[];
  weaponId: string | null;
  weaponLevel: number;
  weaponSkillRanks: number[];
  armorId: string | null;
  armorRanks: number[];
  glovesId: string | null;
  glovesRanks: number[];
  kit1Id: string | null;
  kit1Ranks: number[];
  kit2Id: string | null;
  kit2Ranks: number[];
}

interface PartyState {
  members: PartyMember[];
  maxSlots: number;
  activeSlot: number | null;
  setActiveSlot: (index: number | null) => void;
  setOperator: (slotIndex: number, operator: Operator) => void;
  setLevel: (slotIndex: number, level: number) => void;
  setSkillRank: (slotIndex: number, skillIndex: number, rank: number) => void;
  setPotential: (slotIndex: number, potential: number) => void;
  setTalentStage: (slotIndex: number, stage: number) => void;
  setTalentSkill1Stage: (slotIndex: number, stage: number) => void;
  setTalentSkill2Stage: (slotIndex: number, stage: number) => void;
  setWeapon: (slotIndex: number, weapon: Weapon | null) => void;
  setWeaponLevel: (slotIndex: number, level: number) => void;
  setWeaponSkillRank: (slotIndex: number, skillIndex: number, rank: number) => void;
  setArmor: (slotIndex: number, gear: GearPiece | null) => void;
  setGloves: (slotIndex: number, gear: GearPiece | null) => void;
  setKit1: (slotIndex: number, gear: GearPiece | null) => void;
  setKit2: (slotIndex: number, gear: GearPiece | null) => void;
  removeOperator: (slotIndex: number) => void;
  restoreParty: (data: ImportData[]) => void;
  clearParty: () => void;
}

function createEmptySlot(index: number): PartyMember {
  return {
    slotIndex: index,
    operator: null,
    level: 90,
    skillRanks: [12, 12, 12, 12], // [basic, battle, combo, ultimate]
    talentStage: 4,
    talentSkill1Stage: 2,
    talentSkill2Stage: 2,
    potential: 0,
    weapon: null,
    weaponLevel: 90,
    weaponSkillRanks: [9, 9, 4],
    armor: null,
    gloves: null,
    kit1: null,
    kit2: null,
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

  setSkillRank: (slotIndex, skillIndex, rank) =>
    set((state) => {
      const members = [...state.members];
      const ranks = [...members[slotIndex].skillRanks];
      ranks[skillIndex] = rank;
      members[slotIndex] = { ...members[slotIndex], skillRanks: ranks };
      return { members };
    }),

  setPotential: (slotIndex, potential) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], potential };
      return { members };
    }),

  setTalentStage: (slotIndex, stage) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], talentStage: stage };
      return { members };
    }),

  setTalentSkill1Stage: (slotIndex, stage) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], talentSkill1Stage: stage };
      return { members };
    }),

  setTalentSkill2Stage: (slotIndex, stage) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], talentSkill2Stage: stage };
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

  setArmor: (slotIndex, gear) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], armor: gear };
      return { members };
    }),

  setGloves: (slotIndex, gear) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], gloves: gear };
      return { members };
    }),

  setKit1: (slotIndex, gear) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], kit1: gear };
      return { members };
    }),

  setKit2: (slotIndex, gear) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = { ...members[slotIndex], kit2: gear };
      return { members };
    }),

  removeOperator: (slotIndex) =>
    set((state) => {
      const members = [...state.members];
      members[slotIndex] = createEmptySlot(slotIndex);
      return { members };
    }),

  restoreParty: (data) =>
    set(() => {
      const members: PartyMember[] = Array.from({ length: DEFAULT_SLOTS }, (_, i) => createEmptySlot(i));
      for (const d of data) {
        if (d.slot < 0 || d.slot >= DEFAULT_SLOTS) continue;
        const allOps = operatorsData as unknown as Operator[];
        const op = allOps.find(o => o.id === d.operatorId) || null;
        const allWeapons = weaponsData as unknown as Weapon[];
        const weapon = d.weaponId ? (allWeapons.find(w => w.id === d.weaponId) || null) : null;
        const allGears = gearsData as unknown as GearPiece[];
        const armor = d.armorId ? { ...allGears.find(g => g.id === d.armorId)!, refinementRanks: d.armorRanks } : null;
        const gloves = d.glovesId ? { ...allGears.find(g => g.id === d.glovesId)!, refinementRanks: d.glovesRanks } : null;
        const kit1 = d.kit1Id ? { ...allGears.find(g => g.id === d.kit1Id)!, refinementRanks: d.kit1Ranks } : null;
        const kit2 = d.kit2Id ? { ...allGears.find(g => g.id === d.kit2Id)!, refinementRanks: d.kit2Ranks } : null;

        members[d.slot] = {
          ...members[d.slot],
          operator: op,
          level: d.level ?? 90,
          potential: d.potential ?? 0,
          talentStage: d.talentStage ?? 4,
          talentSkill1Stage: d.talentSkill1Stage ?? 2,
          talentSkill2Stage: d.talentSkill2Stage ?? 2,
          skillRanks: d.skillRanks ?? [12, 12, 12, 12],
          weapon,
          weaponLevel: d.weaponLevel ?? 90,
          weaponSkillRanks: d.weaponSkillRanks ?? [9, 9, 4],
          armor,
          gloves,
          kit1,
          kit2,
        };
      }
      return { members };
    }),

  clearParty: () =>
    set({
      members: Array.from({ length: DEFAULT_SLOTS }, (_, i) => createEmptySlot(i)),
    }),
}));
