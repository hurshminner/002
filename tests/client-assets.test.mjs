import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditClient } from '../scripts/audit-client.mjs';

const client = resolve(import.meta.dirname, '../client');
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'little-world-assets-'));
  const copy = join(dir, 'client');
  try {
    await cp(client, copy, { recursive: true, filter: path => !/\/(library|temp|build|local|profiles)(\/|$)/.test(path) });
    await run(copy);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
async function edit(path, mutate) {
  const data = JSON.parse(await readFile(path, 'utf8')); mutate(data);
  await writeFile(path, JSON.stringify(data));
}
test('real project has a consistent active Bootstrap and no formal character art assigned', () => {
  const result = auditClient(client);
  assert.equal(result.graphs, 1); assert.equal(result.components, 3); assert.equal(result.formalArtBindings, 0);
});
test('audit rejects missing script metadata', () => fixture(async dir => {
  await unlink(join(dir, 'assets/scripts/CharacterView.ts.meta'));
  assert.throws(() => auditClient(dir), /Missing \.meta/);
}));
test('audit rejects duplicate asset identities', () => fixture(async dir => {
  const meta = JSON.parse(await readFile(join(dir, 'assets/scripts/PlanetGame.ts.meta'), 'utf8'));
  await edit(join(dir, 'assets/scripts/WorldView.ts.meta'), data => { data.uuid = meta.uuid; });
  assert.throws(() => auditClient(dir), /Duplicate asset UUID/);
}));
test('audit rejects a component bound to the wrong scene node', () => fixture(async dir => {
  await edit(join(dir, 'assets/Home.scene'), data => { data[3].node.__id__ = 1; });
  assert.throws(() => auditClient(dir), /Component owner mismatch/);
}));
test('audit rejects dangling art asset references', () => fixture(async dir => {
  await edit(join(dir, 'assets/Home.scene'), data => {
    data[3].playerOneVisual = { __uuid__: '00000000-0000-4000-8000-000000000001' };
  });
  assert.throws(() => auditClient(dir), /Unresolved asset UUID/);
}));
test('audit rejects a future character prefab without its presentation component', () => fixture(async dir => {
  const uuid = '00000000-0000-4000-8000-000000000002';
  await writeFile(join(dir, 'assets/prefabs/characters/invalid.prefab'), JSON.stringify([
    { __type__: 'cc.Prefab', data: { __id__: 1 } },
    { __type__: 'cc.Node', _name: 'InvalidArt', _children: [], _components: [], _parent: null },
  ]));
  await writeFile(join(dir, 'assets/prefabs/characters/invalid.prefab.meta'), JSON.stringify({ uuid, importer: 'prefab' }));
  await edit(join(dir, 'assets/Home.scene'), data => { data[3].playerOneVisual = { __uuid__: uuid }; });
  assert.throws(() => auditClient(dir), /prefab root has no CharacterView/);
}));
test('audit rejects missing portrait project settings', () => fixture(async dir => {
  await edit(join(dir, 'settings/v2/packages/project.json'), data => { data.general.designResolution.width = 960; });
  assert.throws(() => auditClient(dir), /Portrait project design resolution/);
}));
