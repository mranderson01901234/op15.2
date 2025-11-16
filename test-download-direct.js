// Test download route directly (bypassing auth for testing)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simulate what the route does
const platform = 'linux';
const serverUrl = 'http://localhost:3000';
const userId = 'test_user_123';
const sharedSecret = crypto.randomBytes(16).toString('hex');

const binaryPath = path.join(__dirname, 'local-agent', 'dist', 'binaries', 'local-agent-linux-x64');

if (!fs.existsSync(binaryPath)) {
  console.error('❌ Binary not found:', binaryPath);
  process.exit(1);
}

const binary = fs.readFileSync(binaryPath);
console.log('✅ Binary found:', binary.length, 'bytes');

// Generate installer script (simplified)
const installerScript = `#!/bin/bash
set -e
AGENT_DIR="$HOME/.op15-agent"
mkdir -p "$AGENT_DIR"
BINARY_MARKER="__BINARY_DATA_STARTS_HERE__"
BINARY_PATH="$AGENT_DIR/op15-agent"

MARKER_LINE=$(strings "$0" 2>/dev/null | grep -n "^$BINARY_MARKER$" | cut -d: -f1 | head -1)
if [ -n "$MARKER_LINE" ]; then
  SCRIPT_BYTES=$(head -n "$MARKER_LINE" "$0" 2>/dev/null | wc -c)
  SKIP_BYTES=$((SCRIPT_BYTES + 1))
  dd if="$0" of="$BINARY_PATH" bs=1 skip=$SKIP_BYTES 2>/dev/null
  chmod +x "$BINARY_PATH"
  echo "✅ Binary extracted to $BINARY_PATH"
else
  echo "❌ Marker not found"
  exit 1
fi

cat > "$AGENT_DIR/config.json" << EOF
{
  "serverUrl": "${serverUrl}",
  "userId": "${userId}",
  "sharedSecret": "${sharedSecret}",
  "httpPort": 4001
}
