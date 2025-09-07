/**
 * Pick Processing Monitor Component
 * Real-time dashboard for monitoring pick processing status
 */

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { RefreshCw, PlayCircle, StopCircle, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { liveUpdateService, LiveUpdateStatus, PickProcessingResult } from '@/services/liveUpdateService'

interface ProcessingStats {
  totalGamesChecked: number
  totalGamesProcessed: number
  totalPicksProcessed: number
  processingEfficiency: number
  averageProcessingTime: number
  errorCount: number
  lastProcessingTime: Date | null
}

export function PickProcessingMonitor() {
  const [status, setStatus] = useState<LiveUpdateStatus | null>(null)
  const [stats, setStats] = useState<ProcessingStats>({
    totalGamesChecked: 0,
    totalGamesProcessed: 0,
    totalPicksProcessed: 0,
    processingEfficiency: 0,
    averageProcessingTime: 0,
    errorCount: 0,
    lastProcessingTime: null
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Update status every 5 seconds
  useEffect(() => {
    const updateStatus = () => {
      const currentStatus = liveUpdateService.getStatus()
      setStatus(currentStatus)
      
      // Update aggregated stats
      if (currentStatus.lastPickProcessing) {
        const processing = currentStatus.lastPickProcessing
        setStats(prev => ({
          ...prev,
          totalGamesChecked: prev.totalGamesChecked + processing.gamesChecked,
          totalGamesProcessed: prev.totalGamesProcessed + processing.gamesChanged,
          totalPicksProcessed: prev.totalPicksProcessed + processing.picksProcessed,
          processingEfficiency: processing.picksProcessed > 0 ? 
            Math.round((processing.picksProcessed / Math.max(processing.gamesChanged * 50, 1)) * 100) : prev.processingEfficiency,
          errorCount: prev.errorCount + processing.errors.length,
          lastProcessingTime: processing.lastUpdate
        }))
      }
    }

    updateStatus()
    const interval = setInterval(updateStatus, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  const handleStartPolling = async () => {
    setIsRefreshing(true)
    try {
      await liveUpdateService.startSmartPolling()
    } catch (error) {
      console.error('Failed to start polling:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleStopPolling = () => {
    liveUpdateService.stopPolling()
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      const result = await liveUpdateService.processGamesNeedingPickUpdates()
      console.log('Manual refresh result:', result)
    } catch (error) {
      console.error('Manual refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never'
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ${diffMins % 60}m ago`
  }

  const getStatusColor = (isRunning: boolean, errors: string[]) => {
    if (errors.length > 0) return 'destructive'
    if (isRunning) return 'default'
    return 'secondary'
  }

  const getStatusText = (isRunning: boolean, errors: string[]) => {
    if (errors.length > 0) return `Errors (${errors.length})`
    if (isRunning) return 'Running'
    return 'Stopped'
  }

  if (!status) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading pick processing status...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Pick Processing Monitor
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(status.isRunning, status.errors)}>
                {getStatusText(status.isRunning, status.errors)}
              </Badge>
              {status.isRunning ? (
                <Button size="sm" variant="outline" onClick={handleStopPolling}>
                  <StopCircle className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={handleStartPolling} disabled={isRefreshing}>
                  {isRefreshing ? (
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-1" />
                  )}
                  Start
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleManualRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Status Cards */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Last Update</p>
                    <p className="text-xs text-gray-600">{formatTime(status.lastUpdate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Total Updates</p>
                    <p className="text-lg font-bold">{status.totalUpdates}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Picks Processed</p>
                    <p className="text-lg font-bold">{stats.totalPicksProcessed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className={`h-4 w-4 ${status.errors.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium">Errors</p>
                    <p className="text-lg font-bold">{status.errors.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Processing Details */}
          {status.lastPickProcessing && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm">Latest Processing Cycle</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="font-medium">Games Checked</p>
                    <p className="text-2xl font-bold text-blue-600">{status.lastPickProcessing.gamesChecked}</p>
                  </div>
                  <div>
                    <p className="font-medium">Games Processed</p>
                    <p className="text-2xl font-bold text-green-600">{status.lastPickProcessing.gamesChanged}</p>
                  </div>
                  <div>
                    <p className="font-medium">Picks Updated</p>
                    <p className="text-2xl font-bold text-purple-600">{status.lastPickProcessing.picksProcessed}</p>
                  </div>
                  <div>
                    <p className="font-medium">Success Rate</p>
                    <p className="text-2xl font-bold text-green-600">
                      {status.lastPickProcessing.success ? '100%' : 
                       `${Math.round((1 - status.lastPickProcessing.errors.length / Math.max(status.lastPickProcessing.gamesChecked, 1)) * 100)}%`}
                    </p>
                  </div>
                </div>
                
                {status.lastPickProcessing.gamesChanged > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Processing Efficiency</p>
                    <Progress 
                      value={Math.min((status.lastPickProcessing.picksProcessed / (status.lastPickProcessing.gamesChanged * 50)) * 100, 100)} 
                      className="w-full"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      {status.lastPickProcessing.picksProcessed} picks processed from {status.lastPickProcessing.gamesChanged} games
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Errors */}
          {status.errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Recent Errors ({status.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {status.errors.slice(-5).map((error, index) => (
                    <div key={index} className="text-xs bg-red-50 p-2 rounded border-l-2 border-red-200">
                      {error}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuration Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium">Batch Size</p>
                  <p className="text-lg">25 picks per batch</p>
                </div>
                <div>
                  <p className="font-medium">Processing Interval</p>
                  <p className="text-lg">{status.pickProcessingInterval ? `${status.pickProcessingInterval / 1000}s` : 'N/A'}</p>
                </div>
                <div>
                  <p className="font-medium">Next Update</p>
                  <p className="text-lg">{status.nextUpdate ? formatTime(status.nextUpdate) : 'N/A'}</p>
                </div>
                <div>
                  <p className="font-medium">Auto Refresh</p>
                  <p className="text-lg">{status.shouldRefreshLeaderboard ? 'Pending' : 'Up to date'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}