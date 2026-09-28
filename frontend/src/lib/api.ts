import type { AcceptedBid, Auction, MyBid, SessionUser } from "./types";

const TOKEN_KEY = "auction.token";
export const AUTH_EVENT = "auction-auth";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Could not reach the API.", "NETWORK", 0);
  }

  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/register"
    ) {
      setToken(null);
    }
    throw new ApiError(
      body?.error?.message ?? "Request failed.",
      body?.error?.code ?? "INTERNAL_ERROR",
      response.status,
    );
  }

  return body?.data as T;
}

export function login(email: string, password: string) {
  return api<{ token: string; user: SessionUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(input: {
  name: string;
  email: string;
  password: string;
  role: "BIDDER" | "AUCTIONEER";
}) {
  return api<{ token: string; user: SessionUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function currentUser() {
  return api<SessionUser>("/me");
}

export function listAuctions() {
  return api<Auction[]>("/auctions");
}

export function getAuction(id: string) {
  return api<Auction>(`/auctions/${id}`);
}

export function createAuction(input: {
  title: string;
  description: string;
  startingPrice: string;
  minimumBidIncrement: string;
  scheduledStartAt: string;
  endsAt: string;
}) {
  return api<Auction>("/auctions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function auctionAction(
  id: string,
  action: "start" | "pause" | "resume" | "end" | "cancel",
) {
  return api<Auction>(`/auctions/${id}/${action}`, { method: "POST" });
}

export function placeBid(id: string, amount: string) {
  return api<AcceptedBid>(`/auctions/${id}/bids`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function myAuctions() {
  return api<Auction[]>("/me/auctions");
}

export function myBids() {
  return api<MyBid[]>("/me/bids");
}
