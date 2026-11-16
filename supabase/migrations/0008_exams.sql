-- Exams as separate papers (2024 Jun S1, 2024 Jun S2, 2024 Jun S2 re-exam...), automatic paper codes,
-- delete and bulk functions, search and sort for the question lists.
-- Run once, after 0007. Safe to run again.

-- 1. Renaming a paper code must carry its questions with it.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
      from pg_constraint c
     where c.contype = 'f'
       and ((c.conrelid in ('questions'::regclass, 'passages'::regclass) and c.confrelid = 'papers'::regclass)
         or (c.conrelid in ('question_tags'::regclass, 'question_keys'::regclass, 'bookmarks'::regclass,
                            'error_reports'::regclass, 'attempt_responses'::regclass)
             and c.confrelid = 'questions'::regclass))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table questions add constraint questions_paper_id_fkey foreign key (paper_id) references papers (id) on update cascade on delete cascade;
alter table passages add constraint passages_paper_id_fkey foreign key (paper_id) references papers (id) on update cascade on delete cascade;
alter table question_tags add constraint question_tags_question_id_fkey foreign key (question_id) references questions (id) on update cascade on delete cascade;
alter table question_keys add constraint question_keys_question_id_fkey foreign key (question_id) references questions (id) on update cascade on delete cascade;
alter table bookmarks add constraint bookmarks_question_id_fkey foreign key (question_id) references questions (id) on update cascade on delete cascade;
alter table error_reports add constraint error_reports_question_id_fkey foreign key (question_id) references questions (id) on update cascade on delete cascade;
alter table attempt_responses add constraint attempt_responses_question_id_fkey foreign key (question_id) references questions (id) on update cascade;

-- 2. Paper codes. A cycle (subject, year, session, language) with more than one paper gets -S<shift> on each;
--    a re-exam adds -R. A cycle with one paper has no suffix.
create or replace function paper_code_for(p_subject text, p_year int, p_session text, p_lang text, p_shift int, p_kind text, p_multi boolean)
returns text language sql stable set search_path = public as $$
  select s.nta_code || '-' || p_year || '-' || (case when p_session = 'june' then 'JUN' else 'DEC' end) || '-' || p_lang
         || (case when p_multi then '-S' || p_shift else '' end)
         || (case when p_kind = 'reexam' then '-R' else '' end)
    from subjects s where s.id = p_subject and s.nta_code is not null
$$;

-- Internal: rename a paper and everything that points at it (questions, tags, answers, bookmarks, tests).
create or replace function recode_paper(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare pat text;
begin
  if p_old = p_new then return; end if;
  if not exists (select 1 from papers where id = p_old) then raise exception 'Paper % not found.', p_old; end if;
  if exists (select 1 from papers where id = p_new) then raise exception 'Paper code % already exists.', p_new; end if;
  pat := '^' || p_old || '-[0-9]{3}$';
  update papers set id = p_new where id = p_old;
  update questions set id = p_new || substr(id, length(p_old) + 1) where paper_id = p_new;
  update questions set canonical_id = p_new || substr(canonical_id, length(p_old) + 1) where canonical_id ~ pat;
  update attempts
     set question_ids = array(select case when x ~ pat then p_new || substr(x, length(p_old) + 1) else x end
                                from unnest(question_ids) with ordinality as u(x, ord) order by ord)
   where exists (select 1 from unnest(question_ids) y where y ~ pat);
end $$;
revoke execute on function recode_paper(text, text) from public, anon, authenticated;

-- Internal: give every paper the code its cycle calls for. Returns how many were renamed.
create or replace function normalize_codes_internal(p_subject text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; tgt text;
begin
  for r in
    select p.id, p.subject_id, p.year, p.session, p.language, p.shift, p.exam_kind,
           count(*) over (partition by p.subject_id, p.year, p.session, p.language) as sz
      from papers p
     where (p_subject is null or p.subject_id = p_subject)
     order by p.year, p.session, p.shift
  loop
    tgt := paper_code_for(r.subject_id, r.year, r.session, r.language, r.shift, r.exam_kind, r.sz > 1);
    if tgt is not null and tgt <> r.id then
      perform recode_paper(r.id, tgt);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function normalize_codes_internal(text) from public, anon, authenticated;

create or replace function admin_normalize_codes(p_subject text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object('renamed', normalize_codes_internal(p_subject));
end $$;
grant execute on function admin_normalize_codes(text) to authenticated;
revoke execute on function admin_normalize_codes(text) from public, anon;

-- One-time tidy-up of what is already uploaded: give a re-exam that shares a shift number the next free number,
-- then apply the code rule everywhere.
do $$
begin
  begin
    with c as (
      select id,
             count(*) over (partition by subject_id, year, session, language, shift) as same_shift,
             max(shift) over (partition by subject_id, year, session, language) as mx,
             row_number() over (partition by subject_id, year, session, language, shift
                                order by (exam_kind = 'reexam'), id) as rn
        from papers)
    update papers p set shift = c.mx + c.rn - 1 from c where p.id = c.id and c.same_shift > 1 and c.rn > 1;
  exception when unique_violation then
    raise notice 'Shift numbers were left as they are.';
  end;
  perform normalize_codes_internal(null);
end $$;

-- 3. Deleting.
create or replace function admin_delete_questions(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  delete from attempt_responses where question_id = any (p_ids);
  delete from questions where id = any (p_ids);
  get diagnostics n = row_count;
  return jsonb_build_object('deleted', n);
end $$;

create or replace function admin_delete_paper(p_paper text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare subj text; qn int; att int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select subject_id into subj from papers where id = p_paper;
  if subj is null then raise exception 'Paper % not found.', p_paper; end if;
  select count(*) into qn from questions where paper_id = p_paper;
  select count(*) into att from attempts a
   where exists (select 1 from unnest(a.question_ids) x where x in (select id from questions where paper_id = p_paper));
  delete from attempt_responses where question_id in (select id from questions where paper_id = p_paper);
  delete from papers where id = p_paper;
  perform normalize_codes_internal(subj);
  return jsonb_build_object('questions_deleted', qn, 'attempts_touched', att);
end $$;

-- 4. Bulk changes from the question list.
create or replace function admin_bulk_questions(p_ids text[], p_action text, p_unit text default null, p_topic text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_action = 'publish' then
    update questions set publish_status = 'published', updated_at = now(), updated_by = auth.uid() where id = any (p_ids);
    get diagnostics n = row_count;
  elsif p_action = 'unpublish' then
    update questions set publish_status = 'draft', updated_at = now(), updated_by = auth.uid() where id = any (p_ids);
    get diagnostics n = row_count;
  elsif p_action = 'verify' then
    update questions set review_status = 'verified', updated_at = now(), updated_by = auth.uid() where id = any (p_ids);
    get diagnostics n = row_count;
  elsif p_action = 'unverify' then
    update questions set review_status = 'draft', updated_at = now(), updated_by = auth.uid() where id = any (p_ids);
    get diagnostics n = row_count;
  elsif p_action = 'set_topic' then
    if p_unit is null then raise exception 'Choose a unit.'; end if;
    if p_topic is not null and not exists (select 1 from topics where id = p_topic and unit_id = p_unit) then
      raise exception 'That topic does not belong to that unit.';
    end if;
    update questions q set primary_unit_id = p_unit, primary_topic_id = p_topic, updated_at = now(), updated_by = auth.uid()
     where q.id = any (p_ids) and exists (select 1 from units u where u.id = p_unit and u.subject_id = q.subject_id);
    get diagnostics n = row_count;
    -- rebuild the main tag row of the changed questions
    delete from question_tags t using questions q
     where t.question_id = q.id and q.id = any (p_ids) and t.is_primary and q.primary_unit_id = p_unit
       and q.primary_topic_id is not distinct from p_topic and (t.unit_id <> p_unit or t.topic_id is distinct from p_topic);
    insert into question_tags (question_id, unit_id, topic_id, is_primary)
    select q.id, p_unit, p_topic, true from questions q
     where q.id = any (p_ids) and q.primary_unit_id = p_unit and q.primary_topic_id is not distinct from p_topic
       and not exists (select 1 from question_tags t where t.question_id = q.id and t.unit_id = p_unit
                         and t.topic_id is not distinct from p_topic);
    update question_tags t set is_primary = true
      from questions q
     where t.question_id = q.id and q.id = any (p_ids) and t.unit_id = q.primary_unit_id
       and t.topic_id is not distinct from q.primary_topic_id;
  else
    raise exception 'Unknown action %.', p_action;
  end if;
  return jsonb_build_object('changed', n);
end $$;

grant execute on function admin_delete_questions(text[]), admin_delete_paper(text), admin_bulk_questions(text[], text, text, text) to authenticated;
revoke execute on function admin_delete_questions(text[]), admin_delete_paper(text), admin_bulk_questions(text[], text, text, text) from public, anon;

-- 5. Publishing a batch: match papers by what they are (subject, year, session, shift, kind), then tidy the codes.
create or replace function admin_publish_batch(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n_pub int := 0; n_err int; old_id text; touched text[] := '{}';
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from import_batches where id = p_batch and status = 'staged') then
    raise exception 'this batch is not staged';
  end if;

  for r in select data from staged_papers where batch_id = p_batch loop
    select id into old_id from papers
     where subject_id = r.data->>'subject' and year = (r.data->>'year')::int and session = r.data->>'session'
       and exam_kind = coalesce(nullif(r.data->>'exam_kind',''), 'regular')
       and shift = coalesce((r.data->>'shift')::int, 1)
       and language = coalesce(nullif(r.data->>'language',''), 'E');
    if old_id is not null and old_id <> r.data->>'id' then
      perform recode_paper(old_id, r.data->>'id');
    end if;
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
    touched := touched || (r.data->>'subject');
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

  for r in select distinct unnest(touched) as s loop
    perform normalize_codes_internal(r.s);
  end loop;

  select count(*) into n_err from staged_questions where batch_id = p_batch and state = 'error';
  update import_batches
     set status = 'published',
         summary = summary || jsonb_build_object('published', n_pub, 'skipped_errors', n_err)
   where id = p_batch;
  return jsonb_build_object('published', n_pub, 'skipped_errors', n_err);
end $$;

-- 6. Views for the screens.
create or replace view public_subjects with (security_invoker = true) as
select s.id, s.name, s.nta_code, count(q.id)::int as questions
  from subjects s
  left join questions q on q.subject_id = s.id and q.publish_status = 'published'
 group by s.id;
revoke all on public_subjects from anon;

create or replace view exam_list with (security_invoker = true) as
select p.id, p.subject_id, p.year, p.session, p.shift, p.exam_kind, p.language, count(q.id)::int as questions
  from papers p
  join questions q on q.paper_id = p.id and q.publish_status = 'published'
 group by p.id;
revoke all on exam_list from anon;

create or replace view stats_topic_paper as
select q.subject_id, q.paper_id, p.year, p.session, p.shift, p.exam_kind,
       q.primary_unit_id as unit_id, q.primary_topic_id as topic_id, count(*)::int as n
  from questions q join papers p on p.id = q.paper_id
 where q.publish_status = 'published'
 group by 1, 2, 3, 4, 5, 6, 7, 8;
revoke all on stats_topic_paper from anon;

create or replace view admin_paper_progress with (security_invoker = true) as
select p.id as paper_id, p.subject_id, p.year, p.session, p.exam_kind, p.shift, p.total_questions,
       count(q.id) filter (where q.publish_status = 'published')::int as published,
       count(q.id) filter (where q.publish_status = 'draft')::int as drafts,
       count(q.id) filter (where q.review_status = 'verified')::int as verified,
       count(k.question_id) filter (where k.explanation_status = 'none')::int as no_explanation,
       p.language
  from papers p
  left join questions q on q.paper_id = p.id
  left join question_keys k on k.question_id = q.id
 group by p.id;
revoke all on admin_paper_progress from anon;

-- 7. Question list for students: exams (several allowed), unit, topic, saved, text search and sorting.
drop function if exists browse_questions(text, int, text, text, boolean, int, int);
create or replace function browse_questions(
  p_subject text,
  p_papers text[] default null,
  p_unit text default null,
  p_topic text default null,
  p_saved boolean default false,
  p_search text default null,
  p_sort text default 'newest',
  p_limit int default 20,
  p_offset int default 0
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with matched as (
    select q.id, q.q_no, q.format, q.body, q.options, q.passage_id, q.paper_id,
           q.primary_unit_id, q.primary_topic_id, p.year, p.session, p.exam_kind, p.shift
      from questions q
      join papers p on p.id = q.paper_id
     where q.subject_id = p_subject
       and (coalesce(cardinality(p_papers), 0) = 0 or q.paper_id = any (p_papers))
       and ((p_unit is null and p_topic is null) or exists (
             select 1 from question_tags t
              where t.question_id = q.id
                and (p_unit is null or t.unit_id = p_unit)
                and (p_topic is null or t.topic_id = p_topic)))
       and (not p_saved or exists (
             select 1 from bookmarks b where b.question_id = q.id and b.user_id = auth.uid()))
       and (coalesce(p_search, '') = '' or q.id ilike '%' || p_search || '%'
             or (q.body->'en'->>'text') ilike '%' || p_search || '%'
             or (q.body->'en'->>'context') ilike '%' || p_search || '%'
             or exists (select 1 from jsonb_array_elements(q.options) o where (o->'en'->>'text') ilike '%' || p_search || '%'))
  ),
  ranked as (
    select m.*, row_number() over (
             order by
               case when p_sort = 'unit' then m.primary_unit_id end,
               case when p_sort = 'unit' then m.primary_topic_id end,
               case when p_sort = 'oldest' then m.year end asc,
               case when p_sort = 'oldest' then (m.session = 'december')::int end asc,
               case when p_sort <> 'oldest' then m.year end desc,
               case when p_sort <> 'oldest' then (m.session = 'december')::int end desc,
               m.shift, (m.exam_kind = 'reexam'), m.q_no) as ord
      from matched m
  ),
  page as (
    select * from ranked where ord > p_offset and ord <= p_offset + p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'q_no', g.q_no,
        'format', g.format,
        'body', g.body,
        'options', g.options,
        'paper', jsonb_build_object('id', g.paper_id, 'year', g.year, 'session', g.session, 'exam_kind', g.exam_kind, 'shift', g.shift),
        'primary', jsonb_build_object('unit_id', g.primary_unit_id, 'topic_id', g.primary_topic_id),
        'tags', coalesce((select jsonb_agg(jsonb_build_object('unit_id', t.unit_id, 'topic_id', t.topic_id))
                            from question_tags t where t.question_id = g.id and not t.is_primary), '[]'::jsonb),
        'passage', (select ps.body from passages ps where ps.id = g.passage_id),
        'saved', exists (select 1 from bookmarks b where b.question_id = g.id and b.user_id = auth.uid())
      ) order by g.ord) from page g), '[]'::jsonb)
  );
$$;
grant execute on function browse_questions(text, text[], text, text, boolean, text, text, int, int) to authenticated;

-- 8. Test pool: exams instead of years, plus text search.
drop function if exists test_pool(text, int[], text[], text[], boolean);
create or replace function test_pool(
  p_subject text,
  p_papers text[] default null,
  p_units text[] default null,
  p_topics text[] default null,
  p_search text default null,
  p_with_ids boolean default false
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with m as (
    select q.id, p.year, p.session, p.shift, q.q_no
      from questions q
      join papers p on p.id = q.paper_id
     where q.subject_id = p_subject
       and q.publish_status = 'published' and q.is_testable
       and (q.canonical_id is null or q.canonical_id = q.id)
       and (coalesce(cardinality(p_papers), 0) = 0 or q.paper_id = any (p_papers))
       and (coalesce(p_search, '') = '' or (q.body->'en'->>'text') ilike '%' || p_search || '%'
             or (q.body->'en'->>'context') ilike '%' || p_search || '%')
       and ((coalesce(cardinality(p_units), 0) = 0 and coalesce(cardinality(p_topics), 0) = 0) or exists (
             select 1 from question_tags t
              where t.question_id = q.id
                and ((coalesce(cardinality(p_units), 0) > 0 and t.unit_id = any (p_units))
                  or (coalesce(cardinality(p_topics), 0) > 0 and t.topic_id = any (p_topics)))))
  )
  select jsonb_build_object(
    'total', (select count(*) from m),
    'ids', case when p_with_ids
                then coalesce((select jsonb_agg(id order by year desc, (session = 'december') desc, shift, q_no) from m), '[]'::jsonb)
                else '[]'::jsonb end);
$$;
grant execute on function test_pool(text, text[], text[], text[], text, boolean) to authenticated;
revoke execute on function test_pool(text, text[], text[], text[], text, boolean) from public, anon;

-- 9. One flat list of questions for the admin screens (filter and sort on any column).
create or replace view admin_questions with (security_invoker = true) as
select q.id, q.paper_id, q.q_no, q.subject_id, q.publish_status, q.review_status,
       q.primary_unit_id, q.primary_topic_id, q.updated_at,
       p.year, p.session, p.shift, p.exam_kind,
       (q.body->'en'->>'text') as text,
       k.answer_status, k.explanation_status
  from questions q
  join papers p on p.id = q.paper_id
  left join question_keys k on k.question_id = q.id;
revoke all on admin_questions from anon;
