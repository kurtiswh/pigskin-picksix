/**
 * Authentication testing utilities
 * Helps diagnose password reset and authentication flow issues
 */

import { supabase } from '@/lib/supabase'
import { getPasswordResetRedirectUrls, getDomainVariants, getCurrentSiteUrl } from './domainUtils'

export interface AuthTestResult {
  test: string
  success: boolean
  message: string
  details?: any
  fix?: string
}

/**
 * Test password reset email configuration
 */
export async function testPasswordResetEmail(email: string): Promise<AuthTestResult[]> {
  const results: AuthTestResult[] = []
  
  // Test 1: Check redirect URL configuration
  const currentDomain = getCurrentSiteUrl()
  const redirectUrls = getPasswordResetRedirectUrls()
  
  results.push({
    test: 'Redirect URL Configuration',
    success: true,
    message: `Current domain: ${currentDomain}`,
    details: {
      redirectUrls,
      currentDomain,
      variants: getDomainVariants(currentDomain)
    },
    fix: 'Add all redirect URLs to Supabase Dashboard > Authentication > URL Configuration'
  })
  
  // Test 2: Attempt password reset
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrls[0]
    })
    
    if (error) {
      results.push({
        test: 'Password Reset Email Send',
        success: false,
        message: `Failed: ${error.message}`,
        details: error,
        fix: error.status === 403 
          ? 'Add redirect URL to Supabase allowed redirect URLs'
          : 'Check Supabase email template configuration'
      })
    } else {
      results.push({
        test: 'Password Reset Email Send',
        success: true,
        message: 'Email sent successfully via Supabase Auth',
        details: { redirectUrl: redirectUrls[0] }
      })
    }
  } catch (error) {
    results.push({
      test: 'Password Reset Email Send',
      success: false,
      message: `Exception: ${error}`,
      details: error,
      fix: 'Check network connectivity and Supabase configuration'
    })
  }
  
  // Test 3: Check current auth session
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    results.push({
      test: 'Auth Session Check',
      success: !error,
      message: session ? `User authenticated: ${session.user?.email}` : 'No active session',
      details: { session: !!session, error }
    })
  } catch (error) {
    results.push({
      test: 'Auth Session Check',
      success: false,
      message: `Exception: ${error}`,
      details: error
    })
  }
  
  return results
}

/**
 * Test URL parsing for common auth issues
 */
export function testUrlParsing(testUrl?: string): AuthTestResult[] {
  const results: AuthTestResult[] = []
  const url = testUrl || window.location.href
  
  try {
    // Test URL parsing
    const urlObj = new URL(url)
    const searchParams = new URLSearchParams(urlObj.search)
    const hashParams = new URLSearchParams(urlObj.hash.substring(1))
    
    results.push({
      test: 'URL Parsing',
      success: true,
      message: 'URL parsed successfully',
      details: {
        url,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash,
        queryParams: Object.fromEntries(searchParams.entries()),
        hashParams: Object.fromEntries(hashParams.entries())
      }
    })
    
    // Check for auth tokens
    const hasCode = searchParams.has('code')
    const hasAccessToken = hashParams.has('access_token')
    const hasType = hashParams.has('type')
    const hasError = searchParams.has('error') || hashParams.has('error')
    
    results.push({
      test: 'Auth Token Detection',
      success: hasCode || hasAccessToken,
      message: hasCode 
        ? `Found confirmation code (may cause PKCE errors)`
        : hasAccessToken
        ? `Found access token (correct for recovery flow)`
        : 'No auth tokens found',
      details: {
        hasCode,
        hasAccessToken,
        hasType,
        hasError,
        type: hashParams.get('type'),
        errorCode: searchParams.get('error_code') || hashParams.get('error_code')
      },
      fix: hasCode 
        ? 'Email template is using confirmation flow instead of recovery flow. Update template to use {{ .ConfirmationURL }}'
        : undefined
    })
    
  } catch (error) {
    results.push({
      test: 'URL Parsing',
      success: false,
      message: `Failed to parse URL: ${error}`,
      details: { error, url }
    })
  }
  
  return results
}

/**
 * Comprehensive auth flow test
 */
export async function runAuthFlowTest(email?: string): Promise<AuthTestResult[]> {
  console.log('🧪 Running comprehensive auth flow test...')
  
  const results: AuthTestResult[] = []
  
  // Test 1: URL parsing (use current page URL, not email)
  results.push(...testUrlParsing())
  
  // Test 2: Domain configuration  
  const currentDomain = getCurrentSiteUrl()
  const variants = getDomainVariants(currentDomain)
  
  results.push({
    test: 'Domain Configuration',
    success: true,
    message: 'Domain variants detected',
    details: {
      current: currentDomain,
      variants,
      redirectUrls: getPasswordResetRedirectUrls()
    },
    fix: 'Ensure both www and non-www variants are in Supabase redirect URLs'
  })
  
  // Test 3: Email test (if email provided)
  if (email) {
    const emailResults = await testPasswordResetEmail(email)
    results.push(...emailResults)
  }
  
  // Test 4: Local storage auth state
  try {
    const authKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('supabase') || key.includes('auth')
    )
    
    results.push({
      test: 'Local Storage Auth State',
      success: true,
      message: `Found ${authKeys.length} auth-related keys in local storage`,
      details: { authKeys }
    })
  } catch (error) {
    results.push({
      test: 'Local Storage Auth State',
      success: false,
      message: 'Cannot access local storage',
      details: { error }
    })
  }
  
  return results
}

/**
 * Log test results in a formatted way
 */
export function logTestResults(results: AuthTestResult[]) {
  console.log('🧪 AUTH FLOW TEST RESULTS:')
  console.log('='.repeat(50))
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌'
    console.log(`${index + 1}. ${icon} ${result.test}`)
    console.log(`   ${result.message}`)
    
    if (result.fix) {
      console.log(`   🔧 FIX: ${result.fix}`)
    }
    
    if (result.details) {
      console.log(`   📋 Details:`, result.details)
    }
    
    console.log('')
  })
  
  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  
  console.log(`📊 SUMMARY: ${successCount}/${totalCount} tests passed`)
  
  if (successCount < totalCount) {
    console.log('❌ Some tests failed - check the fixes above')
  } else {
    console.log('✅ All tests passed - auth flow should work correctly')
  }
}

/**
 * Quick test function for debugging
 */
export async function quickAuthTest(email?: string) {
  const results = await runAuthFlowTest(email)
  logTestResults(results)
  return results
}

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  console.log('🔧 [AUTH-TEST-UTILS] Registering global functions...')
  ;(window as any).quickAuthTest = quickAuthTest
  ;(window as any).testPasswordResetEmail = testPasswordResetEmail
  ;(window as any).testUrlParsing = testUrlParsing
  console.log('✅ [AUTH-TEST-UTILS] Global functions registered successfully')
}