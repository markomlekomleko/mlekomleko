// Server runtime used by Next.js/Vercel. No Cloudflare bindings are required.
export const env = {
  ...process.env,
  APP_ENV: process.env.VERCEL ? "production" : (process.env.APP_ENV ?? "local"),
};

export { getDatabase } from "../db/node";
