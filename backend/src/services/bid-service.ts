import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  claimCurrentPrice,
  findAuction,
} from "../repositories/auction-repository.js";
import {
  createBid,
  listBids,
  listBidsByBidder,
} from "../repositories/bid-repository.js";
import { decimal } from "../utils/money.js";
import { expireIfNeeded } from "./auction-service.js";

export async function bidsForAuction(auctionId: string) {
  const settled = await expireIfNeeded(auctionId);
  return listBids(settled.auction.id);
}

export function bidsForUser(userId: string) {
  return listBidsByBidder(userId);
}

const PRICE_CHANGED =
  "The current price changed. Check the latest price and try again.";

async function placeBidOnce(
  auctionId: string,
  bidderId: string,
  amountRaw: string,
) {
  const amount = decimal(amountRaw);
  const settled = await expireIfNeeded(auctionId);
  if (settled.expired) {
    throw new AppError("AUCTION_EXPIRED", "This auction has ended.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const auction = await findAuction(tx, auctionId);
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
    if (auction.endsAt <= new Date()) {
      throw new AppError("AUCTION_EXPIRED", "This auction has ended.", 409);
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

    const claimed = await claimCurrentPrice(
      tx,
      auction.id,
      auction.currentPrice,
      amount,
    );
    if (claimed.count !== 1) {
      throw new AppError("BID_TOO_LOW", PRICE_CHANGED, 409);
    }

    return createBid(tx, { auctionId: auction.id, bidderId, amount });
  });
}

export async function placeBid(
  auctionId: string,
  bidderId: string,
  amountRaw: string,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await placeBidOnce(auctionId, bidderId, amountRaw);
    } catch (error) {
      lastError = error;
      const raced =
        error instanceof AppError &&
        error.code === "BID_TOO_LOW" &&
        error.message === PRICE_CHANGED;
      if (!raced) {
        throw error;
      }
    }
  }
  throw lastError;
}
