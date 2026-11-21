import { afterEach, beforeEach } from "vitest";
import { setAuthForTests } from "@/lib/server/auth";
import { MemoryAuth } from "@/lib/server/auth/memory";
import { flushBackground } from "@/lib/server/background";
import { resetEnvForTests } from "@/lib/server/env";
import { resetRateLimitsForTests } from "@/lib/server/rate-limit";
import { setStoreForTests } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";
import { giveTrial, parent, signInTestParent } from "./helpers";

process.env.STORE = "memory";
process.env.AI_MODE = "fake";

beforeEach(async () => {
  resetEnvForTests();
  resetRateLimitsForTests();
  setStoreForTests(new MemoryStore());
  setAuthForTests(new MemoryAuth());
  // Every test request is signed in as this parent unless it says otherwise.
  await signInTestParent();
  // On a running trial, so every lesson is open; access.test.ts covers the lock.
  giveTrial(parent.user.id);
});

afterEach(async () => {
  await flushBackground();
  setStoreForTests(undefined);
  setAuthForTests(undefined);
});
