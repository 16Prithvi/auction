"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createMockAuction, sessionUser } from "@/lib/mock-db";
import { useMockDb } from "./use-mock-db";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

function defaultStart() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return toLocalInput(date);
}

function defaultEnd() {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return toLocalInput(date);
}

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateAuctionForm() {
  const router = useRouter();
  const db = useMockDb();
  const user = db ? sessionUser(db) : null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingPrice, setStartingPrice] = useState("1000");
  const [minimumBidIncrement, setMinimumBidIncrement] = useState("100");
  const [scheduledStartAt, setScheduledStartAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);

  if (db === null) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (!user || (user.role !== "AUCTIONEER" && user.role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create auction
        </h1>
        <p className="mt-3 text-sm text-zinc-700">
          Sign in as an auctioneer. Demo account: ravi@example.com /
          password123.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm underline">
          Log in
        </Link>
      </main>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createMockAuction({
      title,
      description,
      startingPrice,
      minimumBidIncrement,
      scheduledStartAt,
      endsAt,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/auctions/${result.auction.id}`);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create auction</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Saved only in this browser. It is not published to the API.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          Title
          <input
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            required
          />
        </label>
        <label className="block text-sm">
          Starting price (INR)
          <input
            className={inputClass}
            inputMode="decimal"
            value={startingPrice}
            onChange={(event) => setStartingPrice(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Minimum bid increment (INR)
          <input
            className={inputClass}
            inputMode="decimal"
            value={minimumBidIncrement}
            onChange={(event) => setMinimumBidIncrement(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Start
          <input
            className={inputClass}
            type="datetime-local"
            value={scheduledStartAt}
            onChange={(event) => setScheduledStartAt(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          End
          <input
            className={inputClass}
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Save auction
        </button>
      </form>
    </main>
  );
}
