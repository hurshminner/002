import { _decorator, Animation, AnimationClip, Color, Component, Graphics, Node,
  Sprite, SpriteFrame, UIOpacity, UITransform, warn } from 'cc';
import { type PlayerId, type Point } from './shared/protocol';
import { selectClipBinding, type CharacterClips, type CharacterPhase, type ClipBinding,
  type Facing } from './CharacterPresentation';
export type { CharacterPhase, Facing } from './CharacterPresentation';

const { ccclass, property } = _decorator;
const color = (hex: string) => new Color().fromHEX(hex);
export interface CharacterPose {
  player: PlayerId;
  position: Point;
  moving: boolean;
  hugging: boolean;
  online: boolean;
  isSelf: boolean;
  facing: Facing;
}

/** Presentation only. Neither this component nor its prefab owns identity, movement or network state. */
@ccclass('CharacterView')
export class CharacterView extends Component {
  @property({ type: Sprite, tooltip: '正式素材的 Sprite；未绑定时保留原占位角色。' })
  body: Sprite | null = null;

  @property({ type: SpriteFrame, tooltip: '默认静止贴图；不改变角色槽位或存档。' })
  idleFrame: SpriteFrame | null = null;

  @property({ type: Animation, tooltip: '可选帧动画播放器，动画只控制美术子节点。' })
  animator: Animation | null = null;

  @property(AnimationClip) idleClip: AnimationClip | null = null;
  @property(AnimationClip) walkClip: AnimationClip | null = null;
  @property(AnimationClip) hugClip: AnimationClip | null = null;
  @property(AnimationClip) idleUpClip: AnimationClip | null = null;
  @property(AnimationClip) idleDownClip: AnimationClip | null = null;
  @property(AnimationClip) idleLeftClip: AnimationClip | null = null;
  @property(AnimationClip) idleRightClip: AnimationClip | null = null;
  @property(AnimationClip) walkUpClip: AnimationClip | null = null;
  @property(AnimationClip) walkDownClip: AnimationClip | null = null;
  @property(AnimationClip) walkLeftClip: AnimationClip | null = null;
  @property(AnimationClip) walkRightClip: AnimationClip | null = null;
  @property({ min: 0, tooltip: '本机角色标记高度，可随正式素材调整；不影响玩法坐标。' })
  markerHeight = 61;

  private placeholder!: Graphics;
  private marker!: Graphics;
  private opacity!: UIOpacity;
  private playing: ClipBinding | null = null;
  private clips!: CharacterClips<AnimationClip>;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.node.getComponent(UITransform)) this.node.addComponent(UITransform).setContentSize(48, 64);
    this.opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    const fallback = new Node('PrototypePlaceholder');
    fallback.layer = this.node.layer; this.node.addChild(fallback);
    fallback.addComponent(UITransform).setContentSize(48, 64);
    this.placeholder = fallback.addComponent(Graphics);
    const marker = new Node('LocalPlayerMarker');
    marker.layer = this.node.layer; this.node.addChild(marker);
    marker.addComponent(UITransform).setContentSize(8, 8);
    this.marker = marker.addComponent(Graphics);
    if (this.body && this.idleFrame) this.body.spriteFrame = this.idleFrame;
    this.clips = {
      idleClip: this.idleClip, walkClip: this.walkClip, hugClip: this.hugClip,
      idleUpClip: this.idleUpClip, idleDownClip: this.idleDownClip,
      idleLeftClip: this.idleLeftClip, idleRightClip: this.idleRightClip,
      walkUpClip: this.walkUpClip, walkDownClip: this.walkDownClip,
      walkLeftClip: this.walkLeftClip, walkRightClip: this.walkRightClip,
    };
    if (this.animator) {
      this.animator.playOnLoad = false;
      for (const [binding, clip] of Object.entries(this.clips)) {
        if (!clip) continue;
        // Different imported clips can have identical .name values. Alias by slot, not by .name.
        this.animator.addClip(clip, binding);
      }
    } else if (Object.values(this.clips).some(Boolean)) {
      warn('CharacterView: clips are assigned without an Animation component.');
    }
    if (this.idleFrame && !this.body) warn('CharacterView: idleFrame needs a bound Sprite component.');
  }

  present(pose: CharacterPose): void {
    this.initialize();
    // The logical origin is the ground/feet pivot. Art size never changes movement or interaction range.
    this.node.setPosition(pose.position.x, pose.position.y);
    this.opacity.opacity = pose.online ? 255 : 150;
    const phase: CharacterPhase = pose.hugging ? 'hug' : pose.moving ? 'walk' : 'idle';
    const binding = selectClipBinding(this.clips, phase, pose.facing);
    const hasArt = !!this.body?.spriteFrame || !!(this.animator && binding);
    this.placeholder.node.active = !hasArt;
    if (!hasArt) this.drawPlaceholder(pose.player, pose.online);
    if (binding !== this.playing) {
      this.animator?.stop(); this.playing = binding;
      if (binding && this.animator) this.animator.play(binding);
      else if (this.body && this.idleFrame) this.body.spriteFrame = this.idleFrame;
    }
    // Direction selects supplied clips only; no mirroring or appearance is generated here.
    const g = this.marker; g.clear();
    if (pose.isSelf) { g.fillColor = color('#c68aa2'); g.circle(0, this.markerHeight, 3); g.fill(); }
  }

  private drawPlaceholder(player: PlayerId, online: boolean): void {
    // Existing prototype drawing, not the official appearance of either person.
    const g = this.placeholder; g.clear();
    const circle = (x: number, y: number, r: number, hex: string) => {
      g.fillColor = color(hex); g.circle(x, y, r); g.fill();
    };
    g.fillColor = color('#cbb69f'); g.ellipse(0, 0, 16, 6); g.fill();
    g.fillColor = color(!online ? '#c1bfbc' : player === 'one' ? '#d6a4b6' : '#99bdc1');
    g.roundRect(-12, 3, 24, 26, 10); g.fill();
    circle(-10, 43, 7, '#f1cfb2'); circle(10, 43, 7, '#f1cfb2');
    circle(0, 35, 16, '#ffe5cd');
    circle(-5, 36, 1.6, '#775f5a'); circle(5, 36, 1.6, '#775f5a');
    circle(-10, 30, 3, '#e9b4ac'); circle(10, 30, 3, '#e9b4ac');
  }
}
