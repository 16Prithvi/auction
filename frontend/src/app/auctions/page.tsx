import type { Metadata } from "next";
import { AuctionList } from "@/components/auction-list";

export const metadata: Metadata = {
  title: "Auctions",
};

export default function AuctionsPage() {
  return <AuctionList />;
}
