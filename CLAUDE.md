# pong

A multiplayer game on ProGameStore.

- Subdomain: `pong.progamestore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Deploy: `wrangler deploy` (Workers, not Pages -- needed for Durable Objects)

For platform conventions, read
https://progamestore.online/skills.md
before writing or changing anything.

## Architecture

This is a **real-time multiplayer** game with a WebSocket relay:

- `src/worker.ts` -- Cloudflare Worker + Durable Object (`RoomDO`)
- `web/` -- React SPA using `@progamestore/games` SDK
- `wrangler.jsonc` -- Worker config with DO bindings

The DO relays messages between connected peers in real time. Each peer
gets a unique ID on connect. Messages are broadcast to all other peers.
Add server-side validation in the DO if your game needs it.

## Key files

- `src/worker.ts` -- Worker routes + RoomDO class.
- `web/src/App.tsx` -- React entry point with GameShell + useRooms.
- `wrangler.jsonc` -- Worker + DO config.
