-- Права на tournament.matches (аналог 20260424103000_teams_grants).
-- Без GRANT с клиента (anon) INSERT/SELECT падают с permission denied; матч не виден
-- в админке после вставки, даже если строка в БД появилась.

grant usage on schema tournament to anon, authenticated;

grant select, insert, update, delete
  on table tournament.matches
  to anon, authenticated;

-- identity: имя sequence может отличаться между инстансами
do $grant_match_seq$
declare
  seqn text;
begin
  seqn := pg_get_serial_sequence('tournament.matches', 'id');
  if seqn is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', seqn);
  end if;
end
$grant_match_seq$;
