import { useMemo, useState } from "react";
import { useTimelineStore } from "../../stores/timelineStore";
import { enemyConfigToTarget } from "../../engine/enemyTypes";
import { useLangStore } from "../../i18n/context";
import { assetUrl } from "../../lib/utils";
import type { EnemyType, TargetStats } from "../../engine/types";

const ENEMY_TYPE_LABELS: Record<EnemyType, string> = {
  common: "Common",
  advanced: "Advanced",
  elite: "Elite",
  boss: "Boss",
};

const CATEGORY_LABELS: Record<string, string> = {
  "天使": "Angels",
  "裂地者": "Rifters",
  "沧贼": "Bandits",
  "野外生物": "Wild Creatures",
};

export function EnemySelector() {
  const enemyDefs = useTimelineStore((s) => s.enemyDefs);
  const enemyConfig = useTimelineStore((s) => s.enemyConfig);
  const setEnemyConfig = useTimelineStore((s) => s.setEnemyConfig);
  const { lang } = useLangStore();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const resolvedTarget = useMemo(
    () => enemyConfigToTarget(enemyConfig, enemyDefs),
    [enemyConfig, enemyDefs],
  );

  const isCustom = enemyConfig.source === "custom";
  const selectedDef = enemyConfig.enemyId
    ? enemyDefs.find((e) => e.id === enemyConfig.enemyId)
    : null;

  // Filtered enemies for the picker
  const filteredEnemies = useMemo(() => {
    let list = enemyDefs;
    if (categoryFilter) {
      list = list.filter((e) => e.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || (e.nameCN && e.nameCN.includes(q)));
    }
    return list.slice(0, 50);
  }, [enemyDefs, search, categoryFilter]);

  const categories = useMemo(
    () => [...new Set(enemyDefs.map((e) => e.category))].sort(),
    [enemyDefs],
  );

  const handleSelectEnemy = (id: string) => {
    setEnemyConfig({ source: "existing", enemyId: id });
    setSearch("");
  };

  const handleSwitchCustom = () => {
    if (!isCustom) {
      setEnemyConfig({ source: "custom", enemyId: null, customName: "", customStats: {
          def: 100,
          physicalResist: 0,
          heatResist: 0,
          electricResist: 0,
          cryoResist: 0,
          natureResist: 0,
          aetherResist: 0,
          enemyType: "common",
          enemyCount: 1,
          staggerThreshold: 500,
          staggerDuration: 5,
        },
      });
    } else {
      setEnemyConfig({ source: "existing", enemyId: null, customStats: null });
    }
  };

  const handleCustomStat = (key: keyof TargetStats, value: number) => {
    if (!isCustom) return;
    setEnemyConfig({
      customStats: {
        ...enemyConfig.customStats,
        [key]: value,
      },
    });
  };

  const handleCustomEnemyType = (type: EnemyType) => {
    if (!isCustom) return;
    // Apply reasonable defaults when switching type
    const defaults: Record<EnemyType, Partial<TargetStats>> = {
      common: { def: 50, enemyCount: 1, staggerThreshold: 300, staggerDuration: 5 },
      advanced: { def: 100, enemyCount: 1, staggerThreshold: 500, staggerDuration: 5 },
      elite: { def: 200, enemyCount: 1, staggerThreshold: 800, staggerDuration: 4 },
      boss: { def: 400, enemyCount: 1, staggerThreshold: 1500, staggerDuration: 3 },
    };
    setEnemyConfig({
      customStats: {
        physicalResist: 0, heatResist: 0, electricResist: 0,
        cryoResist: 0, natureResist: 0, aetherResist: 0,
        ...defaults[type],
        enemyType: type,
      },
    });
  };

  return (
    <div className="text-xs">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => !isCustom || handleSwitchCustom()}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            !isCustom
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
          }`}
        >
          Wiki Enemy
        </button>
        <button
          onClick={() => isCustom || handleSwitchCustom()}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            isCustom
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
          }`}
        >
          Custom Enemy
        </button>
      </div>

      {/* Existing enemy picker */}
      {!isCustom && (
        <div className="space-y-2">
          {/* Search + category filter */}
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Search enemy..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-1 py-1 text-xs rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] w-24"
            >
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>

          {/* Enemy list */}
          <div className="max-h-48 overflow-y-auto border border-[var(--color-border)] rounded">
            {filteredEnemies.length === 0 && (
              <div className="px-2 py-3 text-center text-[var(--color-text-muted)]">
                {enemyDefs.length === 0 ? "No enemy data loaded" : "No matches"}
              </div>
            )}
            {filteredEnemies.map((enemy) => (
              <button
                key={enemy.id}
                onClick={() => handleSelectEnemy(enemy.id)}
                className={`w-full text-left px-2 py-1.5 flex items-center gap-2 transition-colors hover:bg-[var(--color-surface-alt)] ${
                  enemyConfig.enemyId === enemy.id
                    ? "bg-[var(--color-accent)]/10 border-l-2 border-[var(--color-accent)]"
                    : "border-l-2 border-transparent"
                }`}
              >
                {enemy.cover && (
                  <img
                    src={assetUrl(enemy.cover)}
                    alt=""
                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--color-text)] truncate">{lang === "zh" && enemy.nameCN ? enemy.nameCN : enemy.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {CATEGORY_LABELS[enemy.category] || enemy.category} · {ENEMY_TYPE_LABELS[enemy.enemyType]}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected enemy summary */}
          {selectedDef && (
            <div className="space-y-1.5 p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text)] font-medium">{lang === "zh" && selectedDef.nameCN ? selectedDef.nameCN : selectedDef.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {CATEGORY_LABELS[selectedDef.category] || selectedDef.category}
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Using concrete DEF, resistance, and stagger data from wiki.gg.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom enemy panel */}
      {isCustom && (
        <div className="space-y-2 p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
          {/* Name */}
          <div className="flex items-center gap-2">
            <label className="text-[var(--color-text-muted)] w-8">Name</label>
            <input
              type="text"
              placeholder="Custom Enemy"
              value={enemyConfig.customName}
              onChange={(e) => setEnemyConfig({ customName: e.target.value })}
              className="flex-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-[var(--color-text)]"
            />
          </div>

          {/* Enemy type */}
          <div className="flex items-center gap-2">
            <label className="text-[var(--color-text-muted)] w-8">Type</label>
            <select
              value={enemyConfig.customStats?.enemyType || "common"}
              onChange={(e) => handleCustomEnemyType(e.target.value as EnemyType)}
              className="px-2 py-1 text-xs rounded bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-[var(--color-text)]"
            >
              {(["common", "advanced", "elite", "boss"] as EnemyType[]).map((t) => (
                <option key={t} value={t}>{ENEMY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <StatRow label="DEF" value={enemyConfig.customStats?.def ?? 100} min={0} max={9999} onChange={(v) => handleCustomStat("def", v)} />
            <StatRow label="Count" value={enemyConfig.customStats?.enemyCount ?? 1} min={1} max={12} onChange={(v) => handleCustomStat("enemyCount", v)} />
            <StatRow label="Phys Res" value={Math.round((enemyConfig.customStats?.physicalResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("physicalResist", v / 100)} />
            <StatRow label="Heat Res" value={Math.round((enemyConfig.customStats?.heatResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("heatResist", v / 100)} />
            <StatRow label="Elec Res" value={Math.round((enemyConfig.customStats?.electricResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("electricResist", v / 100)} />
            <StatRow label="Cryo Res" value={Math.round((enemyConfig.customStats?.cryoResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("cryoResist", v / 100)} />
            <StatRow label="Nature Res" value={Math.round((enemyConfig.customStats?.natureResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("natureResist", v / 100)} />
            <StatRow label="Aether Res" value={Math.round((enemyConfig.customStats?.aetherResist ?? 0) * 100)} min={0} max={100} suffix="%" onChange={(v) => handleCustomStat("aetherResist", v / 100)} />
            <StatRow label="Stagger" value={enemyConfig.customStats?.staggerThreshold ?? 500} min={0} max={99999} onChange={(v) => handleCustomStat("staggerThreshold", v)} />
          </div>
          <StatRow label="Stagger Dur" value={enemyConfig.customStats?.staggerDuration ?? 5} min={0.5} max={30} step={0.5} suffix="s" onChange={(v) => handleCustomStat("staggerDuration", v)} />
        </div>
      )}

      {/* Resolved stats preview */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
        <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
          {isCustom && enemyConfig.customName ? enemyConfig.customName : (lang === "zh" && selectedDef?.nameCN ? selectedDef.nameCN : selectedDef?.name) || "Target"} Stats
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] font-mono">
          <span className="text-[var(--color-text-muted)]">DEF</span>
          <span className="col-span-2 text-[var(--color-text)]">{resolvedTarget.def}</span>
          <span className="text-[var(--color-text-muted)]">Type</span>
          <span className="col-span-2 text-[var(--color-text)]">{ENEMY_TYPE_LABELS[resolvedTarget.enemyType]}</span>
          <span className="text-[var(--color-text-muted)]">Count</span>
          <span className="col-span-2 text-[var(--color-text)]">{resolvedTarget.enemyCount ?? 1}</span>
          <span className="text-[var(--color-text-muted)]">RES</span>
          <span className="col-span-2 text-[var(--color-text)]">
            P:{Math.round(resolvedTarget.physicalResist)}% H:{Math.round(resolvedTarget.heatResist)}% E:{Math.round(resolvedTarget.electricResist)}%
          </span>
          <span className="text-[var(--color-text-muted)]">RES</span>
          <span className="col-span-2 text-[var(--color-text)]">
            C:{Math.round(resolvedTarget.cryoResist)}% N:{Math.round(resolvedTarget.natureResist)}% A:{Math.round(resolvedTarget.aetherResist)}%
          </span>
          <span className="text-[var(--color-text-muted)]">Stagger</span>
          <span className="col-span-2 text-[var(--color-text)]">{resolvedTarget.staggerThreshold} / {resolvedTarget.staggerDuration}s</span>
        </div>
      </div>
    </div>
  );
}

/** Tiny inline stat row for custom enemy form */
function StatRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-[var(--color-text-muted)] w-16 text-[10px]">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="flex-1 px-1 py-0.5 text-[10px] font-mono rounded bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-[var(--color-text)] text-right"
      />
      {suffix && <span className="text-[10px] text-[var(--color-text-muted)] w-4">{suffix}</span>}
    </div>
  );
}
