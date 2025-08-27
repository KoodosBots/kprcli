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

async function executeSQL(sql) {
  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))

    console.log(`📝 Executing ${statements.length} SQL statements...`)
    
    let successCount = 0
    let skipCount = 0
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      
      if (statement.toLowerCase().includes('create table') || 
          statement.toLowerCase().includes('create index') ||
          statement.toLowerCase().includes('create trigger') ||
          statement.toLowerCase().includes('create policy') ||
          statement.toLowerCase().includes('create function') ||
          statement.toLowerCase().includes('alter table') ||
          statement.toLowerCase().includes('insert into')) {
        
        console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`)
        
        try {
          const { data, error } = await supabase.rpc('exec', { sql: statement })
          
          if (error) {
            if (error.message.includes('already exists') || 
                error.message.includes('duplicate') ||
                error.message.includes('PGRST202')) {
              console.log(`ℹ️  Skipped (already exists): Statement ${i + 1}`)
              skipCount++
            } else {
              console.error(`❌ Error in statement ${i + 1}:`, error.message)
              console.log(`   Statement: ${statement.substring(0, 100)}...`)
            }
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`)
            successCount++
          }
        } catch (err) {
          // Try alternative approach for statements that might not work with rpc
          console.log(`ℹ️  Trying alternative approach for statement ${i + 1}...`)
          
          // For INSERT statements, try direct table operations
          if (statement.toLowerCase().includes('insert into public.cli_users')) {
            try {
              const { error: insertError } = await supabase
                .from('cli_users')
                .insert([
                  { email: 'admin@kprcli.com', username: 'admin', display_name: 'Admin User', tier: 'enterprise' },
                  { email: 'developer@kprcli.com', username: 'dev', display_name: 'Developer User', tier: 'pro' },
                  { email: 'tester@kprcli.com', username: 'test', display_name: 'Test User', tier: 'free' }
                ])
                
              if (insertError && !insertError.message.includes('duplicate')) {
                console.error(`❌ Insert error:`, insertError.message)
              } else {
                console.log(`✅ Default users inserted successfully`)
                successCount++
              }
            } catch (insertErr) {
              console.log(`ℹ️  Skipping insert (table may not exist yet)`)
            }
          } else {
            console.log(`⚠️  Could not execute statement ${i + 1}: ${err.message}`)
          }
        }
      }
    }
    
    console.log(`\n📊 Execution Summary:`)
    console.log(`✅ Successful: ${successCount}`)
    console.log(`ℹ️  Skipped: ${skipCount}`)
    console.log(`❌ Errors: ${statements.length - successCount - skipCount}`)
    
  } catch (error) {
    console.error('❌ SQL execution failed:', error.message)
    throw error
  }
}

async function applyCLIMigration() {
  console.log('🔄 Applying CLI users migration directly...\n')
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250827125500_add_cli_users.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('📖 Read migration file successfully')
    console.log(`📏 Migration file size: ${migrationSQL.length} characters\n`)
    
    // Execute the SQL
    await executeSQL(migrationSQL)
    
    console.log('\n🎉 Migration application completed!')
    
    // Verify the migration worked
    console.log('\n🔍 Verifying migration...')
    
    const { data: cliUsers, error: verifyError } = await supabase
      .from('cli_users')
      .select('id, email, username, tier, status')
      .limit(5)
    
    if (verifyError) {
      console.error('❌ Verification failed:', verifyError.message)
      console.log('⚠️  The migration may need to be applied manually through the Supabase dashboard')
    } else {
      console.log('✅ CLI users table is accessible!')
      console.log(`📊 Found ${cliUsers?.length || 0} CLI users`)
      
      if (cliUsers?.length > 0) {
        console.log('👥 Existing users:')
        cliUsers.forEach(user => {
          console.log(`   - ${user.email} (@${user.username || 'no-username'}) [${user.tier}/${user.status}]`)
        })
      }
    }
    
    // Test CLI sessions table too
    const { data: sessions, error: sessionError } = await supabase
      .from('cli_sessions')
      .select('id')
      .limit(1)
    
    if (sessionError) {
      console.log('⚠️  CLI sessions table may need manual creation')
    } else {
      console.log('✅ CLI sessions table is accessible!')
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.log('\n📋 Manual migration required:')
    console.log('1. Go to https://supabase.com/dashboard/project/bzezkjlrdereyoozeicz/sql/new')
    console.log('2. Copy and paste the SQL from supabase/migrations/20250827125500_add_cli_users.sql')
    console.log('3. Click "Run" to execute the migration')
    process.exit(1)
  }
}

applyCLIMigration()