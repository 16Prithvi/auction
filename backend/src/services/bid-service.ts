import {
  AUCTION_CACHE_TTL_SECONDS,
  auctionBidsKey,
  cacheAside,
  invalidateAuctionCache,
} from "../cache/auction-cache.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { lockAuction } from "../repositories/auction-repository.js";
import {
  createBid,
  listBids,
  listBidsByBidder,
} from "../repositories/bid-repository.js";
import { publishBidAccepted } from "../realtime/publish.js";
import { scheduleAuctionClose } from "../realtime/schedule.js";
import { decimal } from "../utils/money.js";
import { serializeBid } from "../utils/serialize.js";
import {
  completeInTransaction,
  expireIfNeeded,
  announceCompletion,
} from "./auction-service.js";

export async function bidsForAuction(auctionId: string) {
  const { value, hit } = await cacheAside(
    auctionBidsKey(auctionId),
    AUCTION_CACHE_TTL_SECONDS,
    async () => {
      const settled = await expireIfNeeded(auctionId);
      const rows = await listBids(settled.auction.id);
      return rows.map((bid) => serializeBid(bid));
    },
  );
  return { bids: value, cache: hit ? ("HIT" as const) : ("MISS" as const) };
}

export function bidsForUser(userId: string) {
  return listBidsByBidder(userId);
}

export async function placeBid(
  auctionId: string,
  bidderId: string,
  amountRaw: string,
) {
  const amount = decimal(amountRaw);
  const result = await prisma.$transaction(async (tx) => {
    const auction = await lockAuction(tx, auctionId);
    if (!auction) {
      throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
    }
    if (auction.createdById === bidderId) {
      throw new AppError(
        "FORBIDDEN",
        "You cannot bid on your own auction.",
        403,
      );
    }

    const now = new Date();
    if (
      (auction.status === "ACTIVE" || auction.status === "PAUSED") &&
      auction.endsAt <= now
    ) {
      const completed = await completeInTransaction(tx, auctionId, "expired");
      if (completed.auction.status === "COMPLETED") {
        return { expired: true as const, completion: completed };
      }
    }

    if (auction.status !== "ACTIVE") {
      throw new AppError(
        "AUCTION_NOT_ACTIVE",
        "Bids are only accepted while the auction is active.",
        409,
      );
    }

    const minimum = auction.currentPrice.plus(auction.minimumBidIncrement);
    if (amount.lt(minimum)) {
      throw new AppError(
        "BID_TOO_LOW",
        "Bid must be at least the next minimum bid.",
        409,
      );
    }

    const remainingMs = auction.endsAt.getTime() - now.getTime();
    const extended =
      env.antiSnipeWindowSeconds > 0 &&
      env.antiSnipeExtensionSeconds > 0 &&
      remainingMs <= env.antiSnipeWindowSeconds * 1000;
    const endsAt = extended
      ? new Date(
          auction.endsAt.getTime() + env.antiSnipeExtensionSeconds * 1000,
        )
      : auction.endsAt;

    const bid = await createBid(tx, { auctionId, bidderId, amount });
    await tx.auction.update({
      where: { id: auctionId },
      data: { currentPrice: amount, endsAt },
    });

    return {
      expired: false as const,
      bid,
      currentPrice: amount,
      minimumBidIncrement: auction.minimumBidIncrement,
      endsAt,
      extended,
    };
  });

  if (result.expired) {
    await announceCompletion(result.completion);
    throw new AppError("AUCTION_EXPIRED", "This auction has ended.", 409);
  }

  scheduleAuctionClose(auctionId, result.endsAt);
  publishBidAccepted({
    auctionId,
    bid: result.bid,
    currentPrice: result.currentPrice,
    minimumBidIncrement: result.minimumBidIncrement,
    endsAt: result.endsAt,
    extended: result.extended,
  });
  await invalidateAuctionCache(auctionId);
  return result;
}
