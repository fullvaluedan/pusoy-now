-- RETIRED (2026-07-11). Accounts moved off Supabase to the Cloudflare auth
-- Worker in server/ (better-auth on D1); see server/migrations/ for the live
-- schema. This file is kept only as a reference for the future online-play
-- tables (games, head-to-head stats) that Phase B will re-home on D1. The app
-- no longer reads Supabase. The one live piece still under supabase/ is the
-- deferred TikTok Login bridge in functions/tiktok-auth/ (Deno edge function).
--
-- Original note: Pusoy Now schema. Run in Supabase SQL editor.

-- players
create table if not exists public.players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  -- A CACHE, not a record. Facebook and TikTok CDN avatar URLs expire, so this
  -- is rewritten on every sign-in and the UI falls back to an initial-letter
  -- disc whenever the image fails to load.
  avatar_url text,
  -- social provider that was used to authenticate. e.g. 'google', 'facebook',
  -- 'tiktok'. We never store the social id here; auth.users.email is the join
  -- key for email-based providers.
  --
  -- TikTok is the exception. It is not a Supabase provider, so the Edge
  -- Function in supabase/functions/tiktok-auth exchanges the Login Kit code
  -- server-side and creates the auth.users row itself, keyed on a synthetic
  -- address of the form tiktok_<open_id>@tiktok.pusoynow.internal. That open_id
  -- is also stored in auth.users.raw_app_meta_data->>'tiktok_open_id'. The
  -- synthetic address is never shown to the player and never receives mail.
  social_provider text,
  social_handle text,
  created_at timestamptz not null default now()
);

-- games. A "game" is one match of Pusoy Dos between 4 players. It contains
-- multiple "rounds" (full deals). For the vertical slice we play one round
-- per game; multi-round matches can be added by extending the hand_state
-- jsonb with a round index.
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting', -- waiting | active | finished | abandoned
  -- Player slots. null = empty seat. 4 seats total.
  seat_0 uuid references public.players(user_id),
  seat_1 uuid references public.players(user_id),
  seat_2 uuid references public.players(user_id),
  seat_3 uuid references public.players(user_id),
  -- per-player hands are stored separately in player_hands (private).
  -- The public game state (turn, lead combo, finish order) is in hand_state.
  hand_state jsonb not null,
  -- finish order: array of seat indexes in the order they emptied.
  finish_order int[],
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Private per-player hands. Only the owning user can read their own row.
-- The combination of (game_id, user_id) is the primary key.
create table if not exists public.player_hands (
  game_id uuid references public.games(id) on delete cascade,
  user_id uuid references public.players(user_id) on delete cascade,
  cards jsonb not null, -- array of {suit, rank, id}
  primary key (game_id, user_id)
);

-- Head-to-head stats. Aggregated on game completion by a Postgres trigger
-- (see function below). Each row records wins/losses of one user against
-- another.
create table if not exists public.h2h_stats (
  user_id uuid references public.players(user_id) on delete cascade,
  opponent_id uuid references public.players(user_id) on delete cascade,
  wins int not null default 0,
  losses int not null default 0,
  primary key (user_id, opponent_id)
);

-- Global leaderboard (total wins/losses across all opponents).
create table if not exists public.leaderboard (
  user_id uuid primary key references public.players(user_id) on delete cascade,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.player_hands enable row level security;
alter table public.h2h_stats enable row level security;
alter table public.leaderboard enable row level security;

-- players: any authenticated user can read any player profile. They can only
-- insert/update their own row.
create policy "players read all" on public.players for select using (auth.role() = 'authenticated');
create policy "players insert self" on public.players for insert with check (auth.uid() = user_id);
create policy "players update self" on public.players for update using (auth.uid() = user_id);

-- games: any authenticated user can read games. They can create games (insert).
-- They can update a game only if they occupy one of its seats.
create policy "games read all" on public.games for select using (auth.role() = 'authenticated');
create policy "games insert" on public.games for insert with check (auth.role() = 'authenticated');
create policy "games update seat" on public.games for update using (
  auth.uid() in (seat_0, seat_1, seat_2, seat_3)
);

-- player_hands: a user can only read/write their own hand.
create policy "hands read own" on public.player_hands for select using (auth.uid() = user_id);
create policy "hands insert own" on public.player_hands for insert with check (auth.uid() = user_id);
create policy "hands update own" on public.player_hands for update using (auth.uid() = user_id);

-- h2h_stats: any authenticated user can read all. Writes only via trigger
-- (security definer function).
create policy "h2h read all" on public.h2h_stats for select using (auth.role() = 'authenticated');

-- leaderboard: any authenticated user can read. Writes via trigger.
create policy "leaderboard read all" on public.leaderboard for select using (auth.role() = 'authenticated');

-- Trigger function: on game finish, write h2h_stats and leaderboard.
create or replace function public.record_game_finish()
returns trigger
language plpgsql
security definer
as $$
declare
  fin_order int[];
  i int;
  winner uuid;
  loser uuid;
  s int;
begin
  if new.status = 'finished' and (old.status is null or old.status <> 'finished') and new.finish_order is not null then
    fin_order := new.finish_order;
    for i in 1..array_length(fin_order, 1) - 1 loop
      winner := case fin_order[i] when 0 then new.seat_0 when 1 then new.seat_1 when 2 then new.seat_2 when 3 then new.seat_3 end;
      loser := case fin_order[i+1] when 0 then new.seat_0 when 1 then new.seat_1 when 2 then new.seat_2 when 3 then new.seat_3 end;
      if winner is not null and loser is not null then
        -- winner's row: this user beat this opponent
        insert into public.h2h_stats(user_id, opponent_id, wins, losses)
          values(winner, loser, 1, 0)
          on conflict (user_id, opponent_id) do update set wins = public.h2h_stats.wins + 1;
        -- loser's row: this user lost to this opponent
        insert into public.h2h_stats(user_id, opponent_id, wins, losses)
          values(loser, winner, 0, 1)
          on conflict (user_id, opponent_id) do update set losses = public.h2h_stats.losses + 1;
        -- leaderboard
        insert into public.leaderboard(user_id, wins, losses) values(winner, 1, 0)
          on conflict (user_id) do update set wins = public.leaderboard.wins + 1, updated_at = now();
        insert into public.leaderboard(user_id, wins, losses) values(loser, 0, 1)
          on conflict (user_id) do update set losses = public.leaderboard.losses + 1, updated_at = now();
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_game_finish on public.games;
create trigger on_game_finish
  after update on public.games
  for each row execute function public.record_game_finish();

-- Realtime: enable replication on the games table for client subscriptions.
alter publication supabase_realtime add table public.games;
