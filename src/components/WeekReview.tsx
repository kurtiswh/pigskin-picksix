import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

/**
 * Week Review — the single weekly close-out hub (Part B / Workstream B2).
 *
 * Answers one question for the admin: "is this week correct, and can I publish it?"
 * A checklist that must go green before the leaderboard is published:
 *   1. Games scored        — every completed game has a winner + points
 *   2. Scoring integrity    — scoring_discrepancies view returns 0 rows
 *   3. Anonymous picks      — submitted entries not yet tied to an account
 *   4. Over-submissions     — entries with >6 counted picks (7-pick DQ case)
 *   5. Payment gate (FYI)   — submitters who won't appear on the leaderboard
 *
 * Publish is blocked until scoring is complete AND has zero discrepancies.
 * The inline resolve flows for anonymous ties (B3) and disqualification drops
 * (B4) land in later workstreams — for now those items link out / are advisory.
 */

interface WeekReviewProps {
  season: number
  initialWeek: number
}

type ItemState = 'ok' | 'warn' | 'info' | 'loading'

interface Discrepancy {
  kind: string
  label: string
  issue: string
}

interface AnonEntry {
  name: string | null
  email: string
  count: number
}

interface ReviewData {
  completedGames: number
  scoredGames: number
  unscoredGames: string[]
  discrepancies: Discrepancy[]
  anonUnresolved: AnonEntry[]
  overSubmitted: number
  unpaidSubmitters: number
  scoringComplete: boolean
  leaderboardComplete: boolean
}

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1)

export default function WeekReview({ season, initialWeek }: WeekReviewProps) {
  const [week, setWeek] = useState(initialWeek || 1)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReviewData | null>(null)

  const loadReview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // --- 1. Games scored -------------------------------------------------
      const { data: games, error: gamesErr } = await supabase
        .from('games')
        .select('id, home_team, away_team, status, home_score, away_score, winner_against_spread')
        .eq('season', season)
        .eq('week', week)
      if (gamesErr) throw gamesErr

      const completed = (games || []).filter(
        g => g.status === 'completed' && g.home_score !== null && g.away_score !== null
      )
      const scored = completed.filter(g => g.winner_against_spread !== null)
      const unscored = completed
        .filter(g => g.winner_against_spread === null)
        .map(g => `${g.away_team} @ ${g.home_team}`)

      // --- 2. Scoring integrity (independent recompute) --------------------
      const { data: disc } = await supabase
        .from('scoring_discrepancies')
        .select('kind, label, issue')
        .eq('season', season)
        .eq('week', week)

      // --- 3. Anonymous picks not yet tied to an account ------------------
      const { data: anon } = await supabase
        .from('anonymous_picks')
        .select('name, email')
        .eq('season', season)
        .eq('week', week)
        .eq('submitted', true)
        .is('assigned_user_id', null)

      const anonMap = new Map<string, AnonEntry>()
      for (const a of anon || []) {
        const e = anonMap.get(a.email) || { name: a.name, email: a.email, count: 0 }
        e.count++
        anonMap.set(a.email, e)
      }
      const anonUnresolved = Array.from(anonMap.values())

      // --- 4. Over-submissions (>6 counted picks) ------------------------
      const { data: submittedPicks } = await supabase
        .from('picks')
        .select('user_id')
        .eq('season', season)
        .eq('week', week)
        .eq('submitted', true)

      const pickCounts = new Map<string, number>()
      for (const p of submittedPicks || []) {
        pickCounts.set(p.user_id, (pickCounts.get(p.user_id) || 0) + 1)
      }
      const overSubmitted = Array.from(pickCounts.values()).filter(c => c > 6).length

      // --- 5. Payment gate (FYI) -----------------------------------------
      const submitterIds = Array.from(pickCounts.keys())
      let unpaidSubmitters = 0
      if (submitterIds.length > 0) {
        const { data: payments } = await supabase
          .from('leaguesafe_payments')
          .select('user_id, status')
          .eq('season', season)
          .eq('status', 'Paid')
        const paidIds = new Set((payments || []).map(p => p.user_id))
        unpaidSubmitters = submitterIds.filter(id => !paidIds.has(id)).length
      }

      // --- week_settings publish flags ----------------------------------
      const { data: ws } = await supabase
        .from('week_settings')
        .select('scoring_complete, leaderboard_complete')
        .eq('season', season)
        .eq('week', week)
        .maybeSingle()

      setData({
        completedGames: completed.length,
        scoredGames: scored.length,
        unscoredGames: unscored,
        discrepancies: disc || [],
        anonUnresolved,
        overSubmitted,
        unpaidSubmitters,
        scoringComplete: ws?.scoring_complete ?? false,
        leaderboardComplete: ws?.leaderboard_complete ?? false,
      })
    } catch (err: any) {
      console.error('WeekReview load failed:', err)
      setError(err?.message || 'Failed to load week review data')
    } finally {
      setLoading(false)
    }
  }, [season, week])

  useEffect(() => {
    loadReview()
  }, [loadReview])

  const [tying, setTying] = useState(false)
  const autoTieAnon = async () => {
    setTying(true)
    setError('')
    try {
      const { error: rpcErr } = await supabase.rpc('auto_tie_anonymous_picks', {
        p_week: week,
        p_season: season,
      })
      if (rpcErr) throw rpcErr
      await loadReview()
    } catch (err: any) {
      console.error('Auto-tie failed:', err)
      setError(err?.message || 'Auto-tie failed')
    } finally {
      setTying(false)
    }
  }

  const publish = async () => {
    if (!data) return
    setPublishing(true)
    setError('')
    try {
      const { error: upErr } = await supabase
        .from('week_settings')
        .update({ scoring_complete: true, leaderboard_complete: true })
        .eq('season', season)
        .eq('week', week)
      if (upErr) throw upErr
      await loadReview()
    } catch (err: any) {
      console.error('Publish failed:', err)
      setError(err?.message || 'Failed to publish week')
    } finally {
      setPublishing(false)
    }
  }

  // Publish is blocked until scoring is complete and clean.
  const scoringClean =
    !!data && data.completedGames > 0 && data.unscoredGames.length === 0 && data.discrepancies.length === 0
  const hasWarnings = !!data && (data.anonUnresolved.length > 0 || data.overSubmitted > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-pigskin-900">Week Review</h2>
          <p className="text-charcoal-600 text-sm">Reconcile scoring, resolve entries, and publish the week.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={week}
            onChange={e => setWeek(Number(e.target.value))}
            className="border border-charcoal-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            {WEEKS.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
          <Badge className="bg-gold-500 text-pigskin-900">{season}</Badge>
          <Button variant="outline" size="sm" onClick={loadReview} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200">
          <CardContent className="p-4 text-red-700 text-sm">⚠️ {error}</CardContent>
        </Card>
      )}

      {data?.leaderboardComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-green-800 text-sm font-medium">
            ✅ Week {week} is published — the leaderboard is live for this week.
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      <div className="space-y-3">
        <ChecklistRow
          state={loading ? 'loading' : data && data.completedGames > 0 && data.unscoredGames.length === 0 ? 'ok' : 'warn'}
          title="Games scored"
          detail={
            data
              ? `${data.scoredGames} of ${data.completedGames} completed games have a winner & points assigned.`
              : '—'
          }
          pill={
            data
              ? data.unscoredGames.length === 0 && data.completedGames > 0
                ? 'Complete'
                : `${data.unscoredGames.length} pending`
              : ''
          }
        />
        <ChecklistRow
          state={loading ? 'loading' : data && data.discrepancies.length === 0 ? 'ok' : 'warn'}
          title="Scoring integrity"
          detail="Independent re-check compares stored results to a fresh recompute."
          pill={data ? `${data.discrepancies.length} issues` : ''}
        />
        <ChecklistRow
          state={loading ? 'loading' : data && data.anonUnresolved.length === 0 ? 'ok' : 'warn'}
          title="Anonymous picks"
          detail="Submitted entries not yet tied to an account."
          pill={data ? (data.anonUnresolved.length === 0 ? 'None' : `${data.anonUnresolved.length} to resolve`) : ''}
        />
        <ChecklistRow
          state={loading ? 'loading' : data && data.overSubmitted === 0 ? 'ok' : 'warn'}
          title="Over-submissions"
          detail="Entries with more than 6 counted picks (7-pick disqualification case)."
          pill={data ? (data.overSubmitted === 0 ? 'None' : `${data.overSubmitted} to confirm`) : ''}
        />
        <ChecklistRow
          state="info"
          title="Payment gate"
          detail="Unpaid submitters won't appear on the leaderboard (grace period still applies early season)."
          pill={data ? `FYI · ${data.unpaidSubmitters} unpaid` : ''}
        />
      </div>

      {/* Scoring integrity detail */}
      {data && data.discrepancies.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Scoring integrity · detail</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-charcoal-100">
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Issue</th>
                </tr>
              </thead>
              <tbody>
                {data.discrepancies.map((d, i) => (
                  <tr key={i} className="border-b border-charcoal-50 last:border-0">
                    <td className="px-4 py-2"><Badge variant="outline">{d.kind}</Badge></td>
                    <td className="px-4 py-2">{d.label}</td>
                    <td className="px-4 py-2 text-charcoal-600">{d.issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Anonymous picks detail */}
      {data && data.anonUnresolved.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Anonymous picks · resolve</CardTitle>
              <Button size="sm" onClick={autoTieAnon} disabled={tying} className="bg-gold-500 text-pigskin-900 hover:bg-gold-600">
                {tying ? 'Tying…' : 'Auto-tie matchable entries'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-charcoal-600 mb-3">
              These submitted entries aren't tied to an account yet. "Auto-tie" matches each email to a user
              (users / leaguesafe email) and links + shows any it can. Anything left has no matching account —
              resolve those manually in the <span className="font-medium">Pick Management</span> tab.
            </p>
            <ul className="text-sm space-y-1">
              {data.anonUnresolved.map(a => (
                <li key={a.email} className="flex items-center gap-2">
                  <span className="font-medium">{a.name || '(no name)'}</span>
                  <span className="text-charcoal-500">{a.email}</span>
                  <Badge variant="outline">{a.count} picks</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Publish */}
      <Card className={scoringClean ? 'border-green-200' : 'border-amber-200'}>
        <CardContent className="p-5">
          {!scoringClean && (
            <div className="text-sm text-amber-800 mb-3">
              <b>Publish is blocked</b> until every completed game is scored and scoring integrity shows 0 issues.
            </div>
          )}
          {scoringClean && hasWarnings && (
            <div className="text-sm text-amber-800 mb-3">
              Scoring is clean, but there are unresolved anonymous picks / over-submissions. You can still publish —
              those won't affect scored results — but resolving them first is recommended.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              onClick={publish}
              disabled={!scoringClean || publishing || (data?.leaderboardComplete ?? false)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {publishing
                ? 'Publishing…'
                : data?.leaderboardComplete
                ? `Week ${week} Published ✓`
                : `Approve & Publish Week ${week}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ChecklistRow({
  state,
  title,
  detail,
  pill,
}: {
  state: ItemState
  title: string
  detail: string
  pill: string
}) {
  const styles: Record<ItemState, { bar: string; ic: string; icBg: string; pill: string; glyph: string }> = {
    ok:      { bar: 'border-l-green-600', ic: 'text-green-700', icBg: 'bg-green-100', pill: 'bg-green-100 text-green-800', glyph: '✓' },
    warn:    { bar: 'border-l-amber-500', ic: 'text-amber-700', icBg: 'bg-amber-100', pill: 'bg-amber-100 text-amber-800', glyph: '!' },
    info:    { bar: 'border-l-blue-500',  ic: 'text-blue-700',  icBg: 'bg-blue-100',  pill: 'bg-blue-100 text-blue-800',  glyph: 'i' },
    loading: { bar: 'border-l-charcoal-200', ic: 'text-charcoal-400', icBg: 'bg-charcoal-100', pill: 'bg-charcoal-100 text-charcoal-500', glyph: '…' },
  }
  const s = styles[state]
  return (
    <div className={`flex items-center gap-4 bg-white border border-charcoal-100 border-l-4 ${s.bar} rounded-lg px-4 py-3`}>
      <div className={`w-9 h-9 rounded-full grid place-items-center font-bold ${s.icBg} ${s.ic}`}>{s.glyph}</div>
      <div className="flex-1">
        <div className="font-semibold text-charcoal-900">{title}</div>
        <div className="text-sm text-charcoal-500">{detail}</div>
      </div>
      {pill && <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${s.pill}`}>{pill}</span>}
    </div>
  )
}
