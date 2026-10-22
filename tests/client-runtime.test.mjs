import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

// Execute real engine-independent modules; no cc implementation is stubbed or claimed to run.
async function load(name) {
  const source = await readFile(resolve(import.meta.dirname, `../client/assets/scripts/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { selectClipBinding, motionFacing, compareFootDepth } = await load('CharacterPresentation');
const { PlanetConnection } = await load('PlanetConnection');
const legacy = { idleClip: {}, walkClip: {}, hugClip: {} };

for (const direction of ['Up', 'Down', 'Left', 'Right']) test(`idle/walk choose supplied ${direction.toLowerCase()} art independently`, () => {
  const clips = { ...legacy, [`idle${direction}Clip`]: {}, [`walk${direction}Clip`]: {} };
  assert.equal(selectClipBinding(clips, 'idle', direction.toLowerCase()), `idle${direction}Clip`);
  assert.equal(selectClipBinding(clips, 'walk', direction.toLowerCase()), `walk${direction}Clip`);
  assert.equal(selectClipBinding(clips, 'hug', direction.toLowerCase()), 'hugClip');
});
test('missing directional clips retain legacy assets and deterministic idle fallbacks', () => {
  assert.equal(selectClipBinding(legacy, 'walk', 'up'), 'walkClip');
  const clips = { idleClip: {}, walkClip: null, hugClip: null, idleUpClip: {} };
  assert.equal(selectClipBinding(clips, 'walk', 'up'), 'idleUpClip');
  assert.equal(selectClipBinding(clips, 'hug', 'up'), 'idleUpClip');
  assert.equal(selectClipBinding(clips, 'idle', 'right'), 'idleClip');
  assert.equal(selectClipBinding({ idleClip: null, walkClip: null, hugClip: null }, 'walk', 'left'), null);
});
test('clips with identical imported names have different binding aliases', () => {
  const clips = { ...legacy, idleUpClip: { name: 'idle' }, idleLeftClip: { name: 'idle' } };
  assert.notEqual(selectClipBinding(clips, 'idle', 'up'), selectClipBinding(clips, 'idle', 'left'));
});
test('stopping and sub-threshold jitter preserve last facing; motion chooses dominant axis', () => {
  assert.deepEqual(motionFacing('left', 0, 0), { moving: false, facing: 'left' });
  assert.deepEqual(motionFacing('up', 0.001, -0.001), { moving: false, facing: 'up' });
  for (const [dx, dy, direction] of [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'up'], [0, -1, 'down']]) {
    assert.deepEqual(motionFacing('down', dx, dy), { moving: true, facing: direction });
  }
});
test('foot sorting draws lower positions in front and has stable ties independent of sprite dimensions', () => {
  const nodes = [{ name: 'b', y: 0, imageHeight: 512 }, { name: 'front', y: -50, imageHeight: 32 },
    { name: 'back', y: 50, imageHeight: 1024 }, { name: 'a', y: 0, imageHeight: 16 }];
  assert.deepEqual(nodes.sort(compareFootDepth).map(n => n.name), ['back', 'a', 'b', 'front']);
});

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function runtime(request) {
  return { base: 'https://test.invalid', request,
    storage: { getItem: () => null, setItem: () => {} },
    socket: () => { assert.fail('Disposed transport opened a socket'); } };
}
test('a resume request completing after dispose cannot revive a player or open a connection', async () => {
  const pending = deferred();
  const client = new PlanetConnection(runtime(() => pending.promise));
  const resumed = client.resume(); client.dispose();
  pending.resolve(Response.json({ player: 'one' }));
  assert.equal(await resumed, false); assert.equal(client.player, null); assert.equal(client.connected, false);
});
test('dispose while reading the response body cannot revive a connection', async () => {
  const body = deferred(), entered = deferred();
  const client = new PlanetConnection(runtime(async () => ({ status: 200, ok: true,
    json: () => { entered.resolve(); return body.promise; } })));
  const resumed = client.resume(); await entered.promise; client.dispose();
  body.resolve({ player: 'one' });
  assert.equal(await resumed, false); assert.equal(client.player, null);
});
test('a login completing after scene disposal leaves transport stopped', async () => {
  const pending = deferred();
  const client = new PlanetConnection(runtime(() => pending.promise));
  const loggedIn = client.login('two', 'test-credential'); client.dispose();
  pending.resolve(Response.json({ player: 'two' })); await loggedIn;
  assert.equal(client.player, null); assert.equal(client.connected, false);
});
test('constructing browser transport does not access a blocked localStorage getter', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { origin: 'https://test.invalid' },
    get localStorage() { throw new Error('Storage blocked'); },
  } });
  try { const client = new PlanetConnection(); client.dispose(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
});
