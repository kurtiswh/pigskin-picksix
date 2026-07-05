import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsService, CareerStats, SeasonHistoryRow } from '@/services/statsService'

interface Props {
  userId: string
  bestWeekScore?: number
  currentSeasonPoints?: number
}

export default function CareerStatsCard({ userId, bestWeekScore, currentSeasonPoints }: Props) {
  const [stats, setStats] = useState<CareerStats | null>(null)
  const [history, setHistory] = useState<SeasonHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      StatsService.getCareerStats(userId).then(setStats),
      StatsService.getSeasonHistory(userId).then(setHistory),
    ]).finally(() => setLoading(false))
  }, [userId])

  if (loading) return null
  if (!stats && bestWeekScore == null && currentSeasonPoints == null) return null

  const pctFmt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
  // "top N%" from the player's rank among all players (computed in the view).
  const topPct = (rank?: number) => {
    const total = stats?.total_players
    if (!rank || !total) return null
    return `top ${Math.max(1, Math.round((rank / total) * 100))}%`
  }

  type Tile = { label: string; value: string | number; note?: string | null }
  const tiles: Tile[] = []
  if (stats) {
    tiles.push(
      { label: 'Seasons', value: stats.seasons_played },
      { label: 'Championships', value: stats.championships },
      { label: 'Career Points', value: stats.career_points?.toLocaleString?.() ?? stats.career_points,
        note: topPct(stats.career_points_rank) },
      { label: 'Avg Pts / Season', value: stats.avg_season_points,
        note: topPct(stats.avg_season_points_rank) },
      { label: 'Best Finish', value: `#${stats.best_finish}` },
      { label: 'Avg Finish', value: stats.avg_finish,
        note: topPct(stats.avg_finish_rank) },
      { label: 'Win %', value: pctFmt(stats.win_pct),
        note: topPct(stats.win_pct_rank) },
      { label: 'Lock Win %', value: pctFmt(stats.lock_win_pct),
        note: topPct(stats.lock_win_pct_rank) },
      { label: 'Top-10s', value: stats.top10_finishes },
      { label: 'Weekly Wins', value: stats.weekly_wins },
    )
  }
  if (bestWeekScore != null) tiles.push({ label: 'Best Week', value: `${bestWeekScore}` })
  if (currentSeasonPoints != null) tiles.push({ label: 'This Season', value: `${currentSeasonPoints}` })

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base text-[#4B3621]">
          Career Stats <span className="text-xs font-normal text-charcoal-500">· all-time · % vs. all players</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {tiles.map(t => (
            <div key={t.label} className="rounded-md bg-[#F8F7F3] px-2.5 py-1.5">
              <div className="text-lg font-bold text-[#4B3621] tabular-nums leading-tight">{t.value}</div>
              <div className="text-[11px] text-charcoal-500 leading-tight">{t.label}</div>
              {t.note && <div className="text-[11px] text-[#8a6a1f] font-medium">{t.note}</div>}
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-charcoal-600 mb-1">Season by Season</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-charcoal-400 border-b">
                    <th className="py-1.5 pr-3 font-medium">Season</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Finish</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Record</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Lock</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Points</th>
                    <th className="py-1.5 font-medium">Awards</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.season} className="border-b last:border-0 hover:bg-[#F8F7F3]">
                      <td className="py-1.5 pr-3 font-medium text-charcoal-800 tabular-nums">{h.season}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-charcoal-700">
                        {h.rank ? `#${h.rank}` : '—'}
                        {h.entrants ? <span className="text-charcoal-400"> / {h.entrants}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-charcoal-600">
                        {h.wins}-{h.losses}-{h.pushes}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-charcoal-600">
                        {h.lock_wins}-{h.lock_losses}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-[#4B3621]">
                        {h.total_points}
                      </td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {h.awards.map(a => (
                            <span key={a} className="text-[11px] rounded-full bg-[#C9A04E]/15 text-[#8a6a1f] px-2 py-0.5">
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
