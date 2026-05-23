import { useState } from "react";
import { Search, X } from "lucide-react";
import type { Operator } from "../../engine/types";
import { getAllOperators } from "../../engine/dataLoader";
import { getElements } from "../../engine/dataLoader";

interface OperatorPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (operator: Operator) => void;
  selectedIds: string[];
}

export function OperatorPicker({ open, onClose, onSelect, selectedIds }: OperatorPickerProps) {
  const [search, setSearch] = useState("");
  const elements = getElements();
  const operators = getAllOperators();

  const filtered = operators.filter((op) => {
    if (selectedIds.includes(op.id)) return false;
    if (search && !op.name.toLowerCase().includes(search.toLowerCase())) return false;
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
          <h3 className="font-semibold">Select Operator</h3>
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
              placeholder="Search operator..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-center text-[var(--color-text-muted)] py-8 text-sm">No operators found</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map((op) => {
                const el = elements[op.element];
                return (
                  <button
                    key={op.id}
                    onClick={() => onSelect(op)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface-alt)] hover:bg-[var(--color-border)] border border-transparent hover:border-[var(--color-accent)] text-left transition"
                  >
                    {op.avatar ? (
                      <img
                        src={op.avatar}
                        alt={op.name}
                        className="w-12 h-12 rounded-lg object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: (el?.color ?? "#333") + "33", color: el?.color }}
                      >
                        {el?.name?.slice(0, 2) ?? "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{op.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-yellow-400">{"★".repeat(op.rarity)}</span>
                        <span className="text-xs" style={{ color: el?.color }}>
                          {el?.name}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">{op.profession}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{op.weapon}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
