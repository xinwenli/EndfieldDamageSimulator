import { NavLink } from "react-router-dom";
import { Sword } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <div className="flex items-center gap-3">
        <Sword className="w-6 h-6 text-[var(--color-accent)]" />
        <h1 className="text-lg font-semibold tracking-tight">Endfield Damage Simulator</h1>
      </div>
      <nav className="flex gap-4 text-sm">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `hover:text-white transition ${isActive ? "text-white font-medium" : "text-[var(--color-text-muted)]"}`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/simulator"
          className={({ isActive }) =>
            `hover:text-white transition ${isActive ? "text-white font-medium" : "text-[var(--color-text-muted)]"}`
          }
        >
          Simulator
        </NavLink>
      </nav>
    </header>
  );
}
