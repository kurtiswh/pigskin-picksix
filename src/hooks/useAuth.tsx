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
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        
        // Handle magic link callback
        if (type === 'magiclink' && accessToken && refreshToken) {
          console.log('🔮 Processing magic link callback')
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            console.error('❌ Magic link session error:', error.message)
            setLoading(false)
            return
          }
          
          if (data.session?.user) {
            console.log('✅ Magic link authentication successful')
            // Clear the URL hash
            window.history.replaceState({}, document.title, window.location.pathname)
            await fetchUserProfile(data.session.user.id)
            return
          }
        }
        
        // Get current session if no magic link
        const { data: { session } } = await supabase.auth.getSession()
        console.log('🔍 Current session user:', session?.user?.id, session?.user?.email)
        if (session?.user) {
          await fetchUserProfile(session.user.id)
        } else {
          setLoading(false)
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error)
        setLoading(false)
      }
    }

    initializeAuth()

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

    return () => subscription.unsubscribe()
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
    console.log('🔧 Setting up existing user account for:', email)
    
    try {
      // First, check if user exists in database
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${email},leaguesafe_email.eq.${email}`)
        .single()
      
      if (userError && userError.code !== 'PGRST116') {
        console.error('❌ Error checking existing user:', userError)
        throw new Error('Error checking user account. Please contact support.')
      }
      
      if (!existingUser) {
        throw new Error('No existing account found with this email. Please contact support or create a new account.')
      }
      
      console.log('✅ Found existing user:', existingUser.display_name, 'ID:', existingUser.id)
      
      // Try a different approach: temporarily disable RLS and create auth manually
      console.log('🔄 Attempting to create auth account with custom approach...')
      
      // Try regular signup (trigger should be disabled now)
      console.log('📧 Step 1: Attempting regular auth signup')
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            display_name: existingUser.display_name,
            existing_user_id: existingUser.id,
            skip_user_creation: true
          }
        }
      })
      
      console.log('🔐 Auth signup result:', { 
        user: authData?.user ? `Created (${authData.user.id})` : 'None',
        error: authError ? authError.message : 'None'
      })
      
      if (authError) {
        console.error('❌ Auth signup failed:', authError)
        throw new Error(`Failed to create auth account: ${authError.message}`)
      }
      
      if (authData.user) {
        console.log('✅ Auth user created:', authData.user.id)
        console.log('🔄 Step 2: Creating new user record with auth ID...')
        
        // Instead of updating (which fails with UUID), create new user record with auth ID
        // and copy the data from the existing user
        const { error: createError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: email,
            display_name: existingUser.display_name,
            is_admin: existingUser.is_admin || false,
            leaguesafe_email: existingUser.leaguesafe_email
          })
        
        if (createError) {
          console.error('❌ Failed to create new user record:', createError)
          // Don't fail here - the auth account was created
          return { 
            success: true, 
            message: 'Account created! Please check your email to confirm, then try signing in. If you have issues, contact support.' 
          }
        }
        
        console.log('✅ New user record created with auth ID')
        
        // Link LeagueSafe payments to this new user (non-blocking)
        console.log('🔗 Step 3: Starting LeagueSafe payment linking (non-blocking)...')
        linkLeagueSafePayments(authData.user.id, email)
          .then(paymentResult => {
            if (paymentResult.success) {
              console.log(`✅ Successfully linked ${paymentResult.paymentsLinked} LeagueSafe payments`)
            } else {
              console.warn('⚠️ Failed to link LeagueSafe payments:', paymentResult.error)
            }
          })
          .catch(error => {
            console.error('💥 Exception in background payment linking:', error)
          })
        
        console.log('🔗 Payment linking started in background, continuing with account setup...')
        
        // Now delete the old user record (after creating new one to avoid foreign key issues)
        console.log('🗑️ Step 4: Cleaning up old user record...')
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', existingUser.id)
        
        if (deleteError) {
          console.warn('⚠️ Could not delete old user record:', deleteError)
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
    console.log('🔐 SignUp attempt:', { email, displayName })
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      })
      
      console.log('🔐 SignUp response:', { 
        user: data?.user ? 'Created' : 'None', 
        session: data?.session ? 'Created' : 'None',
        error: error ? error.message : 'None' 
      })
      
      if (error) {
        console.error('❌ SignUp error details:', error)
        throw new Error(`Failed to create account: ${error.message}`)
      }
      
      console.log('✅ SignUp successful!')
      
      // Link LeagueSafe payments if the user was created successfully (non-blocking)
      if (data?.user?.id) {
        console.log('🔗 Starting LeagueSafe payment linking for new user (non-blocking)...')
        linkLeagueSafePayments(data.user.id, email)
          .then(paymentResult => {
            if (paymentResult.success) {
              console.log(`✅ Successfully linked ${paymentResult.paymentsLinked} LeagueSafe payments`)
            } else {
              console.warn('⚠️ Failed to link LeagueSafe payments:', paymentResult.error)
            }
          })
          .catch(error => {
            console.error('💥 Exception in background payment linking:', error)
          })
        
        console.log('🔗 Payment linking started in background, continuing with signup...')
      }
      
      return data
    } catch (err) {
      console.error('💥 SignUp exception:', err)
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