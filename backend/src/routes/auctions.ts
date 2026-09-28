import { Router } from "express";
import * as auctionController from "../controllers/auction-controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createAuctionSchema,
  placeBidSchema,
  updateAuctionSchema,
} from "../validation/auction.js";

export const auctionsRouter = Router();

const manage = [requireAuth, requireRole("AUCTIONEER", "ADMIN")] as const;

auctionsRouter.get("/", auctionController.list);
auctionsRouter.post(
  "/",
  ...manage,
  validateBody(createAuctionSchema),
  auctionController.create,
);
auctionsRouter.get("/:id", auctionController.getOne);
auctionsRouter.patch(
  "/:id",
  ...manage,
  validateBody(updateAuctionSchema),
  auctionController.update,
);
auctionsRouter.post("/:id/start", ...manage, auctionController.start);
auctionsRouter.post("/:id/pause", ...manage, auctionController.pause);
auctionsRouter.post("/:id/resume", ...manage, auctionController.resume);
auctionsRouter.post("/:id/end", ...manage, auctionController.end);
auctionsRouter.post("/:id/cancel", ...manage, auctionController.cancel);
auctionsRouter.get("/:id/bids", auctionController.bids);
auctionsRouter.post(
  "/:id/bids",
  requireAuth,
  validateBody(placeBidSchema),
  auctionController.placeBid,
);
