import { afterEach, beforeEach } from "vitest";
import { flushBackground } from "@/lib/server/background";
import { resetEnvForTests } from "@/lib/server/env";
import { resetRateLimitsForTests } from "@/lib/server/rate-limit";
import { setStoreForTests } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";

process.env.STORE = "memory";
process.env.AI_MODE = "fake";

beforeEach(() => {
  resetEnvForTests();
  resetRateLimitsForTests();
  setStoreForTests(new MemoryStore());
});

afterEach(async () => {
  await flushBackground();
  setStoreForTests(undefined);
});
