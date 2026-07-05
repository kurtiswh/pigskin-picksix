import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsService, CareerStats, BiggestWeek, TeamAts, PerfectWeeks, Contrarian, WeekDifficulty, WeekSlate } from '@/services/statsService'
import { useAuth } from '@/hooks/useAuth'

interface Board {
  title: string
  column: string        // player_career_stats column to order by
  rankKey: keyof CareerStats  // precomputed rank column for the current user's "You: #N"
  asc?: boolean         // lower is better
  minSeasons?: number   // rate stats need a sample
  fmt: (s: CareerStats) => string
  sub: (s: CareerStats) => string
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

// Seasons-played is shown once next to each name (see legend); subs carry the
// stat-specific context only.
const BOARDS: Board[] = [
  { title: 'Most Championships', column: 'championships', rankKey: 'championships_rank',
    fmt: s => `${s.championships}`, sub: s => `${s.top3_finishes} top-3` },
  { title: 'Career Points', column: 'career_points', rankKey: 'career_points_rank',
    fmt: s => s.career_points.toLocaleString(), sub: s => `${s.avg_season_points}/season` },
  { title: 'Best Avg Points / Season', column: 'avg_season_points', rankKey: 'avg_season_points_rank', minSeasons: 3,
    fmt: s => `${s.avg_season_points}`, sub: s => `${s.career_points.toLocaleString()} total` },
  { title: 'Win %', column: 'win_pct', rankKey: 'win_pct_rank', minSeasons: 3,
    fmt: s => pct(s.win_pct), sub: s => `${s.career_wins}-${s.career_losses}-${s.career_pushes}` },
  { title: 'Lock Win %', column: 'lock_win_pct', rankKey: 'lock_win_pct_rank', minSeasons: 3,
    fmt: s => pct(s.lock_win_pct), sub: s => `${s.career_lock_wins}-${s.career_lock_losses} locks` },
  { title: 'Most Weekly Wins', column: 'weekly_wins', rankKey: 'weekly_wins_rank',
    fmt: s => `${s.weekly_wins}`, sub: s => `${s.championships} titles` },
  { title: 'Most Top-10 Finishes', column: 'top10_finishes', rankKey: 'top10_finishes_rank',
    fmt: s => `${s.top10_finishes}`, sub: s => `${s.top3_finishes} top-3` },
  { title: 'Best Avg Finish', column: 'avg_finish', rankKey: 'avg_finish_rank', asc: true, minSeasons: 3,
    fmt: s => `${s.avg_finish}`, sub: s => `best ${s.best_finish}` },
  { title: 'Most Seasons Played', column: 'seasons_played', rankKey: 'seasons_played_rank',
    fmt: s => `${s.seasons_played}`, sub: s => `${s.championships} titles` },
]

function BoardCard({ board, rows, me }: { board: Board; rows: CareerStats[]; me?: CareerStats | null }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rows : rows.slice(0, 10)
  const myRank = me ? ((me[board.rankKey] as number | null | undefined) ?? null) : null
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <CardTitle className="text-base text-[#4B3621]">{board.title}</CardTitle>
          {myRank != null && (
            <span className="text-xs font-semibold bg-[#fbf4e3] text-[#4B3621] border border-[#C9A04E]/50 rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap shrink-0">
              You: #{myRank}{me?.total_players ? ` of ${me.total_players}` : ''}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-1">
          {shown.map((s, i) => {
            const isMe = !!me?.user_id && s.user_id === me.user_id
            return (
              <li
                key={s.user_id}
                className={`flex items-baseline justify-between gap-2 text-sm rounded px-1 -mx-1 ${isMe ? 'bg-[#fbf4e3] ring-1 ring-[#C9A04E]/50' : ''}`}
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="w-5 text-charcoal-400 tabular-nums">{i + 1}</span>
                  <span className={`truncate ${isMe ? 'font-semibold text-[#4B3621]' : 'text-charcoal-800'}`}>{s.display_name}</span>
                  <span className="text-xs text-charcoal-400 tabular-nums shrink-0">{s.seasons_played}</span>
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="font-semibold text-[#4B3621] tabular-nums">{board.fmt(s)}</span>
                  <span className="text-xs text-charcoal-400">{board.sub(s)}</span>
                </span>
              </li>
            )
          })}
        </ol>
        {rows.length > 10 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-2 text-xs font-semibold text-[#C9A04E] hover:text-[#4B3621] transition-colors"
          >
            {expanded ? 'Show top 10' : `Show all ${rows.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

function SimpleTable({ title, note, headers, rows, youNote }: {
  title: string; note?: string; headers: string[]; rows: (string | number)[][]; youNote?: string
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <CardTitle className="text-base text-[#4B3621]">{title}</CardTitle>
          {youNote && (
            <span className="text-xs font-semibold bg-[#fbf4e3] text-[#4B3621] border border-[#C9A04E]/50 rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap shrink-0">
              {youNote}
            </span>
          )}
        </div>
        {note && <p className="text-xs text-charcoal-400">{note}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-charcoal-400 border-b">
                {headers.map((h, i) => (
                  <th key={h} className={`py-1 font-medium whitespace-nowrap ${i === 0 ? '' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={`py-1.5 whitespace-nowrap ${ci === 0 ? 'text-charcoal-800' : 'text-right tabular-nums text-charcoal-600 pl-3'}`}>
                      {ci === 0 ? <span><span className="w-5 inline-block text-charcoal-400">{ri + 1}</span>{c}</span> : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/** All-Time Records: career leaderboards + pick analytics. */
export default function RecordsTab() {
  const { user } = useAuth()
  const [boardRows, setBoardRows] = useState<Record<string, CareerStats[]>>({})
  const [weeks, setWeeks] = useState<BiggestWeek[]>([])
  const [teams, setTeams] = useState<TeamAts[]>([])
  const [perfect, setPerfect] = useState<PerfectWeeks[]>([])
  const [goose, setGoose] = useState<PerfectWeeks[]>([])
  const [contrarian, setContrarian] = useState<Contrarian[]>([])
  const [weekDiff, setWeekDiff] = useState<WeekDifficulty[]>([])
  const [hardestSlates, setHardestSlates] = useState<WeekSlate[]>([])
  const [easiestSlates, setEasiestSlates] = useState<WeekSlate[]>([])
  const [me, setMe] = useState<CareerStats | null>(null)
  const [myPerfect, setMyPerfect] = useState<PerfectWeeks | null>(null)
  const [myContrarian, setMyContrarian] = useState<Contrarian | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) { setMe(null); setMyPerfect(null); setMyContrarian(null); return }
    StatsService.getCareerStats(user.id).then(setMe).catch(() => setMe(null))
    StatsService.getMyPerfectWeeks(user.id).then(setMyPerfect).catch(() => setMyPerfect(null))
    StatsService.getMyContrarian(user.id).then(setMyContrarian).catch(() => setMyContrarian(null))
  }, [user?.id])

  useEffect(() => {
    Promise.all([
      // Pull up to 100 per board so ties (e.g. everyone with 20 seasons) aren't
      // truncated; the card shows the top 10 with a "Show all" expander.
      Promise.all(BOARDS.map(b =>
        StatsService.getTopCareer(b.column, b.asc ?? false, b.minSeasons ?? 1, 100)
          .then(rows => [b.title, rows] as const)
      )).then(pairs => setBoardRows(Object.fromEntries(pairs))),
      StatsService.getBiggestWeeks(10).then(setWeeks),
      StatsService.getTeamAts().then(setTeams),
      StatsService.getPerfectWeeks(10).then(setPerfect),
      StatsService.getGooseEggs(10).then(setGoose),
      StatsService.getContrarian(10).then(setContrarian),
      StatsService.getWeekDifficulty().then(setWeekDiff),
      StatsService.getHardestSlates(8).then(setHardestSlates),
      StatsService.getEasiestSlates(8).then(setEasiestSlates),
    ]).finally(() => setLoading(false))
  }, [])

  const pctStr = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
  const teamsQualified = teams.filter(t => t.wins + t.losses >= 150)
  const mostPicked = [...teams].sort((a, b) => b.times_picked - a.times_picked).slice(0, 10)
  const bestTeams = [...teamsQualified].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0)).slice(0, 10)
  const worstTeams = [...teamsQualified].sort((a, b) => (a.win_pct ?? 0) - (b.win_pct ?? 0)).slice(0, 10)

  // Logged-in user's own fun-stat lines (shown as a chip on each person table)
  const perfectYou = myPerfect ? `You: ${myPerfect.perfect_weeks}${myPerfect.perfect_rank ? ` · #${myPerfect.perfect_rank}` : ''}` : undefined
  const gooseYou = myPerfect ? `You: ${myPerfect.goose_weeks}${myPerfect.goose_rank ? ` · #${myPerfect.goose_rank}` : ''}` : undefined
  const contrarianYou = myContrarian ? `You: ${myContrarian.contrarian_wins}${myContrarian.contrarian_rank ? ` · #${myContrarian.contrarian_rank}` : ''}` : undefined

  if (loading) return <div className="text-center text-charcoal-500 py-12">Loading records…</div>

  return (
    <div className="max-w-6xl mx-auto">
      <p className="text-charcoal-600 mb-4">
        Career leaders across every Pigskin Pick Six season (2006–2025).
        <span className="text-charcoal-400"> The small number after each name is seasons played.</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BOARDS.map(b => <BoardCard key={b.title} board={b} rows={boardRows[b.title] || []} me={me} />)}
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
        <SimpleTable title="Most Perfect Weeks" note="all picks won in a week" headers={['Player', 'Perfect', '0-win']}
          youNote={perfectYou}
          rows={perfect.map(p => [p.display_name, p.perfect_weeks, p.goose_weeks])} />
        <SimpleTable title="Most Goose Eggs" note="zero wins in a week" headers={['Player', '0-win', 'Perfect']}
          youNote={gooseYou}
          rows={goose.map(p => [p.display_name, p.goose_weeks, p.perfect_weeks])} />
        <SimpleTable title="Contrarian King" note="correct picks vs. the field's majority" headers={['Player', 'Wins', 'vs-field']}
          youNote={contrarianYou}
          rows={contrarian.map(c => [c.display_name, c.contrarian_wins, c.contrarian_picks])} />
        <SimpleTable title="Hardest Weeks" note="field ATS win% by week #" headers={['Week', 'ATS %', 'Picks']}
          rows={weekDiff.map(w => [`Week ${w.week}`, pctStr(w.win_pct), w.total_picks.toLocaleString()])} />
        <SimpleTable title="Hardest Slates Ever" note="lowest field ATS% for a single week" headers={['Slate', 'ATS %', 'Picks']}
          rows={hardestSlates.map(s => [`${s.season} W${s.week}`, pctStr(s.win_pct), s.total_picks.toLocaleString()])} />
        <SimpleTable title="Easiest Slates Ever" note="highest field ATS% for a single week" headers={['Slate', 'ATS %', 'Picks']}
          rows={easiestSlates.map(s => [`${s.season} W${s.week}`, pctStr(s.win_pct), s.total_picks.toLocaleString()])} />
      </div>
    </div>
  )
}
