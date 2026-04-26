create table if not exists public.daily_signals (
  id bigserial primary key,
  trade_date date not null,
  us_symbol text not null,
  us_name text,
  us_ko_name text,
  us_price numeric,
  us_change_pct numeric,
  us_sector text,
  us_sub_sector text,
  kr_code text not null,
  kr_name text not null,
  kr_market text,
  kr_groups text[] default '{}',
  relation text,
  corr text,
  confidence numeric default 0.5,
  expected_direction text default 'up',
  reason text,
  created_at timestamptz not null default now(),
  unique (trade_date, us_symbol, kr_code)
);

create table if not exists public.intraday_snapshots (
  id bigserial primary key,
  trade_date date not null,
  captured_at timestamptz not null default now(),
  kr_code text not null,
  kr_name text,
  price numeric not null,
  change_pct numeric,
  source text,
  session text default 'regular',
  created_at timestamptz not null default now()
);

create index if not exists intraday_snapshots_trade_code_idx
  on public.intraday_snapshots (trade_date, kr_code, captured_at);

create table if not exists public.intraday_snapshots_archive (
  like public.intraday_snapshots including all
);

create table if not exists public.daily_results (
  id bigserial primary key,
  trade_date date not null,
  kr_code text not null,
  kr_name text,
  first_price numeric,
  last_price numeric,
  high_price numeric,
  low_price numeric,
  first_pct numeric,
  last_pct numeric,
  high_pct numeric,
  low_pct numeric,
  max_reaction_pct numeric,
  drawdown_from_high_pct numeric,
  retention_pct numeric,
  grade text,
  snapshot_count integer default 0,
  updated_at timestamptz not null default now(),
  unique (trade_date, kr_code)
);

create table if not exists public.tracker_runs (
  id bigserial primary key,
  run_type text not null,
  trade_date date,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.daily_signals enable row level security;
alter table public.intraday_snapshots enable row level security;
alter table public.intraday_snapshots_archive enable row level security;
alter table public.daily_results enable row level security;
alter table public.tracker_runs enable row level security;

drop policy if exists "public read daily signals" on public.daily_signals;
create policy "public read daily signals" on public.daily_signals for select using (true);

drop policy if exists "public read intraday snapshots" on public.intraday_snapshots;
create policy "public read intraday snapshots" on public.intraday_snapshots for select using (true);

drop policy if exists "public read intraday snapshots archive" on public.intraday_snapshots_archive;
create policy "public read intraday snapshots archive" on public.intraday_snapshots_archive for select using (true);

drop policy if exists "public read daily results" on public.daily_results;
create policy "public read daily results" on public.daily_results for select using (true);

drop policy if exists "public read tracker runs" on public.tracker_runs;
create policy "public read tracker runs" on public.tracker_runs for select using (true);
