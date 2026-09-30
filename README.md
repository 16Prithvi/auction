# Real-Time Auction & Bidding Engine

A real-time English ascending auction platform built to demonstrate **concurrency control, transactional bidding, Redis caching, distributed Socket.IO fan-out, server-authoritative auction lifecycle management, and load testing**.

The core rule is simple:

> **The server decides the price, whether a bid is valid, when an auction ends, and who won. The browser only displays that state.**

Money is stored in PostgreSQL as `DECIMAL` and exposed by the API as a string such as `"110.50"`.

**Live Demo:** https://auction-theta-eight.vercel.app  
**API:** https://auction-production-3d37.up.railway.app/  
**GitHub:** https://github.com/16Prithvi/auction

---

## What the system demonstrates

- Real-time bidding with Socket.IO auction rooms
- Transaction-safe concurrent bidding using PostgreSQL row-level locks
- Server-authoritative auction lifecycle and expiry
- Anti-sniping extensions for last-second bids
- Redis cache-aside for hot auction reads
- Redis Pub/Sub through the Socket.IO Redis adapter for multi-instance fan-out
- JWT authentication with role-based access
- Dockerized local development and Railway deployment
- k6 load testing and Socket.IO multi-client validation

---

## Architecture

The system separates **durable state**, **fast reads**, and **real-time delivery**.

The Next.js browser communicates with the Express API through REST for normal operations. The live auction room also opens a Socket.IO connection. PostgreSQL remains the source of truth for users, auctions, and bids. Redis is used for read caching and, when multiple API processes are running, for Socket.IO Pub/Sub fan-out.

<img width="1093" height="567" alt="image" src="https://github.com/user-attachments/assets/9c85c9a0-12d1-4520-8688-b818070002b0" />

### Main components

| Component | Responsibility |
| --- | --- |
| **Next.js + TypeScript + Tailwind** | Auction listing, details, live room, creation, authentication, dashboard |
| **Express + TypeScript** | REST API, authentication, auction lifecycle, bid processing |
| **Socket.IO** | Live auction rooms and committed state updates |
| **PostgreSQL + Prisma 6** | Durable users, auctions, bids, transactions and row locking |
| **Redis + ioredis** | Cache-aside reads and Socket.IO Redis adapter |
| **Docker Compose** | Local PostgreSQL, Redis and API environment |
| **k6** | HTTP load testing |
| **socket.io-client** | Multi-client Socket.IO and cross-instance validation |
| **Vercel** | Frontend deployment |
| **Railway** | API, PostgreSQL and Redis deployment |

> Prisma is pinned to version 6 because this project uses the Prisma 6 schema configuration with `url`; Prisma 7 changes that configuration and requires a driver adapter.

---

## How a bid travels through the system

A bid follows a deliberately strict path:

1. The browser sends an authenticated `POST /auctions/:id/bids` request.
2. PostgreSQL locks the auction row with `SELECT ... FOR UPDATE`.
3. The server checks the auction state, owner, end time, current price and minimum increment **inside the transaction**.
4. The accepted bid and new `currentPrice` are written atomically.
5. If anti-sniping applies, the new `endsAt` is written in the same transaction.
6. The transaction commits.
7. The affected Redis cache keys are invalidated.
8. The API emits `bid:accepted` to the auction's Socket.IO room.
9. If multiple API processes are running, the Redis adapter publishes the event so every process can update its local sockets.
10. Connected browsers update their UI from the server-authoritative event.

<img width="1165" height="647" alt="image" src="https://github.com/user-attachments/assets/f7cfac84-800e-4be2-a1cd-6cc8f28a148a" />

This design means a client cannot make an outdated price authoritative by racing another client or by relying on a stale browser-side check.

---

## PostgreSQL is the source of truth

Users, auctions and bids live in PostgreSQL.

A bid is accepted only when the locked auction row shows:

- `status = ACTIVE`
- the caller is not the auction owner
- `endsAt` is still in the future
- the bid is at least `currentPrice + minimumBidIncrement`

The accepted amount becomes the new `currentPrice`.

### Auction states

```text
DRAFT → SCHEDULED → ACTIVE → PAUSED → ACTIVE → COMPLETED
  │         │          │                   │
  └─────────┴──────────┴───────────────────┴──→ CANCELLED
```

Creating an auction with a future start time stores `SCHEDULED`. A start time already in the past stores `DRAFT`. Bids are refused until the auction is `ACTIVE`.

Ending an auction, or reaching `endsAt`, sets the winner to the highest bid. If two bids have the same amount, the earlier bid wins.


### Why row-level locking?

Two bidders can read the same price at nearly the same time. Without synchronization, both requests could temporarily believe that they are valid.

The bid transaction therefore does:

```text
BEGIN
  SELECT auction FOR UPDATE
  validate current state
  validate amount
  insert bid
  update current price
  update end time if anti-sniping applies
COMMIT
```

The lock makes the auction row the serialization point for competing bids and for completion.

---

## Redis cache-aside

Auction listing, auction details and bid history are read frequently, while writes are comparatively less frequent.

The project therefore uses Redis as a **cache**, not as the source of truth.

<img width="1097" height="582" alt="image" src="https://github.com/user-attachments/assets/0bf03a6b-7385-4c0a-ab9a-b77aaa063c26" />

### Cache keys

| Key | TTL | Value |
| --- | ---: | --- |
| `cache:auction:{id}` | 60s | Auction detail including bids |
| `cache:auction:{id}:bids` | 60s | Bid history |
| `cache:auctions:all` | 30s | Unfiltered auction list |
| `cache:auctions:status:{status}` | 30s | Auction list for one status |

A cache miss reads PostgreSQL and stores JSON in Redis.

A cache hit returns the cached JSON without reading the auction or bid tables.

These endpoints expose the cache result through `X-Cache`:

```text
GET /auctions
GET /auctions/:id
GET /auctions/:id/bids
```

### Write invalidation

After a create, update, bid or status change commits:

```text
PostgreSQL commit
      ↓
Delete affected Redis keys
      ↓
Next read repopulates the cache
```

The TTL is a backstop rather than the primary freshness mechanism. A bid changes the price immediately, so waiting for a 60-second TTL would be incorrect.

Authenticated `/me` routes are intentionally not cached.

---

## Redis Pub/Sub + Socket.IO

Socket.IO connections belong to the API process that accepted them. If the application runs on multiple API processes, an event emitted by one process must reach clients connected to the others.

The Socket.IO Redis adapter handles this fan-out through Redis Pub/Sub.

<img width="998" height="632" alt="image" src="https://github.com/user-attachments/assets/84377440-7450-4a79-91cb-d78d53b96d2b" />

### Events

Events are emitted **after the database transaction commits**:

| Event | Purpose |
| --- | --- |
| `bid:accepted` | Bid, current price, next minimum, `endsAt`, and anti-sniping extension |
| `auction:updated` | Start, pause, resume or cancel |
| `auction:completed` | Winner and final price |

The client sends its bearer token during the Socket.IO handshake. The server validates it before accepting the socket.

The client joins:

```text
auction:{id}
```

On reconnect, the live room joins the room again and loads the auction once for reconciliation. It does not poll continuously.

### Auction expiry

Each API process schedules its own timer for `endsAt`.

The timer is **not** a one-second polling loop. When an auction reaches its end time, the completion transaction determines whether the row still needs to transition to `COMPLETED`.

Only the transaction that actually changes the row emits `auction:completed`, preventing duplicate completion announcements when multiple processes have timers for the same auction.

If Redis is unavailable, the API can still process bids and deliver events to sockets connected to that process. Cross-process fan-out is unavailable until Redis is available again.

---

## Anti-sniping

The auction implements a configurable soft-close rule.

By default:

```text
ANTI_SNIPE_WINDOW_SECONDS     = 10
ANTI_SNIPE_EXTENSION_SECONDS  = 10
```

If a valid bid arrives with 10 seconds or less remaining:

```text
current endsAt
      +
10 seconds
      ↓
new authoritative endsAt
```

A later valid bid inside the new window can extend it again.

Set either value to `0` to disable the rule.

Both the REST response and `bid:accepted` socket event contain:

- `extended`
- authoritative `endsAt`

The extension happens inside the same transaction as the accepted bid.

---

## Authentication and security

The API uses:

- bcrypt password hashing with cost 12
- HS256 JWT authentication
- 7-day JWT validity
- `BIDDER` and `AUCTIONEER` public registration roles
- `ADMIN` excluded from public self-registration
- bearer-token authentication for REST and Socket.IO
- PostgreSQL user lookup on authenticated HTTP requests
- IP-based rate limiting for login and registration

Login and registration are limited to 30 requests per 15 minutes per IP.

The API trusts one proxy hop so the IP-based limit continues to work behind Railway.

### Error format

```json
{
  "success": false,
  "error": {
    "code": "BID_TOO_LOW",
    "message": "Bid must be at least the next minimum."
  }
}
```

Examples of error codes include:

```text
BID_TOO_LOW
AUCTION_NOT_ACTIVE
AUCTION_EXPIRED
FORBIDDEN
UNAUTHORIZED
VALIDATION_ERROR
```

---

## Why these technologies?

### PostgreSQL

A bid must remain consistent with the current price, auction end time and eventual winner. PostgreSQL transactions and row-level locks provide the required serialization point.

### Redis

Auction pages are read frequently. Cache-aside removes repeated hot reads from PostgreSQL while keeping PostgreSQL authoritative.

### Redis Pub/Sub

Socket.IO clients are attached to individual API processes. Redis Pub/Sub allows a committed event from one process to reach sockets connected to another process.

### Socket.IO

The live room needs bidirectional real-time communication, room membership and reconnect handling without continuous HTTP polling.

### Docker

The application depends on PostgreSQL and Redis locally. Docker Compose makes the infrastructure reproducible.

### k6

k6 provides repeatable HTTP load tests for concurrent bid submission and cached reads. Socket.IO fan-out is validated separately with `socket.io-client` because k6 does not speak Socket.IO.

---

## Performance validation

These are **local measurements**, not production benchmarks.

Test environment:

```text
Date:        28 September 2026 UTC
Node.js:     22.14.0
PostgreSQL:  16.15
Redis:       7.0.15
k6:          1.4.2
CPU:         4 vCPU
Memory:      16 GB
```

<img width="1153" height="561" alt="image" src="https://github.com/user-attachments/assets/1f472493-5c9f-40ba-9f06-a012c7c92b85" />

### Concurrent bidding

Thirty bids from `110.00` through `400.00` were placed concurrently:

| Result | Value |
| --- | ---: |
| Accepted | 24 |
| `BID_TOO_LOW` | 6 |
| Other statuses | 0 |
| Duplicate stored amounts | 0 |
| Final price | `400.00` |

A separate k6 burst used 40 virtual users with one bid each:

| Metric | Value |
| --- | ---: |
| Requests/sec | **506.21** over the burst |
| Unexpected error rate | **0** |
| p50 | **55.07 ms** |
| p95 | **74.75 ms** |
| p99 | **76.44 ms** |
| Final price | **500.00** |

The `500.00` bid took the database lock first in that run, so it was the only stored bid from that particular 40-request contention burst; the remaining requests were correctly rejected as `BID_TOO_LOW`. This is a consequence of the locking model, not a dropped-write condition.

### Cached reads

Twenty sequential cache misses followed by twenty hits produced:

| | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Miss | 3.17 ms | 3.86 ms | 4.69 ms |
| Hit | 0.78 ms | 0.94 ms | 1.08 ms |

A 20-VU k6 test held `GET /auctions/:id` for 20 seconds. Every response was HTTP 200 with `X-Cache: HIT`.

| Metric | Value |
| --- | ---: |
| Requests | **180,195** |
| Requests/sec | **9,009.08** |
| Error rate | **0** |
| p50 | **2.02 ms** |
| p95 | **3.17 ms** |
| p99 | **4.57 ms** |

The `9,009.08 req/s` figure is specifically a cached auction-detail read benchmark, not an overall platform throughput claim.

### Multi-instance fan-out

Two API processes were tested:

```text
10 Socket.IO clients → API process A
10 Socket.IO clients → API process B
```

All 20 clients connected in 70.23 ms, and all 20 received a `110.00` bid that was submitted only through process A.

A Redis-down test also confirmed that:

- the bid still returned HTTP `201`
- PostgreSQL stored the bid
- the local process still delivered the event to its own socket
- the following read became `X-Cache: MISS`
- cross-process fan-out was unavailable without Redis

---

## Deployment

### Production topology

```text
Vercel
└── Next.js frontend

Railway
├── Express API
├── PostgreSQL
└── Redis
```

**Frontend:** https://auction-theta-eight.vercel.app  
**Backend:** https://auction-production-3d37.up.railway.app/

The backend Docker image is defined in `backend/Dockerfile`. On startup it retries `prisma migrate deploy` before listening on `PORT`.

The Railway health endpoint is:

```text
GET /health
```

### Railway environment variables

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
CORS_ORIGIN
NODE_ENV
```

`DATABASE_URL` and `REDIS_URL` come from the Railway PostgreSQL and Redis services.

Use a long random value for `JWT_SECRET`.

`CORS_ORIGIN` must match the exact frontend origin, without a trailing slash.

### Vercel environment variables

```text
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_SOCKET_URL
```

These must point to the Railway backend before the production build because Next.js exposes `NEXT_PUBLIC_*` values to the browser bundle.

---

## Run locally

### Requirements

- Node.js 22+
- npm
- Docker with Compose

### Start the complete stack

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

API health:

```text
http://localhost:4000/health
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

A basic end-to-end flow is:

1. Register an auctioneer.
2. Create an auction.
3. Press **Start**.
4. Register/sign in as a bidder.
5. Open the live room.
6. Place a bid.
7. Open the same auction in another signed-in browser.
8. Observe the accepted bid propagate without refreshing.

### Run PostgreSQL and Redis without the API container

```bash
docker compose up postgres redis
```

Then:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run dev
```

`DATABASE_URL` and `JWT_SECRET` are required. There is no code fallback.

### Change local ports

If `5432`, `6379`, or `4000` are already occupied:

```bash
POSTGRES_PORT=5433 REDIS_PORT=6380 BACKEND_PORT=4010 docker compose up --build
```

---

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Register a bidder or auctioneer |
| `POST` | `/auth/login` | Authenticate |
| `GET` | `/me` | Current user |
| `GET` | `/me/auctions` | Current user's auctions |
| `GET` | `/me/bids` | Current user's bids |
| `GET` | `/auctions` | List auctions |
| `POST` | `/auctions` | Create auction |
| `GET` | `/auctions/:id` | Auction details |
| `POST` | `/auctions/:id/start` | Start auction |
| `POST` | `/auctions/:id/pause` | Pause auction |
| `POST` | `/auctions/:id/resume` | Resume auction |
| `POST` | `/auctions/:id/end` | End auction |
| `POST` | `/auctions/:id/cancel` | Cancel auction |
| `POST` | `/auctions/:id/bids` | Place a bid |

Example bid body:

```json
{
  "amount": "110.50"
}
```

---

## Project structure

```text
auction/
├── frontend/              # Next.js client
├── backend/               # Express API
│   ├── prisma/            # Prisma schema + migrations
│   ├── load/              # k6/load validation scripts
│   ├── Dockerfile
│   └── railway.toml
├── docs/
│   └── images/             # README architecture and performance diagrams
├── docker-compose.yml
└── README.md
```

---

## Validation commands

Backend:

```bash
cd backend
npm run typecheck
npm run lint
npm run build
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Load/validation suite:

```bash
node load/run.mjs
```

---

## Known limitations

- The published performance figures are local validation results, not Railway production benchmarks.
- The live room receives real-time pushes; list/detail views use REST and update from subsequent reads rather than continuously receiving bid events.
- The on-screen countdown is display-only. The server determines whether an auction has actually expired.
- Cache-aside can briefly expose a stale value in a read/write race where a read that started before a write finishes its `SET` after the write's invalidation. TTL bounds that window.
- Authenticated `/me` routes are not cached.
- k6 does not speak Socket.IO; Socket.IO fan-out is tested separately with `socket.io-client`.
- The deployment currently uses one configured CORS origin.
- The project does not include payments, a search engine, or a second database.

---

## Design takeaway

This project is intentionally focused on the **hard part of an auction system** rather than adding a large number of product features.

The important engineering guarantees are:

```text
PostgreSQL
    ↓
transaction + row lock
    ↓
authoritative bid result
    ↓
Redis invalidation
    ↓
Socket.IO event
    ↓
Redis Pub/Sub for multiple processes
    ↓
every connected auction client sees the committed state
```

That makes the project a practical demonstration of **concurrency control, consistency, caching, real-time communication, horizontal scaling mechanics, authentication, deployment, and performance validation** in one focused backend system.
