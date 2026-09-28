"use client";

import Link from "next/link";
import { formatInr, formatWhen } from "@/lib/money";
import { StatusBadge } from "./status-badge";
import { useMockDb } from "./use-mock-db";

export function AuctionDetails({ id }: { id: string }) {
  const db = useMockDb();
  const auction = db?.auctions.find((item) => item.id === id) ?? null;
  const bids = (db?.bids ?? [])
    .filter((bid) => bid.auctionId === id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (db === null) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading auction…</p>
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Auction not found</h1>
        <Link href="/auctions" className="mt-4 inline-block text-sm underline">
          Back to auctions
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {auction.title}
        </h1>
        <StatusBadge status={auction.status} />
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-700">
        {auction.description}
      </p>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Current bid</dt>
          <dd className="mt-1 text-lg font-medium">
            {formatInr(auction.currentPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Next minimum bid</dt>
          <dd className="mt-1 text-lg font-medium">
            {formatInr(auction.minimumNextBid)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Starting price</dt>
          <dd className="mt-1">{formatInr(auction.startingPrice)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Minimum increment</dt>
          <dd className="mt-1">{formatInr(auction.minimumBidIncrement)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Scheduled start</dt>
          <dd className="mt-1">{formatWhen(auction.scheduledStartAt)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Ends</dt>
          <dd className="mt-1">
            {auction.endsAt ? formatWhen(auction.endsAt) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Auctioneer</dt>
          <dd className="mt-1">{auction.createdByName}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Winner</dt>
          <dd className="mt-1">{auction.winnerName ?? "Not decided"}</dd>
        </div>
      </dl>
      <Link
        href={`/auctions/${auction.id}/live`}
        className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
      >
        Open live room
      </Link>
      {bids.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-500">Recent bids</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {bids.map((bid) => (
              <li key={bid.id}>
                {formatInr(bid.amount)} · {bid.bidderName}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
