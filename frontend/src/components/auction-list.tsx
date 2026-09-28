"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, listAuctions } from "@/lib/api";
import { formatInr, formatWhen } from "@/lib/money";
import type { Auction } from "@/lib/types";
import { StatusBadge } from "./status-badge";

export function AuctionList() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAuctions()
      .then((data) => {
        if (!cancelled) {
          setAuctions(data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : "Request failed.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Auctions</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Prices and status come from the server.
      </p>
      {error ? <p className="mt-8 text-sm text-red-700">{error}</p> : null}
      {auctions === null && !error ? (
        <p className="mt-8 text-sm text-zinc-500">Loading auctions…</p>
      ) : null}
      {auctions && auctions.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600">No auctions yet.</p>
      ) : null}
      {auctions && auctions.length > 0 ? (
        <ul className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
          {auctions.map((auction) => (
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
                  {formatInr(auction.currentPrice)} · ends{" "}
                  {formatWhen(auction.endsAt)}
                </p>
              </div>
              <StatusBadge status={auction.status} />
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
