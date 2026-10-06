import type { AccountStrategy, ContentPillar } from "@/lib/domain/types";
import type { AccountStrategistOutput } from "@/lib/ai/schemas";

/** Converts an applied Strategist proposal into the editable account strategy. */
export function strategyFromProposal(proposal: AccountStrategistOutput, current: AccountStrategy, pillars: ContentPillar[]): AccountStrategy {
  return {
    ...current,
    targetAudience: proposal.targetAudience,
    persona: proposal.targetPersona,
    kpiTargets: [proposal.primaryKpi, ...proposal.secondaryKpis].filter((k) => k.metric.trim()),
    contentPillars: proposal.recommendedContentPillars.map(
      (p) => pillars.find((x) => x.key === p.key)?.key ?? pillars.find((x) => x.label === p.label)?.key ?? p.label,
    ),
    postsPerWeek: proposal.recommendedPostsPerWeek,
    postingFrequencyNote: proposal.postingFrequencyNote,
    preferredPostingDays: [...new Set(proposal.recommendedPostingDays)].sort(),
    preferredPostingTimes: [...new Set(proposal.recommendedPostingTimes)].sort(),
    cta: proposal.ctaStrategy,
    tone: proposal.tone,
  };
}
