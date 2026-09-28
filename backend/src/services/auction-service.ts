import type { AuctionStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import {
  AUCTION_CACHE_TTL_SECONDS,
  LIST_CACHE_TTL_SECONDS,
  auctionDetailKey,
  auctionListKey,
  cacheAside,
  invalidateAuctionCache,
} from "../cache/auction-cache.js";
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
  lockAuction,
  markCompleted,
  updateAuction,
  type Db,
} from "../repositories/auction-repository.js";
import { listBids } from "../repositories/bid-repository.js";
import {
  publishAuctionCompleted,
  publishAuctionUpdated,
} from "../realtime/publish.js";
import {
  clearAuctionClose,
  scheduleAuctionClose,
} from "../realtime/schedule.js";
import { decimal } from "../utils/money.js";
import { serializeAuction } from "../utils/serialize.js";
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

export async function completeInTransaction(
  db: Db,
  id: string,
  mode: "manual" | "expired",
) {
  const auction = await lockAuction(db, id);
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
  if (mode === "expired" && auction.endsAt > new Date()) {
    return auction;
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

function rememberClose(auction: {
  id: string;
  status: AuctionStatus;
  endsAt: Date;
}) {
  if (auction.status === "ACTIVE" || auction.status === "PAUSED") {
    scheduleAuctionClose(auction.id, auction.endsAt);
    return;
  }
  clearAuctionClose(auction.id);
}

export async function settleExpiredAuctions() {
  const due = await findExpiredAuctionIds(new Date());
  for (const auction of due) {
    const completed = await prisma.$transaction((tx) =>
      completeInTransaction(tx, auction.id, "expired"),
    );
    if (completed.status === "COMPLETED") {
      clearAuctionClose(completed.id);
      publishAuctionCompleted(completed);
      await invalidateAuctionCache(completed.id);
    }
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
  const auction = await createAuction({
    ...priceInput(input),
    createdById: actor.id,
  });
  await invalidateAuctionCache(auction.id);
  return auction;
}

export async function list(status?: AuctionStatus) {
  const { value, hit } = await cacheAside(
    auctionListKey(status),
    LIST_CACHE_TTL_SECONDS,
    async () => {
      await settleExpiredAuctions();
      const rows = await listAuctions(status);
      return rows.map((auction) => serializeAuction(auction));
    },
  );
  return { auctions: value, cache: hit ? ("HIT" as const) : ("MISS" as const) };
}

export async function listMine(actor: Actor) {
  await settleExpiredAuctions();
  return listAuctionsByCreator(actor.id);
}

export async function getById(id: string) {
  const { value, hit } = await cacheAside(
    auctionDetailKey(id),
    AUCTION_CACHE_TTL_SECONDS,
    async () => {
      await settleExpiredAuctions();
      const auction = await findAuction(prisma, id);
      if (!auction) {
        throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
      }
      const bids = await listBids(id);
      return serializeAuction(auction, bids);
    },
  );
  return { auction: value, cache: hit ? ("HIT" as const) : ("MISS" as const) };
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
  const updated = await updateAuction(id, priceInput(input));
  await invalidateAuctionCache(updated.id);
  return updated;
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
  const started = await updateAuction(id, {
    status: "ACTIVE",
    startedAt: auction.startedAt ?? new Date(),
  });
  rememberClose(started);
  publishAuctionUpdated(started);
  await invalidateAuctionCache(started.id);
  return started;
}

export async function pause(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["ACTIVE"]);
  const paused = await updateAuction(id, { status: "PAUSED" });
  rememberClose(paused);
  publishAuctionUpdated(paused);
  await invalidateAuctionCache(paused.id);
  return paused;
}

export async function resume(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  assertTransition(auction.status, ["PAUSED"]);
  if (auction.endsAt <= new Date()) {
    const completed = await prisma.$transaction((tx) =>
      completeInTransaction(tx, id, "expired"),
    );
    if (completed.status === "COMPLETED") {
      clearAuctionClose(completed.id);
      publishAuctionCompleted(completed);
      await invalidateAuctionCache(completed.id);
      throw new AppError("AUCTION_EXPIRED", "This auction has ended.", 409);
    }
  }
  const resumed = await updateAuction(id, { status: "ACTIVE" });
  rememberClose(resumed);
  publishAuctionUpdated(resumed);
  await invalidateAuctionCache(resumed.id);
  return resumed;
}

export async function end(actor: Actor, id: string) {
  const auction = await findAuction(prisma, id);
  if (!auction) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  assertOwner(auction, actor);
  const completed = await prisma.$transaction((tx) =>
    completeInTransaction(tx, id, "manual"),
  );
  if (completed.status === "COMPLETED") {
    clearAuctionClose(completed.id);
    publishAuctionCompleted(completed);
    await invalidateAuctionCache(completed.id);
  }
  return completed;
}

export async function cancel(actor: Actor, id: string) {
  const cancelled = await prisma.$transaction(async (tx) => {
    const auction = await lockAuction(tx, id);
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
  clearAuctionClose(cancelled.id);
  publishAuctionUpdated(cancelled);
  await invalidateAuctionCache(cancelled.id);
  return cancelled;
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
    const completed = await prisma.$transaction((tx) =>
      completeInTransaction(tx, id, "expired"),
    );
    if (completed.status === "COMPLETED") {
      clearAuctionClose(completed.id);
      publishAuctionCompleted(completed);
      await invalidateAuctionCache(completed.id);
    }
    return {
      expired: completed.status === "COMPLETED",
      auction: completed,
    };
  }
  return { expired: false as const, auction };
}
