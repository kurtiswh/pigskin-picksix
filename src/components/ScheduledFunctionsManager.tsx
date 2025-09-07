import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CFBDLiveUpdater } from '@/services/cfbdLiveUpdater'
import { LiveUpdateService } from '@/services/liveUpdateService'

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
  executedAt: Date
}

interface ScheduledFunction {
  name: string
  displayName: string
  description: string
  schedule: string
  lastResult?: FunctionResult
  isRunning: boolean
}

export default function ScheduledFunctionsManager() {
  const [liveUpdateService] = useState(() => LiveUpdateService.getInstance())
  const [autoPollingStatus, setAutoPollingStatus] = useState(liveUpdateService.getStatus())
  
  const [functions, setFunctions] = useState<ScheduledFunction[]>([
    {
      name: 'cfbd_live_updates',
      displayName: 'CFBD Live Updates (Real-time)',
      description: 'Fetches real live scores, quarters, and timing from CFBD API. Updates all game data in real-time.',
      schedule: 'Every 5 minutes Thu-Sun 8:00am-11:59pm Central',
      isRunning: false
    },
    {
      name: 'scheduled_live_game_updates',
      displayName: 'Live Game Updates (Time-based)',
      description: 'Updates game statuses based on elapsed time. Calculates winner_against_spread when games complete.',
      schedule: 'Fallback system - Every 10 minutes',
      isRunning: false
    },
    {
      name: 'scheduled_pick_processing',
      displayName: 'Pick Processing', 
      description: 'Processes picks for completed games. Updates pick results and points for regular and anonymous picks.',
      schedule: 'Every 10 minutes Thu 6:00pm-Sun 11:59pm Central',
      isRunning: false
    },
    {
      name: 'scheduled_game_statistics',
      displayName: 'Game Statistics',
      description: 'Updates game-level pick counts and percentages. Pure statistics - no scoring logic.',
      schedule: 'Every 30 minutes Sat 9:00am-Sun 8:00am Central',
      isRunning: false
    },
    {
      name: 'scheduled_leaderboard_refresh',
      displayName: 'Leaderboard Refresh',
      description: 'Refreshes season and weekly leaderboard tables. Handles ranking calculations.',
      schedule: 'Every 5 minutes all week',
      isRunning: false
    }
  ])
  
  const updateAutoPollingStatus = () => {
    setAutoPollingStatus(liveUpdateService.getStatus())
  }
  
  const startAutoPolling = async () => {
    try {
      console.log('🚀 Starting auto-polling from admin interface...')
      await liveUpdateService.startSmartPolling()
      updateAutoPollingStatus()
    } catch (error: any) {
      console.error('❌ Failed to start auto-polling:', error)
    }
  }
  
  const stopAutoPolling = () => {
    try {
      console.log('⏹️ Stopping auto-polling from admin interface...')
      liveUpdateService.stopPolling()
      updateAutoPollingStatus()
    } catch (error: any) {
      console.error('❌ Failed to stop auto-polling:', error)
    }
  }

  const executeFunction = async (functionName: string) => {
    const functionIndex = functions.findIndex(f => f.name === functionName)
    if (functionIndex === -1) return

    // Set running state
    setFunctions(prev => prev.map((f, i) => 
      i === functionIndex ? { ...f, isRunning: true } : f
    ))

    try {
      console.log(`🚀 Executing ${functionName}...`)
      const startTime = new Date()
      
      let result: FunctionResult
      
      if (functionName === 'cfbd_live_updates') {
        // Execute CFBD live updater (TypeScript service)
        const cfbdResult = await CFBDLiveUpdater.updateLiveGames()
        result = {
          success: cfbdResult.success,
          data: cfbdResult,
          error: cfbdResult.errors.length > 0 ? cfbdResult.errors.join(', ') : undefined,
          executedAt: startTime
        }
      } else {
        // Execute database function via RPC
        const { data, error } = await supabase.rpc(functionName)
        result = {
          success: !error,
          data: data,
          error: error?.message,
          executedAt: startTime
        }
      }

      // Update function with result
      setFunctions(prev => prev.map((f, i) => 
        i === functionIndex ? { ...f, lastResult: result, isRunning: false } : f
      ))

      if (!result.success) {
        console.error(`❌ ${functionName} failed:`, result.error)
      } else {
        console.log(`✅ ${functionName} completed:`, result.data)
      }

    } catch (err: any) {
      const result: FunctionResult = {
        success: false,
        error: err.message,
        executedAt: new Date()
      }

      setFunctions(prev => prev.map((f, i) => 
        i === functionIndex ? { ...f, lastResult: result, isRunning: false } : f
      ))

      console.error(`❌ ${functionName} exception:`, err.message)
    }
  }

  const formatResult = (result?: FunctionResult) => {
    if (!result) return null

    const timeAgo = Math.floor((Date.now() - result.executedAt.getTime()) / 1000)
    const timeString = timeAgo < 60 
      ? `${timeAgo}s ago` 
      : `${Math.floor(timeAgo / 60)}m ago`

    return (
      <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
        <div className="flex items-center justify-between mb-1">
          <Badge variant={result.success ? 'default' : 'destructive'}>
            {result.success ? 'SUCCESS' : 'FAILED'}
          </Badge>
          <span className="text-gray-500">{timeString}</span>
        </div>
        
        {result.success && result.data && (
          <div className="text-green-700">
            {typeof result.data === 'object' 
              ? Object.entries(result.data).map(([key, value]) => (
                  <div key={key}>{key}: {JSON.stringify(value)}</div>
                ))
              : String(result.data)
            }
          </div>
        )}
        
        {result.error && (
          <div className="text-red-700 font-mono">{result.error}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Scheduled Functions Manager</h2>
        <Badge variant="outline">Simple Time-Based System</Badge>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {functions.map((func, index) => (
          <Card key={func.name} className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{func.displayName}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {func.schedule}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent>
              <p className="text-gray-600 mb-4">{func.description}</p>
              
              <Button 
                onClick={() => executeFunction(func.name)}
                disabled={func.isRunning}
                className="w-full mb-2"
              >
                {func.isRunning ? 'Running...' : `Run ${func.displayName} Now`}
              </Button>
              
              {formatResult(func.lastResult)}
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Auto-Polling System</span>
            <Badge variant={autoPollingStatus.isRunning ? "default" : "secondary"}>
              {autoPollingStatus.isRunning ? "Running" : "Stopped"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-gray-600">
              Automatic 5-minute polling of CFBD API for live game data during game hours.
            </p>
            
            <div className="flex space-x-2">
              <Button 
                onClick={startAutoPolling}
                disabled={autoPollingStatus.isRunning}
                variant="default"
              >
                Start Auto-Polling
              </Button>
              <Button 
                onClick={stopAutoPolling}
                disabled={!autoPollingStatus.isRunning}
                variant="destructive"
              >
                Stop Auto-Polling  
              </Button>
              <Button 
                onClick={updateAutoPollingStatus}
                variant="outline"
              >
                Refresh Status
              </Button>
            </div>
            
            {autoPollingStatus.lastUpdate && (
              <div className="text-sm text-gray-500">
                Last Update: {autoPollingStatus.lastUpdate.toLocaleTimeString()}
              </div>
            )}
            
            {autoPollingStatus.nextUpdate && (
              <div className="text-sm text-gray-500">
                Next Update: {autoPollingStatus.nextUpdate.toLocaleTimeString()}
              </div>
            )}
            
            {autoPollingStatus.errors.length > 0 && (
              <div className="text-sm text-red-600">
                Errors: {autoPollingStatus.errors.join(', ')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Database Triggers:</span>
              <Badge variant="destructive">Disabled</Badge>
            </div>
            <div className="flex justify-between">
              <span>Complex Functions:</span>
              <Badge variant="destructive">Removed</Badge>
            </div>
            <div className="flex justify-between">
              <span>Scheduled Functions:</span>
              <Badge variant="default">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>System Architecture:</span>
              <Badge variant="default">Simple Time-Based</Badge>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
            <h4 className="font-semibold text-green-800 mb-2">✅ Benefits of New System:</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• No database deadlocks or trigger conflicts</li>
              <li>• Predictable execution times</li>
              <li>• Easy to debug and test individually</li>
              <li>• Clear separation of concerns</li>
              <li>• Manual admin control for testing</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}