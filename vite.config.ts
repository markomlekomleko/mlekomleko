import vinext from "vinext";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const LOCAL_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const persistStatePath = process.env.D1_PERSIST_PATH ?? ".wrangler/state";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      // Preserve the existing local database and migration history.
      database_name: "site-creator-d1",
      database_id: LOCAL_DATABASE_ID,
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      {
        name: "worker-test-runtime",
        enforce: "pre",
        transform(_code: string, id: string) {
          if (id.split("?")[0] === fileURLToPath(new URL("./server/runtime.ts", import.meta.url))) {
            return 'export { env, getDatabase } from "./runtime.worker";';
          }
        },
      },
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
        persistState: { path: persistStatePath },
      }),
    ],
  };
});
