import type { Metadata } from "next";
import { AuctionDetails } from "@/components/auction-details";

export const metadata: Metadata = {
  title: "Auction",
};

export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuctionDetails id={id} />;
}
