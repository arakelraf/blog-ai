import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

// Single place to change the production domain once a real one exists.
export const SITE = "https://example.com";

export default defineConfig({
  site: SITE,
  integrations: [tailwind({ applyBaseStyles: false })],
  build: { format: "directory" },
});
