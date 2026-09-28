import type { Metadata } from "next";
import { CreateAuctionForm } from "@/components/create-auction-form";

export const metadata: Metadata = {
  title: "Create auction",
};

export default function CreateAuctionPage() {
  return <CreateAuctionForm />;
}
