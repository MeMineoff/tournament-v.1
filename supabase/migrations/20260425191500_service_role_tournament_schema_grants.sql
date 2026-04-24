-- Права для elevated-ролей (service_role / API Secret) на схему tournament.
-- Ошибка "permission denied for schema tournament" на /api/admin/matches
-- означает отсутствие USAGE на схему (даже при правах на таблицу).

grant usage on schema tournament to service_role;

grant select, insert, update, delete
  on all tables in schema tournament
  to service_role;

grant usage, select
  on all sequences in schema tournament
  to service_role;

-- Права на будущие таблицы/sequence в этой схеме.
alter default privileges in schema tournament
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema tournament
  grant usage, select on sequences to service_role;
