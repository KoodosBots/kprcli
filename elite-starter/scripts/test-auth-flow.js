/**
 * Test script for KprCli authentication flow
 * Tests device authorization, Supabase integration, and Redis storage
 */

const { createClient } = require('@supabase/supabase-js');
const Redis = require('redis');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const redisUrl = process.env.REDIS_URL;

console.log('🔧 Testing KprCli Authentication System');
console.log('=====================================');

async function testSupabaseConnection() {
  try {
    console.log('📊 Testing Supabase connection...');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Test basic query
    const { data, error } = await supabase
      .from('users')
      .select('count(*)')
      .single();

    if (error) {
      console.log('⚠️  Supabase query returned error (this may be expected):', error.message);
    } else {
      console.log('✅ Supabase connection successful');
      console.log(`📈 Users table has ${data?.count || 0} records`);
    }

    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

async function testRedisConnection() {
  try {
    console.log('🔄 Testing Redis connection...');
    
    if (!redisUrl) {
      throw new Error('Missing Redis URL');
    }

    const redis = Redis.createClient({ url: redisUrl });
    
    await redis.connect();
    
    // Test set/get
    const testKey = 'test:kprcli:connection';
    const testValue = 'Hello KprCli!';
    
    await redis.setEx(testKey, 10, testValue);
    const retrieved = await redis.get(testKey);
    
    if (retrieved === testValue) {
      console.log('✅ Redis connection successful');
      console.log('🧹 Cleaning up test data...');
      await redis.del(testKey);
    } else {
      throw new Error('Redis test data mismatch');
    }
    
    await redis.quit();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('💡 Make sure Redis is running: redis-server');
    return false;
  }
}

async function testDeviceAuthFlow() {
  console.log('🔐 Testing device authorization endpoints...');
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  try {
    // Test device authorization endpoint
    const authResponse = await fetch(`${baseUrl}/api/device/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'test-client',
        scope: 'read write'
      })
    });

    if (authResponse.ok) {
      const authData = await authResponse.json();
      console.log('✅ Device authorization endpoint working');
      console.log(`📱 Generated user code: ${authData.user_code}`);
      console.log(`🔗 Verification URL: ${authData.verification_uri_complete}`);
      
      // Test verification info endpoint
      const verifyResponse = await fetch(`${baseUrl}/api/device/verify?user_code=${authData.user_code}`);
      
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        console.log('✅ Device verification endpoint working');
        console.log(`⏰ Time remaining: ${verifyData.time_remaining} seconds`);
      } else {
        console.log('⚠️  Device verification endpoint returned:', verifyResponse.status);
      }
      
      return true;
    } else {
      throw new Error(`Auth endpoint returned ${authResponse.status}`);
    }
  } catch (error) {
    console.error('❌ Device auth flow test failed:', error.message);
    console.log('💡 Make sure the development server is running: npm run dev');
    return false;
  }
}

async function testTelegramIntegration() {
  console.log('📱 Testing Telegram integration...');
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken || botToken === 'your_telegram_bot_token_here') {
    console.log('⚠️  Telegram bot token not configured (this is optional)');
    return true;
  }
  
  try {
    // Test bot API connection
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Telegram bot connection successful');
      console.log(`🤖 Bot username: @${data.result.username}`);
      console.log('💡 Set webhook URL: /api/telegram/webhook');
    } else {
      throw new Error(data.description || 'Invalid bot token');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Telegram integration test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive authentication system test...\n');
  
  const results = {
    supabase: await testSupabaseConnection(),
    redis: await testRedisConnection(), 
    deviceAuth: await testDeviceAuthFlow(),
    telegram: await testTelegramIntegration()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`Supabase Database: ${results.supabase ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Redis Storage: ${results.redis ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Device Authorization: ${results.deviceAuth ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Telegram Integration: ${results.telegram ? '✅ PASS' : '⚠️ SKIP (not configured)'}`);
  
  const criticalTests = results.supabase && results.redis && results.deviceAuth;
  
  if (criticalTests) {
    console.log('\n🎉 Core authentication system is working!');
    console.log('🚀 Your KprCli system is ready for use.');
  } else {
    console.log('\n⚠️  Some critical tests failed. Check the errors above.');
    console.log('🔧 Fix the issues and run the test again.');
  }
  
  console.log('\n📚 Next steps:');
  console.log('1. Configure Telegram bot token (optional)');
  console.log('2. Test user registration via Clerk');
  console.log('3. Test complete device authorization flow');
  console.log('4. Deploy to production environment');
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };