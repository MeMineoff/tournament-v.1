'use client'

import Link from 'next/link'
import type { Tournament } from '@/lib/types'
import type { TournamentListEditAction, TournamentListEditState } from './adminViewState'

type Props = {
  tournaments: Tournament[]
  te: TournamentListEditState
  dispatchTe: React.Dispatch<TournamentListEditAction>
  saveTournamentEdit: (e: React.FormEvent) => void | Promise<void>
  removeTournament: (id: number) => void | Promise<void>
}

export function TournamentTeamsManager({
  tournaments,
  te,
  dispatchTe,
  saveTournamentEdit,
  removeTournament,
}: Props) {
  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
        Турниры группы 📋
      </h2>
      {tournaments.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">Пока нет турниров — создайте ниже.</p>
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
            >
              {te.editingTournamentId === t.id ? (
                <form onSubmit={(e) => void saveTournamentEdit(e)} className="space-y-3 py-1">
                  <p className="text-xs text-[var(--ink-muted)]">
                    Формат и тип участников заданы при создании и здесь не меняются (от них зависит
                    сетка в БД).
                  </p>
                  <label className="block text-sm font-bold">
                    Название
                    <input
                      value={te.editTourName}
                      onChange={(e) =>
                        dispatchTe({ type: 'setEditTourName', value: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Описание
                    <textarea
                      value={te.editTourDesc}
                      onChange={(e) =>
                        dispatchTe({ type: 'setEditTourDesc', value: e.target.value })
                      }
                      rows={2}
                      className="mt-1 w-full resize-none rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Дата
                    <input
                      type="date"
                      value={te.editTourDate}
                      onChange={(e) =>
                        dispatchTe({ type: 'setEditTourDate', value: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Статус на сайте
                    <select
                      value={te.editTourStatus}
                      onChange={(e) =>
                        dispatchTe({
                          type: 'setEditTourStatus',
                          value: e.target.value === 'archived' ? 'archived' : 'active',
                        })
                      }
                      className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                    >
                      <option value="active">Активен</option>
                      <option value="archived">Архив</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatchTe({ type: 'closeEdit' })}
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--ink)]">{t.name}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {t.format} · {t.status} · id {t.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/admin/tournament/${t.id}`}
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                    >
                      Участники и матчи
                    </Link>
                    <button
                      type="button"
                      onClick={() => dispatchTe({ type: 'startEdit', t })}
                      className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-black text-[var(--ink)]"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeTournament(t.id)}
                      className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1.5 text-xs font-black text-[var(--ink)]"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
