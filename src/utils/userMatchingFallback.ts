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
  isCommish: boolean = false,
  season?: number
): Promise<UserMatchResult> {
  const email = leaguesafeEmail.toLowerCase().trim()
  
  console.log(`🎯 [FALLBACK] Matching/creating user: ${email} (${leaguesafeName})`)
  
  // EMERGENCY BYPASS: If we're still getting 42P17 errors, skip user matching
  // and create a payment record without linking to a user
  try {
    // Resolve through every address the player has on file, not just the two
    // columns on their own row. find_user_id_for_email also reads user_emails
    // and prior payment records, skips merged tombstones, and prefers the
    // account that paid and then the one holding picks.
    //
    // The narrow lookup below is why 23 of the 2026 entries split in two: a
    // player pays under an address that is not their account email, nothing
    // matches, and the importer creates a second account that takes the
    // payment while they keep playing on the first. Nine of those had the
    // address already on file -- four from an earlier merge, five typed in by
    // the player themselves through the LeagueSafe email prompt -- and the
    // import walked straight past it, so merging them only held until the
    // next upload.
    if (season) {
      const { data: resolvedId, error: resolveError } = await supabase
        .rpc('find_user_id_for_email', { p_email: email, p_season: season })

      if (resolveError) {
        // Fall through to the narrow lookup rather than failing the import.
        console.warn('⚠️ [FALLBACK] find_user_id_for_email unavailable:', resolveError.message)
      } else if (resolvedId) {
        const { data: resolvedUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', resolvedId)
          .single()

        if (resolvedUser) {
          console.log(`✅ [FALLBACK] Resolved ${email} to ${resolvedUser.email} via addresses on file`)
          // Record the payment address on the account so the narrow lookup
          // finds it next time too, even if this path is ever unavailable.
          if (resolvedUser.leaguesafe_email !== email) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ leaguesafe_email: email })
              .eq('id', resolvedUser.id)
            if (updateError) console.warn('Could not update leaguesafe_email:', updateError)
          }
          return {
            user: resolvedUser,
            isNewUser: false,
            matchedEmails: [resolvedUser.email, email].filter((e, i, arr) => arr.indexOf(e) === i)
          }
        }
      }
    }

    // Try to find existing user by primary email or leaguesafe_email
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${email},leaguesafe_email.eq.${email}`)
      // Never match a merged tombstone. merge_users renames the losing
      // account's email but historically left leaguesafe_email intact, so an
      // import could attach a payment to a dead account -- which is how three
      // 2026 payments landed on tombstones while the real players read as
      // unpaid. Migration 227 neutered the existing ones; this stops the
      // matcher re-creating the situation from any that slip through.
      .not('email', 'like', '%\\_merged\\_%')
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
      console.error(`❌ [FALLBACK] Error searching for user:`, {
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        email
      })
      
      // EMERGENCY BYPASS: If it's an RLS policy error, return null user for unlinked payment
      if (fetchError.code === '42P17') {
        console.log(`🚨 [EMERGENCY] RLS policy recursion detected - creating payment without user link`)
        console.log(`⚠️ [EMERGENCY] Payment will be created with null user_id for: ${email}`)
        
        return {
          user: null,
          isNewUser: false,
          matchedEmails: [email]
        }
      }
      
      // If it's permission denied, throw with helpful message
      if (fetchError.code === '42501') {
        throw new Error(`Permission denied accessing user data. Please contact admin. Email: ${email}`)
      }
      
      // For other errors, return null user but don't throw
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
  } catch (error: any) {
    console.error(`💥 [FALLBACK] Exception:`, {
      error,
      message: error?.message,
      email,
      leaguesafeName
    })
    
    // Re-throw known errors that we want to surface to the user
    if (error?.message?.includes('Database policy error') || 
        error?.message?.includes('Permission denied')) {
      throw error
    }
    
    // For unknown exceptions, return null user
    return {
      user: null,
      isNewUser: false,
      matchedEmails: []
    }
  }
}