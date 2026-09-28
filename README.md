# Real-time auction and bidding engine

Small auction platform for demonstrating backend engineering: REST, PostgreSQL transactions, concurrent bidding, Socket.IO, Redis, Docker, and deployment.

This repository is at **Phase 0 (foundation)** only. Auction features are not implemented yet.

## Project overview

Users will register, browse auctions, and bid in a live room. Auctioneers will create and manage auctions. The backend is authoritative for price, status, expiry, bid validity, and the winner.

## Architecture

Modular monolith. One Next.js client, one Express API, PostgreSQL as the source of truth, Redis for cache and cross-instance events, Socket.IO for live updates.

```
frontend (Next.js)
    |
    |  REST + Socket.IO
    v
backend (Express, one or more instances)
    |                |
    v                v
PostgreSQL         Redis
```

Later phases add the schema, bid transactions, WebSocket rooms, Redis cache and Pub/Sub, and the Socket.IO Redis adapter so two backend instances can fan out the same bid.

Prisma is pinned to 6. Prisma 7 removes `url` from the schema and requires a driver adapter. Version 6 keeps the usual schema and client, which is enough for this project.

## Tech stack

| Area                     | Choice                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Frontend                 | Next.js, TypeScript, Tailwind CSS, Socket.IO client (client added in a later phase) |
| Backend                  | Node.js, TypeScript, Express, Socket.IO (added in a later phase)                    |
| Database                 | PostgreSQL, Prisma 6                                                                |
| Cache / realtime fan-out | Redis, ioredis (added in a later phase)                                             |
| Containers               | Docker Compose                                                                      |
| Load tests               | k6 (later)                                                                          |
| Deploy                   | Vercel (frontend), Railway (backend, PostgreSQL, Redis)                             |

## How bidding works

Not implemented. Planned rule: English ascending auction. A bid must beat the current price by at least the minimum increment. The server accepts the bid, stores it, and updates the current price.

## Concurrency problem

Not implemented. Two bids arriving together can both read the same price and both try to win. The design will not use sleeps or client-side checks.

## Concurrency solution

Not implemented. Phase 3 will use a PostgreSQL transaction so the auction row is read and updated atomically, then the accepted bid is broadcast.

## Why WebSockets are used

Polling would lag and add load. Socket.IO will push accepted bids, extensions, and completion to clients in `auction:{id}`. The client displays server state; it does not decide it.

## Why Redis is used

- Cache-aside for auction reads, with invalidation when state changes.
- Pub/Sub so a bid accepted on one backend instance reaches clients connected to another.
- Socket.IO Redis adapter for that multi-instance fan-out.

Redis is not wired up yet. Compose starts a Redis container so later phases can use it.

## Deployment

Not deployed. Target: frontend on Vercel, backend and managed PostgreSQL and Redis on Railway. The API reads `process.env.PORT` and exposes `GET /health`.

## Performance testing

No benchmarks have been run. No resume metrics exist yet. k6 results will be recorded here only after they are measured, with scenario, configuration, result, date, and environment.

## How to run locally

Requirements: Node.js 22+, npm, Docker with Compose.

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local

docker compose up --build
```

API health: `http://localhost:4000/health`

Frontend, without Docker:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Backend, without Docker (Postgres and Redis still come from Compose):

```bash
docker compose up postgres redis
cd backend
npm install
npm run dev
```

Checks:

```bash
cd backend && npm run typecheck && npm run lint && npm run build
cd frontend && npm run lint && npm run build
```

## Phase status

| Phase                   | Status                          |
| ----------------------- | ------------------------------- |
| 0 Foundation            | Done in this tree               |
| 1 Light frontend        | Not started                     |
| 2 Backend and database  | Not started                     |
| 3 Concurrent bidding    | Not started                     |
| 4 Connect frontend      | Not started                     |
| 5 WebSockets            | Not started                     |
| 6 Redis                 | Not started                     |
| 7 Docker and deployment | Compose file only; not deployed |
| 8 Testing and metrics   | Not started                     |
| 9 Final cleanup         | Not started                     |
