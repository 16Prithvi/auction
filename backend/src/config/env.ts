import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

for (const envPath of [
  path.join(backendRoot, ".env"),
  path.join(backendRoot, "../.env"),
]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export type AppEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string | undefined;
  corsOrigin: string;
  jwtSecret: string;
  antiSnipeWindowSeconds: number;
  antiSnipeExtensionSeconds: number;
};

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function readSeconds(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = source[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 3600) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function readPort(raw: string | undefined): number {
  const port = Number(raw ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw ?? ""}`);
  }
  return port;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    port: readPort(source.PORT),
    databaseUrl: required(source, "DATABASE_URL"),
    redisUrl: source.REDIS_URL,
    corsOrigin: source.CORS_ORIGIN ?? "http://localhost:3000",
    jwtSecret: required(source, "JWT_SECRET"),
    antiSnipeWindowSeconds: readSeconds(
      source,
      "ANTI_SNIPE_WINDOW_SECONDS",
      10,
    ),
    antiSnipeExtensionSeconds: readSeconds(
      source,
      "ANTI_SNIPE_EXTENSION_SECONDS",
      10,
    ),
  };
}

export const env = loadEnv();
