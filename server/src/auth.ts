import { isPlayer, type PlayerId } from '../../client/assets/scripts/shared/protocol';

export interface Env {
  PLANET: DurableObjectNamespace;
  PLANET_ID: string;
  ALLOWED_ORIGIN: string;
  PLAYER_ONE_HASH: string;
  PLAYER_TWO_HASH: string;
  SESSION_SECRET: string;
  ADMIN_TOKEN_HASH: string;
}
export const COOKIE = '__Host-planet';
const encoder = new TextEncoder();
export async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
    .map(x => x.toString(16).padStart(2, '0')).join('');
}
export function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
function playerHash(env: Env, id: PlayerId): string {
  return id === 'one' ? env.PLAYER_ONE_HASH : env.PLAYER_TWO_HASH;
}
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function signature(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}
export function configured(env: Env): boolean {
  return [env.PLAYER_ONE_HASH, env.PLAYER_TWO_HASH, env.ADMIN_TOKEN_HASH, env.SESSION_SECRET]
    .every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)) &&
    env.PLAYER_ONE_HASH !== env.PLAYER_TWO_HASH;
}
export async function authenticateCode(env: Env, id: PlayerId, code: string): Promise<boolean> {
  return equal(await sha256(code), playerHash(env, id));
}
export async function createSession(env: Env, id: PlayerId): Promise<string> {
  const exp = Date.now() + 30 * 86400_000;
  const body = `${id}.${exp}.${crypto.randomUUID()}`;
  return `${body}.${await signature(env, `${body}.${playerHash(env, id)}`)}`;
}
export async function readSession(request: Request, env: Env): Promise<{ player: PlayerId; expires: number } | null> {
  const value = request.headers.get('Cookie')?.split(';').map(x => x.trim())
    .find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value || value.length > 250) return null;
  const parts = value.split('.');
  const [id, exp, nonce, sig] = parts;
  if (parts.length !== 4 || !isPlayer(id) || !exp || !nonce || !sig ||
      !Number.isSafeInteger(Number(exp)) || Number(exp) <= Date.now() ||
      Number(exp) > Date.now() + 30 * 86400_000) return null;
  return equal(sig, await signature(env, `${id}.${exp}.${nonce}.${playerHash(env, id)}`)) ? { player: id, expires: Number(exp) } : null;
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function boundedText(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
