import type { Prisma } from "@prisma/client";
import type { auctionInclude } from "../repositories/auction-repository.js";
import { money } from "../utils/money.js";
import { serializeAuction, serializeBid } from "../utils/serialize.js";
import { getIo } from "./io.js";

type AuctionWithNames = Prisma.AuctionGetPayload<{
  include: typeof auctionInclude;
}>;

type BidWithBidder = Prisma.BidGetPayload<{
  include: { bidder: { select: { id: true; name: true } } };
}>;

export function auctionRoom(auctionId: string) {
  return `auction:${auctionId}`;
}

function emit(auctionId: string, event: string, payload: unknown) {
  getIo()?.to(auctionRoom(auctionId)).emit(event, payload);
}

export function publishBidAccepted(input: {
  auctionId: string;
  bid: BidWithBidder;
  currentPrice: Prisma.Decimal;
  minimumBidIncrement: Prisma.Decimal;
  endsAt: Date;
  extended: boolean;
}) {
  emit(input.auctionId, "bid:accepted", {
    auctionId: input.auctionId,
    bid: serializeBid(input.bid),
    currentPrice: money(input.currentPrice),
    minimumNextBid: money(input.currentPrice.plus(input.minimumBidIncrement)),
    endsAt: input.endsAt.toISOString(),
    extended: input.extended,
  });
}

export function publishAuctionUpdated(auction: AuctionWithNames) {
  emit(auction.id, "auction:updated", serializeAuction(auction));
}

export function publishAuctionCompleted(auction: AuctionWithNames) {
  emit(auction.id, "auction:completed", serializeAuction(auction));
}
