import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('📊 Game statistics update cron job started')

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current time
    const now = new Date()
    console.log(`📅 Current time: ${now.toISOString()}`)

    // Call the scheduled_game_statistics database function
    console.log('🔄 Calling scheduled_game_statistics() function...')

    const { data, error } = await supabase.rpc('scheduled_game_statistics')

    if (error) {
      console.error('❌ Error calling scheduled_game_statistics:', error)
      throw error
    }

    console.log('✅ Game statistics function completed:', data)

    // Parse the result
    const result = data && data.length > 0 ? data[0] : null
    const gamesUpdated = result?.games_updated || 0
    const statisticsCalculated = result?.statistics_calculated || 0
    const errors = result?.errors || []

    console.log(`📊 Statistics Update Results:`)
    console.log(`   Games updated: ${gamesUpdated}`)
    console.log(`   Statistics calculated: ${statisticsCalculated}`)
    console.log(`   Errors: ${errors.length}`)

    if (errors.length > 0) {
      console.error('⚠️ Errors during statistics update:', errors)
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        message: `Game statistics updated: ${gamesUpdated} games, ${statisticsCalculated} statistics calculated`,
        gamesUpdated,
        statisticsCalculated,
        errors,
        timestamp: now.toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Game statistics update error:', error)

    return new Response(
      JSON.stringify({
        error: 'Game statistics update failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
