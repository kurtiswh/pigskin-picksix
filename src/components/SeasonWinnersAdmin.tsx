import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Trophy, Calculator, DollarSign, RefreshCw } from 'lucide-react'
import { WinnersService } from '@/services/winnersService'

interface SeasonWinnersAdminProps {
  season: number
}

export default function SeasonWinnersAdmin({ season }: SeasonWinnersAdminProps) {
  const [calculating, setCalculating] = useState(false)
  const [updatingWeekly, setUpdatingWeekly] = useState(false)
  const [settingPot, setSettingPot] = useState(false)
  const [totalPot, setTotalPot] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleCalculateWinners = async () => {
    try {
      setCalculating(true)
      setMessage('')
      setError('')

      await WinnersService.calculateAndUpdateWinners(season)

      setMessage('✅ Season winners calculated successfully! Point winners (1-10), Lock winners, and Best Finish winner have been set.')
      setTimeout(() => setMessage(''), 5000)
    } catch (err: any) {
      console.error('Failed to calculate winners:', err)
      setError(err.message || 'Failed to calculate winners')
    } finally {
      setCalculating(false)
    }
  }

  const handleUpdateWeeklyWinners = async () => {
    try {
      setUpdatingWeekly(true)
      setMessage('')
      setError('')

      await WinnersService.updateWeeklyWinners(season)

      setMessage('✅ Weekly winners updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('Failed to update weekly winners:', err)
      setError(err.message || 'Failed to update weekly winners')
    } finally {
      setUpdatingWeekly(false)
    }
  }

  const handleSetTotalPot = async () => {
    try {
      setSettingPot(true)
      setMessage('')
      setError('')

      const potAmount = parseFloat(totalPot)
      if (isNaN(potAmount) || potAmount <= 0) {
        setError('Please enter a valid dollar amount')
        return
      }

      await WinnersService.setTotalPot(season, potAmount)

      setMessage(`✅ Total pot set to $${potAmount.toFixed(2)}`)
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('Failed to set total pot:', err)
      setError(err.message || 'Failed to set total pot')
    } finally {
      setSettingPot(false)
    }
  }

  return (
    <Card className="border-green-200">
      <CardHeader className="bg-green-50/50">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-green-600" />
          <CardTitle className="text-lg">Season Winners Management - {season}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {message && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">
              {message}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Calculate Season Winners */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-charcoal-900">Calculate Season Winners</h3>
              </div>
              <p className="text-sm text-charcoal-700 mb-3">
                Automatically calculates and sets:
              </p>
              <ul className="text-sm text-charcoal-700 space-y-1 ml-4">
                <li>• Point winners (1st through 10th place)</li>
                <li>• Lock winners (1st and 2nd)</li>
                <li>• Best Finish winner</li>
              </ul>
              <p className="text-xs text-orange-700 mt-2">
                ⚠️ Run this after the final week is complete and all games are scored
              </p>
            </div>
            <Button
              onClick={handleCalculateWinners}
              disabled={calculating}
              className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {calculating ? 'Calculating...' : 'Calculate Winners'}
            </Button>
          </div>
        </div>

        {/* Update Weekly Winners */}
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-charcoal-900">Update Weekly Winners</h3>
              </div>
              <p className="text-sm text-charcoal-700 mb-2">
                Syncs weekly winners from the weekly leaderboard (1st place each week).
              </p>
              <p className="text-xs text-charcoal-600">
                Run this periodically as weeks complete to keep the weekly winners list current.
              </p>
            </div>
            <Button
              onClick={handleUpdateWeeklyWinners}
              disabled={updatingWeekly}
              className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {updatingWeekly ? 'Updating...' : 'Update Weekly'}
            </Button>
          </div>
        </div>

        {/* Set Total Pot */}
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-yellow-600" />
                <h3 className="font-semibold text-charcoal-900">Set Total Prize Pool</h3>
              </div>
              <p className="text-sm text-charcoal-700 mb-3">
                Enter the total prize pool to calculate payout amounts. This enables dollar amount display on the Winners tab.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-600">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalPot}
                      onChange={(e) => setTotalPot(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSetTotalPot}
                  disabled={settingPot || !totalPot}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {settingPot ? 'Setting...' : 'Set Total Pot'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-charcoal-900 mb-2">Workflow</h3>
          <ol className="text-sm text-charcoal-700 space-y-2 list-decimal ml-5">
            <li>Set the total prize pool amount (optional, but needed for dollar amounts)</li>
            <li>Use "Update Weekly Winners" throughout the season as weeks complete</li>
            <li>After the final week is complete, use "Calculate Season Winners"</li>
            <li>Manually set Bracket Winners in the section below</li>
            <li>Winners will display on the Winners tab with percentages and amounts</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}
