/**
 * Magic Link Authentication Service
 * Handles secure token generation, storage, and verification for magic link authentication
 */

import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import { findUserByAnyEmail } from '@/utils/userMatching'

interface MagicLinkToken {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

export class MagicLinkService {
  /**
   * Generate a secure random token
   */
  private static generateSecureToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Store magic link token in database
   */
  private static async storeMagicToken(
    email: string,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      // First, clean up any expired tokens for this email
      await supabase
        .from('magic_link_tokens')
        .delete()
        .eq('email', email)
        .or('expires_at.lt.now(),used.eq.true')

      // Store the new token
      const { error } = await supabase
        .from('magic_link_tokens')
        .insert({
          email,
          token,
          expires_at: expiresAt.toISOString(),
          used: false
        })

      if (error) {
        console.error('Error storing magic token:', error)
        if (error.message?.includes('relation "magic_link_tokens" does not exist')) {
          throw new Error('Magic link system not fully configured. Please run database migration.')
        }
        throw new Error('Failed to generate magic link')
      }
    } catch (error: any) {
      console.error('Exception storing magic token:', error)
      if (error.message?.includes('Magic link system not fully configured')) {
        throw error
      }
      throw new Error('Database error while generating magic link')
    }
  }

  /**
   * Send magic link email
   */
  static async sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔮 Generating magic link for ${email}`)

      // Check if user exists by email
      console.log(`🔍 Looking up user in database...`)
      const existingUser = await findUserByAnyEmail(email)
      
      console.log(`📊 User lookup result:`, existingUser ? `Found: ${existingUser.display_name}` : 'Not found')
      
      if (!existingUser) {
        // Don't reveal whether email exists or not for security, but log it
        console.log(`🔮 Email ${email} not found in database, returning success for security`)
        console.log(`ℹ️ If this is your email and you should have access, check your user record in Supabase`)
        return { success: true }
      }

      console.log(`👤 Found user: ${existingUser.display_name} (${existingUser.id})`)

      // Generate secure token
      const token = this.generateSecureToken()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

      console.log(`🔐 Generated token, expires at: ${expiresAt.toISOString()}`)

      // Store token in database
      console.log(`💾 Storing magic link token in database...`)
      await this.storeMagicToken(email, token, expiresAt)
      console.log(`✅ Token stored successfully`)

      // Send email via Resend
      console.log(`📧 Sending magic link email...`)
      const emailResult = await EmailService.sendMagicLink(
        email,
        existingUser.display_name,
        token
      )

      if (!emailResult.success) {
        console.error(`❌ Email send failed:`, emailResult.error)
        throw new Error(emailResult.error || 'Failed to send magic link email')
      }

      console.log(`✅ Magic link sent successfully to ${email}`)
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error sending magic link:', error)
      console.error('❌ Error details:', error.message)
      console.error('❌ Stack trace:', error.stack)
      return { success: false, error: error.message }
    }
  }

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