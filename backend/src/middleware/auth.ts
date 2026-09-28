import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

type TokenPayload = {
  sub: string;
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new AppError("UNAUTHORIZED", "Authentication is required.", 401));
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("invalid token");
    }
    userId = (payload as TokenPayload).sub;
  } catch {
    next(new AppError("UNAUTHORIZED", "Authentication is required.", 401));
    return;
  }

  prisma.user
    .findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    .then((user) => {
      if (!user) {
        next(new AppError("UNAUTHORIZED", "Authentication is required.", 401));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(
        new AppError(
          "FORBIDDEN",
          "You do not have permission to do that.",
          403,
        ),
      );
      return;
    }
    next();
  };
}
