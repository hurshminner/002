/** Pure presentation decisions; no engine objects, player identity or authoritative state. */
export type Facing = 'up' | 'down' | 'left' | 'right';
export type CharacterPhase = 'idle' | 'walk' | 'hug';
export interface CharacterClips<T> {
  idleClip: T | null;
  walkClip: T | null;
  hugClip: T | null;
  idleUpClip?: T | null;
  idleDownClip?: T | null;
  idleLeftClip?: T | null;
  idleRightClip?: T | null;
  walkUpClip?: T | null;
  walkDownClip?: T | null;
  walkLeftClip?: T | null;
  walkRightClip?: T | null;
}
export type ClipBinding = keyof CharacterClips<unknown>;
const directional = {
  up: { idle: 'idleUpClip', walk: 'walkUpClip' },
  down: { idle: 'idleDownClip', walk: 'walkDownClip' },
  left: { idle: 'idleLeftClip', walk: 'walkLeftClip' },
  right: { idle: 'idleRightClip', walk: 'walkRightClip' },
} as const;

export function selectClipBinding<T>(clips: CharacterClips<T>, phase: CharacterPhase, facing: Facing): ClipBinding | null {
  const direction = directional[facing];
  const candidates: ClipBinding[] = phase === 'hug' ? ['hugClip', direction.idle, 'idleClip'] :
    phase === 'walk' ? [direction.walk, 'walkClip', direction.idle, 'idleClip'] : [direction.idle, 'idleClip'];
  return candidates.find(key => clips[key] != null) ?? null;
}

export function motionFacing(previous: Facing, dx: number, dy: number): { moving: boolean; facing: Facing } {
  if (Math.hypot(dx, dy) <= 0.02) return { moving: false, facing: previous };
  return { moving: true, facing: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'down' : 'up') };
}

export function compareFootDepth(a: { y: number; name: string }, b: { y: number; name: string }): number {
  // Back to front. Stable ASCII names break ties without browser locale dependence.
  return b.y - a.y || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
