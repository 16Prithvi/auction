import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: publicUser });
}

export function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}) {
  return prisma.user.create({ data: input, select: publicUser });
}
