'use client'

import type { TournamentCreateAction, TournamentCreateState } from './adminViewState'

type Props = {
  create: TournamentCreateState
  dispatchCreate: React.Dispatch<TournamentCreateAction>
  createTournament: (e: React.FormEvent) => void | Promise<void>
  createTournamentBlockedReason: string | null
  groupId: number
  currentGroupName: string | null
}

export function TournamentBasicForm({
  create,
  dispatchCreate,
  createTournament,
  createTournamentBlockedReason,
  groupId: _groupId,
  currentGroupName,
}: Props) {
  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
        Создать турнир 🏆
      </h2>
      {currentGroupName && (
        <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/20 px-3 py-2 text-sm font-bold text-[var(--ink)]">
          Турнир будет создан в кластере{' '}
          <span className="text-[var(--clay)]">{currentGroupName}</span>{' '}
          <span className="font-mono text-xs font-normal text-[var(--ink-muted)]">
            (group_id {_groupId})
          </span>
        </p>
      )}
      <form onSubmit={createTournament} className="space-y-3">
        <p className="rounded-lg border-2 border-[var(--ink)]/20 bg-[var(--lime)]/15 px-3 py-2 text-sm font-black text-[var(--ink)]">
          Шаг 1 · Основная информация
        </p>
        <label className="block text-sm font-bold">
          Название
          <input
            value={create.tName}
            onChange={(e) => dispatchCreate({ type: 'setTName', value: e.target.value })}
            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          />
        </label>
        <label className="block text-sm font-bold">
          Описание
          <textarea
            value={create.tDesc}
            onChange={(e) => dispatchCreate({ type: 'setTDesc', value: e.target.value })}
            rows={2}
            className="mt-1 w-full resize-none rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          />
        </label>
        <label className="block text-sm font-bold">
          Дата
          <input
            type="date"
            value={create.tDate}
            onChange={(e) => dispatchCreate({ type: 'setTDate', value: e.target.value })}
            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          />
        </label>
        <label className="block text-sm font-bold">
          Формат
          <select
            value={create.tFormat}
            onChange={(e) => dispatchCreate({ type: 'setTFormat', value: e.target.value })}
            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          >
            <option value="round_robin">Круговая (round_robin)</option>
            <option value="playoff">Плей-офф (playoff)</option>
          </select>
        </label>

        <label className="block text-sm font-bold">
          Тип участников
          <select
            value={create.tPart}
            onChange={(e) => {
              const next = e.target.value === 'double' ? 'double' : 'single'
              dispatchCreate({ type: 'setTPart', value: next })
            }}
            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          >
            <option value="single">Одиночный (single)</option>
            <option value="double">Пары (double)</option>
          </select>
        </label>

        {create.tFormat === 'playoff' && (
          <label className="block text-sm font-bold">
            Размер сетки плей-офф
            <select
              value={create.playoffSize}
              onChange={(e) => {
                const v = Number(e.target.value) as 4 | 8 | 16
                dispatchCreate({ type: 'setPlayoffSize', value: v })
              }}
              className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
            >
              <option value={4}>4 (1/2 + финал)</option>
              <option value={8}>8 (1/4 + 1/2 + финал)</option>
              <option value={16}>16 (1/16 + 1/4 + 1/2 + финал)</option>
            </select>
          </label>
        )}

        <p className="text-xs text-[var(--ink-muted)]">
          Участников и матчи добавляйте на странице редактирования турнира. Для плей-оффа здесь
          создаётся пустая сетка.
        </p>
        {createTournamentBlockedReason && (
          <p className="text-xs font-bold text-[var(--clay)]">{createTournamentBlockedReason}</p>
        )}
        <button
          type="submit"
          disabled={create.creatingTournament || createTournamentBlockedReason != null}
          className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] py-2.5 font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.creatingTournament ? 'Создаём...' : 'Создать турнир'}
        </button>
      </form>
    </section>
  )
}
