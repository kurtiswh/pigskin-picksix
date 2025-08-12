/**
 * Password Reset Service
 * Handles secure token generation, storage, and verification for password resets using Resend
 */

import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import { findUserByAnyEmail } from '@/utils/userMatching'

interface PasswordResetToken {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

export class PasswordResetService {
  /**
   * Generate a secure random token
   */
  private static generateSecureToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Store password reset token in database
   */
  private static async storeResetToken(
    email: string,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      // First, clean up any expired tokens for this email
      await supabase
        .from('password_reset_tokens')
        .delete()
        .eq('email', email)
        .or('expires_at.lt.now(),used.eq.true')

      // Store the new token
      const { error } = await supabase
        .from('password_reset_tokens')
        .insert({
          email,
          token,
          expires_at: expiresAt.toISOString(),
          used: false
        })

      if (error) {
        console.error('Error storing reset token:', error)
        if (error.message?.includes('relation "password_reset_tokens" does not exist')) {
          throw new Error('Password reset system not fully configured. Please run database migration.')
        }
        throw new Error('Failed to generate password reset token')
      }
    } catch (error: any) {
      console.error('Exception storing reset token:', error)
      if (error.message?.includes('Password reset system not fully configured')) {
        throw error
      }
      throw new Error('Database error while generating password reset token')
    }
  }

  /**
   * Send password reset email via Resend
   */
  static async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Generating password reset for ${email}`)

      // Check if user exists by email
      console.log(`🔍 Looking up user in database...`)
      
      const existingUser = await findUserByAnyEmail(email)
      
      console.log(`📊 User lookup result:`, existingUser ? `Found: ${existingUser.display_name}` : 'Not found')
      
      if (!existingUser) {
        // Don't reveal whether email exists or not for security, but log it
        console.log(`🔐 Email ${email} not found in database, returning success for security`)
        console.log(`ℹ️ If this is your email and you should have access, check your user record in Supabase`)
        return { success: true }
      }

      console.log(`👤 Found user: ${existingUser.display_name} (${existingUser.id})`)

      // Generate secure token
      const token = this.generateSecureToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      console.log(`🔐 Generated reset token, expires at: ${expiresAt.toISOString()}`)

      // Store token in database
      console.log(`💾 Storing password reset token in database...`)
      await this.storeResetToken(email, token, expiresAt)
      console.log(`✅ Reset token stored successfully`)

      // Send email via Resend through email jobs system
      console.log(`📧 Queueing password reset email...`)
      const emailResult = await EmailService.sendPasswordResetViaResend(
        email,
        existingUser.display_name,
        token
      )

      if (!emailResult.success) {
        console.error(`❌ Email send failed:`, emailResult.error)
        throw new Error(emailResult.error || 'Failed to send password reset email')
      }

      console.log(`✅ Password reset email queued successfully for ${email}`)
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error sending password reset:', error)
      console.error('❌ Error details:', error.message)
      console.error('❌ Stack trace:', error.stack)
      return { success: false, error: error.message }
    }
  }

  /**
   * Verify password reset token
   */
  static async verifyResetToken(token: string): Promise<{
    success: boolean
    error?: string
    email?: string
  }> {
    try {
      console.log(`🔐 Verifying password reset token`)

      // Find the token in database
      const { data: tokenData, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (tokenError || !tokenData) {
        console.error('❌ Invalid or expired password reset token')
        return { success: false, error: 'Invalid or expired reset token. Please request a new password reset.' }
      }

      console.log(`✅ Password reset token verified for email: ${tokenData.email}`)
      return {
        success: true,
        email: tokenData.email
      }

    } catch (error: any) {
      console.error('❌ Error verifying reset token:', error)
      return { success: false, error: 'Failed to verify reset token.' }
    }
  }

  /**
   * Complete password reset - mark token as used and update password
   */
  static async completePasswordReset(token: string, newPassword: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      console.log(`🔐 Completing password reset`)

      // First verify the token is still valid
      const verifyResult = await this.verifyResetToken(token)
      if (!verifyResult.success || !verifyResult.email) {
        return { success: false, error: verifyResult.error }
      }

      const email = verifyResult.email

      // Mark token as used
      await supabase
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token)

      // Find user by email to get their auth account
      const existingUser = await findUserByAnyEmail(email)
      if (!existingUser) {
        return { success: false, error: 'User account not found.' }
      }

      // Check if user has a Supabase auth account
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const authUser = authUsers.users.find(u => u.email === email)

      if (!authUser) {
        return { success: false, error: 'Authentication account not found. Please contact support.' }
      }

      // Update the password using Supabase Auth Admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        authUser.id,
        { password: newPassword }
      )

      if (updateError) {
        console.error('❌ Error updating password:', updateError)
        return { success: false, error: 'Failed to update password. Please try again.' }
      }

      console.log(`✅ Password reset completed successfully for ${email}`)
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error completing password reset:', error)
      return { success: false, error: 'Failed to complete password reset.' }
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const { error } = await supabase
        .from('password_reset_tokens')
        .delete()
        .lt('expires_at', new Date().toISOString())

      if (error) {
        console.error('Error cleaning up expired reset tokens:', error)
      } else {
        console.log('✅ Cleaned up expired password reset tokens')
      }
    } catch (error) {
      console.error('Error in reset token cleanup:', error)
    }
  }
}