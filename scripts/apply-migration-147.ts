import { supabase } from '../src/lib/supabase'
import * as fs from 'fs'
import * as path from 'path'

async function applyMigration() {
  try {
    console.log('📦 Reading migration file...')
    const migrationPath = path.join(__dirname, '../database/migrations/147_create_season_winners.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    console.log('🚀 Applying migration 147...')

    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }

    console.log('✅ Migration 147 applied successfully!')

    // Verify the table exists
    const { data, error: verifyError } = await supabase
      .from('season_winners')
      .select('*')
      .limit(1)

    if (verifyError) {
      console.error('⚠️ Table verification failed:', verifyError)
    } else {
      console.log('✅ Table season_winners verified')
    }

  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

applyMigration()
