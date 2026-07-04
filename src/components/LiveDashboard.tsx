import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

/**
 * Live Scores — a game-day health dashboard (Part B).
 *
 * At-a-glance answer to "is everything working right now?" during Thu/Fri/Sat:
 *   - a health bar (last automated update, live/final/upcoming counts, and the
 *     key alert: completed games not yet scored)
 *   - a per-game grid (score, status, pick counts + locks, winner ATS, last
 *     stats update), with each game expandable for manual score entry.
 *
 * Scoring itself runs automatically server-side (pg_cron -> live-score-updater).
 * The actions here are just: pull now, re-score, or fix a game by hand.
 */

interface LiveDashboardProps {
  season: number
  initialWeek: number
}

interface GameRow {
  id: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number | null
  status: string
  kickoff_time: string | null
  winner_against_spread: string | null
  margin_bonus: number | null
  total_picks: number | null
  home_team_picks: number | null
  away_team_picks: number | null
  home_team_locks: number | null
  away_team_locks: number | null
  pick_stats_updated_at: string | null
  updated_at: string | null
}

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1)

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtKick(iso: string | null): string {
  if (!iso) return 'TBD'
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function LiveDashboard({ season, initialWeek }: LiveDashboardProps) {
  const [week, setWeek] = useState(initialWeek || 1)
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: e } = await supabase
        .from('games')
        .select('id, home_team, away_team, home_score, away_score, spread, status, kickoff_time, winner_against_spread, margin_bonus, total_picks, home_team_picks, away_team_picks, home_team_locks, away_team_locks, pick_stats_updated_at, updated_at')
        .eq('season', season).eq('week', week)
        .order('kickoff_time', { ascending: true })
      if (e) throw e
      setGames((data as GameRow[]) || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load games')
    } finally {
      setLoading(false)
    }
  }, [season, week])

  useEffect(() => { load() }, [load])

  const fetchLatest = async () => {
    setFetching(true); setError('')
    try {
      const { error: e } = await supabase.functions.invoke('live-score-updater')
      if (e) throw e
      await load()
    } catch (err: any) { setError(err?.message || 'Fetch failed') } finally { setFetching(false) }
  }

  const rescoreWeek = async () => {
    setRescoring(true); setError('')
    try {
      const toScore = games.filter(g => g.status === 'completed' && g.home_score !== null && g.away_score !== null)
      for (const g of toScore) {
        await supabase.rpc('calculate_and_update_completed_game', { game_id_param: g.id })
      }
      await load()
    } catch (err: any) { setError(err?.message || 'Re-score failed') } finally { setRescoring(false) }
  }

  // --- health rollup ---
  const live = games.filter(g => g.status === 'in_progress').length
  const final = games.filter(g => g.status === 'completed').length
  const upcoming = games.filter(g => g.status === 'scheduled').length
  const needsScoring = games.filter(g => g.status === 'completed' && g.home_score !== null && g.winner_against_spread === null).length
  const totalPicks = games.reduce((s, g) => s + (g.total_picks || 0), 0)
  const lastUpdate = games.reduce<string | null>((max, g) => {
    if (!g.updated_at) return max
    return !max || g.updated_at > max ? g.updated_at : max
  }, null)
  const staleWhileLive = live > 0 && lastUpdate && (Date.now() - new Date(lastUpdate).getTime()) > 10 * 60000

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-pigskin-900">Live Scores</h2>
          <p className="text-charcoal-600 text-sm">Game-day health — scores update automatically every 5 min during games.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={week} onChange={e => setWeek(Number(e.target.value))}
            className="border border-charcoal-200 rounded-md px-3 py-2 text-sm bg-white">
            {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
          <Button size="sm" onClick={fetchLatest} disabled={fetching} className="bg-pigskin-600 hover:bg-pigskin-700 text-white">
            {fetching ? 'Fetching…' : '🔄 Fetch Latest Scores'}
          </Button>
        </div>
      </div>

      {error && <Card className="border-red-200"><CardContent className="p-4 text-red-700 text-sm">⚠️ {error}</CardContent></Card>}

      {/* Health bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <HealthTile label="Last update" value={timeAgo(lastUpdate)} tone={staleWhileLive ? 'warn' : 'ok'}
          sub={staleWhileLive ? 'stale while games live' : 'automated'} />
        <HealthTile label="Live now" value={String(live)} tone={live > 0 ? 'live' : 'muted'} />
        <HealthTile label="Final" value={String(final)} tone="muted" />
        <HealthTile label="Upcoming" value={String(upcoming)} tone="muted" />
        <HealthTile label="Needs scoring" value={String(needsScoring)} tone={needsScoring > 0 ? 'alert' : 'ok'}
          sub={needsScoring > 0 ? 'completed, unscored' : 'all scored'} />
        <HealthTile label="Total picks" value={totalPicks ? totalPicks.toLocaleString() : '—'} tone="muted" />
      </div>

      {needsScoring > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2 text-sm">
            <span className="text-amber-800">
              <b>{needsScoring}</b> completed game{needsScoring > 1 ? 's are' : ' is'} finished but not yet scored.
              Usually the next auto-run handles it — or force it now.
            </span>
            <Button size="sm" onClick={rescoreWeek} disabled={rescoring} className="bg-amber-600 hover:bg-amber-700 text-white">
              {rescoring ? 'Scoring…' : `Re-score Week ${week}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Games grid */}
      {games.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-charcoal-400">No games for Week {week}.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {games.map(g => <GameCard key={g.id} game={g} onSaved={load} />)}
        </div>
      )}
    </div>
  )
}

function HealthTile({ label, value, tone, sub }: {
  label: string; value: string; tone: 'ok' | 'warn' | 'alert' | 'live' | 'muted'; sub?: string
}) {
  const tones: Record<string, string> = {
    ok: 'border-green-200 bg-green-50 text-green-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    alert: 'border-red-200 bg-red-50 text-red-700',
    live: 'border-red-200 bg-red-50 text-red-700',
    muted: 'border-charcoal-100 bg-white text-charcoal-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold leading-tight flex items-center gap-2">
        {tone === 'live' && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />}
        {value}
      </div>
      {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  )
}

function GameCard({ game: g, onSaved }: { game: GameRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [home, setHome] = useState(g.home_score?.toString() ?? '')
  const [away, setAway] = useState(g.away_score?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const scored = g.winner_against_spread !== null
  const completed = g.status === 'completed'
  const attention = completed && g.home_score !== null && !scored

  const statusBadge = () => {
    if (g.status === 'in_progress') return <span className="text-xs font-bold text-red-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE</span>
    if (attention) return <span className="text-xs font-bold text-amber-700">FINAL · awaiting scoring</span>
    if (completed) return <span className="text-xs font-bold text-green-700">FINAL</span>
    return <span className="text-xs text-charcoal-500">{fmtKick(g.kickoff_time)}</span>
  }

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const h = home === '' ? null : Number(home)
      const a = away === '' ? null : Number(away)
      const { error: e1 } = await supabase.from('games')
        .update({ home_score: h, away_score: a, status: h !== null && a !== null ? 'completed' : g.status })
        .eq('id', g.id)
      if (e1) throw e1
      if (h !== null && a !== null) {
        const { error: e2 } = await supabase.rpc('calculate_and_update_completed_game', { game_id_param: g.id })
        if (e2) throw e2
      }
      setOpen(false)
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Save failed') } finally { setSaving(false) }
  }

  const spread = g.spread != null ? (g.spread > 0 ? `+${g.spread}` : `${g.spread}`) : ''

  return (
    <div className={`rounded-lg border bg-white ${attention ? 'border-amber-300' : g.status === 'in_progress' ? 'border-red-200' : 'border-charcoal-100'}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-charcoal-900 truncate">{g.away_team} @ {g.home_team}</div>
            <div className="text-xs text-charcoal-500">Home {spread || '—'}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold tabular-nums">
              {g.away_score ?? '–'} <span className="text-charcoal-300">/</span> {g.home_score ?? '–'}
            </div>
            {statusBadge()}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-charcoal-600">
          <div>
            {scored ? (
              <span>ATS: <b>{g.winner_against_spread}</b>{g.margin_bonus ? ` · +${g.margin_bonus} bonus` : ''}</span>
            ) : completed ? <span className="text-amber-600">not scored yet</span> : <span>—</span>}
          </div>
          <div>
            🏈 {g.total_picks ?? 0} picks
            {g.total_picks ? <> · {g.away_team_picks ?? 0}/{g.home_team_picks ?? 0}</> : null}
            {(g.home_team_locks || g.away_team_locks) ? <> · 🔒 {(g.home_team_locks || 0) + (g.away_team_locks || 0)}</> : null}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-charcoal-400">stats {timeAgo(g.pick_stats_updated_at)}</span>
          <button onClick={() => setOpen(o => !o)} className="text-xs text-pigskin-700 hover:underline">
            {open ? 'Close' : 'Edit score'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-charcoal-100 p-3 bg-charcoal-50/40">
          <div className="flex items-end gap-2">
            <label className="text-xs text-charcoal-600">
              {g.away_team}<Input value={away} onChange={e => setAway(e.target.value)} className="h-8 w-20 mt-1" inputMode="numeric" />
            </label>
            <label className="text-xs text-charcoal-600">
              {g.home_team}<Input value={home} onChange={e => setHome(e.target.value)} className="h-8 w-20 mt-1" inputMode="numeric" />
            </label>
            <Button size="sm" onClick={save} disabled={saving} className="bg-pigskin-600 hover:bg-pigskin-700 text-white">
              {saving ? 'Saving…' : 'Save & Score'}
            </Button>
          </div>
          {err && <div className="text-xs text-red-600 mt-2">⚠️ {err}</div>}
          <div className="text-[11px] text-charcoal-400 mt-2">Saving a final score runs the canonical scorer for this game.</div>
        </div>
      )}
    </div>
  )
}
