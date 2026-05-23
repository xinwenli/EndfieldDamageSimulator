import { useState } from "react";
import { Plus, X } from "lucide-react";
import { usePartyStore } from "../../stores/partyStore";
import { getElements } from "../../engine/dataLoader";
import { OperatorPicker } from "./OperatorPicker";
import { OperatorConfigPanel } from "./OperatorConfigPanel";
import { assetUrl } from "../../lib/utils";
import type { Operator } from "../../engine/types";

export function PartyPanel() {
  const { members, activeSlot, setActiveSlot, setOperator, removeOperator } = usePartyStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(0);
  const elements = getElements();

  function handleSlotClick(slotIndex: number) {
    const member = members[slotIndex];
    if (member.operator) {
      // Filled slot → open config panel
      setActiveSlot(slotIndex);
    } else {
      // Empty slot → open picker
      setPickerTarget(slotIndex);
      setPickerOpen(true);
    }
  }

  function handleSelect(operator: Operator) {
    setOperator(pickerTarget, operator);
    setActiveSlot(pickerTarget);
    setPickerOpen(false);
  }

  function handleChangeOperator() {
    if (activeSlot !== null) {
      setPickerTarget(activeSlot);
      setPickerOpen(true);
    }
  }

  const selectedIds = members
    .filter((m) => m.operator !== null)
    .map((m) => m.operator!.id);

  const activeMember = activeSlot !== null ? members[activeSlot] : null;

  return (
    <div className="space-y-4">
      {/* Party slots grid */}
      <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Party Setup
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            {members.filter((m) => m.operator).length} / {members.length} slots filled
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {members.map((member) => (
            <div
              key={member.slotIndex}
              className={`relative rounded-lg border transition cursor-pointer min-h-[120px] ${
                activeSlot === member.slotIndex
                  ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                  : "border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)]"
              }`}
              onClick={() => handleSlotClick(member.slotIndex)}
            >
              {member.operator ? (
                <div className="p-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOperator(member.slotIndex);
                    }}
                    className="absolute top-1.5 right-1.5 p-0.5 rounded hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {member.operator.avatar ? (
                    <img
                      src={assetUrl(member.operator.avatar)}
                      alt={member.operator.name}
                      className="w-full aspect-square object-cover rounded-md mb-2"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full aspect-square rounded-md flex items-center justify-center text-2xl font-bold mb-2"
                      style={{ backgroundColor: (elements[member.operator.element]?.color ?? "#333") + "33", color: elements[member.operator.element]?.color }}
                    >
                      {elements[member.operator.element]?.name?.slice(0, 2) ?? "?"}
                    </div>
                  )}
                  <div className="text-xs font-medium truncate">{member.operator.name}</div>
                  <div className="text-[10px] text-yellow-400">{"★".repeat(member.operator.rarity)}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] capitalize mt-0.5">
                    Lv{member.level} · {member.operator.profession}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-6 text-[var(--color-text-muted)]">
                  <Plus className="w-5 h-5 mb-1" />
                  <span className="text-xs">Slot {member.slotIndex + 1}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Operator config panel (shown when a filled slot is active) */}
      {activeMember?.operator && (
        <OperatorConfigPanel
          member={activeMember}
          onChangeOperator={handleChangeOperator}
        />
      )}

      <OperatorPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        selectedIds={selectedIds}
      />
    </div>
  );
}
