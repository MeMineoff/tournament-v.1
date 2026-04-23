-- Парные турниры: participant_type = 'double' режется CHECK/enum в Postgres.
-- Supabase → SQL Editor → выполни блок «ИСПРАВЛЕНИЕ» (схема tournament).
--
-- Диагностика (по желанию):
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'tournament' AND table_name = 'tournaments' AND column_name = 'participant_type';

-- ========= ИСПРАВЛЕНИЕ (text/varchar + CHECK) =========
-- Снимаем любые CHECK на таблице, в определении которых есть participant_type
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'tournament'
      AND t.relname = 'tournaments'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%participant_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE tournament.tournaments DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE tournament.tournaments
  ADD CONSTRAINT tournaments_participant_type_check
  CHECK (participant_type IN ('single', 'double'));

-- ========= Если participant_type — ENUM (udt_name не text/varchar) =========
-- В Table Editor посмотри тип колонки. Пример:
-- ALTER TYPE tournament.имя_типа ADD VALUE IF NOT EXISTS 'double';
-- (выполняй отдельными транзакциями, если Postgres ругается)
