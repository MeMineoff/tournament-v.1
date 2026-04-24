'use client'

import dynamic from 'next/dynamic'
import { Theme } from 'emoji-picker-react'
import type { Player } from '@/lib/types'
import type { PlayerListAction, PlayerListState } from './adminViewState'

const EmojiPicker = dynamic(
  () => import('emoji-picker-react').then((m) => m.default),
  { ssr: false }
)

type Props = {
  groupId: number
  currentGroupName: string | null
  players: Player[]
  p: PlayerListState
  dispatchP: React.Dispatch<PlayerListAction>
  addPlayer: (e: React.FormEvent) => void | Promise<void>
  savePlayerEdit: (e: React.FormEvent) => void | Promise<void>
  removePlayer: (id: number) => void | Promise<void>
}

export function TournamentPlayersList({
  groupId: _groupId,
  currentGroupName,
  players,
  p,
  dispatchP,
  addPlayer,
  savePlayerEdit,
  removePlayer,
}: Props) {
  return (
    <>
      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Добавить игрока 👤
        </h2>
        {currentGroupName && (
          <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--lime)]/20 px-3 py-2 text-sm font-bold text-[var(--ink)]">
            Игрок попадёт в кластер{' '}
            <span className="text-[var(--clay)]">{currentGroupName}</span>{' '}
            <span className="font-mono text-xs font-normal text-[var(--ink-muted)]">
              (group_id {_groupId})
            </span>
          </p>
        )}
        <form onSubmit={addPlayer} className="space-y-4">
          <label className="block text-sm font-bold">
            Имя
            <input
              value={p.newName}
              onChange={(e) => dispatchP({ type: 'setNewName', value: e.target.value })}
              className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
              placeholder="Например, Маша «Бэкхенд»"
            />
          </label>
          <div>
            <p className="text-sm font-bold">Аватар (emoji)</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => dispatchP({ type: 'toggleNewPicker' })}
                className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] text-2xl shadow-[2px_2px_0_var(--ink)]"
              >
                {p.newEmoji}
              </button>
              <span className="text-xs text-[var(--ink-muted)]">Нажми, чтобы открыть палитру</span>
            </div>
            {p.showPicker && (
              <div className="relative z-20 mt-3 overflow-hidden rounded-xl border-2 border-[var(--ink)]">
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    dispatchP({ type: 'setNewEmoji', value: emojiData.emoji })
                    dispatchP({ type: 'setShowPicker', value: false })
                  }}
                  theme={Theme.DARK}
                  width="100%"
                />
              </div>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-full border-2 border-[var(--ink)] bg-[var(--clay)] py-2.5 font-black text-[var(--cream)] shadow-[3px_3px_0_var(--ink)]"
          >
            Добавить игрока
          </button>
        </form>
      </section>

      <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Список игроков 📋
        </h2>
        <div className="overflow-x-auto rounded-xl border-2 border-[var(--ink)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 font-black">Emoji</th>
                <th className="px-3 py-2 font-black">Имя</th>
                <th className="px-3 py-2 font-black" />
              </tr>
            </thead>
            <tbody>
              {players.map((pl) => (
                <tr key={pl.id} className="border-t border-[var(--ink)]">
                  {p.editingPlayerId === pl.id ? (
                    <>
                      <td className="px-3 py-2 align-top" colSpan={3}>
                        <form
                          onSubmit={(e) => void savePlayerEdit(e)}
                          className="flex flex-col gap-3 py-1"
                        >
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="min-w-[140px] flex-1 text-sm font-bold">
                              Имя
                              <input
                                value={p.editPlayerName}
                                onChange={(e) =>
                                  dispatchP({ type: 'setEditPlayerName', value: e.target.value })
                                }
                                className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                              />
                            </label>
                            <div>
                              <p className="text-sm font-bold">Emoji</p>
                              <button
                                type="button"
                                onClick={() => dispatchP({ type: 'toggleEditPlayerPicker' })}
                                className="mt-1 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] text-2xl shadow-[2px_2px_0_var(--ink)]"
                              >
                                {p.editPlayerEmoji}
                              </button>
                            </div>
                          </div>
                          {p.showEditPlayerPicker && (
                            <div className="relative z-20 overflow-hidden rounded-xl border-2 border-[var(--ink)]">
                              <EmojiPicker
                                onEmojiClick={(emojiData) => {
                                  dispatchP({ type: 'setEditPlayerEmoji', value: emojiData.emoji })
                                  dispatchP({ type: 'setShowEditPlayerPicker', value: false })
                                }}
                                theme={Theme.DARK}
                                width="100%"
                              />
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                            >
                              Сохранить
                            </button>
                            <button
                              type="button"
                              onClick={() => dispatchP({ type: 'cancelPlayerEdit' })}
                              className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--ink-muted)]"
                            >
                              Отмена
                            </button>
                          </div>
                        </form>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-xl">{pl.avatar_emoji}</td>
                      <td className="px-3 py-2 font-semibold">{pl.name}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              dispatchP({
                                type: 'startEditPlayer',
                                id: pl.id,
                                name: pl.name,
                                emoji: pl.avatar_emoji,
                              })
                            }
                            className="rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--ink)]"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => void removePlayer(pl.id)}
                            className="rounded-lg border border-[var(--clay)] bg-[var(--clay-soft)] px-2 py-1 text-xs font-bold text-[var(--ink)]"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {players.length === 0 && (
            <p className="p-6 text-center text-[var(--ink-muted)]">В этом кластере пока нет игроков</p>
          )}
        </div>
      </section>
    </>
  )
}
