import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../lib/errors.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(
        new AppError(
          "VALIDATION_ERROR",
          parsed.error.issues[0]?.message ?? "Invalid input.",
          400,
        ),
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}
