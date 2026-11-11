-- PYQ browser: filter by year / unit / topic (secondary tags included) / saved, paginated.
-- security invoker: row level security applies as the signed-in user.
create or replace function browse_questions(
  p_subject text,
  p_year int default null,
  p_unit text default null,
  p_topic text default null,
  p_saved boolean default false,
  p_limit int default 20,
  p_offset int default 0
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with matched as (
    select q.id, q.q_no, q.format, q.body, q.options, q.passage_id,
           q.primary_unit_id, q.primary_topic_id, p.year, p.session, p.exam_kind, p.shift
      from questions q
      join papers p on p.id = q.paper_id
     where q.subject_id = p_subject
       and (p_year is null or p.year = p_year)
       and ((p_unit is null and p_topic is null) or exists (
             select 1 from question_tags t
              where t.question_id = q.id
                and (p_unit is null or t.unit_id = p_unit)
                and (p_topic is null or t.topic_id = p_topic)))
       and (not p_saved or exists (
             select 1 from bookmarks b where b.question_id = q.id and b.user_id = auth.uid()))
  ),
  ranked as (
    select m.*, row_number() over (
             order by m.year desc, (m.session = 'december') desc, (m.exam_kind = 'reexam'), m.shift, m.q_no) as ord
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
        'paper', jsonb_build_object('year', g.year, 'session', g.session, 'exam_kind', g.exam_kind, 'shift', g.shift),
        'primary', jsonb_build_object('unit_id', g.primary_unit_id, 'topic_id', g.primary_topic_id),
        'tags', coalesce((select jsonb_agg(jsonb_build_object('unit_id', t.unit_id, 'topic_id', t.topic_id))
                            from question_tags t where t.question_id = g.id and not t.is_primary), '[]'::jsonb),
        'passage', (select ps.body from passages ps where ps.id = g.passage_id),
        'saved', exists (select 1 from bookmarks b where b.question_id = g.id and b.user_id = auth.uid())
      ) order by g.ord) from page g), '[]'::jsonb)
  );
$$;

grant execute on function browse_questions(text, int, text, text, boolean, int, int) to authenticated;
