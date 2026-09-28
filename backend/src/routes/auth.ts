import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/auth-controller.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validation/auth.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    });
  },
});

export const authRouter = Router();

authRouter.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  authController.register,
);
authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  authController.login,
);
