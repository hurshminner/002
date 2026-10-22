import { _decorator, Color, Component, Graphics, Layers, Node, Prefab, UITransform,
  instantiate, warn } from 'cc';
import { CharacterView, type Facing } from './CharacterView';
import { compareFootDepth, motionFacing } from './CharacterPresentation';
import { type Furniture, type FurnitureKind, type PlayerId, type Point, type World } from './shared/protocol';

const { ccclass } = _decorator;
const color = (hex: string) => new Color().fromHEX(hex);
export interface WorldArt {
  room: Prefab | null;
  characters: Record<PlayerId, Prefab | null>;
  furniture: Record<FurnitureKind, Prefab | null>;
}
export interface WorldPresentation {
  state: World | null;
  positions: Record<PlayerId, Point>;
  online: PlayerId[];
  localPlayer: PlayerId | null;
  selected?: string;
  hugLeft: number;
}

@ccclass('WorldView')
export class WorldView extends Component {
  private entities!: Node;
  private effect!: Graphics;
  private selection!: Graphics;
  private art!: WorldArt;
  private characters = new Map<PlayerId, CharacterView>();
  private furniture = new Map<string, { node: Node; fallback: Graphics | null; kind: FurnitureKind }>();
  private previous = new Map<PlayerId, Point>();
  private facing: Record<PlayerId, Facing> = { one: 'down', two: 'down' };

  configure(art: WorldArt): void {
    this.art = art;
    const background = this.makeNode('RoomArt', this.node);
    if (art.room) this.attach(art.room, background);
    else this.drawRoom(background.addComponent(Graphics));
    this.selection = this.makeNode('FurnitureSelection', this.node).addComponent(Graphics);
    this.entities = this.makeNode('WorldEntities', this.node);
    for (const player of ['one', 'two'] as const) {
      const node = this.makeNode(`Character_${player}`, this.entities);
      const prefab = art.characters[player];
      let view: CharacterView | null = null;
      if (prefab) {
        const visual = this.attach(prefab, node);
        view = visual.getComponent(CharacterView);
        if (!view) {
          warn(`Character ${player}: prefab root needs CharacterView; using prototype placeholder.`);
          visual.destroy();
        }
      }
      // CharacterView controls this child at local (0,0); the wrapper owns the world position/depth.
      if (!view) view = this.makeNode('Placeholder', node).addComponent(CharacterView);
      view.initialize(); this.characters.set(player, view);
    }
    this.effect = this.makeNode('HugEffect', this.node).addComponent(Graphics);
  }

  render(p: WorldPresentation): void {
    for (const player of ['one', 'two'] as const) {
      const position = p.positions[player], previous = this.previous.get(player) ?? position;
      const dx = position.x - previous.x, dy = position.y - previous.y;
      const motion = motionFacing(this.facing[player], dx, dy);
      this.facing[player] = motion.facing;
      const view = this.characters.get(player)!;
      view.node.parent!.setPosition(position.x, position.y);
      view.present({ player, position: { x: 0, y: 0 }, moving: motion.moving, hugging: p.hugLeft > 0,
        online: p.online.includes(player), isSelf: p.localPlayer === player, facing: this.facing[player] });
      this.previous.set(player, { ...position });
    }
    const active = new Set<string>();
    for (const f of p.state?.furniture ?? []) {
      active.add(f.id);
      let entry = this.furniture.get(f.id);
      if (entry && entry.kind !== f.kind) {
        entry.node.destroy(); this.furniture.delete(f.id); entry = undefined;
      }
      if (!entry) {
        const node = this.makeNode(`Furniture_${f.id}`, this.entities);
        const prefab = this.art.furniture[f.kind];
        const fallback = prefab ? null : node.addComponent(Graphics);
        if (prefab) this.attach(prefab, node);
        entry = { node, fallback, kind: f.kind }; this.furniture.set(f.id, entry);
      }
      entry.node.setPosition(f.x, f.y);
      if (entry.fallback) this.drawFurniture(entry.fallback, f);
    }
    for (const [id, entry] of this.furniture) if (!active.has(id)) {
      entry.node.destroy(); this.furniture.delete(id);
    }
    this.entities.children.slice().sort((a, b) => compareFootDepth(
      { y: a.position.y, name: a.name }, { y: b.position.y, name: b.name }))
      .forEach((node, i) => node.setSiblingIndex(i));
    this.selection.clear();
    const selected = p.state?.furniture.find(f => f.id === p.selected);
    if (selected) {
      this.selection.fillColor = color('#fff2bd');
      this.selection.circle(selected.x, selected.y, 25); this.selection.fill();
    }
    const g = this.effect; g.clear();
    if (p.hugLeft > 0) {
      const x = (p.positions.one.x + p.positions.two.x) / 2;
      const y = (p.positions.one.y + p.positions.two.y) / 2 + 76 + (2 - p.hugLeft) * 12;
      g.fillColor = color('#d68aa5'); g.circle(x - 6, y, 8); g.circle(x + 6, y, 8); g.fill();
      g.moveTo(x - 13, y - 2); g.lineTo(x + 13, y - 2); g.lineTo(x, y - 19); g.close(); g.fill();
    }
  }

  private makeNode(name: string, parent: Node): Node {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D;
    parent.addChild(node); node.addComponent(UITransform); return node;
  }
  private attach(prefab: Prefab, parent: Node): Node {
    const node = instantiate(prefab); parent.addChild(node); node.setPosition(0, 0);
    const layer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(layer); };
    layer(node); return node;
  }
  private drawRoom(g: Graphics): void {
    const rect = (x: number, y: number, w: number, h: number, r: number, hex: string) => {
      g.fillColor = color(hex); g.roundRect(x, y, w, h, r); g.fill();
    };
    rect(-175, -235, 350, 430, 32, '#dbc4b8'); rect(-167, -225, 334, 354, 23, '#f0ddbf');
    rect(-167, 129, 334, 58, 15, '#e8d7db'); rect(-55, 132, 110, 48, 12, '#fff5e3');
    rect(-46, 138, 92, 33, 8, '#b6d9db'); rect(-92, -123, 184, 125, 36, '#e8c4bd');
  }
  private drawFurniture(g: Graphics, f: Furniture): void {
    g.clear();
    const rect = (x: number, y: number, w: number, h: number, r: number, hex: string) => {
      g.fillColor = color(hex); g.roundRect(x, y, w, h, r); g.fill();
    };
    const circle = (x: number, y: number, r: number, hex: string) => {
      g.fillColor = color(hex); g.circle(x, y, r); g.fill();
    };
    if (f.kind === 'plant') {
      rect(-11, -10, 22, 20, 5, '#ca947f'); circle(0, 15, 14, '#91b49a'); circle(-10, 8, 9, '#a7c3a0');
    } else if (f.kind === 'stool') {
      rect(-10, -14, 5, 18, 2, '#bd947e'); rect(5, -14, 5, 18, 2, '#bd947e'); rect(-16, 0, 32, 14, 7, '#bfa9c6');
    } else {
      rect(-19, -15, 6, 22, 2, '#bd947e'); rect(13, -15, 6, 22, 2, '#bd947e'); rect(-26, 0, 52, 22, 9, '#d4ac89');
    }
  }
}
