#!/usr/bin/env node

/**
 * Windows-optimized KprCli Device Authorization Flow
 * This version uses PowerShell for better Windows browser integration
 */

const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = process.env.KPRCLI_API_URL || 'http://localhost:3000';
const CLIENT_ID = 'kprcli-cli';
const CONFIG_FILE = path.join(os.homedir(), '.kprcli', 'credentials.json');

// Utility function to make HTTP requests
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error_description || json.error || 'Request failed'));
          }
        } catch (e) {
          reject(new Error('Invalid response from server'));
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

// Windows-optimized browser opening using PowerShell
function openBrowserWindows(url) {
  return new Promise((resolve) => {
    console.log(`🌐 Opening ${url} in your default browser...`);
    
    // Use PowerShell Start-Process for better Windows compatibility
    const powershell = spawn('powershell.exe', [
      '-Command',
      `Start-Process '${url}'`
    ], {
      windowsHide: true,
      stdio: 'ignore'
    });
    
    powershell.on('error', (err) => {
      console.log(`⚠️  Could not open browser automatically: ${err.message}`);
      console.log(`   Please manually open: ${url}`);
      resolve(false);
    });
    
    powershell.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Browser opened successfully!');
        resolve(true);
      } else {
        console.log(`⚠️  Browser command exited with code ${code}`);
        console.log(`   Please manually open: ${url}`);
        resolve(false);
      }
    });
    
    // Timeout after 3 seconds
    setTimeout(() => {
      powershell.kill();
      resolve(true); // Assume it worked if no error within 3 seconds
    }, 3000);
  });
}

// Prompt for user input with better Windows handling
function prompt(question) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

// Load and save credentials (same as before)
function loadCredentials() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

function saveCredentials(credentials) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(credentials, null, 2));
  console.log(`✅ Credentials saved to ${CONFIG_FILE}`);
}

// Get device information
function getDeviceInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    version: os.release(),
    user: os.userInfo().username,
    arch: os.arch(),
    type: os.type(),
  };
}

// Start device authorization flow
async function startDeviceAuth() {
  console.log('🚀 KprCli - AI-Powered Form Automation\n');
  console.log('Welcome to KprCli! Let\'s get you authenticated.\n');
  
  // Get device name with better default
  const defaultName = `${os.hostname()}-CLI`;
  const deviceName = (await prompt(`Device name [${defaultName}]: `)) || defaultName;
  
  try {
    // Step 1: Request device authorization
    console.log('\n⚡ Requesting device authorization...');
    
    const authResponse = await makeRequest(`${API_BASE_URL}/api/auth/device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_name: deviceName,
        device_info: getDeviceInfo(),
      }),
    });
    
    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval,
    } = authResponse;
    
    // Step 2: Display information
    console.log('\n📱 Device Authorization Required');
    console.log('═══════════════════════════════════════');
    console.log(`🔗 Visit: ${verification_uri_complete}`);
    console.log(`🏷️  Code: ${user_code}`);
    console.log(`⏰ Expires: ${Math.floor(expires_in / 60)} minutes\n`);
    
    // Step 3: Ask to open browser
    const shouldOpen = await prompt('Open browser automatically? [Y/n]: ');
    if (!shouldOpen || shouldOpen.toLowerCase() === 'y' || shouldOpen.toLowerCase() === 'yes') {
      await openBrowserWindows(verification_uri_complete);
    } else {
      console.log(`\n👆 Please manually open: ${verification_uri_complete}`);
    }
    
    // Step 4: Poll for token
    console.log('\n⏳ Waiting for authorization...');
    console.log('   (Complete the authorization in your browser)');
    
    let polling = true;
    let attempts = 0;
    const maxAttempts = Math.floor(expires_in / interval);
    
    while (polling && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
      
      try {
        const tokenResponse = await makeRequest(`${API_BASE_URL}/api/auth/device/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: device_code,
            client_id: CLIENT_ID,
          }),
        });
        
        // Success!
        const { access_token, expires_in } = tokenResponse;
        
        console.log('\n🎉 Successfully authenticated!');
        console.log('═══════════════════════════════════════');
        
        // Save credentials
        const credentials = {
          access_token,
          device_name: deviceName,
          device_info: getDeviceInfo(),
          authenticated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        };
        
        saveCredentials(credentials);
        console.log('\n🚀 You\'re all set! You can now use KprCli commands.');
        console.log(`   Device: ${deviceName}`);
        console.log(`   Token expires: ${new Date(credentials.expires_at).toLocaleString()}`);
        
        polling = false;
        
      } catch (error) {
        const errorMessage = error.message || '';
        
        if (errorMessage.includes('authorization_pending')) {
          // Still waiting
          process.stdout.write('.');
          attempts++;
        } else if (errorMessage.includes('slow_down')) {
          // Rate limited
          process.stdout.write('⏱️');
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        } else if (errorMessage.includes('access_denied')) {
          console.log('\n❌ Authorization was denied.');
          polling = false;
        } else if (errorMessage.includes('expired_token')) {
          console.log('\n⏰ Device code expired. Please try again.');
          polling = false;
        } else {
          console.log(`\n❌ Error: ${errorMessage}`);
          polling = false;
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏰ Device code expired. Please try again.');
    }
    
  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('   Make sure the KprCli server is running on http://localhost:3000');
    }
    process.exit(1);
  }
}

// Check authentication status
async function checkAuth() {
  const credentials = loadCredentials();
  
  if (credentials && new Date(credentials.expires_at) > new Date()) {
    console.log('✅ Already authenticated!');
    console.log(`   Device: ${credentials.device_name}`);
    console.log(`   Authenticated: ${new Date(credentials.authenticated_at).toLocaleString()}`);
    console.log(`   Expires: ${new Date(credentials.expires_at).toLocaleString()}`);
    return true;
  }
  
  if (credentials) {
    console.log('⚠️  Authentication expired. Please re-authenticate.');
  }
  
  return false;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'logout') {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
      console.log('✅ Successfully logged out');
    } else {
      console.log('ℹ️  Not logged in');
    }
    return;
  }
  
  if (command === 'whoami') {
    const credentials = loadCredentials();
    if (credentials) {
      console.log('📱 Device Information');
      console.log('═══════════════════════════════════════');
      console.log(`Device: ${credentials.device_name}`);
      console.log(`Platform: ${credentials.device_info?.platform} ${credentials.device_info?.arch}`);
      console.log(`Hostname: ${credentials.device_info?.hostname}`);
      console.log(`User: ${credentials.device_info?.user}`);
      console.log(`Authenticated: ${new Date(credentials.authenticated_at).toLocaleString()}`);
      console.log(`Expires: ${new Date(credentials.expires_at).toLocaleString()}`);
      
      // Check if token is still valid
      if (new Date(credentials.expires_at) > new Date()) {
        console.log('Status: ✅ Active');
      } else {
        console.log('Status: ⚠️ Expired');
      }
    } else {
      console.log('❌ Not authenticated. Run without arguments to log in.');
    }
    return;
  }
  
  // Check if already authenticated
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    await startDeviceAuth();
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  console.log('\n\n👋 Authentication cancelled.');
  process.exit(0);
});

// Run the CLI
main().catch((error) => {
  console.error('\n💥 Unexpected error:', error.message);
  process.exit(1);
});