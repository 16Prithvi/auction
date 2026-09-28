export const baseUrl = process.env.API_URL ?? "http://127.0.0.1:4000";

export async function api(path, { token, method = "GET", body, base = baseUrl } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      `${method} ${path} ${response.status} ${JSON.stringify(json)}`,
    );
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return {
    data: json.data,
    cache: response.headers.get("x-cache"),
    status: response.status,
  };
}

export function auctionWindow() {
  const now = Date.now();
  return {
    scheduledStartAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 30 * 60_000).toISOString(),
  };
}

export async function registerUser(role, name, base = baseUrl) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return api("/auth/register", {
    base,
    method: "POST",
    body: {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}-${stamp}@example.com`,
      password: "password123",
      role,
    },
  });
}

export async function openAuction(token, title, base = baseUrl) {
  const created = await api("/auctions", {
    base,
    token,
    method: "POST",
    body: {
      title,
      description: "Phase 8 measurement",
      startingPrice: "100.00",
      minimumBidIncrement: "10.00",
      ...auctionWindow(),
    },
  });
  await api(`/auctions/${created.data.id}/start`, {
    base,
    token,
    method: "POST",
  });
  return created.data.id;
}
