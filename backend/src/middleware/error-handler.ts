import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Express identifies error middleware by a 4-argument signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (error instanceof AppError) {
    console.log(
      JSON.stringify({
        level: "warn",
        code: error.code,
        message: error.message,
        method: req.method,
        path: req.path,
      }),
    );
    res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      code: "INTERNAL_ERROR",
      method: req.method,
      path: req.path,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
    },
  });
}
