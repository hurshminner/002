import { _decorator, Camera, Canvas, Color, Component, EditBox, EventTouch, Graphics,
  Label, Layers, Node, Prefab, ResolutionPolicy, UITransform, Vec3, director, view } from 'cc';
import { PlanetConnection } from './PlanetConnection';
import { WorldView } from './WorldView';
import { ROOM, type FurnitureKind, type PlayerId, type Point } from './shared/protocol';
const { ccclass, property } = _decorator;
const C = (hex: string) => new Color().fromHEX(hex);
type Mode = FurnitureKind | 'walk' | 'arrange';

@ccclass('PlanetGame')
export class PlanetGame extends Component {
  @property({ type: Prefab, tooltip: '玩家一的可选美术 Prefab；空值继续显示占位角色。人物对应关系待用户确认。' })
  playerOneVisual: Prefab | null = null;
  @property({ type: Prefab, tooltip: '玩家二的可选美术 Prefab；空值继续显示占位角色。' })
  playerTwoVisual: Prefab | null = null;
  @property({ type: Prefab, tooltip: '小屋背景美术；只替换显示，不改变房间坐标。' })
  roomVisual: Prefab | null = null;
  @property(Prefab) plantVisual: Prefab | null = null;
  @property(Prefab) stoolVisual: Prefab | null = null;
  @property(Prefab) tableVisual: Prefab | null = null;
  // Creator may instantiate components while inspecting/deserializing a scene.
  // Browser/network state belongs to the play lifecycle, not the component constructor.
  private net!: PlanetConnection;
  private disposed = false;
  private canvas!: Node;
  private room!: Node;
  private worldView!: WorldView;
  private uiCamera!: Camera;
  private status!: Label;
  private hint!: Label;
  private notes!: Label;
  private loginPanel: Node | null = null;
  private notesPanel: Node | null = null;
  private mode: Mode = 'walk';
  private selected: string | undefined;
  private target: Point | null = null;
  private tick = 0;
  private heart = 0;
  private visual: Record<PlayerId, Point> = { one: { x: -45, y: -80 }, two: { x: 45, y: -80 } };

  start(): void {
    view.setDesignResolutionSize(390, 844, ResolutionPolicy.SHOW_ALL);
    this.canvas = this.nodeOf('Canvas', director.getScene()!, 390, 844, 0, 0);
    const canvas = this.canvas.addComponent(Canvas);
    const cameraNode = this.nodeOf('Camera', this.canvas, 0, 0, 0, 0);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    this.uiCamera = camera;
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 422;
    camera.near = 0.1; camera.far = 2000;
    camera.visibility = Layers.Enum.UI_2D;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = C('#f7f0e8');
    canvas.cameraComponent = camera;
    this.text('余野和禾柚的小世界', this.canvas, 0, 373, 28, '#755664', 370, 40);
    this.text('功能原型 · 两个角色均为占位形象', this.canvas, 0, 306, 11, '#88787b', 370, 22);
    this.status = this.text('准备回家…', this.canvas, 0, 337, 14, '#88787b', 370, 32);
    this.room = this.nodeOf('小屋', this.canvas, 340, 420, 0, 55);
    this.worldView = this.room.addComponent(WorldView);
    this.worldView.configure({ room: this.roomVisual,
      characters: { one: this.playerOneVisual, two: this.playerTwoVisual },
      furniture: { plant: this.plantVisual, stool: this.stoolVisual, table: this.tableVisual } });
    const touch = this.nodeOf('触控地板', this.room, 330, 350, 0, -40);
    touch.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.touch(event), this);
    this.hint = this.text('点地板移动 · 靠近对方抱抱', this.canvas, 0, -196, 14, '#88787b', 370, 30);
    const actions: [string, Mode | 'hug'][] = [['走动', 'walk'], ['抱抱', 'hug'], ['盆栽', 'plant'],
      ['凳子', 'stool'], ['桌子', 'table'], ['整理', 'arrange']];
    actions.forEach(([title, action], i) => this.button(title, this.canvas, -155 + i * 62, -235, 56, 35, () => {
      if (action === 'hug') { this.net.send({ type: 'hug' }); return; }
      this.mode = action; this.selected = undefined; this.target = null;
      this.hint.string = action === 'walk' ? '点地板移动 · 靠近对方抱抱' :
        action === 'arrange' ? '先点家具，再点空地移动；也可收起' : '点空地摆放家具';
    }));
    this.button('收起选中家具', this.canvas, -60, -276, 175, 29, () => {
      if (this.selected) this.net.send({ type: 'remove', furnitureId: this.selected });
      else this.status.string = '请先用“整理”选中一件家具';
      this.selected = undefined;
    });
    this.button('留言簿', this.canvas, 130, -276, 88, 29, () => this.showNotes());
    const input = this.input(this.canvas, -35, -319, 280, 34, '给另一半留句话（最多 240 字）', false);
    input.maxLength = 240;
    this.button('留言', this.canvas, 148, -319, 60, 34, () => {
      if (input.string.trim() && this.net.send({ type: 'note', text: input.string })) input.string = '';
    });
    this.notes = this.text('小屋留言会一直等你回来', this.canvas, 0, -376, 13, '#755664', 360, 68);
    this.net = new PlanetConnection();
    this.net.onStatus = value => { if (!this.disposed) this.status.string = value; };
    this.net.onState = () => { if (!this.disposed) this.sync(); };
    this.net.onHug = () => {
      if (!this.disposed) { this.heart = 2; this.status.string = '抱抱，今天也很想你'; }
    };
    void this.net.resume().then(ok => { if (!this.disposed && !ok) this.showLogin(); });
    this.draw();
  }

  private nodeOf(name: string, parent: Node, w: number, h: number, x: number, y: number): Node {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D;
    parent.addChild(node); node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(w, h);
    return node;
  }
  private text(value: string, parent: Node, x: number, y: number, size: number, color: string,
    w = 340, h = 40): Label {
    const node = this.nodeOf('文字', parent, w, h, x, y);
    const label = node.addComponent(Label);
    label.string = value; label.fontSize = size; label.lineHeight = size + 5;
    label.color = C(color); label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.CLAMP;
    return label;
  }
  private button(value: string, parent: Node, x: number, y: number, w: number, h: number, fn: () => void): void {
    const n = this.nodeOf(value, parent, w, h, x, y);
    const g = n.addComponent(Graphics);
    g.fillColor = C('#ead4cf'); g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
    this.text(value, n, 0, 0, 13, '#674d5e', w, h);
    n.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; fn(); });
  }
  private input(parent: Node, x: number, y: number, w: number, h: number, placeholder: string, secret: boolean): EditBox {
    const n = this.nodeOf('输入', parent, w, h, x, y);
    // EditBox.__preload creates labels and onEnable creates a Sprite on its own node.
    // Configure while inactive; keep Graphics on a child so two UIRenderers cannot overwrite uiComp.
    n.active = false;
    const background = this.nodeOf('输入背景', n, w, h, 0, 0);
    const g = background.addComponent(Graphics);
    const label = this.text('', n, 0, 0, 14, '#674d5e', w - 16, h);
    const hint = this.text(placeholder, n, 0, 0, 12, '#9f9292', w - 16, h);
    for (const text of [label, hint]) {
      text.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
      text.horizontalAlign = Label.HorizontalAlign.LEFT;
    }
    const edit = n.addComponent(EditBox);
    edit.textLabel = label; edit.placeholderLabel = hint; edit.placeholder = placeholder;
    edit.inputMode = EditBox.InputMode.SINGLE_LINE;
    edit.inputFlag = secret ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
    edit.maxLength = 128;
    n.active = true;
    g.fillColor = C('#fffaf3'); g.roundRect(-w / 2, -h / 2, w, h, 8); g.fill();
    return edit;
  }
  private showLogin(): void {
    const panel = this.loginPanel = this.nodeOf('私人配对', this.canvas, 390, 844, 0, 0);
    const g = panel.addComponent(Graphics);
    g.fillColor = C('#f7f0e8'); g.rect(-195, -422, 390, 844); g.fill();
    // Consume touches outside controls while the private pairing panel is visible.
    panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    this.text('欢迎来到小世界', panel, 0, 150, 25, '#755664');
    this.text('使用你自己的私人配对凭证\n不要分享给第三个人', panel, 0, 94, 15, '#88787b', 350, 60);
    const input = this.input(panel, 0, 15, 325, 44, '输入私人配对凭证', true);
    const feedback = this.text('', panel, 0, -120, 13, '#a85b70', 350, 70);
    let busy = false;
    for (const [i, player] of (['one', 'two'] as const).entries()) {
      this.button(i === 0 ? '我是玩家一' : '我是玩家二', panel, i === 0 ? -85 : 85, -55, 145, 42, () => {
        if (busy) return;
        busy = true; feedback.string = '正在配对…';
        void this.net.login(player, input.string.trim()).then(() => {
          if (this.disposed || !panel.isValid) return;
          input.string = ''; panel.destroy(); this.loginPanel = null;
        }).catch((e: Error) => {
          if (!this.disposed && panel.isValid) feedback.string = e.message;
        }).finally(() => { busy = false; });
      });
    }
  }
  private sync(): void {
    const state = this.net.state;
    if (!state) return;
    this.notes.string = state.notes.slice(-3).map(n => `${n.author === this.net.player ? '我' : '你'}：${n.text}`).join('\n') ||
      '还没有留言，给另一半写第一句话吧';
  }
  private showNotes(): void {
    if (this.notesPanel) return;
    this.target = null;
    const notes = this.net.state?.notes || [];
    const panel = this.notesPanel = this.nodeOf('留言簿', this.canvas, 390, 844, 0, 0);
    const g = panel.addComponent(Graphics);
    g.fillColor = C('#f7f0e8'); g.rect(-195, -422, 390, 844); g.fill();
    panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    let index = Math.max(0, notes.length - 1);
    const title = this.text('', panel, 0, 310, 23, '#755664', 360, 50);
    const time = this.text('', panel, 0, 258, 13, '#88787b');
    const body = this.text('', panel, 0, 0, 18, '#755664', 335, 430);
    const render = () => {
      const note = notes[index];
      title.string = note ? `${note.author === this.net.player ? '我' : '你'}的留言 · ${index + 1}/${notes.length}` : '我们的留言簿';
      time.string = note ? new Date(note.at).toLocaleString() : '';
      body.string = note?.text || '写下第一句想对另一半说的话吧。';
    };
    this.button('上一条', panel, -95, -280, 115, 40, () => { index = Math.max(0, index - 1); render(); });
    this.button('下一条', panel, 95, -280, 115, 40, () => { index = Math.min(Math.max(0, notes.length - 1), index + 1); render(); });
    this.button('回到小屋', panel, 0, -347, 180, 42, () => { this.notesPanel = null; panel.destroy(); });
    render();
  }
  private touch(event: EventTouch): void {
    if (this.loginPanel || this.notesPanel || !this.net.state || !this.net.player) return;
    // Same conversion chain as Creator 3.8.8 UITransform.hitTest: screen -> camera world -> local.
    // getUILocation() is not world space for this zero-centered Canvas/camera.
    const p = event.getLocation();
    const world = this.uiCamera.screenToWorld(new Vec3(p.x, p.y, 0), new Vec3());
    const local = this.room.getComponent(UITransform)!.convertToNodeSpaceAR(world);
    const point = { x: Math.max(ROOM.minX, Math.min(ROOM.maxX, local.x)),
      y: Math.max(ROOM.minY, Math.min(ROOM.maxY, local.y)) };
    if (this.mode === 'walk') { this.target = point; return; }
    if (this.mode === 'arrange') {
      const hit = this.net.state.furniture.find(f => Math.hypot(f.x - point.x, f.y - point.y) < 24);
      if (hit) { this.selected = hit.id; this.hint.string = '家具已选中，点空地移动或点“收起”'; return; }
      const selected = this.net.state.furniture.find(f => f.id === this.selected);
      if (selected) this.net.send({ type: 'place', kind: selected.kind, furnitureId: selected.id, ...point });
      this.selected = undefined;
    } else this.net.send({ type: 'place', kind: this.mode, ...point });
  }
  update(dt: number): void {
    if (!this.worldView) return;
    this.heart = Math.max(0, this.heart - dt);
    const state = this.net.state;
    if (state) for (const player of ['one', 'two'] as const) {
      const p = this.visual[player], q = state.players[player];
      const t = Math.min(1, dt * 14);
      p.x += (q.x - p.x) * t; p.y += (q.y - p.y) * t;
    }
    this.tick += dt;
    if (this.target && state && this.net.player && this.net.connected && this.tick >= 0.1) {
      const p = state.players[this.net.player], d = Math.hypot(this.target.x - p.x, this.target.y - p.y);
      if (d < 3) this.target = null;
      else {
        const ratio = Math.min(1, 13 / d);
        this.net.send({ type: 'move', x: p.x + (this.target.x - p.x) * ratio,
          y: p.y + (this.target.y - p.y) * ratio });
      }
    }
    if (this.tick >= 0.1) this.tick = 0;
    this.draw();
  }
  private draw(): void {
    this.worldView.render({ state: this.net.state, positions: this.visual, online: this.net.online,
      localPlayer: this.net.player, selected: this.selected, hugLeft: this.heart });
  }
  onDestroy(): void {
    this.disposed = true;
    this.net?.dispose();
    this.canvas?.destroy();
  }
}
