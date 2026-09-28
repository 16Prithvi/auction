# Frontend

Next.js screens for login, register, auctions, the live room, create auction, and the dashboard. They call the API in `NEXT_PUBLIC_API_URL`. The live room also connects to `NEXT_PUBLIC_SOCKET_URL` and applies server events for that auction.

See the repository root [README](../README.md) for how to run the stack.

```bash
cp .env.example .env.local
npm install
npm run dev
```
