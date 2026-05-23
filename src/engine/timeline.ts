import type {
  Stats,
  Skill,
  TimelineTrack,
  SimulationResult,
  OperatorResult,
  SkillDamageResult,
} from "./types";

/**
 * Estimate total damage from a skill's damage ticks.
 * Uses stagger as a proxy for damage value per tick.
 */
function estimateSkillDamage(ticks: { stagger: number }[]): number {
  return ticks.reduce((sum, t) => sum + t.stagger, 0);
}

/**
 * Run a timeline simulation and return DPS results.
 * Processes skill blocks against target DEF/RES.
 */
export function runSimulation(
  tracks: TimelineTrack[],
  operatorStats: Map<string, Stats>,
  operatorSkills: Map<string, Skill[]>,
  _bossDef?: number,
  _bossRes?: number,
): SimulationResult {
  const totalFrames = computeTotalFrames(tracks);
  const fps = 30;
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

      const tickDamage = estimateSkillDamage(skill.damageTicks);
      const baseDamage = tickDamage * stats.atk / 100;
      const avgCritMult = 1 + stats.critRate * (stats.critDmg - 1);
      const skillDmg = baseDamage * avgCritMult;

      existing.casts += 1;
      existing.totalDamage += skillDmg;
      totalDamage += skillDmg;

      skillDamageMap.set(block.skillId, existing);
    }

    const trackDps = totalFrames > 0 ? totalDamage / (totalFrames / fps) : 0;

    const skillBreakdown: SkillDamageResult[] = [];
    for (const [skillId, data] of skillDamageMap) {
      const skill = skillMap.get(skillId);
      skillBreakdown.push({
        skillId,
        skillName: skill?.name ?? skillId,
        casts: data.casts,
        totalDamage: data.totalDamage,
        dps: totalFrames > 0 ? data.totalDamage / (totalFrames / fps) : 0,
      });
    }

    results.push({
      operatorId: track.operatorId,
      operatorName: track.operatorId,
      totalDamage,
      dps: trackDps,
      damageShare: 0,
      skillBreakdown,
    });
  }

  const grandTotalDamage = results.reduce((sum, r) => sum + r.totalDamage, 0);
  for (const r of results) {
    r.damageShare = grandTotalDamage > 0 ? r.totalDamage / grandTotalDamage : 0;
  }

  const totalDps = totalFrames > 0 ? grandTotalDamage / (totalFrames / fps) : 0;

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
