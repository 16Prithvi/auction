# Real-time auction and bidding engine

Small auction platform for demonstrating backend engineering: REST, PostgreSQL transactions, concurrent bidding, Socket.IO, Redis, Docker, and deployment.

The UI talks to the API. Bids, winners, and anti-sniping are decided in PostgreSQL. Clients in an auction room receive those results over Socket.IO.

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

| Area                     | Choice                                                  |
| ------------------------ | ------------------------------------------------------- |
| Frontend                 | Next.js, TypeScript, Tailwind CSS, Socket.IO client     |
| Backend                  | Node.js, TypeScript, Express, Socket.IO                 |
| Database                 | PostgreSQL, Prisma 6                                    |
| Cache / realtime fan-out | Redis, ioredis (added in a later phase)                 |
| Containers               | Docker Compose                                          |
| Load tests               | k6 (later)                                              |
| Deploy                   | Vercel (frontend), Railway (backend, PostgreSQL, Redis) |

## How bidding works

English ascending auction. The auction starts at `startingPrice`. A bid is accepted only when the auction is `ACTIVE`, the caller is not the auctioneer, and the amount is at least the current price plus `minimumBidIncrement`. Prices are PostgreSQL decimals. The accepted bid becomes `currentPrice`.

If that bid arrives with `ANTI_SNIPE_WINDOW_SECONDS` or less remaining (default 10), the server adds `ANTI_SNIPE_EXTENSION_SECONDS` (default 10) to `endsAt`. Each later valid bid in the new window extends it again. Set either value to `0` to turn the rule off.

Ending an auction, or reaching `endsAt`, sets the winner to the highest bid. The earlier bid wins a tie. The response tells the caller whether `endsAt` changed. After the database commit, the server emits that result to the auction room.

## Concurrency problem

Two bids can read the same price. If both then write, the auction can keep the lower price or record two winners for one step.

## Concurrency solution

Accepting a bid is one database transaction:

1. `SELECT ... FOR UPDATE` locks the auction row. Other bids and the completion path wait.
2. The lock is the read of record. Status, price, increment, `endsAt`, and owner are checked on that row.
3. If `endsAt` has passed, the same transaction marks the auction `COMPLETED`, stores the winner, and the bid is rejected with `AUCTION_EXPIRED`.
4. Otherwise the bid row is inserted and `currentPrice` is updated. Anti-sniping changes `endsAt` in that same update.
5. Commit releases the lock. The HTTP response is the accepted result, and the server then emits `bid:accepted` to `auction:{id}`.

There is no sleep and no client-side decision. A load test of this path is Phase 8.

## Why WebSockets are used

Polling would lag and add load. Socket.IO pushes accepted bids, status changes, and completion to clients in `auction:{id}`. The client displays server state; it does not decide it.

A connection sends the same bearer token in `auth.token`. The server checks that token before accepting the socket. The client joins with `auction:join`. Socket.IO reconnects on its own. On each connect, including reconnect, the client joins the room again and loads the auction once. It does not poll.

Events, all sent after the database commit:

- `bid:accepted` — bid, current price, next minimum, `endsAt`, and whether anti-sniping extended the auction
- `auction:updated` — start, pause, resume, or cancel
- `auction:completed` — winner and final price when the auction ends

The API also schedules one timer per open auction for `endsAt`. That timer closes the auction and emits `auction:completed`. It is not a one-second poll. Two backend instances do not share rooms yet. The Socket.IO Redis adapter is Phase 6.

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

Open `http://localhost:3000`. Register an account, then use the API through the pages. The live room sends each bid to the server and also applies bids, status changes, and completion pushed to that auction room. Sign in so the socket can authenticate. Use `http://localhost:3000`, not `127.0.0.1`, so the page origin matches `CORS_ORIGIN`.

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
| 1 Light frontend        | Replaced by the API in Phase 4  |
| 2 Backend and database  | Done                            |
| 3 Concurrent bidding    | Done. Load test is Phase 8      |
| 4 Connect frontend      | Done                            |
| 5 WebSockets            | Done. Redis adapter is Phase 6  |
| 6 Redis                 | Not started                     |
| 7 Docker and deployment | Compose file only; not deployed |
| 8 Testing and metrics   | Not started                     |
| 9 Final cleanup         | Not started                     |
