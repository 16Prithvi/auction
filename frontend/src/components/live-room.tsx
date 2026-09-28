"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, getAuction, placeBid } from "@/lib/api";
import { formatInr } from "@/lib/money";
import type { Auction, Bid } from "@/lib/types";
import { Countdown } from "./countdown";
import { StatusBadge } from "./status-badge";

export function LiveRoom({ id }: { id: string }) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuction(id)
      .then((data) => {
        if (!cancelled) {
          setAuction(data);
          setBids(data.bids ?? []);
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
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Auction not found</h1>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <Link href="/auctions" className="mt-4 inline-block text-sm underline">
          Back to auctions
        </Link>
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading auction…</p>
      </main>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    setNoticeError(false);
    try {
      const accepted = await placeBid(id, amount);
      setAuction((current) =>
        current
          ? {
              ...current,
              currentPrice: accepted.currentPrice,
              minimumNextBid: accepted.minimumNextBid,
              endsAt: accepted.endsAt,
            }
          : current,
      );
      setBids((current) => [accepted.bid, ...current]);
      setAmount("");
      setNotice(
        accepted.extended
          ? "Bid accepted. The server extended the auction."
          : "Bid accepted.",
      );
    } catch (caught) {
      setNoticeError(true);
      setNotice(
        caught instanceof ApiError ? caught.message : "Request failed.",
      );
    } finally {
      setPending(false);
    }
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
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          Place bid
        </button>
        <p className="text-sm text-zinc-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-400" />
          Not connected
        </p>
      </form>
      {notice ? (
        <p
          className={`mt-3 text-sm ${noticeError ? "text-red-700" : "text-zinc-700"}`}
        >
          {notice}
        </p>
      ) : null}

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
