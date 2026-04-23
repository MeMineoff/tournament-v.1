-- Парные матчи: второй игрок каждой стороны (команда A: a + a2, команда B: b + b2).
alter table tournament.matches
  add column if not exists player_a2_id bigint references tournament.players (id),
  add column if not exists player_b2_id bigint references tournament.players (id);
