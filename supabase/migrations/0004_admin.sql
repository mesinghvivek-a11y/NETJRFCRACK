-- Admin portal: roles, publish status, staging tables, admin functions.
-- Run once, after 0001 to 0003.

-- 1. Roles. Signed-in users can only ever change their display name, never role or plan.
alter table profiles add column if not exists role text not null default 'user' check (role in ('user','admin'));
revoke update on profiles from authenticated, anon;
grant update (display_name) on profiles to authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' from profiles p where p.id = auth.uid()), false);
$$;
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- 2. Publish status: students only see published questions.
alter table questions add column if not exists publish_status text not null default 'published'
  check (publish_status in ('draft','published'));
alter table questions add column if not exists source_ref text;
alter table questions add column if not exists updated_by uuid references auth.users on delete set null;
create index if not exists questions_publish_idx on questions (publish_status);

drop policy if exists ref_read on questions;
create policy q_read on questions for select to authenticated
  using (publish_status = 'published' or is_admin());
drop policy if exists ref_read on question_tags;
create policy qt_read on question_tags for select to authenticated
  using (exists (select 1 from questions q where q.id = question_tags.question_id));

create policy keys_admin on question_keys for select to authenticated using (is_admin());
create policy reports_admin on error_reports for all to authenticated using (is_admin()) with check (is_admin());

-- 3. Staging area for Excel uploads (nothing here is visible to students).
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  filename text,
  created_at timestamptz not null default now(),
  status text not null default 'staged' check (status in ('staged','published','discarded')),
  summary jsonb not null default '{}'
);
create table staged_papers (
  batch_id uuid not null references import_batches on delete cascade,
  paper_id text not null,
  data jsonb not null,
  primary key (batch_id, paper_id)
);
create table staged_passages (
  batch_id uuid not null references import_batches on delete cascade,
  passage_id text not null,
  paper_id text not null,
  body jsonb not null,
  primary key (batch_id, passage_id)
);
create table staged_questions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches on delete cascade,
  paper_id text not null,
  q_no int not null,
  question_id text not null,
  data jsonb not null,
  state text not null check (state in ('new','changed','error')),
  is_update boolean not null default false,
  changed text[] not null default '{}',
  issues jsonb not null default '[]',
  unique (batch_id, question_id)
);
create index on staged_questions (batch_id, paper_id, q_no);

alter table import_batches enable row level security;
alter table staged_papers enable row level security;
alter table staged_passages enable row level security;
alter table staged_questions enable row level security;
create policy admin_all on import_batches for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on staged_papers for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on staged_passages for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on staged_questions for all to authenticated using (is_admin()) with check (is_admin());

-- 4. Save one question (live tables). Used by the editor and by batch publish.
create or replace function admin_upsert_question(p_paper_id text, p_q jsonb, p_status text default 'draft')
returns text
language plpgsql security definer set search_path = public as $$
declare
  qid text := p_q->>'id';
  subj text;
  prim jsonb := p_q->'primary';
  ans jsonb := p_q->'answer';
  ex jsonb := p_q->'explanation';
  tg jsonb;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('draft','published') then raise exception 'bad status %', p_status; end if;
  select subject_id into subj from papers where id = p_paper_id;
  if subj is null then raise exception 'paper % not found', p_paper_id; end if;
  if qid is distinct from upper(p_paper_id) || '-Q' || lpad(p_q->>'q_no', 3, '0') then
    raise exception 'question id % does not match paper and question number', qid;
  end if;

  insert into questions (id, paper_id, subject_id, q_no, canonical_id, format, body, options, passage_id,
                         primary_unit_id, primary_topic_id, review_status, is_testable, content_hash,
                         publish_status, source_ref, updated_at, updated_by)
  values (qid, p_paper_id, subj, (p_q->>'q_no')::int, nullif(p_q->>'canonical_id',''), p_q->>'format',
          p_q->'body', p_q->'options', nullif(p_q->>'passage_id',''), prim->>'unit', nullif(prim->>'topic',''),
          coalesce(p_q->>'review_status','draft'), (ans->>'status') in ('final','provisional','multiple'),
          md5(p_q::text), p_status, nullif(p_q->>'source_ref',''), now(), auth.uid())
  on conflict (id) do update set
    paper_id = excluded.paper_id, subject_id = excluded.subject_id, q_no = excluded.q_no,
    canonical_id = excluded.canonical_id, format = excluded.format, body = excluded.body,
    options = excluded.options, passage_id = excluded.passage_id,
    primary_unit_id = excluded.primary_unit_id, primary_topic_id = excluded.primary_topic_id,
    review_status = excluded.review_status, is_testable = excluded.is_testable,
    content_hash = excluded.content_hash, publish_status = excluded.publish_status,
    source_ref = excluded.source_ref, updated_at = now(), updated_by = auth.uid();

  delete from question_tags where question_id = qid;
  insert into question_tags (question_id, unit_id, topic_id, is_primary)
  values (qid, prim->>'unit', nullif(prim->>'topic',''), true);
  for tg in select e from jsonb_array_elements(coalesce(p_q->'tags', '[]'::jsonb)) as e loop
    insert into question_tags (question_id, unit_id, topic_id, is_primary)
    values (qid, tg->>'unit', nullif(tg->>'topic',''), false)
    on conflict do nothing;
  end loop;

  insert into question_keys (question_id, correct_keys, answer_status, key_source, explanation, explanation_status)
  values (
    qid,
    array(select jsonb_array_elements_text(coalesce(ans->'correct', '[]'::jsonb))),
    coalesce(ans->>'status', 'final'),
    nullif(ans->>'source',''),
    case when ex is null or ex = 'null'::jsonb then null
         else jsonb_build_object('summary', ex->'summary', 'options', ex->'options',
                                 'references', coalesce(ex->'references', '[]'::jsonb)) end,
    case when ex is null or ex = 'null'::jsonb then 'none' else coalesce(ex->>'status', 'draft') end
  )
  on conflict (question_id) do update set
    correct_keys = excluded.correct_keys, answer_status = excluded.answer_status,
    key_source = excluded.key_source, explanation = excluded.explanation,
    explanation_status = excluded.explanation_status;

  return qid;
end $$;

-- 5. Publish a staged batch: papers, passages, then every new or changed question without errors.
create or replace function admin_publish_batch(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n_pub int := 0; n_err int; n_unchanged int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from import_batches where id = p_batch and status = 'staged') then
    raise exception 'this batch is not staged';
  end if;

  for r in select data from staged_papers where batch_id = p_batch loop
    insert into papers (id, subject_id, year, session, exam_kind, exam_date, shift, total_questions)
    values (r.data->>'id', r.data->>'subject', (r.data->>'year')::int, r.data->>'session',
            coalesce(nullif(r.data->>'exam_kind',''), 'regular'), nullif(r.data->>'exam_date','')::date,
            coalesce((r.data->>'shift')::int, 1), (r.data->>'total_questions')::int)
    on conflict (id) do update set subject_id = excluded.subject_id, year = excluded.year,
      session = excluded.session, exam_kind = excluded.exam_kind, exam_date = excluded.exam_date,
      shift = excluded.shift, total_questions = excluded.total_questions;
  end loop;

  for r in select passage_id, paper_id, body from staged_passages where batch_id = p_batch loop
    insert into passages (id, paper_id, body) values (r.passage_id, r.paper_id, r.body)
    on conflict (id) do update set paper_id = excluded.paper_id, body = excluded.body;
  end loop;

  for r in select paper_id, data from staged_questions
            where batch_id = p_batch and state in ('new','changed') order by paper_id, q_no loop
    perform admin_upsert_question(r.paper_id, r.data, 'published');
    n_pub := n_pub + 1;
  end loop;

  select count(*) into n_err from staged_questions where batch_id = p_batch and state = 'error';
  update import_batches
     set status = 'published',
         summary = summary || jsonb_build_object('published', n_pub, 'skipped_errors', n_err)
   where id = p_batch;
  return jsonb_build_object('published', n_pub, 'skipped_errors', n_err);
end $$;

grant execute on function admin_upsert_question(text, jsonb, text) to authenticated;
grant execute on function admin_publish_batch(uuid) to authenticated;
revoke execute on function admin_upsert_question(text, jsonb, text), admin_publish_batch(uuid) from public, anon;

-- 6. Student-facing functions now respect publish status.
create or replace function reveal_answer(p_question_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not exists (select 1 from questions q
                  where q.id = p_question_id and (q.publish_status = 'published' or is_admin())) then
    return null;
  end if;
  return (select to_jsonb(k) - 'question_id' from question_keys k where k.question_id = p_question_id);
end $$;

create or replace function start_attempt(p_subject_id text, p_question_ids text[], p_scope jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare ids text[]; n int; a attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select array_agg(q.id order by array_position(p_question_ids, q.id)) into ids
    from questions q
   where q.id = any(p_question_ids) and q.is_testable and q.publish_status = 'published'
     and q.subject_id = p_subject_id;
  n := coalesce(cardinality(ids), 0);
  if n = 0 then raise exception 'no testable questions in selection'; end if;
  insert into attempts (user_id, subject_id, scope, question_ids, deadline_at, total_marks)
  values (auth.uid(), p_subject_id, p_scope, ids, now() + make_interval(secs => n * 72), n * 2)
  returning * into a;
  insert into attempt_responses (attempt_id, question_id, position)
    select a.id, x.id, x.ord - 1 from unnest(ids) with ordinality as x(id, ord);
  return jsonb_build_object('attempt_id', a.id, 'deadline_at', a.deadline_at,
                            'question_ids', a.question_ids, 'total_marks', a.total_marks);
end $$;

create or replace view stats_topic_year as
select q.subject_id, p.year, q.primary_unit_id as unit_id, q.primary_topic_id as topic_id, count(*)::int as n
  from questions q join papers p on p.id = q.paper_id
 where (q.canonical_id is null or q.canonical_id = q.id) and q.publish_status = 'published'
 group by 1, 2, 3, 4;

-- 7. Progress per paper for the admin dashboard.
create or replace view admin_paper_progress with (security_invoker = true) as
select p.id as paper_id, p.subject_id, p.year, p.session, p.exam_kind, p.shift, p.total_questions,
       count(q.id) filter (where q.publish_status = 'published')::int as published,
       count(q.id) filter (where q.publish_status = 'draft')::int as drafts,
       count(q.id) filter (where q.review_status = 'verified')::int as verified,
       count(k.question_id) filter (where k.explanation_status = 'none')::int as no_explanation
  from papers p
  left join questions q on q.paper_id = p.id
  left join question_keys k on k.question_id = q.id
 group by p.id;
revoke all on admin_paper_progress from anon;

-- 8. Admins can upload question images.
create policy "admin insert question-media" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-media' and public.is_admin());
create policy "admin update question-media" on storage.objects for update to authenticated
  using (bucket_id = 'question-media' and public.is_admin())
  with check (bucket_id = 'question-media' and public.is_admin());
create policy "admin delete question-media" on storage.objects for delete to authenticated
  using (bucket_id = 'question-media' and public.is_admin());
