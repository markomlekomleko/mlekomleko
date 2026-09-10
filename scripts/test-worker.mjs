import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Retain the original deterministic domain/SSR tests while shipping Next.js.
// Vinext regenerates next-env.d.ts; restore Next's types after this test build.
const path = new URL('../next-env.d.ts', import.meta.url);
const previous = await readFile(path, 'utf8');
let status;
try { status = spawnSync('npm', ['run', 'build:worker'], { stdio: 'inherit' }).status ?? 1; }
finally { await writeFile(path, previous); }
if (status === 0) {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../tests/', import.meta.url)).filter(file => file.endsWith('.test.mjs')).map(file => `tests/${file}`);
  status = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1;
}
process.exitCode = status;
