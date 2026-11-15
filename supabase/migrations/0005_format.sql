-- New workbook format: richer paper details, question difficulty and nature, new id format.
-- Run once, after 0004.

alter table papers add column if not exists language text not null default 'E' check (language in ('E','H'));
alter table papers add column if not exists duration_minutes int;
alter table papers add column if not exists max_marks int;
alter table papers add column if not exists answer_key_source text;
alter table papers add column if not exists answer_key_status text;
alter table papers add column if not exists source_name text;
alter table papers add column if not exists notes text;
alter table papers drop constraint if exists papers_subject_id_year_session_exam_kind_shift_key;
alter table papers drop constraint if exists papers_unique_cycle;
alter table papers add constraint papers_unique_cycle unique (subject_id, year, session, exam_kind, shift, language);

alter table questions add column if not exists difficulty text;
alter table questions add column if not exists nature text;

-- Question id is now the paper code plus the question number, e.g. 80-2025-JUN-E-045.
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
  if qid is distinct from upper(p_paper_id) || '-' || lpad(p_q->>'q_no', 3, '0') then
    raise exception 'question id % does not match paper and question number', qid;
  end if;

  insert into questions (id, paper_id, subject_id, q_no, canonical_id, format, body, options, passage_id,
                         primary_unit_id, primary_topic_id, review_status, is_testable, content_hash,
                         publish_status, source_ref, difficulty, nature, updated_at, updated_by)
  values (qid, p_paper_id, subj, (p_q->>'q_no')::int, nullif(p_q->>'canonical_id',''), p_q->>'format',
          p_q->'body', p_q->'options', nullif(p_q->>'passage_id',''), prim->>'unit', nullif(prim->>'topic',''),
          coalesce(p_q->>'review_status','draft'), (ans->>'status') in ('final','provisional','multiple'),
          md5(p_q::text), p_status, nullif(p_q->>'source_ref',''), nullif(p_q->>'difficulty',''),
          nullif(p_q->>'nature',''), now(), auth.uid())
  on conflict (id) do update set
    paper_id = excluded.paper_id, subject_id = excluded.subject_id, q_no = excluded.q_no,
    canonical_id = excluded.canonical_id, format = excluded.format, body = excluded.body,
    options = excluded.options, passage_id = excluded.passage_id,
    primary_unit_id = excluded.primary_unit_id, primary_topic_id = excluded.primary_topic_id,
    review_status = excluded.review_status, is_testable = excluded.is_testable,
    content_hash = excluded.content_hash, publish_status = excluded.publish_status,
    source_ref = excluded.source_ref, difficulty = excluded.difficulty, nature = excluded.nature,
    updated_at = now(), updated_by = auth.uid();

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

-- Publishing a batch now also saves the extra paper details.
create or replace function admin_publish_batch(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n_pub int := 0; n_err int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from import_batches where id = p_batch and status = 'staged') then
    raise exception 'this batch is not staged';
  end if;

  for r in select data from staged_papers where batch_id = p_batch loop
    insert into papers (id, subject_id, year, session, exam_kind, exam_date, shift, total_questions, language,
                        duration_minutes, max_marks, answer_key_source, answer_key_status, source_name, notes)
    values (r.data->>'id', r.data->>'subject', (r.data->>'year')::int, r.data->>'session',
            coalesce(nullif(r.data->>'exam_kind',''), 'regular'), nullif(r.data->>'exam_date','')::date,
            coalesce((r.data->>'shift')::int, 1), (r.data->>'total_questions')::int,
            coalesce(nullif(r.data->>'language',''), 'E'), nullif(r.data->>'duration_minutes','')::int,
            nullif(r.data->>'max_marks','')::int, nullif(r.data->>'answer_key_source',''),
            nullif(r.data->>'answer_key_status',''), nullif(r.data->>'source_name',''), nullif(r.data->>'notes',''))
    on conflict (id) do update set subject_id = excluded.subject_id, year = excluded.year,
      session = excluded.session, exam_kind = excluded.exam_kind, exam_date = excluded.exam_date,
      shift = excluded.shift, total_questions = excluded.total_questions, language = excluded.language,
      duration_minutes = excluded.duration_minutes, max_marks = excluded.max_marks,
      answer_key_source = excluded.answer_key_source, answer_key_status = excluded.answer_key_status,
      source_name = excluded.source_name, notes = excluded.notes;
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
