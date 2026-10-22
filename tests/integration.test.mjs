import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const hash = text => createHash('sha256').update(text).digest('hex');
const one = randomBytes(32).toString('base64url'), two = randomBytes(32).toString('base64url');
const admin = randomBytes(32).toString('base64url');
let secret = randomBytes(32).toString('hex');
let dir, port, base, worker, cookieOne, cookieTwo, exported, savedNote, loginHashOne = hash(one);
let output = '';
const sockets = new Set();
async function freePort() {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const p = server.address().port;
  await new Promise(r => server.close(r));
  return p;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function writeVars() {
  await writeFile(join(dir, '.dev.vars'), `PLAYER_ONE_HASH=${loginHashOne}\nPLAYER_TWO_HASH=${hash(two)}\nADMIN_TOKEN_HASH=${hash(admin)}\nSESSION_SECRET=${secret}\n`, { mode: 0o600 });
}
async function start() {
  output = '';
  worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
    '--config', join(dir, 'wrangler.json'), '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(await freePort()), '--persist-to', join(dir, 'state'), '--log-level', 'error'], {
    cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false',
      XDG_CONFIG_HOME: join(dir, 'config'), CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker.stdout.on('data', b => { output += b; }); worker.stderr.on('data', b => { output += b; });
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok && (await r.json()).configured) return;
    } catch { /* awaiting local workerd */ }
    if (worker.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(`Local workerd did not become ready: ${output.replaceAll(secret, '[redacted]')}`);
}
async function stop() {
  for (const socket of sockets) socket.close();
  if (!worker || worker.exitCode !== null) return;
  const exited = new Promise(r => worker.once('exit', r));
  worker.kill('SIGTERM');
  const timeout = setTimeout(() => worker.kill('SIGKILL'), 4000);
  await exited; clearTimeout(timeout); await delay(200);
}
async function login(player, code) {
  return fetch(`${base}/api/login`, { method: 'POST', headers: {
    Origin: base, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ player, code }) });
}
function cookie(response) {
  const value = response.headers.get('set-cookie');
  assert.match(value, /HttpOnly; Secure; SameSite=Strict/);
  return value.split(';')[0];
}
async function connect(authCookie, extra = {}) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/ws', { headers: { Origin: base, Cookie: authCookie, ...extra } });
  const queue = [], waiters = [];
  ws.on('message', raw => {
    const event = JSON.parse(String(raw));
    const i = waiters.findIndex(w => w.filter(event));
    if (i !== -1) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.timeout); w.resolve(event); }
    else queue.push(event);
  });
  const receive = (filter = () => true) => {
    const i = queue.findIndex(filter);
    if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { filter, resolve, timeout: setTimeout(() => {
        const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for WS event; queued=${JSON.stringify(queue.slice(-4))}`));
      }, 5000) };
      waiters.push(waiter);
    });
  };
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  sockets.add(ws); ws.once('close', () => sockets.delete(ws));
  const initial = await receive(e => e.type === 'state');
  return { ws, initial, receive, command: async action => {
    const id = action.id ?? randomUUID();
    ws.send(JSON.stringify({ ...action, v: 1, id }));
    try { return await receive(e => e.ack === id || e.requestId === id); }
    catch (error) { throw new Error(`Command ${action.type}: ${error.message}`); }
  }, close: async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const closed = new Promise(r => ws.once('close', r)); ws.close(); await closed;
  } };
}
async function rejectedUpgrade(headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/ws', { headers });
    ws.on('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode); });
    ws.on('open', () => { ws.close(); reject(new Error('Unauthorized WebSocket accepted')); });
    ws.on('error', () => {});
  });
}
async function adminRequest(path, method = 'GET', body) {
  return fetch(`${base}/api/admin/${path}`, { method,
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'planet-integration-'));
  port = await freePort(); base = `http://127.0.0.1:${port}`;
  await writeFile(join(dir, 'tsconfig.json'), await readFile(join(root, 'tsconfig.json')));
  await writeFile(join(dir, 'wrangler.json'), JSON.stringify({ name: 'planet-integration',
    main: join(root, 'server/src/index.ts'), tsconfig: 'tsconfig.json', compatibility_date: '2026-10-01',
    durable_objects: { bindings: [{ name: 'PLANET', class_name: 'Planet' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['Planet'] }],
    vars: { PLANET_ID: 'test-only-home', ALLOWED_ORIGIN: base },
  }));
  await writeVars(); await start();
}, { timeout: 30000 });
after(async () => { await stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

test('private login, same-origin checks, signed cookies and exactly two identities', async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  const foreign = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base }, body: 'x'.repeat(2048) })).status, 413);
  assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base }, body: '{' })).status, 400);
  assert.equal((await login('three', one)).status, 400);
  assert.equal((await login('one', two)).status, 401);
  const r1 = await login('one', one), r2 = await login('two', two);
  assert.equal(r1.status, 200); assert.equal(r2.status, 200);
  cookieOne = cookie(r1); cookieTwo = cookie(r2);
  assert.deepEqual(await (await fetch(`${base}/api/me`, { headers: { Cookie: cookieOne } })).json(), { player: 'one' });
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookieOne + 'x' } })).status, 401);
  for (const expires of [Date.now() - 1, Date.now() + 31 * 86400_000]) {
    const body = `one.${expires}.${randomUUID()}`;
    const signature = createHmac('sha256', secret).update(`${body}.${hash(one)}`).digest('base64url');
    assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: `__Host-planet=${body}.${signature}` } })).status, 401);
  }
  assert.equal(await rejectedUpgrade({ Origin: base }), 401);
  assert.equal(await rejectedUpgrade({ Origin: 'https://evil.example', Cookie: cookieOne }), 403);
  // Spoofed player headers are overwritten by the worker after cookie authentication.
  const client = await connect(cookieOne, { 'X-Player-Id': 'two', 'X-Session-Expiry': '9999999999999999' });
  assert.deepEqual(client.initial.online, ['one']); await client.close();
});

test('shared authoritative movement, distance checks and online-only hug', async () => {
  const a = await connect(cookieOne), b = await connect(cookieTwo);
  assert.equal(b.initial.online.length, 2);
  assert.equal((await a.command({ type: 'ping' })).type, 'pong');
  assert.equal((await a.command({ type: 'hug' })).code, 'TOO_FAR');
  assert.equal((await a.command({ type: 'move', x: 99999, y: 0 })).code, 'OUT_OF_BOUNDS');
  const moved = await a.command({ type: 'move', x: 45, y: -80, player: 'two' });
  assert.equal(moved.type, 'moved');
  assert.equal(moved.player, 'one');
  assert.ok(!('state' in moved), 'movement must not retransmit all notes and furniture');
  assert.ok(moved.position.x < 0, 'server limits displacement rather than accepting teleport');
  await delay(260);
  const near = await a.command({ type: 'move', x: 20, y: -80 });
  const peer = await b.receive(e => e.ack === near.ack);
  assert.deepEqual(peer, near);
  const secondMoved = await b.command({ type: 'move', x: 45, y: -75, player: 'one' });
  assert.equal(secondMoved.player, 'two');
  assert.deepEqual(await a.receive(e => e.ack === secondMoved.ack), secondMoved);
  const positions = (await (await adminRequest('backup')).json()).world.players;
  assert.deepEqual(positions.one, near.position, 'player two cannot move player one');
  assert.deepEqual(positions.two, secondMoved.position);
  const hug = await a.command({ type: 'hug' });
  assert.equal(hug.type, 'hug'); assert.equal((await b.receive(e => e.type === 'hug')).by, 'one');
  await b.close(); await delay(50);
  assert.equal((await a.command({ type: 'hug' })).code, 'PARTNER_OFFLINE');
  await a.close();
});

test('furniture placement, rearrangement, collisions, removal and retry deduplication', async () => {
  const a = await connect(cookieOne);
  const id = randomUUID();
  const placed = await a.command({ id, type: 'place', kind: 'table', x: 95, y: 70 });
  const count = placed.state.furniture.length, revision = placed.state.revision;
  const duplicate = await a.command({ id, type: 'place', kind: 'table', x: 95, y: 70 });
  assert.equal(duplicate.state.furniture.length, count); assert.equal(duplicate.state.revision, revision);
  assert.equal((await a.command({ type: 'place', kind: 'bed', x: 0, y: 0 })).code, 'INVALID_FURNITURE');
  assert.equal((await a.command({ type: 'place', kind: 'stool', x: 95, y: 70 })).code, 'OCCUPIED');
  const f = placed.state.furniture.find(f => f.kind === 'table');
  const moved = await a.command({ type: 'place', kind: 'table', furnitureId: f.id, x: 80, y: 25 });
  assert.equal(moved.state.furniture.find(v => v.id === f.id).y, 25);
  const removed = await a.command({ type: 'remove', furnitureId: f.id });
  assert.equal(removed.state.furniture.length, count - 1);
  await a.close();
});

test('offline partner can read persistent notes; malformed and forged messages are rejected', async () => {
  const a = await connect(cookieOne);
  a.ws.send('{bad json'); assert.equal((await a.receive(e => e.type === 'error')).code, 'BAD_JSON');
  a.ws.send(JSON.stringify({ v: 9, id: randomUUID(), type: 'note', text: 'ignored' }));
  assert.equal((await a.receive(e => e.type === 'error')).code, 'BAD_COMMAND');
  a.ws.send(new Uint8Array([1, 2])); assert.equal((await a.receive(e => e.type === 'error')).code, 'BAD_MESSAGE');
  assert.equal((await a.command({ type: 'note', text: ' ' })).code, 'INVALID_NOTE');
  assert.equal((await a.command({ type: 'note', text: 'a'.repeat(241) })).code, 'INVALID_NOTE');
  const id = randomUUID(); savedNote = `想你 ${randomUUID()}`;
  const note = await a.command({ type: 'note', text: savedNote, author: 'two', id });
  assert.equal(note.state.notes.at(-1).author, 'one');
  assert.equal((await a.command({ type: 'note', text: savedNote, id })).state.notes.length, note.state.notes.length);
  await a.close();
  const b = await connect(cookieTwo);
  assert.equal(b.initial.state.notes.at(-1).text, savedNote); await b.close();
});

test('room furniture capacity and WebSocket burst limits are enforced by the server', async () => {
  const backup = await (await adminRequest('backup')).json();
  const a = await connect(cookieOne);
  let placed = 0;
  for (const y of [-200, -140, -80, -20, 40]) for (const x of [-140, -80, -20, 40, 100]) {
    if (placed >= 23) break;
    const result = await a.command({ type: 'place', kind: 'stool', x, y });
    assert.equal(result.type, 'state'); placed++;
  }
  assert.equal((await a.command({ type: 'place', kind: 'plant', x: 145, y: 125 })).code, 'FURNITURE_LIMIT');
  let limited = false;
  for (let i = 0; i < 10; i++) {
    if ((await a.command({ type: 'ping' })).code === 'RATE_LIMIT') { limited = true; break; }
  }
  assert.ok(limited);
  await a.close(); await delay(30);
  assert.equal((await adminRequest('restore', 'POST', backup)).status, 200);
});

test('reconnecting the same identity closes the previous connection, keeping two slots', async () => {
  const a = await connect(cookieOne);
  const closed = new Promise(r => a.ws.once('close', code => r(code)));
  const replacement = await connect(cookieOne);
  assert.equal(await closed, 4001);
  assert.deepEqual(replacement.initial.online, ['one']);
  await replacement.close();
});

test('simultaneous updates from both players commit without losing either note', async () => {
  const a = await connect(cookieOne), b = await connect(cookieTwo);
  const textOne = `并发一 ${randomUUID()}`, textTwo = `并发二 ${randomUUID()}`;
  await Promise.all([a.command({ type: 'note', text: textOne }), b.command({ type: 'note', text: textTwo })]);
  await a.close(); await b.close();
  const read = await connect(cookieTwo);
  assert.ok(read.initial.state.notes.some(n => n.text === textOne));
  assert.ok(read.initial.state.notes.some(n => n.text === textTwo));
  savedNote = read.initial.state.notes.at(-1).text;
  await read.close();
});

test('administrative backup requires separate authentication and restores atomically', async () => {
  assert.equal((await fetch(`${base}/api/admin/backup`, { headers: { Cookie: cookieOne } })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/backup`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  exported = await (await adminRequest('backup')).json();
  assert.equal(exported.format, 1); assert.ok(exported.receipts.length >= 3);
  const a = await connect(cookieOne);
  await a.command({ type: 'note', text: 'This change must be undone by restore' });
  assert.equal((await adminRequest('restore', 'POST', exported)).status, 409);
  await a.close(); await delay(50);
  assert.equal((await adminRequest('restore', 'POST', { format: 1, world: {} })).status, 400);
  assert.equal((await adminRequest('restore', 'POST', exported)).status, 200);
  const b = await connect(cookieTwo);
  assert.ok(b.initial.state.revision > exported.world.revision);
  assert.equal(b.initial.state.notes.at(-1).text, savedNote); await b.close();
});

test('rolling SQLite snapshots can be enumerated and retrieved independently of current state', async () => {
  const snapshot = await (await adminRequest('snapshot', 'POST')).json();
  assert.ok(snapshot.id > 0);
  const list = await (await adminRequest('snapshots')).json();
  assert.equal(list.snapshots[0].id, snapshot.id);
  const data = await (await adminRequest(`backup?snapshot=${snapshot.id}`)).json();
  assert.equal(data.world.notes.at(-1).text, savedNote);
  assert.equal((await adminRequest('backup?snapshot=999999999')).status, 404);
});

test('encrypted offsite backup CLI round-trips and detects tampering', async () => {
  const backupPath = join(dir, 'backup.planet');
  const env = { ...process.env, PLANET_URL: base, PLANET_ADMIN_TOKEN: admin,
    PLANET_BACKUP_KEY: randomBytes(32).toString('hex') };
  const run = args => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(root, 'scripts/backup.mjs'), ...args], { env, cwd: root });
    let stderr = ''; p.stderr.on('data', b => { stderr += b; });
    p.on('error', reject); p.on('exit', code => resolve({ code, stderr }));
  });
  assert.equal((await run(['export', backupPath])).code, 0);
  const content = await readFile(backupPath, 'utf8');
  assert.ok(!content.includes(savedNote));
  assert.equal((await run(['restore', backupPath])).code, 0);
  const tampered = JSON.parse(content); tampered.tag = Buffer.alloc(16).toString('base64');
  await writeFile(backupPath, JSON.stringify(tampered));
  assert.equal((await run(['restore', backupPath])).code, 1);
});

test('SQLite survives an actual local runtime restart; receipts still deduplicate', async () => {
  await stop(); await start();
  const a = await connect(cookieOne);
  assert.equal(a.initial.state.notes.at(-1).text, savedNote);
  const replay = exported.receipts.find(r => r.player === 'one');
  const revision = a.initial.state.revision;
  const result = await a.command({ type: 'note', text: 'must not be inserted', id: replay.id });
  assert.equal(result.state.revision, revision);
  assert.ok(!result.state.notes.some(n => n.text === 'must not be inserted'));
  await a.close();
});

test('actual client transport persists an offline outbox, resumes it in order and advances past rejections', async () => {
  const source = await readFile(join(root, 'client/assets/scripts/PlanetConnection.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { PlanetConnection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const stored = new Map(); const transportSockets = [];
  let online = true;
  const runtime = { base,
    storage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    request: (url, options) => {
      if (!online) return Promise.reject(new Error('Simulated offline network'));
      return fetch(url, { ...options, headers: { ...options?.headers, Origin: base, Cookie: cookieOne } });
    },
    socket: url => {
      const ws = new WebSocket(online ? url : 'ws://127.0.0.1:1', { headers: { Origin: base, Cookie: cookieOne } });
      transportSockets.push(ws); return ws;
    },
  };
  async function until(condition) {
    for (let i = 0; i < 100; i++) { if (condition()) return; await delay(50); }
    assert.fail('Client transport did not reach expected state');
  }
  let client = new PlanetConnection(runtime);
  try {
    assert.equal(await client.resume(), true); await until(() => client.connected);
    online = false; transportSockets.at(-1).terminate(); await until(() => !client.connected);
    const textA = `离线队列一 ${randomUUID()}`, textB = `离线队列二 ${randomUUID()}`;
    assert.equal(client.send({ type: 'note', text: textA }), true);
    // This placement is valid locally but rejected because the starter plant occupies it.
    client.send({ type: 'place', kind: 'plant', x: -125, y: 90 });
    client.send({ type: 'note', text: textB });
    assert.equal(JSON.parse(stored.get('planet.outbox.v1')).pending.length, 3);
    assert.equal(client.send({ type: 'move', x: 0, y: 0 }), false);
    client.dispose(); online = true;
    client = new PlanetConnection(runtime);
    await client.resume(); await until(() => client.connected);
    await until(() => JSON.parse(stored.get('planet.outbox.v1')).pending.length === 0);
    assert.equal(client.state.notes.filter(n => n.text === textA).length, 1);
    assert.equal(client.state.notes.filter(n => n.text === textB).length, 1);
    assert.ok(client.state.notes.findIndex(n => n.text === textA) < client.state.notes.findIndex(n => n.text === textB));
    savedNote = client.state.notes.at(-1).text;
  } finally { client.dispose(); for (const ws of transportSockets) ws.terminate(); }
});

test('rotating a slot credential invalidates existing cookies and previous pairing credential', async () => {
  await stop(); loginHashOne = hash('replacement-test-credential'); await writeVars(); await start();
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookieOne } })).status, 401);
  assert.equal((await login('one', one)).status, 401);
  assert.equal((await login('one', 'replacement-test-credential')).status, 200);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookieTwo } })).status, 200);
});

test('login attempt limits survive bad credentials', async () => {
  // Rotate test has already made two attempts in the current one-minute window.
  let limited = false;
  for (let i = 0; i < 12; i++) {
    if ((await login('two', 'bad')).status === 429) { limited = true; break; }
  }
  assert.ok(limited);
});

test('session-key rotation invalidates both players existing cookies', async () => {
  await stop(); secret = randomBytes(32).toString('hex'); await writeVars(); await start();
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookieOne } })).status, 401);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookieTwo } })).status, 401);
});
