# ADR 0003: Deny database access to Supabase's client roles

- **Status:** Proposed. Needs OK from AI and Frontend owners (contract change)
- **Date:** 2026-11-21
- **Owner:** Backend
- **Affects:** `supabase/migrations/0005_lock_down_public_access.sql`

## Context

Supabase publishes every table and function in the `public` schema through its
REST API. Requests signed with the project's `anon` key run as the `anon`
role, which has full table privileges by default. Our tables have no row-level
security (ARCHITECTURE.md, out of scope), so anyone who gets the anon key
could read children's names, notes and quiz history, or call `apply_replan`.

The app itself never uses the anon key: the browser only talks to `/api`, and
the server uses the service role key, which bypasses RLS.

## Decision

Migration `0005`:

- enables RLS on every table **without policies**, so `anon` and
  `authenticated` see no rows and can write nothing;
- revokes `EXECUTE` on the backend functions and `match_book_chunks` from
  `PUBLIC`, `anon` and `authenticated`, and grants it to `service_role`.

## Consequences

- ✅ The anon key alone exposes nothing. The backend is unaffected (tested in
  `supabase/tests/0005_lock_down_public_access.sql`).
- ⚠️ New tables and functions are public again by default: every later
  migration that adds one must enable RLS / revoke execute the same way.
- ⚠️ Real per-family access rules (policies) still arrive with real accounts.
