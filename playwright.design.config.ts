import config from "./playwright.config";
// Use the built app and isolated test database alongside an existing dev preview.
export default {
  ...config,
  // Explicit software WebGL makes the scene checks reproducible on headless hosts.
  use: { ...config.use, launchOptions: { args: ["--enable-unsafe-swiftshader"] } },
  webServer: {
    ...config.webServer,
    command: "node scripts/migrate.mjs --local && npm run start -- --port 4173",
  },
};
