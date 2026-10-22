import { type Command, type PlayerId, type ServerEvent, type World } from './shared/protocol';

type Action = Command extends infer C ? C extends Command ? Omit<C, 'v' | 'id'> : never : never;
const OUTBOX = 'planet.outbox.v1';
export interface ConnectionRuntime {
  base: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  request: typeof fetch;
  socket: (url: string) => WebSocket;
}
export class PlanetConnection {
  constructor(private runtime: ConnectionRuntime = {
    base: window.location.origin,
    // Storage getters can throw in restricted browser contexts. Access inside the existing guards.
    storage: { getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value) },
    request: (...args) => fetch(...args), socket: url => new WebSocket(url),
  }) {}
  player: PlayerId | null = null;
  state: World | null = null;
  online: PlayerId[] = [];
  connected = false;
  onState: () => void = () => {};
  onStatus: (text: string) => void = () => {};
  onHug: () => void = () => {};
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessage = 0;
  private lastDurableSend = 0;
  private attempts = 0;
  private stopped = false;
  private pending: Command[] = [];
  private sent = new Set<string>();
  private get base(): string {
    // Production uses Pages /api proxy. Editor preview uses the same proxy when configured.
    return this.runtime.base;
  }
  async resume(): Promise<boolean> {
    try {
      const response = await this.runtime.request(`${this.base}/api/me`, { credentials: 'same-origin', cache: 'no-store' });
      if (this.stopped) return false;
      if (response.status === 401) return false;
      if (!response.ok) throw new Error('服务器尚未就绪');
      const body = await response.json() as { player: PlayerId };
      if (this.stopped) return false;
      this.player = body.player;
      this.loadOutbox();
      this.connect();
      return true;
    } catch { this.onStatus('无法连接服务器，请检查网络后重试'); return false; }
  }
  async login(player: PlayerId, code: string): Promise<void> {
    const response = await this.runtime.request(`${this.base}/api/login`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player, code }) });
    if (this.stopped) return;
    if (!response.ok) throw new Error(response.status === 429 ? '尝试太频繁，请一分钟后重试' :
      response.status === 503 ? '服务器尚未配置配对凭证' : '配对凭证无效，或网站来源未配置');
    this.player = player;
    this.loadOutbox();
    this.connect();
  }
  private loadOutbox(): void {
    try {
      const stored = JSON.parse(this.runtime.storage.getItem(OUTBOX) || 'null') as
        { player: PlayerId; pending: Command[] } | null;
      this.pending = stored?.player === this.player && Array.isArray(stored.pending) ? stored.pending.slice(0, 100) : [];
    } catch { this.pending = []; }
    this.sent.clear();
  }
  private persist(): boolean {
    try {
      this.runtime.storage.setItem(OUTBOX, JSON.stringify({ player: this.player, pending: this.pending }));
      return true;
    } catch { this.onStatus('浏览器存储不可用，无法可靠保存待发送操作'); return false; }
  }
  private connect(): void {
    if (this.stopped || !this.player) return;
    this.onStatus('正在连接我们的星球…');
    const url = new URL('/api/ws', this.base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.socket = this.runtime.socket(url.toString());
    this.lastMessage = Date.now();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (this.stopped || ws !== this.socket) return;
      if (Date.now() - this.lastMessage > 30_000) {
        // Mobile networks can silently drop TCP without firing onclose.
        this.socket = null; this.connected = false; ws.close();
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.onStatus('连接无响应，正在重新回家…');
        void this.reconnect();
      } else if (this.connected) this.send({ type: 'ping' });
    }, 10_000);
    this.sent.clear();
    ws.onmessage = event => {
      if (this.stopped || ws !== this.socket) return;
      let data: ServerEvent;
      try { data = JSON.parse(String(event.data)) as ServerEvent; } catch { return; }
      if (data.v !== 1) return;
      this.lastMessage = Date.now();
      if (data.type === 'state') {
        this.connected = true; this.attempts = 0;
        this.state = data.state; this.online = data.online;
        if (data.ack) this.ack(data.ack);
        this.onState();
        this.onStatus(data.online.length === 2 ? '两个人都在家' : '对方暂时离线，家会为你保存');
        this.flush();
      } else if (data.type === 'moved') {
        if (this.state && data.revision > this.state.revision) {
          this.state.players[data.player] = data.position;
          this.state.revision = data.revision;
          this.onState();
        }
      } else if (data.type === 'hug') this.onHug();
      else if (data.type === 'pong') return;
      else {
        if (data.code === 'RATE_LIMIT' && data.requestId) {
          this.sent.delete(data.requestId);
          if (this.flushTimer) clearTimeout(this.flushTimer);
          this.flushTimer = setTimeout(() => this.flush(), 1000);
          this.onStatus('操作较多，正在依次同步');
          return;
        }
        // Rejected operations are surfaced and removed, rather than replayed forever.
        if (data.requestId) this.ack(data.requestId);
        const messages: Record<string, string> = {
          PARTNER_OFFLINE: '等对方回家再拥抱吧', TOO_FAR: '走近一点再抱抱',
          HUG_COOLDOWN: '稍等一下，再抱抱', OCCUPIED: '这里已有家具，请换个位置',
          FURNITURE_LIMIT: '小屋最多放 24 件家具', INVALID_NOTE: '留言需要 1–240 个字',
          RATE_LIMIT: '操作太快，请稍候', OUT_OF_BOUNDS: '请点小屋地板范围内', NOT_FOUND: '家具已被收起',
        };
        this.onStatus(messages[data.code] || `操作未保存：${data.code}`);
        this.flush();
      }
    };
    ws.onclose = event => {
      if (ws !== this.socket || this.stopped) return;
      this.connected = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (event.code === 4001) {
        this.stopped = true;
        this.onStatus('此身份已在另一窗口连接，请关闭另一窗口后刷新');
        return;
      }
      this.onStatus('连接中断，正在重连；留言和家具操作会保留');
      // Check expired/rotated credentials before retrying indefinitely.
      void this.reconnect();
    };
    ws.onerror = () => this.onStatus('网络连接不稳定');
  }
  private async reconnect(): Promise<void> {
    try {
      const response = await this.runtime.request(`${this.base}/api/me`, { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) {
        this.stopped = true;
        this.onStatus('登录已过期或凭证已撤销，请刷新并重新配对');
        return;
      }
    } catch { /* retry after transport failures */ }
    if (this.stopped) return;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 300;
    this.retry = setTimeout(() => this.connect(), delay);
  }
  send(action: Action): boolean {
    if (!this.player || this.stopped) { this.onStatus('请先连接小屋'); return false; }
    const durable = ['place', 'remove', 'note'].includes(action.type);
    if (!durable && !this.connected) { this.onStatus('正在重连，请稍等'); return false; }
    if (durable && this.pending.length >= 100) { this.onStatus('待同步操作过多，请先恢复网络'); return false; }
    const command = { ...action, v: 1, id: crypto.randomUUID() } as Command;
    if (durable) {
      this.pending.push(command);
      if (!this.persist()) { this.pending.pop(); return false; }
      this.flush();
      if (!this.connected) this.onStatus('已在本机排队，联网后才会保存到共同小屋');
    } else if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(command));
    return true;
  }
  private ack(id: string): void {
    if (!this.pending.some(c => c.id === id)) return;
    this.pending = this.pending.filter(c => c.id !== id);
    this.sent.delete(id); this.persist();
  }
  private flush(): void {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;
    // Send one at a time: preserves operation order and stays below server burst limits.
    const command = this.pending[0];
    if (!command || this.sent.has(command.id)) return;
    const delay = 120 - (Date.now() - this.lastDurableSend);
    if (delay > 0) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flush(), delay);
      return;
    }
    this.lastDurableSend = Date.now();
    this.sent.add(command.id);
    this.socket.send(JSON.stringify(command));
  }
  dispose(): void {
    this.stopped = true;
    this.connected = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.socket?.close();
    this.socket = null;
  }
}
