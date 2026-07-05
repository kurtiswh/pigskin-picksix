import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { loadRecapSeed, createRecapDraft, type RecapSeed } from '@/services/recapService'

/**
 * Week Review — the weekly close-out hub (Part B / B2).
 *
 * A go/no-go checklist whose rows expand to show the underlying detail and the
 * action for each: games scored, scoring integrity, anonymous ties, over-picks,
 * and the payment gate. Plus an "All Picks by week" table (one row per player).
 * Publish is blocked until scoring is complete and clean. All counts/detail come
 * from SECURITY DEFINER RPCs so RLS/row-caps can't skew them.
 */

interface WeekReviewProps {
  season: number
  initialWeek: number
}

type ItemState = 'ok' | 'warn' | 'info' | 'loading'

interface GameRow {
  id: string
  matchup: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number | null
  winner_against_spread: string | null
  margin_bonus: number | null
  status: string
  scored: boolean
}
interface Discrepancy { kind: string; label: string; issue: string }
interface AnonEntry { email: string; name: string | null; pick_count: number }
interface OverpickEntry {
  user_id: string; display_name: string; pick_count: number
  proposed_pick_id: string; proposed_desc: string; proposed_points: number | null
}
interface UnpaidEntry { user_id: string; display_name: string; email: string; pick_count: number }
interface PickCell {
  matchup: string; selected_team: string; spread: number | null
  is_lock: boolean; result: string | null; points_earned: number | null; disqualified: boolean
}
interface PlayerPicks {
  user_id: string; display_name: string; is_paid: boolean
  picks: PickCell[]; total_points: number
}

interface ReviewData {
  games: GameRow[]
  completedGames: number
  scoredGames: number
  unscoredCount: number
  discrepancies: Discrepancy[]
  anonUnresolved: AnonEntry[]
  overpickDetail: OverpickEntry[]
  unpaidList: UnpaidEntry[]
  allPicks: PlayerPicks[]
  scoringComplete: boolean
  leaderboardComplete: boolean
  customMessage: string
}

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1)

export default function WeekReview({ season, initialWeek }: WeekReviewProps) {
  const [week, setWeek] = useState(initialWeek || 1)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReviewData | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [showAllPicks, setShowAllPicks] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [recap, setRecap] = useState<RecapSeed | null>(null)
  const [recapLoading, setRecapLoading] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)

  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }))

  const loadReview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [gamesRes, discRes, anonRes, overRes, unpaidRes, allRes, wsRes] = await Promise.all([
        supabase.from('games')
          .select('id, home_team, away_team, status, home_score, away_score, spread, winner_against_spread, margin_bonus')
          .eq('season', season).eq('week', week),
        supabase.from('scoring_discrepancies').select('kind, label, issue').eq('season', season).eq('week', week),
        supabase.rpc('wr_anonymous_unmatched', { p_week: week, p_season: season }),
        supabase.rpc('detect_overpick_entries', { p_week: week, p_season: season }),
        supabase.rpc('wr_unpaid_submitters', { p_week: week, p_season: season }),
        supabase.rpc('wr_all_picks', { p_week: week, p_season: season }),
        supabase.from('week_settings').select('scoring_complete, leaderboard_complete, admin_custom_message')
          .eq('season', season).eq('week', week).maybeSingle(),
      ])

      const games: GameRow[] = (gamesRes.data || []).map((g: any) => ({
        id: g.id,
        matchup: `${g.away_team} @ ${g.home_team}`,
        home_team: g.home_team, away_team: g.away_team,
        home_score: g.home_score, away_score: g.away_score, spread: g.spread,
        winner_against_spread: g.winner_against_spread, margin_bonus: g.margin_bonus,
        status: g.status,
        scored: g.winner_against_spread !== null,
      }))
      const completed = games.filter(g => g.status === 'completed' && g.home_score !== null && g.away_score !== null)
      const scored = completed.filter(g => g.scored)

      // group All Picks into per-player rows
      const byPlayer = new Map<string, PlayerPicks>()
      for (const r of (allRes.data as any[]) || []) {
        let pp = byPlayer.get(r.user_id)
        if (!pp) {
          pp = { user_id: r.user_id, display_name: r.display_name, is_paid: r.is_paid, picks: [], total_points: 0 }
          byPlayer.set(r.user_id, pp)
        }
        pp.picks.push({
          matchup: r.matchup, selected_team: r.selected_team, spread: r.spread,
          is_lock: r.is_lock, result: r.result, points_earned: r.points_earned, disqualified: r.disqualified,
        })
        if (!r.disqualified) pp.total_points += r.points_earned || 0
      }
      const allPicks = Array.from(byPlayer.values()).sort((a, b) => b.total_points - a.total_points)

      setData({
        games,
        completedGames: completed.length,
        scoredGames: scored.length,
        unscoredCount: completed.length - scored.length,
        discrepancies: (discRes.data as any[]) || [],
        anonUnresolved: (anonRes.data as any[]) || [],
        overpickDetail: (overRes.data as any[]) || [],
        unpaidList: (unpaidRes.data as any[]) || [],
        allPicks,
        scoringComplete: (wsRes.data as any)?.scoring_complete ?? false,
        leaderboardComplete: (wsRes.data as any)?.leaderboard_complete ?? false,
        customMessage: (wsRes.data as any)?.admin_custom_message ?? '',
      })
      setNoticeMsg((wsRes.data as any)?.admin_custom_message ?? '')
    } catch (err: any) {
      console.error('WeekReview load failed:', err)
      setError(err?.message || 'Failed to load week review data')
    } finally {
      setLoading(false)
    }
  }, [season, week])

  useEffect(() => { loadReview() }, [loadReview])

  // --- actions -------------------------------------------------------------
  const [tying, setTying] = useState(false)
  const autoTieAnon = async () => {
    setTying(true); setError('')
    try {
      const { error: e } = await supabase.rpc('auto_tie_anonymous_picks', { p_week: week, p_season: season })
      if (e) throw e
      await loadReview()
    } catch (err: any) { setError(err?.message || 'Auto-tie failed') } finally { setTying(false) }
  }

  const [dismissTarget, setDismissTarget] = useState<string | null>(null)
  const [dismissNote, setDismissNote] = useState('')
  const [dismissing, setDismissing] = useState(false)
  const dismissAnon = async (email: string) => {
    setDismissing(true); setError('')
    try {
      const { error: e } = await supabase.rpc('dismiss_anonymous_entry', {
        p_email: email, p_week: week, p_season: season, p_note: dismissNote || null,
      })
      if (e) throw e
      setDismissTarget(null); setDismissNote('')
      await loadReview()
    } catch (err: any) { setError(err?.message || 'Dismiss failed') } finally { setDismissing(false) }
  }

  const [droppingId, setDroppingId] = useState<string | null>(null)
  const confirmDrop = async (pickId: string) => {
    setDroppingId(pickId); setError('')
    try {
      const { error: e } = await supabase.rpc('set_pick_disqualified', { p_pick_id: pickId, p_disqualified: true })
      if (e) throw e
      await loadReview()
    } catch (err: any) { setError(err?.message || 'Failed to drop pick') } finally { setDroppingId(null) }
  }

  const [noticeMsg, setNoticeMsg] = useState('')
  const [savingNotice, setSavingNotice] = useState(false)
  const saveNotice = async () => {
    setSavingNotice(true); setError('')
    try {
      const { error: e } = await supabase.from('week_settings')
        .update({ admin_custom_message: noticeMsg || null })
        .eq('season', season).eq('week', week)
      if (e) throw e
      await loadReview()
    } catch (err: any) { setError(err?.message || 'Failed to save notice') } finally { setSavingNotice(false) }
  }

  const generateRecap = async () => {
    setRecapLoading(true); setError('')
    try {
      setRecap(await loadRecapSeed(week, season))
    } catch (err: any) { setError(err?.message || 'Failed to generate recap') } finally { setRecapLoading(false) }
  }
  const createDraft = async () => {
    if (!recap || !user?.id) return
    setCreatingDraft(true); setError('')
    try {
      const post = await createRecapDraft(recap, user.id)
      navigate(`/admin/blog/edit/${post.id}`)
    } catch (err: any) { setError(err?.message || 'Failed to create draft'); setCreatingDraft(false) }
  }

  const publish = async () => {
    if (!data) return
    setPublishing(true); setError('')
    try {
      const { error: e } = await supabase.from('week_settings')
        .update({ scoring_complete: true, leaderboard_complete: true })
        .eq('season', season).eq('week', week)
      if (e) throw e
      await loadReview()
    } catch (err: any) { setError(err?.message || 'Failed to publish week') } finally { setPublishing(false) }
  }

  const scoringClean = !!data && data.completedGames > 0 && data.unscoredCount === 0 && data.discrepancies.length === 0
  const hasWarnings = !!data && (data.anonUnresolved.length > 0 || data.overpickDetail.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-pigskin-900">Week Review</h2>
          <p className="text-charcoal-600 text-sm">Reconcile scoring, resolve entries, and publish the week.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={week} onChange={e => setWeek(Number(e.target.value))}
            className="border border-charcoal-200 rounded-md px-3 py-2 text-sm bg-white">
            {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          <Badge className="bg-gold-500 text-pigskin-900">{season}</Badge>
          <Button variant="outline" size="sm" onClick={loadReview} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Card className="border-red-200"><CardContent className="p-4 text-red-700 text-sm">⚠️ {error}</CardContent></Card>}

      {data?.leaderboardComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-green-800 text-sm font-medium">
            ✅ Week {week} is published — the leaderboard is live for this week.
          </CardContent>
        </Card>
      )}

      {/* Checklist (expandable) */}
      <div className="space-y-3">
        <ExpandRow
          k="games" open={!!open.games} onToggle={() => toggle('games')}
          state={loading ? 'loading' : data && data.completedGames > 0 && data.unscoredCount === 0 ? 'ok' : 'warn'}
          title="Games scored"
          detail={data ? `${data.scoredGames} of ${data.completedGames} completed games have a winner & points.` : '—'}
          pill={data ? (data.unscoredCount === 0 && data.completedGames > 0 ? 'Complete' : `${data.unscoredCount} pending`) : ''}
        >
          <GamesTable games={data?.games || []} />
        </ExpandRow>

        <ExpandRow
          k="integrity" open={!!open.integrity} onToggle={() => toggle('integrity')}
          state={loading ? 'loading' : data && data.discrepancies.length === 0 ? 'ok' : 'warn'}
          title="Scoring integrity"
          detail="Independent re-check vs stored results."
          pill={data ? `${data.discrepancies.length} issues` : ''}
        >
          {data && data.discrepancies.length === 0
            ? <p className="text-sm text-green-700">✓ No discrepancies — stored results match the recompute.</p>
            : <DiscrepancyTable rows={data?.discrepancies || []} />}
        </ExpandRow>

        <ExpandRow
          k="anon" open={!!open.anon} onToggle={() => toggle('anon')}
          state={loading ? 'loading' : data && data.anonUnresolved.length === 0 ? 'ok' : 'warn'}
          title="Anonymous picks"
          detail="Submitted entries not tied to an account."
          pill={data ? (data.anonUnresolved.length === 0 ? 'None' : `${data.anonUnresolved.length} to resolve`) : ''}
        >
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={autoTieAnon} disabled={tying} className="bg-gold-500 text-pigskin-900 hover:bg-gold-600">
              {tying ? 'Tying…' : 'Auto-tie matchable entries'}
            </Button>
          </div>
          {(!data || data.anonUnresolved.length === 0)
            ? <p className="text-sm text-green-700">✓ Nothing to resolve.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-charcoal-500 border-b border-charcoal-100">
                  <th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Picks</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {data.anonUnresolved.map(a => (
                    <tr key={a.email} className="border-b border-charcoal-50 last:border-0 align-top">
                      <td className="px-3 py-2 font-medium">{a.name || '(no name)'}</td>
                      <td className="px-3 py-2 text-charcoal-500">{a.email}</td>
                      <td className="px-3 py-2">{a.pick_count}</td>
                      <td className="px-3 py-2 text-right">
                        {dismissTarget === a.email ? (
                          <div className="flex flex-col items-end gap-2">
                            <Input placeholder="Reason (e.g. no payment found)" value={dismissNote}
                              onChange={e => setDismissNote(e.target.value)} className="w-56 h-8 text-xs" />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setDismissTarget(null); setDismissNote('') }}>Cancel</Button>
                              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => dismissAnon(a.email)} disabled={dismissing}>
                                {dismissing ? 'Dismissing…' : 'Dismiss with note'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setDismissTarget(a.email); setDismissNote('') }}>
                            Dismiss…
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          <p className="text-xs text-charcoal-400 mt-2">
            Auto-tie links paid email-matches. Dismiss (with a note) removes an entry with no matching account from this list.
          </p>
        </ExpandRow>

        <ExpandRow
          k="over" open={!!open.over} onToggle={() => toggle('over')}
          state={loading ? 'loading' : data && data.overpickDetail.length === 0 ? 'ok' : 'warn'}
          title="Over-submissions"
          detail="Entries with more than 6 counted picks (7-pick case)."
          pill={data ? (data.overpickDetail.length === 0 ? 'None' : `${data.overpickDetail.length} to confirm`) : ''}
        >
          {(!data || data.overpickDetail.length === 0)
            ? <p className="text-sm text-green-700">✓ No over-submissions.</p>
            : (
              <>
                <p className="text-sm text-charcoal-600 mb-2">
                  Proposed drop = <span className="font-medium">highest-value non-locked pick</span> (penalty for over-picking; a
                  locked pick is never dropped). Nothing is deleted — the pick is excluded from totals.
                </p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-charcoal-500 border-b border-charcoal-100">
                    <th className="px-3 py-2 font-medium">Entry</th><th className="px-3 py-2 font-medium">Picks</th>
                    <th className="px-3 py-2 font-medium">Proposed drop</th><th className="px-3 py-2 font-medium">Pts</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {data.overpickDetail.map(o => (
                      <tr key={o.user_id} className="border-b border-charcoal-50 last:border-0">
                        <td className="px-3 py-2 font-medium">{o.display_name}</td>
                        <td className="px-3 py-2">{o.pick_count}</td>
                        <td className="px-3 py-2 text-charcoal-700">{o.proposed_desc}</td>
                        <td className="px-3 py-2">{o.proposed_points ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" onClick={() => confirmDrop(o.proposed_pick_id)}
                            disabled={droppingId === o.proposed_pick_id} className="bg-red-600 hover:bg-red-700 text-white">
                            {droppingId === o.proposed_pick_id ? 'Dropping…' : 'Confirm drop'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
        </ExpandRow>

        <ExpandRow
          k="unpaid" open={!!open.unpaid} onToggle={() => toggle('unpaid')}
          state="info"
          title="Payment gate"
          detail="Submitters with no paid entry — excluded from the leaderboard (grace period still applies early)."
          pill={data ? `FYI · ${data.unpaidList.length} unpaid` : ''}
        >
          {(!data || data.unpaidList.length === 0)
            ? <p className="text-sm text-green-700">✓ Every submitter this week has a paid entry.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-charcoal-500 border-b border-charcoal-100">
                  <th className="px-3 py-2 font-medium">Player</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Picks</th>
                </tr></thead>
                <tbody>
                  {data.unpaidList.map(u => (
                    <tr key={u.user_id} className="border-b border-charcoal-50 last:border-0">
                      <td className="px-3 py-2 font-medium">{u.display_name}</td>
                      <td className="px-3 py-2 text-charcoal-500">{u.email}</td>
                      <td className="px-3 py-2">{u.pick_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </ExpandRow>
      </div>

      {/* All Picks by week */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowAllPicks(s => !s)}>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{showAllPicks ? '▾' : '▸'} All Picks — Week {week} ({data?.allPicks.length || 0} players)</span>
          </CardTitle>
        </CardHeader>
        {showAllPicks && (
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-charcoal-100">
                  <th className="px-4 py-2 font-medium">Player</th>
                  <th className="px-4 py-2 font-medium">Picks (🔒 = lock)</th>
                  <th className="px-4 py-2 font-medium text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {(data?.allPicks || []).map(p => (
                  <tr key={p.user_id} className="border-b border-charcoal-50 last:border-0 align-top">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-medium">{p.display_name}</span>
                      {!p.is_paid && <span className="ml-2 text-xs text-red-600">unpaid</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.picks.map((c, i) => <PickChip key={i} cell={c} />)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{p.total_points}</td>
                  </tr>
                ))}
                {(!data || data.allPicks.length === 0) && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-charcoal-400">No submitted picks for this week.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Publish */}
      <Card className={scoringClean ? 'border-green-200' : 'border-amber-200'}>
        <CardContent className="p-5">
          {/* Optional leaderboard notice banner for this week */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-charcoal-700 mb-1">📝 Leaderboard notice (optional)</label>
            <div className="flex gap-2">
              <Input placeholder="Message shown in the leaderboard banner for this week…"
                value={noticeMsg} onChange={e => setNoticeMsg(e.target.value)} className="flex-1" />
              <Button variant="outline" onClick={saveNotice}
                disabled={savingNotice || noticeMsg === (data?.customMessage || '')}>
                {savingNotice ? 'Saving…' : 'Save notice'}
              </Button>
            </div>
          </div>

          {!scoringClean && (
            <div className="text-sm text-amber-800 mb-3">
              <b>Publish is blocked</b> until every completed game is scored and scoring integrity shows 0 issues.
            </div>
          )}
          {scoringClean && hasWarnings && (
            <div className="text-sm text-amber-800 mb-3">
              Scoring is clean, but there are unresolved anonymous picks / over-submissions. You can still publish —
              they don't affect scored results — but resolving them first is recommended.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button onClick={publish}
              disabled={!scoringClean || publishing || (data?.leaderboardComplete ?? false)}
              className="bg-green-600 hover:bg-green-700 text-white">
              {publishing ? 'Publishing…' : data?.leaderboardComplete ? `Week ${week} Published ✓` : `Approve & Publish Week ${week}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly recap seeding */}
      <Card>
        <CardHeader><CardTitle className="text-base">📝 Weekly Recap</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-charcoal-600 mb-3">
            Generate the week's outliers (winner, group/lock %, upsets, lock report, standings, points by game),
            then create a pre-filled draft post you rewrite in your voice.
          </p>
          {!recap ? (
            <Button onClick={generateRecap} disabled={recapLoading} className="bg-pigskin-600 hover:bg-pigskin-700 text-white">
              {recapLoading ? 'Generating…' : 'Generate Recap Draft'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <RecapTile label="Week winner" value={recap.winners?.[0]?.name || '—'} sub={recap.winners?.length > 1 ? `+${recap.winners.length - 1} tied` : recap.winners?.[0] ? `${recap.winners[0].points} pts` : ''} />
                <RecapTile label="Group win %" value={recap.group_win_pct != null ? `${recap.group_win_pct}%` : '—'} sub={`${recap.group_wins}-${recap.group_losses}`} />
                <RecapTile label="Lock win %" value={recap.lock_win_pct != null ? `${recap.lock_win_pct}%` : '—'} sub={`${recap.lock_hits}/${recap.lock_total}`} />
                <RecapTile label="Perfect / winless" value={`${recap.perfect_count} / ${recap.winless_count}`} sub={`${recap.entrants} entrants`} />
              </div>
              <ul className="text-sm text-charcoal-700 space-y-1">
                {recap.biggest_upset && <li>• <b>Upset that hit:</b> {recap.biggest_upset.team} ({recap.biggest_upset.pick_pct}% picked)</li>}
                {recap.biggest_crowd_miss && <li>• <b>Crowd miss:</b> {recap.biggest_crowd_miss.team} ({recap.biggest_crowd_miss.pick_pct}% picked, lost)</li>}
                {recap.best_lock && <li>• <b>Best lock:</b> {recap.best_lock.team} ({recap.best_lock.wins} hit)</li>}
                {recap.worst_lock && <li>• <b>Roughest lock:</b> {recap.worst_lock.losses} burned on {recap.worst_lock.game}</li>}
                {recap.biggest_cover && <li>• <b>Biggest cover:</b> {recap.biggest_cover.team} (+{recap.biggest_cover.bonus} bonus)</li>}
                {recap.season_leader && <li>• <b>Season leader:</b> {recap.season_leader.name} ({recap.season_leader.points} pts)</li>}
              </ul>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={generateRecap} disabled={recapLoading}>Regenerate</Button>
                <Button onClick={createDraft} disabled={creatingDraft} className="bg-gold-500 text-pigskin-900 hover:bg-gold-600">
                  {creatingDraft ? 'Creating…' : '✍️ Create draft post →'}
                </Button>
              </div>
              <p className="text-xs text-charcoal-400">Creates an unpublished post with these numbers + section scaffolding, then opens the editor. You write the prose; email-to-players is on the published post.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RecapTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-charcoal-100 bg-white p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-charcoal-500">{label}</div>
      <div className="text-lg font-bold text-brown leading-tight" style={{ color: '#4B3621' }}>{value}</div>
      {sub && <div className="text-[11px] text-charcoal-500">{sub}</div>}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────
function ExpandRow({
  open, onToggle, state, title, detail, pill, children,
}: {
  k: string; open: boolean; onToggle: () => void; state: ItemState
  title: string; detail: string; pill: string; children: React.ReactNode
}) {
  const styles: Record<ItemState, { bar: string; ic: string; icBg: string; pill: string; glyph: string }> = {
    ok:      { bar: 'border-l-green-600',    ic: 'text-green-700',    icBg: 'bg-green-100',    pill: 'bg-green-100 text-green-800', glyph: '✓' },
    warn:    { bar: 'border-l-amber-500',    ic: 'text-amber-700',    icBg: 'bg-amber-100',    pill: 'bg-amber-100 text-amber-800', glyph: '!' },
    info:    { bar: 'border-l-blue-500',     ic: 'text-blue-700',     icBg: 'bg-blue-100',     pill: 'bg-blue-100 text-blue-800',  glyph: 'i' },
    loading: { bar: 'border-l-charcoal-200', ic: 'text-charcoal-400', icBg: 'bg-charcoal-100', pill: 'bg-charcoal-100 text-charcoal-500', glyph: '…' },
  }
  const s = styles[state]
  return (
    <div className={`bg-white border border-charcoal-100 border-l-4 ${s.bar} rounded-lg overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-charcoal-50/40">
        <div className={`w-9 h-9 rounded-full grid place-items-center font-bold ${s.icBg} ${s.ic}`}>{s.glyph}</div>
        <div className="flex-1">
          <div className="font-semibold text-charcoal-900">{title}</div>
          <div className="text-sm text-charcoal-500">{detail}</div>
        </div>
        {pill && <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${s.pill}`}>{pill}</span>}
        <span className="text-charcoal-400 w-4 text-center">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="border-t border-charcoal-100 px-4 py-3 bg-charcoal-50/20">{children}</div>}
    </div>
  )
}

function GamesTable({ games }: { games: GameRow[] }) {
  if (games.length === 0) return <p className="text-sm text-charcoal-400">No games for this week.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-charcoal-500 border-b border-charcoal-100">
        <th className="px-3 py-2 font-medium">Game</th><th className="px-3 py-2 font-medium">Score</th>
        <th className="px-3 py-2 font-medium">Spread</th><th className="px-3 py-2 font-medium">Winner ATS</th>
        <th className="px-3 py-2 font-medium">Bonus</th><th className="px-3 py-2 font-medium">Status</th>
      </tr></thead>
      <tbody>
        {games.map(g => (
          <tr key={g.id} className="border-b border-charcoal-50 last:border-0">
            <td className="px-3 py-2">{g.matchup}</td>
            <td className="px-3 py-2">{g.home_score !== null ? `${g.away_score}–${g.home_score}` : '—'}</td>
            <td className="px-3 py-2">{g.spread ?? '—'}</td>
            <td className="px-3 py-2">{g.winner_against_spread ?? <span className="text-amber-600">not scored</span>}</td>
            <td className="px-3 py-2">{g.margin_bonus ?? '—'}</td>
            <td className="px-3 py-2">
              <span className={g.status === 'completed' ? (g.scored ? 'text-green-700' : 'text-amber-600') : 'text-charcoal-400'}>
                {g.status}{g.status === 'completed' && !g.scored ? ' (pending)' : ''}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DiscrepancyTable({ rows }: { rows: Discrepancy[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-charcoal-500 border-b border-charcoal-100">
        <th className="px-3 py-2 font-medium">Kind</th><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Issue</th>
      </tr></thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={i} className="border-b border-charcoal-50 last:border-0">
            <td className="px-3 py-2"><Badge variant="outline">{d.kind}</Badge></td>
            <td className="px-3 py-2">{d.label}</td>
            <td className="px-3 py-2 text-charcoal-600">{d.issue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PickChip({ cell }: { cell: PickCell }) {
  const base = 'text-xs px-2 py-0.5 rounded border whitespace-nowrap'
  let cls = 'bg-charcoal-50 border-charcoal-200 text-charcoal-600' // pending
  if (cell.disqualified) cls = 'bg-red-50 border-red-300 text-red-500 line-through'
  else if (cell.result === 'win') cls = 'bg-green-50 border-green-300 text-green-800'
  else if (cell.result === 'loss') cls = 'bg-red-50 border-red-200 text-red-700'
  else if (cell.result === 'push') cls = 'bg-amber-50 border-amber-200 text-amber-800'
  const spread = cell.spread != null ? (cell.spread > 0 ? `+${cell.spread}` : `${cell.spread}`) : ''
  return (
    <span className={`${base} ${cls} ${cell.is_lock ? 'ring-2 ring-gold-400 font-semibold' : ''}`}
      title={`${cell.matchup}${cell.result ? ' · ' + cell.result : ''}${cell.points_earned != null ? ' · ' + cell.points_earned + 'pts' : ''}`}>
      {cell.is_lock ? '🔒 ' : ''}{cell.selected_team} {spread}
    </span>
  )
}
