-- Схема tournament: плей-офф и смешанный формат
-- Выполните в SQL Editor Supabase, если миграции не применяются автоматически.

alter table tournament.matches
  alter column player_a_id drop not null,
  alter column player_b_id drop not null;

alter table tournament.matches
  add column if not exists round text,
  add column if not exists bracket_order integer not null default 0,
  add column if not exists round_index integer not null default 0,
  add column if not exists parent_a_match_id bigint references tournament.matches (id),
  add column if not exists parent_b_match_id bigint references tournament.matches (id);

alter table tournament.tournaments
  add column if not exists playoff_bracket_size integer,
  add column if not exists playoff_advancers integer,
  add column if not exists participant_ids jsonb;

create index if not exists matches_tournament_round_idx
  on tournament.matches (tournament_id, round_index, bracket_order);
