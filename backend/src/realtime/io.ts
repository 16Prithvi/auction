import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";

let io: Server | null = null;

export function attachIo(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin },
  });
  return io;
}

export function getIo() {
  return io;
}
