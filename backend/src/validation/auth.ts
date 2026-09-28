import { z } from "zod";

const password = z.string().min(8).max(72);
const email = z.string().trim().email().max(255).toLowerCase();

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  role: z.enum(["BIDDER", "AUCTIONEER"]).default("BIDDER"),
});

export const loginSchema = z.object({
  email,
  password,
});
