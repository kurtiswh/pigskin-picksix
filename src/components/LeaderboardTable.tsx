import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  weekly_record?: string
  season_record: string
  lock_record: string
  weekly_points?: number
  season_points: number
  weekly_rank?: number
  season_rank: number
  best_finish_rank?: number
  total_picks: number
  total_wins: number
  total_losses: number
  total_pushes: number
  lock_wins: number
  lock_losses: number
  last_week_points?: number
  trend?: 'up' | 'down' | 'same'
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  type: 'weekly' | 'season' | 'best-finish'
  week?: number
  loading?: boolean
  lastUpdate?: Date | null
  isLive?: boolean
  hasLiveGames?: boolean
}

export default function LeaderboardTable({ 
  entries, 
  type, 
  week,
  loading = false,
  lastUpdate = null,
  isLive = false,
  hasLiveGames = false
}: LeaderboardTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'record' | 'points'>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filteredEntries = entries
    .filter(entry => 
      entry.display_name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'name':
          aVal = a.display_name.toLowerCase()
          bVal = b.display_name.toLowerCase()
          break
        case 'record':
          aVal = a.total_wins
          bVal = b.total_wins
          break
        case 'points':
          aVal = type === 'weekly' ? (a.weekly_points || 0) : a.season_points
          bVal = type === 'weekly' ? (b.weekly_points || 0) : b.season_points
          break
        default:
          aVal = type === 'weekly' ? (a.weekly_rank || 999) : a.season_rank
          bVal = type === 'weekly' ? (b.weekly_rank || 999) : b.season_rank
      }
      
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal)
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

  const getTitle = () => {
    switch (type) {
      case 'weekly':
        return `Week ${week} Leaderboard`
      case 'season':
        return 'Season Leaderboard'
      case 'best-finish':
        return 'Best Finish Championship (Weeks 11-14)'
      default:
        return 'Leaderboard'
    }
  }

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up': return '📈'
      case 'down': return '📉'
      case 'same': return '➡️'
      default: return ''
    }
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈' 
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-charcoal-600">Loading leaderboard...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span>{getTitle()}</span>
            {isLive && (
              <div className="flex items-center space-x-1">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  hasLiveGames ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                }`}></div>
                <span className={`text-xs font-medium ${
                  hasLiveGames ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {hasLiveGames ? 'LIVE' : 'READY'}
                </span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-normal text-charcoal-500">
              {filteredEntries.length} participants
            </div>
            {lastUpdate && (
              <div className="text-xs text-charcoal-400">
                Updated {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </CardTitle>
        
        {/* Search and Sort Controls */}
        <div className="flex gap-4 mt-4">
          <Input
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex h-10 w-40 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="rank">Sort by Rank</option>
            <option value="name">Sort by Name</option>
            <option value="record">Sort by Record</option>
            <option value="points">Sort by Points</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-charcoal-500">
            <div className="text-4xl mb-4">🏈</div>
            <div>No results found</div>
            <div className="text-sm">Try adjusting your search</div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-charcoal-500 uppercase tracking-wide border-b border-stone-200">
              <div className="col-span-1">Rank</div>
              <div className="col-span-3">Player</div>
              <div className="col-span-2">Record</div>
              <div className="col-span-2">Lock Record</div>
              <div className="col-span-2">Points</div>
              <div className="col-span-2">Trend</div>
            </div>
            
            {/* Entries */}
            {filteredEntries.map((entry, index) => {
              const rank = type === 'weekly' ? (entry.weekly_rank || index + 1) : entry.season_rank
              const points = type === 'weekly' ? (entry.weekly_points || 0) : entry.season_points
              const record = type === 'weekly' ? entry.weekly_record : entry.season_record
              
              return (
                <div
                  key={entry.user_id}
                  className={cn(
                    "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg transition-colors hover:bg-stone-50",
                    rank <= 3 && "bg-gradient-to-r from-gold-50 to-transparent border border-gold-200"
                  )}
                >
                  {/* Rank */}
                  <div className="col-span-1 flex items-center">
                    <span className={cn(
                      "font-bold",
                      rank === 1 && "text-gold-600",
                      rank === 2 && "text-stone-400", 
                      rank === 3 && "text-amber-600"
                    )}>
                      {getRankIcon(rank)}
                    </span>
                  </div>
                  
                  {/* Player */}
                  <div className="col-span-3 flex items-center">
                    <div>
                      <div className="font-semibold">{entry.display_name}</div>
                      {type === 'season' && entry.last_week_points !== undefined && (
                        <div className="text-xs text-charcoal-500">
                          Last week: {entry.last_week_points} pts
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Record */}
                  <div className="col-span-2 flex items-center">
                    <div>
                      <div className="font-medium">{record || `${entry.total_wins}-${entry.total_losses}-${entry.total_pushes}`}</div>
                      <div className="text-xs text-charcoal-500">{entry.total_picks} picks</div>
                    </div>
                  </div>
                  
                  {/* Lock Record */}
                  <div className="col-span-2 flex items-center">
                    <div>
                      <div className="font-medium">{entry.lock_record}</div>
                      <div className="text-xs text-charcoal-500">
                        {entry.lock_wins + entry.lock_losses} locks
                      </div>
                    </div>
                  </div>
                  
                  {/* Points */}
                  <div className="col-span-2 flex items-center">
                    <div className="text-right">
                      <div className="font-bold text-lg">{points}</div>
                      <div className="text-xs text-charcoal-500">points</div>
                    </div>
                  </div>
                  
                  {/* Trend */}
                  <div className="col-span-2 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xl">{getTrendIcon(entry.trend)}</div>
                      {type === 'best-finish' && entry.best_finish_rank && (
                        <div className="text-xs text-charcoal-500">
                          BF: #{entry.best_finish_rank}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Stats Summary */}
        <div className="mt-6 pt-4 border-t border-stone-200 grid md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-pigskin-600">
              {filteredEntries.reduce((sum, entry) => sum + entry.total_picks, 0)}
            </div>
            <div className="text-xs text-charcoal-500">Total Picks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {filteredEntries.reduce((sum, entry) => sum + entry.total_wins, 0)}
            </div>
            <div className="text-xs text-charcoal-500">Total Wins</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gold-600">
              {filteredEntries.reduce((sum, entry) => sum + entry.lock_wins, 0)}
            </div>
            <div className="text-xs text-charcoal-500">Lock Wins</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-pigskin-600">
              {Math.round(filteredEntries.reduce((sum, entry) => sum + entry.season_points, 0) / Math.max(filteredEntries.length, 1))}
            </div>
            <div className="text-xs text-charcoal-500">Avg Points</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}