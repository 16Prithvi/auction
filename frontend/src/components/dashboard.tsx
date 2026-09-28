"use client";

import Link from "next/link";
import { formatInr } from "@/lib/money";
import { sessionUser } from "@/lib/mock-db";
import { StatusBadge } from "./status-badge";
import { useMockDb } from "./use-mock-db";

export function Dashboard() {
  const db = useMockDb();
  const user = db ? sessionUser(db) : null;

  if (db === null) {
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

  const myAuctions = db.auctions.filter(
    (auction) => auction.createdBy === user.id,
  );
  const myBids = db.bids.filter((bid) => bid.bidderId === user.id);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {user.name} · {user.email} · {user.role}
      </p>

      {user.role === "AUCTIONEER" || user.role === "ADMIN" ? (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Your auctions</h2>
            <Link href="/auctions/new" className="text-sm underline">
              Create auction
            </Link>
          </div>
          {myAuctions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No auctions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">
              {myAuctions.map((auction) => (
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
          {myBids.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No bids yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">
              {myBids.map((bid) => {
                const auction = db.auctions.find(
                  (item) => item.id === bid.auctionId,
                );
                return (
                  <li key={bid.id} className="py-3 text-sm">
                    <Link
                      href={
                        auction ? `/auctions/${auction.id}/live` : "/auctions"
                      }
                      className="font-medium"
                    >
                      {auction?.title ?? "Auction"}
                    </Link>
                    <p className="text-zinc-600">{formatInr(bid.amount)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
