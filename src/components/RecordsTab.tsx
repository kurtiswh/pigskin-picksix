import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsService, CareerStats, BiggestWeek, TeamAts } from '@/services/statsService'

type Accessor = (s: CareerStats) => number | null
interface Board {
  title: string
  value: Accessor
  fmt: (s: CareerStats) => string
  sub: (s: CareerStats) => string
  asc?: boolean
  minSeasons?: number
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

// Seasons-played is shown once next to each name (see legend); subs carry the
// stat-specific context only.
const BOARDS: Board[] = [
  { title: 'Most Championships', value: s => s.championships,
    fmt: s => `${s.championships}`, sub: s => `${s.top3_finishes} top-3` },
  { title: 'Career Points', value: s => s.career_points,
    fmt: s => s.career_points.toLocaleString(), sub: s => `${s.avg_season_points}/season` },
  { title: 'Best Avg Points / Season', value: s => s.avg_season_points, minSeasons: 3,
    fmt: s => `${s.avg_season_points}`, sub: s => `${s.career_points.toLocaleString()} total` },
  { title: 'Win %', value: s => s.win_pct, minSeasons: 3,
    fmt: s => pct(s.win_pct), sub: s => `${s.career_wins}-${s.career_losses}-${s.career_pushes}` },
  { title: 'Lock Win %', value: s => s.lock_win_pct, minSeasons: 3,
    fmt: s => pct(s.lock_win_pct), sub: s => `${s.career_lock_wins}-${s.career_lock_losses} locks` },
  { title: 'Most Weekly Wins', value: s => s.weekly_wins,
    fmt: s => `${s.weekly_wins}`, sub: s => `${s.championships} titles` },
  { title: 'Most Top-10 Finishes', value: s => s.top10_finishes,
    fmt: s => `${s.top10_finishes}`, sub: s => `${s.top3_finishes} top-3` },
  { title: 'Best Avg Finish', value: s => s.avg_finish, asc: true, minSeasons: 3,
    fmt: s => `${s.avg_finish}`, sub: s => `best ${s.best_finish}` },
  { title: 'Most Seasons Played', value: s => s.seasons_played,
    fmt: s => `${s.seasons_played}`, sub: s => `${s.championships} titles` },
]

function BoardCard({ board, rows }: { board: Board; rows: CareerStats[] }) {
  const pool = rows.filter(s => !board.minSeasons || s.seasons_played >= board.minSeasons)
    .filter(s => board.value(s) != null)
  const sorted = [...pool].sort((a, b) => {
    const av = board.value(a) ?? 0, bv = board.value(b) ?? 0
    return board.asc ? av - bv : bv - av
  }).slice(0, 10)
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base text-[#4B3621]">{board.title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-1">
          {sorted.map((s, i) => (
            <li key={s.user_id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="w-5 text-charcoal-400 tabular-nums">{i + 1}</span>
                <span className="text-charcoal-800 truncate">{s.display_name}</span>
                <span className="text-xs text-charcoal-400 tabular-nums shrink-0">{s.seasons_played}</span>
              </span>
              <span className="flex items-baseline gap-2 shrink-0">
                <span className="font-semibold text-[#4B3621] tabular-nums">{board.fmt(s)}</span>
                <span className="text-xs text-charcoal-400">{board.sub(s)}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function SimpleTable({ title, note, headers, rows }: {
  title: string; note?: string; headers: string[]; rows: (string | number)[][]
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base text-[#4B3621]">{title}</CardTitle>
        {note && <p className="text-xs text-charcoal-400">{note}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-charcoal-400 border-b">
              {headers.map((h, i) => (
                <th key={h} className={`py-1 font-medium ${i === 0 ? '' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b last:border-0">
                {r.map((c, ci) => (
                  <td key={ci} className={`py-1.5 ${ci === 0 ? 'text-charcoal-800' : 'text-right tabular-nums text-charcoal-600'}`}>
                    {ci === 0 ? <span><span className="w-5 inline-block text-charcoal-400">{ri + 1}</span>{c}</span> : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

/** All-Time Records: career leaderboards + pick analytics. */
export default function RecordsTab() {
  const [rows, setRows] = useState<CareerStats[]>([])
  const [weeks, setWeeks] = useState<BiggestWeek[]>([])
  const [teams, setTeams] = useState<TeamAts[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      StatsService.getAllCareerStats().then(setRows),
      StatsService.getBiggestWeeks(10).then(setWeeks),
      StatsService.getTeamAts().then(setTeams),
    ]).finally(() => setLoading(false))
  }, [])

  const pctStr = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
  const teamsQualified = teams.filter(t => t.wins + t.losses >= 150)
  const mostPicked = [...teams].sort((a, b) => b.times_picked - a.times_picked).slice(0, 10)
  const bestTeams = [...teamsQualified].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0)).slice(0, 10)
  const worstTeams = [...teamsQualified].sort((a, b) => (a.win_pct ?? 0) - (b.win_pct ?? 0)).slice(0, 10)

  if (loading) return <div className="text-center text-charcoal-500 py-12">Loading records…</div>
  if (rows.length === 0) return <div className="text-center text-charcoal-500 py-12">No stats available yet.</div>

  return (
    <div className="max-w-6xl mx-auto">
      <p className="text-charcoal-600 mb-4">
        Career leaders across every Pigskin Pick Six season (2006–2024).
        <span className="text-charcoal-400"> The small number after each name is seasons played.</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BOARDS.map(b => <BoardCard key={b.title} board={b} rows={rows} />)}
      </div>

      <h2 className="text-xl font-bold text-[#4B3621] mt-10 mb-3">
        Pick Analytics <span className="text-sm font-normal text-charcoal-500">(2016–2024)</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SimpleTable title="Biggest Single Weeks" headers={['Player', 'Season/Wk', 'Pts']}
          rows={weeks.map(w => [w.display_name, `${w.season} W${w.week}`, w.points])} />
        <SimpleTable title="Most-Picked Teams" headers={['Team', 'Picks', 'ATS %']}
          rows={mostPicked.map(t => [t.team, t.times_picked.toLocaleString(), pctStr(t.win_pct)])} />
        <SimpleTable title="Best Teams to Pick (ATS)" note="min 150 decisions" headers={['Team', 'Rec', 'ATS %']}
          rows={bestTeams.map(t => [t.team, `${t.wins}-${t.losses}`, pctStr(t.win_pct)])} />
        <SimpleTable title="Worst Teams to Pick (ATS)" note="min 150 decisions" headers={['Team', 'Rec', 'ATS %']}
          rows={worstTeams.map(t => [t.team, `${t.wins}-${t.losses}`, pctStr(t.win_pct)])} />
      </div>
    </div>
  )
}
