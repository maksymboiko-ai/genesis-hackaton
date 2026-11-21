# ADR 0004: Parent accounts with Supabase Auth, sessions in httpOnly cookies

- **Status:** Proposed. Needs OK from Frontend and AI owners (contract change)
- **Date:** 2026-11-21
- **Owner:** Backend
- **Affects:** `web/src/contracts/api.ts` (auth endpoints, `unauthorized`), `web/src/lib/server/auth/`, `web/src/lib/server/access.ts`, every `/api` route, `supabase/migrations/0007_owners.sql`, the frontend auth pages

## Context

Sign-up and sign-in were a front-end mock: no password check, and every API
route was open to anyone with an id. The data is children's.

ARCHITECTURE rule 1 says the browser only talks to `/api`, never to Supabase.

## Decision

- **Supabase Auth, called by the backend.** `POST /api/auth/signup`, `/login`,
  `/logout`, `GET /api/auth/me`. Sign-up creates a confirmed account (no
  email verification in the MVP) and signs in.
- **Session in two httpOnly cookies** (`sb-access`, `sb-refresh`;
  `Path=/api; SameSite=Lax; Secure` on https). JavaScript never sees a token;
  the browser sends the cookies with every `/api` call, so the API client
  needs no token handling. An expired access token is renewed from the
  refresh token on the next request.
- **Every data route requires a session** (`route()`); only health and the
  auth endpoints are public (`publicRoute()`). State-changing requests from
  another origin are refused (403).
- **Ownership.** `child.owner_id` and `book.owner_id` reference `auth.users`
  (cascade on delete). Curricula, lessons and attempts are reached through
  the child. Another parent's id answers 404, never 403, so ids cannot be
  probed.
- **Auth calls use a fresh Supabase client each time**, never the shared
  database client: a client that signs a user in switches from the service
  key to that user's token.
- `STORE=memory` uses an in-memory account store (scrypt hashes, random
  tokens) for tests and keyless local runs.

## Consequences

- ✅ Passwords are checked by Supabase; data is private per parent; tokens are
  out of reach of page scripts (XSS cannot steal a session).
- ✅ The frontend keeps calling `/api` with `fetch`; no Supabase SDK in the browser.
- ⚠️ Each request verifies the access token with Supabase (cached 60 s).
- ⚠️ No email verification or password reset yet.
- ⚠️ Rows created before `0007` have no owner and are hidden from everyone.
