import type { Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import * as authService from "../services/auth-service.js";
import type { loginSchema, registerSchema } from "../validation/auth.js";
import type { z } from "zod";

function actor(req: Request) {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  return req.user;
}

export async function register(req: Request, res: Response) {
  const result = await authService.register(
    req.body as z.infer<typeof registerSchema>,
  );
  res.status(201).json({ success: true, data: result });
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(
    req.body as z.infer<typeof loginSchema>,
  );
  res.status(200).json({ success: true, data: result });
}

export async function me(req: Request, res: Response) {
  const user = await authService.currentUser(actor(req).id);
  res.status(200).json({ success: true, data: user });
}
