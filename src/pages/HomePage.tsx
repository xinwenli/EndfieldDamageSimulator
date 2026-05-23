import { Link } from "react-router-dom";
import { Play, ExternalLink } from "lucide-react";

export function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-16">
      <h2 className="text-4xl font-bold mb-4">
        Endfield Damage Simulator
      </h2>
      <p className="text-[var(--color-text-muted)] max-w-md mb-8 leading-relaxed">
        Configure your party, build a skill rotation timeline, and see
        detailed DPS breakdowns for <em>Arknights: Endfield</em>.
      </p>
      <div className="flex gap-4">
        <Link
          to="/simulator"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition"
        >
          <Play className="w-4 h-4" />
          Open Simulator
        </Link>
        <a
          href="https://github.com/xinwenli/EndfieldDamageSimulator"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition"
        >
          <ExternalLink className="w-4 h-4" />
          GitHub
        </a>
      </div>
    </div>
  );
}
