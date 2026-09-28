import type { Metadata } from "next";
import { LiveRoom } from "@/components/live-room";

export const metadata: Metadata = {
  title: "Live auction",
};

export default async function LiveAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveRoom id={id} />;
}
