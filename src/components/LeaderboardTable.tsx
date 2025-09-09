import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

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
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  type: 'weekly' | 'season' | 'best-finish'
  week?: number
  loading?: boolean
  lastUpdate?: Date | null
  isLive?: boolean
  hasLiveGames?: boolean
  liveUpdatesEnabled?: boolean
}

export default function LeaderboardTable({ 
  entries, 
  type, 
  week,
  loading = false,
  lastUpdate = null,
  isLive = false,
  hasLiveGames = false,
  liveUpdatesEnabled = false
}: LeaderboardTableProps) {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'record' | 'points'>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Check if current user is admin
  const isAdmin = user?.is_admin === true

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
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
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
  
  // Helper function to check if this entry's points are tied with others
  const isTiedPoints = (entry: LeaderboardEntry, entries: LeaderboardEntry[], type: 'weekly' | 'season' | 'best-finish') => {
    const entryPoints = type === 'weekly' ? (entry.weekly_points || 0) : entry.season_points
    const samePointsCount = entries.filter(e => {
      const ePoints = type === 'weekly' ? (e.weekly_points || 0) : e.season_points
      return ePoints === entryPoints
    }).length
    return samePointsCount > 1
  }

  const getSourceBadge = (source?: 'authenticated' | 'anonymous' | 'mixed') => {
    switch (source) {
      case 'authenticated':
        return { text: 'Auth', color: 'bg-blue-100 text-blue-800', icon: '🔐' }
      case 'anonymous':
        return { text: 'Anon', color: 'bg-purple-100 text-purple-800', icon: '👤' }
      case 'mixed':
        return { text: 'Mixed', color: 'bg-orange-100 text-orange-800', icon: '🔄' }
      default:
        return { text: 'Auth', color: 'bg-blue-100 text-blue-800', icon: '🔐' }
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
            {(isLive || liveUpdatesEnabled) && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    liveUpdatesEnabled ? 'bg-green-500 animate-pulse' : 
                    hasLiveGames ? 'bg-blue-500 animate-pulse' : 'bg-yellow-500'
                  }`}></div>
                  <span className={`text-xs font-medium ${
                    liveUpdatesEnabled ? 'text-green-600' : 
                    hasLiveGames ? 'text-blue-600' : 'text-yellow-600'
                  }`}>
                    {liveUpdatesEnabled ? 'AUTO-UPDATE' : hasLiveGames ? 'LIVE GAMES' : 'READY'}
                  </span>
                </div>
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
            {/* Header - Hidden on mobile, shown on desktop */}
            <div className={`hidden md:grid gap-4 px-4 py-2 text-xs font-medium text-charcoal-500 uppercase tracking-wide border-b border-stone-200 ${isAdmin ? 'grid-cols-12' : 'grid-cols-10'}`}>
              <div className="col-span-1">Rank</div>
              <div className="col-span-3">Player</div>
              {isAdmin && <div className="col-span-2">Source</div>}
              <div className="col-span-2">Record</div>
              <div className="col-span-2">Lock</div>
              <div className="col-span-2">Points</div>
            </div>
            
            {/* Entries */}
            {filteredEntries.map((entry, index) => {
              const rank = type === 'weekly' ? (entry.weekly_rank || index + 1) : entry.season_rank
              const points = type === 'weekly' ? (entry.weekly_points || 0) : entry.season_points
              const record = type === 'weekly' ? entry.weekly_record : entry.season_record
              const sourceBadge = getSourceBadge(entry.pick_source)
              const isTied = isTiedPoints(entry, filteredEntries, type)
              
              return (
                <div key={entry.user_id}>
                  {/* Desktop Layout */}
                  <div
                    className={cn(
                      `hidden md:grid gap-4 px-4 py-3 rounded-lg transition-colors hover:bg-stone-50 ${isAdmin ? 'grid-cols-12' : 'grid-cols-10'}`,
                      rank <= 3 && "bg-gradient-to-r from-gold-50 to-transparent border border-gold-200",
                      isTied && rank > 3 && "bg-stone-50 border-l border-stone-300"
                    )}
                  >
                    {/* Rank */}
                    <div className="col-span-1 flex items-center">
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          "font-bold",
                          rank === 1 && "text-gold-600",
                          rank === 2 && "text-stone-400", 
                          rank === 3 && "text-amber-600"
                        )}>
                          {getRankIcon(rank)}
                        </span>
                        {isTied && (
                          <span className="text-xs font-medium text-stone-500 uppercase" title="Tied rank">
                            T
                          </span>
                        )}
                      </div>
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
                    
                    {/* Source - Only show for admins */}
                    {isAdmin && (
                      <div className="col-span-2 flex items-center">
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                          sourceBadge.color
                        )}>
                          <span className="text-xs">{sourceBadge.icon}</span>
                          <span>{sourceBadge.text}</span>
                        </div>
                      </div>
                    )}
                    
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
                      <div className="text-right w-full">
                        <div className="font-bold text-lg">{points}</div>
                        <div className="text-xs text-charcoal-500">
                          {getTrendIcon(entry.trend)} points
                          {entry.rank_change !== undefined && (
                            <span className="ml-1 text-xs font-medium" title={`Previous rank: ${entry.previous_rank}`}>
                              ({entry.rank_change > 0 ? '+' : ''}{entry.rank_change})
                            </span>
                          )}
                          {type === 'best-finish' && entry.best_finish_rank && (
                            <span className="ml-2">BF: #{entry.best_finish_rank}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Card Layout */}
                  <div
                    className={cn(
                      "md:hidden p-4 rounded-lg border transition-colors hover:bg-stone-50",
                      rank <= 3 && "bg-gradient-to-r from-gold-50 to-transparent border-gold-200",
                      isTied && rank > 3 && "bg-stone-50 border-l-4 border-l-stone-300",
                      !isTied && rank > 3 && "border-stone-200"
                    )}
                  >
                    {/* Mobile Header Row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-bold text-lg",
                          rank === 1 && "text-gold-600",
                          rank === 2 && "text-stone-400", 
                          rank === 3 && "text-amber-600"
                        )}>
                          {getRankIcon(rank)}
                        </span>
                        {isTied && (
                          <span className="text-xs font-medium text-stone-500 uppercase bg-stone-100 px-1 py-0.5 rounded" title="Tied rank">
                            TIE
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xl text-pigskin-600">{points}</div>
                        <div className="text-xs text-charcoal-500">
                          {getTrendIcon(entry.trend)} points
                          {entry.rank_change !== undefined && (
                            <span className="ml-1 font-medium" title={`Previous rank: ${entry.previous_rank}`}>
                              ({entry.rank_change > 0 ? '+' : ''}{entry.rank_change})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Player Name */}
                    <div className="font-semibold text-lg mb-2">{entry.display_name}</div>
                    
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-charcoal-500 text-xs uppercase tracking-wide">Record</div>
                        <div className="font-medium">{record || `${entry.total_wins}-${entry.total_losses}-${entry.total_pushes}`}</div>
                        <div className="text-xs text-charcoal-400">{entry.total_picks} picks</div>
                      </div>
                      <div>
                        <div className="text-charcoal-500 text-xs uppercase tracking-wide">Lock Record</div>
                        <div className="font-medium">{entry.lock_record}</div>
                        <div className="text-xs text-charcoal-400">{entry.lock_wins + entry.lock_losses} locks</div>
                      </div>
                    </div>
                    
                    {/* Admin Source Badge - Mobile */}
                    {isAdmin && (
                      <div className="mt-3 flex justify-start">
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                          sourceBadge.color
                        )}>
                          <span className="text-xs">{sourceBadge.icon}</span>
                          <span>{sourceBadge.text}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Season-specific info */}
                    {type === 'season' && entry.last_week_points !== undefined && (
                      <div className="mt-2 text-xs text-charcoal-500">
                        Last week: {entry.last_week_points} pts
                      </div>
                    )}
                    
                    {/* Best finish info */}
                    {type === 'best-finish' && entry.best_finish_rank && (
                      <div className="mt-2 text-xs text-charcoal-500">
                        Best Finish: #{entry.best_finish_rank}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Tie Indicator Legend - Only show if there are ties */}
        {filteredEntries.some((entry, _, arr) => isTiedPoints(entry, arr, type)) && (
          <div className="mt-4 p-2 bg-stone-50 rounded border border-stone-200">
            <div className="flex items-center gap-2 text-sm text-stone-700">
              <span className="font-medium text-stone-600">T</span>
              <span>= Tied rank (same points)</span>
              <span className="ml-auto text-xs text-stone-500">
                Ties broken by: Total Wins → Name (alphabetical)
              </span>
            </div>
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