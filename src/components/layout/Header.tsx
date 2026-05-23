import { Sword, Users, Play } from "lucide-react";

type Tab = "setup" | "simulator";

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: typeof Sword }[] = [
  { id: "setup", label: "Operator Setup", icon: Users },
  { id: "simulator", label: "Simulator", icon: Play },
];

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="flex items-center px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <div className="flex items-center gap-3 mr-8">
        <Sword className="w-6 h-6 text-[var(--color-accent)]" />
        <h1 className="text-lg font-semibold tracking-tight">Endfield Damage Simulator</h1>
      </div>
      <nav className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
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
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
