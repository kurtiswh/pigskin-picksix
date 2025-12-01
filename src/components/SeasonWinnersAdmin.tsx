import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Trophy, DollarSign } from 'lucide-react'
import { WinnersService } from '@/services/winnersService'

interface SeasonWinnersAdminProps {
  season: number
}

export default function SeasonWinnersAdmin({ season }: SeasonWinnersAdminProps) {
  const [settingPot, setSettingPot] = useState(false)
  const [totalPot, setTotalPot] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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

        {/* Info Section */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Trophy className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-charcoal-900 mb-2">Winners are Calculated Automatically</h3>
              <p className="text-sm text-charcoal-700 mb-3">
                The Winners tab pulls live data from existing leaderboards:
              </p>
              <ul className="text-sm text-charcoal-700 space-y-1 ml-4">
                <li>• <strong>Point Winners (1-10):</strong> From Season Leaderboard</li>
                <li>• <strong>Lock Winners:</strong> Calculated from lock pick results</li>
                <li>• <strong>Best Finish Winner:</strong> From Best Finish Leaderboard</li>
                <li>• <strong>Weekly Winners:</strong> From Weekly Leaderboard (1st place each week)</li>
                <li>• <strong>Bracket Winners:</strong> Manually set below</li>
              </ul>
              <p className="text-xs text-green-700 mt-3 font-medium">
                ✅ No manual updates needed - winners update automatically as leaderboards change!
              </p>
            </div>
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

        {/* Note about bracket winners */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-charcoal-900 mb-2">📝 Admin Tasks</h3>
          <ol className="text-sm text-charcoal-700 space-y-2 list-decimal ml-5">
            <li><strong>Set Total Prize Pool</strong> (above) - Optional, enables dollar amount display</li>
            <li><strong>Set Bracket Winners</strong> (below) - Required, only winners not auto-calculated</li>
            <li><strong>View Winners Tab</strong> - All other winners populate automatically!</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}
