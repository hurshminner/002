import { DurableObject } from 'cloudflare:workers';
import { initialWorld, isPlayer, validPoint, validWorld, type Command, type PlayerId,
  type ServerEvent, type World } from '../../client/assets/scripts/shared/protocol';
import { authenticateCode, boundedText, COOKIE, createSession, json, sha256, type Env } from './auth';

type Attachment = { player: PlayerId; expires: number; credentialHash: string;
  sessionKeyHash: string; since: number; count: number; lastMove: number; lastHug: number };
type Receipt = { player: string; id: string };
export class Planet extends DurableObject<Env> {
  private sessionKeyHash = '';
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS receipts (player TEXT, id TEXT, PRIMARY KEY(player,id))');
    sql.exec('CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, count INTEGER, until INTEGER)');
    sql.exec('CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, data TEXT)');
    sql.exec('INSERT OR IGNORE INTO world(id,data) VALUES(1,?)', JSON.stringify(initialWorld()));
    ctx.blockConcurrencyWhile(async () => {
      this.sessionKeyHash = await sha256(env.SESSION_SECRET ?? '');
      if (await ctx.storage.getAlarm() === null) await ctx.storage.setAlarm(Date.now() + 86400_000);
    });
  }

  private world(): World {
    return JSON.parse(this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM world WHERE id=1').one().data);
  }
  private online(): PlayerId[] {
    return [...new Set(this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN)
      .map(ws => (ws.deserializeAttachment() as Attachment).player))];
  }
  private send(ws: WebSocket, event: ServerEvent): void {
    try { ws.send(JSON.stringify(event)); } catch { /* close callback updates presence */ }
  }
  private broadcast(event: ServerEvent): void {
    for (const ws of this.ctx.getWebSockets()) if (ws.readyState === WebSocket.OPEN) this.send(ws, event);
  }
  private state(ack?: string): void {
    this.broadcast({ v: 1, type: 'state', state: this.world(), online: this.online(), ...(ack ? { ack } : {}) });
  }
  private error(ws: WebSocket, code: string, id?: string): void {
    this.send(ws, { v: 1, type: 'error', code, ...(id ? { requestId: id } : {}) });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/internal/login') return this.login(request);
    if (path === '/internal/backup') {
      const snapshot = new URL(request.url).searchParams.get('snapshot');
      if (snapshot) {
        if (!/^\d{1,12}$/.test(snapshot)) return json({ error: 'INVALID_SNAPSHOT' }, 400);
        const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM backups WHERE id=?', Number(snapshot)).toArray()[0];
        return row ? json(JSON.parse(row.data)) : json({ error: 'NOT_FOUND' }, 404);
      }
      const payload = this.exportData();
      return json(payload);
    }
    if (path === '/internal/snapshot') return json({ id: this.snapshot() });
    if (path === '/internal/snapshots') return json({ snapshots: this.ctx.storage.sql.exec(
      'SELECT id,at,length(data) AS bytes FROM backups ORDER BY id DESC').toArray() });
    if (path === '/internal/restore') return this.restore(request);
    if (path !== '/internal/ws') return json({ error: 'NOT_FOUND' }, 404);
    const player = request.headers.get('X-Player-Id');
    if (!isPlayer(player)) return json({ error: 'UNAUTHORIZED' }, 401);
    const expires = Number(request.headers.get('X-Session-Expiry'));
    if (!Number.isSafeInteger(expires) || expires <= Date.now()) return json({ error: 'UNAUTHORIZED' }, 401);
    // One active connection per identity. Reconnecting replaces the older tab/device.
    for (const socket of this.ctx.getWebSockets(player)) socket.close(4001, 'Replaced by another connection');
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server, [player]);
    server.serializeAttachment({ player, expires,
      sessionKeyHash: this.sessionKeyHash,
      credentialHash: player === 'one' ? this.env.PLAYER_ONE_HASH : this.env.PLAYER_TWO_HASH,
      since: Date.now(), count: 0,
      lastMove: Date.now() - 100, lastHug: 0 } satisfies Attachment);
    this.state();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async login(request: Request): Promise<Response> {
    if (Number(request.headers.get('Content-Length') ?? '0') > 1024) return json({ error: 'TOO_LARGE' }, 413);
    const raw = await boundedText(request, 1024);
    if (raw === null) return json({ error: 'TOO_LARGE' }, 413);
    let body: { player?: unknown; code?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: 'BAD_JSON' }, 400); }
    if (!body || !isPlayer(body.player) || typeof body.code !== 'string' || body.code.length > 128) {
      return json({ error: 'INVALID_LOGIN' }, 400);
    }
    const now = Date.now();
    const key = request.headers.get('X-Client-Key') ?? 'local';
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM login_limits WHERE until < ?', now);
    const previous = sql.exec<{ count: number; until: number }>(
      'SELECT count,until FROM login_limits WHERE key=?', key).toArray()[0];
    if (previous && previous.count >= 10) return json({ error: 'RATE_LIMIT' }, 429);
    sql.exec('INSERT INTO login_limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      key, now + 60_000);
    if (!await authenticateCode(this.env, body.player, body.code)) return json({ error: 'INVALID_LOGIN' }, 401);
    const session = await createSession(this.env, body.player);
    return Response.json({ player: body.player }, { headers: {
      'Set-Cookie': `${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
      'Cache-Control': 'no-store',
    } });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || message.length > 4096) { this.error(ws, 'BAD_MESSAGE'); return; }
    const a = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now >= a.expires || a.sessionKeyHash !== this.sessionKeyHash ||
      a.credentialHash !== (a.player === 'one' ? this.env.PLAYER_ONE_HASH : this.env.PLAYER_TWO_HASH)) {
      ws.close(4003, 'Session expired or revoked'); return;
    }
    if (now - a.since >= 1000) { a.since = now; a.count = 0; }
    a.count++;
    ws.serializeAttachment(a);
    let c: Command;
    try { c = JSON.parse(message); } catch { this.error(ws, 'BAD_JSON'); return; }
    if (!c || c.v !== 1 || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(c.id)) {
      this.error(ws, 'BAD_COMMAND'); return;
    }
    if (a.count > 30) { this.error(ws, 'RATE_LIMIT', c.id); return; }
    const durable = ['place', 'remove', 'note'].includes(c.type);
    const sql = this.ctx.storage.sql;
    if (durable && sql.exec('SELECT id FROM receipts WHERE player=? AND id=?', a.player, c.id).toArray().length) {
      this.send(ws, { v: 1, type: 'state', state: this.world(), online: this.online(), ack: c.id });
      return;
    }
    const s = this.world();
    const requestId = c.id;
    switch (c.type) {
      case 'ping': this.send(ws, { v: 1, type: 'pong', ack: c.id }); return;
      case 'move': {
        if (!validPoint({ x: c.x, y: c.y })) { this.error(ws, 'OUT_OF_BOUNDS', c.id); return; }
        const p = s.players[a.player];
        const dx = c.x - p.x, dy = c.y - p.y;
        const distance = Math.hypot(dx, dy);
        // Authority includes speed; a forged client cannot teleport across the room.
        const budget = Math.min(0.25, Math.max(0, (now - a.lastMove) / 1000)) * 150;
        const ratio = distance === 0 ? 0 : Math.min(1, budget / distance);
        s.players[a.player] = { x: Math.round((p.x + dx * ratio) * 100) / 100,
          y: Math.round((p.y + dy * ratio) * 100) / 100 };
        a.lastMove = now;
        ws.serializeAttachment(a);
        break;
      }
      case 'hug': {
        const p = s.players.one, q = s.players.two;
        if (this.online().length !== 2) { this.error(ws, 'PARTNER_OFFLINE', c.id); return; }
        if (Math.hypot(p.x - q.x, p.y - q.y) > 65) { this.error(ws, 'TOO_FAR', c.id); return; }
        if (now - a.lastHug < 2000) { this.error(ws, 'HUG_COOLDOWN', c.id); return; }
        a.lastHug = now; ws.serializeAttachment(a);
        this.broadcast({ v: 1, type: 'hug', at: now, by: a.player, ack: c.id });
        return;
      }
      case 'place': {
        if (!validPoint({ x: c.x, y: c.y }) || !['plant', 'stool', 'table'].includes(c.kind)) {
          this.error(ws, 'INVALID_FURNITURE', c.id); return;
        }
        if (c.furnitureId !== undefined && typeof c.furnitureId !== 'string') {
          this.error(ws, 'INVALID_FURNITURE', c.id); return;
        }
        const existing = c.furnitureId ? s.furniture.find(f => f.id === c.furnitureId) : undefined;
        if (c.furnitureId && !existing) { this.error(ws, 'NOT_FOUND', c.id); return; }
        if (!existing && s.furniture.length >= 24) { this.error(ws, 'FURNITURE_LIMIT', c.id); return; }
        const target = { x: Math.round(c.x), y: Math.round(c.y) };
        if (s.furniture.some(f => f.id !== existing?.id && Math.hypot(f.x - target.x, f.y - target.y) < 28)) {
          this.error(ws, 'OCCUPIED', c.id); return;
        }
        if (existing) Object.assign(existing, target, { kind: c.kind });
        else s.furniture.push({ id: crypto.randomUUID(), kind: c.kind, ...target });
        break;
      }
      case 'remove': {
        if (typeof c.furnitureId !== 'string' || !s.furniture.some(f => f.id === c.furnitureId)) {
          this.error(ws, 'NOT_FOUND', c.id); return;
        }
        s.furniture = s.furniture.filter(f => f.id !== c.furnitureId);
        break;
      }
      case 'note': {
        if (typeof c.text !== 'string' || !c.text.trim() || c.text.length > 240) {
          this.error(ws, 'INVALID_NOTE', c.id); return;
        }
        s.notes.push({ id: crypto.randomUUID(), author: a.player, text: c.text.trim(), at: now });
        s.notes = s.notes.slice(-100);
        break;
      }
      default: this.error(ws, 'BAD_COMMAND', requestId); return;
    }
    s.revision++;
    this.ctx.storage.transactionSync(() => {
      sql.exec('UPDATE world SET data=? WHERE id=1', JSON.stringify(s));
      if (durable) sql.exec('INSERT INTO receipts(player,id) VALUES(?,?)', a.player, c.id);
    });
    if (c.type === 'move') this.broadcast({ v: 1, type: 'moved', revision: s.revision,
      player: a.player, position: s.players[a.player], ack: c.id });
    else this.state(c.id);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // 1005/1006/1015 are receive-only codes and cannot be echoed in a close frame.
    try { ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason); } catch { /* already closed */ }
    this.state();
  }
  webSocketError(ws: WebSocket): void {
    try { ws.close(1011, 'Connection error'); } catch { /* already closed */ }
    this.state();
  }
  private exportData(): { format: 1; exportedAt: number; world: World; receipts: Receipt[] } {
    return { format: 1, exportedAt: Date.now(), world: this.world(),
      receipts: this.ctx.storage.sql.exec<Receipt>('SELECT player,id FROM receipts').toArray() };
  }
  private snapshot(): number {
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT INTO backups(at,data) VALUES(?,?)', Date.now(), JSON.stringify(this.exportData()));
    sql.exec('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 14)');
    return sql.exec<{ id: number }>('SELECT id FROM backups ORDER BY id DESC LIMIT 1').one().id;
  }
  async alarm(): Promise<void> {
    this.snapshot();
    await this.ctx.storage.setAlarm(Date.now() + 86400_000);
  }
  private async restore(request: Request): Promise<Response> {
    // Require both clients offline to avoid overwriting changes in flight.
    if (this.online().length) return json({ error: 'PLAYERS_ONLINE' }, 409);
    const text = await boundedText(request, 4_000_000);
    if (text === null) return json({ error: 'TOO_LARGE' }, 413);
    let data: { format?: unknown; world?: unknown; receipts?: unknown };
    try { data = JSON.parse(text); } catch { return json({ error: 'BAD_JSON' }, 400); }
    if (!data || data.format !== 1 || !validWorld(data.world) || !Array.isArray(data.receipts) ||
      data.receipts.length > 50000 || !data.receipts.every((r: Receipt) => r && isPlayer(r.player) &&
        typeof r.id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(r.id))) {
      return json({ error: 'INVALID_BACKUP' }, 400);
    }
    // Async body reading may have yielded to a newly connected player. Check again before committing.
    if (this.online().length) return json({ error: 'PLAYERS_ONLINE' }, 409);
    const restored = data.world;
    restored.revision = Math.max(this.world().revision, restored.revision) + 1;
    this.ctx.storage.transactionSync(() => {
      this.snapshot();
      const sql = this.ctx.storage.sql;
      sql.exec('UPDATE world SET data=? WHERE id=1', JSON.stringify(restored));
      sql.exec('DELETE FROM receipts');
      for (const r of data.receipts as Receipt[]) sql.exec('INSERT OR IGNORE INTO receipts(player,id) VALUES(?,?)', r.player, r.id);
    });
    return json({ restored: true, revision: restored.revision });
  }
}
