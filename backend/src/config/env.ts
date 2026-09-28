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
};

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
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
  };
}

export const env = loadEnv();
