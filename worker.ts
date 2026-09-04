import app from 'vinext/server/fetch-handler';
import { DurableObject } from 'cloudflare:workers';

type VoiceStyle = 'sharp' | 'balanced' | 'soft';
type Member = {
  id: string;
  nickname: string;
  color: string;
  preset: { characterPitch: 12 | 15 | 18; voiceStyle: VoiceStyle; excited: boolean };
  voiceChannel: number | null;
};
type Env = { SIGNAL_ROOM: DurableObjectNamespace<SignalRoom> };

export class SignalRoom extends DurableObject<Env> {
  async fetch(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const url = new URL(request.url);
    const member = this.readMember(url.searchParams);
    if (!member) return new Response('Invalid profile', { status: 400 });

    const previous = this.ctx.getWebSockets().find((ws) => (ws.deserializeAttachment() as Member | null)?.id === member.id);
    previous?.close(4001, 'Replaced by a newer connection');
    const existing = this.members();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment(member);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: 'hello', members: [...existing, member], chatPeerIds: existing.map(({ id }) => id) }));
    this.broadcast({ type: 'presence', action: 'upsert', member });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 65_536) return;
    const current = ws.deserializeAttachment() as Member | null;
    if (!current) return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return; }

    if (payload.type === 'profile' && typeof payload.nickname === 'string') {
      const nickname = payload.nickname.trim().slice(0, 24);
      if (!nickname) return;
      const member = { ...current, nickname };
      ws.serializeAttachment(member);
      this.broadcast({ type: 'presence', action: 'upsert', member });
      return;
    }
    if (payload.type === 'voice-channel') {
      const channel = payload.channel === null ? null : Number(payload.channel);
      if (channel !== null && ![1, 2, 3, 4].includes(channel)) return;
      const member = { ...current, voiceChannel: channel };
      ws.serializeAttachment(member);
      this.broadcast({ type: 'presence', action: 'upsert', member });
      if (channel !== null) {
        const peerIds = this.members().filter((peer) => peer.id !== member.id && peer.voiceChannel === channel).map(({ id }) => id);
        ws.send(JSON.stringify({ type: 'voice-peers', peerIds }));
      }
      return;
    }
    if (payload.type === 'signal' && (payload.kind === 'chat' || payload.kind === 'voice') && typeof payload.target === 'string' && payload.data && typeof payload.data === 'object') {
      const target = this.ctx.getWebSockets().find((peer) => (peer.deserializeAttachment() as Member | null)?.id === payload.target);
      const targetMember = target?.deserializeAttachment() as Member | null | undefined;
      if (!target || !targetMember) return;
      if (payload.kind === 'voice' && (current.voiceChannel === null || current.voiceChannel !== targetMember.voiceChannel)) return;
      target.send(JSON.stringify({ type: 'signal', kind: payload.kind, from: current.id, data: payload.data }));
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string) {
    const member = ws.deserializeAttachment() as Member | null;
    ws.close(code, reason);
    if (member) this.broadcast({ type: 'presence', action: 'leave', member });
  }

  webSocketError(ws: WebSocket) {
    const member = ws.deserializeAttachment() as Member | null;
    ws.close(1011, 'Connection error');
    if (member) this.broadcast({ type: 'presence', action: 'leave', member });
  }

  private members() {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Member | null).filter((member): member is Member => Boolean(member));
  }

  private broadcast(payload: object) {
    const encoded = JSON.stringify(payload);
    this.ctx.getWebSockets().forEach((ws) => { try { ws.send(encoded); } catch { /* disconnected peer */ } });
  }

  private readMember(params: URLSearchParams): Member | null {
    const id = params.get('id')?.slice(0, 64);
    const nickname = params.get('nickname')?.trim().slice(0, 24);
    const color = params.get('color');
    const characterPitch = Number(params.get('pitch'));
    const voiceStyle = params.get('style');
    if (!id || !nickname || !color?.match(/^#[0-9a-f]{6}$/i) || ![12, 15, 18].includes(characterPitch) || !['sharp', 'balanced', 'soft'].includes(voiceStyle ?? '')) return null;
    return { id, nickname, color, preset: { characterPitch: characterPitch as 12 | 15 | 18, voiceStyle: voiceStyle as VoiceStyle, excited: params.get('excited') === 'true' }, voiceChannel: null };
  }
}

const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/api/realtime') return env.SIGNAL_ROOM.getByName('ink-square').fetch(request);
    return app.fetch(request, env, ctx);
  },
};

export default worker;
