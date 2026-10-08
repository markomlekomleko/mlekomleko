import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Visual capture runs (screenshots, computed-style digest, design metrics).
//   VISUAL_OUT=output/qa/<run>/<label> npm run test:visual
// VISUAL_PROD=1 builds into the isolated E2E_DIST_DIR (.next-e2e) and serves that
// production build instead of the dev server. next.config.ts reads E2E_DIST_DIR for
// `next build` and `next start` alike, and the webServer env below carries it to both.
const prod = process.env.VISUAL_PROD === "1";
const baseServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
if (!baseServer) throw new Error("playwright.config.ts must define a webServer");

export default defineConfig({
  ...config,
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 180_000,
  // Playwright empties outputDir on every run; a subfolder leaves e2e artifacts alone.
  outputDir: "test-results/visual",
  use: {
    ...config.use,
    // Captures are artifacts themselves; per-action traces only slow the run down.
    trace: "off",
    screenshot: "off",
    // Software WebGL, as in playwright.design.config.ts, so any canvas renders the same
    // on every host.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    ...baseServer,
    command: prod
      ? "node scripts/migrate.mjs --local && npm run build && npm run start -- --port 4173"
      : baseServer.command,
    timeout: prod ? 600_000 : 300_000,
  },
});
