import { create } from "zustand";
import type { Lang } from "./translations";

interface LangState {
  lang: Lang;
  toggle: () => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: "zh",
  toggle: () => set((s) => ({ lang: s.lang === "zh" ? "en" : "zh" })),
}));
