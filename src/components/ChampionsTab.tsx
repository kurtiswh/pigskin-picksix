import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeaderboardService, LeaderboardEntry, SeasonChampion } from '@/services/leaderboardService'
import { StatsService, SeasonHistoryRow } from '@/services/statsService'
import { useAuth } from '@/hooks/useAuth'
import WinnersDisplay from '@/components/WinnersDisplay'

/** Hall of Champions: past-season winners, expandable to full final standings. */
export default function ChampionsTab() {
  const { user } = useAuth()
  const [champions, setChampions] = useState<SeasonChampion[]>([])
  const [loading, setLoading] = useState(true)
  const [openSeason, setOpenSeason] = useState<number | null>(null)
  const [standings, setStandings] = useState<Record<number, LeaderboardEntry[]>>({})
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null)
  // The logged-in user's own finish per season (rank + entrants), for the "You: #N of M" chip.
  const [myFinishes, setMyFinishes] = useState<Map<number, SeasonHistoryRow>>(new Map())

  useEffect(() => {
    LeaderboardService.getSeasonChampions()
      .then(setChampions)
      .catch(err => console.error('Failed to load champions:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user?.id) { setMyFinishes(new Map()); return }
    StatsService.getSeasonHistory(user.id)
      .then(rows => setMyFinishes(new Map(rows.map(r => [r.season, r]))))
      .catch(err => console.error('Failed to load your season history:', err))
  }, [user?.id])

  // Show every season that has a recorded champion (a completed season).
  const pastSeasons = champions

  const toggleSeason = async (season: number) => {
    if (openSeason === season) { setOpenSeason(null); return }
    setOpenSeason(season)
    if (!standings[season]) {
      setLoadingSeason(season)
      try {
        const entries = await LeaderboardService.getSeasonLeaderboard(season)
        setStandings(prev => ({ ...prev, [season]: entries }))
      } catch (err) {
        console.error(`Failed to load ${season} standings:`, err)
        setStandings(prev => ({ ...prev, [season]: [] }))
      } finally {
        setLoadingSeason(null)
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-charcoal-600 mb-4">Past-season winners. Tap a season to see its final standings.</p>
      {loading ? (
        <div className="text-center text-charcoal-500 py-12">Loading season history…</div>
      ) : pastSeasons.length === 0 ? (
        <div className="text-center text-charcoal-500 py-12">No past seasons yet.</div>
      ) : (
        <div className="space-y-3">
          {pastSeasons.map(({ season, champion, best_finish }) => (
            <Card key={season} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer hover:bg-[#F8F7F3] transition-colors py-4"
                onClick={() => toggleSeason(season)}
              >
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-xl text-[#4B3621] flex items-center gap-2">
                    <span className="text-[#C9A04E]">🏆</span> {season}
                  </CardTitle>
                  <div className="flex-1 text-right">
                    {champion ? (
                      <div className="text-charcoal-800 font-semibold">
                        {champion.display_name}
                        {champion.total_points != null && (
                          <span className="text-charcoal-500 font-normal ml-2">
                            {champion.total_points} pts · {champion.record}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-charcoal-400">No champion recorded</span>
                    )}
                    {best_finish && (
                      <div className="text-sm text-charcoal-500">Best Finish: {best_finish.display_name}</div>
                    )}
                    {myFinishes.get(season) && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-[#fbf4e3] text-[#4B3621] border border-[#C9A04E]/50 rounded-full px-2 py-0.5 tabular-nums">
                          You: #{myFinishes.get(season)!.rank}
                          {myFinishes.get(season)!.entrants ? ` of ${myFinishes.get(season)!.entrants}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-charcoal-400 text-sm">{openSeason === season ? '▲' : '▼'}</span>
                </div>
              </CardHeader>

              {openSeason === season && (
                <CardContent className="pt-0 space-y-6">
                  <WinnersDisplay season={season} hidePayouts />
                  <div>
                    <h3 className="text-sm font-semibold text-charcoal-600 mb-2">Final Standings</h3>
                    {loadingSeason === season ? (
                      <div className="text-center text-charcoal-500 py-6">Loading standings…</div>
                    ) : (standings[season]?.length ?? 0) === 0 ? (
                      <div className="text-center text-charcoal-500 py-6">No standings found.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-charcoal-500 border-b">
                              <th className="py-2 pr-2 w-12">#</th>
                              <th className="py-2 pr-2">Player</th>
                              <th className="py-2 pr-2 text-right">Record</th>
                              <th className="py-2 pr-2 text-right">Lock</th>
                              <th className="py-2 pl-2 text-right">Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings[season].map(e => {
                              const isMe = !!user?.id && e.user_id === user.id
                              return (
                                <tr key={e.user_id} className={`border-b last:border-0 ${isMe ? 'bg-[#fbf4e3]' : 'hover:bg-[#F8F7F3]'}`}>
                                  <td className="py-2 pr-2 text-charcoal-500 tabular-nums">{e.season_rank}</td>
                                  <td className={`py-2 pr-2 ${isMe ? 'font-semibold text-[#4B3621]' : 'text-charcoal-800'}`}>
                                    {e.display_name}{isMe && <span className="ml-2 text-[10px] font-bold uppercase text-[#C9A04E]">You</span>}
                                  </td>
                                  <td className="py-2 pr-2 text-right text-charcoal-600 tabular-nums">{e.season_record}</td>
                                  <td className="py-2 pr-2 text-right text-charcoal-600 tabular-nums">{e.lock_record}</td>
                                  <td className="py-2 pl-2 text-right font-semibold text-[#4B3621] tabular-nums">
                                    {e.season_points ?? e.total_points}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
