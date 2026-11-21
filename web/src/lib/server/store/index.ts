import "server-only";
import { getEnv } from "../env";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

// One store per server instance. Kept on globalThis so dev hot reload does not
// drop the in-memory data.
const holder = globalThis as unknown as { __store?: Store };

export function getStore(): Store {
  if (holder.__store) return holder.__store;
  const env = getEnv();
  holder.__store =
    env.STORE === "memory"
      ? new MemoryStore()
      : new SupabaseStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, env.SUPABASE_BOOKS_BUCKET);
  return holder.__store;
}

/** Tests only. */
export function setStoreForTests(store: Store | undefined) {
  holder.__store = store;
}
