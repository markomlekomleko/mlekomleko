import { spawnSync } from 'node:child_process';
import { postgresUrl } from '../db/postgres-config.mjs';

const url = postgresUrl(process.env, true);
if (!url) throw new Error('Set PostgreSQL connection variables before running test:postgres.');
const result = spawnSync(process.execPath, ['--test', 'tests/postgres-sql.test.mjs', 'tests/vercel/runtime.test.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_POSTGRES_URL: url, TEST_POSTGRES_RUNTIME_URL: postgresUrl() },
});
process.exitCode = result.status ?? 1;
