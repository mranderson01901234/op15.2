// Test installer generation (bypassing API auth)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const binaryPath = path.join(__dirname, 'local-agent', 'dist', 'binaries', 'local-agent-linux-x64');

if (!fs.existsSync(binaryPath)) {
  console.error('❌ Binary not found:', binaryPath);
  process.exit(1);
}

const binary = fs.readFileSync(binaryPath);
console.log('✅ Binary found:', binary.length, 'bytes');

const serverUrl = 'http://localhost:3000';
const userId = 'test_user';
const sharedSecret = crypto.randomBytes(16).toString('hex');

const installerScript = `#!/bin/bash
set -e
AGENT_DIR="$HOME/.op15-agent"
mkdir -p "$AGENT_DIR"
BINARY_MARKER="__BINARY_DATA_STARTS_HERE__"
BINARY_PATH="$AGENT_DIR/op15-agent"

echo "📦 Installing agent..."

# Method 1: Use Python to extract directly (fastest and most reliable)
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import sys
try:
    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    marker = b'$BINARY_MARKER\\n'
    pos = data.find(marker)
    if pos == -1:
        sys.exit(1)
    start_pos = pos + len(marker)
    with open(sys.argv[2], 'wb') as out:
        out.write(data[start_pos:])
except Exception as e:
    sys.exit(1)
" "$0" "$BINARY_PATH" 2>/dev/null
  if [ $? -eq 0 ] && [ -s "$BINARY_PATH" ]; then
    echo "✅ Binary extracted using Python"
  else
    rm -f "$BINARY_PATH"
  fi
fi

# Method 2: Fallback - use tail (much faster than dd bs=1)
if [ ! -f "$BINARY_PATH" ] || [ ! -s "$BINARY_PATH" ]; then
  MARKER_POS=""
  
  # Try Python to find position
  if command -v python3 >/dev/null 2>&1; then
    MARKER_POS=$(python3 -c "import sys; data=open(sys.argv[1],'rb').read(); marker=b'$BINARY_MARKER\\n'; pos=data.find(marker); print(pos+len(marker)) if pos!=-1 else sys.exit(1)" "$0" 2>/dev/null)
  fi
  
  # Fallback: use sed to find line, then calculate bytes
  if [ -z "$MARKER_POS" ] || [ "$MARKER_POS" -le 0 ]; then
    MARKER_LINE=$(sed -n "/^$BINARY_MARKER$/=" "$0" 2>/dev/null | head -1)
    if [ -n "$MARKER_LINE" ]; then
      MARKER_POS=$(head -n "$MARKER_LINE" "$0" 2>/dev/null | wc -c)
      MARKER_POS=$((MARKER_POS + 1))
    fi
  fi
  
  if [ -z "$MARKER_POS" ] || [ "$MARKER_POS" -le 0 ]; then
    echo "❌ Error: Binary marker not found"
    exit 1
  fi
  
  # Extract binary using tail (much faster than dd bs=1)
  tail -c +$((MARKER_POS + 1)) "$0" > "$BINARY_PATH" 2>/dev/null
fi

# Verify binary was extracted
BINARY_SIZE=$(stat -c%s "$BINARY_PATH" 2>/dev/null || stat -f%z "$BINARY_PATH" 2>/dev/null || echo 0)
if [ ! -s "$BINARY_PATH" ] || [ "$BINARY_SIZE" -lt 1000000 ]; then
  echo "❌ Error: Failed to extract binary (size: $BINARY_SIZE bytes)"
  exit 1
fi

chmod +x "$BINARY_PATH"
echo "✅ Binary extracted to $BINARY_PATH (size: $BINARY_SIZE bytes)"

cat > "$AGENT_DIR/config.json" << EOF
{
  "serverUrl": "${serverUrl}",
  "userId": "${userId}",
  "sharedSecret": "${sharedSecret}",
  "httpPort": 4001
}
EOF

echo "✅ Config written"
echo "✅ Installation complete!"
# Exit before binary data to prevent bash from trying to execute it
exit 0
__BINARY_DATA_STARTS_HERE__
`;

const installer = Buffer.concat([Buffer.from(installerScript), binary]);
fs.writeFileSync('test-installer.run', installer);
fs.chmodSync('test-installer.run', 0o755);

console.log('✅ Test installer created: test-installer.run');
console.log('   Total size:', installer.length, 'bytes');
console.log('   Script:', Buffer.from(installerScript).length, 'bytes');
console.log('   Binary:', binary.length, 'bytes');
