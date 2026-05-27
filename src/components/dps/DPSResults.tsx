import { useTimelineStore } from "../../stores/timelineStore";
import { getOperatorById } from "../../engine/dataLoader";
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = ["#e87040", "#5bc0de", "#f0c040", "#6db36d", "#c4a35a", "#9b59b6", "#ff6b6b", "#4ecdc4"];

function formatNumber(n: number): string {
  if (n >= 10_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 100_000) return (n / 1_000).toFixed(1) + "K";
  return Math.floor(n).toString();
}

export function DPSResults() {
  const simulationResult = useTimelineStore((s) => s.simulationResult);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const fps = useTimelineStore((s) => s.fps);

  const frames = simulationResult?.frames;
  const cutoffFrame = Math.min(currentFrame, (frames?.length ?? 1) - 1);

  // Build cumulative damage up to cutoff frame
  const { chartData, pieData, operatorTotals, grandTotal, cutoffTime } = useMemo(() => {
    if (!frames) return { chartData: [], pieData: [], operatorTotals: new Map(), grandTotal: 0, cutoffTime: 0 };

    const cumDamage: Record<string, number> = {};
    const opDmgMap = new Map<string, number>();
    const chartPoints: { time: number; [key: string]: number }[] = [];
    const step = Math.max(1, Math.floor(frames.length / 200));

    for (let i = 0; i <= cutoffFrame; i++) {
      const frame = frames[i];
      for (const event of frame.events) {
        if (event.type === "damage" && event.damage) {
          const opName = getOperatorById(event.operatorId)?.name || event.operatorId;
          cumDamage[opName] = (cumDamage[opName] || 0) + event.damage;
          opDmgMap.set(event.operatorId, (opDmgMap.get(event.operatorId) || 0) + event.damage);
        }
      }
      if (i % step === 0 || i === cutoffFrame) {
        const point: { time: number; [key: string]: number } = { time: Math.round(frame.time * 10) / 10 };
        for (const [name, dmg] of Object.entries(cumDamage)) {
          point[name] = Math.floor(dmg);
        }
        chartPoints.push(point);
      }
    }

    const total = [...opDmgMap.values()].reduce((s, v) => s + v, 0);
    const pie = [...opDmgMap.entries()].map(([opId, dmg]) => ({
      name: getOperatorById(opId)?.name || opId,
      value: dmg,
    }));

    return {
      chartData: chartPoints,
      pieData: pie,
      operatorTotals: opDmgMap,
      grandTotal: total,
      cutoffTime: cutoffFrame / fps,
    };
  }, [frames, cutoffFrame, fps]);

  if (!simulationResult) {
    return (
      <div className="p-4 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-[var(--color-text-muted)]">
          DPS Results
        </h2>
        <div className="flex items-center justify-center h-32 rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm">
          Run simulation to see results
        </div>
      </div>
    );
  }

  const dps = cutoffTime > 0 ? grandTotal / cutoffTime : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Total Damage</div>
          <div className="text-lg font-bold text-[var(--color-accent)] font-mono">{formatNumber(grandTotal)}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Duration</div>
          <div className="text-lg font-bold text-[var(--color-text)] font-mono">{cutoffTime.toFixed(1)}s</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Team DPS</div>
          <div className="text-lg font-bold text-[var(--color-accent)] font-mono">{formatNumber(dps)}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Damage over time */}
        <div className="lg:col-span-2 p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
          <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-[var(--color-text-muted)]">
            Cumulative Damage
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                stroke="var(--color-border)"
                unit="s"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                stroke="var(--color-border)"
                tickFormatter={formatNumber}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value) => [formatNumber(value as number), ""]}
              />
              {simulationResult.operatorResults.map((r, i) => (
                <Line
                  key={r.operatorId}
                  type="monotone"
                  dataKey={getOperatorById(r.operatorId)?.name || r.operatorName}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
          <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-[var(--color-text-muted)]">
            Damage Share
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value) => [formatNumber(value as number), "Damage"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Operator breakdown table */}
      <div className="rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] overflow-hidden">
        <h3 className="text-xs font-semibold p-3 pb-0 uppercase tracking-wide text-[var(--color-text-muted)]">
          Operator Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Operator</th>
                <th className="text-right p-3 text-[var(--color-text-muted)] font-medium">Damage</th>
                <th className="text-right p-3 text-[var(--color-text-muted)] font-medium">DPS</th>
                <th className="text-right p-3 text-[var(--color-text-muted)] font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {simulationResult.operatorResults.map((r, i) => {
                const dmg = operatorTotals.get(r.operatorId) || 0;
                const share = grandTotal > 0 ? dmg / grandTotal : 0;
                const opDps = cutoffTime > 0 ? dmg / cutoffTime : 0;
                return (
                <tr key={r.operatorId} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="p-3 flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-[var(--color-text)]">
                      {getOperatorById(r.operatorId)?.name || r.operatorName}
                    </span>
                  </td>
                  <td className="text-right p-3 font-mono text-[var(--color-text)]">{formatNumber(dmg)}</td>
                  <td className="text-right p-3 font-mono text-[var(--color-text)]">{formatNumber(opDps)}</td>
                  <td className="text-right p-3 font-mono text-[var(--color-text)]">
                    {(share * 100).toFixed(1)}%
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
