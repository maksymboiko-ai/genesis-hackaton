import { getStore } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function call(handler: unknown, req: Request, params: Record<string, string> = {}) {
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = text ? JSON.parse(text) : null;
  return { status: res.status, body, headers: res.headers };
}

export function memory(): MemoryStore {
  return getStore() as MemoryStore;
}
