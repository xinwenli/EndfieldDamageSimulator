import { PartyPanel } from "../components/party/PartyPanel";

export function OperatorSetupPage() {
  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <PartyPanel />
      <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-[var(--color-text-muted)]">
          Operator Details
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Select an operator from the party above to view skills, talents, and stats.
        </p>
      </div>
    </div>
  );
}
