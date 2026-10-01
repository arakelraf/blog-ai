import { describe, it, expect } from "vitest";
import { computeScore, selectTopN, type ScoringConfig } from "../src/domain/scoring.js";

const cfg: ScoringConfig = {
  cpcWeight: 1.0,
  commissionByCount: { "0": 0, "1": 0.6, "2": 1.0, "3": 1.3, "4": 1.5 },
  minScore: 300,
  topNPerDay: 5,
};

describe("computeScore", () => {
  it("applies cpc and commission factors over difficulty", () => {
    // volume 5000, cpc 4 -> cpcFactor 5; 2 affiliates -> commission 1.0; difficulty 40 -> /50
    // 5000 * 5 * 1.0 / 50 = 500
    expect(computeScore({ volume: 5000, difficulty: 40, cpc: 4, matchedAffiliates: 2 }, cfg)).toBe(500);
  });

  it("returns 0 when there are no affiliates (not monetizable)", () => {
    expect(computeScore({ volume: 9000, difficulty: 10, cpc: 10, matchedAffiliates: 0 }, cfg)).toBe(0);
  });

  it("caps commission factor at 4 affiliates", () => {
    const a = computeScore({ volume: 1000, difficulty: 0, cpc: 0, matchedAffiliates: 4 }, cfg);
    const b = computeScore({ volume: 1000, difficulty: 0, cpc: 0, matchedAffiliates: 9 }, cfg);
    expect(a).toBe(b);
  });
});

describe("selectTopN", () => {
  it("filters below threshold and limits to N, highest first", () => {
    const clusters = [
      { score: 1000 },
      { score: 250 }, // below threshold
      { score: 800 },
      { score: 600 },
      { score: 500 },
      { score: 400 },
      { score: 350 },
    ];
    const top = selectTopN(clusters, { ...cfg, topNPerDay: 3 });
    expect(top.map((c) => c.score)).toEqual([1000, 800, 600]);
  });
});
