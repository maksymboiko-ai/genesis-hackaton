import "server-only";
import { after } from "next/server";

// Runs work after the response with Next.js after(). A job must never throw:
// failures are logged and the job's own catch resets the row state.
//
// Under Vitest there is no request scope, so jobs are queued and tests await
// them with flushBackground().
const queue: Promise<void>[] = [];

export function runInBackground(name: string, job: () => Promise<void>): void {
  const safe = async () => {
    try {
      await job();
    } catch (err) {
      console.error(`[background] ${name} failed`, err);
    }
  };
  if (process.env.VITEST) {
    queue.push(safe());
    return;
  }
  after(safe);
}

/** Tests only: waits for queued jobs, including jobs they schedule. */
export async function flushBackground(): Promise<void> {
  while (queue.length) {
    await Promise.all(queue.splice(0));
  }
}
