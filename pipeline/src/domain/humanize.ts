// Cliché stop-list — phrases that scream "AI wrote this". Used both to steer
// generation (we forbid them in the prompt) and to reject in the quality gate.
export const CLICHES: string[] = [
  "in today's digital age",
  "in today's fast-paced world",
  "in the ever-evolving",
  "in the world of",
  "when it comes to",
  "let's dive in",
  "let's dive deep",
  "dive into",
  "we've got you covered",
  "look no further",
  "at the end of the day",
  "it's important to note",
  "it's worth noting",
  "needless to say",
  "the bottom line",
  "game-changer",
  "game changer",
  "revolutionize",
  "revolutionary",
  "unlock the power",
  "unleash",
  "take your",
  "to the next level",
  "in conclusion",
  "navigate the",
  "landscape of",
  "elevate your",
  "seamless",
  "seamlessly",
  "cutting-edge",
  "robust solution",
  "plethora",
  "myriad",
  "in summary",
  "rest assured",
  "a testament to",
  "whether you're",
  "say goodbye to",
  "harness the power",
];

export function findCliches(text: string): string[] {
  const lower = text.toLowerCase();
  return CLICHES.filter((c) => lower.includes(c));
}

/** Normalize a paragraph for duplicate detection. */
function norm(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Detect repeated or near-identical paragraphs (AI repetition tell). */
export function findRepeatedParagraphs(paragraphs: string[]): string[] {
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  for (const p of paragraphs) {
    const n = norm(p);
    if (n.length < 40) continue;
    const prefix = n.slice(0, 80);
    seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
    if ((seen.get(prefix) ?? 0) > 1) dupes.push(p.slice(0, 80));
  }
  return dupes;
}

/** Collect every text fragment in an article for cliché/repetition scanning. */
export function collectProse(obj: unknown, acc: string[] = []): string[] {
  if (typeof obj === "string") acc.push(obj);
  else if (Array.isArray(obj)) obj.forEach((x) => collectProse(x, acc));
  else if (obj && typeof obj === "object") Object.values(obj).forEach((v) => collectProse(v, acc));
  return acc;
}
