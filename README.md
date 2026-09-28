# Real-time auction and bidding engine

Small auction platform for demonstrating backend engineering: REST, PostgreSQL transactions, concurrent bidding, Socket.IO, Redis, Docker, and deployment.

The UI is at **Phase 1** and still uses mock data. The API is at **Phase 3**: bids, winners, and anti-sniping are decided in PostgreSQL. The frontend is not connected to the API yet.

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

English ascending auction. The auction starts at `startingPrice`. A bid is accepted only when the auction is `ACTIVE`, the caller is not the auctioneer, and the amount is at least the current price plus `minimumBidIncrement`. Prices are PostgreSQL decimals. The accepted bid becomes `currentPrice`.

If that bid arrives with `ANTI_SNIPE_WINDOW_SECONDS` or less remaining (default 10), the server adds `ANTI_SNIPE_EXTENSION_SECONDS` (default 10) to `endsAt`. Each later valid bid in the new window extends it again. Set either value to `0` to turn the rule off.

Ending an auction, or reaching `endsAt`, sets the winner to the highest bid. The earlier bid wins a tie. The response tells the caller whether `endsAt` changed. Live broadcast of that result is a later phase.

## Concurrency problem

Two bids can read the same price. If both then write, the auction can keep the lower price or record two winners for one step.

## Concurrency solution

Accepting a bid is one database transaction:

1. `SELECT ... FOR UPDATE` locks the auction row. Other bids and the completion path wait.
2. The lock is the read of record. Status, price, increment, `endsAt`, and owner are checked on that row.
3. If `endsAt` has passed, the same transaction marks the auction `COMPLETED`, stores the winner, and the bid is rejected with `AUCTION_EXPIRED`.
4. Otherwise the bid row is inserted and `currentPrice` is updated. Anti-sniping changes `endsAt` in that same update.
5. Commit releases the lock. The HTTP response is the accepted result. Nothing is broadcast until a later phase.

There is no sleep and no client-side decision. A load test of this path is Phase 8.

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

Open `http://localhost:3000`. The pages are mock-only. Demo login: `ada@example.com` (bidder) or `ravi@example.com` (auctioneer), password `password123`. Placing a bid does not change the price.

Backend, without Docker (Postgres and Redis still come from Compose):

```bash
docker compose up postgres redis
cd backend
npm install
npx prisma migrate deploy
npm run dev
```

The API reads `DATABASE_URL` and `JWT_SECRET`. Copy `.env.example` to `.env` before starting it.

Useful routes:

- `POST /auth/register` and `POST /auth/login` return a bearer token
- `GET /me`, `GET /me/auctions`, `GET /me/bids`
- `GET /auctions`, `POST /auctions`, `GET /auctions/:id`
- `POST /auctions/:id/start|pause|resume|end|cancel`
- `POST /auctions/:id/bids` with `{ "amount": "110.50" }`. The response includes `extended` and the authoritative `endsAt`.

Money is sent as decimal strings. Errors look like `{ "success": false, "error": { "code": "BID_TOO_LOW", "message": "..." } }`.

Checks:

```bash
cd backend && npm run typecheck && npm run lint && npm run build
cd frontend && npm run lint && npm run build
```

## Phase status

| Phase                   | Status                          |
| ----------------------- | ------------------------------- |
| 0 Foundation            | Done in this tree               |
| 1 Light frontend        | Done. Mock data only            |
| 2 Backend and database  | Done. Frontend still uses mocks |
| 3 Concurrent bidding    | Done. Load test is Phase 8      |
| 4 Connect frontend      | Not started                     |
| 5 WebSockets            | Not started                     |
| 6 Redis                 | Not started                     |
| 7 Docker and deployment | Compose file only; not deployed |
| 8 Testing and metrics   | Not started                     |
| 9 Final cleanup         | Not started                     |
