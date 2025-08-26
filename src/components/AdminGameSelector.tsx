import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CFBGame {
  id: number
  week: number
  season: number
  season_type: string
  start_date: string
  completed: boolean
  home_team: string
  away_team: string
  home_conference?: string
  away_conference?: string
  venue?: string
  spread?: number
  home_ranking?: number
  away_ranking?: number
  game_importance?: number
  neutral_site?: boolean
}

interface AdminGameSelectorProps {
  games: CFBGame[]
  selectedGames: CFBGame[]
  onGameToggle: (game: CFBGame) => void
  onRankingUpdate?: (gameId: number, homeRanking?: number, awayRanking?: number) => void
  loading?: boolean
  maxGames?: number
}

export default function AdminGameSelector({
  games,
  selectedGames,
  onGameToggle,
  onRankingUpdate,
  loading = false,
  maxGames = 15
}: AdminGameSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [conferenceFilter, setConferenceFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'time' | 'team' | 'conference' | 'importance'>('importance')

  const isSelected = (game: CFBGame) => {
    return selectedGames.some(sg => sg.id === game.id)
  }

  const handleRankingChange = (gameId: number, team: 'home' | 'away', value: string) => {
    if (!onRankingUpdate) return
    
    const rankingValue = value === '' ? undefined : parseInt(value)
    if (rankingValue !== undefined && (rankingValue < 1 || rankingValue > 25)) return
    
    const game = games.find(g => g.id === gameId)
    if (!game) return
    
    const homeRanking = team === 'home' ? rankingValue : game.home_ranking
    const awayRanking = team === 'away' ? rankingValue : game.away_ranking
    
    onRankingUpdate(gameId, homeRanking, awayRanking)
  }

  const formatGameTime = (startDate: string) => {
    return new Date(startDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getConferences = () => {
    const conferences = new Set<string>()
    games.forEach(game => {
      if (game.home_conference) conferences.add(game.home_conference)
      if (game.away_conference) conferences.add(game.away_conference)
    })
    return Array.from(conferences).sort()
  }

  const filteredGames = games
    .filter(game => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return (
          game.home_team.toLowerCase().includes(term) ||
          game.away_team.toLowerCase().includes(term)
        )
      }
      return true
    })
    .filter(game => {
      // Conference filter
      if (conferenceFilter === 'all') return true
      return game.home_conference === conferenceFilter || game.away_conference === conferenceFilter
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'importance':
          return (a.game_importance || 1000) - (b.game_importance || 1000)
        case 'time':
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        case 'team':
          return a.away_team.localeCompare(b.away_team)
        case 'conference':
          return (a.home_conference || '').localeCompare(b.home_conference || '')
        default:
          return 0
      }
    })

  return (
    <div className="space-y-6">
      {/* Controls with prominent selection counter */}
      <div className="grid md:grid-cols-5 gap-4">
        <Input
          placeholder="Search teams..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <select
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All Conferences</option>
          {getConferences().map(conf => (
            <option key={conf} value={conf}>{conf}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'time' | 'team' | 'conference' | 'importance')}
          className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="importance">Sort by Importance</option>
          <option value="time">Sort by Time</option>
          <option value="team">Sort by Team</option>
          <option value="conference">Sort by Conference</option>
        </select>

        <div className="col-span-2">
          <Card className="h-10 flex items-center justify-center">
            <div className={cn(
              "text-sm font-semibold px-4",
              selectedGames.length === maxGames ? "text-green-600" : "text-charcoal-600"
            )}>
              {selectedGames.length === maxGames ? "✅" : "📋"} Selected: {selectedGames.length}/{maxGames} games
              {selectedGames.length === maxGames && (
                <span className="ml-2 text-xs text-green-500">Ready to save!</span>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Available Games */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Available Games ({filteredGames.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="text-center py-8 text-charcoal-500">
              <div className="text-2xl mb-2">🏈</div>
              <div>No games found</div>
              <div className="text-sm">Try adjusting your filters</div>
            </div>
          ) : (
            <div className="grid gap-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
              {filteredGames.map(game => {
                const selected = isSelected(game)
                const canSelect = !selected && selectedGames.length < maxGames
                const canInteract = selected || canSelect
                
                return (
                  <div
                    key={game.id}
                    className={cn(
                      "flex items-center justify-between p-3 border rounded-lg transition-all",
                      selected 
                        ? "border-green-500 bg-green-50 cursor-pointer" 
                        : canSelect 
                        ? "border-stone-200 hover:border-pigskin-300 hover:bg-stone-50 cursor-pointer"
                        : "border-stone-200 bg-stone-100 opacity-60 cursor-not-allowed"
                    )}
                    onClick={() => canInteract && onGameToggle(game)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <div className="font-medium text-sm flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold">{game.away_team}</span>
                                {game.away_ranking && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                                    #{game.away_ranking}
                                  </span>
                                )}
                                {onRankingUpdate && (
                                  <Input
                                    type="number"
                                    placeholder="Rank"
                                    min="1"
                                    max="25"
                                    value={game.away_ranking || ''}
                                    onChange={(e) => handleRankingChange(game.id, 'away', e.target.value)}
                                    className="w-16 h-6 text-xs px-1"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </div>
                              <span className="text-gray-500 font-normal">{game.neutral_site ? 'vs' : '@'}</span>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold">{game.home_team}</span>
                                {game.home_ranking && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                                    #{game.home_ranking}
                                  </span>
                                )}
                                {onRankingUpdate && (
                                  <Input
                                    type="number"
                                    placeholder="Rank"
                                    min="1"
                                    max="25"
                                    value={game.home_ranking || ''}
                                    onChange={(e) => handleRankingChange(game.id, 'home', e.target.value)}
                                    className="w-16 h-6 text-xs px-1"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        {selected && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-charcoal-500 space-x-4 mt-1">
                        <span>{formatGameTime(game.start_date)}</span>
                        {game.venue && <span>• {game.venue}</span>}
                        {game.home_conference && (
                          <span>• {game.home_conference}</span>
                        )}
                        {game.spread && (
                          <span>• {game.spread < 0 ? `${game.home_team} -${Math.abs(game.spread).toFixed(1)}` : `${game.away_team} -${game.spread.toFixed(1)}`}</span>
                        )}
                        {game.neutral_site && (
                          <span>• 🏟️ Neutral Site</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!selected && !canSelect && (
                        <span className="text-charcoal-400 text-sm">Max reached</span>
                      )}
                      <Button
                        variant={selected ? "outline" : "secondary"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onGameToggle(game)
                        }}
                        disabled={!canInteract}
                        className={selected ? "text-red-600 border-red-200 hover:bg-red-50" : ""}
                      >
                        {selected ? "Remove" : "Select"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}