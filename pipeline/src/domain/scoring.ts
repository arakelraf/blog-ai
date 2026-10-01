export interface ScoringConfig {
  cpcWeight: number;
  commissionByCount: Record<string, number>;
  minScore: number;
  topNPerDay: number;
}

export interface ScoreInput {
  volume: number;
  difficulty: number;
  cpc: number;
  matchedAffiliates: number;
}

/**
 * score = volume * cpcFactor * commissionFactor / (difficulty + 10)
 *   cpcFactor        = 1 + cpc * cpcWeight
 *   commissionFactor = table lookup by number of qualifying affiliates (capped at 4)
 */
export function computeScore(input: ScoreInput, cfg: ScoringConfig): number {
  const cpcFactor = 1 + input.cpc * cfg.cpcWeight;
  const key = String(Math.min(Math.max(input.matchedAffiliates, 0), 4));
  const commissionFactor = cfg.commissionByCount[key] ?? 0;
  const score = (input.volume * cpcFactor * commissionFactor) / (input.difficulty + 10);
  return Math.round(score * 100) / 100;
}

/** Clusters above threshold, highest score first, limited to the daily quota. */
export function selectTopN<T extends { score: number }>(clusters: T[], cfg: ScoringConfig): T[] {
  return clusters
    .filter((c) => c.score >= cfg.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.topNPerDay);
}
