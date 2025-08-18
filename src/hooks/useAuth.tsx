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
        // First, check for magic link tokens in URL
        console.log('🚀 [INIT] Step 1: Checking for magic link tokens in URL')
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        
        console.log('🚀 [INIT] Magic link check - type:', type, 'hasTokens:', !!(accessToken && refreshToken))
        
        // Handle magic link callback
        if (type === 'magiclink' && accessToken && refreshToken) {
          console.log('🔮 [INIT] Processing magic link callback')
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            console.error('❌ [INIT] Magic link session error:', error.message)
            setLoading(false)
            return
          }
          
          if (data.session?.user) {
            console.log('✅ [INIT] Magic link authentication successful')
            // Clear the URL hash
            window.history.replaceState({}, document.title, window.location.pathname)
            await fetchUserProfile(data.session.user.id)
            return
          }
        }
        
        // Get current session if no magic link
        console.log('🚀 [INIT] Step 2: Getting current session - THIS MIGHT HANG')
        
        // First, test Supabase configuration
        console.log('🔧 [INIT] Testing Supabase configuration...')
        console.log('🔧 [INIT] Supabase URL:', ENV.SUPABASE_URL ? ENV.SUPABASE_URL.substring(0, 30) + '...' : 'MISSING')
        console.log('🔧 [INIT] Supabase Key:', ENV.SUPABASE_ANON_KEY ? ENV.SUPABASE_ANON_KEY.substring(0, 20) + '...' : 'MISSING')
        
        // Test basic network connectivity to Supabase
        try {
          console.log('🔧 [INIT] Testing network connectivity to Supabase...')
          const pingResponse = await fetch(`${ENV.SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD',
            headers: {
              'apikey': ENV.SUPABASE_ANON_KEY || '',
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout for connectivity test
          })
          console.log('🔧 [INIT] Network test response status:', pingResponse.status)
          
          if (!pingResponse.ok) {
            const errorText = await pingResponse.text()
            console.error('🔧 [INIT] Network test error response:', errorText)
          }
        } catch (networkError) {
          console.error('🔧 [INIT] ❌ Network connectivity test failed:', networkError)
        }
        
        // Test auth endpoint specifically (without session, should return 401 which is normal)
        try {
          console.log('🔧 [INIT] Testing auth endpoint specifically...')
          const authTestResponse = await fetch(`${ENV.SUPABASE_URL}/auth/v1/user`, {
            method: 'GET',
            headers: {
              'apikey': ENV.SUPABASE_ANON_KEY || '',
              // Don't send Authorization header without a valid session token
            },
            signal: AbortSignal.timeout(5000)
          })
          console.log('🔧 [INIT] Auth endpoint test status:', authTestResponse.status, '(401 is normal when not logged in)')
          
          if (authTestResponse.status === 401) {
            console.log('🔧 [INIT] ✅ Auth endpoint working correctly (401 = not authenticated)')
          } else if (!authTestResponse.ok) {
            const authErrorText = await authTestResponse.text()
            console.error('🔧 [INIT] Auth endpoint error response:', authErrorText)
          }
        } catch (authError) {
          console.error('🔧 [INIT] ❌ Auth endpoint test failed:', authError)
        }
        
        // TEMPORARY: Skip getSession() call due to hanging issue
        console.log('🚀 [INIT] TEMPORARY: Skipping getSession() call due to hanging issue')
        console.log('🚀 [INIT] Setting loading to false so login form appears')
        setLoading(false)
        
        // TODO: Uncomment this when getSession issue is resolved
        /*
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
          await fetchUserProfile(session.user.id)
        } else {
          console.log('🚀 [INIT] Step 3: No session user found, setting loading to false')
          setLoading(false)
        }
        */
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
        await fetchUserProfile(session.user.id)
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

  const fetchUserProfile = async (userId: string) => {
    console.log('👤 [FETCH-PROFILE] Starting fetchUserProfile for ID:', userId)
    console.log('👤 [FETCH-PROFILE] This function may be causing the pinwheel if it hangs')
    
    try {
      console.log('🔄 Using direct API approach only (bypassing hanging Supabase client)...')
      
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

      // Try searching by email - get all users and find match
      console.log('🔍 Step 2: Getting all users to find email match...')
      response = await fetch(`${supabaseUrl}/rest/v1/users?select=*`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      })

      console.log('🔍 All users response status:', response.status)

      if (response.status === 200) {
        const allUsers = await response.json()
        console.log('📥 All users response:', allUsers)
        console.log('📊 Found', allUsers.length, 'total users in database')
        
        // Look for user by email kurtiswh+test2@gmail.com
        const userByEmail = allUsers.find((u: any) => u.email === 'kurtiswh+test2@gmail.com')
        if (userByEmail) {
          console.log('✅ SUCCESS: Found user by email:', userByEmail.email)
          console.log('🔧 User ID in database:', userByEmail.id, 'vs Auth ID:', userId)
          setUser(userByEmail)
          return
        } else {
          console.log('❌ No user found with email kurtiswh+test2@gmail.com')
          console.log('📋 Available emails:', allUsers.map((u: any) => u.email))
        }
      } else {
        console.log('❌ Failed to get users, status:', response.status)
        const errorText = await response.text()
        console.log('❌ Error:', errorText)
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

  const setupExistingUser = async (email: string, password: string) => {
    console.log('🔧 [SETUP] Starting setupExistingUser for:', email)
    
    try {
      // First, check if user exists in database using direct API call
      console.log('🔧 [SETUP] Step 1: Checking if user exists in database using direct API...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      console.log('🔧 [SETUP] Using direct API to bypass RLS issues')
      
      // Search for user by email with direct API call
      const userSearchResponse = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.${email}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('🔧 [SETUP] User search response status:', userSearchResponse.status)
      
      let existingUser = null
      let userError = null
      
      if (userSearchResponse.ok) {
        const users = await userSearchResponse.json()
        console.log('🔧 [SETUP] Users found by email:', users.length)
        if (users.length > 0) {
          existingUser = users[0]
        } else {
          // Try searching by leaguesafe_email
          const leaguesafeSearchResponse = await fetch(`${supabaseUrl}/rest/v1/users?leaguesafe_email=eq.${email}&select=*`, {
            method: 'GET',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${apiKey || ''}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (leaguesafeSearchResponse.ok) {
            const leaguesafeUsers = await leaguesafeSearchResponse.json()
            console.log('🔧 [SETUP] Users found by leaguesafe_email:', leaguesafeUsers.length)
            if (leaguesafeUsers.length > 0) {
              existingUser = leaguesafeUsers[0]
            }
          }
        }
      } else {
        const errorText = await userSearchResponse.text()
        console.error('🔧 [SETUP] API search failed:', errorText)
        userError = { message: `API search failed: ${userSearchResponse.status}`, code: 'API_ERROR' }
      }
      
      console.log('🔧 [SETUP] Database query result:', {
        userFound: !!existingUser,
        error: userError ? userError.message : 'None',
        errorCode: userError?.code
      })
      
      if (userError && userError.code !== 'PGRST116') {
        console.error('❌ [SETUP] Error checking existing user:', userError)
        throw new Error('Error checking user account. Please contact support.')
      }
      
      if (!existingUser) {
        console.error('❌ [SETUP] No existing user found with email:', email)
        throw new Error('No existing account found with this email. Please contact support or create a new account.')
      }
      
      console.log('✅ [SETUP] Found existing user:', existingUser.display_name, 'ID:', existingUser.id)
      
      // Try a different approach: temporarily disable RLS and create auth manually
      console.log('🔧 [SETUP] Step 2: Creating auth account for existing user...')
      
      // Try regular signup (trigger should be disabled now)
      console.log('🔧 [SETUP] Step 2a: Attempting auth signup with skip_user_creation flag')
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: undefined, // Disable email confirmation
          email_confirm: false, // Explicitly disable email confirmation
          data: {
            display_name: existingUser.display_name,
            existing_user_id: existingUser.id,
            skip_user_creation: true
          }
        }
      })
      
      console.log('🔧 [SETUP] Auth signup result:', { 
        user: authData?.user ? `Created (${authData.user.id})` : 'None',
        session: authData?.session ? 'Created' : 'None',
        error: authError ? authError.message : 'None'
      })
      
      if (authError) {
        console.error('❌ [SETUP] Auth signup failed:', authError)
        console.error('❌ [SETUP] Full auth error:', JSON.stringify(authError, null, 2))
        throw new Error(`Failed to create auth account: ${authError.message}`)
      }
      
      if (authData.user) {
        console.log('✅ Auth user created:', authData.user.id)
        console.log('🔄 Step 2: Creating new user record with auth ID...')
        
        // Create new user record with auth ID using direct API call
        console.log('🔄 [SETUP] Creating new user record with auth ID using direct API...')
        
        const createUserResponse = await fetch(`${supabaseUrl}/rest/v1/users`, {
          method: 'POST',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: authData.user.id,
            email: email,
            display_name: existingUser.display_name,
            is_admin: existingUser.is_admin || false,
            leaguesafe_email: existingUser.leaguesafe_email
          })
        })
        
        console.log('🔄 [SETUP] Create user response status:', createUserResponse.status)
        
        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text()
          console.error('❌ Failed to create new user record:', errorText)
          // Don't fail here - the auth account was created
          return { 
            success: true, 
            message: 'Account created! You can now sign in with your credentials. If you have issues, contact support.' 
          }
        }
        
        console.log('✅ New user record created with auth ID')
        
        // Link LeagueSafe payments to this new user (non-blocking)
        console.log('🔗 [SETUP] Step 3: Starting LeagueSafe payment linking (non-blocking)...')
        linkLeagueSafePayments(authData.user.id, email)
          .then(paymentResult => {
            if (paymentResult.success) {
              console.log(`✅ [SETUP] Successfully linked ${paymentResult.paymentsLinked} LeagueSafe payments`)
            } else {
              console.warn('⚠️ [SETUP] Failed to link LeagueSafe payments:', paymentResult.error)
            }
          })
          .catch(error => {
            console.error('💥 [SETUP] Exception in background payment linking:', error)
          })
        
        console.log('🔗 [SETUP] Payment linking started in background, continuing with account setup...')
        
        // Now delete the old user record (after creating new one to avoid foreign key issues)
        console.log('🗑️ Step 4: Cleaning up old user record using direct API...')
        
        const deleteUserResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${existingUser.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        })
        
        console.log('🗑️ [SETUP] Delete old user response status:', deleteUserResponse.status)
        
        if (!deleteUserResponse.ok) {
          const errorText = await deleteUserResponse.text()
          console.warn('⚠️ Could not delete old user record:', errorText)
          // Don't fail - the account is working
        }
        
        console.log('✅ Successfully created and linked account!')
        
        // Check if user needs email confirmation
        const needsConfirmation = authData.user && !authData.session
        
        return { 
          success: true, 
          message: needsConfirmation 
            ? 'Account setup complete! Please check your email for a confirmation link, then you can sign in. If you don\'t receive an email within a few minutes, check your spam folder or contact support.'
            : 'Account setup complete! You can now sign in with your new credentials.'
        }
      }
      
      throw new Error('Failed to create auth account.')
      
    } catch (err) {
      console.error('💥 SetupExistingUser exception:', err)
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
          emailRedirectTo: undefined, // Disable email confirmation
          email_confirm: false, // Explicitly disable email confirmation
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
      
      console.log('✅ [SIGNUP] Step 3: SignUp successful, user created!')
      
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
      return data
    } catch (err) {
      console.error('💥 [SIGNUP] SignUp exception:', err)
      throw err
    }
  }

  const signOut = async () => {
    try {
      console.log('🚪 Starting sign out process...')
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('❌ Supabase sign out error:', error)
        throw error
      }
      console.log('✅ Supabase sign out successful')
      setUser(null)
      
      // Clear user cache on sign out
      setUserCache({})
      console.log('🧹 Cleared user cache on sign out')
    } catch (err) {
      console.error('❌ Error during sign out:', err)
      // Force sign out even if Supabase fails
      setUser(null)
      setUserCache({})
      console.log('🔒 Forced local sign out completed')
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
      await fetchUserProfile(session.user.id)
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signUp,
    setupExistingUser,
    signOut,
    signInWithGoogle,
    signInWithMagicLink,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}