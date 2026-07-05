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
  id?: string
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
  isCurrentUser?: boolean  // Highlight the logged-in user's own row
}

export function ExpandableLeaderboardRow({ 
  children, 
  expandedContent, 
  isLoading = false,
  canExpand = true,
  defaultExpanded = false,
  className = '',
  id
}: ExpandableLeaderboardRowProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    if (canExpand && !isLoading) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div id={id} className={`border-b border-[#ece7de] last:border-b-0 transition-colors duration-200 scroll-mt-24 ${isExpanded ? 'bg-[#faf8f4]' : ''} ${className}`}>
      {/* Main row */}
      <div
        className={`px-4 py-2.5 ${canExpand && !isLoading ? 'cursor-pointer hover:bg-[#faf8f4] active:bg-[#f3efe7]' : ''} transition-colors duration-150`}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {children}
          </div>

          {canExpand && (
            <div className="flex items-center shrink-0">
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
  trend,
  isCurrentUser = false
}: LeaderboardRowContentProps) {
  const youBadge = isCurrentUser ? (
    <span className="text-[10px] font-bold uppercase tracking-wide bg-[#C9A04E] text-[#4B3621] px-1.5 py-0.5 rounded-md shrink-0">You</span>
  ) : null
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
      <div className="hidden md:grid grid-cols-[112px_minmax(0,1fr)_104px_64px_72px] items-center gap-3 w-full">
        {/* Rank + movement pill inline (movement sits between rank and name) */}
        <div className="flex items-center gap-2">
          {rank <= 3 && <Trophy className={`w-4 h-4 shrink-0 ${trophyColor}`} />}
          <span className="font-extrabold text-[#4B3621] text-base tabular-nums">
            {isTied && <span className="text-[#2f6fd0]" title="Tied rank">T</span>}{rank}
          </span>
          {getRankChangeIndicator()}
        </div>

        {/* Name + badges */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-900 truncate">{displayName}</span>
          {youBadge}
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
        {/* Line 1: rank · movement · name (left), points (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {rank <= 3 && <Trophy className={`w-4 h-4 shrink-0 ${trophyColor}`} />}
            <span className="font-extrabold text-[#4B3621] tabular-nums shrink-0">
              {isTied && <span className="text-[#2f6fd0]">T</span>}{rank}
            </span>
            {getRankChangeIndicator()}
            <span className="font-semibold text-gray-900 truncate">{displayName}</span>
            {youBadge}
          </div>
          <span className="font-extrabold text-lg text-[#4B3621] tabular-nums shrink-0">{points}</span>
        </div>

        {/* Line 2: record · lock · badges (compact) */}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 tabular-nums">
          <span>{record}</span>
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" />{lockRecord}</span>
          {getPaymentBadge()}
          {getSourceBadge()}
        </div>
      </div>
    </>
  )
}