import { useState } from "react";
import { Search, X } from "lucide-react";
import type { GearPiece } from "../../engine/types";
import gearsData from "../../data/gears.json";
import { assetUrl } from "../../lib/utils";
import { useLangStore } from "../../i18n/context";
import { t, displayName } from "../../i18n/translations";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (gear: GearPiece) => void;
  slot: "Armor" | "Gloves" | "Kit";
}

const allGears = gearsData as unknown as GearPiece[];

export function GearPicker({ open, onClose, onSelect, slot }: Props) {
  const [search, setSearch] = useState("");
  const { lang } = useLangStore();
  const gears = allGears.filter((g) => g.slot === slot);

  const filtered = gears.filter((g) => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !(g.nameEn||"").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold">{t("gear.select", lang)}</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("gear.search", lang)}
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-center text-[var(--color-text-muted)] py-8 text-sm">{t("gear.none", lang)}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelect({ ...g, refinementRanks: g.refinement?.map(() => 3) })}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] border border-transparent hover:border-[var(--color-accent)] text-left transition"
                >
                  {g.cover ? (
                    <img src={assetUrl(g.cover)} alt={g.name} className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--color-border)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{displayName(g, lang)}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-yellow-400">{"★".repeat(g.rarity)}</span>
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {Object.entries(g.baseStats).map(([k, v]) => {
                        const refine = g.refinement?.find(r => r.name === k);
                        return `${k}${refine?.rank3 || v}`;
                      }).join("  ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
