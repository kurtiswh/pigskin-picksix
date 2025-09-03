import { useState, useEffect } from 'react'
import { ENV } from '@/lib/env'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

type ValidationStatus = 'pending_validation' | 'auto_validated' | 'manually_validated' | 'duplicate_conflict'
type PickSource = 'authenticated' | 'anonymous'

interface AnonymousPick {
  id: string
  email: string
  name: string
  week: number
  season: number
  game_id: string
  home_team: string
  away_team: string
  selected_team: string
  is_lock: boolean
  is_validated: boolean
  submitted_at: string
  assigned_user_id?: string
  show_on_leaderboard: boolean
  validation_status: ValidationStatus
  processing_notes?: string
  created_at: string
}

interface PickSet {
  email: string
  name: string
  submittedAt: string
  isValidated: boolean
  picks: AnonymousPick[]
  assignedUserId?: string
  showOnLeaderboard: boolean
  validationStatus: ValidationStatus
  processingNotes?: string
  autoAssigned?: boolean
  hasConflicts?: boolean
}

interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
}

interface ExistingPickSet {
  submittedAt: string
  source: 'authenticated' | 'anonymous'
  pickCount: number
  picks?: {
    id: string
    game_id: string
    selected_team: string
    is_lock: boolean
    result: 'win' | 'loss' | 'push' | null
    points_earned: number | null
    home_team: string
    away_team: string
  }[]
}

interface AnonymousPicksAdminProps {
  currentWeek: number
  currentSeason: number
}

const getValidationStatusBadge = (status: ValidationStatus) => {
  switch (status) {
    case 'pending_validation':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">⏳ Pending Validation</Badge>
    case 'auto_validated':
      return <Badge variant="default" className="bg-green-100 text-green-800">✅ Auto-Validated</Badge>
    case 'manually_validated':
      return <Badge variant="default" className="bg-purple-100 text-purple-800">👤 Manually Validated</Badge>
    case 'duplicate_conflict':
      return <Badge variant="destructive" className="bg-red-100 text-red-800">⚠️ Duplicate Conflict</Badge>
    default:
      return <Badge variant="secondary">❓ Unknown Status</Badge>
  }
}

export default function AnonymousPicksAdmin({ currentWeek, currentSeason }: AnonymousPicksAdminProps) {
  const [pickSets, setPickSets] = useState<PickSet[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [selectedSeason, setSelectedSeason] = useState(currentSeason)
  const [statusFilter, setStatusFilter] = useState<ValidationStatus | 'all'>('all')
  const [detectedDuplicates, setDetectedDuplicates] = useState<{ duplicateGroups: PickSet[][], totalDuplicates: number }>({ duplicateGroups: [], totalDuplicates: 0 })
  const [conflictResolution, setConflictResolution] = useState<{
    pickSet: PickSet
    assignedUserId: string
    existingPickSets: ExistingPickSet[]
    selectedPickSet: 'new' | 'existing'
  } | null>(null)
  const [userSearch, setUserSearch] = useState<{[key: string]: string}>({})
  const [userPickSets, setUserPickSets] = useState<{[userEmail: string]: {conflicts: ExistingPickSet[], assignedPickSet?: PickSet}}>({})
  const [viewAllSetsDialog, setViewAllSetsDialog] = useState<{
    userEmail: string
    userName: string
    userId: string
    allSets: (ExistingPickSet | {source: 'new_anonymous', submittedAt: string, pickCount: number, pickSet: PickSet})[]
    currentAssignment?: PickSet
  } | null>(null)
  
  // Track which picksets are being processed to show local loading
  const [processingPickSets, setProcessingPickSets] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
    checkCurrentUser()
  }, [selectedWeek, selectedSeason])

  const [autoProcessingComplete, setAutoProcessingComplete] = useState(false)

  useEffect(() => {
    // Auto-process validated users only once per data load
    if (!loading && pickSets.length > 0 && users.length > 0 && !autoProcessingComplete) {
      const unassignedValidatedPickSets = pickSets.filter(ps => 
        ps.isValidated && 
        !ps.assignedUserId && 
        !ps.autoAssigned &&
        ps.validationStatus === 'pending_validation' // Only process pending ones
      )
      
      if (unassignedValidatedPickSets.length > 0) {
        console.log(`🔄 Auto-processing ${unassignedValidatedPickSets.length} validated users`)
        processValidatedUsers().then(() => {
          setAutoProcessingComplete(true) // Prevent further auto-processing
        })
      } else {
        setAutoProcessingComplete(true)
      }
    }
  }, [loading, pickSets.length, users.length, autoProcessingComplete])

  // Reset auto-processing flag when week/season changes
  useEffect(() => {
    setAutoProcessingComplete(false)
  }, [selectedWeek, selectedSeason])

  // Content-based duplicate detection for pick sets from the same email address
  const detectContentBasedDuplicates = (pickSets: PickSet[]): { duplicateGroups: PickSet[][], totalDuplicates: number } => {
    console.log('🔍 Running enhanced content-based duplicate detection...')
    
    // Group pick sets by email address
    const pickSetsByEmail = new Map<string, PickSet[]>()
    // Also group pick sets by assigned user_id for cross-email duplicate detection
    const pickSetsByUserId = new Map<string, PickSet[]>()
    // NEW: Group anonymous pick sets by content signature for cross-email detection
    const anonymousPicksByContent = new Map<string, PickSet[]>()
    
    for (const pickSet of pickSets) {
      // Group by email (original logic)
      if (!pickSetsByEmail.has(pickSet.email)) {
        pickSetsByEmail.set(pickSet.email, [])
      }
      pickSetsByEmail.get(pickSet.email)!.push(pickSet)
      
      // Group by assigned user_id (for assigned anonymous picks)
      if (pickSet.assignedUserId) {
        if (!pickSetsByUserId.has(pickSet.assignedUserId)) {
          pickSetsByUserId.set(pickSet.assignedUserId, [])
        }
        pickSetsByUserId.get(pickSet.assignedUserId)!.push(pickSet)
      }
      
      // NEW: Group unassigned anonymous picks by content signature for cross-email detection
      if (!pickSet.assignedUserId) {
        // Create content signature for anonymous picks to detect cross-email duplicates
        const sortedPicks = [...pickSet.picks].sort((a, b) => a.game_id.localeCompare(b.game_id))
        const contentSignature = sortedPicks.map(pick => 
          `${pick.game_id}:${pick.selected_team}:${pick.is_lock ? 'LOCK' : 'REG'}`
        ).join('|')
        
        if (!anonymousPicksByContent.has(contentSignature)) {
          anonymousPicksByContent.set(contentSignature, [])
        }
        anonymousPicksByContent.get(contentSignature)!.push(pickSet)
      }
    }
    
    const duplicateGroups: PickSet[][] = []
    let totalDuplicates = 0
    const processedPairs = new Set<string>() // Track processed pairs to avoid double-reporting
    
    // Helper function to process a group of pick sets for duplicates
    const processGroupForDuplicates = (groupPickSets: PickSet[], groupType: string, groupKey: string) => {
      if (groupPickSets.length <= 1) return // Skip if only one pick set in this group
      
      // Create a signature for each pick set based on actual pick content
      const pickSetSignatures = groupPickSets.map(pickSet => {
        // Sort picks by game_id to normalize order, then create content signature
        const sortedPicks = [...pickSet.picks].sort((a, b) => a.game_id.localeCompare(b.game_id))
        const contentSignature = sortedPicks.map(pick => 
          `${pick.game_id}:${pick.selected_team}:${pick.is_lock ? 'LOCK' : 'REG'}`
        ).join('|')
        
        return {
          pickSet,
          signature: contentSignature,
          lockPick: sortedPicks.find(p => p.is_lock)?.selected_team || null
        }
      })
      
      // Find duplicate signatures within this group
      const signatureGroups = new Map<string, typeof pickSetSignatures>()
      
      for (const item of pickSetSignatures) {
        if (!signatureGroups.has(item.signature)) {
          signatureGroups.set(item.signature, [])
        }
        signatureGroups.get(item.signature)!.push(item)
      }
      
      // Report duplicates
      for (const [signature, group] of signatureGroups) {
        if (group.length > 1) {
          // Create a unique identifier for this duplicate group to avoid double-reporting
          const groupIds = group.map(item => `${item.pickSet.email}-${item.pickSet.submittedAt}`).sort().join('|')
          if (processedPairs.has(groupIds)) {
            console.log(`⏭️ Skipping already processed duplicate group: ${groupIds}`)
            continue
          }
          processedPairs.add(groupIds)
          
          console.log(`🚨 DUPLICATE CONTENT detected via ${groupType} (${groupKey}):`)
          console.log(`   Content signature: ${signature}`)
          console.log(`   Number of duplicates: ${group.length}`)
          group.forEach((item, index) => {
            console.log(`   ${index + 1}. ${item.pickSet.email} - Submitted: ${item.pickSet.submittedAt} (Status: ${item.pickSet.validationStatus}, User ID: ${item.pickSet.assignedUserId || 'unassigned'})`)
          })
          
          const duplicatePickSets = group.map(item => item.pickSet)
          duplicateGroups.push(duplicatePickSets)
          totalDuplicates += duplicatePickSets.length - 1 // Don't count the "original" as a duplicate
        }
      }
    }
    
    // Check each email address for content-based duplicates (original logic)
    console.log('📧 Checking for duplicates within same email addresses...')
    for (const [email, emailPickSets] of pickSetsByEmail) {
      processGroupForDuplicates(emailPickSets, 'email', email)
    }
    
    // Check each assigned user_id for content-based duplicates (new logic for Walker case)
    console.log('👤 Checking for duplicates within same assigned user_id...')
    for (const [userId, userPickSets] of pickSetsByUserId) {
      processGroupForDuplicates(userPickSets, 'user_id', userId)
    }
    
    // NEW: Check anonymous picks for cross-email duplicates by content
    console.log('🔍 Checking for cross-email duplicates in anonymous picks by content signature...')
    for (const [signature, contentPickSets] of anonymousPicksByContent) {
      if (contentPickSets.length > 1) {
        // Filter to only different emails to avoid duplicate reporting
        const emailSet = new Set(contentPickSets.map(ps => ps.email))
        if (emailSet.size > 1) {
          processGroupForDuplicates(contentPickSets, 'anonymous_content', signature.substring(0, 50) + '...')
        }
      }
    }
    
    if (duplicateGroups.length > 0) {
      console.log(`⚠️ SUMMARY: Found ${duplicateGroups.length} groups of content-based duplicates (${totalDuplicates} duplicate pick sets)`)
    } else {
      console.log('✅ No content-based duplicates detected')
    }
    
    return { duplicateGroups, totalDuplicates }
  }

  const processValidatedUsers = async () => {
    // Fix: Auto-validated picks should be processed even if they don't have assignedUserId yet
    // The whole point is to assign them a user ID
    const validatedPickSets = pickSets.filter(ps => ps.isValidated && !ps.autoAssigned)
    
    for (const pickSet of validatedPickSets) {
      try {
        // Find user by email
        const matchingUser = users.find(u => u.email === pickSet.email)
        if (matchingUser) {
          console.log(`🔍 Auto-processing validated user: ${pickSet.email} -> User ID: ${matchingUser.id}`)
          await handleAssignPickSet(pickSet, matchingUser.id, true) // true = auto mode
        } else {
          console.log(`⚠️ No matching user found for validated email: ${pickSet.email}`)
        }
      } catch (error) {
        console.error(`❌ Error auto-processing ${pickSet.email}:`, error)
        setError(`Failed to auto-process ${pickSet.email}: ${error.message}`)
        // Stop auto-processing to prevent infinite loops
        break
      }
    }
  }

  const checkCurrentUser = async () => {
    // This was used for debugging - can be removed if not needed
  }

  // Comprehensive auto-assignment function for unassigned picks
  const autoAssignAllUnassignedPicks = async () => {
    try {
      setLoading(true)
      console.log('🚀 Starting comprehensive auto-assignment for all unassigned picks...')
      
      // Find all truly unassigned pick sets
      const unassignedPickSets = pickSets.filter(ps => !ps.assignedUserId)
      console.log(`📋 Found ${unassignedPickSets.length} unassigned pick sets`)
      
      if (unassignedPickSets.length === 0) {
        console.log('✅ No unassigned pick sets found')
        return
      }
      
      let successCount = 0
      let errorCount = 0
      const results: string[] = []
      
      for (const pickSet of unassignedPickSets) {
        try {
          console.log(`🔍 Processing pick set: ${pickSet.email} (${pickSet.picks.length} picks)`)
          
          // Find user by email (case insensitive)
          const matchingUser = users.find(u => u.email.toLowerCase() === pickSet.email.toLowerCase())
          
          if (matchingUser) {
            console.log(`✅ Found matching user: ${pickSet.email} -> ${matchingUser.display_name} (${matchingUser.id})`)
            
            // Check for existing pick sets for this user/week/season
            const existingPickSets = await checkExistingPickSets(matchingUser.id, selectedWeek, selectedSeason)
            
            if (existingPickSets.length === 0) {
              // No conflicts - safe to auto-assign
              console.log(`🎯 Auto-assigning ${pickSet.email} - no conflicts`)
              
              // Update validation status to auto_validated
              await handleUpdateValidationStatus(pickSet, 'auto_validated', 'Auto-assigned by comprehensive assignment process')
              
              // Assign the pick set
              await confirmAssignment(pickSet, matchingUser.id, 'new')
              
              successCount++
              results.push(`✅ ${pickSet.email} -> ${matchingUser.display_name}`)
              
              // Update local state
              setPickSets(prev => 
                prev.map(ps => 
                  ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
                    ? { 
                        ...ps, 
                        assignedUserId: matchingUser.id, 
                        autoAssigned: true, 
                        validationStatus: 'auto_validated' as ValidationStatus,
                        processingNotes: 'Auto-assigned by comprehensive assignment process'
                      }
                    : ps
                )
              )
            } else {
              // Conflicts found - still assign but mark as having conflicts
              console.log(`⚠️ Auto-assigning ${pickSet.email} with ${existingPickSets.length} conflicts - precedence will be handled by database`)
              
              // Update validation status to show conflicts
              await handleUpdateValidationStatus(pickSet, 'auto_validated', `Auto-assigned with conflicts: ${existingPickSets.length} existing pick sets. Database precedence rules applied.`)
              
              // Assign the pick set
              await confirmAssignment(pickSet, matchingUser.id, 'new')
              
              successCount++
              results.push(`⚠️ ${pickSet.email} -> ${matchingUser.display_name} (with conflicts)`)
              
              // Update local state
              setPickSets(prev => 
                prev.map(ps => 
                  ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
                    ? { 
                        ...ps, 
                        assignedUserId: matchingUser.id, 
                        autoAssigned: true, 
                        hasConflicts: true,
                        validationStatus: 'auto_validated' as ValidationStatus,
                        processingNotes: `Auto-assigned with conflicts: ${existingPickSets.length} existing pick sets`
                      }
                    : ps
                )
              )
            }
          } else {
            console.log(`❌ No matching user found for email: ${pickSet.email}`)
            
            // Update validation status to indicate no matching user
            await handleUpdateValidationStatus(pickSet, 'pending_validation', 'No matching user found - manual assignment required')
            
            errorCount++
            results.push(`❌ ${pickSet.email} - No matching user`)
            
            // Update local state
            setPickSets(prev => 
              prev.map(ps => 
                ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
                  ? { 
                      ...ps, 
                      validationStatus: 'pending_validation' as ValidationStatus,
                      processingNotes: 'No matching user found - manual assignment required'
                    }
                  : ps
              )
            )
          }
        } catch (error) {
          console.error(`❌ Error processing ${pickSet.email}:`, error)
          errorCount++
          results.push(`❌ ${pickSet.email} - Error: ${error.message}`)
        }
      }
      
      console.log('🏁 Comprehensive auto-assignment complete:')
      console.log(`✅ Successfully assigned: ${successCount}`)
      console.log(`❌ Errors: ${errorCount}`)
      console.log('📋 Results:', results)
      
      // Show summary to user
      if (successCount > 0 || errorCount > 0) {
        alert(`Auto-assignment complete!\n\nSuccessfully assigned: ${successCount}\nErrors: ${errorCount}\n\nCheck console for details.`)
      }
      
    } catch (error) {
      console.error('❌ Error in comprehensive auto-assignment:', error)
      setError(`Auto-assignment failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Comprehensive diagnostic function to understand the database state
  const runDatabaseDiagnostic = async () => {
    try {
      setLoading(true)
      console.log('🔍 Running comprehensive database diagnostic...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // 1. Check total count for this week/season
      console.log(`📊 DIAGNOSTIC 1: Total count for week ${selectedWeek}, season ${selectedSeason}`)
      const totalCountResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&select=count`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          }
        }
      )
      
      if (totalCountResponse.ok) {
        const countHeaders = totalCountResponse.headers.get('Content-Range')
        console.log(`✅ Total picks found: ${countHeaders}`)
      }
      
      // 2. Check all weeks/seasons to see what data exists
      console.log(`📊 DIAGNOSTIC 2: Checking all weeks/seasons`)
      const allDataResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?select=week,season,count&order=week.asc,season.asc`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          }
        }
      )
      
      if (allDataResponse.ok) {
        const allData = await allDataResponse.json()
        const weekSeasonCounts = new Map<string, number>()
        for (const row of allData) {
          const key = `Week ${row.week}, Season ${row.season}`
          weekSeasonCounts.set(key, (weekSeasonCounts.get(key) || 0) + 1)
        }
        
        console.log('📋 Data distribution by week/season:')
        for (const [key, count] of Array.from(weekSeasonCounts.entries()).slice(0, 10)) {
          console.log(`  - ${key}: ${count} picks`)
        }
      }
      
      // 3. Sample a few records to see their structure
      console.log(`📊 DIAGNOSTIC 3: Sample records structure`)
      const sampleResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?limit=5&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (sampleResponse.ok) {
        const sampleData = await sampleResponse.json()
        console.log('📝 Sample record structure:')
        if (sampleData.length > 0) {
          const sample = sampleData[0]
          console.log('  Fields present:', Object.keys(sample))
          console.log('  Sample values:', {
            id: sample.id,
            email: sample.email,
            week: sample.week,
            season: sample.season,
            validation_status: sample.validation_status,
            show_on_leaderboard: sample.show_on_leaderboard,
            assigned_user_id: sample.assigned_user_id,
            is_validated: sample.is_validated
          })
        }
      }
      
      // 4. Specific check for NULL validation_status
      console.log(`📊 DIAGNOSTIC 4: Checking for NULL validation_status`)
      const nullValidationResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?validation_status=is.null&select=id,email,week,season`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (nullValidationResponse.ok) {
        const nullValidationData = await nullValidationResponse.json()
        console.log(`📊 Records with NULL validation_status: ${nullValidationData.length}`)
        if (nullValidationData.length > 0) {
          nullValidationData.slice(0, 5).forEach((pick, i) => {
            console.log(`  ${i+1}. ${pick.email} - Week ${pick.week}, Season ${pick.season}`)
          })
        }
      }
      
      // 5. Specific check for NULL show_on_leaderboard
      console.log(`📊 DIAGNOSTIC 5: Checking for NULL show_on_leaderboard`)
      const nullLeaderboardResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?show_on_leaderboard=is.null&select=id,email,week,season`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (nullLeaderboardResponse.ok) {
        const nullLeaderboardData = await nullLeaderboardResponse.json()
        console.log(`📊 Records with NULL show_on_leaderboard: ${nullLeaderboardData.length}`)
        if (nullLeaderboardData.length > 0) {
          nullLeaderboardData.slice(0, 5).forEach((pick, i) => {
            console.log(`  ${i+1}. ${pick.email} - Week ${pick.week}, Season ${pick.season}`)
          })
        }
      }
      
      // 6. Check for unassigned picks specifically
      console.log(`📊 DIAGNOSTIC 6: Checking for unassigned picks`)
      const unassignedResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?assigned_user_id=is.null&select=id,email,week,season,validation_status,show_on_leaderboard`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (unassignedResponse.ok) {
        const unassignedData = await unassignedResponse.json()
        console.log(`📊 Total unassigned picks: ${unassignedData.length}`)
        
        // Count by week/season
        const unassignedByWeek = new Map<string, number>()
        for (const pick of unassignedData) {
          const key = `Week ${pick.week}, Season ${pick.season}`
          unassignedByWeek.set(key, (unassignedByWeek.get(key) || 0) + 1)
        }
        
        console.log('📋 Unassigned picks by week/season:')
        for (const [key, count] of Array.from(unassignedByWeek.entries()).slice(0, 10)) {
          console.log(`  - ${key}: ${count} unassigned picks`)
        }
        
        if (unassignedData.length > 0) {
          console.log('📝 First 5 unassigned picks:')
          unassignedData.slice(0, 5).forEach((pick, i) => {
            console.log(`  ${i+1}. ${pick.email} - Week ${pick.week}, Season ${pick.season}, validation: ${pick.validation_status}, leaderboard: ${pick.show_on_leaderboard}`)
          })
        }
      }
      
      alert('Database diagnostic complete! Check the browser console for detailed results.')
      
    } catch (error) {
      console.error('❌ Error in database diagnostic:', error)
      setError(`Diagnostic failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Function to fix anonymous picks that are missing required fields
  const fixMissingPickFields = async () => {
    try {
      setLoading(true)
      console.log('🔧 Starting fix for anonymous picks missing required fields...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Find picks that are missing validation_status or other required fields
      const problematicPicksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&or=(validation_status.is.null,show_on_leaderboard.is.null)&select=id,email,name,validation_status,show_on_leaderboard,assigned_user_id`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (problematicPicksResponse.ok) {
        const problematicPicks = await problematicPicksResponse.json()
        console.log(`🔍 Found ${problematicPicks.length} picks with missing required fields`)
        
        if (problematicPicks.length > 0) {
          // Group by email to fix all picks for each email at once
          const picksByEmail = new Map<string, any[]>()
          for (const pick of problematicPicks) {
            if (!picksByEmail.has(pick.email)) {
              picksByEmail.set(pick.email, [])
            }
            picksByEmail.get(pick.email)!.push(pick)
          }
          
          console.log(`📧 ${picksByEmail.size} unique emails need field fixes`)
          
          let fixedCount = 0
          for (const [email, picks] of picksByEmail) {
            try {
              // Update all picks for this email
              for (const pick of picks) {
                const updateData: any = {}
                
                // Set validation_status if missing
                if (!pick.validation_status) {
                  updateData.validation_status = 'pending_validation'
                }
                
                // Set show_on_leaderboard if missing
                if (pick.show_on_leaderboard === null || pick.show_on_leaderboard === undefined) {
                  // Only show on leaderboard if assigned to a user
                  updateData.show_on_leaderboard = pick.assigned_user_id ? true : false
                }
                
                if (Object.keys(updateData).length > 0) {
                  const updateResponse = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
                    method: 'PATCH',
                    headers: {
                      'apikey': apiKey || '',
                      'Authorization': `Bearer ${apiKey || ''}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                  })
                  
                  if (updateResponse.ok) {
                    fixedCount++
                    console.log(`✅ Fixed pick ${pick.id} for ${email}`)
                  } else {
                    console.error(`❌ Failed to fix pick ${pick.id} for ${email}:`, updateResponse.status)
                  }
                }
              }
            } catch (error) {
              console.error(`❌ Error fixing picks for ${email}:`, error)
            }
          }
          
          console.log(`🏁 Fixed ${fixedCount} picks with missing fields`)
          alert(`Fixed ${fixedCount} anonymous picks with missing required fields.\n\nReload the data to see the changes.`)
        } else {
          alert('No picks found with missing required fields.')
        }
      } else {
        console.error('❌ Failed to query problematic picks:', problematicPicksResponse.status)
        alert('Failed to query picks for field fixes.')
      }
    } catch (error) {
      console.error('❌ Error in fix missing pick fields:', error)
      setError(`Field fix failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Function to load only unassigned picks
  const loadUnassignedPicksOnly = async () => {
    try {
      setLoading(true)
      setError('')
      console.log('🔍 Loading ONLY unassigned anonymous picks...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      console.log(`🎯 Query: unassigned picks for week ${selectedWeek}, season ${selectedSeason}`)
      
      // Load ONLY unassigned anonymous picks for the selected week/season
      const picksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&assigned_user_id=is.null&select=*&order=submitted_at.desc&limit=1000`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!picksResponse.ok) {
        throw new Error(`Failed to load unassigned picks: ${picksResponse.status}`)
      }

      const picksData = await picksResponse.json()
      console.log('✅ Loaded UNASSIGNED picks only:', picksData.length)
      
      if (picksData.length === 0) {
        alert('No unassigned picks found for the selected week/season.')
        return
      }
      
      // Debug: Analyze the unassigned picks
      console.log('🔍 Analyzing unassigned picks...')
      const uniqueEmails = [...new Set(picksData.map(p => p.email))]
      console.log(`📧 Unique emails: ${uniqueEmails.length}`)
      uniqueEmails.slice(0, 10).forEach(email => {
        const pickCount = picksData.filter(p => p.email === email).length
        console.log(`  - ${email}: ${pickCount} picks`)
      })
      
      // Load users for assignment
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=id,email,display_name,is_admin&order=display_name.asc`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (!usersResponse.ok) {
        throw new Error(`Failed to load users: ${usersResponse.status}`)
      }

      const usersData = await usersResponse.json()
      console.log('✅ Loaded users for assignment:', usersData.length)

      // Group picks into pick sets
      const pickSetMap = new Map<string, PickSet>()
      
      console.log('🔄 Starting pick set grouping (unassigned only)...')
      
      for (const pick of picksData) {
        const submittedDate = new Date(pick.submitted_at)
        submittedDate.setSeconds(0, 0)
        const roundedSubmittedAt = submittedDate.toISOString()
        
        const key = `${pick.email}-${roundedSubmittedAt}`
        
        if (!pickSetMap.has(key)) {
          pickSetMap.set(key, {
            email: pick.email,
            name: pick.name,
            submittedAt: roundedSubmittedAt,
            isValidated: pick.is_validated,
            picks: [],
            assignedUserId: pick.assigned_user_id, // Should be null for all
            showOnLeaderboard: pick.show_on_leaderboard,
            validationStatus: pick.validation_status || 'pending_validation',
            processingNotes: pick.processing_notes
          })
        }
        
        pickSetMap.get(key)!.picks.push(pick)
      }
      
      console.log(`🔄 Grouping complete. Created ${pickSetMap.size} unassigned pick set groups`)

      const pickSetsArray = Array.from(pickSetMap.values())
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())

      console.log('✅ Final unassigned pick sets:', pickSetsArray.length)
      
      // Show detailed breakdown
      console.log('📋 Unassigned pick sets breakdown:')
      pickSetsArray.slice(0, 10).forEach((ps, i) => {
        console.log(`  ${i+1}. ${ps.email} (${ps.name}): ${ps.picks.length} picks, validation: ${ps.validationStatus}`)
      })
      
      // Set the data - this will replace any existing data with ONLY unassigned picks
      setPickSets(pickSetsArray)
      setUsers(usersData)
      setDetectedDuplicates({ duplicateGroups: [], totalDuplicates: 0 }) // Clear duplicates for simplicity
      
      alert(`Loaded ${pickSetsArray.length} unassigned pick sets with ${picksData.length} total picks.\nCheck the console for details.`)
      
    } catch (err: any) {
      console.error('❌ Error loading unassigned picks:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Function to recalculate anonymous picks scoring for specific games
  const recalculateAnonymousPicksScoring = async (gameIds?: string[]) => {
    try {
      setLoading(true)
      console.log('🔄 Starting anonymous picks scoring recalculation...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // If specific game IDs provided, use those; otherwise recalculate for current week/season
      let gameFilter = ''
      if (gameIds && gameIds.length > 0) {
        gameFilter = `&game_id=in.(${gameIds.join(',')})`
        console.log(`🎯 Recalculating for specific games: ${gameIds.length} games`)
      } else {
        gameFilter = `&week=eq.${selectedWeek}&season=eq.${selectedSeason}`
        console.log(`🎯 Recalculating for week ${selectedWeek}, season ${selectedSeason}`)
      }
      
      // Get all anonymous picks that need recalculation
      const picksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?select=id,game_id,selected_team,is_lock,games(home_team,away_team,home_score,away_score,spread,status)${gameFilter}`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!picksResponse.ok) {
        throw new Error(`Failed to fetch picks for recalculation: ${picksResponse.status}`)
      }

      const picks = await picksResponse.json()
      console.log(`📊 Found ${picks.length} anonymous picks to recalculate`)

      if (picks.length === 0) {
        alert('No anonymous picks found to recalculate.')
        return
      }

      let updatedCount = 0
      let errorCount = 0

      for (const pick of picks) {
        try {
          const game = pick.games
          if (!game || game.status !== 'completed') {
            console.log(`⏭️ Skipping pick ${pick.id} - game not completed`)
            continue
          }

          // Calculate the result
          const homeScore = game.home_score || 0
          const awayScore = game.away_score || 0
          const spread = game.spread || 0

          // Calculate ATS result - spread is applied to the home team
          // If spread is negative, home team is favored by that amount
          // If spread is positive, away team is favored by that amount
          const homeScoreATS = homeScore + spread
          const awayScoreATS = awayScore
          
          const isPush = homeScoreATS === awayScoreATS
          const homeWinsATS = homeScoreATS > awayScoreATS
          const awayWinsATS = awayScoreATS > homeScoreATS

          let result: 'win' | 'loss' | 'push'
          let points_earned: number

          if (isPush) {
            result = 'push'
            points_earned = 10
          } else if (
            (pick.selected_team === game.home_team && homeWinsATS) ||
            (pick.selected_team === game.away_team && awayWinsATS)
          ) {
            result = 'win'
            points_earned = pick.is_lock ? 40 : 20
          } else {
            result = 'loss'
            points_earned = 0
          }

          console.log(`📊 Game calculation: ${game.away_team} @ ${game.home_team}`)
          console.log(`   Score: ${awayScore}-${homeScore}, Spread: ${spread}`)
          console.log(`   ATS: Away ${awayScoreATS} vs Home ${homeScoreATS}`)
          console.log(`   Pick: ${pick.selected_team} -> ${result} (${points_earned} pts)`)

          console.log(`🔄 Updating pick ${pick.id}: ${pick.selected_team} -> ${result} (${points_earned} pts)`)

          // Update the pick with new result and points
          const updateResponse = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${apiKey || ''}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              result: result,
              points_earned: points_earned
            })
          })

          if (updateResponse.ok) {
            updatedCount++
            console.log(`✅ Updated pick ${pick.id}`)
          } else {
            console.error(`❌ Failed to update pick ${pick.id}:`, updateResponse.status)
            errorCount++
          }

        } catch (error) {
          console.error(`❌ Error processing pick ${pick.id}:`, error)
          errorCount++
        }
      }

      console.log('🏁 Recalculation complete!')
      console.log(`✅ Updated: ${updatedCount} picks`)
      console.log(`❌ Errors: ${errorCount} picks`)

      alert(`Anonymous picks recalculation complete!\n\nUpdated: ${updatedCount} picks\nErrors: ${errorCount} picks\n\nCheck console for details.`)

      // Reload data to show updated results
      if (!gameIds) {
        await loadData()
      }

    } catch (error) {
      console.error('❌ Error in anonymous picks recalculation:', error)
      setError(`Recalculation failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Function to recalculate specific games (takes list of game IDs)
  const recalculateSpecificGames = async () => {
    const gameIdsInput = prompt(
      'Enter game IDs to recalculate (comma-separated):\n\nExample: 5ce6d309-1e0b-4de9-9673-1125d005008a,a52a8db8-9216-4ffd-af04-faa463557ce0'
    )

    if (!gameIdsInput) {
      return
    }

    const gameIds = gameIdsInput
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)

    if (gameIds.length === 0) {
      alert('No valid game IDs provided.')
      return
    }

    console.log('🎯 Recalculating specific games:', gameIds)
    await recalculateAnonymousPicksScoring(gameIds)
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📋 Loading anonymous picks and users...')
      console.log(`🔍 Query parameters: week=${selectedWeek}, season=${selectedSeason}`)

      // First, let's check the total count of anonymous picks for debugging
      const countResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&select=count`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'
          }
        }
      )

      if (countResponse.ok) {
        const countResult = await countResponse.json()
        console.log(`📊 Total anonymous picks in database for week ${selectedWeek}, season ${selectedSeason}: ${countResult.length}`)
      }

      // Load anonymous picks for the selected week/season (including assignment columns)
      // Note: Increasing limit to handle all picks - Supabase defaults to 1000 max
      const picksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&select=*&order=submitted_at.desc&limit=2000`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!picksResponse.ok) {
        throw new Error(`Failed to load anonymous picks: ${picksResponse.status}`)
      }

      const picksData = await picksResponse.json()
      console.log('✅ Loaded anonymous picks:', picksData.length)
      
      // Debug: Check if assignment columns are present and analyze the data
      console.log('🔍 Analyzing loaded picks data...')
      
      const samplePick = picksData[0]
      if (samplePick) {
        console.log('📝 Sample pick data:', {
          id: samplePick.id,
          email: samplePick.email,
          name: samplePick.name,
          week: samplePick.week,
          season: samplePick.season,
          assigned_user_id: samplePick.assigned_user_id,
          show_on_leaderboard: samplePick.show_on_leaderboard,
          validation_status: samplePick.validation_status,
          is_validated: samplePick.is_validated,
          processing_notes: samplePick.processing_notes,
          submitted_at: samplePick.submitted_at
        })
      }
      
      // Debug: Count picks by assignment status
      const assignedPicks = picksData.filter(p => p.assigned_user_id)
      const unassignedPicks = picksData.filter(p => !p.assigned_user_id)
      const validatedPicks = picksData.filter(p => p.is_validated)
      const pendingValidationPicks = picksData.filter(p => p.validation_status === 'pending_validation')
      
      console.log('📊 Pick status breakdown:')
      console.log(`  - Total picks loaded: ${picksData.length}`)
      console.log(`  - Assigned picks: ${assignedPicks.length}`)
      console.log(`  - Unassigned picks: ${unassignedPicks.length}`)
      console.log(`  - Validated picks (is_validated=true): ${validatedPicks.length}`)
      console.log(`  - Pending validation picks: ${pendingValidationPicks.length}`)
      
      // Debug: Show unique emails for unassigned picks
      const unassignedEmails = [...new Set(unassignedPicks.map(p => p.email))]
      console.log(`📧 Unique emails with unassigned picks: ${unassignedEmails.length}`)
      unassignedEmails.slice(0, 10).forEach(email => {
        const pickCount = unassignedPicks.filter(p => p.email === email).length
        console.log(`  - ${email}: ${pickCount} picks`)
      })
      if (unassignedEmails.length > 10) {
        console.log(`  - ... and ${unassignedEmails.length - 10} more emails`)
      }

      // Load all users for assignment
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=id,email,display_name,is_admin&order=display_name.asc`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (!usersResponse.ok) {
        throw new Error(`Failed to load users: ${usersResponse.status}`)
      }

      const usersData = await usersResponse.json()
      console.log('✅ Loaded users for assignment:', usersData.length)

      // Group picks into pick sets by email + rounded submitted_at (to handle multiple submissions from same email)
      // Round to nearest minute to group picks from same form submission
      const pickSetMap = new Map<string, PickSet>()
      
      console.log('🔄 Starting pick set grouping process...')
      console.log(`📊 Processing ${picksData.length} individual picks`)
      
      for (const pick of picksData) {
        // Round submitted_at to nearest minute to group picks from same form submission
        const submittedDate = new Date(pick.submitted_at)
        submittedDate.setSeconds(0, 0) // Reset seconds and milliseconds
        const roundedSubmittedAt = submittedDate.toISOString()
        
        const key = `${pick.email}-${roundedSubmittedAt}`
        
        if (!pickSetMap.has(key)) {
          pickSetMap.set(key, {
            email: pick.email,
            name: pick.name,
            submittedAt: roundedSubmittedAt, // Use rounded timestamp for consistency
            isValidated: pick.is_validated,
            picks: [],
            assignedUserId: pick.assigned_user_id,
            // For admin interface, we want to see all picksets regardless of leaderboard status
            // The actual leaderboard visibility will be determined when picks are assigned
            showOnLeaderboard: pick.show_on_leaderboard,
            validationStatus: pick.validation_status || 'pending_validation',
            processingNotes: pick.processing_notes
          })
        }
        
        pickSetMap.get(key)!.picks.push(pick)
      }
      
      console.log(`🔄 Grouping complete. Created ${pickSetMap.size} unique pick set groups`)
      console.log('📋 Sample pick set keys:')
      Array.from(pickSetMap.keys()).slice(0, 5).forEach((key, i) => {
        const pickCount = pickSetMap.get(key)!.picks.length
        console.log(`  ${i+1}. "${key}" -> ${pickCount} picks`)
      })

      const pickSetsArray = Array.from(pickSetMap.values())
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())

      console.log('✅ Grouped into pick sets:', pickSetsArray.length)
      
      // Debug: Analyze pick sets more thoroughly
      console.log('🔍 Detailed pick set analysis:')
      
      const assignedPickSets = pickSetsArray.filter(ps => ps.assignedUserId)
      const unassignedPickSets = pickSetsArray.filter(ps => !ps.assignedUserId)
      
      console.log(`📊 Pick set breakdown:`)
      console.log(`  - Total pick sets: ${pickSetsArray.length}`)
      console.log(`  - Assigned pick sets: ${assignedPickSets.length}`)
      console.log(`  - Unassigned pick sets: ${unassignedPickSets.length}`)
      
      // Debug: Show pick set sizes to identify splitting issues
      const incompleteSets = pickSetsArray.filter(ps => ps.picks.length !== 6)
      if (incompleteSets.length > 0) {
        console.warn(`⚠️ Found ${incompleteSets.length} incomplete pick sets:`)
        incompleteSets.forEach(ps => {
          console.warn(`  - ${ps.email}: ${ps.picks.length} picks (submitted ${ps.submittedAt})`)
        })
      }
      
      // Debug: Show first few unassigned pick sets
      console.log('📋 First 10 unassigned pick sets:')
      unassignedPickSets.slice(0, 10).forEach(ps => {
        console.log(`  - ${ps.email} (${ps.name}): ${ps.picks.length} picks, validation: ${ps.validationStatus}, validated: ${ps.isValidated}`)
      })
      
      // Debug: Show assignment status of pick sets
      if (assignedPickSets.length > 0) {
        console.log('📋 First 5 assigned pick sets:')
        assignedPickSets.slice(0, 5).forEach(ps => {
          console.log(`  - ${ps.email} -> ${ps.assignedUserId}, leaderboard: ${ps.showOnLeaderboard}`)
        })
      }
      
      // Detect content-based duplicates within the same email address
      const duplicateInfo = detectContentBasedDuplicates(pickSetsArray)
      console.log('🔍 Content-based duplicate detection results:', duplicateInfo)
      setDetectedDuplicates(duplicateInfo)
      
      setPickSets(pickSetsArray)
      setUsers(usersData)
    } catch (err: any) {
      console.error('❌ Error loading anonymous picks admin data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignPickSet = async (pickSet: PickSet, userId: string, autoMode = false) => {
    // For validated emails, we need to check for existing pick sets regardless
    // to ensure only one pick set per user per week counts toward leaderboard
    
    // Check for existing pick sets for this user this week
    const existingPickSets = await checkExistingPickSets(userId, selectedWeek, selectedSeason)
    
    // Track pick sets for this user
    setUserPickSets(prev => ({
      ...prev,
      [pickSet.email]: {
        conflicts: existingPickSets,
        assignedPickSet: pickSet
      }
    }))

    if (existingPickSets.length === 0) {
      // No conflicts - safe to assign and add to leaderboard
      // The database triggers will automatically handle precedence
      if (autoMode && pickSet.isValidated) {
        console.log(`✅ Auto-assigning validated user ${pickSet.email} - no conflicts found`)
        
        // Update validation status to auto_validated first
        await handleUpdateValidationStatus(pickSet, 'auto_validated', 'Auto-assigned - no conflicts found')
        
        // Then assign the pick set with is_active_pick_set = true
        await confirmAssignment(pickSet, userId, 'new')
        
        // Update local state to show as auto-assigned (confirmAssignment already set assignedUserId and showOnLeaderboard based on payment status)
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, autoAssigned: true, validationStatus: 'auto_validated' as ValidationStatus, processingNotes: 'Auto-assigned - no conflicts found' }
              : ps
          )
        )
      } else {
        console.log('✅ No existing pick sets found - proceeding with assignment')
        await confirmAssignment(pickSet, userId, 'new')
      }
    } else {
      // Conflicts found - database triggers should handle precedence automatically
      // but admin can override if needed
      console.log(`⚠️ Conflicts found for ${pickSet.email}:`, existingPickSets.length, 'existing pick sets')
      console.log('📋 Existing pick sets details:', existingPickSets)
      console.log('💡 Database triggers will handle precedence (authenticated > anonymous) automatically')
      
      if (autoMode && pickSet.isValidated) {
        // For auto-mode validated users, still assign but mark as having conflicts for admin review
        console.log(`🔄 Auto-mode: Assigning validated user ${pickSet.email} with conflicts - precedence will be handled by database`)
        
        // Update validation status to show conflicts were detected
        await handleUpdateValidationStatus(pickSet, 'auto_validated', `Conflicts detected: ${existingPickSets.length} existing pick sets. Database precedence rules applied.`)
        
        // Proceed with assignment - database triggers will handle the precedence
        await confirmAssignment(pickSet, userId, 'new')
        
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, autoAssigned: true, hasConflicts: true, validationStatus: 'auto_validated' as ValidationStatus, processingNotes: `Auto-assigned with conflicts - precedence handled by database` }
              : ps
          )
        )
      } else {
        // For manual mode, show conflict resolution dialog to allow admin override
        setConflictResolution({
          pickSet,
          assignedUserId: userId,
          existingPickSets,
          selectedPickSet: 'new'
        })
      }
    }
  }

  const checkExistingPickSets = async (userId: string, week: number, season: number): Promise<ExistingPickSet[]> => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log(`🔍 Checking existing pick sets for user ${userId}, week ${week}, season ${season}`)

      const results: ExistingPickSet[] = []

      // Check for existing pick sets with detailed pick information

      // Check authenticated picks (only submitted ones) with game details
      const authPicksResponse = await fetch(
        `${supabaseUrl}/rest/v1/picks?user_id=eq.${userId}&week=eq.${week}&season=eq.${season}&submitted=eq.true&select=*,games(home_team,away_team)`,
        {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (authPicksResponse.ok) {
        const authPicks = await authPicksResponse.json()
        console.log(`📊 Found ${authPicks.length} authenticated picks for user ${userId}`)
        if (authPicks.length > 0) {
          // Group by submitted_at to get pick sets with full pick details
          const submissionTimes = [...new Set(authPicks.map(p => p.submitted_at))]
          console.log(`📅 Authenticated submission times:`, submissionTimes)
          for (const submittedAt of submissionTimes) {
            const picksForSubmission = authPicks.filter(p => p.submitted_at === submittedAt)
            results.push({
              submittedAt,
              source: 'authenticated',
              pickCount: picksForSubmission.length,
              picks: picksForSubmission.map(p => ({
                id: p.id,
                game_id: p.game_id,
                selected_team: p.selected_team,
                is_lock: p.is_lock,
                result: p.result,
                points_earned: p.points_earned,
                home_team: p.games?.home_team || 'Unknown',
                away_team: p.games?.away_team || 'Unknown'
              }))
            })
          }
        }
      } else {
        console.log(`❌ Failed to fetch authenticated picks: ${authPicksResponse.status}`)
      }

      // Check other anonymous picks assigned to this user that are on leaderboard
      const anonPicksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?assigned_user_id=eq.${userId}&week=eq.${week}&season=eq.${season}&show_on_leaderboard=eq.true&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (anonPicksResponse.ok) {
        const anonPicks = await anonPicksResponse.json()
        console.log(`📊 Found ${anonPicks.length} assigned anonymous picks for user ${userId}`)
        if (anonPicks.length > 0) {
          // Group by submitted_at to get pick sets with full pick details
          const submissionTimes = [...new Set(anonPicks.map(p => p.submitted_at))]
          console.log(`📅 Anonymous submission times:`, submissionTimes)
          for (const submittedAt of submissionTimes) {
            const picksForSubmission = anonPicks.filter(p => p.submitted_at === submittedAt)
            results.push({
              submittedAt,
              source: 'anonymous',
              pickCount: picksForSubmission.length,
              picks: picksForSubmission.map(p => ({
                id: p.id,
                game_id: p.game_id,
                selected_team: p.selected_team,
                is_lock: p.is_lock,
                result: p.result,
                points_earned: p.points_earned,
                home_team: p.home_team,
                away_team: p.away_team
              }))
            })
          }
        }
      } else {
        console.log(`❌ Failed to fetch anonymous picks: ${anonPicksResponse.status}`)
      }

      console.log(`📋 Total conflicts found: ${results.length}`, results)
      return results.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    } catch (err: any) {
      console.error('❌ Error checking existing pick sets:', err)
      return []
    }
  }

  const confirmAssignment = async (pickSet: PickSet, userId: string, keepPickSet: 'new' | 'existing') => {
    const pickSetKey = `${pickSet.email}-${pickSet.submittedAt}`
    
    try {
      // Use local loading state instead of global loading to prevent page reload feeling
      setProcessingPickSets(prev => new Set(prev).add(pickSetKey))
      console.log('🎯 Starting assignment without full page reload...')
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      if (keepPickSet === 'new') {
        // Assign this anonymous pick set to the user
        console.log('👤 Assigning anonymous pick set to user...', { email: pickSet.email, userId })

        // First check if the columns exist by trying a test query
        const testResponse = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pickSet.picks[0].id}&select=id,assigned_user_id,show_on_leaderboard`, {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        })

        if (!testResponse.ok && testResponse.status === 400) {
          throw new Error('Database schema not updated. Please run the migration to add assigned_user_id and show_on_leaderboard columns to anonymous_picks table.')
        }

        console.log(`📝 Updating ${pickSet.picks.length} picks for assignment...`)
        
        // Check payment status before setting leaderboard visibility
        console.log('💳 Checking payment status for leaderboard eligibility...')
        const { isPaid, paymentStatus } = await checkUserPaymentStatus(userId)
        const showOnLeaderboard = isPaid
        
        if (!isPaid) {
          console.log(`⚠️ User payment status: ${paymentStatus} - will not show on leaderboard by default`)
        } else {
          console.log('✅ User has paid - will show on leaderboard by default')
        }
        
        // Use API key for now to avoid hanging on auth session
        const authToken = apiKey
        console.log('🔑 Using API key for database updates')

        for (const pick of pickSet.picks) {
          console.log(`🔄 Updating pick ${pick.id}...`)
          const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              assigned_user_id: userId,
              show_on_leaderboard: showOnLeaderboard  // Only show on leaderboard if user has paid
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Failed to update pick ${pick.id}:`, response.status, errorText)
            throw new Error(`Failed to assign pick: ${response.status} - ${errorText}`)
          } else {
            console.log(`✅ Successfully updated pick ${pick.id}`)
          }
        }

        // Temporarily disable verification to prevent errors
        console.log('⚠️ Database verification temporarily disabled')
        // TODO: Re-enable after fixing RLS policies

        // Update local state
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, assignedUserId: userId, showOnLeaderboard }
              : ps
          )
        )

        // Update validation status to manually_validated since this was a manual admin action
        await handleUpdateValidationStatus(pickSet, 'manually_validated', `Manually assigned by admin - ${keepPickSet === 'new' ? 'new pick set selected' : 'existing pick set kept'}`)
        
        // Update local state to reflect manual validation
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, validationStatus: 'manually_validated' as ValidationStatus, processingNotes: `Manually assigned by admin - ${keepPickSet === 'new' ? 'new pick set selected' : 'existing pick set kept'}` }
              : ps
          )
        )

        console.log('✅ Pick set assigned successfully')
      } else if (keepPickSet === 'existing') {
        // Admin chose to keep existing picks - mark anonymous picks as NOT for leaderboard
        console.log('👥 Keeping existing pick set - marking anonymous picks as inactive...', { email: pickSet.email, userId })
        
        // Check payment status to determine if we should assign user_id even though not showing on leaderboard
        const { isPaid, paymentStatus } = await checkUserPaymentStatus(userId)
        console.log(`💳 User payment status: ${paymentStatus} - assigning user_id but not showing on leaderboard`)
        
        for (const pick of pickSet.picks) {
          console.log(`🔄 Updating pick ${pick.id} as inactive...`)
          const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              assigned_user_id: userId,
              show_on_leaderboard: false  // Explicitly set to false since existing picks are primary
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Failed to update pick ${pick.id}:`, response.status, errorText)
            throw new Error(`Failed to mark pick as inactive: ${response.status} - ${errorText}`)
          } else {
            console.log(`✅ Successfully marked pick ${pick.id} as inactive`)
          }
        }

        // Update local state
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, assignedUserId: userId, showOnLeaderboard: false }
              : ps
          )
        )

        // Update validation status
        await handleUpdateValidationStatus(pickSet, 'manually_validated', `Manually marked as inactive - existing pick set kept as primary`)
        
        // Update local state to reflect manual validation
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, validationStatus: 'manually_validated' as ValidationStatus, processingNotes: `Manually marked as inactive - existing pick set kept as primary` }
              : ps
          )
        )

        console.log('✅ Anonymous picks marked as inactive successfully')
      }

      setConflictResolution(null)
      console.log('🎉 Assignment completed successfully - no page reload!')
    } catch (err: any) {
      console.error('❌ Error confirming assignment:', err)
      setError(err.message)
    } finally {
      // Clear local loading state for this pickset
      setProcessingPickSets(prev => {
        const newSet = new Set(prev)
        newSet.delete(pickSetKey)
        return newSet
      })
    }
  }

  const handleViewAllSets = async (pickSet: PickSet) => {
    const assignedUser = users.find(u => u.id === pickSet.assignedUserId)
    if (!assignedUser) return

    // Get all pick sets for this user
    const conflicts = userPickSets[pickSet.email]?.conflicts || []
    
    // Combine existing pick sets with current anonymous pick set
    const allSets = [
      ...conflicts,
      {
        source: 'new_anonymous' as const,
        submittedAt: pickSet.submittedAt,
        pickCount: pickSet.picks.length,
        pickSet
      }
    ]

    setViewAllSetsDialog({
      userEmail: pickSet.email,
      userName: pickSet.name,
      userId: assignedUser.id,
      allSets,
      currentAssignment: pickSet
    })
  }

  const handleUnassignPickSet = async (pickSet: PickSet) => {
    try {
      setLoading(true)
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('🔄 Unassigning pick set...', { email: pickSet.email })

      for (const pick of pickSet.picks) {
        const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            assigned_user_id: null,
            show_on_leaderboard: false
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to unassign pick: ${response.status} - ${errorText}`)
        }
      }

      console.log('✅ Pick set unassigned successfully')

      // Update local state
      setPickSets(prev => 
        prev.map(ps => 
          ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
            ? { ...ps, assignedUserId: undefined, showOnLeaderboard: false }
            : ps
        )
      )
    } catch (err: any) {
      console.error('❌ Error unassigning pick set:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateValidationStatus = async (pickSet: PickSet, newStatus: ValidationStatus, notes?: string) => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('🔄 Updating validation status for pick set...', { email: pickSet.email, newStatus, notes })

      for (const pick of pickSet.picks) {
        const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            validation_status: newStatus,
            processing_notes: notes || null
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update validation status: ${response.status} - ${errorText}`)
        }
      }

      console.log('✅ Validation status updated for pick set')

      // Update local state
      setPickSets(prev => 
        prev.map(ps => 
          ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
            ? { ...ps, validationStatus: newStatus, processingNotes: notes }
            : ps
        )
      )
    } catch (err: any) {
      console.error('❌ Error updating validation status:', err)
      setError(err.message)
    }
  }

  // Helper function to check if user has paid for the season
  const checkUserPaymentStatus = async (userId: string): Promise<{ isPaid: boolean; paymentStatus: string }> => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      const currentSeason = 2025 // TODO: Make this dynamic

      const response = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?user_id=eq.${userId}&season=eq.${currentSeason}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error('Failed to check payment status:', response.status)
        return { isPaid: false, paymentStatus: 'Unable to verify' }
      }

      const payments = await response.json()
      if (payments && payments.length > 0) {
        const payment = payments[0]
        // Check if status is Paid or Manual Registration (both are considered valid payment statuses)
        const isPaid = payment.status === 'Paid' || payment.status === 'Manual Registration'
        return { isPaid, paymentStatus: payment.status }
      }

      return { isPaid: false, paymentStatus: 'Not found' }
    } catch (error) {
      console.error('Error checking payment status:', error)
      return { isPaid: false, paymentStatus: 'Error checking' }
    }
  }

  const handleToggleLeaderboard = async (pickSet: PickSet, showOnLeaderboard: boolean) => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📊 Toggling leaderboard visibility for pick set...', { email: pickSet.email, showOnLeaderboard })

      // If enabling leaderboard visibility, check payment status first
      if (showOnLeaderboard && pickSet.assignedUserId) {
        console.log('💳 Checking payment status for leaderboard eligibility...')
        const { isPaid, paymentStatus } = await checkUserPaymentStatus(pickSet.assignedUserId)
        
        if (!isPaid) {
          const errorMessage = `Cannot add to leaderboard: User has not paid for the season (Payment status: ${paymentStatus}). Only paid users can appear on the leaderboard.`
          console.error('❌ Payment verification failed:', errorMessage)
          setError(errorMessage)
          return
        }
        
        console.log('✅ Payment verified - user is eligible for leaderboard')
      }

      for (const pick of pickSet.picks) {
        const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            show_on_leaderboard: showOnLeaderboard
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update leaderboard visibility: ${response.status} - ${errorText}`)
        }
      }

      console.log('✅ Leaderboard visibility updated for pick set')

      // Update local state
      setPickSets(prev => 
        prev.map(ps => 
          ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
            ? { ...ps, showOnLeaderboard }
            : ps
        )
      )
    } catch (err: any) {
      console.error('❌ Error updating leaderboard visibility:', err)
      setError(err.message)
    }
  }

  // Filter pick sets based on status
  const filteredPickSets = pickSets.filter(ps => {
    if (statusFilter === 'all') return true
    return ps.validationStatus === statusFilter
  })
  
  const unassignedPickSets = filteredPickSets.filter(ps => !ps.assignedUserId)
  const assignedPickSets = filteredPickSets.filter(ps => ps.assignedUserId)
  
  // Status counts for display (including hasConflicts as duplicate_conflict)
  const statusCounts = {
    all: pickSets.length,
    pending_validation: pickSets.filter(ps => ps.validationStatus === 'pending_validation').length,
    auto_validated: pickSets.filter(ps => ps.validationStatus === 'auto_validated').length,
    manually_validated: pickSets.filter(ps => ps.validationStatus === 'manually_validated').length,
    duplicate_conflict: pickSets.filter(ps => ps.validationStatus === 'duplicate_conflict' || ps.hasConflicts).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-charcoal-600">Loading anonymous picks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Week/Season Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Anonymous Picks Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Season:</label>
              <Input
                type="number"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Week:</label>
              <Input
                type="number"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                min="1"
                max="15"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status Filter:</label>
              <Select value={statusFilter} onValueChange={(value: ValidationStatus | 'all') => setStatusFilter(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                  <SelectItem value="pending_validation">Pending Validation ({statusCounts.pending_validation})</SelectItem>
                  <SelectItem value="auto_validated">Auto-Validated ({statusCounts.auto_validated})</SelectItem>
                  <SelectItem value="manually_validated">Manually Validated ({statusCounts.manually_validated})</SelectItem>
                  <SelectItem value="duplicate_conflict">Duplicate Conflict ({statusCounts.duplicate_conflict})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-end space-x-2">
                <Button onClick={loadData} className="flex-1">
                  Load All Picks
                </Button>
                <Button 
                  onClick={loadUnassignedPicksOnly} 
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={loading}
                >
                  Load Unassigned Only
                </Button>
                <Button 
                  onClick={runDatabaseDiagnostic} 
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  Run Diagnostic
                </Button>
              </div>
              <div className="flex items-end space-x-2">
                <Button 
                  onClick={fixMissingPickFields} 
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                  disabled={loading}
                >
                  Fix Missing Fields
                </Button>
                <Button 
                  onClick={autoAssignAllUnassignedPicks} 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={loading}
                >
                  Auto-Assign All
                </Button>
              </div>
              <div className="flex items-end space-x-2">
                <Button 
                  onClick={() => recalculateAnonymousPicksScoring()} 
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={loading}
                >
                  Recalc All Games
                </Button>
                <Button 
                  onClick={recalculateSpecificGames} 
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={loading}
                >
                  Recalc Specific Games
                </Button>
              </div>
            </div>
            
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="text-blue-800 font-medium">🔍 Admin Tools</div>
              <div className="text-blue-700 mt-1 space-y-2">
                <div>
                  <strong>Loading:</strong> "Load Unassigned Only" 🎯 | "Run Diagnostic" 📊 | "Load All Picks" 📋
                </div>
                <div>
                  <strong>Fixing:</strong> "Fix Missing Fields" 🔧 | "Auto-Assign All" ✅
                </div>
                <div>
                  <strong>Recalculation:</strong> "Recalc All Games" 🔄 (current week/season) | "Recalc Specific Games" 🎯 (enter game IDs)
                </div>
                <div className="text-xs italic">
                  💡 Use "Recalc Specific Games" for the games you identified with scoring issues. Enter the game IDs comma-separated.
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <div className="font-semibold text-blue-800">{statusCounts.all}</div>
              <div className="text-blue-600">Total Pick Sets</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg text-center">
              <div className="font-semibold text-yellow-800">{statusCounts.pending_validation}</div>
              <div className="text-yellow-600">Pending</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <div className="font-semibold text-green-800">{statusCounts.auto_validated}</div>
              <div className="text-green-600">Auto-Validated</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-center">
              <div className="font-semibold text-purple-800">{statusCounts.manually_validated}</div>
              <div className="text-purple-600">Manual</div>
            </div>
            <div className="bg-red-50 p-3 rounded-lg text-center">
              <div className="font-semibold text-red-800">{statusCounts.duplicate_conflict}</div>
              <div className="text-red-600">Conflicts</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-700">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content-Based Duplicate Detection Warning */}
      {detectedDuplicates.totalDuplicates > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <span className="text-orange-600 text-xl">🔍</span>
              <div className="flex-1">
                <div className="font-semibold text-orange-800 mb-2">
                  Content-Based Duplicates Detected
                </div>
                <div className="text-sm text-orange-700 mb-3">
                  Found <strong>{detectedDuplicates.totalDuplicates}</strong> duplicate pick sets across <strong>{detectedDuplicates.duplicateGroups.length}</strong> groups. 
                  These are picks from the same email address with identical game selections and lock picks.
                </div>
                <div className="space-y-2">
                  {detectedDuplicates.duplicateGroups.map((group, groupIndex) => {
                    // Determine if this is a cross-email duplicate (Walker case)
                    const uniqueEmails = [...new Set(group.map(ps => ps.email))]
                    const isCrossEmailDuplicate = uniqueEmails.length > 1
                    const commonUserId = group.find(ps => ps.assignedUserId)?.assignedUserId
                    
                    return (
                      <div key={groupIndex} className="bg-white rounded p-3 border border-orange-200">
                        <div className="font-medium text-orange-800 mb-1">
                          Duplicate Group {groupIndex + 1}: {isCrossEmailDuplicate ? `User ID: ${commonUserId}` : group[0].email}
                          {isCrossEmailDuplicate && (
                            <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-1 rounded">CROSS-EMAIL</span>
                          )}
                        </div>
                        {isCrossEmailDuplicate && (
                          <div className="text-xs text-orange-600 mb-2 italic">
                            ⚠️ Same user matched to different email addresses with identical picks
                          </div>
                        )}
                        <div className="text-xs text-orange-600 space-y-1">
                          {group.map((pickSet, index) => (
                            <div key={index} className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <span>Submission {index + 1}: {pickSet.email}</span>
                                <span className="text-orange-500">{new Date(pickSet.submittedAt).toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="font-medium">Status: {pickSet.validationStatus}</span>
                                {pickSet.assignedUserId && (
                                  <span className="text-orange-500">User: {pickSet.assignedUserId.slice(0, 8)}...</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="text-xs text-orange-600 mt-2 italic">
                  💡 Review these duplicates manually to determine which pick sets should be kept or removed.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unassigned Pick Sets */}
      {unassignedPickSets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🔄 Unassigned Pick Sets ({unassignedPickSets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unassignedPickSets.map((pickSet, index) => (
                <div key={`${pickSet.email}-${pickSet.submittedAt}`} className={`border rounded-lg p-4 ${
                  processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`) 
                    ? 'bg-blue-50 border-blue-300' 
                    : 'bg-yellow-50'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="font-semibold text-lg">
                          {processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`) && (
                            <span className="inline-block animate-spin mr-2">⏳</span>
                          )}
                          {pickSet.name} ({pickSet.email})
                          {processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`) && (
                            <span className="ml-2 text-blue-600 text-sm font-normal">Processing...</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {getValidationStatusBadge(pickSet.validationStatus)}
                          <Badge variant="outline">{pickSet.picks.length} picks</Badge>
                        </div>
                      </div>
                      
                      <div className="text-sm text-charcoal-600 mb-3">
                        <div>Submitted: {new Date(pickSet.submittedAt).toLocaleString()}</div>
                        {pickSet.processingNotes && (
                          <div className="mt-1 text-xs bg-gray-100 p-2 rounded">
                            <span className="font-medium">Notes:</span> {pickSet.processingNotes}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {pickSet.picks.map(pick => (
                          <div key={pick.id} className="text-sm bg-white p-2 rounded border">
                            <div className="font-medium">{pick.away_team} @ {pick.home_team}</div>
                            <div className="text-charcoal-600">
                              Pick: <span className="font-medium">{pick.selected_team}</span>
                              {pick.is_lock && <Badge className="ml-1 text-xs bg-gold-500">LOCK</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="ml-4 flex flex-col space-y-2 w-60">
                      {/* Manual Status Control */}
                      <div className="bg-white p-3 border rounded-lg">
                        <div className="text-xs font-medium text-charcoal-600 mb-1">Change Status:</div>
                        <Select 
                          value={pickSet.validationStatus} 
                          onValueChange={(value: ValidationStatus) => handleUpdateValidationStatus(pickSet, value)}
                        >
                          <SelectTrigger className="w-full text-xs h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending_validation">Pending Validation</SelectItem>
                            <SelectItem value="auto_validated">Auto-Validated</SelectItem>
                            <SelectItem value="manually_validated">Manually Validated</SelectItem>
                            <SelectItem value="duplicate_conflict">Duplicate Conflict</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {pickSet.isValidated ? (
                        <div className="w-48">
                          {pickSet.hasConflicts || pickSet.validationStatus === 'duplicate_conflict' ? (
                            <div className="text-center p-3 bg-red-50 border border-red-200 rounded-md">
                              <div className="text-red-800 font-medium mb-1">⚠️ Duplicate Conflict</div>
                              <div className="text-red-600 text-sm">Choose which pick set to keep</div>
                              <Button
                                onClick={() => {
                                  const user = users.find(u => u.email === pickSet.email)
                                  if (user) handleAssignPickSet(pickSet, user.id, false)
                                }}
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs"
                              >
                                Resolve Conflicts
                              </Button>
                            </div>
                          ) : pickSet.autoAssigned || pickSet.validationStatus === 'auto_validated' ? (
                            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-md">
                              <div className="text-green-800 font-medium mb-1">✅ Auto-Assigned</div>
                              <div className="text-green-600 text-sm">No conflicts found</div>
                            </div>
                          ) : pickSet.validationStatus === 'manually_validated' ? (
                            <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-md">
                              <div className="text-purple-800 font-medium mb-1">👤 Manually Validated</div>
                              <div className="text-purple-600 text-sm">Ready for assignment</div>
                              <Button
                                onClick={() => {
                                  const user = users.find(u => u.email === pickSet.email)
                                  if (user) handleAssignPickSet(pickSet, user.id, false)
                                }}
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs"
                              >
                                Assign
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-md">
                              <div className="text-blue-800 font-medium mb-1">✅ Validated User</div>
                              <div className="text-blue-600 text-sm">Processing...</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-48 relative">
                          <Input
                            type="text"
                            placeholder="Search for user..."
                            value={userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''}
                            onChange={(e) => setUserSearch(prev => ({
                              ...prev,
                              [`${pickSet.email}-${pickSet.submittedAt}`]: e.target.value
                            }))}
                            className="w-full"
                          />
                          {(userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || '').length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                              {users
                                .filter(user => {
                                  const searchTerm = userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''
                                  return user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
                                })
                                .slice(0, 10)
                                .map(user => (
                                  <button
                                    key={user.id}
                                    className={`w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0 ${
                                      processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`) ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                    onClick={() => {
                                      if (!processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`)) {
                                        handleAssignPickSet(pickSet, user.id)
                                        setUserSearch(prev => ({
                                          ...prev,
                                          [`${pickSet.email}-${pickSet.submittedAt}`]: ''
                                        }))
                                      }
                                    }}
                                    disabled={processingPickSets.has(`${pickSet.email}-${pickSet.submittedAt}`)}
                                  >
                                    <div className="font-medium">{user.display_name}</div>
                                    <div className="text-gray-500 text-xs">{user.email}</div>
                                  </button>
                                ))
                              }
                              {users.filter(user => {
                                const searchTerm = userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''
                                return user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       user.email.toLowerCase().includes(searchTerm.toLowerCase())
                              }).length === 0 && (
                                <div className="px-3 py-2 text-gray-500 text-sm">No users found</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assigned Pick Sets */}
      {assignedPickSets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>✅ Assigned Pick Sets ({assignedPickSets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignedPickSets.map((pickSet) => {
                const assignedUser = users.find(u => u.id === pickSet.assignedUserId)
                return (
                  <div key={`${pickSet.email}-${pickSet.submittedAt}`} className="border rounded-lg p-4 bg-green-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="font-semibold text-lg">{pickSet.name} ({pickSet.email})</div>
                          <div className="flex items-center space-x-2">
                            {getValidationStatusBadge(pickSet.validationStatus)}
                            <Badge variant="default" className="bg-blue-100 text-blue-800">
                              👤 {assignedUser?.display_name || 'Unknown User'}
                            </Badge>
                            {pickSet.autoAssigned && (
                              <Badge variant="default" className="bg-green-100 text-green-800">🤖 Auto-Assigned</Badge>
                            )}
                            {userPickSets[pickSet.email]?.conflicts.length > 0 && (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-800">⚠️ Multiple Pick Sets</Badge>
                            )}
                            <Badge variant="outline">{pickSet.picks.length} picks</Badge>
                          </div>
                        </div>
                        
                        <div className="text-sm text-charcoal-600 mb-3">
                          <div>Submitted: {new Date(pickSet.submittedAt).toLocaleString()}</div>
                          {pickSet.processingNotes && (
                            <div className="mt-1 text-xs bg-gray-100 p-2 rounded">
                              <span className="font-medium">Notes:</span> {pickSet.processingNotes}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {pickSet.picks.map(pick => (
                            <div key={pick.id} className="text-sm bg-white p-2 rounded border">
                              <div className="font-medium">{pick.away_team} @ {pick.home_team}</div>
                              <div className="text-charcoal-600">
                                Pick: <span className="font-medium">{pick.selected_team}</span>
                                {pick.is_lock && <Badge className="ml-1 text-xs bg-gold-500">LOCK</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="ml-4 flex flex-col space-y-2 w-60">
                        {/* Manual Status Control */}
                        <div className="bg-white p-3 border rounded-lg">
                          <div className="text-xs font-medium text-charcoal-600 mb-1">Change Status:</div>
                          <Select 
                            value={pickSet.validationStatus} 
                            onValueChange={(value: ValidationStatus) => handleUpdateValidationStatus(pickSet, value)}
                          >
                            <SelectTrigger className="w-full text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending_validation">Pending Validation</SelectItem>
                              <SelectItem value="auto_validated">Auto-Validated</SelectItem>
                              <SelectItem value="manually_validated">Manually Validated</SelectItem>
                              <SelectItem value="duplicate_conflict">Duplicate Conflict</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          variant={pickSet.showOnLeaderboard ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleLeaderboard(pickSet, !pickSet.showOnLeaderboard)}
                        >
                          {pickSet.showOnLeaderboard ? "📊 On Leaderboard" : "📊 Hidden"}
                        </Button>
                        {userPickSets[pickSet.email]?.conflicts.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewAllSets(pickSet)}
                          >
                            👁️ View All Sets ({userPickSets[pickSet.email].conflicts.length + 1})
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleUnassignPickSet(pickSet)}
                        >
                          🔄 Unassign
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conflict Resolution Dialog */}
      {conflictResolution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>⚠️ Pick Set Conflict Detected</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="font-semibold text-amber-800 mb-2">
                  {conflictResolution.pickSet.isValidated 
                    ? `Validated User Conflict Detected`
                    : `User already has pick sets for Week ${selectedWeek}, ${selectedSeason}`
                  }
                </div>
                <div className="text-amber-700 text-sm">
                  {conflictResolution.pickSet.isValidated 
                    ? `This user already has picks in the system for this week. Since they're a validated user, you must choose which pick set should count toward the leaderboard.`
                    : `Only one pick set per user per week can count towards the leaderboard. Choose which pick set should be active:`
                  }
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-medium">Existing Pick Sets:</div>
                {conflictResolution.existingPickSets.map((existing, index) => (
                  <div key={index} className="border rounded p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium">
                          {existing.source === 'authenticated' ? '🔐 Authenticated' : '👤 Anonymous'} Pick Set
                        </div>
                        <div className="text-sm text-charcoal-600">
                          {existing.pickCount} picks • {new Date(existing.submittedAt).toLocaleString()}
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="pickSetChoice"
                        value="existing"
                        checked={conflictResolution.selectedPickSet === 'existing'}
                        onChange={(e) => setConflictResolution(prev => prev ? {
                          ...prev,
                          selectedPickSet: e.target.value as 'new' | 'existing'
                        } : null)}
                      />
                    </div>
                    {existing.picks && existing.picks.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs font-medium text-charcoal-700 mb-2">PICK DETAILS:</div>
                        <div className="space-y-1">
                          {existing.picks.map((pick, pickIndex) => (
                            <div key={pickIndex} className="flex justify-between items-center text-xs bg-white rounded px-2 py-1">
                              <div className="flex items-center space-x-2">
                                <span className={`font-medium ${
                                  pick.is_lock ? 'text-amber-600' : 'text-charcoal-700'
                                }`}>
                                  {pick.is_lock ? '🔒' : '🏈'} {pick.away_team} @ {pick.home_team}
                                </span>
                                <span className="text-charcoal-600">→ {pick.selected_team}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                {pick.result && (
                                  <span className={`font-bold ${
                                    pick.result === 'win' ? 'text-green-600' : 
                                    pick.result === 'loss' ? 'text-red-600' : 'text-yellow-600'
                                  }`}>
                                    {pick.result === 'win' ? '✅' : pick.result === 'loss' ? '❌' : '🟡'}
                                  </span>
                                )}
                                {pick.points_earned !== null && (
                                  <span className={`font-medium ${
                                    pick.points_earned > 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {pick.points_earned}pts
                                  </span>
                                )}
                                {pick.result === null && pick.points_earned === null && (
                                  <span className="text-gray-500">pending</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {existing.picks.some(p => p.result !== null) && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <div className="text-xs text-charcoal-600">
                              Total Points: <span className="font-bold">
                                {existing.picks.reduce((sum, pick) => sum + (pick.points_earned || 0), 0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <div className="border rounded p-3 bg-blue-50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">🆕 New Anonymous Pick Set</div>
                      <div className="text-sm text-charcoal-600">
                        {conflictResolution.pickSet.picks.length} picks • {new Date(conflictResolution.pickSet.submittedAt).toLocaleString()}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="pickSetChoice"
                      value="new"
                      checked={conflictResolution.selectedPickSet === 'new'}
                      onChange={(e) => setConflictResolution(prev => prev ? {
                        ...prev,
                        selectedPickSet: e.target.value as 'new' | 'existing'
                      } : null)}
                    />
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="text-xs font-medium text-blue-700 mb-2">NEW PICK DETAILS:</div>
                    <div className="space-y-1">
                      {conflictResolution.pickSet.picks.map((pick, pickIndex) => {
                        // Use team names directly from the pick object
                        return (
                          <div key={pickIndex} className="flex justify-between items-center text-xs bg-white rounded px-2 py-1">
                            <div className="flex items-center space-x-2">
                              <span className={`font-medium ${
                                pick.is_lock ? 'text-amber-600' : 'text-charcoal-700'
                              }`}>
                                {pick.is_lock ? '🔒' : '🏈'} {pick.away_team} @ {pick.home_team}
                              </span>
                              <span className="text-charcoal-600">→ {pick.selected_team}</span>
                            </div>
                            <div className="text-gray-500">
                              new pick
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => confirmAssignment(
                    conflictResolution.pickSet,
                    conflictResolution.assignedUserId,
                    conflictResolution.selectedPickSet
                  )}
                  className="flex-1"
                >
                  Confirm Assignment
                </Button>
                <Button
                  onClick={() => setConflictResolution(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View All Sets Dialog */}
      {viewAllSetsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>📊 All Pick Sets for {viewAllSetsDialog.userName} ({viewAllSetsDialog.userEmail})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="font-semibold text-blue-800 mb-2">
                  Found {viewAllSetsDialog.allSets.length} pick sets for this user
                </div>
                <div className="text-blue-700 text-sm">
                  Review all pick sets to understand which one should count toward the leaderboard.
                </div>
              </div>

              <div className="space-y-3">
                {viewAllSetsDialog.allSets.map((set, index) => (
                  <div key={index} className={`border rounded p-4 ${
                    set.source === 'new_anonymous' ? 'bg-green-50 border-green-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-medium">
                          {set.source === 'authenticated' ? '🔐 Authenticated Picks' : 
                           set.source === 'anonymous' ? '👤 Other Anonymous Picks' : 
                           '🆕 Current Anonymous Picks'}
                          {set.source === 'new_anonymous' && ' (Currently Assigned)'}
                        </div>
                        <div className="text-sm text-charcoal-600">
                          {set.pickCount} picks • Submitted: {new Date(set.submittedAt).toLocaleString()}
                        </div>
                        {'picks' in set && set.picks && set.picks.some(p => p.result !== null) && (
                          <div className="text-sm font-medium text-blue-600 mt-1">
                            Total Points: {set.picks.reduce((sum, pick) => sum + (pick.points_earned || 0), 0)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Display picks for existing sets with results */}
                    {'picks' in set && set.picks && set.picks.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-charcoal-700 mb-2">PICK DETAILS:</div>
                        <div className="grid gap-2">
                          {set.picks.map((pick, pickIndex) => (
                            <div key={pickIndex} className="text-sm bg-white p-2 rounded border flex justify-between items-center">
                              <div className="flex-1">
                                <div className="font-medium flex items-center gap-2">
                                  {pick.is_lock && <Badge className="text-xs bg-amber-500">LOCK</Badge>}
                                  {pick.away_team} @ {pick.home_team}
                                </div>
                                <div className="text-charcoal-600">
                                  Pick: <span className="font-medium">{pick.selected_team}</span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {pick.result && (
                                  <span className={`font-bold text-lg ${
                                    pick.result === 'win' ? 'text-green-600' : 
                                    pick.result === 'loss' ? 'text-red-600' : 'text-yellow-600'
                                  }`}>
                                    {pick.result === 'win' ? '✅' : pick.result === 'loss' ? '❌' : '🟡'}
                                  </span>
                                )}
                                {pick.points_earned !== null && (
                                  <span className={`font-bold ${
                                    pick.points_earned > 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {pick.points_earned}pts
                                  </span>
                                )}
                                {pick.result === null && pick.points_earned === null && (
                                  <span className="text-gray-500 text-xs">pending</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Display picks for new anonymous sets */}
                    {set.source === 'new_anonymous' && 'pickSet' in set && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-green-700 mb-2">NEW PICK DETAILS:</div>
                        <div className="grid gap-2">
                          {set.pickSet.picks.map(pick => {
                            // Use team names directly from the pick object
                            return (
                              <div key={pick.id} className="text-sm bg-white p-2 rounded border flex justify-between items-center">
                                <div className="flex-1">
                                  <div className="font-medium flex items-center gap-2">
                                    {pick.is_lock && <Badge className="text-xs bg-amber-500">LOCK</Badge>}
                                    {pick.away_team} @ {pick.home_team}
                                  </div>
                                  <div className="text-charcoal-600">
                                    Pick: <span className="font-medium">{pick.selected_team}</span>
                                  </div>
                                </div>
                                <div className="text-green-600 text-xs font-medium">
                                  new pick
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => setViewAllSetsDialog(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {pickSets.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-lg font-semibold mb-2">No Anonymous Pick Sets Found</h3>
            <p className="text-charcoal-600">
              No anonymous pick sets found for Week {selectedWeek}, {selectedSeason}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}