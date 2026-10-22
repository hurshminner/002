import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { auditClient } from './audit-client.mjs';
const root = resolve(import.meta.dirname, '..');
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(root, 'tsconfig.client.json')], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const resultSummary = auditClient(resolve(root, 'client'));
console.log(`Official Creator 3.8.8 TypeScript and static asset audit passed: ${JSON.stringify(resultSummary)}. This does not run Creator, import assets or build Web Mobile.`);
