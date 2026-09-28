import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server } from "socket.io";
import { env } from "../config/env.js";

function log(level: "info" | "error", msg: string, error?: unknown) {
  console.log(
    JSON.stringify({
      level,
      msg,
      ...(error
        ? { error: error instanceof Error ? error.message : "unknown" }
        : {}),
    }),
  );
}

export async function attachRedisAdapter(io: Server) {
  if (!env.redisUrl) {
    log("info", "socket.io redis adapter skipped");
    return;
  }

  const pub = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectTimeout: 1000,
  });
  const sub = pub.duplicate();
  const onError = (error: Error) => {
    log("error", "socket.io redis adapter error", error);
  };
  pub.on("error", onError);
  sub.on("error", onError);

  try {
    await Promise.race([
      Promise.all([pub.connect(), sub.connect()]),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("timed out")), 1000);
      }),
    ]);
    io.adapter(createAdapter(pub, sub));
    log("info", "socket.io redis adapter enabled");
  } catch (error) {
    pub.disconnect();
    sub.disconnect();
    log(
      "error",
      "socket.io redis adapter disabled; this process will only reach its own sockets",
      error,
    );
  }
}
