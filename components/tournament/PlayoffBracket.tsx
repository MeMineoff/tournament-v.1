'use client'

import { useMemo } from 'react'
import type { MatchEnriched } from '@/lib/types'
import { isPlayoffBracketMatch } from '@/lib/stats'

const ROUND_LABEL: Record<string, string> = {
  round_of_16: '1/16 финала',
  quarterfinal: '1/4 финала',
  semifinal: '1/2 финала',
  final: 'Финал 🏆',
}

type Props = {
  matches: MatchEnriched[]
  onMatchClick: (m: MatchEnriched) => void
  /** Парный плей-офф: пустые слоты показываем как «Команда не назначена». */
  doublesBracket?: boolean
}

function sideALabel(m: MatchEnriched, doubles: boolean) {
  if (doubles && m.player_a_id == null && m.player_a2_id == null) {
    return { line1: 'Команда не назначена', emoji: '⏳', line2: null as string | null }
  }
  if (!doubles && m.player_a_id == null) {
    return { line1: 'Не назначено', emoji: '⏳', line2: null as string | null }
  }
  return {
    line1: m.player_a_name,
    emoji: m.player_a_emoji,
    line2:
      doubles || m.player_a2_id != null || m.player_a2_name
        ? m.player_a2_name || '—'
        : null,
  }
}

function sideBLabel(m: MatchEnriched, doubles: boolean) {
  if (doubles && m.player_b_id == null && m.player_b2_id == null) {
    return { line1: 'Команда не назначена', emoji: '⏳', line2: null as string | null }
  }
  if (!doubles && m.player_b_id == null) {
    return { line1: 'Не назначено', emoji: '⏳', line2: null as string | null }
  }
  return {
    line1: m.player_b_name,
    emoji: m.player_b_emoji,
    line2:
      doubles || m.player_b2_id != null || m.player_b2_name
        ? m.player_b2_name || '—'
        : null,
  }
}

export function PlayoffBracket({
  matches,
  onMatchClick,
  doublesBracket = false,
}: Props) {
  const columns = useMemo(() => {
    const playoff = matches.filter((m) => isPlayoffBracketMatch(m))
    const byRi = new Map<number, MatchEnriched[]>()
    for (const m of playoff) {
      const ri = m.round_index
      if (!byRi.has(ri)) byRi.set(ri, [])
      byRi.get(ri)!.push(m)
    }
    const sortedKeys = [...byRi.keys()].sort((a, b) => a - b)
    return sortedKeys.map((k) => ({
      roundIndex: k,
      label:
        ROUND_LABEL[byRi.get(k)![0]!.round ?? ''] ??
        `Раунд ${k}`,
      items: [...(byRi.get(k) ?? [])].sort(
        (a, b) => a.bracket_order - b.bracket_order
      ),
    }))
  }, [matches])

  if (columns.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-[var(--ink)] bg-[var(--surface)] p-8 text-center font-semibold text-[var(--ink-muted)]">
        Нет матчей плей-офф
      </p>
    )
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-h-[320px] min-w-max items-stretch gap-6 px-1">
        {columns.map((col, ci) => (
          <div
            key={col.roundIndex}
            className="flex w-[220px] flex-col justify-center gap-4"
          >
            <div className="sticky left-0 rounded-lg border-2 border-[var(--ink)] bg-[var(--lime)] px-2 py-1 text-center text-[10px] font-black uppercase tracking-wider text-[var(--ink)]">
              {col.label}
            </div>
            <div
              className="flex flex-1 flex-col justify-around gap-6"
              style={{
                paddingTop: ci === 0 ? 0 : `${Math.min(24 + ci * 28, 120)}px`,
                paddingBottom: ci === 0 ? 0 : `${Math.min(24 + ci * 28, 120)}px`,
              }}
            >
              {col.items.map((m) => {
                const sa = sideALabel(m, doublesBracket)
                const sb = sideBLabel(m, doublesBracket)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMatchClick(m)}
                    className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] p-3 text-left shadow-[3px_3px_0_var(--ink)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--ink)]"
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                          m.status === 'completed'
                            ? 'bg-[var(--lime)] text-[var(--ink)]'
                            : 'bg-[var(--cream)] text-[var(--ink-muted)]'
                        }`}
                      >
                        {m.status === 'completed' ? '✓' : '⏳'}
                      </span>
                      <span className="font-mono text-sm font-black text-[var(--clay)]">
                        {m.score_a}:{m.score_b}
                      </span>
                    </div>
                    <div className="space-y-1 border-b border-[var(--ink)]/10 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{sa.emoji}</span>
                        <span className="text-xs font-bold leading-tight">
                          {sa.line1}
                        </span>
                      </div>
                      {sa.line2 != null && (
                        <div className="flex items-center gap-2 pl-1">
                          <span className="text-lg">{m.player_a2_emoji}</span>
                          <span className="text-xs font-bold leading-tight">
                            {sa.line2}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{sb.emoji}</span>
                        <span className="text-xs font-bold leading-tight">
                          {sb.line1}
                        </span>
                      </div>
                      {sb.line2 != null && (
                        <div className="flex items-center gap-2 pl-1">
                          <span className="text-lg">{m.player_b2_emoji}</span>
                          <span className="text-xs font-bold leading-tight">
                            {sb.line2}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
