import { useState } from "react";
import { Search, X } from "lucide-react";
import type { Weapon, WeaponType } from "../../engine/types";
import { getWeaponsByType } from "../../engine/dataLoader";
import { assetUrl } from "../../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (weapon: Weapon) => void;
  weaponType: WeaponType;
}

export function WeaponPicker({ open, onClose, onSelect, weaponType }: Props) {
  const [search, setSearch] = useState("");
  const weapons = getWeaponsByType(weaponType);

  const filtered = weapons.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
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
          <h3 className="font-semibold">Select Weapon</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search weapon..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-center text-[var(--color-text-muted)] py-8 text-sm">No weapons found for this type</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onSelect(w)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] border border-transparent hover:border-[var(--color-accent)] text-left transition"
                >
                  {w.cover ? (
                    <img src={assetUrl(w.cover)} alt={w.name} className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--color-border)] flex items-center justify-center shrink-0">
                      <span className="text-lg">?</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{w.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-yellow-400">{"★".repeat(w.rarity)}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{w.weaponType}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">ATK {w.baseAtkLv1}→{w.baseAtkLv90}</span>
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
