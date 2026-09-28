import { Redis } from "ioredis";
import { env } from "../config/env.js";

function createRedis(url: string) {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    commandTimeout: 250,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      return Math.min(times * 200, 2_000);
    },
  });
  client.on("error", (error: Error) => {
    console.log(
      JSON.stringify({
        level: "error",
        msg: "redis error",
        error: error.message,
      }),
    );
  });
  void client.connect().catch(() => {
    // The error handler already logged the failure. Reads fall back to PostgreSQL.
  });
  return client;
}

export function waitUntilReady(timeoutMs = 1000): Promise<boolean> {
  if (!redis || redis.status === "ready") {
    return Promise.resolve(redis?.status === "ready");
  }
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      redis?.off("ready", onReady);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const timer = setTimeout(() => finish(redis.status === "ready"), timeoutMs);
    redis.once("ready", onReady);
  });
}

export const redis = env.redisUrl ? createRedis(env.redisUrl) : null;
