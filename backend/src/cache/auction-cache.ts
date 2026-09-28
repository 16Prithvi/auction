import { redis, waitUntilReady } from "../lib/redis.js";

const AUCTION_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

/** Safety net if a delete is missed. Writes still drop these keys after commit. */
export const AUCTION_CACHE_TTL_SECONDS = 60;
export const LIST_CACHE_TTL_SECONDS = 30;

export function auctionDetailKey(auctionId: string) {
  return `cache:auction:${auctionId}`;
}

export function auctionBidsKey(auctionId: string) {
  return `cache:auction:${auctionId}:bids`;
}

export function auctionListKey(status?: string) {
  return status ? `cache:auctions:status:${status}` : "cache:auctions:all";
}

export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const cached = await readCache<T>(key);
  if (cached !== undefined) {
    return { value: cached, hit: true };
  }
  const value = await load();
  await writeCache(key, ttlSeconds, value);
  return { value, hit: false };
}

export async function invalidateAuctionCache(auctionId: string) {
  await dropKeys([
    auctionDetailKey(auctionId),
    auctionBidsKey(auctionId),
    auctionListKey(),
    ...AUCTION_STATUSES.map((status) => auctionListKey(status)),
  ]);
}

export async function clearReadCache() {
  if (!redis || !(await waitUntilReady())) {
    return;
  }
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        "cache:*",
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "error",
        msg: "redis cache clear failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
}

async function readCache<T>(key: string): Promise<T | undefined> {
  if (!redis) {
    return undefined;
  }
  try {
    const raw = await redis.get(key);
    if (raw === null) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "error",
        msg: "redis cache read failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return undefined;
  }
}

async function writeCache(key: string, ttlSeconds: number, value: unknown) {
  if (!redis) {
    return;
  }
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "error",
        msg: "redis cache write failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
}

async function dropKeys(keys: string[]) {
  if (!redis) {
    return;
  }
  try {
    await redis.del(...keys);
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "error",
        msg: "redis cache delete failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
}
