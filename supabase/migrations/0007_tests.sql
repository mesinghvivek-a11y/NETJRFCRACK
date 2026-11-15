-- Test engine: question pool for a chosen selection, and counts for the test builder.
-- Run once, after 0006. Safe to run again.

create or replace function test_pool(
  p_subject text,
  p_years int[] default null,
  p_units text[] default null,
  p_topics text[] default null,
  p_with_ids boolean default false
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with m as (
    select q.id, p.year, p.session, q.q_no
      from questions q
      join papers p on p.id = q.paper_id
     where q.subject_id = p_subject
       and q.publish_status = 'published' and q.is_testable
       and (q.canonical_id is null or q.canonical_id = q.id)
       and (coalesce(cardinality(p_years), 0) = 0 or p.year = any (p_years))
       and ((coalesce(cardinality(p_units), 0) = 0 and coalesce(cardinality(p_topics), 0) = 0) or exists (
             select 1 from question_tags t
              where t.question_id = q.id
                and ((coalesce(cardinality(p_units), 0) > 0 and t.unit_id = any (p_units))
                  or (coalesce(cardinality(p_topics), 0) > 0 and t.topic_id = any (p_topics)))))
  )
  select jsonb_build_object(
    'total', (select count(*) from m),
    'ids', case when p_with_ids
                then coalesce((select jsonb_agg(id order by year desc, (session = 'december') desc, q_no) from m), '[]'::jsonb)
                else '[]'::jsonb end);
$$;

-- Rows with topic_id null are unit totals (questions tagged with that unit); the others are per topic.
create or replace function test_counts(p_subject text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with base as (
    select t.unit_id, t.topic_id, t.question_id
      from question_tags t
      join questions q on q.id = t.question_id
     where q.subject_id = p_subject and q.publish_status = 'published' and q.is_testable
       and (q.canonical_id is null or q.canonical_id = q.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('unit_id', unit_id, 'topic_id', topic_id, 'n', n)), '[]'::jsonb)
  from (
    select unit_id, null::text as topic_id, count(distinct question_id)::int as n from base group by unit_id
    union all
    select unit_id, topic_id, count(distinct question_id)::int from base where topic_id is not null group by unit_id, topic_id
  ) x;
$$;

grant execute on function test_pool(text, int[], text[], text[], boolean), test_counts(text) to authenticated;
revoke execute on function test_pool(text, int[], text[], text[], boolean), test_counts(text) from public, anon;
