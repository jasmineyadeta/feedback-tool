-- Tone of a comment for the owner (Jas, 2026-11-06): action (a problem or suggestion), praise, or
-- note (neutral). Set by the local AI after submit, or by the owner. Never shown to reviewers and
-- never changes the reviewer's words.
create type comment_tone as enum ('action', 'praise', 'note');
alter table comments
  add column tone comment_tone,
  add column tone_source text check (tone_source in ('ai', 'owner'));
-- The owner may correct the tone (column grant, like addressed_at); reviewers never see it.
grant update (tone, tone_source) on public.comments to authenticated;
