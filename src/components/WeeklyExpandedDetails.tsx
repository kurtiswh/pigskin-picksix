import { Lock, Clock, CheckCircle, XCircle, Minus } from 'lucide-react'
import { UserWeeklyPicks, WeeklyPickDetail } from '@/services/leaderboard.types'

interface WeeklyExpandedDetailsProps {
  data: UserWeeklyPicks
  isLoading?: boolean
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_130px_96px_52px] gap-3 items-center'

function isPending(pick: WeeklyPickDetail) {
  return pick.game_status === 'scheduled' || pick.game_status === 'in_progress' || pick.result === null
}

function resultMeta(pick: WeeklyPickDetail) {
  if (isPending(pick)) return { icon: <Clock className="w-3.5 h-3.5 text-gray-400" />, label: pick.game_status === 'in_progress' ? 'Live' : 'Pending', color: 'text-gray-500', row: '' }
  switch (pick.result) {
    case 'win':  return { icon: <CheckCircle className="w-3.5 h-3.5 text-green-600" />, label: 'Win',  color: 'text-green-700', row: 'bg-green-50/60' }
    case 'loss': return { icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,      label: 'Loss', color: 'text-red-600',   row: 'bg-red-50/50' }
    case 'push': return { icon: <Minus className="w-3.5 h-3.5 text-[#C9A04E]" />,      label: 'Push', color: 'text-[#8a6a1f]', row: 'bg-[#fff8ea]' }
    default:     return { icon: <Clock className="w-3.5 h-3.5 text-gray-400" />, label: '—', color: 'text-gray-500', row: '' }
  }
}

export function WeeklyExpandedDetails({ data, isLoading = false }: WeeklyExpandedDetailsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-[#4B3621]" />
        <span className="ml-2 text-gray-600">Loading pick details…</span>
      </div>
    )
  }

  if (!data || !data.picks || data.picks.length === 0) {
    return <div className="text-center py-8 text-gray-500">No picks found for this week</div>
  }

  const picks = [...data.picks].sort((a, b) => {
    if (a.is_lock && !b.is_lock) return -1
    if (!a.is_lock && b.is_lock) return 1
    return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
  })

  return (
    <div className="space-y-3">
      {/* Compact summary line */}
      <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
        <h4 className="font-semibold text-gray-900">{data.display_name}'s Week {data.week} picks</h4>
        <div className="flex items-center gap-5 text-xs text-gray-500">
          <span>Total <b className="text-[#4B3621] tabular-nums text-sm">{data.total_points}</b></span>
          <span>Record <b className="tabular-nums text-sm text-gray-700">{data.weekly_record}</b></span>
          <span className="flex items-center gap-1">Lock <Lock className="w-3 h-3" /> <b className="tabular-nums text-sm text-gray-700">{data.lock_record}</b></span>
        </div>
      </div>

      {/* Clean picks table */}
      <div className="rounded-xl border border-[#ece7de] overflow-hidden bg-white max-w-3xl">
        <div className={`${GRID} px-3 py-2 bg-[#faf8f4] border-b border-[#ece7de] text-[10px] font-bold uppercase tracking-wider text-gray-500`}>
          <div>Game</div>
          <div>Pick</div>
          <div>Result</div>
          <div className="text-right">Pts</div>
        </div>

        {picks.map((p) => {
          const r = resultMeta(p)
          return (
            <div key={p.game_id} className={`${GRID} px-3 py-2.5 border-b border-[#f0ece5] last:border-b-0 text-sm ${r.row}`}>
              <div className="font-medium text-gray-900 flex items-center gap-1.5 min-w-0">
                {p.is_lock && <Lock className="w-3.5 h-3.5 text-[#4B3621] shrink-0" />}
                <span className="truncate">{p.game_name}</span>
              </div>
              <div className="text-gray-600 truncate">{p.selected_team}</div>
              <div className={`flex items-center gap-1.5 font-medium ${r.color}`}>
                {r.icon}<span>{r.label}</span>
              </div>
              <div className={`text-right font-bold tabular-nums ${r.color}`}>{p.points_earned}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
