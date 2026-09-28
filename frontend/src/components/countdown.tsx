"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/money";

export function Countdown({ endsAt }: { endsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!endsAt) {
    return <p className="text-3xl font-semibold tabular-nums">—</p>;
  }

  const remaining = new Date(endsAt).getTime() - now;
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums">
        {formatRemaining(remaining)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Display only. Reaching zero does not end the auction.
      </p>
    </div>
  );
}
