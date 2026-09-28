"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, auctionAction, getAuction } from "@/lib/api";
import { formatInr, formatWhen } from "@/lib/money";
import type { Auction, AuctionStatus } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { StatusBadge } from "./status-badge";

const actions: Partial<
  Record<AuctionStatus, Array<"start" | "pause" | "resume" | "end" | "cancel">>
> = {
  DRAFT: ["start", "cancel"],
  SCHEDULED: ["start", "cancel"],
  ACTIVE: ["pause", "end"],
  PAUSED: ["resume", "end", "cancel"],
};

export function AuctionDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    return getAuction(id)
      .then(setAuction)
      .catch((caught) => {
        setAuction(null);
        setError(
          caught instanceof ApiError ? caught.message : "Request failed.",
        );
      });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getAuction(id)
      .then((data) => {
        if (!cancelled) {
          setAuction(data);
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
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
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
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading auction…</p>
      </main>
    );
  }

  const owns = user?.id === auction.createdBy.id || user?.role === "ADMIN";
  const available = owns ? (actions[auction.status] ?? []) : [];

  async function run(action: "start" | "pause" | "resume" | "end" | "cancel") {
    setPending(true);
    setActionError(null);
    try {
      await auctionAction(id, action);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Request failed.",
      );
    } finally {
      setPending(false);
    }
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
          <dd className="mt-1">{formatWhen(auction.endsAt)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Auctioneer</dt>
          <dd className="mt-1">{auction.createdBy.name}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Winner</dt>
          <dd className="mt-1">{auction.winner?.name ?? "Not decided"}</dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/auctions/${auction.id}/live`}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Open live room
        </Link>
        {available.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending}
            onClick={() => run(action)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm capitalize disabled:opacity-60"
          >
            {action}
          </button>
        ))}
      </div>
      {actionError ? (
        <p className="mt-3 text-sm text-red-700">{actionError}</p>
      ) : null}
      {auction.bids && auction.bids.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-500">Recent bids</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {auction.bids.map((bid) => (
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
