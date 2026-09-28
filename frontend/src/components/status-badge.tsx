import type { AuctionStatus } from "@/lib/types";

const styles: Record<AuctionStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SCHEDULED: "bg-sky-50 text-sky-800",
  ACTIVE: "bg-emerald-50 text-emerald-800",
  PAUSED: "bg-amber-50 text-amber-800",
  COMPLETED: "bg-zinc-200 text-zinc-800",
  CANCELLED: "bg-red-50 text-red-800",
};

export function StatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
