#!/usr/bin/env node
/**
 * Check environment variables
 * This script loads .env.local using dotenv and checks required variables
 */

const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

console.log('📋 Environment Variables Check\n');
console.log('=' .repeat(50));

const required = {
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY': 'Clerk Publishable Key',
  'CLERK_SECRET_KEY': 'Clerk Secret Key',
  'GEMINI_API_KEY': 'Gemini API Key',
};

const optional = {
  'BRAVE_API_KEY': 'Brave Search API Key',
  'WORKSPACE_ROOT': 'Workspace Root',
  'NEXT_PUBLIC_APP_URL': 'App URL',
  'HOSTNAME': 'Hostname',
  'PORT': 'Port',
};

console.log('\n✅ Required Variables:');
let allRequiredSet = true;
for (const [key, name] of Object.entries(required)) {
  const value = process.env[key];
  if (value && value.length > 0) {
    const preview = value.length > 20 ? value.substring(0, 20) + '...' : value;
    console.log(`  ✓ ${name}: SET (${preview})`);
  } else {
    console.log(`  ✗ ${name}: NOT SET`);
    allRequiredSet = false;
  }
}

console.log('\n📝 Optional Variables:');
for (const [key, name] of Object.entries(optional)) {
  const value = process.env[key];
  if (value && value.length > 0) {
    const preview = value.length > 20 ? value.substring(0, 20) + '...' : value;
    console.log(`  • ${name}: SET (${preview})`);
  } else {
    console.log(`  - ${name}: not set (using default)`);
  }
}

console.log('\n' + '='.repeat(50));
if (allRequiredSet) {
  console.log('✅ All required environment variables are set!');
  process.exit(0);
} else {
  console.log('❌ Some required environment variables are missing.');
  console.log('\n💡 Make sure your .env.local file contains all required variables.');
  console.log('   See .env.example for reference.');
  process.exit(1);
}

