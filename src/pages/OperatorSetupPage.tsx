import { PartyPanel } from "../components/party/PartyPanel";
import { useLangStore } from "../i18n/context";
import { t } from "../i18n/translations";

export function OperatorSetupPage() {
  const { lang } = useLangStore();
  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <PartyPanel />
      <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-[var(--color-text-muted)]">
          {t("details.title", lang)}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t("details.hint", lang)}
        </p>
      </div>
    </div>
  );
}
