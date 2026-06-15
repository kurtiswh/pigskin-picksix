import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'

/**
 * Admin control for the season rollover / crossover process.
 *
 * Edits the singleton app_settings row (active_season, grace_period_weeks),
 * which is the single source of truth the rest of the app reads via
 * useCurrentSeason. Changing the active season here rolls the whole app over to
 * a new season in one place instead of editing code across ~20 files.
 */
export default function SeasonSettingsAdmin() {
  const { activeSeason, graceWeeks, refresh } = useCurrentSeason()

  const [season, setSeason] = useState(activeSeason)
  const [grace, setGrace] = useState(graceWeeks)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Keep the form in sync once the context value loads.
  useEffect(() => {
    setSeason(activeSeason)
    setGrace(graceWeeks)
  }, [activeSeason, graceWeeks])

  const dirty = season !== activeSeason || grace !== graceWeeks
  const seasonChanged = season !== activeSeason

  const handleSave = async () => {
    if (seasonChanged) {
      const ok = window.confirm(
        `Roll the active season from ${activeSeason} to ${season}?\n\n` +
        `This changes what every player sees across the whole site. ` +
        `Make sure ${season} games and LeagueSafe payments are loaded first.`
      )
      if (!ok) return
    }

    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ active_season: season, grace_period_weeks: grace })
        .eq('id', true)

      if (error) throw error

      await refresh()
      setMessage({ type: 'success', text: `Saved. Active season is now ${season}, grace period ${grace} week(s).` })
    } catch (e: any) {
      console.error('Failed to update app_settings:', e)
      setMessage({ type: 'error', text: `Could not save: ${e?.message || 'unknown error'}. (Admin access required.)` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-charcoal-500">
          Controls the active season for the entire app. Current active season:{' '}
          <span className="font-semibold">{activeSeason}</span>.
        </p>

        <div className="flex flex-wrap gap-6">
          <div className="space-y-1">
            <label className="text-sm font-medium">Active season</label>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setSeason(s => s - 1)} disabled={saving}>−</Button>
              <Input
                type="number"
                className="w-24 text-center"
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value) || activeSeason)}
              />
              <Button variant="outline" onClick={() => setSeason(s => s + 1)} disabled={saving}>+</Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Grace period (weeks)</label>
            <Input
              type="number"
              min={0}
              className="w-24"
              value={grace}
              onChange={(e) => setGrace(Math.max(0, parseInt(e.target.value) || 0))}
            />
            <p className="text-xs text-charcoal-400 max-w-xs">
              Unpaid players are shown on leaderboards through this many weeks, then hidden until paid.
            </p>
          </div>
        </div>

        {seasonChanged && (
          <p className="text-sm text-amber-600">
            ⚠️ You are about to roll the active season to <strong>{season}</strong>. Load that season's
            games and payments first, or leaderboards will be empty.
          </p>
        )}

        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}

        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save season settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
