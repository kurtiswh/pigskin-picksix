import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Trophy, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { WinnersService } from '@/services/winnersService'

interface BracketWinnersAdminProps {
  season: number
}

interface User {
  id: string
  display_name: string
}

export default function BracketWinnersAdmin({ season }: BracketWinnersAdminProps) {
  const [users, setUsers] = useState<User[]>([])
  const [bracketWinner, setBracketWinner] = useState<string>('')
  const [bracketSecond, setBracketSecond] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [season])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // Load all users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, display_name')
        .order('display_name')

      if (usersError) throw usersError
      setUsers(usersData || [])

      // Load current winners
      const winners = await WinnersService.getSeasonWinners(season)
      if (winners) {
        setBracketWinner(winners.bracket_winner_user_id || '')
        setBracketSecond(winners.bracket_second_user_id || '')
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

      await WinnersService.updateBracketWinners(
        season,
        bracketWinner || null,
        bracketSecond || null
      )

      setMessage('Bracket winners updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('Failed to save bracket winners:', err)
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
            <Select value={bracketWinner} onValueChange={setBracketWinner}>
              <SelectTrigger>
                <SelectValue placeholder="Select winner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">-- None Selected --</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Bracket Second (2nd Place - 0.5%)
            </label>
            <Select value={bracketSecond} onValueChange={setBracketSecond}>
              <SelectTrigger>
                <SelectValue placeholder="Select second place..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">-- None Selected --</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
