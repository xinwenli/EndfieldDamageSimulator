import { Sword, Users, Play } from "lucide-react";
import { useLangStore } from "../../i18n/context";
import { t } from "../../i18n/translations";

type Tab = "setup" | "simulator";

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  const { lang, toggle } = useLangStore();

  const tabs: { id: Tab; key: string; icon: typeof Sword }[] = [
    { id: "setup", key: "operator", icon: Users },
    { id: "simulator", key: "simulator", icon: Play },
  ];

  return (
    <header className="flex items-center px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <div className="flex items-center gap-3 mr-8">
        <Sword className="w-6 h-6 text-[var(--color-accent)]" />
        <h1 className="text-lg font-semibold tracking-tight">{t("app.title", lang)}</h1>
      </div>
      <nav className="flex gap-1 flex-1">
        {tabs.map(({ id, key, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${
              activeTab === id
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface)]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(key, lang)}
          </button>
        ))}
      </nav>
      <select value={lang} onChange={(e) => { if (e.target.value !== lang) toggle(); }}
        className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1">
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </header>
  );
}
