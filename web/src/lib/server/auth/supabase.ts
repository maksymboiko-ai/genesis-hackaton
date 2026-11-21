import "server-only";
import { createClient, type Session as SbSession, type User } from "@supabase/supabase-js";
import { conflict, unauthorized } from "../errors";
import type { AuthProvider, AuthUser, Session } from "./types";

// Supabase Auth, called from the server only (the browser talks to /api).
//
// Every call uses a fresh client: a supabase-js client that signs a user in
// starts sending that user's token instead of the service key, so the
// shared database client must never be used for auth.

const toUser = (u: User): AuthUser => ({
  id: u.id,
  email: u.email ?? "",
  name: typeof u.user_metadata?.name === "string" ? u.user_metadata.name : "",
});

const toSession = (s: SbSession): Session => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: (s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in) * 1000,
});

export class SupabaseAuth implements AuthProvider {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
  ) {}

  private client() {
    return createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async signUp(input: { name: string; email: string; password: string }) {
    // Created as confirmed: the MVP has no email verification step.
    const { error } = await this.client().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (error) {
      if (error.status === 422 || /already/i.test(error.message)) {
        throw conflict("An account with this email already exists.");
      }
      throw new Error(`auth createUser: ${error.status ?? ""} ${error.message}`);
    }
    return this.signIn(input.email, input.password);
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      if (!error || error.status === 400) throw unauthorized("Wrong email or password.");
      throw new Error(`auth signIn: ${error.status ?? ""} ${error.message}`);
    }
    return { user: toUser(data.user), session: toSession(data.session) };
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.client().auth.getUser(accessToken);
    return error || !data.user ? null : toUser(data.user);
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.client().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) return null;
    return { user: toUser(data.user), session: toSession(data.session) };
  }

  async signOut(accessToken: string) {
    await this.client()
      .auth.admin.signOut(accessToken)
      .catch(() => {});
  }
}
