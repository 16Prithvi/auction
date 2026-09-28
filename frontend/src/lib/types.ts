export type Role = "BIDDER" | "AUCTIONEER" | "ADMIN";

export type AuctionStatus =
  "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type Person = {
  id: string;
  name: string;
};

export type Bid = {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: string;
  createdAt: string;
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
  endsAt: string;
  createdBy: Person;
  winner: Person | null;
  createdAt: string;
  updatedAt: string;
  bids?: Bid[];
};

export type MyBid = Bid & {
  auction: {
    id: string;
    title: string;
    status: AuctionStatus;
  };
};

export type AcceptedBid = {
  bid: Bid;
  currentPrice: string;
  minimumNextBid: string;
  endsAt: string;
  extended: boolean;
};
