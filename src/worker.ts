import { DurableObject } from 'cloudflare:workers';

const ID_RE = /^[a-z0-9]{6,12}$/;

function randomId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

interface Peer {
  ws: WebSocket;
  id: string;
}

export class RoomDO extends DurableObject {
  peers: Peer[] = [];
  nextPeerId = 1;

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = pair;
    server.accept();

    const peerId = `p${this.nextPeerId++}`;
    this.peers.push({ ws: server, id: peerId });

    this.send(server, {
      type: 'welcome',
      peerId,
      peers: this.peers.map((p) => p.id),
    });

    this.broadcast({ type: 'peer_joined', peerId }, server);

    server.addEventListener('message', (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      this.broadcast({ ...msg, from: peerId }, server);
    });

    server.addEventListener('close', () => this.removePeer(server));
    server.addEventListener('error', () => this.removePeer(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  removePeer(ws: WebSocket): void {
    const peer = this.peers.find((p) => p.ws === ws);
    this.peers = this.peers.filter((p) => p.ws !== ws);
    if (peer) {
      this.broadcast({ type: 'peer_left', peerId: peer.id });
    }
  }

  send(ws: WebSocket, msg: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch { /* closed */ }
  }

  broadcast(msg: Record<string, unknown>, except?: WebSocket): void {
    for (const p of this.peers) {
      if (p.ws !== except) this.send(p.ws, msg);
    }
  }
}

// Multiplayer API only. Static SPA is served from R2 by the host worker.

interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    if (url.pathname === '/api/rooms/new') {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      return Response.json({ roomId: randomId() }, { headers: corsHeaders });
    }

    const wsMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/ws$/);
    if (wsMatch) {
      const id = wsMatch[1];
      if (!ID_RE.test(id)) return new Response('Invalid room id', { status: 400 });
      const doId = env.ROOM.idFromName(id);
      const obj = env.ROOM.get(doId);
      return obj.fetch(req);
    }

    return new Response('Not found', { status: 404 });
  },
};
