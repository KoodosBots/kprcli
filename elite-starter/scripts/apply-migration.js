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

async function applyMigration() {
  console.log('🔄 Applying customer management migration...')
  
  try {
    // First, let's check if tables already exist
    console.log('🔍 Checking existing tables...')
    
    // Check for customer_profiles table
    const { data: existingTables } = await supabase
      .from('customer_profiles')
      .select('id')
      .limit(1)
    
    if (existingTables !== null) {
      console.log('✅ Customer management tables already exist!')
      return
    }
    
    console.log('📝 Tables do not exist, reading migration file...')
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250827120000_add_customer_management.sql')
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
    if (error.message.includes('relation "customer_profiles" does not exist')) {
      console.log('📝 Tables do not exist, reading migration file...')
      
      // Read the migration file
      const migrationPath = path.join(__dirname, '../supabase/migrations/20250827120000_add_customer_management.sql')
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

applyMigration()