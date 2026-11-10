export interface RealtimeConfig {
  url: string;
  key: string;
  topic: string;
}

/**
 * Nhận ping "có thay đổi" từ Supabase Realtime (giao thức Phoenix qua WebSocket), tự nối lại khi rớt.
 * Payload rỗng; dữ liệu thật vẫn lấy qua API có xác thực.
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private ref = 0;
  private closed = false;
  /** true khi đã join kênh xong: caller có thể giảm tần suất poll dự phòng. */
  connected = false;

  constructor(
    private readonly config: RealtimeConfig,
    private readonly onChange: () => void,
    private readonly onStatus: (connected: boolean) => void = () => undefined,
  ) {
    this.open();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.socket?.close();
  }

  private open(): void {
    const { url, key, topic } = this.config;
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
    this.socket = socket;
    const send = (t: string, event: string, payload: object = {}) =>
      socket.send(JSON.stringify({ topic: t, event, payload, ref: String(++this.ref), join_ref: '1' }));

    socket.onopen = () => {
      send(`realtime:${topic}`, 'phx_join', {
        config: { broadcast: { self: false, ack: false }, presence: { enabled: false }, postgres_changes: [], private: false },
      });
      this.heartbeat = setInterval(() => send('phoenix', 'heartbeat'), 25_000);
    };
    socket.onmessage = (message) => {
      let data: { event?: string; payload?: { status?: string } };
      try {
        data = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (data.event === 'phx_reply' && data.payload?.status === 'ok') {
        this.attempts = 0;
        this.setConnected(true);
      } else if (data.event === 'broadcast') {
        this.onChange();
      }
    };
    socket.onclose = () => {
      clearInterval(this.heartbeat);
      this.setConnected(false);
      if (!this.closed) {
        // Lùi dần tối đa 30s.
        this.retry = setTimeout(() => this.open(), Math.min(30_000, 1000 * 2 ** this.attempts++));
      }
    };
    socket.onerror = () => socket.close();
  }

  private setConnected(value: boolean): void {
    if (this.connected !== value) {
      this.connected = value;
      this.onStatus(value);
    }
  }
}
