// Test the exact production code from the URL

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testProductionCode() {
  console.log('🧪 Testing production password reset code...')
  
  const code = 'ab427d1d-fc96-41ef-b8ed-90b12be84155'
  console.log(`🔑 Testing code: ${code}`)
  
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('❌ exchangeCodeForSession failed:')
      console.error('  Message:', error.message)
      console.error('  Code:', error.code)
      console.error('  Status:', error.status)
      console.error('  Full error:', JSON.stringify(error, null, 2))
    } else {
      console.log('✅ exchangeCodeForSession succeeded!')
      console.log('  Session:', data.session ? 'Present' : 'None')
      console.log('  User:', data.user ? `ID: ${data.user.id}` : 'None')
      console.log('  Full data:', JSON.stringify(data, null, 2))
    }
  } catch (exception) {
    console.error('💥 Exception during exchangeCodeForSession:', exception)
  }
}

testProductionCode().catch(console.error)