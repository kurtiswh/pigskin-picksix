import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsService, CareerStats } from '@/services/statsService'

/** Compact all-time career summary for a player, shown on their profile.
 *  Renders nothing if the player has no historic/career data. */
export default function CareerStatsCard({ userId }: { userId: string }) {
  const [stats, setStats] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    StatsService.getCareerStats(userId)
      .then(setStats)
      .finally(() => setLoading(false))
  }, [userId])

  if (loading || !stats) return null

  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
  const items: [string, string | number][] = [
    ['Seasons', stats.seasons_played],
    ['Championships', stats.championships],
    ['Top-10 finishes', stats.top10_finishes],
    ['Best finish', `#${stats.best_finish}`],
    ['Career points', stats.career_points?.toLocaleString?.() ?? stats.career_points],
    ['Avg / season', stats.avg_season_points],
    ['Record', `${stats.career_wins}-${stats.career_losses}-${stats.career_pushes}`],
    ['Win %', pct(stats.win_pct)],
    ['Lock win %', pct(stats.lock_win_pct)],
    ['Weekly wins', stats.weekly_wins],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#4B3621]">Career Stats <span className="text-sm font-normal text-charcoal-500">(all-time)</span></CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {items.map(([label, val]) => (
            <div key={label}>
              <div className="text-xl font-bold text-[#4B3621] tabular-nums">{val}</div>
              <div className="text-xs text-charcoal-500">{label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
