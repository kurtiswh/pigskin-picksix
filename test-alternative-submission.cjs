// Test alternative submission approaches to bypass the trigger issue
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY
)

async function testAlternativeSubmission() {
  console.log('🧪 Testing alternative submission methods...')
  
  const testUserId = 'ba84da74-626d-4f6d-ac21-4211fe4c1eec' // Your user ID from console
  const testWeek = 3
  const testSeason = 2025
  
  try {
    // Method 1: Update picks one by one instead of bulk
    console.log('\n1. Testing individual pick updates...')
    
    const { data: picks, error: fetchError } = await supabase
      .from('picks')
      .select('id')
      .eq('user_id', testUserId)
      .eq('week', testWeek)
      .eq('season', testSeason)
    
    if (fetchError) {
      console.log('❌ Error fetching picks:', fetchError)
      return
    }
    
    console.log('Found picks to update:', picks?.length || 0)
    
    if (picks && picks.length > 0) {
      // Try updating just one pick first
      const { data, error } = await supabase
        .from('picks')
        .update({ 
          submitted: true,
          submitted_at: new Date().toISOString()
        })
        .eq('id', picks[0].id)
        .select()
      
      if (error) {
        console.log('❌ Individual update failed:', error.message)
      } else {
        console.log('✅ Individual update worked!')
        
        // If that worked, try updating all of them individually
        console.log('Trying to update all picks individually...')
        let successCount = 0
        
        for (const pick of picks) {
          const { error: updateError } = await supabase
            .from('picks')
            .update({ 
              submitted: true,
              submitted_at: new Date().toISOString()
            })
            .eq('id', pick.id)
          
          if (updateError) {
            console.log(`❌ Failed to update pick ${pick.id}:`, updateError.message)
            break
          } else {
            successCount++
          }
        }
        
        console.log(`✅ Successfully updated ${successCount}/${picks.length} picks individually`)
      }
    }
    
    // Method 2: Try using RPC call instead of direct table update
    console.log('\n2. Testing RPC-based submission...')
    
    // First check if there's a submission RPC function available
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('submit_user_picks', { 
        p_user_id: testUserId,
        p_week: testWeek,
        p_season: testSeason
      })
    
    if (rpcError) {
      if (rpcError.code === 'PGRST202') {
        console.log('ℹ️ No submit_user_picks RPC function exists (expected)')
      } else {
        console.log('❌ RPC failed:', rpcError.message)
      }
    } else {
      console.log('✅ RPC submission worked:', rpcResult)
    }
    
  } catch (err) {
    console.error('❌ Test error:', err)
  }
}

testAlternativeSubmission()