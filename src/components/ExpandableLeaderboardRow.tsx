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
    <div className={`bg-white border-b border-[#ece7de] last:border-b-0 transition-colors duration-200 ${isExpanded ? 'bg-[#faf8f4]' : ''} ${className}`}>
      {/* Main row */}
      <div
        className={`px-4 py-3 ${canExpand && !isLoading ? 'cursor-pointer hover:bg-[#faf8f4] active:bg-[#f3efe7]' : ''} transition-colors duration-150`}
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
        <div className="bg-[#faf8f4]">
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
  
  // Weekly rank movement pill. Lives in the rank column so it clearly reads as
  // "spots moved", not a points change.
  const getRankChangeIndicator = () => {
    if (typeof rankChange !== 'number' || !previousRank) return null

    if (rankChange === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#f0ece5] text-gray-500 tabular-nums"
          title={`Same rank as last week (#${previousRank})`}>
          <Minus className="w-2.5 h-2.5" />
        </span>
      )
    }

    const isPositive = rankChange > 0
    const Icon = isPositive ? TrendingUp : TrendingDown
    const cls = isPositive ? 'bg-[#e7f6ec] text-green-700' : 'bg-[#fbe9ec] text-red-600'
    const changeText = Math.abs(rankChange)
    const direction = isPositive ? 'up' : 'down'
    const title = `Moved ${direction} ${Math.abs(rankChange)} spot${Math.abs(rankChange) !== 1 ? 's' : ''} from #${previousRank} last week`

    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${cls}`} title={title}>
        <Icon className="w-2.5 h-2.5" />
        {changeText}
      </span>
    )
  }
  
  const trophyColor = rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-amber-600'

  return (
    <>
      {/* Desktop Layout — grid aligned with the header row */}
      <div className="hidden md:grid grid-cols-[64px_minmax(0,1fr)_104px_64px_72px] items-center gap-3 w-full">
        {/* Rank */}
        <div className="flex items-center gap-1.5">
          {rank <= 3 && <Trophy className={`w-4 h-4 shrink-0 ${trophyColor}`} />}
          <div className="flex flex-col items-start leading-none">
            <span className="font-extrabold text-[#4B3621] text-base">
              {isTied && <span className="text-[#2f6fd0]" title="Tied rank">T</span>}{rank}
            </span>
            {getRankChangeIndicator() && <span className="mt-1">{getRankChangeIndicator()}</span>}
          </div>
        </div>

        {/* Name + badges */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-900 truncate">{displayName}</span>
          {getPaymentBadge()}
          {getSourceBadge()}
        </div>

        {/* Record */}
        <div className="text-sm text-gray-500 tabular-nums">{record}</div>

        {/* Lock */}
        <div className="text-sm text-gray-500 tabular-nums flex items-center gap-1">
          <Lock className="w-3 h-3 shrink-0" />
          <span>{lockRecord}</span>
        </div>

        {/* Points */}
        <div className="text-right font-extrabold text-[#4B3621] text-lg tabular-nums">{points}</div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden w-full">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {rank <= 3 && <Trophy className={`w-4 h-4 ${trophyColor}`} />}
            <span className="font-extrabold text-lg text-[#4B3621]">
              {isTied && <span className="text-[#2f6fd0]">T</span>}{rank}
            </span>
            {getRankChangeIndicator()}
          </div>
          <div className="text-right">
            <div className="font-extrabold text-xl text-[#4B3621] tabular-nums">{points}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">points</div>
          </div>
        </div>

        <div className="font-semibold text-base mb-2 break-words flex items-center gap-2 flex-wrap">
          {displayName}
          {getPaymentBadge()}
          {getSourceBadge()}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Record</div>
            <div className="font-medium text-gray-600 tabular-nums">{record}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Lock Record</div>
            <div className="font-medium text-gray-600 tabular-nums flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>{lockRecord}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}