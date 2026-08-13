/**
 * Magic Link Authentication Service
 * Verifies magic link tokens and signs the user in.
 */

import { supabase } from '@/lib/supabase'
import { findUserByAnyEmail } from '@/utils/userMatching'

export class MagicLinkService {
  // Removed: sendMagicLink, and the storeMagicToken / generateSecureToken
  // helpers that only it used.
  //
  // Nothing called it — MagicLoginPage, the only consumer of this service, uses
  // verifyMagicLink alone — so no magic link has been generated in a long time
  // and magic_link_tokens is empty in production. It sent by queueing a
  // client-rendered body into email_jobs, which migrations 201/202 no longer
  // permit.
  //
  // NOTE: with generation gone, verifyMagicLink below and the routed
  // /magic-login page can only ever report an invalid token. Either finish the
  // feature (a server-side queue_magic_link RPC, matching the pick-confirmation
  // shape) or drop the route and this service with it.

  /**
   * Verify magic link token and sign in user
   */
  static async verifyMagicLink(token: string): Promise<{
    success: boolean
    error?: string
    user?: any
  }> {
    try {
      console.log(`🔮 Verifying magic link token`)

      // Find the token in database
      const { data: tokenData, error: tokenError } = await supabase
        .from('magic_link_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (tokenError || !tokenData) {
        console.error('❌ Invalid or expired magic link token')
        return { success: false, error: 'Invalid or expired magic link. Please request a new one.' }
      }

      // Mark token as used
      await supabase
        .from('magic_link_tokens')
        .update({ used: true })
        .eq('token', token)

      // Find user by email
      const existingUser = await findUserByAnyEmail(tokenData.email)
      
      if (!existingUser) {
        console.error('❌ User not found for magic link email:', tokenData.email)
        return { success: false, error: 'User account not found.' }
      }

      // Check if user has a Supabase auth account
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const authUser = authUsers.users.find(u => u.email === tokenData.email)

      if (!authUser) {
        console.log('🔮 Creating temporary session for user without auth account')
        // For users without Supabase auth accounts, we'll create a temporary session
        // This is a simplified approach - in production you might want to create the auth account
        return {
          success: true,
          user: existingUser
        }
      }

      // Create a session for the existing auth user
      console.log('🔮 Creating session for existing auth user:', authUser.id)
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: tokenData.email,
      })

      if (sessionError) {
        console.error('❌ Error generating session for magic link:', sessionError)
        return { success: false, error: 'Failed to create authentication session.' }
      }

      console.log('✅ Magic link verification successful')
      return {
        success: true,
        user: existingUser
      }

    } catch (error: any) {
      console.error('❌ Error verifying magic link:', error)
      return { success: false, error: 'Failed to verify magic link.' }
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const { error } = await supabase
        .from('magic_link_tokens')
        .delete()
        .lt('expires_at', new Date().toISOString())

      if (error) {
        console.error('Error cleaning up expired tokens:', error)
      } else {
        console.log('✅ Cleaned up expired magic link tokens')
      }
    } catch (error) {
      console.error('Error in token cleanup:', error)
    }
  }
}