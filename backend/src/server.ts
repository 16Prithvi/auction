import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachRealtime } from "./realtime/server.js";
import { scheduleOpenAuctions } from "./realtime/schedule.js";

const app = createApp();
const httpServer = createServer(app);
attachRealtime(httpServer);

httpServer.listen(env.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "server listening",
      port: env.port,
      nodeEnv: env.nodeEnv,
    }),
  );
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
