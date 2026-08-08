import React, { createContext, useContext, useEffect, useState } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { User, AuthContextType } from '@/types'
import { findUserByAnyEmail, createUserWithEmails, addEmailToUser } from '@/utils/userMatching'
import { ENV } from '@/lib/env'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  console.log('🚀 [STARTUP] AuthProvider component initializing')
  
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [userCache, setUserCache] = useState<{[key: string]: {user: User, timestamp: number}}>({})
  
  console.log('🚀 [STARTUP] AuthProvider state initialized - Loading:', loading)
  
  // Debug user state changes
  useEffect(() => {
    console.log('🔄 Auth state changed - User:', user, 'Loading:', loading)
  }, [user, loading])

  useEffect(() => {
    console.log('🚀 [STARTUP] useEffect running - about to initialize auth')
    
    const initializeAuth = async () => {
      console.log('🚀 [STARTUP] initializeAuth function starting')
      try {
        
        // Skip auth processing on reset password page - let that page handle its own auth flow
        if (window.location.pathname === '/reset-password') {
          console.log('🚀 [INIT] Skipping auth processing on reset password page')
          setLoading(false)
          return
        }
        
        // First, check for auth tokens in URL (both query params and hash)
        console.log('🚀 [INIT] Step 1: Checking for auth tokens in URL')
        
        // Check query parameters for email confirmation (?code=)
        const urlParams = new URLSearchParams(window.location.search)
        const confirmationCode = urlParams.get('code')
        
        // Check hash parameters for magic links (#access_token=)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        
        console.log('🚀 [INIT] Auth token check:', { 
          hasConfirmationCode: !!confirmationCode,
          hashType: type, 
          hasHashTokens: !!(accessToken && refreshToken) 
        })
        
        // Handle email confirmation callback (?code=)
        if (confirmationCode) {
          console.log('🔮 [INIT] Processing confirmation code...')
          
          // Check if this is specifically for password reset
          const currentPath = window.location.pathname
          const urlParams = new URLSearchParams(window.location.search)
          const isPasswordReset = currentPath === '/reset-password' || 
                                  urlParams.has('reset') || 
                                  urlParams.get('type') === 'recovery'
          
          console.log('🔍 [INIT] Code context:', { 
            path: currentPath, 
            isPasswordReset,
            hasResetParam: urlParams.has('reset'),
            typeParam: urlParams.get('type'),
            confirmedParam: urlParams.get('confirmed'),
            allParams: Object.fromEntries(urlParams.entries())
          })
          
          // If this is clearly a password reset, don't process as email confirmation
          if (isPasswordReset) {
            console.log('🔄 [INIT] Code is for password reset, skipping email confirmation processing')
            setLoading(false)
            return
          }
          
          // This should be an email confirmation for registration
          console.log('✅ [INIT] Processing as email confirmation for registration')
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(confirmationCode)
          
          if (error) {
            console.error('❌ [INIT] Email confirmation failed:', error.message)
            console.error('❌ [INIT] Error details:', JSON.stringify(error, null, 2))
            
            // Only redirect to reset password if we're sure this was meant to be a password reset
            if (error.message?.includes('invalid') && error.message?.includes('recovery')) {
              console.log('🔄 [INIT] Code was actually for password reset, redirecting')
              window.location.href = `/reset-password?error=invalid_code&code=${confirmationCode}`
              return
            }
            
            // For email confirmation errors, show the error but don't redirect to password reset
            console.log('❌ [INIT] Email confirmation error, staying on current page')
            setLoading(false)
            return
          }
          
          if (data.session?.user) {
            console.log('✅ [INIT] Email confirmation successful - user signed in!')
            // Don't clear the URL immediately - let LoginPage show success message first
            await fetchUserProfile(data.session.user.id, data.session.user.email)
            return
          }
        }
        
        // Handle magic link or hash-based auth callback (#access_token=)
        if ((type === 'magiclink' || type === 'signup') && accessToken && refreshToken) {
          console.log(`🔮 [INIT] Processing ${type} hash callback`)
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            console.error(`❌ [INIT] ${type} session error:`, error.message)
            setLoading(false)
            return
          }
          
          if (data.session?.user) {
            console.log(`✅ [INIT] ${type} authentication successful`)
            // Don't clear the URL hash immediately - let LoginPage show success message first
            await fetchUserProfile(data.session.user.id, data.session.user.email)
            return
          }
        }
        
        // Get current session if no magic link - simplified approach
        console.log('🚀 [INIT] Step 2: Getting current session (simplified)')
        console.log('🔧 [INIT] Supabase URL configured:', ENV.SUPABASE_URL ? 'Yes' : 'No')
        console.log('🔧 [INIT] Supabase Key configured:', ENV.SUPABASE_ANON_KEY ? 'Yes' : 'No')
        
        // Skip connectivity tests to avoid potential issues - go straight to session check
        
        // Get current session to restore user state
        console.log('🚀 [INIT] Step 2: Getting current session to restore auth state')
        console.log('🚀 [INIT] About to call supabase.auth.getSession() with 10 second timeout')
        
        // Add timeout to prevent infinite hanging
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('getSession() timeout after 10 seconds'))
          }, 10000)
        })
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])
        
        console.log('🚀 [INIT] ✅ getSession() completed successfully!')
        console.log('🔍 [INIT] Current session user:', session?.user?.id, session?.user?.email)
        
        if (session?.user) {
          console.log('🚀 [INIT] Step 3: Found session user, calling fetchUserProfile')
          await fetchUserProfile(session.user.id, session.user.email)
        } else {
          console.log('🚀 [INIT] Step 3: No session user found, setting loading to false')
          setLoading(false)
        }
      } catch (error) {
        console.error('❌ [INIT] Auth initialization error:', error)
        console.log('🔄 [INIT] Attempting fallback initialization without getSession()')
        
        // Fallback: Just set loading to false and let the auth state listener handle any future auth changes
        console.log('🔄 [INIT] Fallback: Setting loading to false, auth will work when user manually signs in')
        setLoading(false)
      }
    }

    console.log('🚀 [INIT] Step 4: Setting up auth state change listener')
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 [AUTH-CHANGE] Auth state change event:', event)
      console.log('🔄 [AUTH-CHANGE] Session user:', session?.user ? `ID: ${session.user.id}` : 'None')
      
      if (session?.user) {
        console.log('🔄 [AUTH-CHANGE] Calling fetchUserProfile - this may cause pinwheel')
        await fetchUserProfile(session.user.id, session.user.email)
        console.log('🔄 [AUTH-CHANGE] fetchUserProfile completed')
      } else {
        console.log('🔄 [AUTH-CHANGE] No session user, setting user to null')
        setUser(null)
        setLoading(false)
      }
    })

    console.log('🚀 [INIT] Step 5: Auth state listener set up, calling initializeAuth()')
    
    initializeAuth()

    return () => {
      console.log('🚀 [CLEANUP] Unsubscribing from auth state changes')
      subscription.unsubscribe()
    }
  }, [])

  const linkLeagueSafePayments = async (userId: string, userEmail: string) => {
    console.log('💰 [PAYMENT-LINK] Starting payment linking for user:', userEmail)
    
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      console.log('💰 [PAYMENT-LINK] Using URL:', supabaseUrl)
      console.log('💰 [PAYMENT-LINK] API Key available:', !!apiKey)
      
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('💰 [PAYMENT-LINK] Request timeout - aborting')
        controller.abort()
      }, 10000) // 10 second timeout
      
      // Search for LeagueSafe payments with matching email
      console.log('💰 [PAYMENT-LINK] Searching for LeagueSafe payments with email:', userEmail)
      const paymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?leaguesafe_email=eq.${userEmail}&is_matched=eq.false&select=*`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      console.log('💰 [PAYMENT-LINK] Search response status:', paymentsResponse.status)

      if (paymentsResponse.ok) {
        const payments = await paymentsResponse.json()
        console.log(`💰 [PAYMENT-LINK] Found ${payments.length} unmatched LeagueSafe payments for ${userEmail}`)

        if (payments.length > 0) {
          // Update each payment to link to this user
          for (const payment of payments) {
            console.log(`💰 [PAYMENT-LINK] Linking payment ID ${payment.id} (Season ${payment.season}) to user ${userId}`)
            
            const updateController = new AbortController()
            const updateTimeoutId = setTimeout(() => {
              console.log('💰 [PAYMENT-LINK] Update timeout - aborting')
              updateController.abort()
            }, 5000) // 5 second timeout per update
            
            try {
              const updateResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?id=eq.${payment.id}`, {
                method: 'PATCH',
                headers: {
                  'apikey': apiKey || '',
                  'Authorization': `Bearer ${apiKey || ''}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  user_id: userId,
                  is_matched: true
                }),
                signal: updateController.signal
              })

              clearTimeout(updateTimeoutId)
              console.log(`💰 [PAYMENT-LINK] Update response status for season ${payment.season}:`, updateResponse.status)

              if (updateResponse.ok) {
                console.log(`💰 [PAYMENT-LINK] ✅ Successfully linked payment for season ${payment.season}`)
              } else {
                console.error(`💰 [PAYMENT-LINK] ❌ Failed to link payment for season ${payment.season}:`, updateResponse.status)
                const errorText = await updateResponse.text()
                console.error(`💰 [PAYMENT-LINK] Error details:`, errorText)
              }
            } catch (updateError) {
              clearTimeout(updateTimeoutId)
              console.error(`💰 [PAYMENT-LINK] Exception updating payment for season ${payment.season}:`, updateError)
            }
          }
          
          console.log('💰 [PAYMENT-LINK] Completed payment linking process')
          return { success: true, paymentsLinked: payments.length }
        } else {
          console.log('💰 [PAYMENT-LINK] ℹ️ No unmatched LeagueSafe payments found for this email')
          return { success: true, paymentsLinked: 0 }
        }
      } else {
        console.error('💰 [PAYMENT-LINK] ❌ Failed to search LeagueSafe payments:', paymentsResponse.status)
        const errorText = await paymentsResponse.text()
        console.error('💰 [PAYMENT-LINK] Error details:', errorText)
        return { success: false, error: 'Failed to search for LeagueSafe payments' }
      }
    } catch (error) {
      console.error('💰 [PAYMENT-LINK] 💥 Exception in linkLeagueSafePayments:', error)
      return { success: false, error: 'Exception while linking LeagueSafe payments' }
    }
  }

  const fetchUserProfile = async (userId: string, userEmail?: string) => {
    console.log('👤 [FETCH-PROFILE] Starting fetchUserProfile for ID:', userId)
    console.log('👤 [FETCH-PROFILE] User email provided:', userEmail)
    console.log('👤 [FETCH-PROFILE] This function may be causing the pinwheel if it hangs')
    
    try {
      console.log('🔄 Using direct API approach only (bypassing hanging Supabase client)...')
      
      // Skip the hanging getUser() call if we already have the email
      if (!userEmail) {
        console.log('⚠️ No email provided, skipping getUser() to avoid timeout...')
      }
      
      // Check if user with this exact ID exists in database
      console.log('🔍 Step 1: Looking for user by ID...')
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      console.log('🔧 Using Supabase URL:', supabaseUrl)
      console.log('🔧 API Key available:', !!apiKey)
      
      let response = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      })

      console.log('🔍 ID search response status:', response.status)

      if (response.status === 200) {
        const data = await response.json()
        console.log('📥 ID search response:', data)
        
        if (data && data.length > 0) {
          console.log('✅ SUCCESS: Found user by ID:', data[0].email)
          setUser(data[0])
          return
        } else {
          console.log('⚠️ No user found with ID, trying by email...')
        }
      } else {
        console.log('⚠️ ID search failed with status:', response.status)
        console.log('📝 Response text:', await response.text())
      }

      // Try searching by email if we have one
      if (userEmail) {
        console.log('🔍 Step 2: Looking for user by authenticated email:', userEmail)
        response = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(userEmail)}&select=*`, {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        })

        console.log('🔍 Email search response status:', response.status)

        if (response.status === 200) {
          const data = await response.json()
          console.log('📥 Email search response:', data)
          
          if (data && data.length > 0) {
            console.log('✅ SUCCESS: Found user by email:', data[0].email)
            console.log('🔧 User ID in database:', data[0].id, 'vs Auth ID:', userId)
            setUser(data[0])
            return
          } else {
            console.log('❌ No user found with email:', userEmail)
          }
        } else {
          console.log('❌ Email search failed with status:', response.status)
          const errorText = await response.text()
          console.log('❌ Error:', errorText)
        }
      }

      // If we get here, no user was found
      console.log('❌ FINAL RESULT: No matching user found in database')
      setUser(null)
      
    } catch (error) {
      console.error('❌ Exception in fetchUserProfile:', error)
      setUser(null)
    } finally {
      console.log('🏁 Setting loading to false')
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    console.log('🔐 [SIGNIN] Starting sign in for:', email)
    
    try {
      console.log('🔐 [SIGNIN] Calling supabase.auth.signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      console.log('🔐 [SIGNIN] Got response from Supabase auth')
      console.log('🔐 [SIGNIN] Error:', error ? error.message : 'None')
      console.log('🔐 [SIGNIN] User:', data?.user ? `ID: ${data.user.id}` : 'None')
      console.log('🔐 [SIGNIN] Session:', data?.session ? 'Present' : 'None')
      
      if (error) {
        console.error('🔐 [SIGNIN] ❌ Sign in error:', error.message)
        throw error
      }
      
      console.log('🔐 [SIGNIN] ✅ Sign in successful, returning data')
      return data
    } catch (err) {
      console.error('🔐 [SIGNIN] 💥 Exception in signIn:', err)
      throw err
    }
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    console.log('🔐 [SIGNUP] Starting signUp attempt:', { email, displayName })
    
    try {
      console.log('🔐 [SIGNUP] Step 1: Calling supabase.auth.signUp...')
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`, // Redirect to login with confirmation success
        },
      })
      
      console.log('🔐 [SIGNUP] Step 2: Got response from Supabase auth')
      console.log('🔐 [SIGNUP] Response details:', { 
        user: data?.user ? `Created (${data.user.id})` : 'None', 
        session: data?.session ? 'Created' : 'None',
        error: error ? error.message : 'None' 
      })
      
      if (error) {
        console.error('❌ [SIGNUP] SignUp error details:', error)
        console.error('❌ [SIGNUP] Full error object:', JSON.stringify(error, null, 2))
        throw new Error(`Failed to create account: ${error.message}`)
      }

      // Supabase never tells us an address is taken — it returns a success
      // response with an empty `identities` array and sends no email, so nobody
      // can use this form to discover who has an account. Left alone that looks
      // identical to a real signup, which is how a returning player ends up
      // waiting on a confirmation email that was never sent.
      //
      // So send them something they can actually use: a password reset, which
      // goes to the address itself and is the right move whether they forgot
      // they registered or forgot their password. resetPasswordForEmail is
      // equally tight-lipped, and the caller shows one message either way.
      const existingAccount = !!data?.user && data.user.identities?.length === 0
      if (existingAccount) {
        console.log('🔐 [SIGNUP] Address already registered — sending a reset link instead')
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) {
          // Non-fatal: the shared message tells them to use "Forgot password"
          // on the login page, which gets them to the same place by hand.
          console.error('⚠️ [SIGNUP] Reset link failed to send:', resetError)
        }
        return { existingAccount: true }
      }

      console.log('✅ [SIGNUP] Step 3: SignUp successful, user created!')
      // Note: signing up also re-enables contest emails for a previously
      // unsubscribed address. That happens server-side in handle_new_user
      // (migration 184) so it can't be triggered by anyone but a real signup.
      
      // Link LeagueSafe payments if the user was created successfully (non-blocking)
      if (data?.user?.id) {
        console.log('🔗 [SIGNUP] Starting LeagueSafe payment linking for new user (non-blocking)...')
        linkLeagueSafePayments(data.user.id, email)
          .then(paymentResult => {
            if (paymentResult.success) {
              console.log(`✅ [SIGNUP] Successfully linked ${paymentResult.paymentsLinked} LeagueSafe payments`)
            } else {
              console.warn('⚠️ [SIGNUP] Failed to link LeagueSafe payments:', paymentResult.error)
            }
          })
          .catch(error => {
            console.error('💥 [SIGNUP] Exception in background payment linking:', error)
          })
        
        console.log('🔗 [SIGNUP] Payment linking started in background, continuing with signup...')
      }
      
      console.log('🔐 [SIGNUP] Step 5: Returning signup data')
      return { existingAccount: false }
    } catch (err) {
      console.error('💥 [SIGNUP] SignUp exception:', err)
      throw err
    }
  }

  const signOut = async () => {
    try {
      console.log('🚪 Starting sign out process...')
      
      // Clear local state first to provide immediate feedback
      setUser(null)
      setUserCache({})
      setLoading(false)
      console.log('🧹 Cleared local user state')
      
      // Then call Supabase sign out
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('❌ Supabase sign out error:', error)
        // Don't throw error - we've already cleared local state
      } else {
        console.log('✅ Supabase sign out successful')
      }
      
      // Redirect to login page
      window.location.href = '/login'
      
    } catch (err) {
      console.error('❌ Error during sign out:', err)
      // Force sign out even if Supabase fails
      setUser(null)
      setUserCache({})
      setLoading(false)
      console.log('🔒 Forced local sign out completed')
      
      // Still redirect to login
      window.location.href = '/login'
    }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw error
  }

  const signInWithMagicLink = async (email: string) => {
    console.log('🔮 Attempting magic link sign in for:', email)
    
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            display_name: email.split('@')[0], // Use email prefix as fallback display name
          }
        }
      })
      
      console.log('🔮 Magic link response:', { 
        error: error ? error.message : 'None'
      })
      
      if (error) {
        console.error('❌ Magic link error:', error)
        throw error
      }
      
      console.log('✅ Magic link sent successfully!')
      return data
    } catch (err) {
      console.error('💥 Exception during magic link:', err)
      throw err
    }
  }

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await fetchUserProfile(session.user.id, session.user.email)
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithMagicLink,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}