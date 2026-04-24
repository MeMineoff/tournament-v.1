-- Права для API-ролей на таблицу tournament.teams.
-- Без GRANT RLS-политики недостаточно: PostgREST возвращает "permission denied for table teams".

grant usage on schema tournament to anon, authenticated;

grant select, insert, update, delete
  on table tournament.teams
  to anon, authenticated;

-- Для identity-колонки (insert в teams).
grant usage, select
  on sequence tournament.teams_id_seq
  to anon, authenticated;
