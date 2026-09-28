"use client";

import { useSyncExternalStore } from "react";
import { readDb, subscribeMockDb } from "@/lib/mock-db";
import type { MockDb } from "@/lib/types";

export function useMockDb(): MockDb | null {
  return useSyncExternalStore(subscribeMockDb, readDb, () => null);
}
