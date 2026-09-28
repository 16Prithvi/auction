import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { auctionsRouter } from "./routes/auctions.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import "./types/express.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(express.json());
  app.use(
    cors({
      origin: env.corsOrigin,
    }),
  );
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        }),
      );
    });
    next();
  });

  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use("/auctions", auctionsRouter);
  app.use("/me", meRouter);
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });
  app.use(errorHandler);
  return app;
}
