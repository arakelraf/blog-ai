import { describe, it, expect } from "vitest";
import { classifyIntent } from "../src/domain/intent.js";
import { clusterKeywords, type ScoredKeyword } from "../src/domain/cluster.js";

describe("classifyIntent", () => {
  it("detects commercial page types", () => {
    expect(classifyIntent("best ai writing tools").pageType).toBe("best-list");
    expect(classifyIntent("top ai seo tools").pageType).toBe("best-list");
    expect(classifyIntent("jasper vs copy.ai").pageType).toBe("versus");
    expect(classifyIntent("jasper review").pageType).toBe("review");
    expect(classifyIntent("jasper alternatives").pageType).toBe("alternatives");
    expect(classifyIntent("jasper pricing").pageType).toBe("deal");
    expect(classifyIntent("cheapest ai writer").pageType).toBe("deal");
  });

  it("rejects informational intent", () => {
    expect(classifyIntent("what is an ai writer").commercial).toBe(false);
    expect(classifyIntent("how does ai writing work").commercial).toBe(false);
  });
});

describe("clusterKeywords", () => {
  const mk = (keyword: string, volume: number): ScoredKeyword => ({
    keyword,
    volume,
    difficulty: 30,
    cpc: 5,
    pageType: "best-list",
    source: "suggestions",
    category: "ai-writing",
  });

  it("merges synonymous keywords into one cluster", () => {
    const clusters = clusterKeywords([
      mk("best ai writing tools", 9000),
      mk("best ai writing tools for startups", 1200),
      mk("top ai writing tools", 3000),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.primaryKeyword).toBe("best ai writing tools");
    expect(clusters[0]!.members).toHaveLength(3);
    expect(clusters[0]!.volume).toBe(9000);
  });

  it("keeps different page types separate", () => {
    const clusters = clusterKeywords([
      mk("best ai writing tools", 9000),
      { ...mk("ai writing tools review", 500), pageType: "review" },
    ]);
    expect(clusters).toHaveLength(2);
  });
});
