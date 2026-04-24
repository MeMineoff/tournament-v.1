'use client'

import type { Group } from '@/lib/types'
import type { GroupClusterAction, GroupClusterState } from './adminViewState'

type Props = {
  groups: Group[]
  groupId: number | null
  navClusterSel: 'all' | number
  g: GroupClusterState
  dispatchG: React.Dispatch<GroupClusterAction>
  createGroup: (e: React.FormEvent) => void | Promise<void>
  selectCluster: (id: number) => void
  saveGroupEdit: (e: React.FormEvent) => void | Promise<void>
  removeGroup: (id: number) => void | Promise<void>
}

export function AdminClustersPanel({
  groups,
  groupId,
  navClusterSel,
  g,
  dispatchG,
  createGroup,
  selectCluster,
  saveGroupEdit,
  removeGroup,
}: Props) {
  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--ink)]">
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
        Кластеры 🏠
      </h2>
      <p className="mb-4 text-sm text-[var(--ink-muted)]">
        Кнопка «Выбрать» задаёт активный кластер для админки и совпадает с селектором «Кластер»
        в шапке сайта (одна и та же cookie).
      </p>
      {groups.length > 0 && navClusterSel === 'all' && (
        <p className="mb-4 rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)]/90 px-3 py-2 text-sm font-bold text-[var(--ink)]">
          Сейчас на сайте включён режим <strong>«Общее»</strong> — пока не нажмёте «Выбрать» у
          кластера, создавать турниры и игроков нельзя (неясно, в какую группу их класть).
        </p>
      )}
      <form
        onSubmit={(e) => void createGroup(e)}
        className="mb-6 flex flex-wrap items-end gap-2 border-b-2 border-[var(--ink)]/15 pb-6"
      >
        <label className="min-w-[200px] flex-1 text-sm font-bold">
          Новый кластер
          <input
            value={g.newGroupName}
            onChange={(e) => dispatchG({ type: 'setNewGroupName', value: e.target.value })}
            placeholder="Название"
            className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-4 py-2.5 text-sm font-black text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]"
        >
          Создать
        </button>
      </form>
      <ul className="space-y-2">
        {groups.map((gr) => (
          <li
            key={gr.id}
            className="rounded-xl border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 py-2"
          >
            {g.editingGroupId === gr.id ? (
              <form
                onSubmit={(e) => void saveGroupEdit(e)}
                className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <label className="min-w-[180px] flex-1 text-sm font-bold">
                  Название
                  <input
                    value={g.editGroupName}
                    onChange={(e) =>
                      dispatchG({ type: 'setEditGroupName', value: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-full border-2 border-[var(--ink)] bg-[var(--lime)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatchG({ type: 'cancelEdit' })}
                    className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--ink-muted)]"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  🏠 {gr.name}{' '}
                  <span className="text-xs font-normal text-[var(--ink-muted)]">
                    (id {gr.id})
                  </span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={groupId === gr.id}
                    onClick={() => selectCluster(gr.id)}
                    className="rounded-full border-2 border-[var(--ink)] bg-[var(--court-deep)] px-3 py-1.5 text-xs font-black text-[var(--cream)] shadow-[2px_2px_0_var(--ink)] transition disabled:opacity-50"
                  >
                    {groupId === gr.id ? '✓ Активен' : 'Выбрать'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchG({ type: 'startEdit', id: gr.id, name: gr.name })
                    }
                    className="rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeGroup(gr.id)}
                    className="rounded-full border-2 border-[var(--clay)] bg-[var(--clay-soft)] px-3 py-1.5 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {groups.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)]">Кластеров нет — создайте первый.</p>
      )}
    </section>
  )
}
