import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Retain the original deterministic domain/SSR tests while shipping Next.js.
// Vinext regenerates next-env.d.ts; restore Next's types after this test build.
const path = new URL('../next-env.d.ts', import.meta.url);
const previous = await readFile(path, 'utf8');
// Vinext also replaces Next's route type exports. Preserve them so npm test
// cannot break an otherwise valid subsequent Next build or typecheck.
const routesPath = new URL('../.next/types/routes.d.ts', import.meta.url);
const previousRoutes = await readFile(routesPath, 'utf8').catch(() => null);
let status;
try { status = spawnSync('npm', ['run', 'build:worker'], { stdio: 'inherit' }).status ?? 1; }
finally {
  await writeFile(path, previous);
  if (previousRoutes !== null) await writeFile(routesPath, previousRoutes);
}
if (status === 0) {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../tests/', import.meta.url)).filter(file => file.endsWith('.test.mjs')).map(file => `tests/${file}`);
  status = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1;
}
process.exitCode = status;
