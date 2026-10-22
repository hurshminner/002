import { configured, json, readSession, sha256, equal, type Env } from './auth';
export { Planet } from './planet';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ service: 'our-private-planet', configured: configured(env), protocol: 1 });
    }
    if (!configured(env)) return json({ error: 'SERVER_NOT_CONFIGURED' }, 503);
    const stub = env.PLANET.get(env.PLANET.idFromName(env.PLANET_ID));
    // Administrative requests use a separate 256-bit credential, never a player cookie.
    const adminRoutes: Record<string, { method: string; target: string }> = {
      '/api/admin/backup': { method: 'GET', target: 'backup' },
      '/api/admin/restore': { method: 'POST', target: 'restore' },
      '/api/admin/snapshot': { method: 'POST', target: 'snapshot' },
      '/api/admin/snapshots': { method: 'GET', target: 'snapshots' },
    };
    const route = adminRoutes[url.pathname];
    if (route) {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
      if (token.length > 200 || !equal(await sha256(token), env.ADMIN_TOKEN_HASH)) {
        return json({ error: 'UNAUTHORIZED' }, 401);
      }
      if (request.method !== route.method) return json({ error: 'METHOD' }, 405);
      return stub.fetch(new Request(`https://planet/internal/${route.target}${url.search}`, request));
    }
    // Pages must proxy /api on the same origin: no cross-site cookies or third-party cookie dependency.
    if (['/api/login', '/api/logout', '/api/ws'].includes(url.pathname) &&
        request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({ error: 'ORIGIN' }, 403);
    if (url.pathname === '/api/login' && request.method === 'POST') {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
      headers.set('X-Client-Key', await sha256(ip));
      return stub.fetch(new Request('https://planet/internal/login', {
        method: 'POST', headers, body: request.body,
      }));
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return new Response(null, { status: 204, headers: {
        'Set-Cookie': '__Host-planet=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
        'Cache-Control': 'no-store',
      } });
    }
    const session = await readSession(request, env);
    if (!session) return json({ error: 'UNAUTHORIZED' }, 401);
    const { player } = session;
    if (url.pathname === '/api/me' && request.method === 'GET') return json({ player });
    if (url.pathname === '/api/ws' && request.method === 'GET' &&
        request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const headers = new Headers(request.headers);
      headers.set('X-Player-Id', player);
      headers.set('X-Session-Expiry', String(session.expires));
      return stub.fetch(new Request('https://planet/internal/ws', { headers }));
    }
    return json({ error: 'NOT_FOUND' }, 404);
  },
} satisfies ExportedHandler<Env>;
