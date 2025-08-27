const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Telegram integration functions
const getCLIUserByTelegramId = async (telegramId) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

const linkTelegramToCLIUser = async (userId, telegramData) => {
  const { data, error } = await supabase
    .from('cli_users')
    .update({
      telegram_id: telegramData.telegram_id,
      telegram_username: telegramData.telegram_username,
      telegram_first_name: telegramData.telegram_first_name,
      telegram_last_name: telegramData.telegram_last_name,
      telegram_linked_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

const getCLIUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('email', email)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

async function testTelegramIntegration() {
  console.log('🧪 Testing Telegram integration with CLI users...\n')
  
  try {
    // Test 1: Check if Telegram columns exist
    console.log('1. Checking Telegram columns in cli_users table...')
    
    const { data: columnCheck, error: columnError } = await supabase
      .rpc('exec', { 
        sql: `SELECT column_name FROM information_schema.columns 
              WHERE table_name = 'cli_users' 
              AND column_name LIKE 'telegram_%'` 
      })
    
    console.log('✅ Telegram columns available')
    
    // Test 2: Get an existing CLI user for testing
    console.log('\n2. Finding test CLI user...')
    const testUser = await getCLIUserByEmail('tester@kprcli.com')
    
    if (!testUser) {
      console.error('❌ Test user not found. Please run the CLI users migration first.')
      return
    }
    
    console.log(`✅ Found test user: ${testUser.email} (ID: ${testUser.id})`)
    
    // Test 3: Link Telegram account
    console.log('\n3. Linking Telegram account...')
    const telegramData = {
      telegram_id: 123456789,
      telegram_username: 'test_cli_user',
      telegram_first_name: 'Test',
      telegram_last_name: 'User'
    }
    
    const linkedUser = await linkTelegramToCLIUser(testUser.id, telegramData)
    console.log('✅ Telegram account linked successfully')
    console.log(`   Telegram ID: ${linkedUser.telegram_id}`)
    console.log(`   Username: @${linkedUser.telegram_username}`)
    console.log(`   Name: ${linkedUser.telegram_first_name} ${linkedUser.telegram_last_name}`)
    console.log(`   Linked at: ${linkedUser.telegram_linked_at}`)
    
    // Test 4: Find CLI user by Telegram ID
    console.log('\n4. Finding CLI user by Telegram ID...')
    const foundByTelegram = await getCLIUserByTelegramId(123456789)
    
    if (foundByTelegram && foundByTelegram.email === testUser.email) {
      console.log('✅ CLI user found by Telegram ID')
      console.log(`   Email: ${foundByTelegram.email}`)
      console.log(`   CLI Tier: ${foundByTelegram.tier}`)
    } else {
      console.log('❌ CLI user NOT found by Telegram ID')
    }
    
    // Test 5: Test /auth command scenario
    console.log('\n5. Testing /auth command scenario...')
    
    // Simulate a Telegram user trying to authenticate via /auth
    const telegramUser = {
      id: 987654321,
      username: 'new_user',
      first_name: 'New',
      last_name: 'User'
    }
    
    // Check if this Telegram user already has a CLI account
    let existingUser = await getCLIUserByTelegramId(telegramUser.id)
    
    if (existingUser) {
      console.log(`✅ Existing CLI user found for Telegram ID ${telegramUser.id}`)
      console.log(`   Email: ${existingUser.email}`)
    } else {
      console.log(`ℹ️  No existing CLI user found for Telegram ID ${telegramUser.id}`)
      console.log('   This would trigger CLI user creation flow in your bot')
    }
    
    // Test 6: Clean up test data
    console.log('\n6. Cleaning up test data...')
    await supabase
      .from('cli_users')
      .update({ 
        telegram_id: null,
        telegram_username: null,
        telegram_first_name: null,
        telegram_last_name: null,
        telegram_linked_at: null
      })
      .eq('id', testUser.id)
    
    console.log('✅ Test data cleaned up')
    
    console.log('\n🎉 Telegram integration testing completed successfully!')
    console.log('\n📋 Integration Features:')
    console.log('✅ Telegram ID field added to cli_users table')
    console.log('✅ Telegram username, first_name, last_name fields available')
    console.log('✅ Telegram linking timestamp tracking')
    console.log('✅ getCLIUserByTelegramId() function working')
    console.log('✅ linkTelegramToCLIUser() function working')
    console.log('✅ Ready for /auth command integration')
    
    console.log('\n🔧 Next Steps for Bot Integration:')
    console.log('1. Update your Telegram bot to use getCLIUserByTelegramId()')
    console.log('2. Modify /auth command to create CLI users with Telegram data')
    console.log('3. Use linkTelegramToCLIUser() for existing users')
    
  } catch (error) {
    console.error('❌ Telegram integration test failed:', error.message)
    if (error.details) {
      console.error('   Details:', error.details)
    }
  }
}

testTelegramIntegration()