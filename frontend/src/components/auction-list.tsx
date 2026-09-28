"use client";

import Link from "next/link";
import { formatInr, formatWhen } from "@/lib/money";
import { StatusBadge } from "./status-badge";
import { useMockDb } from "./use-mock-db";

export function AuctionList() {
  const db = useMockDb();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Auctions</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Sample listings stored in this browser. Prices and status come from the
        mock records, not from a server.
      </p>
      {db === null ? (
        <p className="mt-8 text-sm text-zinc-500">Loading auctions…</p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
          {db.auctions.map((auction) => (
            <li
              key={auction.id}
              className="flex flex-wrap items-center gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/auctions/${auction.id}`}
                  className="font-medium hover:underline"
                >
                  {auction.title}
                </Link>
                <p className="mt-1 text-sm text-zinc-600">
                  {formatInr(auction.currentPrice)}
                  {auction.endsAt
                    ? ` · ends ${formatWhen(auction.endsAt)}`
                    : ""}
                </p>
              </div>
              <StatusBadge status={auction.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
