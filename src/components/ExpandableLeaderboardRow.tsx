import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Lock, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ExpandableLeaderboardRowProps {
  children: React.ReactNode
  expandedContent: React.ReactNode
  isLoading?: boolean
  canExpand?: boolean
  defaultExpanded?: boolean
  className?: string
}

interface LeaderboardRowContentProps {
  rank: number
  displayName: string
  record: string
  lockRecord: string
  points: number
  isExpanded: boolean
  isLoading: boolean
  canExpand: boolean
  onToggle: () => void
  paymentStatus?: 'Paid' | 'NotPaid' | 'Pending'
  pickSource?: 'authenticated' | 'anonymous' | 'mixed'
  isAdmin?: boolean
  isTied?: boolean  // New prop to indicate if this rank is tied
  rankChange?: number  // Positive = moved up, negative = moved down
  previousRank?: number  // Previous week's rank
  trend?: 'up' | 'down' | 'same'  // Trend indicator
}

export function ExpandableLeaderboardRow({ 
  children, 
  expandedContent, 
  isLoading = false,
  canExpand = true,
  defaultExpanded = false,
  className = ''
}: ExpandableLeaderboardRowProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    if (canExpand && !isLoading) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-all duration-200 ${isExpanded ? 'ring-1 ring-[#4B3621]/20' : ''} ${className}`}>
      {/* Main row */}
      <div 
        className={`p-4 rounded-t-lg ${canExpand && !isLoading ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''} transition-colors duration-150`}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {children}
          </div>
          
          {canExpand && (
            <div className="flex items-center ml-4">
              {isLoading ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#4B3621]" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 hover:bg-gray-200 transition-all duration-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggle()
                  }}
                >
                  <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded content with smooth animation */}
      <div
        ref={contentRef}
        className={`overflow-hidden transition-all duration-300 ease-in-out border-t ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{
          borderTopColor: isExpanded ? undefined : 'transparent'
        }}
      >
        <div className="bg-gray-50/50 rounded-b-lg">
          <div className="p-4">
            {expandedContent}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LeaderboardRowContent({ 
  rank, 
  displayName, 
  record, 
  lockRecord, 
  points,
  isExpanded,
  isLoading,
  canExpand,
  onToggle,
  paymentStatus,
  pickSource,
  isAdmin,
  isTied = false,
  rankChange,
  previousRank,
  trend
}: LeaderboardRowContentProps) {
  const getPaymentBadge = () => {
    // Only show payment indicators for unpaid users
    if (!paymentStatus || paymentStatus === 'Paid') return null
    
    const badges = {
      'Pending': { text: 'Payment Pending', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      'NotPaid': { text: 'Payment Due', className: 'bg-red-100 text-red-700 border-red-200' }
    }
    
    const badge = badges[paymentStatus]
    return badge ? (
      <Badge className={`${badge.className} text-xs px-2 py-0 h-5`}>
        {badge.text}
      </Badge>
    ) : null
  }
  
  const getSourceBadge = () => {
    if (!pickSource || !isAdmin) return null
    
    const sources = {
      'authenticated': { text: 'Auth', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      'anonymous': { text: 'Anon', className: 'bg-purple-100 text-purple-800 border-purple-200' },
      'mixed': { text: 'Mixed', className: 'bg-orange-100 text-orange-800 border-orange-200' }
    }
    
    const source = sources[pickSource]
    return source ? (
      <Badge className={`${source.className} text-xs px-2 py-0 h-5`}>
        {source.text}
      </Badge>
    ) : null
  }
  
  const getRankChangeIndicator = () => {
    if (typeof rankChange !== 'number' || !previousRank) return null
    
    if (rankChange === 0) {
      return (
        <div className="flex items-center gap-1 text-gray-500" title={`Same rank as last week (#${previousRank})`}>
          <Minus className="w-3 h-3" />
          <span className="text-xs">—</span>
        </div>
      )
    }
    
    const isPositive = rankChange > 0
    const Icon = isPositive ? TrendingUp : TrendingDown
    const color = isPositive ? 'text-green-600' : 'text-red-600'
    const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50'
    const borderColor = isPositive ? 'border-green-200' : 'border-red-200'
    
    const changeText = isPositive ? `+${rankChange}` : `${rankChange}`
    const direction = isPositive ? 'up' : 'down'
    const title = `Moved ${direction} ${Math.abs(rankChange)} spot${Math.abs(rankChange) !== 1 ? 's' : ''} from #${previousRank} last week`
    
    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${color} ${bgColor} border ${borderColor}`} title={title}>
        <Icon className="w-3 h-3" />
        <span className="font-medium">{changeText}</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center space-x-4">
        {/* Rank */}
        <div className="flex items-center min-w-[4rem]">
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center space-x-1">
              {rank <= 3 ? (
                <>
                  <Trophy className={`w-4 h-4 ${
                    rank === 1 ? 'text-yellow-500' : 
                    rank === 2 ? 'text-gray-400' : 
                    'text-amber-600'
                  }`} />
                  <span className="font-bold text-lg">{rank}</span>
                </>
              ) : (
                <span className="font-semibold text-gray-700">{rank}</span>
              )}
              {isTied && (
                <span className="text-xs font-bold text-blue-600 uppercase ml-0.5" title="Tied rank - same points as other players">
                  T
                </span>
              )}
            </div>
            {getRankChangeIndicator()}
          </div>
        </div>

        {/* Name and Badges */}
        <div className="flex-1 flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
          {getPaymentBadge()}
          {getSourceBadge()}
        </div>
      </div>

      <div className="flex items-center space-x-6">
        {/* Record */}
        <div className="text-sm text-gray-600">
          <div className="font-medium">{record}</div>
          <div className="flex items-center space-x-1 text-xs">
            <Lock className="w-3 h-3" />
            <span>{lockRecord}</span>
          </div>
        </div>

        {/* Points */}
        <div className="text-right min-w-[4rem]">
          <div className="font-bold text-lg text-[#4B3621]">{points}</div>
          <div className="text-xs text-gray-500">points</div>
        </div>

        {/* Expand button */}
        {canExpand && (
          <div className="ml-2">
            {isLoading ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#4B3621]" />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="p-1 hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}