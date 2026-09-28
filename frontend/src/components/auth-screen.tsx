"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginMock, registerMock } from "@/lib/mock-db";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"BIDDER" | "AUCTIONEER">("BIDDER");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }

    if (mode === "login") {
      const message = loginMock(email, password);
      if (message) {
        setError(message);
        return;
      }
      router.push("/dashboard");
      return;
    }

    if (name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    const message = registerMock({ name, email, password, role });
    if (message) {
      setError(message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Log in" : "Register"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Demo accounts stay in this browser. Nothing is sent to the API.
      </p>
      {mode === "login" ? (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
          Bidder: ada@example.com
          <br />
          Auctioneer: ravi@example.com
          <br />
          Password: password123
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "register" ? (
          <label className="block text-sm">
            Name
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        ) : null}
        <label className="block text-sm">
          Email
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
        </label>
        {mode === "register" ? (
          <label className="block text-sm">
            Role
            <select
              className={inputClass}
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "BIDDER" | "AUCTIONEER")
              }
            >
              <option value="BIDDER">Bidder</option>
              <option value="AUCTIONEER">Auctioneer</option>
            </select>
          </label>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-600">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/register" className="underline">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
