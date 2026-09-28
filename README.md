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

Redis caches auction reads. The Socket.IO Redis adapter uses Redis Pub/Sub so a bid accepted on one backend process reaches clients connected to another.

Prisma is pinned to 6. Prisma 7 removes `url` from the schema and requires a driver adapter. Version 6 keeps the usual schema and client, which is enough for this project.

## Tech stack

| Area                     | Choice                                                  |
| ------------------------ | ------------------------------------------------------- |
| Frontend                 | Next.js, TypeScript, Tailwind CSS, Socket.IO client     |
| Backend                  | Node.js, TypeScript, Express, Socket.IO                 |
| Database                 | PostgreSQL, Prisma 6                                    |
| Cache / realtime fan-out | Redis, ioredis, Socket.IO Redis adapter                 |
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

The API also schedules one timer per open auction for `endsAt`. That timer closes the auction and emits `auction:completed`. It is not a one-second poll. Each process may run that timer. Only the process that changes the row emits completion, and the Redis adapter delivers it to every process in the room.

## Why Redis is used

- Cache-aside for auction list, auction detail, and bid history. PostgreSQL remains the source of truth. A miss reads PostgreSQL and stores the JSON. A hit returns that JSON and does not read the auction or bid tables.
- Keys: `cache:auction:{id}` and `cache:auction:{id}:bids` live for 60 seconds. `cache:auctions:all` and `cache:auctions:status:{status}` live for 30 seconds. The TTL is only a backstop.
- After a create, update, bid, or status change commits, those keys are deleted. The next read loads PostgreSQL again. Cached routes send `X-Cache: HIT` or `X-Cache: MISS`.
- If Redis is down, reads use PostgreSQL and writes still commit. A Redis error does not roll back the auction. Socket.IO keeps working for clients connected to that same process, without cross-process fan-out.
- The Socket.IO Redis adapter publishes room events on Redis Pub/Sub. `io.to("auction:{id}").emit(...)` on one process is delivered to sockets joined to that room on every process that shares `REDIS_URL`. Cache deletes are already shared because every process uses the same Redis keys.

## Deployment

The API image is `backend/Dockerfile`. Compose runs PostgreSQL, Redis, and that image. The image applies migrations, then listens on `PORT` (4000 inside Compose). `GET /health` is the health check.

Remote target: frontend on Vercel, backend plus PostgreSQL and Redis on Railway. No live URLs are recorded here yet. This environment has no Vercel or Railway credentials, so those hosts were not created.

Railway, three services from this repo's GitHub connection:

1. PostgreSQL and Redis from the Railway database plugins.
2. Backend service. Set the root directory to `backend` so the Docker build context matches `backend/Dockerfile`. `backend/railway.toml` selects that Dockerfile and checks `/health`.
3. Variables on the backend service: `DATABASE_URL` and `REDIS_URL` from the plugins, a long random `JWT_SECRET`, and `CORS_ORIGIN` set to the Vercel origin (`https://…`, no trailing slash). Railway sets `PORT`. Do not use `change-me-local-only` outside this Compose file.

Vercel project for `frontend`, framework Next.js. Set these before the production build, then redeploy, because Next inlines them:

- `NEXT_PUBLIC_API_URL` = the Railway public API origin
- `NEXT_PUBLIC_SOCKET_URL` = the same origin

The live room and the API must both use that public HTTPS origin. Socket.IO stays on the API port.

If host ports 5432 or 6379 are already taken, Compose can publish different ones:

```bash
POSTGRES_PORT=5433 REDIS_PORT=6380 BACKEND_PORT=4010 docker compose up --build
```

## Performance testing

Measured on 28 September 2026 (UTC) on this machine, not on Railway or Vercel. One API process (`node dist/server.js` on port 4000) unless a row says otherwise. Node.js 22.14.0, PostgreSQL 16.15, Redis 7.0.15, k6 1.4.2. 4 vCPU, 16 GB RAM. The database and Redis were on localhost. Nothing else was driven at the same time except the checks below.

Re-run, with the API already listening on port 4000 and Redis on port 6379:

```bash
node load/run.mjs
```

k6 does not speak Socket.IO. HTTP load is k6. Socket.IO checks use `socket.io-client`.

### Smoke

Register, start an auction at `100.00`, reject a `50.00` bid without changing the price, accept `110.00`, deliver that price on Socket.IO, and end the auction with that bidder as the winner. The first detail read was `X-Cache: MISS` (5.38 ms). The next was `HIT` (1.25 ms).

### Concurrent bids and row locks

Thirty bids from `110.00` through `400.00` were submitted together on one auction.

| Result | Value |
| --- | --- |
| Accepted | 24 |
| `BID_TOO_LOW` | 6 |
| Other HTTP statuses | 0 |
| Duplicate stored amounts | 0 |
| Final `currentPrice` | `400.00` |

Six lower bids lost the race after a higher bid already held the row lock. The stored price is the highest accepted amount, and no amount was stored twice.

k6 then sent 40 bids, one per VU, amounts `110.00` through `500.00`, against a fresh auction (`per-vu-iterations`, 1 iteration each). `201` and `409` were the only expected statuses.

| Metric | Value |
| --- | --- |
| Requests | 40 |
| Requests/sec | 506.21 |
| Unexpected error rate | 0 |
| p50 | 55.07 ms |
| p95 | 74.75 ms |
| p99 | 76.44 ms |
| Stored bids | 1 |
| Duplicate amounts | 0 |
| Final price | `500.00` |

The `500.00` bid took the lock first, so the other 39 were correctly `BID_TOO_LOW`. The requests/sec figure is that short burst (40 requests finished in well under a second), not a long soak.

### Cached reads

Twenty sequential detail reads after deleting `cache:auction:{id}`, then twenty reads left in cache. Percentiles are nearest-rank.

| | p50 | p95 | p99 |
| --- | --- | --- | --- |
| Miss (PostgreSQL, then Redis) | 3.17 ms | 3.86 ms | 4.69 ms |
| Hit (Redis) | 0.78 ms | 0.94 ms | 1.08 ms |

k6 then held 20 virtual users on `GET /auctions/:id` for 20 seconds after one warmup miss. Every response was HTTP 200 and `X-Cache: HIT`.

| Metric | Value |
| --- | --- |
| Requests | 180195 |
| Requests/sec | 9009.08 |
| Error rate | 0 |
| p50 | 2.02 ms |
| p95 | 3.17 ms |
| p99 | 4.57 ms |

The k6 hit latency is higher than the one-at-a-time samples because 20 clients were in flight together.

### Socket.IO fan-out

A second API process listened on port 4002 with the same Redis. Ten Socket.IO clients connected to port 4000 and ten to port 4002 (20/20 connected in 70.23 ms). One bid of `110.00` was posted to port 4000. All 20 clients, including the ten on the other process, received `bid:accepted` with `110.00`.

### Redis unavailable

An API on port 4003 used `REDIS_URL=redis://127.0.0.1:6399` (nothing listening). A bid still returned 201 at `110.00`. PostgreSQL stored `110.00`. A socket on that same process received `110.00`. The following detail read was `X-Cache: MISS`. Cross-process fan-out was not available on that process because the adapter did not connect.

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
node load/run.mjs
```

## Phase status

| Phase                   | Status                                      |
| ----------------------- | ------------------------------------------- |
| 0 Foundation            | Done in this tree                           |
| 1 Light frontend        | Replaced by the API in Phase 4              |
| 2 Backend and database  | Done                                        |
| 3 Concurrent bidding    | Done. Measured in Phase 8                   |
| 4 Connect frontend      | Done                                        |
| 5 WebSockets            | Done                                        |
| 6 Redis                 | Done. Cache-aside and the Socket.IO adapter |
| 7 Docker and deployment | Image runs with Compose Postgres and Redis. Hosts not created |
| 8 Testing and metrics   | Measured on this machine, 28 September 2026 |
| 9 Final cleanup         | Not started                                 |
