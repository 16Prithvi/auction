"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "@/lib/api";
import { useAuth } from "./auth-provider";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"BIDDER" | "AUCTIONEER">("BIDDER");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result =
        mode === "login"
          ? await login(email, password)
          : await register({ name, email, password, role });
      setSession(result.token, result.user);
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Log in" : "Register"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Accounts are stored by the API.
      </p>
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
            minLength={8}
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
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60"
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
