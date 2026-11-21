import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { conflict, unauthorized } from "../errors";
import type { AuthProvider, AuthUser, Session } from "./types";

// In-process accounts, for tests and STORE=memory local runs. Passwords are
// stored as scrypt hashes; tokens are random and expire like Supabase's.

const ACCESS_TTL_MS = 60 * 60 * 1000;

type Account = AuthUser & { salt: Buffer; hash: Buffer };

const hashPassword = (password: string, salt: Buffer) => scryptSync(password, salt, 32);
const token = () => randomBytes(32).toString("base64url");

export class MemoryAuth implements AuthProvider {
  private accounts = new Map<string, Account>();
  private access = new Map<string, { userId: string; expiresAt: number }>();
  private refreshTokens = new Map<string, string>();

  private user(id: string): AuthUser | null {
    for (const a of this.accounts.values()) if (a.id === id) return { id: a.id, email: a.email, name: a.name };
    return null;
  }

  private issue(userId: string): Session {
    const session = { accessToken: token(), refreshToken: token(), expiresAt: Date.now() + ACCESS_TTL_MS };
    this.access.set(session.accessToken, { userId, expiresAt: session.expiresAt });
    this.refreshTokens.set(session.refreshToken, userId);
    return session;
  }

  async signUp(input: { name: string; email: string; password: string }) {
    if (this.accounts.has(input.email)) throw conflict("An account with this email already exists.");
    const salt = randomBytes(16);
    const account: Account = { id: randomUUID(), email: input.email, name: input.name, salt, hash: hashPassword(input.password, salt) };
    this.accounts.set(input.email, account);
    return { user: { id: account.id, email: account.email, name: account.name }, session: this.issue(account.id) };
  }

  async signIn(email: string, password: string) {
    const account = this.accounts.get(email);
    // Hash even for an unknown email, so timing does not reveal which emails exist.
    const hash = hashPassword(password, account?.salt ?? Buffer.alloc(16));
    if (!account || !timingSafeEqual(hash, account.hash)) throw unauthorized("Wrong email or password.");
    return { user: { id: account.id, email: account.email, name: account.name }, session: this.issue(account.id) };
  }

  async getUser(accessToken: string) {
    const entry = this.access.get(accessToken);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return this.user(entry.userId);
  }

  async refresh(refreshToken: string) {
    const userId = this.refreshTokens.get(refreshToken);
    if (!userId) return null;
    // Refresh tokens are single use, as in Supabase.
    this.refreshTokens.delete(refreshToken);
    const user = this.user(userId);
    return user ? { user, session: this.issue(userId) } : null;
  }

  async signOut(accessToken: string) {
    const entry = this.access.get(accessToken);
    this.access.delete(accessToken);
    if (!entry) return;
    for (const [rt, uid] of this.refreshTokens) if (uid === entry.userId) this.refreshTokens.delete(rt);
  }

  /** Tests only: makes an access token expire now. */
  expire(accessToken: string) {
    const entry = this.access.get(accessToken);
    if (entry) entry.expiresAt = 0;
  }
}
