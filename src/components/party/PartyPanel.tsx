interface PartyPanelProps {
  // Expand as needed when building the full UI
}

export function PartyPanel({}: PartyPanelProps) {
  return (
    <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-[var(--color-text-muted)]">
        Party
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((slot) => (
          <div
            key={slot}
            className="flex items-center justify-center h-20 rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm hover:border-[var(--color-accent)] cursor-pointer transition"
          >
            Slot {slot + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
