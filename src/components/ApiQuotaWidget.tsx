/**
 * API Quota Usage Widget
 * 
 * Displays College Football Data API quota usage for admin monitoring
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiQuotaService } from '@/services/apiQuotaService'
import { useAuth } from '@/hooks/useAuth'

export default function ApiQuotaWidget() {
  const { user } = useAuth()
  const [quotaStatus, setQuotaStatus] = useState(ApiQuotaService.getQuotaStatus())
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const isAdmin = user?.is_admin === true

  // Don't show for non-admin users
  if (!isAdmin) {
    return null
  }

  const refreshStatus = () => {
    setQuotaStatus(ApiQuotaService.getQuotaStatus())
    setLastUpdated(new Date())
  }

  const resetQuota = () => {
    if (confirm('Are you sure you want to reset API quota tracking? This should only be used for testing.')) {
      ApiQuotaService.resetQuota()
      refreshStatus()
    }
  }

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'destructive'
    if (percent >= 75) return 'default'
    if (percent >= 50) return 'secondary'
    return 'secondary'
  }

  const getStatusBadge = (percent: number) => {
    if (percent >= 90) return <Badge variant="destructive">Critical</Badge>
    if (percent >= 75) return <Badge variant="secondary">Warning</Badge>
    if (percent >= 50) return <Badge variant="outline">Caution</Badge>
    return <Badge variant="outline">Good</Badge>
  }

  useEffect(() => {
    // Refresh every 30 seconds
    const interval = setInterval(refreshStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          📊 CFBD API Quota (Monthly)
          {getStatusBadge(quotaStatus.percentUsed)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Monthly Usage */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Monthly Usage</span>
            <span className="font-mono">
              {quotaStatus.monthlyUsed.toLocaleString()}/{quotaStatus.monthlyLimit.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={quotaStatus.percentUsed} 
            className="h-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {quotaStatus.percentUsed.toFixed(1)}% used • {quotaStatus.monthlyRemaining.toLocaleString()} remaining
          </div>
        </div>

        {/* Daily Usage */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Today's Usage</div>
            <div className="font-mono text-lg">{quotaStatus.dailyUsage}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Daily Budget</div>
            <div className="font-mono text-lg">{quotaStatus.recommendedCallsRemaining}</div>
          </div>
        </div>

        {/* Budget Status */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Recommended daily calls to stay within budget</div>
          <div>Last updated: {lastUpdated.toLocaleTimeString()}</div>
        </div>

        {/* Admin Controls */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshStatus}
          >
            Refresh
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={resetQuota}
            className="ml-auto"
          >
            Reset (Dev Only)
          </Button>
        </div>

        {/* Usage Guidelines */}
        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
          <div className="font-semibold mb-1">Optimized API Schedule:</div>
          <div>• Live games: 5min intervals (12 calls/hour)</div>
          <div>• Game days: 30min intervals (2 calls/hour)</div>
          <div>• Regular days: Manual admin only (0 calls/hour)</div>
        </div>
      </CardContent>
    </Card>
  )
}