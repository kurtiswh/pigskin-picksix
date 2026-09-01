import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { testApiConnection, getCurrentWeek } from '@/services/collegeFootballApi'

interface ApiStatusWidgetProps {
  season: number
  onWeekChange?: (week: number) => void
}

export default function ApiStatusWidget({ season, onWeekChange }: ApiStatusWidgetProps) {
  const [apiStatus, setApiStatus] = useState<'unknown' | 'connected' | 'error' | 'quota_exceeded'>('unknown')
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek(season))
  const [testing, setTesting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [missingKey, setMissingKey] = useState(false)
  const [outage, setOutage] = useState(false)
  const [offline, setOffline] = useState(false)

  // Do NOT auto-test the CFBD API on mount — that hit the API on every admin
  // page load (and burned the client quota) even off-season. Testing is now
  // manual via the Retry/Test button.
  useEffect(() => {}, [])

  const testApi = async () => {
    setTesting(true)
    try {
      const result = await testApiConnection()
      
      setMissingKey(!!result.missingKey)
      setOutage(!!result.outage)
      setOffline(!!result.offline)

      if (result.connected) {
        setApiStatus('connected')
        setErrorMessage('')
      } else if (result.quotaExceeded) {
        setApiStatus('quota_exceeded')
        setErrorMessage(result.error || 'Monthly API quota exceeded')
      } else {
        setApiStatus('error')
        setErrorMessage(result.error || 'Connection failed')
      }
    } catch (error) {
      setApiStatus('error')
      setErrorMessage('Network error')
      setMissingKey(false)
      setOutage(false)
      setOffline(false)
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
                    apiStatus === 'quota_exceeded' ? 'bg-yellow-500' :
                    apiStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`}></div>
                  <span className={`text-xs font-medium ${
                    apiStatus === 'connected' ? 'text-green-700' : 
                    apiStatus === 'quota_exceeded' ? 'text-yellow-700' :
                    apiStatus === 'error' ? 'text-red-700' : 'text-gray-600'
                  }`}>
                    {apiStatus === 'connected' ? 'Connected' : 
                     apiStatus === 'quota_exceeded' ? 'Quota Exceeded' :
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
        
        {(apiStatus === 'error' || apiStatus === 'quota_exceeded') && (
          <div className={`mt-2 text-xs ${
            apiStatus === 'quota_exceeded' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {apiStatus === 'quota_exceeded' ? (
              <>
                📊 <strong>API Quota Exceeded:</strong> {errorMessage}
                <br />
                The app will use sample data and cached results until the monthly quota resets.
                <br />
                <a 
                  href="https://collegefootballdata.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  Get a paid API plan at collegefootballdata.com
                </a> for unlimited access.
              </>
            ) : (
              <>
                ⚠️ <strong>API Connection Error:</strong> {errorMessage || 'Cannot connect to CollegeFootballData API'}
                <br />
                {missingKey ? (
                  <>
                    Get a free API key at{' '}
                    <a
                      href="https://collegefootballdata.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      collegefootballdata.com
                    </a>{' '}
                    and set VITE_CFBD_API_KEY in your .env file. Using sample data for now.
                  </>
                ) : offline ? (
                  <>
                    This device is offline. Reconnect and retry. Using sample data for now.
                  </>
                ) : outage ? (
                  <>
                    <strong>This is on CollegeFootballData's end, not ours.</strong> We reached
                    their server and it answered with an error (typically HTTP 502), so nothing
                    here needs fixing — the slate will load once they recover. Retry in a few
                    minutes.
                    <br />
                    They do not run a status page; outages get posted in their{' '}
                    <a
                      href="https://discord.gg/Eb3ex5a"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      Discord
                    </a>. Using sample data for now — do not save a week from it.
                  </>
                ) : (
                  <>
                    Your API key is configured and CollegeFootballData did not answer at all,
                    so the request was stopped before it left this browser. Check your
                    connection and any ad/privacy blocker, then retry. Using sample data for now.
                  </>
                )}
              </>
            )}
          </div>
        )}
        
        <div className="mt-2 text-xs text-gray-500">
          Season {season} • Current week: {getCurrentWeek(season)} • Data from CollegeFootballData.com
        </div>
      </CardContent>
    </Card>
  )
}