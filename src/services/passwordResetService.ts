/**
 * Password Reset Service
 * Handles secure token generation, storage, and verification for password resets using Resend
 */

import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import { findUserByAnyEmail } from '@/utils/userMatching'
import { getPasswordResetRedirectUrl, debugDomainInfo, getPasswordResetRedirectUrls } from '@/utils/domainUtils'

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
   * Send password reset email with fallback system
   * Enhanced to handle domain mismatches that cause 403 errors
   */
  static async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Generating password reset for ${email}`)
      console.log(`📧 Using Supabase Auth (same as registration emails)`)

      // Debug domain information
      debugDomainInfo('PASSWORD-RESET-SERVICE')
      
      // Get the appropriate redirect URL using domain utilities
      const redirectUrl = getPasswordResetRedirectUrl()
      const allPossibleUrls = getPasswordResetRedirectUrls()
      
      console.log(`📍 Using redirect URL: ${redirectUrl}`)
      console.log(`📍 All possible redirect URLs that should be configured:`)
      allPossibleUrls.forEach(url => console.log(`   - ${url}`))
      console.log(`⚠️  CRITICAL: ALL these URLs must be added to Supabase Dashboard > Authentication > URL Configuration`)
      console.log(`⚠️  CRITICAL: Email template must use recovery flow ({{ .ConfirmationURL }}) not confirmation flow`)
      console.log(`⚠️  403 errors occur when redirect URL is not in the allowed list`)
      console.log(`⚠️  400 PKCE errors occur when email template uses wrong flow type`)
      
      // STEP 1: Check if user exists in auth system before attempting reset
      console.log('🔍 USER ACCOUNT VALIDATION:', {
        email,
        checkingUserExists: true,
        timestamp: new Date().toISOString()
      })

      // Check if user exists in users table (handle RLS policy blocking)
      let userData = null
      let userError = null
      
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, display_name, created_at')
          .eq('email', email)
          .single()
        
        userData = data
        userError = error
      } catch (error) {
        console.log('🔓 Users table query failed (likely RLS policy), continuing with token generation...')
        userError = error
      }

      console.log('🔍 USER ACCOUNT CHECK RESULT:', {
        email,
        userExists: !!userData,
        userId: userData?.id,
        displayName: userData?.display_name,
        userCreatedAt: userData?.created_at,
        userError: userError?.message,
        errorCode: userError?.code,
        rlsBlocked: userError?.code === '42501' || userError?.message?.includes('row-level security'),
        possibleIssue: !userData ? 
          userError?.code === '42501' ? 'RLS_POLICY_BLOCKING_ACCESS' :
          'USER_MAY_NOT_EXIST' : 'USER_OK',
        decision: userError?.code === '42501' ? 'CONTINUE_ANYWAY' : 'NORMAL_CHECK'
      })

      // Only fail if we can definitively say user doesn't exist (not RLS blocked)
      if (!userData && userError && userError.code !== '42501') {
        console.error('❌ CRITICAL: User likely does not exist - token generation may fail')
        console.error('❌ This may explain empty tokens in Supabase Auth logs')
        console.log('⚠️  Continuing anyway to test token generation...')
        // Don't return early - let token generation test provide the real answer
      } else if (!userData && userError?.code === '42501') {
        console.log('🔓 RLS policies prevent user verification, but user may exist')
        console.log('🔍 Token generation will be the definitive test')
      }

      // Enhanced logging to diagnose missing token generation
      console.log('🔍 PRE-TOKEN-GENERATION DEBUG:', {
        email,
        redirectUrl,
        timestamp: new Date().toISOString(),
        supabaseProjectUrl: process.env.VITE_SUPABASE_URL,
        currentOrigin: window.location.origin,
        userValidated: true,
        userId: userData.id
      })

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      })

      // CRITICAL: Log the full response, not just errors
      console.log('🔍 POST-TOKEN-GENERATION DEBUG:', {
        email,
        hasError: !!error,
        hasData: !!data,
        dataContents: data ? JSON.stringify(data, null, 2) : 'NO DATA',
        errorContents: error ? JSON.stringify(error, null, 2) : 'NO ERROR',
        timestamp: new Date().toISOString(),
        suspectedIssue: !error && !data ? 'SILENT FAILURE - NO TOKENS GENERATED' : 'Normal response'
      })

      // Check for actual failures vs normal Supabase Auth behavior
      // Note: Supabase auth.resetPasswordForEmail() returns empty object {} on success, not tokens
      // This is normal behavior - tokens are sent via email, not returned in API response
      if (!error) {
        console.log('✅ Password reset email sent successfully via Supabase Auth')
        console.log('📧 Email should contain valid tokens and redirect link')
        console.log('⚠️ NOTE: Supabase Auth API returns empty object on success - this is normal')
        console.log('⚠️ If user reports 403 errors, check redirect URL configuration')
        return { success: true }
      }

      if (error) {
        console.error('❌ Supabase Auth password reset error:', error)
        console.error('Error code:', error.code)
        console.error('Error status:', error.status)
        console.error('Full error object:', JSON.stringify(error, null, 2))
        
        // Provide specific guidance for configuration errors
        if (error.status === 403 || error.message?.includes('redirect')) {
          console.error('🚨 403 ERROR: This is likely the "Email link is invalid or has expired" error from your logs!')
          console.error('🚨 CAUSE: Redirect URL mismatch - the email template domain doesn\'t match allowed redirect URLs')
          console.error('🚨 FIX: Add ALL these URLs to Supabase Dashboard > Authentication > URL Configuration:')
          allPossibleUrls.forEach(url => console.error(`   - ${url}`))
        }
        
        if (error.message?.includes('invalid_request') || error.message?.includes('PKCE')) {
          console.error('🚨 PKCE ERROR: This matches the "400 PKCE validation" error from your logs!')
          console.error('🚨 CAUSE: Email template is using confirmation flow instead of recovery flow')
          console.error('🚨 FIX: Update Supabase email template to use {{ .ConfirmationURL }} instead of custom URL')
        }
        
        // Check if it's a rate limit error
        if (error.message?.includes('rate') || error.status === 429) {
          console.log('⚠️ Rate limit detected, using fallback...')
        } else if (error.status === 403) {
          // Don't fall back for 403 errors - these need configuration fixes
          return { 
            success: false, 
            error: `Configuration Error: Password reset redirect URL (${redirectUrl}) is not in the allowed redirect URLs list. Please contact support to fix the configuration.` 
          }
        }
        
        console.log('🔄 Supabase Auth failed, attempting fallback to direct Resend API...')
        
        // If Supabase Auth fails, fall back to our Resend API
        return await this.sendPasswordResetViaResendAPI(email)
      }

      console.log(`✅ Password reset email sent successfully via Supabase Auth`)
      console.log(`⚠️ NOTE: If email doesn't arrive, check Supabase Dashboard > Authentication > Email Templates`)
      console.log(`⚠️ Ensure 'Reset Password' template is enabled and redirect URLs are configured`)
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error with Supabase Auth, trying fallback:', error)
      return await this.sendPasswordResetViaResendAPI(email)
    }
  }

  /**
   * Fallback method using direct Resend API
   * Used when Supabase Auth email fails to send
   */
  private static async sendPasswordResetViaResendAPI(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`📧 Using fallback: Direct Resend API via serverless function`)

      // Generate secure token
      const token = this.generateSecureToken()
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
      
      const response = await fetch(`${baseUrl}/api/send-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          token
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Resend API error:', errorData)
        
        // If it's the domain verification error, provide helpful message
        if (errorData.resendError?.statusCode === 403) {
          return { 
            success: false, 
            error: 'Email sending is currently limited. Please contact support or use a verified email address.' 
          }
        }
        
        throw new Error(errorData.error || `API request failed with status ${response.status}`)
      }

      const result = await response.json()
      console.log(`✅ Fallback password reset email sent via Resend API:`, result.messageId)
      
      return { success: true }

    } catch (error: any) {
      console.error('❌ Fallback Resend API also failed:', error)
      return { success: false, error: 'Unable to send password reset email. Please try again later or contact support.' }
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
   * Complete password reset via serverless function
   */
  static async completePasswordReset(token: string, newPassword: string, email?: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      console.log(`🔐 Completing password reset via secure serverless function`)

      // Validate required parameters
      if (!email) {
        return { success: false, error: 'Email address is required for password reset.' }
      }

      if (!token || token.length < 16) {
        return { success: false, error: 'Invalid reset token.' }
      }

      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters long.' }
      }

      console.log(`📧 Processing password reset for: ${email}`)

      // Call our serverless function to complete the reset securely
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
      
      const response = await fetch(`${baseUrl}/api/complete-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          newPassword,
          token
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Password reset API error:', errorData)
        throw new Error(errorData.error || `Password reset failed with status ${response.status}`)
      }

      const result = await response.json()
      console.log(`✅ Password reset completed successfully via serverless function`)
      
      return { success: true }

    } catch (error: any) {
      console.error('❌ Error completing password reset:', error)
      return { success: false, error: error.message || 'Failed to complete password reset.' }
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