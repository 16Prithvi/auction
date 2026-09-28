"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatInr } from "@/lib/money";
import { Countdown } from "./countdown";
import { StatusBadge } from "./status-badge";
import { useMockDb } from "./use-mock-db";

export function LiveRoom({ id }: { id: string }) {
  const db = useMockDb();
  const auction = db?.auctions.find((item) => item.id === id) ?? null;
  const bids = (db?.bids ?? [])
    .filter((bid) => bid.auctionId === id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (db === null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading auction…</p>
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Auction not found</h1>
        <Link href="/auctions" className="mt-4 inline-block text-sm underline">
          Back to auctions
        </Link>
      </main>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Not sent. The server will accept or reject this bid.");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {auction.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-700">
            {auction.description}
          </p>
        </div>
        <StatusBadge status={auction.status} />
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-zinc-500">Current bid</p>
          <p className="mt-1 text-3xl font-semibold">
            {formatInr(auction.currentPrice)}
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-500">Next minimum bid</p>
          <p className="mt-1 text-3xl font-semibold">
            {formatInr(auction.minimumNextBid)}
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-500">Time remaining</p>
          <div className="mt-1">
            <Countdown
              endsAt={auction.status === "ACTIVE" ? auction.endsAt : null}
            />
          </div>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        <label className="sr-only" htmlFor="bid-amount">
          Bid amount
        </label>
        <input
          id="bid-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={formatInr(auction.minimumNextBid)}
          className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Place bid
        </button>
        <p className="text-sm text-zinc-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-400" />
          Not connected
        </p>
      </form>
      {notice ? <p className="mt-3 text-sm text-zinc-700">{notice}</p> : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-500">Recent bids</h2>
        {bids.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No bids yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {bids.map((bid) => (
              <li key={bid.id}>
                {formatInr(bid.amount)}
                <span className="text-zinc-500"> · {bid.bidderName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
