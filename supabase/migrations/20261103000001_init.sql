-- Contextual Feedback MVP — initial schema (SPEC §2).
-- Forward-only. Never edit after merge; add a new migration instead.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type artifact_type as enum ('website', 'pdf');
create type render_mode as enum ('live', 'screenshot');
create type invite_status as enum ('not_started', 'in_progress', 'submitted', 'revoked');
create type resolver_status as enum ('pending', 'ok', 'rejected', 'failed');
create type anchor_source as enum ('tap', 'ai', 'viewport', 'manual', 'owner_moved');
create type comment_state as enum ('draft', 'saved');
create type review_event_type as enum (
  'review_created', 'invite_created', 'first_comment_saved', 'recording_transcribed',
  'ai_anchor_rejected', 'submitted', 'owner_viewed_feedback', 'comment_addressed', 'render_fallback'
);

-- ---------------------------------------------------------------- tables
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  artifact_type artifact_type not null,
  site_url text check (site_url is null or char_length(site_url) <= 2048),
  site_etld1 text check (site_etld1 is null or char_length(site_etld1) <= 253),
  pdf_file_key text,
  pdf_page_count int check (pdf_page_count is null or pdf_page_count between 1 and 30),
  title text not null default '' check (char_length(title) <= 200),
  context text not null default '' check (char_length(context) <= 1000),
  render_mode render_mode,
  health_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reviews_artifact_shape check (
    (artifact_type = 'website' and site_url is not null and site_etld1 is not null)
    or (artifact_type = 'pdf')
  )
);
create index reviews_owner_idx on public.reviews (owner_id) where deleted_at is null;

create table public.reviewer_invites (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  name_hint text not null default '' check (char_length(name_hint) <= 120),
  reviewer_name text check (reviewer_name is null or char_length(reviewer_name) <= 120),
  reviewer_email text check (reviewer_email is null or char_length(reviewer_email) <= 254),
  status invite_status not null default 'not_started',
  audio_consent_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index reviewer_invites_review_idx on public.reviewer_invites (review_id);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.reviewer_invites (id) on delete cascade,
  audio_file_key text,
  mime_type text not null,
  duration_ms int not null default 0 check (duration_ms between 0 and 600000),
  transcript_text text,
  transcript_words jsonb,
  timeline jsonb,
  resolver_status resolver_status not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz,
  client_id text, -- idempotency key from the browser's IndexedDB buffer
  delete_audio_after timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  unique (invite_id, client_id)
);
create index recordings_invite_idx on public.recordings (invite_id);
create index recordings_purge_idx on public.recordings (delete_audio_after) where audio_file_key is not null;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.reviewer_invites (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete set null,
  client_id text, -- idempotency key (IndexedDB buffer)
  page_path text check (page_path is null or char_length(page_path) <= 2048),
  pdf_page int,
  text text not null check (char_length(text) <= 5000),
  transcript_original text,
  span_start_ms int,
  span_end_ms int,
  anchor jsonb,
  anchor_source anchor_source,
  anchor_confidence numeric check (anchor_confidence is null or anchor_confidence between 0 and 1),
  screenshot_file_key text,
  state comment_state not null default 'draft',
  addressed_at timestamptz,
  general boolean not null default false,
  sort_key double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invite_id, client_id)
);
create index comments_review_idx on public.comments (review_id);
create index comments_invite_idx on public.comments (invite_id);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  invite_id uuid references public.reviewer_invites (id) on delete cascade,
  type review_event_type not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index review_events_review_idx on public.review_events (review_id, type);

-- Token-bucket rate limits (SPEC §7) — Postgres-backed, no extra vendor.
create table public.rate_limits (
  key text primary key,
  tokens double precision not null,
  updated_at timestamptz not null default now()
);

-- Storage objects that failed immediate deletion; retried by the jobs runner.
create table public.storage_deletions (
  id bigserial primary key,
  bucket text not null,
  path text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- rate limit fn
-- Atomically take one token. capacity tokens refill over refill_seconds.
create or replace function public.take_token(p_key text, p_capacity int, p_refill_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  rate double precision := p_capacity::double precision / greatest(p_refill_seconds, 1);
  cur double precision;
begin
  insert into public.rate_limits as rl (key, tokens, updated_at)
  values (p_key, p_capacity, now())
  on conflict (key) do update
    set tokens = least(p_capacity,
                       rl.tokens + extract(epoch from (now() - rl.updated_at)) * rate),
        updated_at = now()
  returning tokens into cur;
  if cur >= 1 then
    update public.rate_limits set tokens = cur - 1 where key = p_key;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.take_token(text, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
-- Owners read/write their own data via RLS. Reviewers never hit RLS: their access
-- goes through API routes using the service role with explicit invite_id scoping (SPEC §2).
alter table public.reviews enable row level security;
alter table public.reviewer_invites enable row level security;
alter table public.recordings enable row level security;
alter table public.comments enable row level security;
alter table public.review_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.storage_deletions enable row level security;

create policy reviews_owner_select on public.reviews for select to authenticated
  using (owner_id = auth.uid() and deleted_at is null);
create policy reviews_owner_insert on public.reviews for insert to authenticated
  with check (owner_id = auth.uid());
create policy reviews_owner_update on public.reviews for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy reviews_owner_delete on public.reviews for delete to authenticated
  using (owner_id = auth.uid());

create or replace function public.owns_review(p_review uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reviews r
                 where r.id = p_review and r.owner_id = auth.uid() and r.deleted_at is null);
$$;

create policy invites_owner_select on public.reviewer_invites for select to authenticated
  using (public.owns_review(review_id));
create policy invites_owner_insert on public.reviewer_invites for insert to authenticated
  with check (public.owns_review(review_id));
create policy invites_owner_update on public.reviewer_invites for update to authenticated
  using (public.owns_review(review_id)) with check (public.owns_review(review_id));
create policy invites_owner_delete on public.reviewer_invites for delete to authenticated
  using (public.owns_review(review_id));

-- D20: candidate sees comments only after the reviewer submits.
create policy comments_owner_select on public.comments for select to authenticated
  using (public.owns_review(review_id) and exists (
    select 1 from public.reviewer_invites i where i.id = invite_id and i.status = 'submitted'));
-- Owner may only update addressed_at / anchor (owner_moved); enforced by column grants below.
create policy comments_owner_update on public.comments for update to authenticated
  using (public.owns_review(review_id)) with check (public.owns_review(review_id));

create policy recordings_owner_select on public.recordings for select to authenticated
  using (exists (select 1 from public.reviewer_invites i
                 where i.id = invite_id and i.status = 'submitted' and public.owns_review(i.review_id)));

create policy events_owner_select on public.review_events for select to authenticated
  using (public.owns_review(review_id));

-- Column-level privileges: owners cannot rewrite reviewer words.
revoke update on public.comments from authenticated;
grant update (addressed_at, anchor, anchor_source) on public.comments to authenticated;
revoke all on public.rate_limits, public.storage_deletions from anon, authenticated;
revoke all on public.reviews, public.reviewer_invites, public.recordings, public.comments, public.review_events from anon;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('pdfs', 'pdfs', false, 15728640),
  ('audio', 'audio', false, 26214400),
  ('screenshots', 'screenshots', false, 20971520)
on conflict (id) do nothing;
-- No storage RLS policies for anon/authenticated: all object access is via
-- short-lived signed URLs minted by API routes after authorization.
