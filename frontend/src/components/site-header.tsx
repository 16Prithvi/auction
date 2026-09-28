"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";

const links = [
  { href: "/auctions", label: "Auctions" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/auctions" className="font-semibold tracking-tight">
          Auction
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname.startsWith(link.href)
                  ? "text-zinc-950"
                  : "text-zinc-500"
              }
            >
              {link.label}
            </Link>
          ))}
          {user?.role === "AUCTIONEER" || user?.role === "ADMIN" ? (
            <Link
              href="/auctions/new"
              className={
                pathname === "/auctions/new" ? "text-zinc-950" : "text-zinc-500"
              }
            >
              Create
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-zinc-600">
                {user.name}
                <span className="text-zinc-400"> · {user.role}</span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-zinc-300 px-3 py-1.5"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-zinc-600">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-white"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
