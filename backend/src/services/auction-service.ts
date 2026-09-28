import type { AuctionStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  countBids,
  createAuction,
  findAuction,
  findExpiredAuctionIds,
  highestBid,
  listAuctions,
  listAuctionsByCreator,
  markCompleted,
  updateAuction,
  type Db,
} from "../repositories/auction-repository.js";
import { decimal } from "../utils/money.js";
import type { createAuctionSchema } from "../validation/auction.js";

type AuctionInput = z.infer<typeof createAuctionSchema>;
type Actor = { id: string; role: "BIDDER" | "AUCTIONEER" | "ADMIN" };

function assertOwner(auction: { createdById: string }, actor: Actor) {
  if (actor.role !== "ADMIN" && auction.createdById !== actor.id) {
    throw new AppError(
      "FORBIDDEN",
      "You can only manage your own auctions.",
      403,
    );
  }
}

function assertTransition(status: AuctionStatus, allowed: AuctionStatus[]) {
  if (!allowed.includes(status)) {
    throw new AppError(
      "INVALID_STATE_TRANSITION",
      `Cannot do that while the auction is ${status}.`,
      409,
    );
  }
}

async function completeInTransaction(db: Db, id: string) {
  const auction = await findAuction(db, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  if (auction.status === "COMPLETED") {
    return auction;
  }
  if (auction.status !== "ACTIVE" && auction.status !== "PAUSED") {
    throw new AppError(
      "INVALID_STATE_TRANSITION",
      `Cannot do that while the auction is ${auction.status}.`,
      409,
    );
  }
  const winningBid = await highestBid(db, id);
  const updated = await markCompleted(
    db,
    id,
    auction.status,
    winningBid?.bidderId ?? null,
  );
  if (updated.count !== 1) {
    const current = await findAuction(db, id);
    if (!current) {
      throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
    }
    return current;
  }
  const completed = await findAuction(db, id);
  if (!completed) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  return completed;
}

export async function settleExpiredAuctions() {
  const due = await findExpiredAuctionIds(new Date());
  for (const auction of due) {
    await prisma.$transaction((tx) => completeInTransaction(tx, auction.id));
  }
}

function priceInput(
  input: AuctionInput,
): Pick<
  Prisma.AuctionUncheckedCreateInput,
  | "title"
  | "description"
  | "startingPrice"
  | "currentPrice"
  | "minimumBidIncrement"
  | "scheduledStartAt"
  | "endsAt"
  | "status"
> {
  const startingPrice = decimal(input.startingPrice);
  const minimumBidIncrement = decimal(input.minimumBidIncrement);
  if (startingPrice.lte(0) || minimumBidIncrement.lte(0)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Starting price and increment must be greater than zero.",
      400,
    );
  }
  const scheduledStartAt = new Date(input.scheduledStartAt);
  const endsAt = new Date(input.endsAt);
  return {
    title: input.title,
    description: input.description,
    startingPrice,
    currentPrice: startingPrice,
    minimumBidIncrement,
    scheduledStartAt,
    endsAt,
    status: scheduledStartAt > new Date() ? "SCHEDULED" : "DRAFT",
  };
}

export async function create(actor: Actor, input: AuctionInput) {
  return createAuction({
    ...priceInput(input),
    createdById: actor.id,
  });
}

export async function list(status?: AuctionStatus) {
  await settleExpiredAuctions();
  return listAuctions(status);
}

export async function listMine(actor: Actor) {
  await settleExpiredAuctions();
  return listAuctionsByCreator(actor.id);
}

export async function getById(id: string) {
  await settleExpiredAuctions();
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  return auction;
}

export async function update(actor: Actor, id: string, input: AuctionInput) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["DRAFT", "SCHEDULED"]);
  const bidCount = await countBids(prisma, id);
  if (bidCount > 0) {
    throw new AppError(
      "INVALID_STATE_TRANSITION",
      "Auction details cannot change after a bid.",
      409,
    );
  }
  return updateAuction(id, priceInput(input));
}

export async function start(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["DRAFT", "SCHEDULED"]);
  if (auction.endsAt <= new Date()) {
    throw new AppError(
      "INVALID_STATE_TRANSITION",
      "End time must be in the future before starting.",
      409,
    );
  }
  return updateAuction(id, {
    status: "ACTIVE",
    startedAt: auction.startedAt ?? new Date(),
  });
}

export async function pause(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["ACTIVE"]);
  return updateAuction(id, { status: "PAUSED" });
}

export async function resume(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["PAUSED"]);
  if (auction.endsAt <= new Date()) {
    await prisma.$transaction((tx) => completeInTransaction(tx, id));
    throw new AppError("AUCTION_EXPIRED", "This auction has ended.", 409);
  }
  return updateAuction(id, { status: "ACTIVE" });
}

export async function end(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  return prisma.$transaction((tx) => completeInTransaction(tx, id));
}

export async function cancel(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const auction = await findAuction(tx, id);
    if (!auction) {
      throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
    }
    assertOwner(auction, actor);
    assertTransition(auction.status, ["DRAFT", "SCHEDULED", "PAUSED"]);
    const bidCount = await countBids(tx, id);
    if (bidCount > 0) {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        "End the auction instead of cancelling it after bids exist.",
        409,
      );
    }
    return tx.auction.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        createdBy: { select: { id: true, name: true } },
        winner: { select: { id: true, name: true } },
      },
    });
  });
}

export async function expireIfNeeded(id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  if (
    (auction.status === "ACTIVE" || auction.status === "PAUSED") &&
    auction.endsAt <= new Date()
  ) {
    return {
      expired: true as const,
      auction: await prisma.$transaction((tx) => completeInTransaction(tx, id)),
    };
  }
  return { expired: false as const, auction };
}
