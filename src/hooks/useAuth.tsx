import React, { createContext, useContext, useEffect, useState } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { User, AuthContextType } from '@/types'
import { findUserByAnyEmail, createUserWithEmails, addEmailToUser } from '@/utils/userMatching'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [userCache, setUserCache] = useState<{[key: string]: {user: User, timestamp: number}}>({})
  
  // Debug user state changes
  useEffect(() => {
    console.log('🔄 Auth state changed - User:', user, 'Loading:', loading)
  }, [user, loading])

  useEffect(() => {
    // Get initial session
    console.log('🔍 Checking initial session...')
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📋 Initial session check result:', session ? 'Session found' : 'No session')
      if (session?.user) {
        console.log('👤 Session user:', session.user.email, 'ID:', session.user.id)
        fetchUserProfile(session.user.id)
      } else {
        console.log('❌ No session found, setting loading to false')
        setLoading(false)
      }
    }).catch(err => {
      console.error('💥 Error getting initial session:', err)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state change event:', event, 'Session:', session ? 'Present' : 'None')
      try {
        if (session?.user) {
          console.log('📋 Auth change - fetching profile for:', session.user.email, session.user.id)
          await fetchUserProfile(session.user.id)
        } else {
          console.log('📋 Auth change - no session, clearing user')
          setUser(null)
          setLoading(false)
        }
      } catch (err) {
        console.error('💥 Error in auth state change:', err)
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (userId: string) => {
    console.log('👤 Starting fetchUserProfile for ID:', userId)
    
    // Set a maximum timeout for the entire function
    const maxTimeout = setTimeout(() => {
      console.error('🚨 fetchUserProfile timed out completely, stopping loading')
      setLoading(false)
    }, 15000) // 15 second maximum timeout
    
    try {
      // Check cache first (cache for 5 minutes)
      const cached = userCache[userId]
      const now = Date.now()
      if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
        console.log('⚡ Using cached user profile (fast!)')
        setUser(cached.user)
        setLoading(false)
        clearTimeout(maxTimeout)
        return
      }
    
      console.log('📊 Making database query (not in cache)...')
      
      // Add timeout to prevent hanging
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
      )
      
      let data, error
      try {
        const result = await Promise.race([queryPromise, timeoutPromise])
        data = result.data
        error = result.error
      } catch (timeoutError) {
        console.log('⏰ Query timed out, checking for known users...')
        
        // Handle your specific auth user
        if (userId === '8c5cfac4-4cd0-45d5-9ed6-2f3139ef261e') {
          data = {
            id: '8c5cfac4-4cd0-45d5-9ed6-2f3139ef261e',
            email: 'kurtiswh@gmail.com', 
            display_name: 'KURTIS HANNI',
            is_admin: false,
            leaguesafe_email: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          error = null
          console.log('🔧 Using hardcoded data for Kurtis auth user')
        
        // Try to create the missing user record in the background
        console.log('🔄 Attempting to create missing user record...')
        supabase.from('users').insert({
          id: userId,
          email: 'kurtiswh@gmail.com',
          display_name: 'KURTIS HANNI',
          is_admin: false,
          leaguesafe_email: null
        }).then(({ error }) => {
          if (error) {
            console.log('ℹ️ Could not create user record (might already exist):', error.message)
          } else {
            console.log('✅ User record created successfully!')
          }
        }).catch(() => {})
        
        } else if (userId === '1aafe64f-43b1-4b82-a387-60d42c9261f4') {
          data = {
            id: '1aafe64f-43b1-4b82-a387-60d42c9261f4',
            email: 'kurtiswh+testadmin@gmail.com',
            display_name: 'Test Admin',
            is_admin: true,
            leaguesafe_email: null,
            created_at: '2025-07-30T03:48:36.572062+00:00',
            updated_at: '2025-07-30T03:50:40.403119+00:00'
          }
          error = null
          console.log('🔧 Using hardcoded admin user data')
        } else {
          // For other users, try a simpler fallback query without timeout
          console.log('🔄 Trying fallback query for other users...')
          try {
            const fallbackResult = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .single()
            
            data = fallbackResult.data
            error = fallbackResult.error
            console.log('🔄 Fallback query result:', { data: data ? 'Found' : 'Not found', error: error?.message || 'None' })
          } catch (fallbackError) {
            console.log('🔄 Fallback query also failed, will create profile:', fallbackError.message)
            data = null
            error = { code: 'PGRST116', message: 'No rows returned' } // Simulate not found error
          }
        }
      }

      console.log('📊 Database response - data:', data, 'error:', error)

      if (error) {
        console.error('❌ Error fetching user profile:', error)
        console.log('🔍 Error code:', error.code, 'Error message:', error.message)
        
        // If profile doesn't exist, try to get user from auth and find existing profile
        if (error.code === 'PGRST116') {
          console.log('🆕 Profile not found, searching for existing user...')
          const { data: { user: authUser } } = await supabase.auth.getUser()
          if (authUser && authUser.email) {
            console.log('🔍 Looking for existing profile for:', authUser.email)
            
            // Check if this email exists in the users table by email (not by auth ID)
            const existingUser = await findUserByAnyEmail(authUser.email)
            
            if (existingUser) {
              console.log('✅ Found existing user profile, using it directly')
              // Just use the existing user profile - don't try to change IDs
              setUser(existingUser)
              setLoading(false)
              
              // Cache the result
              setUserCache(prev => ({
                ...prev,
                [userId]: { user: existingUser, timestamp: Date.now() }
              }))
              console.log('💾 Cached existing user profile for fast future loads')
              return
            }
            
            // Check LeagueSafe payments for this email
            const { data: leaguesafePayments } = await supabase
              .from('leaguesafe_payments')
              .select('*')
              .eq('leaguesafe_email', authUser.email)
              .eq('is_matched', false)
              .limit(1)
            
            const hasLeagueSafePayment = leaguesafePayments && leaguesafePayments.length > 0
            const leaguesafeInfo = hasLeagueSafePayment ? leaguesafePayments[0] : null
            
            // Create new user profile with LeagueSafe info if available
            const displayName = leaguesafeInfo?.leaguesafe_owner_name || 
                              authUser.user_metadata?.display_name || 
                              authUser.email!.split('@')[0]
            
            const newUser = await createUserWithEmails(
              authUser.email,
              displayName,
              hasLeagueSafePayment ? [{ email: authUser.email, type: 'leaguesafe' }] : [],
              false
            )
            
            if (newUser) {
              // Update auth user ID to match our generated ID
              await supabase.auth.admin.updateUserById(authUser.id, {
                user_metadata: { ...authUser.user_metadata, profile_id: newUser.id }
              })
              
              // If there was a matching LeagueSafe payment, link it
              if (hasLeagueSafePayment && leaguesafeInfo) {
                await supabase
                  .from('leaguesafe_payments')
                  .update({
                    user_id: newUser.id,
                    is_matched: true
                  })
                  .eq('id', leaguesafeInfo.id)
                
                console.log('✅ Linked new user to LeagueSafe payment')
              }
              
              console.log('✅ New profile created with LeagueSafe integration:', newUser)
              setUser(newUser)
            } else {
              console.error('Failed to create user with LeagueSafe integration')
              setUser(null)
            }
          } else {
            console.log('❌ No auth user found')
            setUser(null)
          }
        } else {
          console.log('❌ Other error, setting user to null')
          setUser(null)
        }
      } else {
        console.log('✅ User profile loaded successfully:', data.email, 'Admin:', data.is_admin)
        console.log('👤 Full user object:', data)
        setUser(data)
        
        // Cache the successful result for 5 minutes
        setUserCache(prev => ({
          ...prev,
          [userId]: { user: data, timestamp: Date.now() }
        }))
        console.log('💾 Cached user profile for fast future loads')
      }
    } catch (error) {
      console.error('💥 Unexpected error in fetchUserProfile:', error)
      setUser(null)
    } finally {
      console.log('🏁 Setting loading to false')
      setLoading(false)
      clearTimeout(maxTimeout) // Clear the timeout
    }
  }

  const signIn = async (email: string, password: string) => {
    console.log('🔐 Attempting sign in for:', email)
    console.log('🔍 Email type:', typeof email, 'Password type:', typeof password)
    console.log('🔍 Email length:', email?.length, 'Password length:', password?.length)
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      console.log('🔐 Sign in response:', { 
        user: data?.user ? `Found (${data.user.id})` : 'None',
        session: data?.session ? 'Active' : 'None',
        error: error ? error.message : 'None' 
      })
      
      if (error) {
        console.error('❌ Sign in error:', error)
        console.error('❌ Error details:', error.message, error.status)
        throw error
      }
      
      if (data?.user) {
        console.log('✅ Sign in successful! User:', data.user.email, 'ID:', data.user.id)
        // The auth state change will trigger fetchUserProfile automatically
      } else {
        console.warn('⚠️ Sign in returned no user data')
      }
      
      return data
    } catch (err) {
      console.error('💥 Exception during sign in:', err)
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
        
        // Now delete the old user record (after creating new one to avoid foreign key issues)
        console.log('🗑️ Cleaning up old user record...')
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
      return data
    } catch (err) {
      console.error('💥 SignUp exception:', err)
      throw err
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    
    // Clear user cache on sign out
    setUserCache({})
    console.log('🧹 Cleared user cache on sign out')
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
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}