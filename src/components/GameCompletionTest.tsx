/**
 * Game Completion Test Component
 * Testing component for the new unified game completion logic
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Play, Clock } from 'lucide-react'
import { liveUpdateService } from '@/services/liveUpdateService'

export function GameCompletionTest() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<string>('')
  const [gameId, setGameId] = useState<string>('')

  const handleManualComplete = async () => {
    if (!gameId.trim()) {
      setResult('❌ Please enter a game ID')
      return
    }

    setIsProcessing(true)
    setResult('🔄 Processing game completion...')

    try {
      await liveUpdateService.manualCompleteGame(gameId.trim())
      setResult('✅ Game completion successful! Check console for details.')
    } catch (error: any) {
      setResult(`❌ Game completion failed: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleProcessStuckGames = async () => {
    setIsProcessing(true)
    setResult('🕐 Processing stuck games...')

    try {
      const result = await liveUpdateService.processStuckGames()
      setResult(`✅ Stuck games processing complete: ${result.processed} processed, ${result.errors.length} errors`)
      
      if (result.errors.length > 0) {
        console.error('Stuck game processing errors:', result.errors)
      }
    } catch (error: any) {
      setResult(`❌ Stuck games processing failed: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleScheduledPickProcessing = async () => {
    setIsProcessing(true)
    setResult('🔍 Running scheduled pick processing...')

    try {
      const result = await liveUpdateService.processGamesNeedingPickUpdates()
      setResult(`✅ Scheduled pick processing complete:
        📊 ${result.gamesChecked} games checked
        🔄 ${result.gamesChanged} games needing processing
        🎯 ${result.picksProcessed} picks processed
        📈 Leaderboards: ${result.leaderboardsRefreshed ? '✅ Refreshed' : '⏳ No refresh needed'}`)
      
      if (result.errors.length > 0) {
        console.error('Pick processing errors:', result.errors)
      }
    } catch (error: any) {
      setResult(`❌ Scheduled pick processing failed: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartScheduledProcessing = () => {
    liveUpdateService.startScheduledPickProcessing(1 * 60 * 1000) // 1 minute for testing
    setResult('🕐 Started scheduled pick processing (1 minute intervals)')
  }

  const handleStopScheduledProcessing = () => {
    liveUpdateService.stopScheduledPickProcessing()
    setResult('⏹️ Stopped scheduled pick processing')
  }

  const handleRunLiveUpdate = async () => {
    setIsProcessing(true)
    setResult('🔄 Running live update...')

    try {
      const updateResult = await liveUpdateService.manualUpdate(2025, 1) // Current season/week
      setResult(`✅ Live update complete: ${updateResult.gamesUpdated} games updated, ${updateResult.picksProcessed} picks processed`)
      
      if (updateResult.errors.length > 0) {
        console.error('Live update errors:', updateResult.errors)
      }
    } catch (error: any) {
      setResult(`❌ Live update failed: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Game Completion Testing
        </CardTitle>
        <CardDescription>
          Test the new unified game completion logic (Migration 114)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Manual Game Completion */}
        <div className="space-y-3">
          <h3 className="font-semibold">Manual Game Completion</h3>
          <p className="text-sm text-muted-foreground">
            Force complete a specific game by ID (useful for stuck games like TCU vs North Carolina)
          </p>
          
          <div className="flex gap-2">
            <Input
              placeholder="Enter game ID (UUID)"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleManualComplete}
              disabled={isProcessing}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Complete Game
            </Button>
          </div>
        </div>

        {/* Time-Based Processing */}
        <div className="space-y-3">
          <h3 className="font-semibold">Time-Based Stuck Game Processing</h3>
          <p className="text-sm text-muted-foreground">
            Find and complete games that are stuck in "Live" status but should be finished
          </p>
          
          <Button
            onClick={handleProcessStuckGames}
            disabled={isProcessing}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            Process Stuck Games
          </Button>
        </div>

        {/* Scheduled Pick Processing */}
        <div className="space-y-3">
          <h3 className="font-semibold">NEW: Scheduled Pick Processing</h3>
          <p className="text-sm text-muted-foreground">
            Independent pick processing that monitors game changes and only processes when needed
          </p>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleScheduledPickProcessing}
              disabled={isProcessing}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              Run Once
            </Button>
            
            <Button
              onClick={handleStartScheduledProcessing}
              disabled={isProcessing}
              size="sm"
              className="flex items-center gap-2"
            >
              ▶️ Start Auto (1min)
            </Button>
            
            <Button
              onClick={handleStopScheduledProcessing}
              disabled={isProcessing}
              variant="outline"
              size="sm"
            >
              ⏹️ Stop Auto
            </Button>
          </div>
        </div>

        {/* Live Update Test */}
        <div className="space-y-3">
          <h3 className="font-semibold">Live Update Service</h3>
          <p className="text-sm text-muted-foreground">
            Test the normal live update flow (now separate from pick processing)
          </p>
          
          <Button
            onClick={handleRunLiveUpdate}
            disabled={isProcessing}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Run Live Update
          </Button>
        </div>

        {/* Result Display */}
        {result && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <Badge variant={result.startsWith('✅') ? 'default' : result.startsWith('❌') ? 'destructive' : 'secondary'}>
              Result
            </Badge>
            <p className="mt-2 text-sm font-mono whitespace-pre-wrap">{result}</p>
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-4">
          <strong>Note:</strong> This component tests the new trigger-free game completion logic.
          Check browser console for detailed logs during processing.
        </div>
      </CardContent>
    </Card>
  )
}