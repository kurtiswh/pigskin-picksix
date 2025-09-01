import { supabase } from '@/lib/supabase'
import { User, UserEmail } from '@/types'

export interface UserMergeHistory {
  id: string
  target_user_id: string
  source_user_id: string
  source_user_email: string
  source_user_display_name: string
  merged_by: string
  merge_type: 'full' | 'partial' | 'email_only'
  picks_merged: number
  payments_merged: number
  anonymous_picks_merged: number
  emails_merged: number
  conflicts_detected: boolean
  conflict_resolution?: any
  merge_reason?: string
  notes?: string
  merged_at: string
}

export interface MergeResult {
  success: boolean
  picks_merged: number
  payments_merged: number
  anonymous_picks_merged: number
  emails_merged: number
  conflicts_detected: boolean
  conflict_details?: any[]
}

export interface MergeConflict {
  type: 'picks' | 'payments' | 'emails'
  details: {
    week?: number
    season?: number
    description: string
  }
}

export class UserMergeService {
  /**
   * Search for users by email to find potential merge candidates
   */
  static async searchUsersByEmail(email: string): Promise<User[]> {
    try {
      // First search in main users table
      const { data: mainUsers, error: mainError } = await supabase
        .from('users')
        .select('*')
        .ilike('email', `%${email}%`)
        .limit(10)

      if (mainError) throw mainError

      // Then search in user_emails table
      const { data: emailMatches, error: emailError } = await supabase
        .from('user_emails')
        .select(`
          user_id,
          email,
          users!inner(*)
        `)
        .ilike('email', `%${email}%`)
        .limit(10)

      if (emailError) throw emailError

      // Combine and deduplicate results
      const allUsers = [...(mainUsers || [])]
      
      if (emailMatches) {
        for (const match of emailMatches) {
          const user = (match as any).users
          if (!allUsers.find(u => u.id === user.id)) {
            allUsers.push(user)
          }
        }
      }

      return allUsers
    } catch (error) {
      console.error('Error searching users by email:', error)
      throw error
    }
  }

  /**
   * Get all emails for a user
   */
  static async getUserEmails(userId: string): Promise<UserEmail[]> {
    try {
      const { data, error } = await supabase
        .from('user_emails')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error getting user emails:', error)
      throw error
    }
  }

  /**
   * Preview what would happen in a merge without actually merging
   */
  static async previewMerge(sourceUserId: string, targetUserId: string): Promise<{
    conflicts: MergeConflict[]
    mergeable: {
      picks: number
      payments: number
      anonymousPicks: number
      emails: number
    }
  }> {
    try {
      const conflicts: MergeConflict[] = []
      const mergeable = {
        picks: 0,
        payments: 0,
        anonymousPicks: 0,
        emails: 0
      }

      // Check picks conflicts
      const { data: picksConflicts } = await supabase
        .from('picks')
        .select('week, season')
        .eq('user_id', sourceUserId)
        .in('week, season', 
          supabase
            .from('picks')
            .select('week, season')
            .eq('user_id', targetUserId)
        )

      if (picksConflicts && picksConflicts.length > 0) {
        for (const conflict of picksConflicts) {
          conflicts.push({
            type: 'picks',
            details: {
              week: conflict.week,
              season: conflict.season,
              description: `Both users have picks for Week ${conflict.week}, ${conflict.season}`
            }
          })
        }
      }

      // Count mergeable picks (non-conflicting)
      const { count: mergeablePicksCount } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sourceUserId)
        .not('week, season', 'in', 
          supabase
            .from('picks')
            .select('week, season')
            .eq('user_id', targetUserId)
        )

      mergeable.picks = mergeablePicksCount || 0

      // Check payments conflicts
      const { data: paymentsConflicts } = await supabase
        .from('leaguesafe_payments')
        .select('season')
        .eq('user_id', sourceUserId)
        .in('season',
          supabase
            .from('leaguesafe_payments')
            .select('season')
            .eq('user_id', targetUserId)
        )

      if (paymentsConflicts && paymentsConflicts.length > 0) {
        for (const conflict of paymentsConflicts) {
          conflicts.push({
            type: 'payments',
            details: {
              season: conflict.season,
              description: `Both users have payment records for ${conflict.season}`
            }
          })
        }
      }

      // Count mergeable payments
      const { count: mergeablePaymentsCount } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sourceUserId)

      mergeable.payments = mergeablePaymentsCount || 0

      // Count anonymous picks assignments
      const { count: anonymousPicksCount } = await supabase
        .from('anonymous_picks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_user_id', sourceUserId)

      mergeable.anonymousPicks = anonymousPicksCount || 0

      // Count mergeable emails
      const { count: emailsCount } = await supabase
        .from('user_emails')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sourceUserId)

      mergeable.emails = emailsCount || 0

      return { conflicts, mergeable }
    } catch (error) {
      console.error('Error previewing merge:', error)
      throw error
    }
  }

  /**
   * Execute the merge operation
   */
  static async mergeUsers(
    sourceUserId: string,
    targetUserId: string,
    mergedByUserId: string,
    mergeReason?: string,
    conflictResolution?: any
  ): Promise<MergeResult> {
    try {
      const { data, error } = await supabase.rpc('merge_users', {
        p_source_user_id: sourceUserId,
        p_target_user_id: targetUserId,
        p_merged_by_id: mergedByUserId,
        p_merge_reason: mergeReason || null,
        p_conflict_resolution: conflictResolution || {}
      })

      if (error) throw error

      return data as MergeResult
    } catch (error) {
      console.error('Error merging users:', error)
      throw error
    }
  }

  /**
   * Add an email to a user
   */
  static async addEmailToUser(
    userId: string,
    email: string,
    emailType: 'primary' | 'leaguesafe' | 'alternate' | 'merged' = 'alternate',
    addedByUserId?: string,
    notes?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('add_user_email', {
        p_user_id: userId,
        p_email: email.toLowerCase().trim(),
        p_email_type: emailType,
        p_added_by: addedByUserId || null,
        p_notes: notes || null
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error adding email to user:', error)
      throw error
    }
  }

  /**
   * Get merge history for a user
   */
  static async getUserMergeHistory(userId: string): Promise<UserMergeHistory[]> {
    try {
      const { data, error } = await supabase
        .from('user_merge_history')
        .select(`
          *,
          merged_by_user:users!user_merge_history_merged_by_fkey(display_name)
        `)
        .eq('target_user_id', userId)
        .order('merged_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error getting merge history:', error)
      throw error
    }
  }

  /**
   * Get users with similar display names or emails
   */
  static async findPotentialDuplicates(
    displayName?: string,
    email?: string,
    limit: number = 20
  ): Promise<User[]> {
    try {
      let query = supabase
        .from('users')
        .select('*')
        .limit(limit)

      if (displayName) {
        // Use trigram similarity for fuzzy matching on display names
        query = query.or(`display_name.ilike.%${displayName}%,email.ilike.%${displayName}%`)
      }

      if (email) {
        const emailDomain = email.split('@')[1]
        if (emailDomain) {
          query = query.or(`email.ilike.%${emailDomain}%`)
        }
      }

      const { data: users, error } = await query

      if (error) throw error

      // Also search in user_emails table
      if (email || displayName) {
        const emailQuery = displayName || email || ''
        const { data: emailUsers, error: emailError } = await supabase
          .from('user_emails')
          .select(`
            user_id,
            users!inner(*)
          `)
          .ilike('email', `%${emailQuery}%`)
          .limit(limit)

        if (emailError) throw emailError

        // Merge results and deduplicate
        const allUsers = [...(users || [])]
        if (emailUsers) {
          for (const emailUser of emailUsers) {
            const user = (emailUser as any).users
            if (!allUsers.find(u => u.id === user.id)) {
              allUsers.push(user)
            }
          }
        }
        
        return allUsers
      }

      return users || []
    } catch (error) {
      console.error('Error finding potential duplicates:', error)
      throw error
    }
  }

  /**
   * Remove an email from a user (only if not primary)
   */
  static async removeEmailFromUser(emailId: string): Promise<boolean> {
    try {
      // First check if it's a primary email
      const { data: email, error: fetchError } = await supabase
        .from('user_emails')
        .select('is_primary')
        .eq('id', emailId)
        .single()

      if (fetchError) throw fetchError

      if (email?.is_primary) {
        throw new Error('Cannot remove primary email address')
      }

      const { error } = await supabase
        .from('user_emails')
        .delete()
        .eq('id', emailId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error removing email from user:', error)
      throw error
    }
  }

  /**
   * Set an email as primary (and unset previous primary)
   */
  static async setPrimaryEmail(userId: string, emailId: string): Promise<boolean> {
    try {
      // Use a transaction to ensure consistency
      const { error } = await supabase.rpc('set_primary_email', {
        p_user_id: userId,
        p_email_id: emailId
      })

      if (error) {
        // If the RPC doesn't exist, do it manually with two queries
        // First, unset all primary flags for this user
        const { error: unsetError } = await supabase
          .from('user_emails')
          .update({ is_primary: false })
          .eq('user_id', userId)

        if (unsetError) throw unsetError

        // Then set the new primary
        const { error: setPrimaryError } = await supabase
          .from('user_emails')
          .update({ is_primary: true })
          .eq('id', emailId)
          .eq('user_id', userId)

        if (setPrimaryError) throw setPrimaryError
      }

      return true
    } catch (error) {
      console.error('Error setting primary email:', error)
      throw error
    }
  }
}