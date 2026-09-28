import type { Prisma } from "@prisma/client";
import type { auctionInclude } from "../repositories/auction-repository.js";
import { money } from "./money.js";

type AuctionWithNames = Prisma.AuctionGetPayload<{
  include: typeof auctionInclude;
}>;

type BidWithBidder = Prisma.BidGetPayload<{
  include: { bidder: { select: { id: true; name: true } } };
}>;

export function serializeBid(bid: BidWithBidder) {
  return {
    id: bid.id,
    auctionId: bid.auctionId,
    bidderId: bid.bidderId,
    bidderName: bid.bidder.name,
    amount: money(bid.amount),
    createdAt: bid.createdAt.toISOString(),
  };
}

export function serializeAuction(
  auction: AuctionWithNames,
  bids?: BidWithBidder[],
) {
  return {
    id: auction.id,
    title: auction.title,
    description: auction.description,
    startingPrice: money(auction.startingPrice),
    currentPrice: money(auction.currentPrice),
    minimumBidIncrement: money(auction.minimumBidIncrement),
    minimumNextBid: money(
      auction.currentPrice.plus(auction.minimumBidIncrement),
    ),
    status: auction.status,
    scheduledStartAt: auction.scheduledStartAt.toISOString(),
    startedAt: auction.startedAt?.toISOString() ?? null,
    endsAt: auction.endsAt.toISOString(),
    createdBy: auction.createdBy,
    winner: auction.winner,
    createdAt: auction.createdAt.toISOString(),
    updatedAt: auction.updatedAt.toISOString(),
    ...(bids ? { bids: bids.map(serializeBid) } : {}),
  };
}
