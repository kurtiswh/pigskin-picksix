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
    const initializeAuth = async () => {
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
      console.log('🔄 Auth state change:', event)
      if (session?.user) {
        await fetchUserProfile(session.user.id)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (userId: string) => {
    console.log('👤 Starting fetchUserProfile for ID:', userId)
    
    try {
      // Check cache first (cache for 5 minutes)
      const cached = userCache[userId]
      const now = Date.now()
      if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
        console.log('⚡ Using cached user profile')
        setUser(cached.user)
        setLoading(false)
        return
      }
    
      console.log('📊 Making database query...')
      
      // Add timeout to prevent hanging
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      )

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any

      console.log('📊 Database response - data:', data ? 'Found' : 'None', 'error:', error?.message || 'None')

      if (error && error.code === 'PGRST116') {
        console.log('🆕 Profile not found, creating new user...')
        const { data: { user: authUser } } = await supabase.auth.getUser()
        
        if (authUser && authUser.email) {
          // Try to find existing user by email
          const existingUser = await findUserByAnyEmail(authUser.email)
          
          if (existingUser) {
            console.log('✅ Found existing user profile')
            setUser(existingUser)
            // Cache the result
            setUserCache(prev => ({
              ...prev,
              [userId]: { user: existingUser, timestamp: Date.now() }
            }))
          } else {
            // Create new user record
            const displayName = authUser.user_metadata?.display_name || authUser.email.split('@')[0]
            const newUser = await createUserWithEmails(authUser.email, displayName, [], false)
            
            if (newUser) {
              console.log('✅ Created new user profile')
              setUser(newUser)
              setUserCache(prev => ({
                ...prev,
                [userId]: { user: newUser, timestamp: Date.now() }
              }))
            } else {
              console.error('❌ Failed to create user')
              setUser(null)
            }
          }
        } else {
          console.log('❌ No auth user found')
          setUser(null)
        }
      } else if (error) {
        console.error('❌ Database error:', error.message)
        setUser(null)
      } else {
        console.log('✅ User profile loaded:', data?.email)
        setUser(data)
        
        // Cache the result
        setUserCache(prev => ({
          ...prev,
          [userId]: { user: data, timestamp: Date.now() }
        }))
      }
    } catch (error) {
      console.error('💥 Error in fetchUserProfile:', error)
      
      // If there's a database issue, create a minimal user object to prevent hanging
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log('⚠️ Database timeout - creating minimal user profile')
        
        try {
          // Add timeout to getUser call as well
          const getUserPromise = supabase.auth.getUser()
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getUser timeout')), 5000)
          )
          
          const { data: { user: authUser } } = await Promise.race([getUserPromise, timeoutPromise]) as any
          
          if (authUser) {
            const minimalUser = {
              id: authUser.id,
              email: authUser.email,
              display_name: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
              created_at: new Date().toISOString(),
              role: 'user'
            }
            console.log('✅ Created minimal user profile:', minimalUser.email)
            setUser(minimalUser)
          } else {
            console.log('❌ No auth user found')
            setUser(null)
          }
        } catch (authError) {
          console.log('❌ Auth user fetch also timed out, using basic fallback')
          // Create a very basic user from the userId we have
          setUser({
            id: userId,
            email: 'user@example.com', // Fallback email
            display_name: 'User',
            created_at: new Date().toISOString(),
            role: 'user'
          })
        }
      } else {
        console.log('❌ Non-timeout error, setting user to null')
        setUser(null)
      }
    } finally {
      console.log('🏁 fetchUserProfile complete - setting loading to false')
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    console.log('🔐 Signing in:', email)
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      console.error('❌ Sign in error:', error.message)
      throw error
    }
    
    console.log('✅ Sign in successful')
    return data
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