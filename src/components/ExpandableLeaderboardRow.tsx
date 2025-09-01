import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Lock, Trophy } from 'lucide-react'
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
  onToggle 
}: LeaderboardRowContentProps) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center space-x-4">
        {/* Rank */}
        <div className="flex items-center min-w-[3rem]">
          {rank <= 3 ? (
            <div className="flex items-center space-x-1">
              <Trophy className={`w-4 h-4 ${
                rank === 1 ? 'text-yellow-500' : 
                rank === 2 ? 'text-gray-400' : 
                'text-amber-600'
              }`} />
              <span className="font-bold text-lg">{rank}</span>
            </div>
          ) : (
            <span className="font-semibold text-gray-700">{rank}</span>
          )}
        </div>

        {/* Name */}
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
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