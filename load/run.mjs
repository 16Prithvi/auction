import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { api, openAuction, registerUser } from "./http.mjs";

const require = createRequire("/workspace/frontend/package.json");
const { io } = require("socket.io-client");
const execFileAsync = promisify(execFile);

const primary = process.env.API_URL ?? "http://127.0.0.1:4000";
const results = {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function summarize(values) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
  };
}

async function timedGet(path) {
  const started = performance.now();
  const body = await api(path);
  return { ms: performance.now() - started, ...body };
}

function connect(url, token) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { auth: { token }, reconnection: false });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`connect timeout ${url}`));
    }, 4000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function join(socket, auctionId) {
  return new Promise((resolve, reject) => {
    socket.emit("auction:join", auctionId, (ack) => {
      if (ack?.ok) resolve();
      else reject(new Error(`join failed ${JSON.stringify(ack)}`));
    });
  });
}

function waitForEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 5000);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function startApi(port, redisUrl) {
  const child = spawn("node", ["dist/server.js"], {
    cwd: "/workspace/backend",
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: "postgresql://auction:auction@127.0.0.1:5432/auction",
      JWT_SECRET: "test-secret-local",
      CORS_ORIGIN: "http://localhost:3000",
      REDIS_URL: redisUrl,
    },
    stdio: "ignore",
  });
  return child;
}

async function waitHealth(url) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} did not become healthy`);
}

async function priceOf(id) {
  const { stdout } = await execFileAsync("psql", [
    "postgresql://auction:auction@127.0.0.1:5432/auction",
    "-tAc",
    `SELECT "currentPrice"::text || '|' || status || '|' || coalesce((SELECT count(*)::text FROM "Bid" b WHERE b."auctionId" = a.id), '0') || '|' || coalesce((SELECT count(*)::text FROM (SELECT amount FROM "Bid" WHERE "auctionId" = a.id GROUP BY amount HAVING count(*) > 1) d), '0') FROM "Auction" a WHERE a.id = '${id}'`,
  ]);
  const [price, status, bids, duplicateAmounts] = stdout.trim().split("|");
  return {
    price,
    status,
    bids: Number(bids),
    duplicateAmounts: Number(duplicateAmounts),
  };
}

async function smoke() {
  const auctioneer = await registerUser("AUCTIONEER", "Smoke Auctioneer");
  const bidder = await registerUser("BIDDER", "Smoke Bidder");
  const id = await openAuction(auctioneer.data.token, "Smoke auction");
  await execFileAsync("redis-cli", ["del", `cache:auction:${id}`]);
  const miss = await timedGet(`/auctions/${id}`);
  const hit = await timedGet(`/auctions/${id}`);
  assert(miss.cache === "MISS", `smoke first read ${miss.cache}`);
  assert(hit.cache === "HIT", `smoke second read ${hit.cache}`);
  assert(hit.data.currentPrice === "100.00", "smoke price changed before a bid");

  let tooLow = false;
  try {
    await api(`/auctions/${id}/bids`, {
      token: bidder.data.token,
      method: "POST",
      body: { amount: "50.00" },
    });
  } catch (error) {
    tooLow = error.status === 409 && error.body?.error?.code === "BID_TOO_LOW";
  }
  assert(tooLow, "low bid was not rejected");
  const unchanged = await api(`/auctions/${id}`);
  assert(unchanged.data.currentPrice === "100.00", "low bid changed the price");

  const socket = await connect(primary, auctioneer.data.token);
  await join(socket, id);
  const eventPromise = waitForEvent(socket, "bid:accepted");
  const accepted = await api(`/auctions/${id}/bids`, {
    token: bidder.data.token,
    method: "POST",
    body: { amount: "110.00" },
  });
  const event = await eventPromise;
  socket.close();
  assert(event.currentPrice === "110.00", "socket price mismatch");
  assert(accepted.data.bid.bidderName === "Smoke Bidder", "bidder name mismatch");

  const ended = await api(`/auctions/${id}/end`, {
    token: auctioneer.data.token,
    method: "POST",
  });
  assert(ended.data.status === "COMPLETED", "auction did not complete");
  assert(ended.data.winner?.name === "Smoke Bidder", "winner mismatch");
  results.smoke = {
    passed: true,
    cacheMissMs: Number(miss.ms.toFixed(2)),
    cacheHitMs: Number(hit.ms.toFixed(2)),
    acceptedPrice: accepted.data.currentPrice,
    winner: ended.data.winner.name,
  };
}

async function concurrentBids() {
  const auctioneer = await registerUser("AUCTIONEER", "Race Auctioneer");
  const bidder = await registerUser("BIDDER", "Race Bidder");
  const id = await openAuction(auctioneer.data.token, "Race auction");
  const amounts = Array.from({ length: 30 }, (_, index) =>
    (110 + index * 10).toFixed(2),
  );
  const responses = await Promise.all(
    amounts.map(async (amount) => {
      try {
        const body = await api(`/auctions/${id}/bids`, {
          token: bidder.data.token,
          method: "POST",
          body: { amount },
        });
        return { amount, status: body.status };
      } catch (error) {
        return { amount, status: error.status ?? 0, code: error.body?.error?.code };
      }
    }),
  );
  const stored = await priceOf(id);
  const accepted = responses.filter((row) => row.status === 201).map((row) => row.amount);
  const rejected = responses.filter((row) => row.status === 409);
  const other = responses.filter((row) => row.status !== 201 && row.status !== 409);
  const maxAccepted = accepted.sort((a, b) => Number(a) - Number(b)).at(-1);
  assert(other.length === 0, `unexpected bid statuses ${JSON.stringify(other)}`);
  assert(stored.duplicateAmounts === 0, "duplicate bid amounts were stored");
  assert(stored.price.startsWith(maxAccepted), `price ${stored.price} != max accepted ${maxAccepted}`);
  assert(stored.bids === accepted.length, "stored bid count mismatch");
  assert(accepted.includes("400.00"), "the highest bid was not accepted");
  results.concurrentBids = {
    submitted: amounts.length,
    accepted: accepted.length,
    rejectedTooLow: rejected.length,
    other: other.length,
    duplicateAmounts: stored.duplicateAmounts,
    finalPrice: stored.price,
    highestSubmitted: "400.00",
  };
}

async function cacheSamples(id) {
  const misses = [];
  for (let index = 0; index < 20; index += 1) {
    await execFileAsync("redis-cli", ["del", `cache:auction:${id}`]);
    const sample = await timedGet(`/auctions/${id}`);
    assert(sample.cache === "MISS", `forced read was ${sample.cache}`);
    misses.push(sample.ms);
  }
  const hits = [];
  for (let index = 0; index < 20; index += 1) {
    const sample = await timedGet(`/auctions/${id}`);
    assert(sample.cache === "HIT", `warm read was ${sample.cache}`);
    hits.push(sample.ms);
  }
  results.cacheSamples = {
    note: "20 sequential samples each. Miss deletes the detail key first. Percentiles use nearest rank.",
    miss: summarize(misses),
    hit: summarize(hits),
  };
}

function metric(summary, name, field) {
  const entry = summary.metrics[name];
  if (!entry) return undefined;
  if (entry.values && entry.values[field] !== undefined) return entry.values[field];
  return entry[field];
}

async function k6(script, env, summaryPath) {
  await execFileAsync(
    "k6",
    [
      "run",
      "--summary-trend-stats",
      "avg,min,med,p(50),p(90),p(95),p(99),max",
      `--summary-export=${summaryPath}`,
      script,
    ],
    { env: { ...process.env, ...env } },
  );
  return JSON.parse(await readFile(summaryPath, "utf8"));
}

async function k6Reads(id) {
  await execFileAsync("redis-cli", ["del", `cache:auction:${id}`]);
  const warmed = await timedGet(`/auctions/${id}`);
  assert(warmed.cache === "MISS", "k6 warmup was not a miss");
  const summary = await k6(
    "/workspace/load/k6/reads.js",
    { BASE_URL: primary, AUCTION_ID: id },
    "/tmp/k6-reads.json",
  );
  const checks = summary.metrics.checks?.values ?? summary.metrics.checks;
  results.k6CachedReads = {
    vus: 20,
    duration: "20s",
    warmup: "one uncached GET before the run",
    requests: metric(summary, "http_reqs", "count"),
    requestsPerSec: Number(metric(summary, "http_reqs", "rate").toFixed(2)),
    errorRate: metric(summary, "http_req_failed", "value"),
    p50Ms: Number(metric(summary, "http_req_duration", "p(50)").toFixed(2)),
    p95Ms: Number(metric(summary, "http_req_duration", "p(95)").toFixed(2)),
    p99Ms: Number(metric(summary, "http_req_duration", "p(99)").toFixed(2)),
    checksPassed: checks?.passes,
    checksFailed: checks?.fails,
  };
  assert(results.k6CachedReads.checksFailed === 0, "k6 cached reads had failed checks");
}

async function k6Bids() {
  const auctioneer = await registerUser("AUCTIONEER", "K6 Auctioneer");
  const bidder = await registerUser("BIDDER", "K6 Bidder");
  const id = await openAuction(auctioneer.data.token, "k6 bid auction");
  const summary = await k6(
    "/workspace/load/k6/bids.js",
    { BASE_URL: primary, AUCTION_ID: id, TOKEN: bidder.data.token },
    "/tmp/k6-bids.json",
  );
  const stored = await priceOf(id);
  assert(stored.duplicateAmounts === 0, "k6 stored duplicate amounts");
  assert(stored.price.startsWith("500.00"), `k6 final price ${stored.price}`);
  const checks = summary.metrics.checks?.values ?? summary.metrics.checks;
  results.k6ConcurrentBids = {
    vus: 40,
    iterationsPerVu: 1,
    amounts: "110.00 through 500.00",
    requests: metric(summary, "http_reqs", "count"),
    requestsPerSec: Number(metric(summary, "http_reqs", "rate").toFixed(2)),
    unexpectedErrorRate: metric(summary, "http_req_failed", "value"),
    p50Ms: Number(metric(summary, "http_req_duration", "p(50)").toFixed(2)),
    p95Ms: Number(metric(summary, "http_req_duration", "p(95)").toFixed(2)),
    p99Ms: Number(metric(summary, "http_req_duration", "p(99)").toFixed(2)),
    checksPassed: checks?.passes,
    checksFailed: checks?.fails,
    storedBids: stored.bids,
    duplicateAmounts: stored.duplicateAmounts,
    finalPrice: stored.price,
  };
  assert(results.k6ConcurrentBids.checksFailed === 0, "k6 bids had failed checks");
}

async function fanout() {
  const child = startApi(4002, "redis://127.0.0.1:6379");
  try {
    await waitHealth("http://127.0.0.1:4002");
    const auctioneer = await registerUser("AUCTIONEER", "Fanout Auctioneer");
    const bidder = await registerUser("BIDDER", "Fanout Bidder");
    const id = await openAuction(auctioneer.data.token, "Fanout auction");
    const started = performance.now();
    const local = await Promise.all(
      Array.from({ length: 10 }, () => connect(primary, auctioneer.data.token)),
    );
    const remote = await Promise.all(
      Array.from({ length: 10 }, () =>
        connect("http://127.0.0.1:4002", auctioneer.data.token),
      ),
    );
    const connectMs = performance.now() - started;
    await Promise.all([...local, ...remote].map((socket) => join(socket, id)));
    const waits = [...local, ...remote].map((socket) =>
      waitForEvent(socket, "bid:accepted"),
    );
    await api(`/auctions/${id}/bids`, {
      token: bidder.data.token,
      method: "POST",
      body: { amount: "110.00" },
    });
    const payloads = await Promise.all(waits);
    for (const socket of [...local, ...remote]) socket.close();
    assert(
      payloads.every((payload) => payload.currentPrice === "110.00"),
      "a socket missed the bid or saw the wrong price",
    );
    results.socketFanout = {
      processes: ["127.0.0.1:4000", "127.0.0.1:4002"],
      connections: local.length + remote.length,
      connectedToSecondProcess: remote.length,
      receivedBid: payloads.length,
      connectAllMs: Number(connectMs.toFixed(2)),
      price: "110.00",
    };
  } finally {
    child.kill();
  }
}

async function redisDown() {
  const child = startApi(4003, "redis://127.0.0.1:6399");
  try {
    await waitHealth("http://127.0.0.1:4003");
    const base = "http://127.0.0.1:4003";
    const auctioneer = await registerUser("AUCTIONEER", "Down Auctioneer", base);
    const bidder = await registerUser("BIDDER", "Down Bidder", base);
    const id = await openAuction(auctioneer.data.token, "Redis down auction", base);
    const socket = await connect(base, auctioneer.data.token);
    await join(socket, id);
    const eventPromise = waitForEvent(socket, "bid:accepted");
    const accepted = await api(`/auctions/${id}/bids`, {
      base,
      token: bidder.data.token,
      method: "POST",
      body: { amount: "110.00" },
    });
    const event = await eventPromise;
    socket.close();
    const stored = await priceOf(id);
    const read = await api(`/auctions/${id}`, { base });
    assert(accepted.data.currentPrice === "110.00", "bid failed while Redis was down");
    assert(event.currentPrice === "110.00", "local socket missed the bid");
    assert(stored.price.startsWith("110.00"), `database price ${stored.price}`);
    assert(read.cache === "MISS", `dead redis reported ${read.cache}`);
    results.redisDown = {
      redisUrl: "redis://127.0.0.1:6399",
      bidStatus: accepted.status,
      apiPrice: accepted.data.currentPrice,
      databasePrice: stored.price,
      localSocketPrice: event.currentPrice,
      cacheHeader: read.cache,
    };
  } finally {
    child.kill();
  }
}

const children = [];
try {
  await smoke();
  await concurrentBids();
  await k6Bids();
  const auctioneer = await registerUser("AUCTIONEER", "Read Auctioneer");
  const readAuction = await openAuction(auctioneer.data.token, "Read auction");
  await cacheSamples(readAuction);
  await k6Reads(readAuction);
  await fanout();
  await redisDown();
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
}
