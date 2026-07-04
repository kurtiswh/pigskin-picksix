import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { BestFinishService, BestFinishEntry } from '@/services/bestFinishService'
import { useAuth } from '@/hooks/useAuth'
import { ExpandableLeaderboardRow, LeaderboardRowContent } from '@/components/ExpandableLeaderboardRow'
import { BestFinishExpandedDetails } from '@/components/BestFinishExpandedDetails'

interface BestFinishLeaderboardProps {
  season: number
  searchTerm?: string
}

export function BestFinishLeaderboard({ season, searchTerm = '' }: BestFinishLeaderboardProps) {
  const { user } = useAuth()
  const [data, setData] = useState<BestFinishEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [eligibleWeeks, setEligibleWeeks] = useState<number[]>([])

  // State for expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedData, setExpandedData] = useState<Map<string, any>>(new Map())
  const [loadingExpansions, setLoadingExpansions] = useState<Set<string>>(new Set())

  const isAdmin = user?.is_admin === true

  useEffect(() => {
    loadData()
    loadEligibleWeeks()
  }, [season])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      console.log('🏆 Loading Best Finish leaderboard for season', season)

      const entries = await BestFinishService.getBestFinishLeaderboard(season)
      console.log('✅ Loaded Best Finish data:', entries.length, 'entries')

      setData(entries)
    } catch (err: any) {
      console.error('❌ Failed to load Best Finish leaderboard:', err)
      setError(err.message || 'Failed to load Best Finish leaderboard')
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const loadEligibleWeeks = async () => {
    try {
      const weeks = await BestFinishService.getBestFinishWeeks(season)
      setEligibleWeeks(weeks)
      console.log('📅 Best Finish eligible weeks:', weeks)
    } catch (err: any) {
      console.error('❌ Failed to load eligible weeks:', err)
    }
  }

  // Handle row expansion
  const handleRowToggle = async (userId: string) => {
    const rowKey = `${userId}-bestfinish`
    const isExpanded = expandedRows.has(rowKey)

    if (isExpanded) {
      // Collapse row
      const newExpanded = new Set(expandedRows)
      newExpanded.delete(rowKey)
      setExpandedRows(newExpanded)
      return
    }

    // Expand row - load data if not already loaded
    const newExpanded = new Set(expandedRows)
    newExpanded.add(rowKey)
    setExpandedRows(newExpanded)

    if (!expandedData.has(rowKey)) {
      const newLoading = new Set(loadingExpansions)
      newLoading.add(rowKey)
      setLoadingExpansions(newLoading)

      try {
        console.log(`🔍 Loading Best Finish expanded data for ${rowKey}`)
        const details = await BestFinishService.getBestFinishDetails(userId, season)
        console.log('✅ Best Finish expanded data loaded:', details)

        if (details) {
          const newExpandedData = new Map(expandedData)
          newExpandedData.set(rowKey, details)
          setExpandedData(newExpandedData)
        } else {
          console.warn('⚠️ No data returned for expanded content:', rowKey)
        }
      } catch (error) {
        console.error('❌ Failed to load expanded data:', error)
      } finally {
        const newLoading = new Set(loadingExpansions)
        newLoading.delete(rowKey)
        setLoadingExpansions(newLoading)
      }
    }
  }

  const exportToCSV = async () => {
    if (data.length === 0) return

    try {
      const csv = await BestFinishService.exportToCSV(season)
      BestFinishService.downloadCSV(csv, `best-finish-${season}.csv`)
    } catch (err: any) {
      console.error('❌ Failed to export CSV:', err)
    }
  }

  // Filter data based on payment status (non-admin users only see paid players)
  const getFilteredData = () => {
    if (isAdmin) {
      return data
    }
    // Non-admin users only see paid players (payment_status is 'Paid' from the view)
    return data.filter(entry => entry.paymentStatus?.toLowerCase() === 'paid')
  }

  const filteredData = getFilteredData().filter((entry) =>
    searchTerm === '' ||
    entry.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Get display rank for tied players
  const getDisplayRank = (entry: BestFinishEntry) => {
    const tiedPlayers = filteredData.filter(e => e.totalPoints === entry.totalPoints)
    if (tiedPlayers.length > 1) {
      const ranks = tiedPlayers.map(p => p.rank)
      return Math.min(...ranks)
    }
    return entry.rank
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-charcoal-600">Loading Best Finish leaderboard...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 p-4 bg-red-50 rounded">
        Error: {error}
      </div>
    )
  }

  if (filteredData.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          {data.length === 0
            ? 'No Best Finish data available yet. The competition starts in Week 11.'
            : 'No players match your search.'
          }
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Best Finish Championship - Season {season}</CardTitle>
            {eligibleWeeks.length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                4th Quarter Competition • Weeks {eligibleWeeks.join(', ')}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button
              onClick={exportToCSV}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
              disabled={data.length === 0}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Competition Info Banner */}
          <div className="mb-4 p-4 bg-[#fff8ea] rounded-xl border border-[#f0dcb0]">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🏆</div>
              <div>
                <h4 className="font-semibold text-[#8a6a1f] mb-1">4th Quarter Championship</h4>
                <p className="text-sm text-[#a07c2b]">
                  Total points over final 4 weeks. Tiebreakers: Win % → Lock Win % → Alphabetical
                </p>
              </div>
            </div>
          </div>

          {/* Header row - Hidden on mobile (grid aligns with LeaderboardRowContent) */}
          <div className="hidden md:block bg-[#faf8f4] border-y border-[#ece7de]">
            <div className="flex items-center px-4 py-2">
              <div className="grid grid-cols-[112px_minmax(0,1fr)_104px_64px_72px] items-center gap-3 flex-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <div>Rank</div>
                <div>Player</div>
                <div>Record</div>
                <div>Lock</div>
                <div className="text-right">Points</div>
              </div>
              <div className="ml-4 w-7 shrink-0"></div>
            </div>
          </div>

          {/* Expandable rows */}
          <div className="border-x border-b border-[#ece7de] rounded-b-lg overflow-hidden">
            {filteredData.map((entry) => {
              const rowKey = `${entry.userId}-bestfinish`
              const isExpanded = expandedRows.has(rowKey)
              const isLoadingExpansion = loadingExpansions.has(rowKey)
              const expansionData = expandedData.get(rowKey)

              // Check if this rank is tied
              const isTied = filteredData.filter(e => e.totalPoints === entry.totalPoints).length > 1
              const displayRank = getDisplayRank(entry)
              const rankTint =
                displayRank === 1 ? 'bg-[#C9A04E]/[0.16]' :
                displayRank === 2 ? 'bg-[#9aa4b2]/[0.18]' :
                displayRank === 3 ? 'bg-[#c2703d]/[0.13]' : ''
              const tiedTint = isTied && displayRank > 3 ? 'border-l-2 border-l-[#2f6fd0]/50' : ''

              return (
                <ExpandableLeaderboardRow
                  key={entry.userId}
                  isLoading={isLoadingExpansion}
                  className={`${rankTint} ${tiedTint}`.trim()}
                  expandedContent={
                    expansionData ? (
                      <BestFinishExpandedDetails
                        data={expansionData}
                        displayName={entry.displayName}
                        eligibleWeeks={eligibleWeeks}
                      />
                    ) : null
                  }
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => handleRowToggle(entry.userId)}
                  >
                    <LeaderboardRowContent
                      rank={getDisplayRank(entry)}
                      displayName={entry.displayName}
                      record={entry.record}
                      lockRecord={entry.lockRecord}
                      points={entry.totalPoints}
                      paymentStatus={entry.paymentStatus?.toLowerCase() === 'paid' ? 'Paid' : 'NotPaid'}
                      isExpanded={isExpanded}
                      isLoading={isLoadingExpansion}
                      canExpand={true}
                      onToggle={() => {}}
                      isAdmin={isAdmin}
                      isTied={isTied}
                    />
                  </div>
                </ExpandableLeaderboardRow>
              )
            })}
          </div>

          {/* Tie Legend */}
          {filteredData.some(entry =>
            filteredData.filter(e => e.totalPoints === entry.totalPoints).length > 1
          ) && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <span className="font-bold text-blue-600 text-xs uppercase">T</span>
                <span>= Tied rank (same points)</span>
                <span className="ml-auto text-xs text-blue-600">
                  Tiebreaker: Win % → Lock Win % → Alphabetical
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
