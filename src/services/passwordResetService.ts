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
   * Send password reset email via Supabase Auth with custom SMTP
   */
  static async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Generating password reset for ${email}`)
      console.log(`📧 Using Supabase Auth with custom SMTP configuration`)

      // Use Supabase Auth's built-in password reset functionality
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) {
        console.error('❌ Supabase Auth password reset error:', error)
        
        // Handle specific error cases
        if (error.message?.includes('rate_limit') || error.status === 429) {
          return { success: false, error: 'Too many password reset requests. Please wait a few minutes before trying again.' }
        }
        
        if (error.message?.includes('User not found')) {
          return { success: false, error: 'No account found with that email address.' }
        }
        
        return { success: false, error: error.message || 'Failed to send password reset email.' }
      }

      console.log(`✅ Password reset email sent successfully via Supabase Auth with custom SMTP`)
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error sending password reset:', error)
      return { success: false, error: error.message || 'Failed to send password reset email.' }
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

      // For password reset completion, we need to find the auth user
      // We'll use the admin API to list users and find by email
      console.log(`🔍 Finding auth account for email: ${email}`)
      
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()
      
      if (listError) {
        console.error('❌ Error listing auth users:', listError)
        return { success: false, error: 'Failed to access authentication system.' }
      }

      const authUser = authUsers.users.find(u => u.email === email)

      if (!authUser) {
        console.error(`❌ No auth account found for email: ${email}`)
        return { success: false, error: 'Authentication account not found. Please contact support if you believe this is an error.' }
      }

      console.log(`✅ Found auth account: ${authUser.id}`)

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