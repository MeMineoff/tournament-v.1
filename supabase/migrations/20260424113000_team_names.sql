alter table tournament.teams
  add column if not exists name text;

comment on column tournament.teams.name is
  'Опциональное имя команды внутри турнира. Если null, UI собирает имя из игроков пары.';
