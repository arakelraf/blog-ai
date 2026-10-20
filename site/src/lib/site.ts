export const site = {
  name: "Stacked",
  tagline: "Independent reviews of the AI tools worth paying for.",
  description:
    "Hands-on, no-nonsense reviews and comparisons of AI software. We test the tools so you don't waste a subscription.",
  locale: "en-US",
  // Production URL (includes the /blog-ai base on GitHub Pages).
  // When you move to a custom domain served at root, set this to e.g.
  // "https://yourdomain.com" and set BASE="" in the deploy workflow.
  url: "https://arakelraf.github.io/blog-ai",
  author: "Stacked Editorial",
  twitter: "@stacked",
  // Paste the Google Search Console verification token here (meta-tag method).
  googleVerification: "",
  // Pre-launch: keep the site out of search until real content + real domain.
  // Flip to false when ready to be indexed.
  noindex: true,
};

/** Join a root-absolute path to the production base URL. */
export function abs(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${site.url}${p}`;
}

export const categories: Record<string, { title: string; blurb: string }> = {
  "ai-writing": {
    title: "AI Writing",
    blurb: "Copywriters, blog engines and brand-voice tools, ranked by output quality.",
  },
  "ai-website-builders": {
    title: "AI Website Builders",
    blurb: "From prompt to published site — which builders actually ship something usable.",
  },
  "ai-seo": { title: "AI SEO", blurb: "Research, briefs and optimization tools for ranking content." },
  "ai-image": { title: "AI Image", blurb: "Generators and editors for on-brand visuals at scale." },
  "ai-video": { title: "AI Video", blurb: "Avatars, editors and generators for video without a crew." },
  "ai-chatbots": { title: "AI Chatbots", blurb: "Assistants and agents for support, research and ops." },
};

export const authors: Record<string, { name: string; role: string; bio: string }> = {
  "editorial": {
    name: "Stacked Editorial",
    role: "Reviews team",
    bio: "A small team that buys the subscriptions, runs the tests, and reports what actually happened.",
  },
};

export function go(productId: string, slug: string, block: string): string {
  const params = new URLSearchParams({ src: slug, pos: block });
  return `/go/${productId}?${params.toString()}`;
}
