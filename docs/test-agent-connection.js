/**
 * Agent Connection Test Script
 * 
 * Copy and paste this entire script into your browser console (F12)
 * to test if the agent is connected correctly.
 */

(async function testAgentConnection() {
  console.log('🔍 Testing Agent Connection...\n');
  
  try {
    // Get user ID from Clerk
    let userId;
    if (window.Clerk?.user?.id) {
      userId = window.Clerk.user.id;
      console.log('✅ Found user ID:', userId);
    } else {
      // Try to get from localStorage or prompt
      userId = localStorage.getItem('clerk_user_id') || prompt('Enter your Clerk user ID:');
      if (!userId) {
        console.error('❌ Could not determine user ID');
        return;
      }
    }
    
    console.log('\n📡 Testing API Endpoints...\n');
    
    // Test 1: Check agent status API (checks WebSocket + metadata)
    console.log('1️⃣ Checking agent connection status...');
    const statusResponse = await fetch(`/api/users/${userId}/agent-status`, {
      cache: 'no-store'
    });
    
    if (!statusResponse.ok) {
      console.error('❌ Agent status API failed:', statusResponse.status, statusResponse.statusText);
      return;
    }
    
    const status = await statusResponse.json();
    const isConnected = status.connected === true;
    
    console.log('   Agent Status:', {
      'Connected': isConnected ? '✅ YES' : '❌ NO',
      'WebSocket': status.websocketConnected ? '✅ Connected' : '❌ Disconnected',
      'Metadata': status.hasMetadata ? '✅ Present' : '❌ Missing',
      'User Home Directory': status.userHomeDirectory || '(not set)',
      'Diagnostics': status.diagnostics
    });
    
    // Test 2: Check workspace API (for comparison)
    console.log('\n2️⃣ Checking workspace API (for comparison)...');
    const workspaceResponse = await fetch(`/api/users/${userId}/workspace`, {
      cache: 'no-store'
    });
    
    if (workspaceResponse.ok) {
      const workspaceConfig = await workspaceResponse.json();
      console.log('   Workspace Config:', {
        'Workspace Root': workspaceConfig.workspaceRoot,
        'Restriction Level': workspaceConfig.restrictionLevel,
        'User Home Directory': workspaceConfig.userHomeDirectory || '(not set)'
      });
    }
    
    // Test 3: Check connection endpoint
    console.log('\n3️⃣ Checking connection endpoint...');
    const connResponse = await fetch(`/api/users/${userId}/local-env`, {
      method: 'POST'
    });
    
    if (connResponse.ok) {
      const connData = await connResponse.json();
      console.log('   Connection Details:', {
        'Is Connected': connData.isConnected ? '✅ YES' : '❌ NO',
        'WebSocket URL': connData.websocketUrl,
        'Server URL': connData.serverUrl
      });
    } else {
      console.warn('⚠️ Connection endpoint failed:', connResponse.status);
    }
    
    // Test 4: Summary
    console.log('\n4️⃣ Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (isConnected) {
      console.log('✅ AGENT IS CONNECTED');
      console.log('   Home Directory:', status.userHomeDirectory);
      console.log('   You should see a green dot in the sidebar footer.');
    } else {
      console.log('❌ AGENT IS NOT CONNECTED');
      console.log('   Status breakdown:');
      console.log('   - WebSocket:', status.websocketConnected ? '✅ Connected' : '❌ Disconnected');
      console.log('   - Metadata:', status.hasMetadata ? '✅ Present' : '❌ Missing');
      console.log('   Make sure:');
      console.log('   1. Agent installer has been run');
      console.log('   2. Agent process is running');
      if (connResponse.ok) {
        const connData = await connResponse.json();
        console.log('   3. Agent should connect to:', connData.websocketUrl);
      }
      console.log('   4. User ID matches:', userId);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Return result for programmatic use
    return {
      connected: isConnected,
      userId,
      websocketConnected: status.websocketConnected,
      hasMetadata: status.hasMetadata,
      userHomeDirectory: status.userHomeDirectory,
      status
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    return { error: error.message };
  }
})();

