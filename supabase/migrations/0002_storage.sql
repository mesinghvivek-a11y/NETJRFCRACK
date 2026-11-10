-- Public bucket for question images (questions themselves are readable by any signed-in user).
insert into storage.buckets (id, name, public)
values ('question-media', 'question-media', true)
on conflict (id) do nothing;
