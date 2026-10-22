import { access, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const build = resolve(root, 'client/build/web-mobile');
try {
  await access(resolve(build, 'index.html'));
  await access(resolve(build, 'application.js'));
} catch { console.error('A real Creator Web Mobile build is required at client/build/web-mobile. Open docs/COCOS.md.'); process.exit(1); }
await copyFile(resolve(root, 'pages/_headers'), resolve(build, '_headers'));
await writeFile(resolve(build, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy', build], {
  cwd: resolve(root, 'pages'), stdio: 'inherit',
});
process.exit(result.status ?? 1);
