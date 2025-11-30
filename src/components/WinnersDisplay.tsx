import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, DollarSign, Calendar, Award } from 'lucide-react'
import { WinnersService } from '@/services/winnersService'
import { SeasonWinners, PAYOUT_PERCENTAGES } from '@/types/winners'

interface WinnersDisplayProps {
  season: number
}

interface WinnerRow {
  category: string
  place?: string
  userId?: string | null
  displayName?: string
  percentage: string
  amount?: string
  isBracket?: boolean
  isWeekly?: boolean
  isTBD?: boolean
}

export default function WinnersDisplay({ season }: WinnersDisplayProps) {
  const [winners, setWinners] = useState<SeasonWinners | null>(null)
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadWinners()
  }, [season])

  const loadWinners = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await WinnersService.getWinnersWithNames(season)

      if (data) {
        setWinners(data.winners)
        setUserMap(data.userMap)
      } else {
        setWinners(null)
        setUserMap(new Map())
      }
    } catch (err: any) {
      console.error('Failed to load winners:', err)
      setError(err.message || 'Failed to load winners')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const calculateAmount = (percentage: number): number => {
    if (!winners?.total_pot) return 0
    const weeklyTotal = (winners.weekly_payout || 80) * 14 // 14 weeks
    return WinnersService.calculatePayout(percentage, winners.total_pot, weeklyTotal)
  }

  const getWinnerRows = (): WinnerRow[] => {
    const rows: WinnerRow[] = []

    // Point winners (1-10)
    const pointWinners = [
      { key: 'point_winner_user_id', place: '1st', percentage: PAYOUT_PERCENTAGES.point_winner },
      { key: 'point_second_user_id', place: '2nd', percentage: PAYOUT_PERCENTAGES.point_second },
      { key: 'point_third_user_id', place: '3rd', percentage: PAYOUT_PERCENTAGES.point_third },
      { key: 'point_fourth_user_id', place: '4th', percentage: PAYOUT_PERCENTAGES.point_fourth },
      { key: 'point_fifth_user_id', place: '5th', percentage: PAYOUT_PERCENTAGES.point_fifth },
      { key: 'point_sixth_user_id', place: '6th', percentage: PAYOUT_PERCENTAGES.point_sixth },
      { key: 'point_seventh_user_id', place: '7th', percentage: PAYOUT_PERCENTAGES.point_seventh },
      { key: 'point_eighth_user_id', place: '8th', percentage: PAYOUT_PERCENTAGES.point_eighth },
      { key: 'point_ninth_user_id', place: '9th', percentage: PAYOUT_PERCENTAGES.point_ninth },
      { key: 'point_tenth_user_id', place: '10th', percentage: PAYOUT_PERCENTAGES.point_tenth }
    ]

    pointWinners.forEach(({ key, place, percentage }) => {
      const userId = winners?.[key as keyof SeasonWinners] as string | null | undefined
      const isTBD = !userId
      rows.push({
        category: 'Point Winner',
        place,
        userId,
        displayName: userId ? userMap.get(userId) || 'Unknown' : 'TBD',
        percentage: `${percentage}%`,
        amount: winners?.total_pot ? formatCurrency(calculateAmount(percentage)) : undefined,
        isTBD
      })
    })

    // Lock winners
    rows.push({
      category: 'Lock Winner',
      place: '1st',
      userId: winners?.lock_winner_user_id,
      displayName: winners?.lock_winner_user_id
        ? userMap.get(winners.lock_winner_user_id) || 'Unknown'
        : 'TBD',
      percentage: `${PAYOUT_PERCENTAGES.lock_winner}%`,
      amount: winners?.total_pot ? formatCurrency(calculateAmount(PAYOUT_PERCENTAGES.lock_winner)) : undefined,
      isTBD: !winners?.lock_winner_user_id
    })

    rows.push({
      category: 'Lock Second',
      place: '2nd',
      userId: winners?.lock_second_user_id,
      displayName: winners?.lock_second_user_id
        ? userMap.get(winners.lock_second_user_id) || 'Unknown'
        : 'TBD',
      percentage: `${PAYOUT_PERCENTAGES.lock_second}%`,
      amount: winners?.total_pot ? formatCurrency(calculateAmount(PAYOUT_PERCENTAGES.lock_second)) : undefined,
      isTBD: !winners?.lock_second_user_id
    })

    // Bracket winners (admin managed)
    rows.push({
      category: 'Bracket Winner',
      place: '1st',
      userId: winners?.bracket_winner_user_id,
      displayName: winners?.bracket_winner_user_id
        ? userMap.get(winners.bracket_winner_user_id) || 'Unknown'
        : 'TBD',
      percentage: `${PAYOUT_PERCENTAGES.bracket_winner}%`,
      amount: winners?.total_pot ? formatCurrency(calculateAmount(PAYOUT_PERCENTAGES.bracket_winner)) : undefined,
      isBracket: true,
      isTBD: !winners?.bracket_winner_user_id
    })

    rows.push({
      category: 'Bracket Second',
      place: '2nd',
      userId: winners?.bracket_second_user_id,
      displayName: winners?.bracket_second_user_id
        ? userMap.get(winners.bracket_second_user_id) || 'Unknown'
        : 'TBD',
      percentage: `${PAYOUT_PERCENTAGES.bracket_second}%`,
      amount: winners?.total_pot ? formatCurrency(calculateAmount(PAYOUT_PERCENTAGES.bracket_second)) : undefined,
      isBracket: true,
      isTBD: !winners?.bracket_second_user_id
    })

    // Best Finish winner
    rows.push({
      category: 'Best Finish',
      userId: winners?.best_finish_user_id,
      displayName: winners?.best_finish_user_id
        ? userMap.get(winners.best_finish_user_id) || 'Unknown'
        : 'TBD',
      percentage: `${PAYOUT_PERCENTAGES.best_finish}%`,
      amount: winners?.total_pot ? formatCurrency(calculateAmount(PAYOUT_PERCENTAGES.best_finish)) : undefined,
      isTBD: !winners?.best_finish_user_id
    })

    // Weekly winner
    const weeklyTotal = (winners?.weekly_payout || 80) * 14
    rows.push({
      category: 'Weekly Winner',
      displayName: '$80 per week',
      percentage: '14 weeks',
      amount: formatCurrency(weeklyTotal),
      isWeekly: true,
      isTBD: false
    })

    return rows
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-charcoal-600">Loading winners...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-red-600">Error: {error}</div>
        </CardContent>
      </Card>
    )
  }

  const winnerRows = getWinnerRows()
  const totalPercentage = 100
  const weeklyTotal = (winners?.weekly_payout || 80) * 14

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-pigskin-200 bg-gradient-to-r from-pigskin-50 to-gold-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-pigskin-600" />
              <div>
                <CardTitle className="text-2xl text-pigskin-900">
                  Season {season} Winners
                </CardTitle>
                <p className="text-sm text-charcoal-600 mt-1">
                  Final standings and payout distribution
                </p>
              </div>
            </div>
            {winners?.is_finalized && (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                ✓ Finalized
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Prize Pool Info */}
      {winners?.total_pot && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <DollarSign className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="text-sm text-charcoal-600">Total Prize Pool</div>
                  <div className="text-xl font-bold text-charcoal-900">
                    {formatCurrency(winners.total_pot)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="text-sm text-charcoal-600">Weekly Payouts</div>
                  <div className="text-xl font-bold text-charcoal-900">
                    {formatCurrency(weeklyTotal)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Award className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="text-sm text-charcoal-600">Season Payouts</div>
                  <div className="text-xl font-bold text-charcoal-900">
                    {formatCurrency(winners.total_pot - weeklyTotal)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Winners Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Winner
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Percentage
                  </th>
                  {winners?.total_pot && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Amount
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {winnerRows.map((row, index) => (
                  <tr
                    key={index}
                    className={`
                      ${row.isTBD ? 'bg-gray-50' : ''}
                      ${row.isBracket ? 'bg-orange-50/30' : ''}
                      ${row.isWeekly ? 'bg-blue-50/30 font-semibold' : ''}
                      hover:bg-gray-100 transition-colors
                    `}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-charcoal-900">
                          {row.category}
                        </span>
                        {row.place && (
                          <Badge variant="outline" className="text-xs">
                            {row.place}
                          </Badge>
                        )}
                        {row.isBracket && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">
                            Admin Set
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm ${row.isTBD ? 'text-gray-500 italic' : 'text-charcoal-900 font-medium'}`}>
                        {row.displayName}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-charcoal-700">{row.percentage}</span>
                    </td>
                    {winners?.total_pot && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-semibold text-pigskin-700">
                          {row.amount || '-'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {winners?.total_pot && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={2} className="px-6 py-4 text-sm font-bold text-charcoal-900">
                      TOTAL PAYOUTS
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-charcoal-900">
                      {totalPercentage}%
                    </td>
                    <td className="px-6 py-4 text-right text-lg font-bold text-pigskin-700">
                      {formatCurrency(winners.total_pot)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardContent className="p-4">
          <div className="text-sm text-charcoal-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-semibold">Note:</span>
              <div>
                <div>• Percentage based on total pot minus weekly winner payouts ({formatCurrency(weeklyTotal)})</div>
                <div>• Point, Lock, and Best Finish winners determined after last week</div>
                <div>• Bracket winners must be manually set by admin</div>
                {!winners?.is_finalized && (
                  <div className="mt-2 text-orange-700 font-medium">
                    ⚠️ Winners not yet finalized - subject to change
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
