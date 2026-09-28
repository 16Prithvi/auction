import { Prisma } from "@prisma/client";

export function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
