import { Prisma, type AuctionStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type Db = Prisma.TransactionClient | PrismaClient;

const userName = { select: { id: true, name: true } };

export const auctionInclude = {
  createdBy: userName,
  winner: userName,
} satisfies Prisma.AuctionInclude;

export function listAuctions(status?: AuctionStatus) {
  return prisma.auction.findMany({
    where: status ? { status } : undefined,
    include: auctionInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function listAuctionsByCreator(createdById: string) {
  return prisma.auction.findMany({
    where: { createdById },
    include: auctionInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function findAuction(db: Db, id: string) {
  return db.auction.findUnique({ where: { id }, include: auctionInclude });
}

export function findExpiredAuctionIds(now: Date) {
  return prisma.auction.findMany({
    where: {
      status: { in: ["ACTIVE", "PAUSED"] },
      endsAt: { lte: now },
    },
    select: { id: true },
  });
}

export function createAuction(input: Prisma.AuctionUncheckedCreateInput) {
  return prisma.auction.create({ data: input, include: auctionInclude });
}

export function updateAuction(
  id: string,
  data: Prisma.AuctionUncheckedUpdateInput,
) {
  return prisma.auction.update({
    where: { id },
    data,
    include: auctionInclude,
  });
}

export function claimCurrentPrice(
  db: Db,
  id: string,
  expectedPrice: Prisma.Decimal,
  nextPrice: Prisma.Decimal,
) {
  return db.auction.updateMany({
    where: { id, status: "ACTIVE", currentPrice: expectedPrice },
    data: { currentPrice: nextPrice },
  });
}

export function markCompleted(
  db: Db,
  id: string,
  expectedStatus: "ACTIVE" | "PAUSED",
  winnerId: string | null,
) {
  return db.auction.updateMany({
    where: { id, status: expectedStatus },
    data: { status: "COMPLETED", winnerId },
  });
}

export function highestBid(db: Db, auctionId: string) {
  return db.bid.findFirst({
    where: { auctionId },
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
  });
}

export function countBids(db: Db, auctionId: string) {
  return db.bid.count({ where: { auctionId } });
}
