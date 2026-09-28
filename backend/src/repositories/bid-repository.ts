import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { Db } from "./auction-repository.js";

const bidInclude = {
  bidder: { select: { id: true, name: true } },
} satisfies Prisma.BidInclude;

export function listBids(auctionId: string) {
  return prisma.bid.findMany({
    where: { auctionId },
    include: bidInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function listBidsByBidder(bidderId: string) {
  return prisma.bid.findMany({
    where: { bidderId },
    include: {
      ...bidInclude,
      auction: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function createBid(
  db: Db,
  input: { auctionId: string; bidderId: string; amount: Prisma.Decimal },
) {
  return db.bid.create({ data: input, include: bidInclude });
}
