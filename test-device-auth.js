#!/usr/bin/env node

/**
 * Quick test of the device authorization flow
 * This demonstrates the API calls without user interaction
 */

const https = require('https');
const http = require('http');

const API_BASE_URL = 'http://localhost:3000';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`${options.method || 'GET'} ${url} - ${res.statusCode}`);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          console.log(`${options.method || 'GET'} ${url} - ${res.statusCode} (non-JSON)`);
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testDeviceAuth() {
  console.log('🧪 Testing KprCli Device Authorization Flow\n');
  
  try {
    // Step 1: Request device authorization
    console.log('1️⃣  Requesting device authorization...');
    const authResponse = await makeRequest(`${API_BASE_URL}/api/auth/device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'test-client',
        device_name: 'Test Device',
        device_info: {
          platform: 'test',
          version: '1.0.0',
          hostname: 'test-host',
        },
      }),
    });
    
    if (authResponse.status === 200) {
      console.log('✅ Device authorization created successfully!');
      console.log(`   User Code: ${authResponse.data.user_code}`);
      console.log(`   Device Code: ${authResponse.data.device_code.substring(0, 8)}...`);
      console.log(`   Verification URI: ${authResponse.data.verification_uri}`);
      console.log(`   Complete URI: ${authResponse.data.verification_uri_complete}`);
      console.log(`   Expires in: ${authResponse.data.expires_in} seconds`);
      console.log(`   Poll interval: ${authResponse.data.interval} seconds\n`);
      
      // Step 2: Test token polling (should return pending)
      console.log('2️⃣  Testing token polling (should be pending)...');
      const pollResponse = await makeRequest(`${API_BASE_URL}/api/auth/device/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: authResponse.data.device_code,
          client_id: 'test-client',
        }),
      });
      
      if (pollResponse.status === 400 && pollResponse.data.error === 'authorization_pending') {
        console.log('✅ Token polling working correctly (authorization pending)');
      } else {
        console.log('❌ Unexpected polling response:', pollResponse);
      }
      
      console.log('\n🎯 Test completed successfully!');
      console.log(`\n👤 To complete the flow manually:`);
      console.log(`   1. Visit: ${authResponse.data.verification_uri_complete}`);
      console.log(`   2. Sign in with Clerk`);
      console.log(`   3. Approve the device`);
      console.log(`   4. The CLI would then receive the access token`);
      
    } else {
      console.log('❌ Failed to create device authorization:', authResponse);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDeviceAuth();