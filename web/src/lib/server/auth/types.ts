import "server-only";

export type AuthUser = { id: string; email: string; name: string };

export type Session = {
  accessToken: string;
  refreshToken: string;
  // Epoch milliseconds when the access token expires.
  expiresAt: number;
};

/** Accounts and sessions. Supabase Auth in production, in-memory for tests. */
export interface AuthProvider {
  /** Creates the account and signs in. Throws conflict if the email is taken. */
  signUp(input: { name: string; email: string; password: string }): Promise<{ user: AuthUser; session: Session }>;
  /** Throws unauthorized on a wrong email or password. */
  signIn(email: string, password: string): Promise<{ user: AuthUser; session: Session }>;
  /** The user of a valid access token, else null. */
  getUser(accessToken: string): Promise<AuthUser | null>;
  /** A new session from a refresh token, else null. */
  refresh(refreshToken: string): Promise<{ user: AuthUser; session: Session } | null>;
  /** Revokes the session of this access token. Never throws. */
  signOut(accessToken: string): Promise<void>;
}
