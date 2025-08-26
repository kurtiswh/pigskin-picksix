// Simple test script to debug password reset functionality

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testPasswordReset() {
  console.log('🧪 Testing password reset functionality...')
  
  const testEmail = 'test@example.com'
  console.log(`📧 Attempting password reset for: ${testEmail}`)
  
  try {
    // Test the exact same call that our service makes
    const redirectUrl = 'http://localhost:5174/reset-password'
    console.log(`🔗 Using redirect URL: ${redirectUrl}`)
    
    const { data, error } = await supabase.auth.resetPasswordForEmail(testEmail, {
      redirectTo: redirectUrl
    })
    
    console.log('📊 Supabase response:', {
      data,
      error: error ? {
        message: error.message,
        code: error.code,
        status: error.status
      } : null
    })
    
    if (error) {
      console.error('❌ Password reset failed:', error.message)
    } else {
      console.log('✅ Password reset email should have been sent')
      console.log('📧 Check your email for the reset link')
    }
  } catch (exception) {
    console.error('💥 Exception during password reset test:', exception)
  }
}

testPasswordReset().catch(console.error)