import type { AuctionStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import * as auctionService from "../services/auction-service.js";
import * as bidService from "../services/bid-service.js";
import { money } from "../utils/money.js";
import { serializeAuction, serializeBid } from "../utils/serialize.js";
import type {
  createAuctionSchema,
  placeBidSchema,
} from "../validation/auction.js";

const statuses = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

function actor(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  return req.user;
}

function auctionId(req: Request) {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) {
    throw new AppError("AUCTION_NOT_FOUND", "Auction not found.", 404);
  }
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  const parsed = z.enum(statuses).optional().safeParse(req.query.status);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Unknown auction status.", 400);
  }
  const { auctions, cache } = await auctionService.list(
    parsed.data as AuctionStatus | undefined,
  );
  res.set("X-Cache", cache);
  res.status(200).json({
    success: true,
    data: auctions,
  });
}

export async function mine(req: Request, res: Response) {
  const auctions = await auctionService.listMine(actor(req));
  res.status(200).json({
    success: true,
    data: auctions.map((auction) => serializeAuction(auction)),
  });
}

export async function getOne(req: Request, res: Response) {
  const { auction, cache } = await auctionService.getById(auctionId(req));
  res.set("X-Cache", cache);
  res.status(200).json({
    success: true,
    data: auction,
  });
}

export async function create(req: Request, res: Response) {
  const auction = await auctionService.create(
    actor(req),
    req.body as z.infer<typeof createAuctionSchema>,
  );
  res.status(201).json({ success: true, data: serializeAuction(auction) });
}

export async function update(req: Request, res: Response) {
  const auction = await auctionService.update(
    actor(req),
    auctionId(req),
    req.body as z.infer<typeof createAuctionSchema>,
  );
  res.status(200).json({ success: true, data: serializeAuction(auction) });
}

async function transition(
  req: Request,
  res: Response,
  action: (
    user: NonNullable<Request["user"]>,
    id: string,
  ) => Promise<Awaited<ReturnType<typeof auctionService.start>>>,
) {
  const auction = await action(actor(req), auctionId(req));
  res.status(200).json({ success: true, data: serializeAuction(auction) });
}

export function start(req: Request, res: Response) {
  return transition(req, res, auctionService.start);
}

export function pause(req: Request, res: Response) {
  return transition(req, res, auctionService.pause);
}

export function resume(req: Request, res: Response) {
  return transition(req, res, auctionService.resume);
}

export function end(req: Request, res: Response) {
  return transition(req, res, auctionService.end);
}

export function cancel(req: Request, res: Response) {
  return transition(req, res, auctionService.cancel);
}

export async function bids(req: Request, res: Response) {
  const { bids: rows, cache } = await bidService.bidsForAuction(auctionId(req));
  res.set("X-Cache", cache);
  res.status(200).json({ success: true, data: rows });
}

export async function myBids(req: Request, res: Response) {
  const rows = await bidService.bidsForUser(actor(req).id);
  res.status(200).json({
    success: true,
    data: rows.map((bid) => ({
      ...serializeBid(bid),
      auction: bid.auction,
    })),
  });
}

export async function placeBid(req: Request, res: Response) {
  const body = req.body as z.infer<typeof placeBidSchema>;
  const accepted = await bidService.placeBid(
    auctionId(req),
    actor(req).id,
    body.amount,
  );
  res.status(201).json({
    success: true,
    data: {
      bid: serializeBid(accepted.bid),
      currentPrice: money(accepted.currentPrice),
      minimumNextBid: money(
        accepted.currentPrice.plus(accepted.minimumBidIncrement),
      ),
      endsAt: accepted.endsAt.toISOString(),
      extended: accepted.extended,
    },
  });
}
