export type Role = "BIDDER" | "AUCTIONEER" | "ADMIN";

export type AuctionStatus =
  "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type MockUser = SessionUser & {
  password: string;
};

export type Auction = {
  id: string;
  title: string;
  description: string;
  startingPrice: string;
  currentPrice: string;
  minimumBidIncrement: string;
  minimumNextBid: string;
  status: AuctionStatus;
  scheduledStartAt: string;
  startedAt: string | null;
  endsAt: string | null;
  createdBy: string;
  createdByName: string;
  winnerId: string | null;
  winnerName: string | null;
  createdAt: string;
};

export type Bid = {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: string;
  createdAt: string;
};

export type MockDb = {
  users: MockUser[];
  sessionUserId: string | null;
  auctions: Auction[];
  bids: Bid[];
};
