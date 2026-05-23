interface DPSResultsProps {
  // Expand as needed when building the full UI
}

export function DPSResults({}: DPSResultsProps) {
  return (
    <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-[var(--color-text-muted)]">
        DPS Results
      </h2>
      <div className="flex items-center justify-center h-40 rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm">
        Run simulation to see results
      </div>
    </div>
  );
}
