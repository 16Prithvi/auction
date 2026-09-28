import { fromCents, toCents } from "./money";
import type { Auction, MockDb, SessionUser } from "./types";

const STORAGE_KEY = "auction.mock.v1";
const CHANGE_EVENT = "auction-mock-change";

let state: MockDb | null = null;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function createSeed(): MockDb {
  return {
    users: [
      {
        id: "user-ada",
        name: "Ada Bidder",
        email: "ada@example.com",
        password: "password123",
        role: "BIDDER",
      },
      {
        id: "user-ravi",
        name: "Ravi Auctioneer",
        email: "ravi@example.com",
        password: "password123",
        role: "AUCTIONEER",
      },
    ],
    sessionUserId: null,
    auctions: [
      {
        id: "auc-camera",
        title: "Vintage rangefinder camera",
        description:
          "A working 35mm rangefinder with a 50mm lens. Sold as photographed.",
        startingPrice: "8000.00",
        currentPrice: "10500.00",
        minimumBidIncrement: "500.00",
        minimumNextBid: "11000.00",
        status: "ACTIVE",
        scheduledStartAt: hoursFromNow(-2),
        startedAt: hoursFromNow(-2),
        endsAt: hoursFromNow(0.5),
        createdBy: "user-ravi",
        createdByName: "Ravi Auctioneer",
        winnerId: null,
        winnerName: null,
        createdAt: hoursFromNow(-24),
      },
      {
        id: "auc-watch",
        title: "Mechanical wristwatch",
        description:
          "Manual-wind watch with a leather strap. Recently serviced.",
        startingPrice: "15000.00",
        currentPrice: "15000.00",
        minimumBidIncrement: "1000.00",
        minimumNextBid: "16000.00",
        status: "SCHEDULED",
        scheduledStartAt: hoursFromNow(5),
        startedAt: null,
        endsAt: hoursFromNow(8),
        createdBy: "user-ravi",
        createdByName: "Ravi Auctioneer",
        winnerId: null,
        winnerName: null,
        createdAt: hoursFromNow(-10),
      },
      {
        id: "auc-lamp",
        title: "Brass desk lamp",
        description:
          "Draft listing. The auctioneer has not scheduled this yet.",
        startingPrice: "2000.00",
        currentPrice: "2000.00",
        minimumBidIncrement: "100.00",
        minimumNextBid: "2100.00",
        status: "DRAFT",
        scheduledStartAt: hoursFromNow(24),
        startedAt: null,
        endsAt: hoursFromNow(26),
        createdBy: "user-ravi",
        createdByName: "Ravi Auctioneer",
        winnerId: null,
        winnerName: null,
        createdAt: hoursFromNow(-3),
      },
      {
        id: "auc-cycle",
        title: "City bicycle",
        description:
          "Single-speed bicycle. Bidding is paused by the auctioneer.",
        startingPrice: "4000.00",
        currentPrice: "4500.00",
        minimumBidIncrement: "250.00",
        minimumNextBid: "4750.00",
        status: "PAUSED",
        scheduledStartAt: hoursFromNow(-6),
        startedAt: hoursFromNow(-6),
        endsAt: hoursFromNow(1),
        createdBy: "user-ravi",
        createdByName: "Ravi Auctioneer",
        winnerId: null,
        winnerName: null,
        createdAt: hoursFromNow(-30),
      },
      {
        id: "auc-painting",
        title: "Landscape study",
        description: "Small oil study on board. This auction has finished.",
        startingPrice: "3000.00",
        currentPrice: "6000.00",
        minimumBidIncrement: "500.00",
        minimumNextBid: "6500.00",
        status: "COMPLETED",
        scheduledStartAt: hoursFromNow(-48),
        startedAt: hoursFromNow(-48),
        endsAt: hoursFromNow(-24),
        createdBy: "user-ravi",
        createdByName: "Ravi Auctioneer",
        winnerId: "user-ada",
        winnerName: "Ada Bidder",
        createdAt: hoursFromNow(-72),
      },
    ],
    bids: [
      {
        id: "bid-camera-3",
        auctionId: "auc-camera",
        bidderId: "user-ada",
        bidderName: "Ada Bidder",
        amount: "10500.00",
        createdAt: hoursFromNow(-0.2),
      },
      {
        id: "bid-camera-2",
        auctionId: "auc-camera",
        bidderId: "user-mina",
        bidderName: "Mina Rao",
        amount: "10000.00",
        createdAt: hoursFromNow(-0.5),
      },
      {
        id: "bid-camera-1",
        auctionId: "auc-camera",
        bidderId: "user-ada",
        bidderName: "Ada Bidder",
        amount: "9500.00",
        createdAt: hoursFromNow(-0.8),
      },
      {
        id: "bid-painting-1",
        auctionId: "auc-painting",
        bidderId: "user-ada",
        bidderName: "Ada Bidder",
        amount: "6000.00",
        createdAt: hoursFromNow(-25),
      },
    ],
  };
}

function persist(next: MockDb) {
  state = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readDb(): MockDb {
  if (state) {
    return state;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    state = JSON.parse(raw) as MockDb;
    return state;
  }
  state = createSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function subscribeMockDb(listener: () => void): () => void {
  const onChange = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }
    state = event.newValue
      ? (JSON.parse(event.newValue) as MockDb)
      : createSeed();
    listener();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function sessionUser(db: MockDb): SessionUser | null {
  const user = db.users.find((candidate) => candidate.id === db.sessionUserId);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function loginMock(email: string, password: string): string | null {
  const db = readDb();
  const user = db.users.find(
    (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!user || user.password !== password) {
    return "Email or password does not match a demo account.";
  }
  persist({ ...db, sessionUserId: user.id });
  return null;
}

export function registerMock(input: {
  name: string;
  email: string;
  password: string;
  role: "BIDDER" | "AUCTIONEER";
}): string | null {
  const db = readDb();
  const email = input.email.trim().toLowerCase();
  if (db.users.some((user) => user.email === email)) {
    return "That email is already registered in this browser.";
  }
  const user = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    password: input.password,
    role: input.role,
  };
  persist({
    ...db,
    users: [...db.users, user],
    sessionUserId: user.id,
  });
  return null;
}

export function logoutMock() {
  const db = readDb();
  persist({ ...db, sessionUserId: null });
}

export function createMockAuction(input: {
  title: string;
  description: string;
  startingPrice: string;
  minimumBidIncrement: string;
  scheduledStartAt: string;
  endsAt: string;
}): { auction: Auction } | { error: string } {
  const db = readDb();
  const user = sessionUser(db);
  if (!user) {
    return { error: "Sign in before creating an auction." };
  }
  if (user.role !== "AUCTIONEER" && user.role !== "ADMIN") {
    return { error: "Only an auctioneer can create an auction." };
  }

  const startingCents = toCents(input.startingPrice);
  const incrementCents = toCents(input.minimumBidIncrement);
  if (startingCents === null || startingCents <= 0) {
    return { error: "Enter a starting price greater than zero." };
  }
  if (incrementCents === null || incrementCents <= 0) {
    return { error: "Enter a minimum increment greater than zero." };
  }

  const start = new Date(input.scheduledStartAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Enter a valid start and end time." };
  }
  if (end <= start) {
    return { error: "End time must be after the start time." };
  }

  const auction: Auction = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description.trim(),
    startingPrice: fromCents(startingCents),
    currentPrice: fromCents(startingCents),
    minimumBidIncrement: fromCents(incrementCents),
    minimumNextBid: fromCents(startingCents + incrementCents),
    status: start.getTime() > Date.now() ? "SCHEDULED" : "DRAFT",
    scheduledStartAt: start.toISOString(),
    startedAt: null,
    endsAt: end.toISOString(),
    createdBy: user.id,
    createdByName: user.name,
    winnerId: null,
    winnerName: null,
    createdAt: new Date().toISOString(),
  };

  persist({ ...db, auctions: [auction, ...db.auctions] });
  return { auction };
}
