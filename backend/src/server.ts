import { createServer } from "node:http";
import { clearReadCache } from "./cache/auction-cache.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachRedisAdapter } from "./realtime/adapter.js";
import { attachRealtime } from "./realtime/server.js";
import { scheduleOpenAuctions } from "./realtime/schedule.js";

const app = createApp();
const httpServer = createServer(app);
const io = attachRealtime(httpServer);

await attachRedisAdapter(io);

httpServer.listen(env.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "server listening",
      port: env.port,
      nodeEnv: env.nodeEnv,
    }),
  );
  void clearReadCache().finally(() => {
    void scheduleOpenAuctions().catch((error: unknown) => {
      console.log(
        JSON.stringify({
          level: "error",
          msg: "failed to schedule open auctions",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    });
  });
});
