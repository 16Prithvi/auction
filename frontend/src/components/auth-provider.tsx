"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AUTH_EVENT, currentUser, getToken, setToken } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

type AuthState = {
  user: SessionUser | null;
  ready: boolean;
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function subscribe(onStoreChange: () => void) {
  window.addEventListener(AUTH_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(AUTH_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, getToken, () => null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    currentUser()
      .then((next) => {
        if (!cancelled) {
          setUser(next);
          setLoadedToken(token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setLoadedToken(token);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value: AuthState = {
    user: token ? user : null,
    ready: !token || loadedToken === token,
    setSession(nextToken, nextUser) {
      setToken(nextToken);
      setUser(nextUser);
      setLoadedToken(nextToken);
    },
    logout() {
      setToken(null);
      setUser(null);
      setLoadedToken(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
