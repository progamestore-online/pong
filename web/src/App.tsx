import { useState, useEffect, useRef } from 'react';
import { GameShell, GameTopbar, GameAuth, GameButton, useRooms } from '@progamestore/games';

const W = 600, H = 400, PADDLE_H = 80, PADDLE_W = 12, BALL_R = 8, PADDLE_SPEED = 6;
const WIN_SCORE = 11;

type ServerMsg =
  | { type: 'welcome'; peerId: string; peers: string[] }
  | { type: 'peer_joined'; peerId: string }
  | { type: 'peer_left'; peerId: string }
  | { type: 'update'; from: string; paddleY?: number; ball?: { x: number; y: number }; scores?: [number, number]; winner?: string };

type ClientMsg = { type: 'update'; paddleY?: number; ball?: { x: number; y: number }; scores?: [number, number]; winner?: string };

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    myPaddle: H / 2 - PADDLE_H / 2,
    opPaddle: H / 2 - PADDLE_H / 2,
    ball: { x: W / 2, y: H / 2 },
    ballV: { x: 4, y: 3 },
    scores: [0, 0] as [number, number],
    isP1: false,
    keysDown: new Set<string>(),
    winner: '',
  });

  const room = useRooms<ServerMsg, ClientMsg>({
    gameId: 'pong',
    roomId,
    onMessage(msg) {
      if (msg.type === 'welcome') {
        setPeers(msg.peers);
        stateRef.current.isP1 = msg.peers.length <= 1;
      }
      if (msg.type === 'peer_joined') setPeers(p => [...p, msg.peerId]);
      if (msg.type === 'peer_left') setPeers(p => p.filter(id => id !== msg.peerId));
      if (msg.type === 'update') {
        const s = stateRef.current;
        if (msg.paddleY !== undefined) s.opPaddle = msg.paddleY;
        if (msg.ball) s.ball = msg.ball;
        if (msg.scores) s.scores = msg.scores;
        if (msg.winner) s.winner = msg.winner;
      }
    },
  });

  useEffect(() => {
    if (!roomId || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const s = stateRef.current;
    let animId = 0;
    let sendTimer = 0;

    const keyDown = (e: KeyboardEvent) => { if (['ArrowUp','ArrowDown','w','s'].includes(e.key)) { e.preventDefault(); s.keysDown.add(e.key); } };
    const keyUp = (e: KeyboardEvent) => s.keysDown.delete(e.key);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    function tick() {
      if (s.keysDown.has('ArrowUp') || s.keysDown.has('w')) s.myPaddle = Math.max(0, s.myPaddle - PADDLE_SPEED);
      if (s.keysDown.has('ArrowDown') || s.keysDown.has('s')) s.myPaddle = Math.min(H - PADDLE_H, s.myPaddle + PADDLE_SPEED);

      if (s.isP1 && !s.winner) {
        s.ball.x += s.ballV.x; s.ball.y += s.ballV.y;
        if (s.ball.y <= BALL_R || s.ball.y >= H - BALL_R) s.ballV.y = -s.ballV.y;
        if (s.ball.x <= PADDLE_W + BALL_R && s.ball.y >= s.myPaddle && s.ball.y <= s.myPaddle + PADDLE_H) { s.ballV.x = Math.abs(s.ballV.x) * 1.05; s.ball.x = PADDLE_W + BALL_R; }
        if (s.ball.x >= W - PADDLE_W - BALL_R && s.ball.y >= s.opPaddle && s.ball.y <= s.opPaddle + PADDLE_H) { s.ballV.x = -Math.abs(s.ballV.x) * 1.05; s.ball.x = W - PADDLE_W - BALL_R; }
        if (s.ball.x < 0) { s.scores[1]++; s.ball = { x: W / 2, y: H / 2 }; s.ballV = { x: 4, y: (Math.random() - 0.5) * 6 }; }
        if (s.ball.x > W) { s.scores[0]++; s.ball = { x: W / 2, y: H / 2 }; s.ballV = { x: -4, y: (Math.random() - 0.5) * 6 }; }
        if (s.scores[0] >= WIN_SCORE) s.winner = 'P1';
        if (s.scores[1] >= WIN_SCORE) s.winner = 'P2';
      }

      sendTimer++;
      if (sendTimer >= 3) {
        sendTimer = 0;
        const msg: ClientMsg = { type: 'update', paddleY: s.myPaddle };
        if (s.isP1) { msg.ball = s.ball; msg.scores = s.scores; if (s.winner) msg.winner = s.winner; }
        room.send(msg);
      }

      const p1Y = s.isP1 ? s.myPaddle : s.opPaddle;
      const p2Y = s.isP1 ? s.opPaddle : s.myPaddle;
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      ctx.setLineDash([8, 8]); ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#9333ea'; ctx.fillRect(0, p1Y, PADDLE_W, PADDLE_H); ctx.fillRect(W - PADDLE_W, p2Y, PADDLE_W, PADDLE_H);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555'; ctx.font = '48px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(s.scores[0]), W / 2 - 60, 60); ctx.fillText(String(s.scores[1]), W / 2 + 60, 60);
      if (s.winner) {
        ctx.fillStyle = '#9333ea'; ctx.font = 'bold 36px system-ui';
        ctx.fillText((s.winner === 'P1' && s.isP1) || (s.winner === 'P2' && !s.isP1) ? 'You Win!' : 'You Lose', W / 2, H / 2);
      }
      animId = requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, [roomId, room]);

  if (!roomId) {
    return (
      <GameShell topbar={<GameTopbar title="Pong" />}>
        <GameAuth />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Pong</h1>
          <p style={{ color: 'var(--muted)' }}>Real-time 2-player pong on ProGameStore</p>
          <GameButton variant="primary" size="lg" onClick={async () => { const id = await room.create(); setRoomId(id); }}>Create Room</GameButton>
          <JoinForm onJoin={setRoomId} />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Arrow keys or W/S to move paddle</p>
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell topbar={<GameTopbar title="Pong" stats={[{ label: 'Players', value: peers.length }]} />}>
      <GameAuth />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem' }}>
        {peers.length < 2 && <p style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>Share room code: <strong>{roomId}</strong></p>}
        <canvas ref={canvasRef} width={W} height={H} style={{ border: '2px solid var(--border)', borderRadius: '0.5rem', maxWidth: '100%' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Arrow keys or W/S to move</p>
      </div>
    </GameShell>
  );
}

function JoinForm({ onJoin }: { onJoin: (id: string) => void }) {
  const [joinId, setJoinId] = useState('');
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Room code"
        style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
      <GameButton variant="secondary" onClick={() => joinId && onJoin(joinId)}>Join</GameButton>
    </div>
  );
}
