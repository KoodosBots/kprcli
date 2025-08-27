#!/usr/bin/env node

/**
 * KprCli Device Authorization Flow Example
 * This demonstrates how CLI tools can authenticate using the device flow
 * Similar to how Convex CLI authenticates (npx convex dev)
 */

const https = require('https');
const http = require('http');
const { exec } = require('child_process');
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

// Load saved credentials
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

// Save credentials
function saveCredentials(credentials) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(credentials, null, 2));
  console.log(`✔ Saved credentials to ${CONFIG_FILE}`);
}

// Get device information
function getDeviceInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    version: os.release(),
    user: os.userInfo().username,
  };
}

// Open URL in browser
function openBrowser(url) {
  const platform = os.platform();
  let command;
  
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    // Use start with empty title to prevent opening cmd window
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  exec(command, { windowsHide: true }, (err) => {
    if (err) {
      console.log(`❌ Could not open browser automatically.`);
      console.log(`   Manually open ${url} in your browser to log in.`);
    }
  });
}

// Prompt for user input
function prompt(question) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

// Start device authorization flow
async function startDeviceAuth() {
  console.log('Welcome to KprCli! Let\'s get you authenticated.\n');
  
  // Get device name
  const deviceName = await prompt('? Device name: ') || os.hostname();
  
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
    
    // Step 2: Display user code and URL
    console.log(`\nVisit ${verification_uri_complete} to finish logging in.`);
    console.log(`You should see the following code which expires in ${Math.floor(expires_in / 60)} minutes: ${user_code}\n`);
    
    // Step 3: Ask to open browser
    const shouldOpen = await prompt('? Open the browser? (Y/n) ');
    if (!shouldOpen || shouldOpen.toLowerCase() === 'y') {
      console.log(`Opening ${verification_uri_complete} in your browser...\n`);
      openBrowser(verification_uri_complete);
    }
    
    // Step 4: Poll for token
    console.log('⏳ Waiting for authorization...');
    
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
        
        // Success! We got the token
        const { access_token, expires_in } = tokenResponse;
        
        console.log('\n✅ Successfully authenticated!');
        
        // Save credentials
        const credentials = {
          access_token,
          device_name: deviceName,
          authenticated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        };
        
        saveCredentials(credentials);
        console.log('\n🚀 You\'re all set! You can now use KprCli commands.');
        
        polling = false;
        
      } catch (error) {
        // Check error type
        const errorMessage = error.message || '';
        
        if (errorMessage.includes('authorization_pending')) {
          // Still waiting for user to authorize
          process.stdout.write('.');
          attempts++;
        } else if (errorMessage.includes('slow_down')) {
          // Rate limited, increase interval
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        } else if (errorMessage.includes('access_denied')) {
          console.log('\n❌ Authorization was denied.');
          polling = false;
        } else if (errorMessage.includes('expired_token')) {
          console.log('\n⏱️  Device code expired. Please try again.');
          polling = false;
        } else {
          console.log(`\n❌ Error: ${errorMessage}`);
          polling = false;
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏱️  Device code expired. Please try again.');
    }
    
  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);
    process.exit(1);
  }
}

// Check if already authenticated
async function checkAuth() {
  const credentials = loadCredentials();
  
  if (credentials && new Date(credentials.expires_at) > new Date()) {
    console.log('✅ Already authenticated as:', credentials.device_name);
    console.log('   Token expires:', new Date(credentials.expires_at).toLocaleString());
    return true;
  }
  
  return false;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🚀 KprCli - AI-Powered Form Automation\n');
  
  if (command === 'logout') {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
      console.log('✔ Successfully logged out');
    } else {
      console.log('Not logged in');
    }
    return;
  }
  
  if (command === 'whoami') {
    const credentials = loadCredentials();
    if (credentials) {
      console.log('Device:', credentials.device_name);
      console.log('Authenticated:', new Date(credentials.authenticated_at).toLocaleString());
      console.log('Expires:', new Date(credentials.expires_at).toLocaleString());
    } else {
      console.log('Not authenticated. Run `kprcli auth` to log in.');
    }
    return;
  }
  
  // Check if authenticated
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    await startDeviceAuth();
  }
}

// Run the CLI
main().catch(console.error);