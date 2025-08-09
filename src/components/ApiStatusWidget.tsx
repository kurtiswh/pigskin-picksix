import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { testApiConnection, getCurrentWeek } from '@/services/collegeFootballApi'

interface ApiStatusWidgetProps {
  season: number
  onWeekChange?: (week: number) => void
}

export default function ApiStatusWidget({ season, onWeekChange }: ApiStatusWidgetProps) {
  const [apiStatus, setApiStatus] = useState<'unknown' | 'connected' | 'error'>('unknown')
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek(season))
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    testApi()
  }, [])

  const testApi = async () => {
    setTesting(true)
    try {
      const connected = await testApiConnection()
      setApiStatus(connected ? 'connected' : 'error')
    } catch (error) {
      setApiStatus('error')
    } finally {
      setTesting(false)
    }
  }

  const handleWeekChange = (newWeek: number) => {
    setCurrentWeek(newWeek)
    onWeekChange?.(newWeek)
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">API Status:</span>
              {testing ? (
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-gray-600">Testing...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  <div className={`w-3 h-3 rounded-full ${
                    apiStatus === 'connected' ? 'bg-green-500' : 
                    apiStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`}></div>
                  <span className={`text-xs font-medium ${
                    apiStatus === 'connected' ? 'text-green-700' : 
                    apiStatus === 'error' ? 'text-red-700' : 'text-gray-600'
                  }`}>
                    {apiStatus === 'connected' ? 'Connected' : 
                     apiStatus === 'error' ? 'Disconnected' : 'Unknown'}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">Week:</span>
              <select
                value={currentWeek}
                onChange={(e) => handleWeekChange(parseInt(e.target.value))}
                className="border rounded px-2 py-1 text-sm"
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </div>
          </div>
          
          <Button 
            onClick={testApi} 
            disabled={testing}
            variant="outline" 
            size="sm"
          >
            {testing ? 'Testing...' : 'Test API'}
          </Button>
        </div>
        
        {apiStatus === 'error' && (
          <div className="mt-2 text-xs text-red-600">
            ⚠️ Cannot connect to CollegeFootballData API. Get a free API key at collegefootballdata.com and set VITE_CFBD_API_KEY in your .env file. Using sample data for now.
          </div>
        )}
        
        <div className="mt-2 text-xs text-gray-500">
          Season {season} • Current week: {getCurrentWeek(season)} • Data from CollegeFootballData.com
        </div>
      </CardContent>
    </Card>
  )
}