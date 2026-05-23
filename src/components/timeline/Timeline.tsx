interface TimelineProps {
  // Expand as needed when building the full UI
}

export function Timeline({}: TimelineProps) {
  return (
    <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Timeline
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          Drag skills to build rotation
        </span>
      </div>
      <div className="flex items-center justify-center h-40 rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm">
        Timeline canvas — coming soon
      </div>
    </div>
  );
}
