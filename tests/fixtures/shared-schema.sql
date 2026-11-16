-- PostgreSQL schema. Applied under an advisory lock by lib/postgres.ts.
--
-- A trip is a group: everyone in the trip is part of it, and the trip has one chat group of its own.
-- Everybody in a group is also an owner of it, so any member may answer a request to join it.
-- A publication puts a trip in the shared lobby, where other people can ask to join it.
--
-- Every statement says "if not exists", because the migration from an older version reuses this file to
-- add the new tables to a database that already has the old ones.
create table if not exists users (
  rowid bigserial unique,
  id text primary key,
  name text not null,
  email text not null unique ,
  password_hash text not null
);

create table if not exists sessions (
  rowid bigserial unique,
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at bigint not null
);
create index if not exists sessions_expiry on sessions(expires_at);

create table if not exists trips (
  rowid bigserial unique,
  id text primary key,
  owner_id text not null references users(id),
  origin text not null,
  destination text not null,
  start_date text not null,
  end_date text not null check (end_date >= start_date),
  invite_code text not null unique
);

create table if not exists trip_members (
  rowid bigserial unique,
  trip_id text not null references trips(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user on trip_members(user_id);

create table if not exists plan_items (
  rowid bigserial unique,
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  added_by_id text not null references users(id),
  date text not null,
  time text,
  title text not null,
  place text not null,
  note text not null
);
create index if not exists plan_items_trip on plan_items(trip_id);

