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
    console.log('👤 Fetching user profile from database for ID:', userId)
    
    try {
      // Query the users table directly - this should work
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('❌ Database query failed:', error)
        console.error('❌ Error details:', { code: error.code, message: error.message, details: error.details })
        setUser(null)
      } else if (data) {
        console.log('✅ User profile loaded from database:', data.email)
        setUser(data)
      } else {
        console.log('❌ No user data returned')
        setUser(null)
      }
    } catch (error) {
      console.error('❌ Exception in fetchUserProfile:', error)
      setUser(null)
    } finally {
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