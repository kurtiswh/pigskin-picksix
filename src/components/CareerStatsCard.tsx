import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsService, CareerStats, SeasonHistoryRow } from '@/services/statsService'

interface Props {
  userId: string
  /** Optional current-season extras (from the live profile stats). */
  bestWeekScore?: number
  currentSeasonPoints?: number
}

/** All-time career summary + year-by-year performance for a player.
 *  Renders nothing if the player has no historic/career data. */
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
  // Nothing to show at all (no historic career data and no current-season extras)
  if (!stats && bestWeekScore == null && currentSeasonPoints == null) return null

  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

  const highlights: [string, string | number][] = []
  if (stats) {
    highlights.push(
      ['Seasons', stats.seasons_played],
      ['Championships', stats.championships],
      ['Best Finish', `#${stats.best_finish}`],
      ['Avg Finish', stats.avg_finish],
      ['Career Points', stats.career_points?.toLocaleString?.() ?? stats.career_points],
      ['Avg Pts / Season', stats.avg_season_points],
      ['Win %', pct(stats.win_pct)],
      ['Lock Win %', pct(stats.lock_win_pct)],
      ['Top-10 Finishes', stats.top10_finishes],
      ['Weekly Wins', stats.weekly_wins],
    )
  }
  if (bestWeekScore != null) highlights.push(['Best Week', `${bestWeekScore} pts`])
  if (currentSeasonPoints != null) highlights.push(['This Season', `${currentSeasonPoints} pts`])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#4B3621]">
          Career Stats <span className="text-sm font-normal text-charcoal-500">· all-time</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Highlight strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {highlights.map(([label, val]) => (
            <div key={label} className="rounded-lg bg-[#F8F7F3] px-3 py-2">
              <div className="text-xl font-bold text-[#4B3621] tabular-nums leading-tight">{val}</div>
              <div className="text-xs text-charcoal-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Year-by-year */}
        {history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-charcoal-600 mb-2">Season by Season</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-charcoal-400 border-b">
                    <th className="py-2 pr-3 font-medium">Season</th>
                    <th className="py-2 pr-3 font-medium text-right">Finish</th>
                    <th className="py-2 pr-3 font-medium text-right">Record</th>
                    <th className="py-2 pr-3 font-medium text-right">Lock</th>
                    <th className="py-2 pr-3 font-medium text-right">Points</th>
                    <th className="py-2 font-medium">Awards</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.season} className="border-b last:border-0 hover:bg-[#F8F7F3]">
                      <td className="py-2 pr-3 font-medium text-charcoal-800 tabular-nums">{h.season}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-charcoal-700">
                        {h.rank ? `#${h.rank}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-charcoal-600">
                        {h.wins}-{h.losses}-{h.pushes}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-charcoal-600">
                        {h.lock_wins}-{h.lock_losses}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-[#4B3621]">
                        {h.total_points}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {h.awards.map(a => (
                            <span key={a} className="text-xs rounded-full bg-[#C9A04E]/15 text-[#8a6a1f] px-2 py-0.5">
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
