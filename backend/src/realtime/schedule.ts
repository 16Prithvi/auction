import { listClosableAuctions } from "../repositories/auction-repository.js";

const MAX_TIMEOUT_MS = 2_147_483_647;
const timers = new Map<string, NodeJS.Timeout>();

export function clearAuctionClose(auctionId: string) {
  const existing = timers.get(auctionId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(auctionId);
  }
}

export function scheduleAuctionClose(auctionId: string, endsAt: Date) {
  clearAuctionClose(auctionId);
  const remaining = endsAt.getTime() - Date.now();
  const wait = Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS);
  const handle = setTimeout(() => {
    timers.delete(auctionId);
    if (wait < remaining) {
      scheduleAuctionClose(auctionId, endsAt);
      return;
    }
    void closeIfDue(auctionId);
  }, wait);
  timers.set(auctionId, handle);
}

async function closeIfDue(auctionId: string) {
  const { expireIfNeeded } = await import("../services/auction-service.js");
  const result = await expireIfNeeded(auctionId);
  if (
    !result.expired &&
    (result.auction.status === "ACTIVE" || result.auction.status === "PAUSED")
  ) {
    scheduleAuctionClose(auctionId, result.auction.endsAt);
  }
}

export async function scheduleOpenAuctions() {
  const rows = await listClosableAuctions();
  for (const row of rows) {
    scheduleAuctionClose(row.id, row.endsAt);
  }
}
