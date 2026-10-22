export const PROTOCOL = 1 as const;
export type PlayerId = 'one' | 'two';
export type FurnitureKind = 'plant' | 'stool' | 'table';
export interface Point { x: number; y: number }
export interface Furniture extends Point { id: string; kind: FurnitureKind }
export interface Note { id: string; author: PlayerId; text: string; at: number }
export interface World {
  schema: 1;
  revision: number;
  players: Record<PlayerId, Point>;
  furniture: Furniture[];
  notes: Note[];
}
export type Command = { v: 1; id: string } & (
  | { type: 'move'; x: number; y: number }
  | { type: 'hug' }
  | { type: 'ping' }
  | { type: 'place'; kind: FurnitureKind; x: number; y: number; furnitureId?: string }
  | { type: 'remove'; furnitureId: string }
  | { type: 'note'; text: string }
);
export type ServerEvent =
  | { v: 1; type: 'state'; state: World; online: PlayerId[]; ack?: string }
  | { v: 1; type: 'moved'; revision: number; player: PlayerId; position: Point; ack: string }
  | { v: 1; type: 'hug'; at: number; by: PlayerId; ack: string }
  | { v: 1; type: 'pong'; ack: string }
  | { v: 1; type: 'error'; code: string; requestId?: string };
export const ROOM = { minX: -150, maxX: 150, minY: -210, maxY: 130 };
export function initialWorld(): World {
  return {
    schema: 1, revision: 0,
    players: { one: { x: -45, y: -80 }, two: { x: 45, y: -80 } },
    furniture: [{ id: 'starter-plant', kind: 'plant', x: -125, y: 90 }], notes: [],
  };
}
export function isPlayer(value: unknown): value is PlayerId {
  return value === 'one' || value === 'two';
}
export function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const p = value as Point;
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= ROOM.minX &&
    p.x <= ROOM.maxX && p.y >= ROOM.minY && p.y <= ROOM.maxY;
}
export function validWorld(value: unknown): value is World {
  if (!value || typeof value !== 'object') return false;
  const s = value as World;
  return s.schema === 1 && Number.isSafeInteger(s.revision) && s.revision >= 0 &&
    s.revision < Number.MAX_SAFE_INTEGER - 1 && !!s.players &&
    Object.keys(s.players).sort().join(',') === 'one,two' &&
    validPoint(s.players.one) && validPoint(s.players.two) &&
    Array.isArray(s.furniture) && s.furniture.length <= 24 && s.furniture.every(f =>
      f && typeof f.id === 'string' && f.id.length <= 100 &&
      ['plant', 'stool', 'table'].includes(f.kind) && validPoint(f)) &&
    new Set(s.furniture.map(f => f.id)).size === s.furniture.length &&
    Array.isArray(s.notes) && s.notes.length <= 100 && s.notes.every(n => n &&
      typeof n.id === 'string' && n.id.length <= 100 && isPlayer(n.author) &&
      typeof n.text === 'string' && n.text.trim().length > 0 && n.text.length <= 240 &&
      Number.isSafeInteger(n.at) && n.at > 0);
}
