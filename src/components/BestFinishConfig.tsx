import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Check, X } from 'lucide-react'

interface WeekConfig {
  week: number
  season: number
  best_finish_eligible: boolean
  picks_open: boolean
  games_locked: boolean
}

interface BestFinishConfigProps {
  season: number
}

export default function BestFinishConfig({ season }: BestFinishConfigProps) {
  const [weeks, setWeeks] = useState<WeekConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    loadWeeks()
  }, [season])

  const loadWeeks = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('week_settings')
        .select('week, season, best_finish_eligible, picks_open, games_locked')
        .eq('season', season)
        .gte('week', 11) // Only show weeks 11+
        .order('week', { ascending: true })

      if (error) throw error

      setWeeks(data || [])
    } catch (err: any) {
      console.error('Error loading weeks:', err)
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const toggleWeek = async (week: number, currentValue: boolean) => {
    try {
      setUpdating(true)
      setMessage(null)

      const { error } = await supabase
        .from('week_settings')
        .update({ best_finish_eligible: !currentValue })
        .eq('season', season)
        .eq('week', week)

      if (error) throw error

      setMessage({
        type: 'success',
        text: `Week ${week} ${!currentValue ? 'added to' : 'removed from'} Best Finish`
      })

      // Reload to get fresh data
      await loadWeeks()
    } catch (err: any) {
      console.error('Error updating week:', err)
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  const setAllWeeks = async (value: boolean) => {
    try {
      setUpdating(true)
      setMessage(null)

      const { error } = await supabase
        .from('week_settings')
        .update({ best_finish_eligible: value })
        .eq('season', season)
        .gte('week', 11)

      if (error) throw error

      setMessage({
        type: 'success',
        text: value ? 'All weeks added to Best Finish' : 'All weeks removed from Best Finish'
      })

      await loadWeeks()
    } catch (err: any) {
      console.error('Error updating all weeks:', err)
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUpdating(false)
    }
  }

  const eligibleCount = weeks.filter(w => w.best_finish_eligible).length

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-charcoal-500">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#e7e2da] bg-[#faf8f4]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2 text-[#4B3621]">
              <Trophy className="w-5 h-5 text-[#C9A04E]" />
              <span>Best Finish Championship Configuration</span>
            </CardTitle>
            <CardDescription className="mt-1 text-charcoal-500">
              Select which weeks count toward the 4th Quarter Championship
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-[#fff5e2] text-[#b06a1a] border-[#f0dcb0]">
            {eligibleCount} week{eligibleCount !== 1 ? 's' : ''} selected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Message Display */}
        {message && (
          <div className={`p-3 rounded-lg border ${
            message.type === 'success'
              ? 'bg-[#e6f4ea] border-[#bfe3cc] text-[#1f7a44]'
              : 'bg-[#fbe9ec] border-[#f2c9d1] text-[#d1495b]'
          }`}>
            {message.text}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-[#e7e2da]">
          <span className="text-sm text-charcoal-700 font-medium">Quick Actions:</span>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllWeeks(true)}
              disabled={updating || eligibleCount === weeks.length}
              className="text-[#1f7a44] border-[#bfe3cc] hover:bg-[#e6f4ea]"
            >
              <Check className="w-4 h-4 mr-1" />
              Enable All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllWeeks(false)}
              disabled={updating || eligibleCount === 0}
              className="text-[#d1495b] border-[#f2c9d1] hover:bg-[#fbe9ec]"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Week List */}
        <div className="space-y-2">
          {weeks.length === 0 ? (
            <div className="text-center py-6 text-charcoal-500">
              No weeks found for season {season}. Create weeks in Week Controls first.
            </div>
          ) : (
            weeks.map((week) => (
              <div
                key={week.week}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  week.best_finish_eligible
                    ? 'bg-[#e6f4ea] border-[#bfe3cc] ring-1 ring-[#bfe3cc]'
                    : 'bg-white border-[#e7e2da]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold tabular-nums ${
                    week.best_finish_eligible
                      ? 'bg-[#d6ecdd] text-[#1f7a44]'
                      : 'bg-[#f0ece5] text-charcoal-500'
                  }`}>
                    {week.week}
                  </div>
                  <div>
                    <div className="font-medium text-[#4B3621]">
                      Week {week.week} - Season {week.season}
                    </div>
                    <div className="text-xs text-charcoal-500 space-x-2">
                      {week.games_locked && <span className="text-[#d1495b]">🔒 Locked</span>}
                      {week.picks_open && !week.games_locked && <span className="text-[#1f7a44]">✓ Open</span>}
                      {!week.picks_open && !week.games_locked && <span className="text-charcoal-400">○ Not Open</span>}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant={week.best_finish_eligible ? 'default' : 'outline'}
                  onClick={() => toggleWeek(week.week, week.best_finish_eligible)}
                  disabled={updating}
                  className={week.best_finish_eligible
                    ? 'bg-[#1f7a44] hover:bg-[#186237] text-white'
                    : ''
                  }
                >
                  {week.best_finish_eligible ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Included
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 mr-1" />
                      Excluded
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Info */}
        <div className="bg-[#faf8f4] border border-[#e7e2da] rounded-lg p-3 text-xs text-charcoal-700">
          <strong>ℹ️ Note:</strong> Best Finish Championship typically includes weeks 11-14 (4th quarter).
          Changes take effect immediately on the leaderboard.
        </div>
      </CardContent>
    </Card>
  )
}
