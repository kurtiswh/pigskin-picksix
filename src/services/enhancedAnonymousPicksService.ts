import { supabase } from '@/lib/supabase'
import { User } from '@/types'

export interface PickSetConflict {
  sourceType: 'authenticated' | 'anonymous'
  pickSetId: string
  submittedAt: string
  pickCount: number
  isActive: boolean
  totalPoints: number
  pickDetails: {
    id: string
    gameId: string
    selectedTeam: string
    isLock: boolean
    result: 'win' | 'loss' | 'push' | null
    pointsEarned: number | null
    homeTeam: string
    awayTeam: string
    email?: string
    validationStatus?: string
    showOnLeaderboard?: boolean
  }[]
}

export interface ValidationResult {
  canAssign: boolean
  conflicts: PickSetConflict[]
  paymentStatus: {
    isPaid: boolean
    status: string
    canShowOnLeaderboard: boolean
  }
  recommendedAction: 'assign_immediately' | 'show_conflicts' | 'payment_required'
  primaryUserId: string
  notes: string
}

export interface PaymentInfo {
  isPaid: boolean
  status: string
  season: number
  isMatched: boolean
}

export class EnhancedAnonymousPicksService {
  /**
   * Resolve an email to its primary/canonical user ID
   */
  static async resolvePrimaryUserId(email: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('resolve_primary_user_id', { search_email: email.toLowerCase().trim() })

      if (error) {
        console.error('Error resolving primary user ID:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Exception resolving primary user ID:', error)
      return null
    }
  }

  /**
   * Find all pick sets for a user across both authenticated and anonymous picks
   */
  static async findAllUserPickSets(
    userId: string,
    week: number,
    season: number
  ): Promise<PickSetConflict[]> {
    try {
      const { data, error } = await supabase
        .rpc('find_all_user_pick_sets', {
          target_user_id: userId,
          target_week: week,
          target_season: season
        })

      if (error) {
        console.error('Error finding user pick sets:', error)
        return []
      }

      return (data || []).map((row: any) => ({
        sourceType: row.source_type,
        pickSetId: row.pick_set_id,
        submittedAt: row.submitted_at,
        pickCount: row.pick_count,
        isActive: row.is_active,
        totalPoints: row.total_points,
        pickDetails: row.pick_details.map((pick: any) => ({
          id: pick.id,
          gameId: pick.game_id,
          selectedTeam: pick.selected_team,
          isLock: pick.is_lock,
          result: pick.result,
          pointsEarned: pick.points_earned,
          homeTeam: pick.home_team,
          awayTeam: pick.away_team,
          email: pick.email,
          validationStatus: pick.validation_status,
          showOnLeaderboard: pick.show_on_leaderboard
        }))
      }))
    } catch (error) {
      console.error('Exception finding user pick sets:', error)
      return []
    }
  }

  /**
   * Get comprehensive payment information for a user
   * Checks both the primary user and any associated emails/users for payment
   */
  static async getUserPaymentInfo(userId: string, season: number): Promise<PaymentInfo> {
    try {
      console.log(`Checking payment info for user ${userId}, season ${season}`)
      
      // First, try direct lookup by user ID
      const { data: directPayment, error: directError } = await supabase
        .from('leaguesafe_payments')
        .select('status, is_matched, season, user_id')
        .eq('user_id', userId)
        .eq('season', season)
        .single()

      if (directPayment && !directError) {
        console.log('Found direct payment:', directPayment)
        return {
          isPaid: directPayment.status === 'Paid' && directPayment.is_matched === true,
          status: directPayment.status,
          season: directPayment.season,
          isMatched: directPayment.is_matched
        }
      }

      console.log('No direct payment found, checking associated emails...')

      // If no direct payment found, check all associated emails for this user
      const { data: userEmails, error: emailError } = await supabase
        .from('user_emails')
        .select('email')
        .eq('user_id', userId)

      if (emailError) {
        console.error('Error getting user emails:', emailError)
      }

      // Also get the user's primary email from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email, leaguesafe_email')
        .eq('id', userId)
        .single()

      if (userError) {
        console.error('Error getting user data:', userError)
      }

      // Collect all possible emails
      const allEmails = new Set<string>()
      if (userData?.email) allEmails.add(userData.email.toLowerCase().trim())
      if (userData?.leaguesafe_email) allEmails.add(userData.leaguesafe_email.toLowerCase().trim())
      
      userEmails?.forEach(ue => {
        if (ue.email) allEmails.add(ue.email.toLowerCase().trim())
      })

      console.log('Checking payment for emails:', Array.from(allEmails))

      // Check payments for any users with these emails
      if (allEmails.size > 0) {
        const { data: paymentsByEmail, error: paymentError } = await supabase
          .from('leaguesafe_payments')
          .select(`
            status, 
            is_matched, 
            season,
            user_id,
            users!inner(email, leaguesafe_email, display_name)
          `)
          .eq('season', season)

        if (!paymentError && paymentsByEmail) {
          console.log('All payments for season:', paymentsByEmail)
          console.log('Looking for payments with emails:', Array.from(allEmails))
          
          // Find payments where the user's email matches any of our emails
          const matchingPayments = paymentsByEmail.filter(payment => {
            const userEmail = payment.users.email?.toLowerCase().trim()
            const leaguesafeEmail = payment.users.leaguesafe_email?.toLowerCase().trim()
            
            console.log(`Checking payment for user ${payment.users.display_name}:`)
            console.log(`  - User email: ${userEmail}`)
            console.log(`  - Leaguesafe email: ${leaguesafeEmail}`)
            console.log(`  - Matches our emails: ${(userEmail && allEmails.has(userEmail)) || (leaguesafeEmail && allEmails.has(leaguesafeEmail))}`)
            
            return (userEmail && allEmails.has(userEmail)) || 
                   (leaguesafeEmail && allEmails.has(leaguesafeEmail))
          })

          console.log('Matching payments:', matchingPayments)

          if (matchingPayments.length > 0) {
            // Take the best payment status (prefer Paid over Pending, etc.)
            const bestPayment = matchingPayments.find(p => p.status === 'Paid' && p.is_matched) ||
                               matchingPayments.find(p => p.status === 'Paid') ||
                               matchingPayments[0]

            console.log('Best payment found:', bestPayment)
            return {
              isPaid: bestPayment.status === 'Paid' && bestPayment.is_matched === true,
              status: bestPayment.status,
              season: bestPayment.season,
              isMatched: bestPayment.is_matched
            }
          }
        }
      }

      // As a last resort, check if there's a user with similar display name that has payment
      console.log('No payment found via email matching, checking for similar display names...')
      
      // Get the user's display name to look for similar users
      if (userData?.display_name) {
        const displayName = userData.display_name.toLowerCase().trim()
        console.log(`Looking for similar users to "${displayName}"`)
        
        const { data: similarUsers, error: similarError } = await supabase
          .from('leaguesafe_payments')
          .select(`
            status,
            is_matched,
            season,
            user_id,
            users!inner(display_name, email, leaguesafe_email)
          `)
          .eq('season', season)
        
        if (!similarError && similarUsers) {
          const nameWords = displayName.split(/\s+/).filter(word => word.length > 2)
          console.log('Name words to match:', nameWords)
          
          const possibleMatches = similarUsers.filter(payment => {
            const paymentUserName = payment.users.display_name?.toLowerCase().trim()
            if (!paymentUserName) return false
            
            // Check if all significant words from our user appear in payment user name
            const matchesName = nameWords.every(word => 
              paymentUserName.includes(word) || 
              paymentUserName.replace(/\s+/g, '').includes(word)
            )
            
            if (matchesName) {
              console.log(`Possible name match found: "${paymentUserName}" vs "${displayName}"`)
              console.log(`  - Payment user email: ${payment.users.email}`)
              console.log(`  - Payment user leaguesafe: ${payment.users.leaguesafe_email}`)
            }
            
            return matchesName
          })
          
          if (possibleMatches.length > 0) {
            console.log('Found possible payment matches by name:', possibleMatches)
            const bestMatch = possibleMatches.find(p => p.status === 'Paid' && p.is_matched) ||
                             possibleMatches.find(p => p.status === 'Paid') ||
                             possibleMatches[0]
            
            console.log('Best name-based match:', bestMatch)
            return {
              isPaid: bestMatch.status === 'Paid' && bestMatch.is_matched === true,
              status: bestMatch.status + ' (found by name match)',
              season: bestMatch.season,
              isMatched: bestMatch.is_matched
            }
          }
        }
      }

      console.log('No payment found for any associated emails or similar names')
      return { isPaid: false, status: 'Not Found', season, isMatched: false }

    } catch (error: any) {
      console.error('Exception getting payment info:', error)
      return { isPaid: false, status: 'Error', season, isMatched: false }
    }
  }

  /**
   * Comprehensive validation for anonymous pick assignment
   */
  static async validateAnonymousPickAssignment(
    email: string,
    week: number,
    season: number,
    forceUserId?: string // Allow admin to override user resolution
  ): Promise<ValidationResult> {
    try {
      console.log(`Starting validation for ${email}, week ${week}, season ${season}`)
      
      // Step 1: Resolve primary user ID
      const primaryUserId = forceUserId || await this.resolvePrimaryUserId(email)
      console.log('Resolved primary user ID:', primaryUserId)
      
      if (!primaryUserId) {
        console.log('No primary user ID found')
        return {
          canAssign: false,
          conflicts: [],
          paymentStatus: { isPaid: false, status: 'No User Found', canShowOnLeaderboard: false },
          recommendedAction: 'show_conflicts',
          primaryUserId: '',
          notes: 'No user account found for this email address. Admin must manually create or assign a user.'
        }
      }

      // Step 2: Check for existing pick sets (conflicts)
      console.log('Checking for existing pick sets...')
      const existingPickSets = await this.findAllUserPickSets(primaryUserId, week, season)
      const hasConflicts = existingPickSets.length > 0
      console.log('Found conflicts:', hasConflicts, 'Pick sets:', existingPickSets.length)

      // Step 3: Get payment status
      console.log('Checking payment status...')
      const paymentInfo = await this.getUserPaymentInfo(primaryUserId, season)
      console.log('Payment info:', paymentInfo)

      // Step 4: Determine recommended action
      let recommendedAction: 'assign_immediately' | 'show_conflicts' | 'payment_required' = 'assign_immediately'
      let notes = ''

      if (!paymentInfo.isPaid) {
        recommendedAction = 'payment_required'
        notes = `User payment status: ${paymentInfo.status}. Cannot show on leaderboard by default.`
      } else if (hasConflicts) {
        recommendedAction = 'show_conflicts'
        notes = `Found ${existingPickSets.length} existing pick set(s) for this user. Admin must choose which to keep active.`
      } else {
        notes = 'No conflicts found. User is paid. Safe to assign and add to leaderboard.'
      }

      return {
        canAssign: true,
        conflicts: existingPickSets,
        paymentStatus: {
          isPaid: paymentInfo.isPaid,
          status: paymentInfo.status,
          canShowOnLeaderboard: paymentInfo.isPaid
        },
        recommendedAction,
        primaryUserId,
        notes
      }
    } catch (error) {
      console.error('Error in validation:', error)
      return {
        canAssign: false,
        conflicts: [],
        paymentStatus: { isPaid: false, status: 'Validation Error', canShowOnLeaderboard: false },
        recommendedAction: 'show_conflicts',
        primaryUserId: '',
        notes: `Validation error: ${error.message}`
      }
    }
  }

  /**
   * Get users that might be duplicates based on email patterns
   */
  static async findPotentialDuplicateUsers(email: string): Promise<User[]> {
    try {
      // Get the base email (without +tags) and domain
      const cleanEmail = email.toLowerCase().trim()
      const [localPart, domain] = cleanEmail.split('@')
      const baseLocal = localPart.split('+')[0] // Remove +tags
      
      // Search for similar emails
      const { data, error } = await supabase
        .from('user_emails')
        .select(`
          user_id,
          email,
          users!inner(*)
        `)
        .or(`email.ilike.%${baseLocal}%,email.ilike.%${domain}%`)
        .limit(20)

      if (error) {
        console.error('Error finding potential duplicates:', error)
        return []
      }

      // Deduplicate and return user records
      const userMap = new Map<string, User>()
      
      for (const row of data || []) {
        const user = (row as any).users
        if (!userMap.has(user.id) && user.user_status === 'active') {
          userMap.set(user.id, user)
        }
      }

      return Array.from(userMap.values())
    } catch (error) {
      console.error('Exception finding potential duplicates:', error)
      return []
    }
  }

  /**
   * Consolidate a secondary user under a primary user
   */
  static async consolidateUserUnderPrimary(
    secondaryUserId: string,
    primaryUserId: string,
    consolidatedBy: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('consolidate_user_under_primary', {
          secondary_user_id: secondaryUserId,
          primary_user_id: primaryUserId,
          consolidated_by: consolidatedBy
        })

      if (error) {
        console.error('Error consolidating user:', error)
        throw error
      }

      return data === true
    } catch (error) {
      console.error('Exception consolidating user:', error)
      throw error
    }
  }

  /**
   * Force assign anonymous picks to a specific user with validation status update
   */
  static async forceAssignAnonymousPicksToUser(
    anonymousPickIds: string[],
    userId: string,
    showOnLeaderboard: boolean,
    validationStatus: 'manually_validated' | 'duplicate_conflict' = 'manually_validated',
    notes?: string
  ): Promise<boolean> {
    try {
      // Update all picks in the set
      for (const pickId of anonymousPickIds) {
        const { error } = await supabase
          .from('anonymous_picks')
          .update({
            assigned_user_id: userId,
            show_on_leaderboard: showOnLeaderboard,
            validation_status: validationStatus,
            processing_notes: notes || `Manually assigned by admin - ${new Date().toISOString()}`
          })
          .eq('id', pickId)

        if (error) {
          console.error(`Error updating pick ${pickId}:`, error)
          
          // If the error is about 'mixed' constraint, provide helpful message
          if (error.code === '23514' && error.message?.includes('pick_source')) {
            console.error('Database constraint error: The pick_source constraint needs updating.')
            console.error('Please run migration 114_fix_pick_source_constraint.sql to allow mixed pick sources.')
            throw new Error('Database constraint error: Please apply migration 114 to allow mixed pick sources.')
          }
          
          throw error
        }
      }

      return true
    } catch (error: any) {
      console.error('Exception force assigning picks:', error)
      throw error
    }
  }

  /**
   * Set pick set precedence - mark one pick set as active, others as inactive
   */
  static async setPickSetPrecedence(
    userId: string,
    week: number,
    season: number,
    activePickSetId: string,
    activePickSetType: 'authenticated' | 'anonymous'
  ): Promise<boolean> {
    try {
      // First, get all pick sets for this user
      const allPickSets = await this.findAllUserPickSets(userId, week, season)
      
      for (const pickSet of allPickSets) {
        const isActiveSet = pickSet.pickSetId === activePickSetId && pickSet.sourceType === activePickSetType
        
        if (pickSet.sourceType === 'anonymous') {
          // Update anonymous picks
          const pickIds = pickSet.pickDetails.map(p => p.id)
          for (const pickId of pickIds) {
            const { error } = await supabase
              .from('anonymous_picks')
              .update({
                show_on_leaderboard: isActiveSet,
                processing_notes: isActiveSet 
                  ? 'Set as active pick set by admin'
                  : 'Set as inactive pick set by admin'
              })
              .eq('id', pickId)

            if (error) throw error
          }
        } else if (pickSet.sourceType === 'authenticated') {
          // For authenticated picks, we can't change their submitted status,
          // but we can add a note in the system about precedence
          // This would require a new column in picks table or handling in leaderboard logic
          console.log(`Authenticated pick set ${pickSet.pickSetId} precedence: ${isActiveSet ? 'active' : 'inactive'}`)
        }
      }

      return true
    } catch (error) {
      console.error('Exception setting pick set precedence:', error)
      throw error
    }
  }

  /**
   * Get validation summary for admin dashboard
   */
  static async getValidationSummary(week: number, season: number) {
    try {
      const { data, error } = await supabase
        .from('anonymous_picks')
        .select(`
          validation_status,
          assigned_user_id,
          show_on_leaderboard,
          email,
          name
        `)
        .eq('week', week)
        .eq('season', season)

      if (error) throw error

      const summary = {
        total: data?.length || 0,
        pendingValidation: 0,
        autoValidated: 0,
        manuallyValidated: 0,
        duplicateConflicts: 0,
        unassigned: 0,
        assignedButHidden: 0,
        onLeaderboard: 0
      }

      for (const pick of data || []) {
        switch (pick.validation_status) {
          case 'pending_validation':
            summary.pendingValidation++
            break
          case 'auto_validated':
            summary.autoValidated++
            break
          case 'manually_validated':
            summary.manuallyValidated++
            break
          case 'duplicate_conflict':
            summary.duplicateConflicts++
            break
        }

        if (!pick.assigned_user_id) {
          summary.unassigned++
        } else if (!pick.show_on_leaderboard) {
          summary.assignedButHidden++
        } else {
          summary.onLeaderboard++
        }
      }

      return summary
    } catch (error) {
      console.error('Exception getting validation summary:', error)
      throw error
    }
  }
}