import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { loadRecapSeed, createRecapDraft, type RecapSeed } from '@/services/recapService'
import { EmailService } from '@/services/emailService'

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
  /**
   * False while the active season is still the client-side fallback.
   * useCurrentSeason boots on FALLBACK_ACTIVE_SEASON (the PREVIOUS season) and
   * flips when app_settings resolves; querying during that window fetched
   * last season's week, and when that slower response resolved after the
   * corrected one it overwrote it -- a 2026 badge over 2025 picks, and a
   * "345 missing confirmation emails" alarm that was true only of 2025.
   */
  seasonReady?: boolean
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
  user_id: string; display_name: string; email: string; is_paid: boolean
  picks: PickCell[]; total_points: number
}
/**
 * One pick sheet on file for a player this week. See migration 238: counting is
 * per pick, not per sheet, because show_on_leaderboard is a per-pick flag and a
 * legal six can be built across two submissions with it.
 */
interface PickSetEntry {
  user_id: string; display_name: string; account_email: string
  source: string; set_label: string
  pick_count: number; counted_picks: number
  lock_count: number; counted_locks: number
  is_submitted: boolean; disqualified_count: number
  points: number; counted_points: number
  last_submitted_at: string | null
  counts_for_leaderboard: boolean
}
/** One sheet's pick for one game, for the sheet-comparison grid. Migration 239. */
interface PickDiffCell {
  user_id: string; display_name: string
  game_id: string; matchup: string; kickoff_time: string
  source: string; set_label: string
  selected_team: string; is_lock: boolean; counted: boolean
  result: string | null; points_earned: number | null
  game_disagrees: boolean; sheets_with_pick: number
}
/** A proposed account for an untied anonymous entry. Migration 240. */
interface AnonCandidate {
  entry_email: string; entry_name: string | null
  pick_count: number; lock_count: number; submitted_at: string | null
  auto_tie_target: string | null
  candidate_user_id: string | null; candidate_name: string | null; candidate_email: string | null
  basis: string | null; basis_rank: number | null
  is_paid: boolean | null; has_picks: boolean | null
}
interface MultiSetPlayer {
  user_id: string; display_name: string; account_email: string
  sets: PickSetEntry[]
  /** sheets contributing at least one counted pick */
  sheetsCounting: number
  countedPicks: number
  countedLocks: number
  countedPoints: number
}

interface ReviewData {
  games: GameRow[]
  completedGames: number
  scoredGames: number
  unscoredCount: number
  discrepancies: Discrepancy[]
  anonUnresolved: AnonEntry[]
  anonCandidates: AnonCandidate[]
  multiSets: PickSetEntry[]
  pickDiff: PickDiffCell[]
  overpickDetail: OverpickEntry[]
  unpaidList: UnpaidEntry[]
  allPicks: PlayerPicks[]
  scoringComplete: boolean
  leaderboardComplete: boolean
  customMessage: string
}

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1)

/**
 * wr_all_picks returns one row per pick, so a full league blows straight past
 * PostgREST's 1000-row response cap (week 1 of 2026: content-range 0-999/1518).
 * A single .rpc() call therefore delivered the first 167 players of an
 * alphabetical list and silently dropped everyone after mid-"K". Page until a
 * short page instead.
 */
async function fetchAllPicksPaged(week: number, season: number): Promise<any[]> {
  const PAGE = 1000
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('wr_all_picks', { p_week: week, p_season: season })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export default function WeekReview({ season, initialWeek, seasonReady = true }: WeekReviewProps) {
  const [week, setWeek] = useState(initialWeek || 1)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReviewData | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [showAllPicks, setShowAllPicks] = useState(false)
  const [pickSearch, setPickSearch] = useState('')

  const filteredAllPicks = (data?.allPicks || []).filter(p => {
    const q = pickSearch.trim().toLowerCase()
    if (!q) return true
    return p.display_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
  })
  const navigate = useNavigate()
  const { user } = useAuth()
  const [recap, setRecap] = useState<RecapSeed | null>(null)
  const [recapLoading, setRecapLoading] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)

  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }))

  // Monotonic request ids: a slower, earlier query (e.g. one issued while the
  // season was still the fallback) must not overwrite a newer result.
  const reviewRequestSeq = useRef(0)
  const confirmsRequestSeq = useRef(0)

  const loadReview = useCallback(async () => {
    if (!seasonReady) return
    const requestId = ++reviewRequestSeq.current
    setLoading(true)
    setError('')
    try {
      const [gamesRes, discRes, anonRes, candRes, setsRes, diffRes, overRes, unpaidRes, allRes, wsRes] = await Promise.all([
        supabase.from('games')
          .select('id, home_team, away_team, status, home_score, away_score, spread, winner_against_spread, margin_bonus')
          .eq('season', season).eq('week', week),
        supabase.from('scoring_discrepancies').select('kind, label, issue').eq('season', season).eq('week', week),
        supabase.rpc('wr_anonymous_unmatched', { p_week: week, p_season: season }),
        supabase.rpc('wr_anonymous_candidates', { p_week: week, p_season: season }),
        supabase.rpc('wr_multiple_pick_sets', { p_week: week, p_season: season }),
        supabase.rpc('wr_pick_set_diff', { p_week: week, p_season: season }),
        supabase.rpc('detect_overpick_entries', { p_week: week, p_season: season }),
        supabase.rpc('wr_unpaid_submitters', { p_week: week, p_season: season }),
        fetchAllPicksPaged(week, season).then(rows => ({ data: rows, error: null })),
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
          pp = { user_id: r.user_id, display_name: r.display_name, email: r.email || '', is_paid: r.is_paid, picks: [], total_points: 0 }
          byPlayer.set(r.user_id, pp)
        }
        pp.picks.push({
          matchup: r.matchup, selected_team: r.selected_team, spread: r.spread,
          is_lock: r.is_lock, result: r.result, points_earned: r.points_earned, disqualified: r.disqualified,
        })
        if (!r.disqualified) pp.total_points += r.points_earned || 0
      }
      const allPicks = Array.from(byPlayer.values()).sort((a, b) => b.total_points - a.total_points)

      if (requestId !== reviewRequestSeq.current) return // superseded; drop stale response
      setData({
        games,
        completedGames: completed.length,
        scoredGames: scored.length,
        unscoredCount: completed.length - scored.length,
        discrepancies: (discRes.data as any[]) || [],
        anonUnresolved: (anonRes.data as any[]) || [],
        anonCandidates: (candRes.data as any[]) || [],
        multiSets: (setsRes.data as any[]) || [],
        pickDiff: (diffRes.data as any[]) || [],
        overpickDetail: (overRes.data as any[]) || [],
        unpaidList: (unpaidRes.data as any[]) || [],
        allPicks,
        scoringComplete: (wsRes.data as any)?.scoring_complete ?? false,
        leaderboardComplete: (wsRes.data as any)?.leaderboard_complete ?? false,
        customMessage: (wsRes.data as any)?.admin_custom_message ?? '',
      })
      setNoticeMsg((wsRes.data as any)?.admin_custom_message ?? '')
    } catch (err: any) {
      if (requestId !== reviewRequestSeq.current) return
      console.error('WeekReview load failed:', err)
      setError(err?.message || 'Failed to load week review data')
    } finally {
      if (requestId === reviewRequestSeq.current) setLoading(false)
    }
  }, [season, week, seasonReady])

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

  // Tie one anonymous entry to an account without leaving the review. Same
  // write PickManagement's assign performs, so the two paths cannot disagree:
  // every row for that address and week, matched on email rather than id.
  const [tying2, setTying2] = useState<string | null>(null)
  const tieAnonEntry = async (email: string, userId: string) => {
    setTying2(`${email}|${userId}`); setError('')
    try {
      const { error: e } = await supabase
        .from('anonymous_picks')
        .update({
          assigned_user_id: userId,
          show_on_leaderboard: true,
          is_validated: true,
          validation_status: 'manually_validated',
          processing_notes: 'Tied to account from Week Review',
        })
        .eq('email', email)
        .eq('week', week)
        .eq('season', season)
      if (e) throw e
      setSearchFor(null); setUserQuery(''); setUserResults([])
      await loadReview()
    } catch (err: any) {
      setError(err?.message || 'Failed to tie entry')
    } finally { setTying2(null) }
  }

  // Manual account search, for an entry with no candidate worth proposing.
  const [searchFor, setSearchFor] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<Array<{ id: string; display_name: string; email: string }>>([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const q = userQuery.trim()
    if (!searchFor || q.length < 2) { setUserResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('users')
        .select('id, display_name, email')
        .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
        .not('email', 'like', '%_merged_%')
        .order('display_name')
        .limit(8)
      if (!cancelled) { setUserResults(data || []); setSearching(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [userQuery, searchFor])

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

  // Confirmation-receipt reconciliation. See migration 213: a submission whose
  // queueing RPC never reached the database leaves the player with no receipt
  // and nothing in the system aware of it.
  const [missingConfirms, setMissingConfirms] = useState<
    Array<{ user_id: string; display_name: string; email: string; submitted_picks: number }>
  >([])
  const [confirmsLoading, setConfirmsLoading] = useState(false)
  const [confirmsSending, setConfirmsSending] = useState(false)
  const [confirmsNote, setConfirmsNote] = useState('')

  // Players with picks in and nothing submitted. A stale pre-fix tab could
  // tell the player "submitted" while writing nothing (see migration 221) --
  // this is the admin-side net so complete sheets don't quietly miss the
  // deadline.
  const [unsubmitted, setUnsubmitted] = useState<
    Array<{ user_id: string; display_name: string; email: string; picks: number; has_lock: boolean; complete: boolean }>
  >([])
  const [submitFailures, setSubmitFailures] = useState<
    Array<{ display_name: string; email: string; stage: string; message: string; created_at: string }>
  >([])
  // Pick changes made after their game kicked off or after the deadline. The
  // audit trail deliberately ignores result/points_earned, so a scoring pass
  // never lands here -- that ambiguity is what prompted it (migration 223).
  const [flaggedChanges, setFlaggedChanges] = useState<
    Array<{ display_name: string; email: string; matchup: string; change_type: string;
            old_value: string | null; new_value: string | null; changed_at: string;
            after_kickoff: boolean; after_deadline: boolean; by_owner: boolean;
            blocks_submission: boolean; was_submitted: boolean }>
  >([])

  const loadMissingConfirms = useCallback(async () => {
    if (!seasonReady) return
    const requestId = ++confirmsRequestSeq.current
    setConfirmsLoading(true)
    setConfirmsNote('')
    try {
      const rows = await EmailService.findMissingPickConfirmations(week, season)
      const { data: unsub } = await supabase
        .rpc('wr_unsubmitted_entries', { p_week: week, p_season: season })
      const { data: fails } = await supabase
        .rpc('wr_recent_submission_failures', { p_week: week, p_season: season })
      const { data: flagged } = await supabase
        .rpc('wr_pick_change_log', { p_week: week, p_season: season, p_flagged_only: true })
      if (requestId !== confirmsRequestSeq.current) return // superseded; drop stale response
      setMissingConfirms(rows)
      setUnsubmitted(unsub ?? [])
      setSubmitFailures(fails ?? [])
      setFlaggedChanges(flagged ?? [])
    } catch (err: any) {
      if (requestId !== confirmsRequestSeq.current) return
      setConfirmsNote(`Could not check: ${err?.message ?? err}`)
    } finally {
      if (requestId === confirmsRequestSeq.current) setConfirmsLoading(false)
    }
  }, [week, season, seasonReady])

  useEffect(() => { loadMissingConfirms() }, [loadMissingConfirms])

  const sendMissingConfirms = async () => {
    setConfirmsSending(true)
    setConfirmsNote('')
    try {
      const { sent, failed } = await EmailService.sendMissingPickConfirmations(week, season)
      setConfirmsNote(
        failed.length === 0
          ? `Sent ${sent} confirmation${sent === 1 ? '' : 's'}.`
          : `Sent ${sent}; ${failed.length} failed — ${failed.map(f => `${f.email}: ${f.reason}`).join('; ')}`
      )
      await loadMissingConfirms()
    } catch (err: any) {
      setConfirmsNote(`Failed: ${err?.message ?? err}`)
    } finally {
      setConfirmsSending(false)
    }
  }
  // The reconciliation workbook, built in the browser from one RPC. Same nine
  // tabs as scripts/build-reconciliation-workbook.py, no psql required.
  const [workbookState, setWorkbookState] = useState<'idle' | 'building' | 'done'>('idle')
  const [workbookNote, setWorkbookNote] = useState('')
  const buildWorkbook = async () => {
    setWorkbookState('building'); setWorkbookNote('')
    try {
      // Loaded on click: the xlsx writer is ~100KB and only an admin ever needs it.
      const { downloadReconciliationWorkbook } = await import('@/services/reconciliationWorkbook')
      const name = await downloadReconciliationWorkbook(season, week)
      setWorkbookState('done')
      setWorkbookNote(`Downloaded ${name}`)
    } catch (err: any) {
      setWorkbookState('idle')
      setWorkbookNote(`Failed: ${err?.message ?? err}`)
    }
  }

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

  // One block per player holding more than one sheet. The totals are what the
  // standings actually score for them, summed across every sheet: over six
  // picks or more than one lock is a fault, six drawn from two sheets is not.
  const multiSetPlayers: MultiSetPlayer[] = Array.from(
    (data?.multiSets || []).reduce((m, r) => {
      const g = m.get(r.user_id) ?? {
        user_id: r.user_id, display_name: r.display_name, account_email: r.account_email,
        sets: [], sheetsCounting: 0, countedPicks: 0, countedLocks: 0, countedPoints: 0,
      }
      g.sets.push(r)
      if (r.counted_picks > 0) g.sheetsCounting++
      g.countedPicks += r.counted_picks
      g.countedLocks += r.counted_locks
      g.countedPoints += r.counted_points
      m.set(r.user_id, g)
      return m
    }, new Map<string, MultiSetPlayer>()).values()
  ).sort((a, b) => b.sets.length - a.sets.length || a.display_name.localeCompare(b.display_name))
  // Untied anonymous entries, each with the accounts worth proposing. The
  // unmatched list returns the address as stored and the candidate RPC
  // lowercases it, so match on lowercase and keep the raw value for the write.
  const anonEntries = (data?.anonUnresolved || []).map(a => {
    const rows = (data?.anonCandidates || []).filter(
      c => c.entry_email === a.email.toLowerCase()
    )
    return {
      ...a,
      autoTie: rows.some(r => r.auto_tie_target),
      candidates: rows.filter(r => r.candidate_user_id),
    }
  })

  const faultySets = multiSetPlayers.filter(p => p.countedPicks > 6 || p.countedLocks > 1)
  const splitSets = multiSetPlayers.filter(p => p.sheetsCounting > 1 && !faultySets.includes(p))
  const multiSetIds = new Set(multiSetPlayers.map(p => p.user_id))

  const hasWarnings = !!data && (data.anonUnresolved.length > 0 || data.overpickDetail.length > 0 || faultySets.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#4B3621]">Week Review</h2>
          <p className="text-charcoal-600 text-sm">Reconcile scoring, resolve entries, and publish the week.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={week} onChange={e => setWeek(Number(e.target.value))}
            className="border border-[#e7e2da] rounded-md px-3 py-2 text-sm bg-white text-charcoal-700">
            {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          <Badge className="bg-gold-500 text-pigskin-900">{season}</Badge>
          <Button variant="outline" size="sm" onClick={loadReview} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Card className="border-[#f2c9d1] bg-[#fbe9ec]"><CardContent className="p-4 text-[#d1495b] text-sm">⚠️ {error}</CardContent></Card>}

      {data?.leaderboardComplete && (
        <Card className="border-[#bfe3cc] bg-[#e6f4ea]">
          <CardContent className="p-4 text-[#1f7a44] text-sm font-medium">
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
            ? <p className="text-sm text-[#1f7a44]">✓ No discrepancies — stored results match the recompute.</p>
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
          {(!data || anonEntries.length === 0)
            ? <p className="text-sm text-[#1f7a44]">✓ Nothing to resolve.</p>
            : (
              <div className="flex flex-col gap-2">
                {anonEntries.map(a => (
                  <div key={a.email} className="rounded-lg border border-[#e7e2da] bg-white overflow-hidden">
                    <div className="flex items-start justify-between gap-3 px-3 py-2 bg-[#faf8f4] border-b border-[#f0ece5]">
                      <div className="min-w-0">
                        <div>
                          <span className="font-medium text-[#4B3621]">{a.name || '(no name)'}</span>
                          <span className="text-xs text-charcoal-400 ml-2 break-all">{a.email}</span>
                        </div>
                        <div className="text-xs text-charcoal-500">
                          {a.pick_count} picks
                          {a.autoTie && <span className="text-[#1f7a44] ml-1.5">· auto-tie resolves this one</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {dismissTarget === a.email ? (
                          <div className="flex flex-col items-end gap-2">
                            <Input placeholder="Reason (e.g. no payment found)" value={dismissNote}
                              onChange={e => setDismissNote(e.target.value)} className="w-56 h-8 text-xs" />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setDismissTarget(null); setDismissNote('') }}>Cancel</Button>
                              <Button size="sm" className="bg-[#d1495b] hover:bg-[#b83d4d] text-white"
                                onClick={() => dismissAnon(a.email)} disabled={dismissing}>
                                {dismissing ? 'Dismissing…' : 'Dismiss with note'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline"
                              onClick={() => { setSearchFor(searchFor === a.email ? null : a.email); setUserQuery('') }}>
                              {searchFor === a.email ? 'Close search' : 'Find account…'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setDismissTarget(a.email); setDismissNote('') }}>
                              Dismiss…
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {a.candidates.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
                          <th className="px-3 py-1.5 font-medium">Account</th>
                          <th className="px-3 py-1.5 font-medium">Matched on</th>
                          <th className="px-3 py-1.5 font-medium">This season</th>
                          <th className="px-3 py-1.5"></th>
                        </tr></thead>
                        <tbody>
                          {a.candidates.map(c => (
                            <tr key={c.candidate_user_id} className="border-b border-[#f0ece5] last:border-0">
                              <td className="px-3 py-1.5">
                                <span className="font-medium">{c.candidate_name}</span>
                                <span className="text-xs text-charcoal-400 ml-2 break-all">{c.candidate_email}</span>
                              </td>
                              <td className="px-3 py-1.5 text-charcoal-600">{c.basis}</td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <span className={c.is_paid ? 'text-[#1f7a44]' : 'text-[#b06a1a]'}>
                                  {c.is_paid ? 'paid' : 'no payment'}
                                </span>
                                {c.has_picks && <span className="text-charcoal-500 ml-1.5">· already has picks</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <Button size="sm" className="bg-gold-500 text-pigskin-900 hover:bg-gold-600"
                                  onClick={() => tieAnonEntry(a.email, c.candidate_user_id!)}
                                  disabled={tying2 === `${a.email}|${c.candidate_user_id}`}>
                                  {tying2 === `${a.email}|${c.candidate_user_id}` ? 'Tying…' : 'Tie to this'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-3 py-2 text-sm text-charcoal-500">
                        No account matches this address or name. Search for one, or dismiss the entry with a note.
                      </p>
                    )}

                    {searchFor === a.email && (
                      <div className="px-3 py-2 border-t border-[#f0ece5] bg-[#faf8f4]/60 flex flex-col gap-2">
                        <Input autoFocus placeholder="Search every account by name or email…"
                          value={userQuery} onChange={e => setUserQuery(e.target.value)} className="h-8 text-sm" />
                        {searching && <p className="text-xs text-charcoal-400">Searching…</p>}
                        {!searching && userQuery.trim().length >= 2 && userResults.length === 0 && (
                          <p className="text-xs text-charcoal-400">No account matches “{userQuery.trim()}”.</p>
                        )}
                        {userResults.map(u => (
                          <div key={u.id} className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <span className="font-medium">{u.display_name}</span>
                              <span className="text-xs text-charcoal-400 ml-2 break-all">{u.email}</span>
                            </div>
                            <Button size="sm" variant="outline" className="shrink-0"
                              onClick={() => tieAnonEntry(a.email, u.id)}
                              disabled={tying2 === `${a.email}|${u.id}`}>
                              {tying2 === `${a.email}|${u.id}` ? 'Tying…' : 'Tie to this'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          <p className="text-xs text-charcoal-400 mt-2">
            Tying an entry assigns every pick submitted under that address this week and puts them on the
            leaderboard. Auto-tie does the same for addresses it can resolve outright. Dismiss (with a note)
            removes an entry with no matching account from this list.
          </p>
        </ExpandRow>

        <ExpandRow
          k="sets" open={!!open.sets} onToggle={() => toggle('sets')}
          state={loading ? 'loading' : multiSetPlayers.length === 0 ? 'ok' : faultySets.length > 0 ? 'warn' : 'info'}
          title="Duplicate pick sets"
          detail="Players with more than one sheet on file for this week."
          pill={data
            ? multiSetPlayers.length === 0
              ? 'None'
              : faultySets.length > 0
                ? `${faultySets.length} to fix`
                : `${multiSetPlayers.length} ${multiSetPlayers.length === 1 ? 'player' : 'players'}`
            : ''}
        >
          {multiSetPlayers.length === 0
            ? <p className="text-sm text-[#1f7a44]">✓ Every player has a single sheet this week.</p>
            : <PickSetsList players={multiSetPlayers} splitCount={splitSets.length} diff={data?.pickDiff || []} />}
        </ExpandRow>

        <ExpandRow
          k="over" open={!!open.over} onToggle={() => toggle('over')}
          state={loading ? 'loading' : data && data.overpickDetail.length === 0 ? 'ok' : 'warn'}
          title="Over-submissions"
          detail="Entries with more than 6 counted picks (7-pick case)."
          pill={data ? (data.overpickDetail.length === 0 ? 'None' : `${data.overpickDetail.length} to confirm`) : ''}
        >
          {(!data || data.overpickDetail.length === 0)
            ? <p className="text-sm text-[#1f7a44]">✓ No over-submissions.</p>
            : (
              <>
                <p className="text-sm text-charcoal-600 mb-2">
                  Proposed drop = <span className="font-medium">highest-value non-locked pick</span> (penalty for over-picking; a
                  locked pick is never dropped). Nothing is deleted — the pick is excluded from totals.
                </p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
                    <th className="px-3 py-2 font-medium">Entry</th><th className="px-3 py-2 font-medium">Picks</th>
                    <th className="px-3 py-2 font-medium">Proposed drop</th><th className="px-3 py-2 font-medium">Pts</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {data.overpickDetail.map(o => (
                      <tr key={o.user_id} className="border-b border-[#f0ece5] last:border-0">
                        <td className="px-3 py-2 font-medium">{o.display_name}</td>
                        <td className="px-3 py-2 tabular-nums">{o.pick_count}</td>
                        <td className="px-3 py-2 text-charcoal-700">{o.proposed_desc}</td>
                        <td className="px-3 py-2 tabular-nums">{o.proposed_points ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" onClick={() => confirmDrop(o.proposed_pick_id)}
                            disabled={droppingId === o.proposed_pick_id} className="bg-[#d1495b] hover:bg-[#b83d4d] text-white">
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
            ? <p className="text-sm text-[#1f7a44]">✓ Every submitter this week has a paid entry.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
                  <th className="px-3 py-2 font-medium">Player</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Picks</th>
                </tr></thead>
                <tbody>
                  {data.unpaidList.map(u => (
                    <tr key={u.user_id} className="border-b border-[#f0ece5] last:border-0">
                      <td className="px-3 py-2 font-medium">{u.display_name}</td>
                      <td className="px-3 py-2 text-charcoal-500">{u.email}</td>
                      <td className="px-3 py-2 tabular-nums">{u.pick_count}</td>
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
          <CardTitle className="text-base flex items-center justify-between text-[#4B3621]">
            <span>
              {showAllPicks ? '▾' : '▸'} All Picks — Week {week} (
              {pickSearch ? `${filteredAllPicks.length} of ${data?.allPicks.length || 0}` : data?.allPicks.length || 0} players)
            </span>
          </CardTitle>
        </CardHeader>
        {showAllPicks && (
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#f0ece5]">
              <Input
                value={pickSearch}
                onChange={e => setPickSearch(e.target.value)}
                placeholder="Search by player name or email…"
                className="max-w-sm"
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
                  <th className="px-4 py-2 font-medium">Player</th>
                  <th className="px-4 py-2 font-medium">Picks (🔒 = lock)</th>
                  <th className="px-4 py-2 font-medium text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllPicks.map(p => (
                  <tr key={p.user_id} className="border-b border-[#f0ece5] last:border-0 align-top">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-medium">{p.display_name}</span>
                      {!p.is_paid && <span className="ml-2 text-xs text-[#d1495b]">unpaid</span>}
                      {multiSetIds.has(p.user_id) && (
                        <span className="ml-2 text-xs text-[#b06a1a]" title="More than one sheet on file — see Duplicate pick sets above. Only the counted one is shown here.">
                          +1 sheet on file
                        </span>
                      )}
                      <div className="text-xs text-charcoal-400">{p.email}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.picks.map((c, i) => <PickChip key={i} cell={c} />)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{p.total_points}</td>
                  </tr>
                ))}
                {filteredAllPicks.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-charcoal-400">
                    {pickSearch ? 'No players match your search.' : 'No submitted picks for this week.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Publish */}
      <Card className={unsubmitted.filter(u => u.complete).length === 0 ? 'border-[#bfe3cc]' : 'border-[#f0dcb0]'}>
        <CardContent className="p-5">
          <div className="font-medium text-[#4B3621]">
            {unsubmitted.length === 0
              ? '✅ No entries stuck at "picks made but never submitted"'
              : `⚠️ ${unsubmitted.length} ${unsubmitted.length === 1 ? 'entry has' : 'entries have'} picks in but nothing submitted`}
          </div>
          {unsubmitted.length > 0 && (
            <div className="text-sm text-charcoal-600 mt-1">
              {unsubmitted.filter(u => u.complete).length > 0 && (
                <div className="font-medium text-[#b06a1a]">
                  {unsubmitted.filter(u => u.complete).length} of them are COMPLETE sheets (6 picks + lock) — they
                  almost certainly believe they submitted. Worth a nudge before the deadline.
                </div>
              )}
              <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                {unsubmitted.map(u => (
                  <div key={u.user_id} className="text-xs">
                    <span className="font-medium text-[#4B3621]">{u.display_name}</span>
                    <span className="text-charcoal-500 ml-2">{u.email}</span>
                    <span className="text-charcoal-400 ml-2">{u.picks} picks{u.has_lock ? ' + lock' : ''}</span>
                    {u.complete && <span className="ml-2 text-[#b06a1a] font-semibold">complete, unsubmitted</span>}
                  </div>
                ))}
              </div>
              <div className="text-xs text-charcoal-500 mt-2">
                Partial sheets are usually just players mid-week; complete ones are the worry.
                Picks are saved either way — submitting is what enters them.
              </div>
            </div>
          )}
          {flaggedChanges.length > 0 && (() => {
            // A post-lock change only matters if the player made it themselves
            // AND the affected pick is still in their sheet -- the same rule
            // validate_pick_submission uses, so this list and the submit gate
            // can never disagree. Deleting an unsubmitted pick and choosing a
            // still-open game is legitimate, and a commissioner correction is
            // the fix rather than the finding.
            const violations = flaggedChanges.filter(c => c.blocks_submission)
            const context = flaggedChanges.filter(c => !c.blocks_submission)
            const row = (c: typeof flaggedChanges[number], i: number) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-[#4B3621]">{c.display_name}</span>
                <span className="text-charcoal-500 ml-2">{c.matchup}</span>
                <span className="ml-2">
                  {c.change_type}
                  {c.old_value && c.new_value && <> ({c.old_value} → {c.new_value})</>}
                </span>
                <span className="text-charcoal-400 ml-2">{new Date(c.changed_at).toLocaleString()}</span>
                {c.after_deadline && <span className="ml-2 text-[#d1495b] font-semibold">after deadline</span>}
                <span className={`ml-2 ${c.was_submitted ? 'text-[#d1495b] font-semibold' : 'text-charcoal-500'}`}>
                  {c.was_submitted ? 'sheet was SUBMITTED' : 'sheet not submitted yet'}
                </span>
                {!c.by_owner && <span className="ml-2 text-charcoal-500">(commissioner correction)</span>}
              </div>
            )
            return (
              <div className="mt-3 pt-3 border-t border-[#f0ece5] text-sm">
                {violations.length > 0 ? (
                  <>
                    <div className="font-medium text-[#d1495b]">
                      🚩 {violations.length} pick {violations.length === 1 ? 'change' : 'changes'} after that game locked, still in the sheet
                    </div>
                    <div className="text-xs text-charcoal-600 mb-1">
                      The sheet was already submitted when this happened, so the pick was a live entry — not a draft.
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">{violations.map(row)}</div>
                  </>
                ) : (
                  <div className="font-medium text-[#1f7a44]">✅ No post-lock changes to an already-submitted sheet</div>
                )}

                {context.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-charcoal-500">
                      {context.length} other post-lock {context.length === 1 ? 'entry' : 'entries'} — sheets that were never submitted at the time, plus commissioner corrections (not violations)
                    </summary>
                    <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">{context.map(row)}</div>
                  </details>
                )}
              </div>
            )
          })()}

          {submitFailures.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#f0ece5] text-sm">
              <div className="font-medium text-[#d1495b]">
                🚨 {submitFailures.length} failed submit {submitFailures.length === 1 ? 'attempt' : 'attempts'} recorded this week
              </div>
              <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {submitFailures.map((f, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-[#4B3621]">{f.display_name}</span>
                    <span className="text-charcoal-500 ml-2">{f.email}</span>
                    <span className="text-charcoal-400 ml-2">{new Date(f.created_at).toLocaleString()}</span>
                    <div className="text-charcoal-600 ml-1">{f.stage}: {f.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={missingConfirms.length === 0 ? 'border-[#bfe3cc]' : 'border-[#f0dcb0]'}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-[#4B3621]">
                {confirmsLoading
                  ? 'Checking pick confirmations…'
                  : missingConfirms.length === 0
                  ? '✅ Every submitted entry got a confirmation email'
                  : `⚠️ ${missingConfirms.length} submitted ${missingConfirms.length === 1 ? 'entry has' : 'entries have'} no confirmation email`}
              </div>
              {missingConfirms.length > 0 && (
                <div className="text-sm text-charcoal-600 mt-1">
                  Their picks are saved and safe — only the receipt is missing.
                  <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                    {missingConfirms.map(m => (
                      <div key={m.user_id} className="text-xs">
                        <span className="font-medium text-[#4B3621]">{m.display_name}</span>
                        <span className="text-charcoal-500 ml-2">{m.email}</span>
                        <span className="text-charcoal-400 ml-2">{m.submitted_picks} picks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {confirmsNote && <div className="text-xs text-charcoal-600 mt-2">{confirmsNote}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={loadMissingConfirms} disabled={confirmsLoading || confirmsSending}>
                Re-check
              </Button>
              {missingConfirms.length > 0 && (
                <Button onClick={sendMissingConfirms} disabled={confirmsSending}>
                  {confirmsSending ? 'Sending…' : `Send ${missingConfirms.length} missing`}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={scoringClean ? 'border-[#bfe3cc]' : 'border-[#f0dcb0]'}>
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
            <div className="text-sm text-[#b06a1a] mb-3">
              <b>Publish is blocked</b> until every completed game is scored and scoring integrity shows 0 issues.
            </div>
          )}
          {scoringClean && hasWarnings && (
            <div className="text-sm text-[#b06a1a] mb-3">
              Scoring is clean, but there are unresolved anonymous picks / over-submissions. You can still publish —
              they don't affect scored results — but resolving them first is recommended.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button onClick={publish}
              disabled={!scoringClean || publishing || (data?.leaderboardComplete ?? false)}
              className="bg-[#1f7a44] hover:bg-[#186237] text-white">
              {publishing ? 'Publishing…' : data?.leaderboardComplete ? `Week ${week} Published ✓` : `Approve & Publish Week ${week}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation workbook */}
      <Card>
        <CardHeader><CardTitle className="text-base text-[#4B3621]">📊 Reconciliation workbook</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="text-sm text-charcoal-600">
                Ties the entry register to the picks being scored: paid entries nobody is playing, sheets
                being scored with no payment, split identities, duplicate sheets and untied anonymous
                entries. Nine tabs, filterable, with a Summary that says what to act on.
              </p>
              <p className="text-xs text-charcoal-400 mt-2">
                Carries every player's name, address and payment detail — it downloads to this device;
                don't put it anywhere public. Process: <span className="font-medium">docs/WEEKLY_RECONCILIATION.md</span>
              </p>
              {workbookNote && (
                <p className={`text-xs mt-2 ${workbookNote.startsWith('Failed') ? 'text-[#d1495b]' : 'text-[#1f7a44]'}`}>
                  {workbookNote}
                </p>
              )}
            </div>
            <Button onClick={buildWorkbook} disabled={workbookState === 'building'}
              className="bg-pigskin-600 hover:bg-pigskin-700 text-white shrink-0">
              {workbookState === 'building' ? 'Building…' : `⬇ Download for Week ${week}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly recap seeding */}
      <Card>
        <CardHeader><CardTitle className="text-base text-[#4B3621]">📝 Weekly Recap</CardTitle></CardHeader>
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
    <div className="rounded-lg border border-[#e7e2da] bg-white p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-charcoal-500">{label}</div>
      <div className="text-lg font-bold leading-tight tabular-nums" style={{ color: '#4B3621' }}>{value}</div>
      {sub && <div className="text-[11px] text-charcoal-500 tabular-nums">{sub}</div>}
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
    ok:      { bar: 'border-l-[#1f7a44]',    ic: 'text-[#1f7a44]',    icBg: 'bg-[#e6f4ea]',    pill: 'bg-[#e6f4ea] text-[#1f7a44]', glyph: '✓' },
    warn:    { bar: 'border-l-[#b06a1a]',    ic: 'text-[#b06a1a]',    icBg: 'bg-[#fff5e2]',    pill: 'bg-[#fff5e2] text-[#b06a1a]', glyph: '!' },
    info:    { bar: 'border-l-[#C9A04E]',    ic: 'text-charcoal-700', icBg: 'bg-[#faf8f4]',    pill: 'bg-[#faf8f4] text-charcoal-700', glyph: 'i' },
    loading: { bar: 'border-l-[#e7e2da]',    ic: 'text-charcoal-400', icBg: 'bg-[#f0ece5]',    pill: 'bg-[#f0ece5] text-charcoal-500', glyph: '…' },
  }
  const s = styles[state]
  return (
    <div className={`bg-white border border-[#e7e2da] border-l-4 ${s.bar} rounded-lg overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#faf8f4]">
        <div className={`w-9 h-9 rounded-full grid place-items-center font-bold ${s.icBg} ${s.ic}`}>{s.glyph}</div>
        <div className="flex-1">
          <div className="font-semibold text-[#4B3621]">{title}</div>
          <div className="text-sm text-charcoal-500">{detail}</div>
        </div>
        {pill && <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap tabular-nums ${s.pill}`}>{pill}</span>}
        <span className="text-charcoal-400 w-4 text-center">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="border-t border-[#f0ece5] px-4 py-3 bg-[#faf8f4]/50">{children}</div>}
    </div>
  )
}

/**
 * The two sheets side by side, game by game. An identical duplicate needs no
 * grid — it needs one sentence saying so — while a sheet that disagrees on a
 * game or moves the lock is the whole reason the totals differ, so that is
 * what opens.
 */
function SheetCompare({ player, cells }: { player: MultiSetPlayer; cells: PickDiffCell[] }) {
  if (cells.length === 0) return null

  const columns = player.sets.map(st => ({
    key: `${st.source}|${st.set_label}`,
    source: st.source,
    label: st.set_label,
    counted: st.counted_picks > 0,
  }))
  // two sheets of the same kind (two anonymous entries) need the address to tell them apart
  const needsLabel = new Set(columns.filter(
    (c, _, all) => all.filter(o => o.source === c.source).length > 1
  ).map(c => c.key))

  const games: Array<{ id: string; matchup: string; disagrees: boolean; by: Record<string, PickDiffCell> }> = []
  const seen = new Map<string, number>()
  for (const c of cells) {
    let i = seen.get(c.game_id)
    if (i === undefined) {
      i = games.length
      seen.set(c.game_id, i)
      games.push({ id: c.game_id, matchup: c.matchup, disagrees: c.game_disagrees, by: {} })
    }
    games[i].by[`${c.source}|${c.set_label}`] = c
    if (c.game_disagrees) games[i].disagrees = true
  }
  const differing = games.filter(g => g.disagrees).length

  if (differing === 0) {
    return (
      <div className="px-3 py-2 text-xs text-charcoal-600 border-t border-[#f0ece5]">
        Both sheets hold the same {games.length} picks with the same lock — an exact duplicate, so which one
        counts makes no difference to the score.
      </div>
    )
  }

  return (
    <details open className="border-t border-[#f0ece5]">
      <summary className="cursor-pointer px-3 py-2 text-xs text-[#b06a1a] hover:bg-[#faf8f4]">
        Sheets differ on {differing} of {games.length} games — compare
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-charcoal-500 border-y border-[#f0ece5]">
            <th className="px-3 py-1.5 font-medium">Game</th>
            {columns.map(c => (
              <th key={c.key} className="px-3 py-1.5 font-medium whitespace-nowrap">
                {c.source === 'anonymous' ? 'Anonymous' : 'Account'}
                {needsLabel.has(c.key) && <span className="text-charcoal-400 font-normal"> · {c.label}</span>}
                {c.counted && <span className="text-[#1f7a44] font-normal"> (counted)</span>}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {games.map(g => (
              <tr key={g.id} className={`border-b border-[#f0ece5] last:border-0 ${g.disagrees ? 'bg-[#fff8ea]' : ''}`}>
                <td className="px-3 py-1.5 whitespace-nowrap text-charcoal-600">{g.matchup}</td>
                {columns.map(c => {
                  const cell = g.by[c.key]
                  return (
                    <td key={c.key} className="px-3 py-1.5 whitespace-nowrap">
                      {cell ? (
                        <span className={cell.counted ? 'text-gray-900' : 'text-charcoal-500'}>
                          {cell.is_lock && '🔒 '}{cell.selected_team}
                        </span>
                      ) : (
                        <span className="text-charcoal-300">no pick</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function PickSetsList({ players, splitCount, diff }: { players: MultiSetPlayer[]; splitCount: number; diff: PickDiffCell[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-charcoal-600">
        Counting is per pick, not per sheet: a submitted account sheet takes the week over an anonymous
        entry, and within an entry each pick can be shown or hidden. <b>Counted</b> is what the standings
        score — the rest is on file and ignored, nothing here is deleted. More than 6 counted picks, or
        more than one counted lock, means the week is scored wrong.
      </p>
      {splitCount > 0 && (
        <p className="text-sm text-charcoal-600">
          {splitCount === 1 ? '1 player has their' : `${splitCount} players have their`} counted picks drawn
          from more than one sheet. That is legal if it adds to six with a single lock — usually a
          combination built by hand — but worth confirming it was deliberate.
        </p>
      )}
      {players.map(p => {
        const overPicks = p.countedPicks > 6
        const overLocks = p.countedLocks > 1
        const faulty = overPicks || overLocks
        return (
          <div key={p.user_id}
            className={`rounded-lg border bg-white overflow-hidden ${faulty ? 'border-[#f2c9d1]' : 'border-[#e7e2da]'}`}>
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#faf8f4] border-b border-[#f0ece5]">
              <div className="min-w-0">
                <span className="font-medium text-[#4B3621]">{p.display_name}</span>
                <span className="text-xs text-charcoal-400 ml-2">{p.account_email}</span>
              </div>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap tabular-nums ${
                faulty ? 'bg-[#fbe9ec] text-[#d1495b]' : 'bg-white text-charcoal-700 border border-[#e7e2da]'}`}>
                {p.sets.length} sheets · {p.countedPicks} counted
                {p.countedLocks !== 1 ? ` · ${p.countedLocks} locks` : ''}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
                <th className="px-3 py-1.5 font-medium">Sheet</th>
                <th className="px-3 py-1.5 font-medium">Submitted under</th>
                <th className="px-3 py-1.5 font-medium">Counted picks</th>
                <th className="px-3 py-1.5 font-medium">State</th>
                <th className="px-3 py-1.5 font-medium text-right">Pts</th>
                <th className="px-3 py-1.5 font-medium text-right">Counts?</th>
              </tr></thead>
              <tbody>
                {p.sets.map((st, i) => (
                  <tr key={i} className={`border-b border-[#f0ece5] last:border-0 ${st.counted_picks > 0 ? '' : 'text-charcoal-500'}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {st.source === 'anonymous' ? 'Anonymous entry' : 'Account sheet'}
                    </td>
                    <td className="px-3 py-1.5 text-charcoal-500">{st.set_label}</td>
                    <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                      {st.counted_picks === st.pick_count
                        ? `${st.pick_count}`
                        : `${st.counted_picks} of ${st.pick_count}`}
                      {st.counted_locks > 0 && <span className="ml-1.5">🔒{st.counted_locks > 1 ? `×${st.counted_locks}` : ''}</span>}
                      {st.disqualified_count > 0 && (
                        <span className="text-charcoal-400 ml-1.5">{st.disqualified_count} dropped</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={st.is_submitted ? 'text-[#1f7a44]' : 'text-[#b06a1a]'}>
                        {st.is_submitted ? 'submitted' : 'never submitted'}
                      </span>
                      {st.last_submitted_at && (
                        <span className="text-charcoal-400 ml-1.5">
                          {new Date(st.last_submitted_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {st.counted_points}
                      {st.counted_points !== st.points && (
                        <span className="text-charcoal-400 text-xs ml-1">({st.points} on file)</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {st.counted_picks === 0
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#f0ece5] text-charcoal-500">ignored</span>
                        : st.counted_picks === st.pick_count
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e6f4ea] text-[#1f7a44]">counted</span>
                          : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fff5e2] text-[#b06a1a]">partly</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SheetCompare player={p} cells={diff.filter(d => d.user_id === p.user_id)} />
            {faulty && (
              <div className="px-3 py-2 text-xs text-[#d1495b] bg-[#fbe9ec] border-t border-[#f2c9d1]">
                ⚠️ {overPicks && `${p.countedPicks} picks are counting — 6 is the entry.`}
                {overPicks && overLocks && ' '}
                {overLocks && `${p.countedLocks} locks are counting — only one pick can be the lock.`}
                {' '}Hide the extras in Advanced pick tools below before publishing.
              </div>
            )}
            {!faulty && p.sheetsCounting > 1 && (
              <div className="px-3 py-2 text-xs text-charcoal-600 border-t border-[#f0ece5]">
                Counted picks come from {p.sheetsCounting} sheets and add to {p.countedPicks} with{' '}
                {p.countedLocks} lock — a combination, not a duplicate.
              </div>
            )}
            {!faulty && p.sheetsCounting === 1 && p.sets.some(st => st.counted_picks === 0 && st.pick_count >= 6) && (
              <div className="px-3 py-2 text-xs text-charcoal-500 border-t border-[#f0ece5]">
                A full second sheet the standings ignore. Worth a look — the player may believe the
                ignored one is their entry.
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-charcoal-400">
        Resolve in <b>Advanced pick tools</b> below (assign anonymous, duplicates, hidden, pick-set
        management). All Picks shows only counted picks, so these players have more on file than it lists.
      </p>
    </div>
  )
}

function GamesTable({ games }: { games: GameRow[] }) {
  if (games.length === 0) return <p className="text-sm text-charcoal-400">No games for this week.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
        <th className="px-3 py-2 font-medium">Game</th><th className="px-3 py-2 font-medium">Score</th>
        <th className="px-3 py-2 font-medium">Spread</th><th className="px-3 py-2 font-medium">Winner ATS</th>
        <th className="px-3 py-2 font-medium">Bonus</th><th className="px-3 py-2 font-medium">Status</th>
      </tr></thead>
      <tbody>
        {games.map(g => (
          <tr key={g.id} className="border-b border-[#f0ece5] last:border-0">
            <td className="px-3 py-2">{g.matchup}</td>
            <td className="px-3 py-2 tabular-nums">{g.home_score !== null ? `${g.away_score}–${g.home_score}` : '—'}</td>
            <td className="px-3 py-2 tabular-nums">{g.spread ?? '—'}</td>
            <td className="px-3 py-2">{g.winner_against_spread ?? <span className="text-[#b06a1a]">not scored</span>}</td>
            <td className="px-3 py-2 tabular-nums">{g.margin_bonus ?? '—'}</td>
            <td className="px-3 py-2">
              <span className={g.status === 'completed' ? (g.scored ? 'text-[#1f7a44]' : 'text-[#b06a1a]') : 'text-charcoal-400'}>
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
      <thead><tr className="text-left text-charcoal-500 border-b border-[#f0ece5]">
        <th className="px-3 py-2 font-medium">Kind</th><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Issue</th>
      </tr></thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={i} className="border-b border-[#f0ece5] last:border-0">
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
  let cls = 'bg-[#faf8f4] border-[#e7e2da] text-charcoal-600' // pending
  if (cell.disqualified) cls = 'bg-[#fbe9ec] border-[#f2c9d1] text-[#d1495b] line-through'
  else if (cell.result === 'win') cls = 'bg-[#e6f4ea] border-[#bfe3cc] text-[#1f7a44]'
  else if (cell.result === 'loss') cls = 'bg-[#fbe9ec] border-[#f2c9d1] text-[#d1495b]'
  else if (cell.result === 'push') cls = 'bg-[#fff5e2] border-[#f0dcb0] text-[#b06a1a]'
  const spread = cell.spread != null ? (cell.spread > 0 ? `+${cell.spread}` : `${cell.spread}`) : ''
  return (
    <span className={`${base} ${cls} ${cell.is_lock ? 'ring-2 ring-gold-400 font-semibold' : ''}`}
      title={`${cell.matchup}${cell.result ? ' · ' + cell.result : ''}${cell.points_earned != null ? ' · ' + cell.points_earned + 'pts' : ''}`}>
      {cell.is_lock ? '🔒 ' : ''}{cell.selected_team} {spread}
    </span>
  )
}
