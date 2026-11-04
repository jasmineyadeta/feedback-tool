-- PRD §15 success metrics as read-only views (SPEC §8 M6).
-- Only the service role can read them: they aggregate across all owners. They never expose
-- comment text, transcripts, emails or URLs — only counts, rates and durations.
-- Not measurable from data and therefore absent: "opened the link" (D20, not tracked), self-reported
-- usefulness/changes, support needed, PDF render success (client-only), business metrics (later).

-- One row per invite: the reviewer funnel.
create view public.metrics_reviewer_funnel as
select
  i.id as invite_id,
  i.review_id,
  r.artifact_type,
  r.render_mode,
  i.status,
  i.created_at as invited_at,
  fc.first_comment_at,
  i.submitted_at,
  extract(epoch from (fc.first_comment_at - i.created_at))::int as secs_invite_to_first_comment,
  extract(epoch from (i.submitted_at - fc.first_comment_at))::int as secs_first_comment_to_submit,
  coalesce(cc.saved, 0) as saved_comments,
  coalesce(cc.voice, 0) as voice_comments,
  coalesce(cc.voice_edited, 0) as voice_comments_edited,
  coalesce(cc.addressed, 0) as addressed_comments
from public.reviewer_invites i
join public.reviews r on r.id = i.review_id
left join lateral (
  select min(e.created_at) as first_comment_at
  from public.review_events e
  where e.invite_id = i.id and e.type = 'first_comment_saved'
) fc on true
left join lateral (
  select
    count(*) filter (where c.state = 'saved') as saved,
    count(*) filter (where c.state = 'saved' and c.transcript_original is not null) as voice,
    count(*) filter (
      where c.state = 'saved' and c.transcript_original is not null
        -- The proposal only trims spaces and capitalises the first letter (resolve.ts cleanText).
        and lower(btrim(regexp_replace(c.text, '\s+', ' ', 'g')))
          is distinct from lower(btrim(regexp_replace(c.transcript_original, '\s+', ' ', 'g')))
    ) as voice_edited,
    count(*) filter (where c.addressed_at is not null) as addressed
  from public.comments c
  where c.invite_id = i.id and not c.general
) cc on true;

-- Talk-through: transcription success and latency, AI anchor outcomes.
create view public.metrics_recordings as
select
  rec.id as recording_id,
  rec.invite_id,
  rec.resolver_status,
  rec.attempts,
  rec.duration_ms,
  extract(epoch from (ev.created_at - rec.created_at))::int as secs_upload_to_transcribed,
  coalesce((ev.meta ->> 'comments')::int, 0) as proposed_comments,
  coalesce((ev.meta ->> 'aiSegments')::int, 0) as ai_segments
from public.recordings rec
left join lateral (
  select e.created_at, e.meta
  from public.review_events e
  where e.invite_id = rec.invite_id and e.type = 'recording_transcribed'
    and e.created_at >= rec.created_at
  order by e.created_at
  limit 1
) ev on true;

-- Websites: render outcome by platform (from the health report, no URLs).
create view public.metrics_site_render as
select
  coalesce(r.health_report ->> 'platform', 'unknown') as platform,
  count(*) as reviews,
  count(*) filter (where r.render_mode = 'live') as live,
  count(*) filter (where r.render_mode = 'screenshot') as screenshot,
  count(*) filter (where r.health_report ->> 'reason' = 'overlay-timeout') as overlay_timeout,
  count(*) filter (where r.health_report ->> 'reason' = 'headless-failed') as headless_failed
from public.reviews r
where r.artifact_type = 'website'
group by 1;

-- Headline numbers in one row.
create view public.metrics_summary as
with f as (select * from public.metrics_reviewer_funnel),
owners as (
  select owner_id, count(*) as reviews from public.reviews group by owner_id
),
ready as (
  -- Reviews with at least one submitted invite, and whether the owner opened the feedback after.
  select r.id,
    exists (
      select 1 from public.review_events e
      where e.review_id = r.id and e.type = 'owner_viewed_feedback'
    ) as opened
  from public.reviews r
  where exists (
    select 1 from public.reviewer_invites i where i.review_id = r.id and i.status = 'submitted'
  )
),
repeat_reviewers as (
  select count(*) as n from (
    select lower(reviewer_email) from public.reviewer_invites
    where reviewer_email is not null
    group by 1 having count(distinct review_id) > 1
  ) x
)
select
  (select count(*) from public.reviews) as reviews,
  (select count(*) from f) as invites,
  (select count(*) from f where status in ('in_progress', 'submitted')) as invites_started,
  (select count(*) from f where status = 'submitted') as invites_submitted,
  round(
    (select count(*) from f where status = 'submitted')::numeric
    / nullif((select count(*) from f where status in ('in_progress', 'submitted')), 0), 3
  ) as submit_rate_after_start,
  (select percentile_cont(0.5) within group (order by secs_invite_to_first_comment)
     from f where secs_invite_to_first_comment is not null) as median_secs_to_first_comment,
  (select percentile_cont(0.5) within group (order by secs_first_comment_to_submit)
     from f where secs_first_comment_to_submit is not null) as median_secs_first_comment_to_submit,
  (select round(avg(saved_comments), 2) from f where status = 'submitted') as avg_comments_per_submitted,
  round(
    (select sum(voice_comments_edited) from f)::numeric / nullif((select sum(voice_comments) from f), 0), 3
  ) as voice_correction_rate,
  round(
    (select count(*) from public.recordings where resolver_status = 'ok')::numeric
    / nullif((select count(*) from public.recordings where resolver_status in ('ok', 'failed')), 0), 3
  ) as transcription_success_rate,
  (select percentile_cont(0.5) within group (order by secs_upload_to_transcribed)
     from public.metrics_recordings where secs_upload_to_transcribed is not null)
    as median_secs_to_transcribe,
  (select count(*) from public.review_events where type = 'ai_anchor_rejected') as ai_anchors_rejected,
  (select count(*) from public.review_events where type = 'render_fallback') as render_fallbacks,
  (select count(*) from ready) as reviews_with_feedback,
  round((select count(*) from ready where opened)::numeric / nullif((select count(*) from ready), 0), 3)
    as owner_open_rate,
  (select count(*) from owners where reviews > 1) as owners_with_repeat_reviews,
  (select n from repeat_reviewers) as repeat_reviewers,
  round(
    (select count(*) from f where status = 'submitted')::numeric
    / nullif((select count(distinct owner_id) from public.reviews), 0), 3
  ) as north_star_submitted_per_owner;

revoke all on public.metrics_reviewer_funnel, public.metrics_recordings,
  public.metrics_site_render, public.metrics_summary from public, anon, authenticated;
grant select on public.metrics_reviewer_funnel, public.metrics_recordings,
  public.metrics_site_render, public.metrics_summary to service_role;
