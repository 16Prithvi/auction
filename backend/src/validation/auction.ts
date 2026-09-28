import { z } from "zod";

const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount with up to 2 decimals.");

export const createAuctionSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(2000),
    startingPrice: money,
    minimumBidIncrement: money,
    scheduledStartAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine(
    (input) => new Date(input.endsAt) > new Date(input.scheduledStartAt),
    {
      message: "End time must be after the start time.",
      path: ["endsAt"],
    },
  );

export const updateAuctionSchema = createAuctionSchema;

export const placeBidSchema = z.object({
  amount: money,
});
