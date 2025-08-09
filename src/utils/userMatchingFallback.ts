import { supabase } from '@/lib/supabase'
import { User } from '@/types'
import { generateUUID } from './uuid'

export interface UserMatchResult {
  user: User | null
  isNewUser: boolean
  matchedEmails: string[]
}

/**
 * Simple fallback user matching that works with existing schema
 * This doesn't require the new user_emails table or RPC functions
 */
export async function matchOrCreateUserForLeagueSafeFallback(
  leaguesafeEmail: string,
  leaguesafeName: string,
  isCommish: boolean = false
): Promise<UserMatchResult> {
  const email = leaguesafeEmail.toLowerCase().trim()
  
  console.log(`🎯 [FALLBACK] Matching/creating user: ${email} (${leaguesafeName})`)
  
  try {
    // Try to find existing user by primary email or leaguesafe_email
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${email},leaguesafe_email.eq.${email}`)
      .limit(1)
      .single()

    if (existingUser && !fetchError) {
      console.log(`✅ [FALLBACK] Found existing user: ${existingUser.email}`)
      
      // Update leaguesafe_email if it's different
      if (existingUser.leaguesafe_email !== email) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ leaguesafe_email: email })
          .eq('id', existingUser.id)
        
        if (updateError) {
          console.warn('Could not update leaguesafe_email:', updateError)
        }
      }
      
      return {
        user: existingUser,
        isNewUser: false,
        matchedEmails: [existingUser.email, email].filter((e, i, arr) => arr.indexOf(e) === i)
      }
    }

    // Check if the error was because no user was found (expected) vs other errors
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error(`❌ [FALLBACK] Error searching for user:`, fetchError)
      return {
        user: null,
        isNewUser: false,
        matchedEmails: []
      }
    }

    // No existing user found, create new one
    console.log(`👤 [FALLBACK] Creating new user for: ${email}`)
    
    const newUserId = generateUUID()
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        id: newUserId,
        email: email,
        display_name: leaguesafeName,
        leaguesafe_email: email,
        is_admin: isCommish
      }])
      .select()
      .single()

    if (createError) {
      console.error(`❌ [FALLBACK] Failed to create user:`, {
        email,
        error: createError,
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint
      })
      
      // If it's a unique constraint violation, try to find the existing user
      if (createError.code === '23505') { // unique_violation
        console.log(`🔍 [FALLBACK] Unique constraint violation, searching for existing user...`)
        
        // Try a broader search
        const { data: existingUser, error: searchError } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single()
        
        if (existingUser && !searchError) {
          console.log(`✅ [FALLBACK] Found existing user after constraint violation: ${existingUser.email}`)
          return {
            user: existingUser,
            isNewUser: false,
            matchedEmails: [email]
          }
        }
        
        console.error(`❌ [FALLBACK] Could not find existing user even after unique constraint violation`)
      }
      
      return {
        user: null,
        isNewUser: false,
        matchedEmails: []
      }
    }

    console.log(`✅ [FALLBACK] Created new user: ${newUser.email}`)
    
    return {
      user: newUser,
      isNewUser: true,
      matchedEmails: [email]
    }
  } catch (error) {
    console.error(`💥 [FALLBACK] Exception:`, error)
    return {
      user: null,
      isNewUser: false,
      matchedEmails: []
    }
  }
}