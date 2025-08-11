import { supabase } from '@/lib/supabase'
import { User, UserEmail } from '@/types'
import { generateUUID } from './uuid'

export interface UserMatchResult {
  user: User | null
  isNewUser: boolean
  matchedEmails: string[]
}

/**
 * Find a user by searching across all their email addresses
 */
export async function findUserByAnyEmail(email: string): Promise<User | null> {
  try {
    const searchEmail = email.toLowerCase().trim()
    console.log('🔍 Searching for user with email:', searchEmail)

    // First try direct lookup in users table (fallback)
    console.log('📊 Attempting direct database lookup...')
    const { data: directUser, error: directError } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${searchEmail},leaguesafe_email.eq.${searchEmail}`)
      .limit(1)
      .single()

    console.log('📊 Direct lookup result:', {
      found: !!directUser,
      error: directError?.message || 'none',
      errorCode: directError?.code
    })

    if (directUser && !directError) {
      console.log('✅ Found user via direct lookup:', directUser.email, `ID: ${directUser.id}`)
      return directUser
    }

    if (directError && directError.code !== 'PGRST116') {
      console.error('❌ Database error during direct lookup:', directError)
    }

    // Try the database function if it exists
    console.log('📊 Attempting RPC function lookup...')
    try {
      const { data, error } = await supabase
        .rpc('find_user_by_any_email', { search_email: searchEmail })

      console.log('📊 RPC lookup result:', {
        data,
        error: error?.message || 'none'
      })

      if (error) {
        console.warn('RPC function not available yet:', error.message)
        return null
      }

      if (!data) {
        console.log('📊 RPC function returned no data')
        return null
      }

      // Fetch the full user record
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data)
        .single()

      if (userError) {
        console.warn('Error fetching user data:', userError)
        return null
      }

      console.log('✅ Found user via RPC function:', userData.email)
      return userData
    } catch (rpcError) {
      console.warn('RPC function call failed:', rpcError.message)
      console.log('📊 No user found via any method')
      return null
    }
  } catch (error: any) {
    console.error('Exception finding user by email:', error)
    console.error('Exception details:', error.message)
    return null
  }
}

/**
 * Get all emails associated with a user
 */
export async function getUserEmails(userId: string): Promise<UserEmail[]> {
  try {
    const { data, error } = await supabase
      .from('user_emails')
      .select('email, email_type, is_verified')
      .eq('user_id', userId)

    if (error) {
      // If table doesn't exist, that's okay - return empty array
      if (error.code === '42P01') {
        console.log('⚠️ user_emails table not created yet')
        return []
      }
      console.warn('Error fetching user emails:', error)
      return []
    }

    return (data || []).map(row => ({
      email: row.email,
      type: row.email_type as 'primary' | 'leaguesafe' | 'alternate',
      verified: row.is_verified
    }))
  } catch (error) {
    console.warn('Exception fetching user emails:', error)
    return []
  }
}

/**
 * Add an email to a user account
 */
export async function addEmailToUser(
  userId: string, 
  email: string, 
  emailType: 'primary' | 'leaguesafe' | 'alternate' = 'alternate'
): Promise<boolean> {
  try {
    const cleanEmail = email.toLowerCase().trim()
    console.log(`📧 Adding ${emailType} email ${cleanEmail} to user ${userId}`)

    // Try direct insert first (works without the RPC function)
    const { error: directError } = await supabase
      .from('user_emails')
      .insert([{
        user_id: userId,
        email: cleanEmail,
        email_type: emailType,
        is_verified: false
      }])

    if (!directError) {
      console.log('✅ Email added via direct insert')
      return true
    }

    // If table doesn't exist, that's okay - we'll handle this gracefully
    if (directError.code === '42P01') { // relation does not exist
      console.log('⚠️ user_emails table not created yet, skipping email association')
      return true
    }

    // Try RPC function if direct insert failed for other reasons
    try {
      const { data, error } = await supabase
        .rpc('add_email_to_user', {
          p_user_id: userId,
          p_email: cleanEmail,
          p_email_type: emailType
        })

      if (error) {
        console.warn('RPC function not available:', error.message)
        return false
      }

      return data === true
    } catch (rpcError) {
      console.warn('RPC function failed, but direct insert also failed:', directError)
      return false
    }
  } catch (error) {
    console.warn('Exception adding email to user:', error)
    return false
  }
}

/**
 * Create a new user and handle email associations
 */
export async function createUserWithEmails(
  primaryEmail: string,
  displayName: string,
  additionalEmails: { email: string; type: 'leaguesafe' | 'alternate' }[] = [],
  isAdmin: boolean = false
): Promise<User | null> {
  try {
    const userId = generateUUID()
    const cleanEmail = primaryEmail.toLowerCase().trim()
    
    console.log('👤 Creating user:', { email: cleanEmail, displayName, userId, isAdmin })
    
    // Create the user with leaguesafe_email for backwards compatibility
    const leaguesafeEmail = additionalEmails.find(e => e.type === 'leaguesafe')?.email || null
    
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{
        id: userId,
        email: cleanEmail,
        display_name: displayName,
        leaguesafe_email: leaguesafeEmail,
        is_admin: isAdmin
      }])
      .select()
      .single()

    if (userError) {
      console.error('❌ Error creating user:', userError)
      return null
    }

    console.log('✅ User created successfully:', newUser.email)

    // Add primary email to user_emails table (if it exists)
    await addEmailToUser(userId, cleanEmail, 'primary')

    // Add additional emails
    for (const { email, type } of additionalEmails) {
      if (email && email !== cleanEmail) {
        await addEmailToUser(userId, email, type)
      }
    }

    return newUser
  } catch (error) {
    console.error('💥 Exception creating user:', error)
    return null
  }
}

/**
 * Match or create user for LeagueSafe import
 */
export async function matchOrCreateUserForLeagueSafe(
  leaguesafeEmail: string,
  leaguesafeName: string,
  isCommish: boolean = false
): Promise<UserMatchResult> {
  const email = leaguesafeEmail.toLowerCase().trim()
  
  console.log(`🎯 Matching/creating user for LeagueSafe: ${email} (${leaguesafeName})`)
  
  // First try to find existing user
  const existingUser = await findUserByAnyEmail(email)
  
  if (existingUser) {
    console.log(`✅ Found existing user: ${existingUser.email}`)
    
    // User exists, add LeagueSafe email if it's not already associated
    await addEmailToUser(existingUser.id, email, 'leaguesafe')
    
    // Get all emails for this user (fallback gracefully if function doesn't exist)
    const allEmails = await getUserEmails(existingUser.id)
    const matchedEmails = allEmails.length > 0 ? allEmails.map(e => e.email) : [email]
    
    return {
      user: existingUser,
      isNewUser: false,
      matchedEmails
    }
  }

  console.log(`👤 No existing user found, creating new user for: ${email}`)
  
  // User doesn't exist, create new one
  const newUser = await createUserWithEmails(
    email,
    leaguesafeName,
    [{ email, type: 'leaguesafe' }],
    isCommish
  )

  if (!newUser) {
    console.error(`❌ Failed to create user for: ${email}`)
    return {
      user: null,
      isNewUser: false,
      matchedEmails: []
    }
  }

  console.log(`✅ Created new user successfully: ${newUser.email}`)
  
  return {
    user: newUser,
    isNewUser: true,
    matchedEmails: [email]
  }
}

/**
 * Check for unmatched users and payments
 */
export async function getUnmatchedUsersAndPayments(season: number) {
  try {
    console.log('🔍 Getting unmatched users and payments for season:', season)

    // Get all users first
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('*')

    if (allUsersError) {
      console.error('Error fetching all users:', allUsersError)
      return { unmatchedUsers: [], unmatchedPayments: [] }
    }

    // Get all payments for this season
    const { data: allPayments, error: allPaymentsError } = await supabase
      .from('leaguesafe_payments')
      .select('*')
      .eq('season', season)

    if (allPaymentsError) {
      console.error('Error fetching all payments:', allPaymentsError)
      return { unmatchedUsers: [], unmatchedPayments: [] }
    }

    // Find users without payments for this season (including Manual Registration users)
    const usersWithPaymentIds = new Set(allPayments?.map(p => p.user_id).filter(Boolean) || [])
    const usersWithoutPayments = (allUsers || []).filter(user => {
      const hasPaymentForSeason = usersWithPaymentIds.has(user.id)
      const isManualRegistration = user.payment_status === 'Manual Registration'
      
      // Show users who either have no payment OR are manual registrations
      return !hasPaymentForSeason || isManualRegistration
    })

    // Find unmatched payments (payments without valid user_id or is_matched = false)
    const unmatchedPayments = (allPayments || []).filter(payment => {
      return !payment.user_id || payment.is_matched === false
    })

    console.log(`📊 Found ${usersWithoutPayments.length} users without payments`)
    console.log(`📊 Found ${unmatchedPayments.length} unmatched payments`)

    return {
      unmatchedUsers: usersWithoutPayments,
      unmatchedPayments: unmatchedPayments
    }
  } catch (error) {
    console.error('Exception getting unmatched users and payments:', error)
    return { unmatchedUsers: [], unmatchedPayments: [] }
  }
}