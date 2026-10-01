export type PageType = "best-list" | "versus" | "review" | "alternatives" | "deal";

export interface IntentResult {
  commercial: boolean;
  pageType: PageType | null;
}

/**
 * Classify a keyword by commercial intent and target page type.
 * Patterns: best X / best X for Y / top X tools, X vs Y, X review,
 * X alternative(s), X pricing|discount|coupon|cheapest|deal|free.
 */
export function classifyIntent(keyword: string): IntentResult {
  const k = ` ${keyword.toLowerCase().trim()} `;

  // Informational guards — explicitly NOT commercial.
  if (/\b(what is|how to|how does|why|guide|tutorial|meaning|examples?)\b/.test(k)) {
    return { commercial: false, pageType: null };
  }

  if (/\bvs\.?\b|\bversus\b/.test(k)) return { commercial: true, pageType: "versus" };
  if (/\balternatives?\b/.test(k)) return { commercial: true, pageType: "alternatives" };
  if (/\breviews?\b/.test(k)) return { commercial: true, pageType: "review" };
  if (/\b(pricing|price|cost|discount|coupon|promo|deal|deals|cheapest|cheap|free)\b/.test(k)) {
    return { commercial: true, pageType: "deal" };
  }
  if (/\b(best|top)\b/.test(k)) return { commercial: true, pageType: "best-list" };

  return { commercial: false, pageType: null };
}
