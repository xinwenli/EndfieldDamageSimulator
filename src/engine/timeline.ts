import type {
  Stats,
  Skill,
  TimelineTrack,
  SimulationResult,
  OperatorResult,
  SkillDamageResult,
} from "./types";
import { calcExpectedHitDamage } from "./formulas";

/**
 * Run a timeline simulation and return DPS results.
 * Processes the timeline frame-by-frame and computes damage.
 */
export function runSimulation(
  tracks: TimelineTrack[],
  operatorStats: Map<string, Stats>,
  operatorSkills: Map<string, Skill[]>,
  bossDef?: number,
  bossRes?: number,
): SimulationResult {
  const totalFrames = computeTotalFrames(tracks);
  const def = bossDef ?? 0;
  const res = bossRes ?? 0;

  const results: OperatorResult[] = [];

  for (const track of tracks) {
    const stats = operatorStats.get(track.operatorId);
    const skills = operatorSkills.get(track.operatorId);
    if (!stats || !skills) continue;

    const skillMap = new Map(skills.map((s) => [s.id, s]));
    const skillDamageMap = new Map<string, { casts: number; totalDamage: number }>();

    let totalDamage = 0;

    for (const block of track.blocks) {
      const skill = skillMap.get(block.skillId);
      if (!skill) continue;

      const existing = skillDamageMap.get(block.skillId) ?? {
        casts: 0,
        totalDamage: 0,
      };

      const isArts = skill.type === "arts";
      const damagePerHit = calcExpectedHitDamage(
        stats.atk,
        skill.multiplier,
        def,
        res,
        stats.critRate,
        stats.critDmg,
        isArts,
      );

      const blockDamage = damagePerHit * skill.hits;
      existing.casts += 1;
      existing.totalDamage += blockDamage;
      totalDamage += blockDamage;

      skillDamageMap.set(block.skillId, existing);
    }

    const trackDps = totalFrames > 0 ? totalDamage / (totalFrames / 30) : 0; // 30fps → seconds

    const skillBreakdown: SkillDamageResult[] = [];
    for (const [skillId, data] of skillDamageMap) {
      const skill = skillMap.get(skillId);
      skillBreakdown.push({
        skillId,
        skillName: skill?.name ?? skillId,
        casts: data.casts,
        totalDamage: data.totalDamage,
        dps: totalFrames > 0 ? data.totalDamage / (totalFrames / 30) : 0,
      });
    }

    results.push({
      operatorId: track.operatorId,
      operatorName: track.operatorId,
      totalDamage,
      dps: trackDps,
      damageShare: 0, // computed below
      skillBreakdown,
    });
  }

  const grandTotalDamage = results.reduce((sum, r) => sum + r.totalDamage, 0);
  for (const r of results) {
    r.damageShare = grandTotalDamage > 0 ? r.totalDamage / grandTotalDamage : 0;
  }

  const totalDps = totalFrames > 0 ? grandTotalDamage / (totalFrames / 30) : 0;

  return {
    totalDamage: grandTotalDamage,
    totalFrames,
    dps: totalDps,
    operatorResults: results,
  };
}

function computeTotalFrames(tracks: TimelineTrack[]): number {
  let maxFrame = 0;
  for (const track of tracks) {
    for (const block of track.blocks) {
      const end = block.startFrame + block.duration;
      if (end > maxFrame) maxFrame = end;
    }
  }
  return maxFrame;
}

export { computeTotalFrames };
