const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyCLIUsersMigration() {
  console.log('🔄 Applying CLI users migration...')
  
  try {
    // Check if cli_users table already exists
    console.log('🔍 Checking if cli_users table exists...')
    
    const { data: existingCliUsers, error: checkError } = await supabase
      .from('cli_users')
      .select('id')
      .limit(1)
    
    if (!checkError) {
      console.log('✅ CLI users table already exists!')
      
      // Check how many users we have
      const { data: users, error: countError } = await supabase
        .from('cli_users')
        .select('email, username, tier, status')
      
      if (!countError) {
        console.log(`📊 Found ${users?.length || 0} CLI users`)
        if (users?.length > 0) {
          console.log('   Existing users:')
          users.forEach(user => {
            console.log(`   - ${user.email} (@${user.username || 'no-username'}) [${user.tier}/${user.status}]`)
          })
        }
      }
      return
    }
    
    if (checkError && !checkError.message.includes('does not exist')) {
      console.error('❌ Error checking table:', checkError.message)
      return
    }
    
    console.log('📝 CLI users table does not exist, applying migration...')
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250827125500_add_cli_users.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('⚠️  Manual migration required!')
    console.log('Please copy the following SQL to your Supabase SQL editor:')
    console.log('='.repeat(80))
    console.log(migrationSQL)
    console.log('='.repeat(80))
    console.log('\n📋 Steps to apply migration:')
    console.log('1. Go to https://supabase.com/dashboard/project/bzezkjlrdereyoozeicz/sql/new')
    console.log('2. Copy and paste the SQL above')
    console.log('3. Click "Run" to execute the migration')
    console.log('4. Run this script again to verify the migration')
    
  } catch (error) {
    if (error.message.includes('relation "cli_users" does not exist')) {
      console.log('📝 CLI users table does not exist, reading migration file...')
      
      // Read the migration file
      const migrationPath = path.join(__dirname, '../supabase/migrations/20250827125500_add_cli_users.sql')
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
      
      console.log('⚠️  Manual migration required!')
      console.log('Please copy the following SQL to your Supabase SQL editor:')
      console.log('='.repeat(80))
      console.log(migrationSQL)
      console.log('='.repeat(80))
      console.log('\n📋 Steps to apply migration:')
      console.log('1. Go to https://supabase.com/dashboard/project/bzezkjlrdereyoozeicz/sql/new')
      console.log('2. Copy and paste the SQL above')
      console.log('3. Click "Run" to execute the migration')
      console.log('4. Run this script again to verify the migration')
    } else {
      console.error('❌ Migration check failed:', error.message)
      process.exit(1)
    }
  }
}

applyCLIUsersMigration()