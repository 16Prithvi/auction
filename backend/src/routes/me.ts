import { Router } from "express";
import * as auctionController from "../controllers/auction-controller.js";
import * as authController from "../controllers/auth-controller.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.use(requireAuth);
meRouter.get("/", authController.me);
meRouter.get("/auctions", auctionController.mine);
meRouter.get("/bids", auctionController.myBids);
