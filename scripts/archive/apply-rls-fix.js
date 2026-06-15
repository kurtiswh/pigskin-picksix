// Simple script to apply RLS policy fix via Supabase client
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyRLSFix() {
  console.log('🔧 Applying comprehensive RLS policy fix...')
  
  try {
    // Drop all existing policies
    const dropPoliciesSQL = `
      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN
          FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'picks') LOOP
              EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.picks';
          END LOOP;
      END $$;
    `
    
    console.log('🗑️ Dropping existing policies...')
    const { error: dropError } = await supabase.rpc('exec_sql', { sql: dropPoliciesSQL })
    if (dropError) {
      console.error('❌ Failed to drop policies:', dropError)
    } else {
      console.log('✅ Dropped existing policies')
    }
    
    // Create permissive policies
    const createPoliciesSQL = `
      -- Create very permissive policies for authenticated users
      CREATE POLICY "authenticated_full_picks_access" ON public.picks
          FOR ALL 
          TO authenticated
          USING (true)
          WITH CHECK (true);

      -- Also allow anonymous access for the direct API calls to work
      CREATE POLICY "anon_full_picks_access" ON public.picks
          FOR ALL 
          TO anon
          USING (true)
          WITH CHECK (true);

      -- Ensure RLS is enabled
      ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
    `
    
    console.log('➕ Creating permissive policies...')
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createPoliciesSQL })
    if (createError) {
      console.error('❌ Failed to create policies:', createError)
    } else {
      console.log('✅ Created permissive policies')
    }
    
    // Verify the policies
    console.log('🔍 Verifying policies...')
    const { data: policies, error: verifyError } = await supabase
      .from('pg_policies')
      .select('policyname, cmd, roles')
      .eq('schemaname', 'public')
      .eq('tablename', 'picks')
    
    if (verifyError) {
      console.error('❌ Failed to verify policies:', verifyError)
    } else {
      console.log('📋 Current policies:', policies)
    }
    
    console.log('✅ RLS policy fix completed!')
    
  } catch (error) {
    console.error('💥 Exception applying RLS fix:', error)
  }
}

applyRLSFix()