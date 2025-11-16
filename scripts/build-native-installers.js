#!/usr/bin/env node
/**
 * Build native executable installers for all platforms
 * Creates standalone installers that users can double-click
 */

const { exec } = require('@yao-pkg/pkg');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'installers');
const installerSrc = path.join(__dirname, '..', 'installer-src', 'installer-server.js');
const agentDist = path.join(__dirname, '..', 'local-agent', 'dist', 'index.js');

// Ensure directories exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('🚀 Building native installers...\n');

async function build() {
  try {
    // Check prerequisites
    console.log('📦 Checking prerequisites...');
    
    if (!fs.existsSync(agentDist)) {
      console.error('❌ Agent not built. Run: cd local-agent && pnpm build');
      process.exit(1);
    }
    console.log('✓ Agent built');
    
    if (!fs.existsSync(installerSrc)) {
      console.error('❌ Installer source not found at:', installerSrc);
      process.exit(1);
    }
    console.log('✓ Installer source found');

    // Build installer executables for all platforms
    console.log('\n🔨 Building installers...');
    await exec([
      installerSrc,
      '--targets', 'node20-linux-x64,node20-macos-x64,node20-win-x64',
      '--output', path.join(distDir, 'op15-agent-installer'),
      '--compress', 'GZip',
      '--public',
      '--public-packages', 'ws'
    ]);

    console.log('\n✅ Native installers built successfully!');
    console.log(`📁 Output directory: ${distDir}`);
    console.log('   - op15-agent-installer-linux (Linux installer)');
    console.log('   - op15-agent-installer-macos (macOS installer)');
    console.log('   - op15-agent-installer-win.exe (Windows installer)');
    console.log('');
    console.log('Users can double-click these files to install the agent!');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();

