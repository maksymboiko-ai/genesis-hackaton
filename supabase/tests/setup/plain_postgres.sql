-- What a Supabase project already has and the migrations and tests rely on:
-- the client roles and auth.users. Run once on a plain Postgres (CI, a scratch
-- database) before applying supabase/migrations.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key);
