// Vercel serverless function for completing password reset
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Password reset completion API called')
    
    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY environment variable not set')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Create Supabase client with service role key (has admin privileges)
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const { email, newPassword, token } = req.body

    if (!email || !newPassword || !token) {
      console.error('Missing required fields in request body')
      return res.status(400).json({ error: 'Email, password, and token are required' })
    }

    console.log(`Completing password reset for: ${email}`)

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.error(`Invalid email format: ${email}`)
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Basic token validation
    if (!token || token.length < 16) {
      console.error('Invalid token format')
      return res.status(400).json({ error: 'Invalid reset token' })
    }

    // Find the auth user by email using service role
    console.log(`🔍 Finding auth account for email: ${email}`)
    
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('❌ Error listing auth users:', listError)
      return res.status(500).json({ error: 'Failed to access authentication system' })
    }

    const authUser = authUsers.users.find(u => u.email === email)

    if (!authUser) {
      console.error(`❌ No auth account found for email: ${email}`)
      return res.status(404).json({ error: 'Authentication account not found' })
    }

    console.log(`✅ Found auth account: ${authUser.id}`)

    // Update the password using Supabase Auth Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('❌ Error updating password:', updateError)
      return res.status(500).json({ error: 'Failed to update password' })
    }

    console.log(`✅ Password reset completed successfully for ${email}`)
    return res.status(200).json({ success: true })

  } catch (error) {
    console.error('Exception in password reset completion API:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    })
  }
}