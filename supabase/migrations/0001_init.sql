-- UGC NET prep platform: initial schema
-- Principles: answers live in a private table and are reached only via RPC
-- (keeps tests honest and gives a single paywall hook).

-- ───────────── Reference data (loaded from data/taxonomy/*.json) ─────────────
create table subjects (
  id text primary key,                       -- 'geography', 'paper1'
  name text not null,
  nta_code text,                             -- '80', '00'
  questions_per_paper int not null,          -- 100 / 50
  minutes_per_paper int not null,            -- 120 / 60
  sort int not null default 0
);

create table units (
  id text primary key,                       -- 'geo-u01'
  subject_id text not null references subjects on delete cascade,
  number int not null,
  name text not null,
  unique (subject_id, number)
);

create table topics (
  id text primary key,                       -- 'geo-u01-t03' (frozen once published)
  unit_id text not null references units on delete cascade,
  name text not null,
  sort int not null default 0,
  is_legacy boolean not null default false   -- topic dropped from current syllabus
);

-- ───────────── Papers and questions (loaded from data/questions/**/*.json) ─────────────
create table papers (
  id text primary key,                       -- 'geo-2025-jun-s1'
  subject_id text not null references subjects,
  year int not null,
  session text not null check (session in ('june','december')),
  exam_kind text not null default 'regular' check (exam_kind in ('regular','reexam')),
  exam_date date,
  shift int not null default 1,
  total_questions int not null,              -- as printed: 100 / 75 / 50
  unique (subject_id, year, session, exam_kind, shift)
);

create table passages (
  id text primary key,
  paper_id text not null references papers on delete cascade,
  body jsonb not null                        -- {en:{text}, hi:{text}}
);

create table questions (
  id text primary key,                       -- own id: 'GEO-2025-JUN-S1-Q045'
  paper_id text not null references papers on delete cascade,
  subject_id text not null references subjects,
  q_no int not null,
  canonical_id text,                         -- first appearance of the same question; null or = id for originals
  format text not null check (format in ('mcq','matching','assertion_reason','statement','table','image')),
  body jsonb not null,                       -- {en:{text,table?,image?}, hi:{...}}
  options jsonb not null,                    -- [{key:'A', en:{text,image?}, hi:{...}}] x4
  passage_id text references passages,
  primary_unit_id text not null references units,
  primary_topic_id text references topics,
  review_status text not null default 'draft' check (review_status in ('draft','verified')),
  is_testable boolean not null default true, -- false for dropped / disputed
  content_hash text not null,                -- importer skips unchanged rows
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, q_no)
);
create index on questions (subject_id, primary_unit_id, primary_topic_id);
create index on questions (paper_id);

-- Secondary tags (browse in several units/topics; stats still use the primary only)
create table question_tags (
  id bigserial primary key,
  question_id text not null references questions on delete cascade,
  unit_id text not null references units,
  topic_id text references topics,
  is_primary boolean not null default false
);
create unique index question_tags_uq on question_tags (question_id, unit_id, coalesce(topic_id, ''));
create index on question_tags (unit_id, topic_id);

-- PRIVATE: no select policy, so only security-definer functions can read it.
create table question_keys (
  question_id text primary key references questions on delete cascade,
  correct_keys text[] not null default '{}',  -- several when answer_status = 'multiple'
  answer_status text not null default 'final'
    check (answer_status in ('provisional','final','dropped','multiple','disputed')),
  key_source text,
  explanation jsonb,                          -- {summary, options:{A..D}, references:[{book,page,note}]}
  explanation_status text not null default 'none' check (explanation_status in ('none','draft','verified'))
);

-- ───────────── Users ─────────────
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free','pro')),  -- paywall hook
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table bookmarks (
  user_id uuid not null references auth.users on delete cascade,
  question_id text not null references questions on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table error_reports (
  id bigserial primary key,
  user_id uuid references auth.users on delete set null,
  question_id text not null references questions on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open','fixed','rejected')),
  created_at timestamptz not null default now()
);

-- ───────────── Tests ─────────────
create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id text not null references subjects,
  scope jsonb not null default '{}',          -- {years:[], units:[], topics:[]} for display/filtering
  question_ids text[] not null,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,           -- started_at + n * 72s; the server owns the clock
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  total_marks int not null,                   -- n * 2
  correct_count int,
  attempted_count int,
  score int                                   -- correct * 2, no negative marking
);
create index on attempts (user_id, started_at desc);

create table attempt_responses (
  attempt_id uuid not null references attempts on delete cascade,
  question_id text not null references questions,
  position int not null,
  selected_key text,
  palette_state text not null default 'not_visited'
    check (palette_state in ('not_visited','not_answered','answered','marked','answered_marked')),
  time_spent_sec int not null default 0,
  is_correct boolean,                         -- filled on submit
  primary key (attempt_id, question_id)
);

-- ───────────── Row level security ─────────────
alter table subjects enable row level security;
alter table units enable row level security;
alter table topics enable row level security;
alter table papers enable row level security;
alter table passages enable row level security;
alter table questions enable row level security;
alter table question_tags enable row level security;
alter table question_keys enable row level security;   -- no policy: private
alter table profiles enable row level security;
alter table bookmarks enable row level security;
alter table error_reports enable row level security;
alter table attempts enable row level security;
alter table attempt_responses enable row level security;

create policy ref_read on subjects for select to authenticated using (true);
create policy ref_read on units for select to authenticated using (true);
create policy ref_read on topics for select to authenticated using (true);
create policy ref_read on papers for select to authenticated using (true);
create policy ref_read on passages for select to authenticated using (true);
create policy ref_read on questions for select to authenticated using (true);
create policy ref_read on question_tags for select to authenticated using (true);

create policy own_profile on profiles for select to authenticated using (id = auth.uid());
create policy own_profile_upd on profiles for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and plan = (select plan from profiles where id = auth.uid()));
create policy own_bookmarks on bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_reports_ins on error_reports for insert to authenticated with check (user_id = auth.uid());
create policy own_reports_sel on error_reports for select to authenticated using (user_id = auth.uid());
create policy own_attempts on attempts for select to authenticated using (user_id = auth.uid());
create policy own_responses_sel on attempt_responses for select to authenticated
  using (exists (select 1 from attempts a where a.id = attempt_id and a.user_id = auth.uid()));
-- Writes to attempts/attempt_responses go through the RPCs below only.

-- ───────────── RPCs ─────────────

-- PYQ "tap to reveal". Paywall check goes here later.
create function reveal_answer(p_question_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  return (select to_jsonb(k) - 'question_id' from question_keys k where k.question_id = p_question_id);
end $$;

-- Create a test. Client sends the chosen ids; server keeps only testable ones.
create function start_attempt(p_subject_id text, p_question_ids text[], p_scope jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare ids text[]; n int; a attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select array_agg(q.id order by array_position(p_question_ids, q.id)) into ids
    from questions q where q.id = any(p_question_ids) and q.is_testable and q.subject_id = p_subject_id;
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

-- Periodic autosave while the test runs (same shape as submit). Ignored after the deadline.
create function save_responses(p_attempt_id uuid, p_responses jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  update attempt_responses r
     set selected_key = x.selected_key, palette_state = x.palette_state, time_spent_sec = x.time_spent_sec
    from jsonb_to_recordset(p_responses) as x(question_id text, selected_key text, palette_state text, time_spent_sec int),
         attempts a
   where a.id = p_attempt_id and a.user_id = auth.uid() and a.status = 'in_progress'
     and now() <= a.deadline_at + interval '30 seconds'
     and r.attempt_id = a.id and r.question_id = x.question_id;
end $$;

create function submit_attempt(p_attempt_id uuid, p_responses jsonb default '[]', p_auto boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a attempts%rowtype; c int; t int;
begin
  select * into a from attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if not found then raise exception 'attempt not found'; end if;
  if a.status = 'submitted' then
    return jsonb_build_object('score', a.score, 'total_marks', a.total_marks);
  end if;
  perform save_responses(p_attempt_id, p_responses);   -- no-op if past the grace window
  update attempt_responses r
     set is_correct = (r.selected_key is not null and r.selected_key = any (k.correct_keys))
    from question_keys k
   where r.attempt_id = p_attempt_id and k.question_id = r.question_id;
  select count(*) filter (where is_correct), count(*) filter (where selected_key is not null)
    into c, t from attempt_responses where attempt_id = p_attempt_id;
  update attempts
     set status = 'submitted', submitted_at = now(), auto_submitted = p_auto or now() > a.deadline_at,
         correct_count = c, attempted_count = t, score = c * 2
   where id = p_attempt_id;
  return jsonb_build_object('score', c * 2, 'total_marks', a.total_marks, 'correct', c, 'attempted', t);
end $$;

-- Review screen: keys and explanations, only for submitted attempts.
create function attempt_review(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from attempts where id = p_attempt_id and user_id = auth.uid() and status = 'submitted') then
    raise exception 'attempt not submitted';
  end if;
  return (select jsonb_agg(jsonb_build_object('question_id', r.question_id, 'selected', r.selected_key,
            'is_correct', r.is_correct, 'time_spent_sec', r.time_spent_sec,
            'key', to_jsonb(k) - 'question_id') order by r.position)
          from attempt_responses r join question_keys k using (question_id)
          where r.attempt_id = p_attempt_id);
end $$;

revoke all on function reveal_answer, start_attempt, save_responses, submit_attempt, attempt_review from public;
grant execute on function reveal_answer, start_attempt, save_responses, submit_attempt, attempt_review to authenticated;
revoke execute on function reveal_answer, start_attempt, save_responses, submit_attempt, attempt_review from anon;

-- ───────────── Analytics views ─────────────

-- PYQ trends: counts by year x primary unit/topic, each canonical question counted once.
create view stats_topic_year as
select q.subject_id, p.year, q.primary_unit_id as unit_id, q.primary_topic_id as topic_id, count(*)::int as n
  from questions q join papers p on p.id = q.paper_id
 where q.canonical_id is null or q.canonical_id = q.id
 group by 1, 2, 3, 4;

-- Personal performance by topic (submitted attempts only).
create view my_topic_performance with (security_invoker = true) as
select a.user_id, q.subject_id, q.primary_unit_id as unit_id, q.primary_topic_id as topic_id,
       count(*)::int as seen,
       count(*) filter (where r.selected_key is not null)::int as attempted,
       count(*) filter (where r.is_correct)::int as correct,
       sum(r.time_spent_sec)::int as time_sec
  from attempt_responses r
  join attempts a on a.id = r.attempt_id and a.status = 'submitted'
  join questions q on q.id = r.question_id
 where a.user_id = auth.uid()
 group by 1, 2, 3, 4;

-- Views are for signed-in users only.
revoke all on stats_topic_year, my_topic_performance from anon;
