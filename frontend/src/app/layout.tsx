import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auction",
  description: "Real-time auction and bidding engine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
