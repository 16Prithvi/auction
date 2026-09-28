import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "server listening",
      port: env.port,
      nodeEnv: env.nodeEnv,
    }),
  );
});
