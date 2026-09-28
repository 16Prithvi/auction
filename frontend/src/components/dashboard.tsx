"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, myAuctions, myBids } from "@/lib/api";
import { formatInr } from "@/lib/money";
import type { Auction, MyBid } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { StatusBadge } from "./status-badge";

export function Dashboard() {
  const { user, ready } = useAuth();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [bids, setBids] = useState<MyBid[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    const load =
      user.role === "AUCTIONEER" || user.role === "ADMIN"
        ? myAuctions().then((data) => {
            if (!cancelled) {
              setAuctions(data);
            }
          })
        : myBids().then((data) => {
            if (!cancelled) {
              setBids(data);
            }
          });
    load.catch((caught) => {
      if (!cancelled) {
        setError(
          caught instanceof ApiError ? caught.message : "Request failed.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading dashboard…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-3 text-sm text-zinc-700">
          Log in to see your auctions or bids.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm underline">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {user.name} · {user.email} · {user.role}
      </p>
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {user.role === "AUCTIONEER" || user.role === "ADMIN" ? (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Your auctions</h2>
            <Link href="/auctions/new" className="text-sm underline">
              Create auction
            </Link>
          </div>
          {auctions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No auctions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">
              {auctions.map((auction) => (
                <li
                  key={auction.id}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm"
                >
                  <Link
                    href={`/auctions/${auction.id}`}
                    className="font-medium"
                  >
                    {auction.title}
                  </Link>
                  <span className="text-zinc-500">
                    {formatInr(auction.currentPrice)}
                  </span>
                  <StatusBadge status={auction.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Your bids</h2>
          {bids.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No bids yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">
              {bids.map((bid) => (
                <li key={bid.id} className="py-3 text-sm">
                  <Link
                    href={`/auctions/${bid.auction.id}/live`}
                    className="font-medium"
                  >
                    {bid.auction.title}
                  </Link>
                  <p className="text-zinc-600">{formatInr(bid.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
