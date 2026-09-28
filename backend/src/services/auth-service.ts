import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
} from "../repositories/user-repository.js";
import type { loginSchema, registerSchema } from "../validation/auth.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function tokenFor(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export async function register(input: z.infer<typeof registerSchema>) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AppError(
      "EMAIL_TAKEN",
      "An account with that email already exists.",
      409,
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await createUser({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
    return { token: tokenFor(user.id), user };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "EMAIL_TAKEN",
        "An account with that email already exists.",
        409,
      );
    }
    throw error;
  }
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Email or password is incorrect.", 401);
  }
  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw new AppError("UNAUTHORIZED", "Email or password is incorrect.", 401);
  }
  const publicUser = await findUserById(user.id);
  return { token: tokenFor(user.id), user: publicUser };
}

export async function currentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  return user;
}

export function disconnect() {
  return prisma.$disconnect();
}
