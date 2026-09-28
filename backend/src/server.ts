import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json());
app.use(
  cors({
    origin: env.corsOrigin,
  }),
);
app.use(healthRouter);

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
