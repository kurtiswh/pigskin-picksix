import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Trophy, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { WinnersService } from '@/services/winnersService'

interface BracketWinnersAdminProps {
  season: number
}

interface User {
  id: string
  display_name: string
  payment_status?: string
}

export default function BracketWinnersAdmin({ season }: BracketWinnersAdminProps) {
  const [users, setUsers] = useState<User[]>([])
  const [bracketWinner, setBracketWinner] = useState<string>('')
  const [bracketSecond, setBracketSecond] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [winnerSearch, setWinnerSearch] = useState('')
  const [secondSearch, setSecondSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [season])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      console.log('🔄 [BracketWinnersAdmin] Loading data for season', season)

      // Load only paid/active users from leaguesafe_payments for current season
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id, status')
        .eq('season', season)
        .eq('status', 'Paid')

      if (paymentsError) {
        console.error('❌ Payment query error:', paymentsError)
        throw paymentsError
      }

      console.log('💰 [BracketWinnersAdmin] Found', paymentsData?.length, 'paid users')

      // Filter out null user_ids
      const paidUserIds = paymentsData?.map(p => p.user_id).filter(id => id !== null) || []

      console.log('📋 [BracketWinnersAdmin] Paid user IDs:', paidUserIds)

      // If no paid users, set empty array and return early
      if (paidUserIds.length === 0) {
        console.log('⚠️ [BracketWinnersAdmin] No paid users found')
        setUsers([])
        setLoading(false)
        return
      }

      // Now get only active users who are also paid
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, display_name, user_status')
        .in('id', paidUserIds)
        .eq('user_status', 'active')
        .order('display_name')

      if (usersError) throw usersError
      setUsers(usersData || [])

      console.log('👥 [BracketWinnersAdmin] Loaded', usersData?.length, 'users')

      // Load current winners
      const winners = await WinnersService.getSeasonWinners(season)
      console.log('🏆 [BracketWinnersAdmin] Loaded winners:', winners)

      if (winners) {
        console.log('🏆 [BracketWinnersAdmin] Setting bracket_winner_user_id:', winners.bracket_winner_user_id)
        console.log('🏆 [BracketWinnersAdmin] Setting bracket_second_user_id:', winners.bracket_second_user_id)
        setBracketWinner(winners.bracket_winner_user_id || '')
        setBracketSecond(winners.bracket_second_user_id || '')
      } else {
        console.log('⚠️ [BracketWinnersAdmin] No winners data found')
      }
    } catch (err: any) {
      console.error('Failed to load data:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage('')
      setError('')

      console.log('💾 [BracketWinnersAdmin] Saving bracket winners...')
      console.log('💾 Season:', season)
      console.log('💾 Winner:', bracketWinner)
      console.log('💾 Second:', bracketSecond)

      await WinnersService.updateBracketWinners(
        season,
        bracketWinner || null,
        bracketSecond || null
      )

      console.log('✅ [BracketWinnersAdmin] Save completed, reloading data...')

      // Reload data to confirm the save worked
      await loadData()

      setMessage('Bracket winners updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('❌ [BracketWinnersAdmin] Failed to save bracket winners:', err)
      console.error('Full error:', JSON.stringify(err, null, 2))
      setError(err.message || 'Failed to save bracket winners')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setBracketWinner('')
    setBracketSecond('')
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-charcoal-600">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-orange-200">
      <CardHeader className="bg-orange-50/50">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-orange-600" />
          <CardTitle className="text-lg">Bracket Winners - Season {season}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Bracket Winner (1st Place - 2%)
            </label>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Search users..."
                value={winnerSearch}
                onChange={(e) => setWinnerSearch(e.target.value)}
                className="mb-2"
              />
              <select
                value={bracketWinner}
                onChange={(e) => setBracketWinner(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                size={8}
              >
                <option value="">-- None Selected --</option>
                {users
                  .filter(user =>
                    user.display_name.toLowerCase().includes(winnerSearch.toLowerCase())
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Bracket Second (2nd Place - 0.5%)
            </label>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Search users..."
                value={secondSearch}
                onChange={(e) => setSecondSearch(e.target.value)}
                className="mb-2"
              />
              <select
                value={bracketSecond}
                onChange={(e) => setBracketSecond(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                size={8}
              >
                <option value="">-- None Selected --</option>
                {users
                  .filter(user =>
                    user.display_name.toLowerCase().includes(secondSearch.toLowerCase())
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-pigskin-600 hover:bg-pigskin-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Bracket Winners'}
          </Button>

          <Button
            onClick={handleClear}
            variant="outline"
            disabled={saving}
          >
            Clear Selections
          </Button>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm text-yellow-800">
            <div className="font-semibold mb-1">Note:</div>
            <div>• Bracket winners must be manually set by admin</div>
            <div>• Point, Lock, and Best Finish winners are calculated automatically</div>
            <div>• Changes are saved immediately and visible on the Winners tab</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
