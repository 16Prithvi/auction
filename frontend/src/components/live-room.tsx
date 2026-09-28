"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  AUTH_EVENT,
  getAuction,
  getToken,
  placeBid,
  socketBaseUrl,
} from "@/lib/api";
import { formatInr } from "@/lib/money";
import type { AcceptedBid, Auction, AuctionSnapshot, Bid } from "@/lib/types";
import { Countdown } from "./countdown";
import { StatusBadge } from "./status-badge";

type LiveLink = "connected" | "reconnecting" | "idle";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(AUTH_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(AUTH_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function applySnapshot(current: Auction, next: AuctionSnapshot): Auction {
  return { ...current, ...next };
}

export function LiveRoom({ id }: { id: string }) {
  const token = useSyncExternalStore(subscribe, getToken, () => null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<LiveLink>("idle");

  useEffect(() => {
    let cancelled = false;
    getAuction(id)
      .then((data) => {
        if (!cancelled) {
          setAuction(data);
          setBids(data.bids ?? []);
          setError(null);
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

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const socket: Socket = io(socketBaseUrl(), {
      auth: { token },
      reconnection: true,
    });

    function refresh() {
      getAuction(id)
        .then((data) => {
          if (!cancelled) {
            setAuction(data);
            setBids(data.bids ?? []);
            setError(null);
          }
        })
        .catch(() => {
          // The socket still applies later events. The first load reports errors.
        });
    }

    socket.on("connect", () => {
      if (cancelled) {
        return;
      }
      setLink("connected");
      socket.emit("auction:join", id);
      refresh();
    });
    socket.on("disconnect", () => {
      if (!cancelled) {
        setLink(socket.active ? "reconnecting" : "idle");
      }
    });
    socket.io.on("reconnect_attempt", () => {
      if (!cancelled) {
        setLink("reconnecting");
      }
    });
    socket.on("connect_error", () => {
      if (!cancelled) {
        setLink(socket.active ? "reconnecting" : "idle");
      }
    });
    socket.on(
      "bid:accepted",
      (payload: AcceptedBid & { auctionId: string }) => {
        if (cancelled || payload.auctionId !== id) {
          return;
        }
        setAuction((current) =>
          current
            ? {
                ...current,
                currentPrice: payload.currentPrice,
                minimumNextBid: payload.minimumNextBid,
                endsAt: payload.endsAt,
              }
            : current,
        );
        setBids((current) =>
          current.some((bid) => bid.id === payload.bid.id)
            ? current
            : [payload.bid, ...current],
        );
        if (payload.extended) {
          setNoticeError(false);
          setNotice("The server extended the auction.");
        }
      },
    );
    socket.on("auction:updated", (snapshot: AuctionSnapshot) => {
      if (cancelled || snapshot.id !== id) {
        return;
      }
      setAuction((current) =>
        current ? applySnapshot(current, snapshot) : { ...snapshot },
      );
    });
    socket.on("auction:completed", (snapshot: AuctionSnapshot) => {
      if (cancelled || snapshot.id !== id) {
        return;
      }
      setAuction((current) =>
        current ? applySnapshot(current, snapshot) : { ...snapshot },
      );
      setNoticeError(false);
      setNotice("This auction has ended.");
    });

    return () => {
      cancelled = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [id, token]);

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
      setBids((current) =>
        current.some((bid) => bid.id === accepted.bid.id)
          ? current
          : [accepted.bid, ...current],
      );
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

  const connected = Boolean(token) && link === "connected";
  const reconnecting = Boolean(token) && link === "reconnecting";
  const linkLabel = connected
    ? "Connected"
    : reconnecting
      ? "Reconnecting"
      : "Not connected";

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
          disabled={pending || auction.status !== "ACTIVE"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          Place bid
        </button>
        <p className="text-sm text-zinc-500">
          <span
            className={`mr-1 inline-block h-2 w-2 rounded-full ${
              connected
                ? "bg-green-600"
                : reconnecting
                  ? "bg-amber-500"
                  : "bg-zinc-400"
            }`}
          />
          {linkLabel}
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
