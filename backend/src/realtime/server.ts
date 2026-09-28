import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { findAuction } from "../repositories/auction-repository.js";
import { attachIo } from "./io.js";
import { auctionRoom } from "./publish.js";

const auctionIdSchema = z.string().uuid();

type JoinAck = (result: { ok: boolean; error?: string }) => void;

async function authenticate(token: unknown) {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("UNAUTHORIZED");
  }
  const payload = jwt.verify(token, env.jwtSecret);
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("UNAUTHORIZED");
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true },
  });
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user.id;
}

async function joinAuction(socket: Socket, auctionId: unknown) {
  const parsed = auctionIdSchema.safeParse(auctionId);
  if (!parsed.success) {
    throw new Error("AUCTION_NOT_FOUND");
  }
  const auction = await findAuction(prisma, parsed.data);
  if (!auction) {
    throw new Error("AUCTION_NOT_FOUND");
  }
  const nextRoom = auctionRoom(parsed.data);
  for (const room of socket.rooms) {
    if (room.startsWith("auction:") && room !== nextRoom) {
      await socket.leave(room);
    }
  }
  await socket.join(nextRoom);
}

export function attachRealtime(httpServer: HttpServer) {
  const io = attachIo(httpServer);
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    authenticate(token)
      .then(() => {
        next();
      })
      .catch(() => {
        next(new Error("UNAUTHORIZED"));
      });
  });

  io.on("connection", (socket) => {
    socket.on("auction:join", (auctionId: unknown, ack?: JoinAck) => {
      joinAuction(socket, auctionId)
        .then(() => {
          ack?.({ ok: true });
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "UNAUTHORIZED";
          ack?.({ ok: false, error: message });
        });
    });
  });

  return io;
}
