import { supabase } from '@/lib/supabase'
import { User } from '@/types'

export class EnhancedAuthService {
  /**
   * Resolve an email to its primary user ID using the database function
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
   * Get user profile by primary user ID
   */
  static async getUserProfile(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('user_status', 'active')
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Exception fetching user profile:', error)
      return null
    }
  }

  /**
   * Enhanced login that always resolves to primary user ID
   */
  static async signInWithEmail(email: string, password: string): Promise<{
    success: boolean
    user: User | null
    error: string | null
    primaryUserId: string | null
  }> {
    try {
      // First, attempt normal Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password
      })

      if (error) {
        return {
          success: false,
          user: null,
          error: error.message,
          primaryUserId: null
        }
      }

      if (!data.user) {
        return {
          success: false,
          user: null,
          error: 'No user returned from authentication',
          primaryUserId: null
        }
      }

      // Resolve to primary user ID
      const primaryUserId = await this.resolvePrimaryUserId(email)
      
      if (!primaryUserId) {
        return {
          success: false,
          user: null,
          error: 'Could not resolve user to primary account',
          primaryUserId: null
        }
      }

      // Get the primary user profile
      const userProfile = await this.getUserProfile(primaryUserId)

      if (!userProfile) {
        return {
          success: false,
          user: null,
          error: 'Could not load user profile',
          primaryUserId
        }
      }

      return {
        success: true,
        user: userProfile,
        error: null,
        primaryUserId
      }
    } catch (error: any) {
      return {
        success: false,
        user: null,
        error: error.message || 'An unexpected error occurred',
        primaryUserId: null
      }
    }
  }

  /**
   * Enhanced session initialization that resolves to primary user
   */
  static async initializeSession(): Promise<{
    user: User | null
    primaryUserId: string | null
  }> {
    try {
      // Get current Supabase session
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error)
        return { user: null, primaryUserId: null }
      }

      if (!session?.user?.email) {
        return { user: null, primaryUserId: null }
      }

      // Resolve to primary user ID
      const primaryUserId = await this.resolvePrimaryUserId(session.user.email)

      if (!primaryUserId) {
        console.warn('Could not resolve session user to primary user ID:', session.user.email)
        return { user: null, primaryUserId: null }
      }

      // Get primary user profile
      const userProfile = await this.getUserProfile(primaryUserId)

      return {
        user: userProfile,
        primaryUserId
      }
    } catch (error) {
      console.error('Exception initializing session:', error)
      return { user: null, primaryUserId: null }
    }
  }

  /**
   * Magic link sign in that resolves to primary user
   */
  static async signInWithMagicLink(email: string): Promise<{
    success: boolean
    error: string | null
  }> {
    try {
      // Send magic link
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`
        }
      })

      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return {
        success: true,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send magic link'
      }
    }
  }

  /**
   * Handle auth callback and resolve to primary user
   */
  static async handleAuthCallback(): Promise<{
    user: User | null
    primaryUserId: string | null
    error: string | null
  }> {
    try {
      // Get the current session after callback
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        return {
          user: null,
          primaryUserId: null,
          error: error.message
        }
      }

      if (!session?.user?.email) {
        return {
          user: null,
          primaryUserId: null,
          error: 'No user session found'
        }
      }

      // Resolve to primary user
      const primaryUserId = await this.resolvePrimaryUserId(session.user.email)

      if (!primaryUserId) {
        return {
          user: null,
          primaryUserId: null,
          error: 'Could not resolve to primary user account'
        }
      }

      const userProfile = await this.getUserProfile(primaryUserId)

      return {
        user: userProfile,
        primaryUserId,
        error: null
      }
    } catch (error: any) {
      return {
        user: null,
        primaryUserId: null,
        error: error.message || 'Auth callback failed'
      }
    }
  }

  /**
   * Get all emails associated with a primary user
   */
  static async getUserEmails(userId: string): Promise<{
    email: string
    emailType: string
    isPrimary: boolean
    isVerified: boolean
  }[]> {
    try {
      const { data, error } = await supabase
        .from('user_emails')
        .select('email, email_type, is_primary, is_verified')
        .eq('user_id', userId)
        .order('is_primary_user_email', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching user emails:', error)
        return []
      }

      return (data || []).map(row => ({
        email: row.email,
        emailType: row.email_type,
        isPrimary: row.is_primary,
        isVerified: row.is_verified
      }))
    } catch (error) {
      console.error('Exception fetching user emails:', error)
      return []
    }
  }

  /**
   * Check if a user needs to be consolidated (has multiple accounts)
   */
  static async checkForMultipleAccounts(email: string): Promise<{
    hasMultipleAccounts: boolean
    accounts: User[]
    recommendedPrimary: User | null
  }> {
    try {
      // Find all potential accounts for this email
      const { data, error } = await supabase
        .from('user_emails')
        .select(`
          user_id,
          email,
          is_primary_user_email,
          created_at,
          users!inner(*)
        `)
        .eq('email', email.toLowerCase().trim())

      if (error) {
        console.error('Error checking for multiple accounts:', error)
        return {
          hasMultipleAccounts: false,
          accounts: [],
          recommendedPrimary: null
        }
      }

      const accounts = (data || []).map((row: any) => row.users).filter((user: User) => user.user_status === 'active')
      
      if (accounts.length <= 1) {
        return {
          hasMultipleAccounts: false,
          accounts,
          recommendedPrimary: accounts[0] || null
        }
      }

      // Find the recommended primary (oldest account or one marked as primary)
      const primaryAccount = accounts.find((account: User) => 
        data?.find((row: any) => row.user_id === account.id && row.is_primary_user_email)
      ) || accounts.sort((a: User, b: User) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]

      return {
        hasMultipleAccounts: true,
        accounts,
        recommendedPrimary: primaryAccount
      }
    } catch (error) {
      console.error('Exception checking for multiple accounts:', error)
      return {
        hasMultipleAccounts: false,
        accounts: [],
        recommendedPrimary: null
      }
    }
  }

  /**
   * Sign out and clear all auth state
   */
  static async signOut(): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        return {
          success: false,
          error: error.message
        }
      }

      return {
        success: true,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Sign out failed'
      }
    }
  }
}