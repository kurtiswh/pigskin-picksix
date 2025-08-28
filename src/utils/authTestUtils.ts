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
 * Test specific token validation scenarios
 */
export function testTokenValidationScenarios(testUrl?: string): AuthTestResult[] {
  const results: AuthTestResult[] = []
  const url = testUrl || window.location.href
  
  try {
    const urlObj = new URL(url)
    const hashParams = new URLSearchParams(urlObj.hash.substring(1))
    const searchParams = new URLSearchParams(urlObj.search)
    
    // Test 1: Check for 403 error patterns
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const type = hashParams.get('type')
    const errorParam = searchParams.get('error') || hashParams.get('error')
    
    results.push({
      test: '403 Token Error Analysis',
      success: !errorParam,
      message: errorParam 
        ? `Found error parameter: ${errorParam}`
        : 'No error parameters detected',
      details: {
        hasValidTokens: !!(accessToken && refreshToken),
        tokenType: type,
        errorFound: errorParam,
        tokenLengths: {
          access: accessToken?.length || 0,
          refresh: refreshToken?.length || 0
        },
        likelyFailureReasons: accessToken && refreshToken && errorParam ? [
          'Token expired (1 hour limit)',
          'Token already used',
          'Domain/URL mismatch',
          'Multiple clicks on same link'
        ] : ['Invalid token format or missing tokens']
      },
      fix: errorParam ? 
        'User needs to request a new password reset - this link is invalid' : 
        'Tokens appear valid - check session validation'
    })
    
    // Test 2: Analyze token format for validity
    if (accessToken && refreshToken) {
      const tokenFormatValid = accessToken.length > 20 && refreshToken.length > 20
      results.push({
        test: 'Token Format Validation',
        success: tokenFormatValid,
        message: tokenFormatValid ? 
          'Tokens have valid format' : 
          'Tokens appear to have invalid format',
        details: {
          accessTokenLength: accessToken.length,
          refreshTokenLength: refreshToken.length,
          accessTokenPrefix: accessToken.substring(0, 8) + '...',
          refreshTokenPrefix: refreshToken.substring(0, 8) + '...',
          expectedMinLength: 20
        }
      })
    }
    
    // Test 3: Check timing context
    const currentTime = new Date().toISOString()
    results.push({
      test: 'Password Reset Timing Context',
      success: true,
      message: 'Timing information captured for analysis',
      details: {
        pageLoadTime: currentTime,
        userAgent: navigator.userAgent,
        referrer: document.referrer,
        currentDomain: window.location.origin,
        notes: [
          'Password reset links expire after 1 hour',
          'Links can only be used once',
          'Multiple tabs/clicks can cause failures',
          'Domain must match Supabase configuration'
        ]
      },
      fix: 'If user reports working link suddenly failing, check for multiple clicks or expired time'
    })
    
  } catch (error) {
    results.push({
      test: 'Token Validation Analysis',
      success: false,
      message: `Failed to analyze tokens: ${error}`,
      details: { error, url }
    })
  }
  
  return results
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
  ;(window as any).testTokenValidationScenarios = testTokenValidationScenarios
  console.log('✅ [AUTH-TEST-UTILS] Global functions registered successfully')
  console.log('🧪 Available functions: quickAuthTest(), testPasswordResetEmail(), testUrlParsing(), testTokenValidationScenarios()')
}