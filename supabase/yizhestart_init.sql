-- Run once in the existing project's SQL Editor. No existing objects are replaced.
-- A name collision aborts the whole transaction; do not drop existing objects to retry.
begin;

create table public.yizhestart_documents (
  user_id uuid default auth.uid() constraint yizhestart_documents_pkey primary key,
  payload jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint yizhestart_documents_revision_check check (revision > 0),
  constraint yizhestart_documents_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and jsonb_typeof(payload -> 'nodes') is not distinct from 'array'
    and jsonb_typeof(payload -> 'preferences') is not distinct from 'object'
    and octet_length(payload::text) <= 10485760
  )
);

alter table public.yizhestart_documents enable row level security;
revoke all on table public.yizhestart_documents from public, anon, authenticated;
grant select on table public.yizhestart_documents to authenticated;
create policy yizhestart_documents_select_own
  on public.yizhestart_documents for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only this function writes documents. Identity comes from the verified JWT,
-- never from a client-supplied user ID. A stale revision cannot overwrite data.
create function public.yizhestart_save_document(
  yizhestart_payload jsonb,
  yizhestart_expected_revision integer
)
returns setof public.yizhestart_documents
language plpgsql
security definer
set search_path = ''
as $yizhestart_body$
declare
  yizhestart_user_id uuid := auth.uid();
  yizhestart_saved public.yizhestart_documents;
begin
  if yizhestart_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if yizhestart_expected_revision is null or yizhestart_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if yizhestart_expected_revision = 0 then
    insert into public.yizhestart_documents (user_id, payload)
    values (yizhestart_user_id, yizhestart_payload)
    on conflict on constraint yizhestart_documents_pkey do nothing
    returning * into yizhestart_saved;
  else
    update public.yizhestart_documents
    set payload = yizhestart_payload, revision = revision + 1, updated_at = now()
    where user_id = yizhestart_user_id and revision = yizhestart_expected_revision
    returning * into yizhestart_saved;
  end if;
  if yizhestart_saved.user_id is null then
    raise exception 'Document changed on another device' using errcode = '40001';
  end if;
  return next yizhestart_saved;
end;
$yizhestart_body$;

revoke all on function public.yizhestart_save_document(jsonb, integer) from public, anon, authenticated;
grant execute on function public.yizhestart_save_document(jsonb, integer) to authenticated;

commit;
