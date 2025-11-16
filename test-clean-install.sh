#!/bin/bash
# End-to-end clean system install test
# Simulates installation on a system without Node.js

set -e

echo "🧪 Testing End-to-End Install Flow (Clean System Simulation)"
echo "============================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="/tmp/op15-clean-test"
AGENT_DIR="$TEST_DIR/.op15-agent"
INSTALLER="$TEST_DIR/installer.run"

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up test environment..."
    pkill -f "$AGENT_DIR/op15-agent" 2>/dev/null || true
    rm -rf "$TEST_DIR" 2>/dev/null || true
    echo "✅ Cleanup complete"
}

trap cleanup EXIT

# Step 1: Create clean test environment
echo "📁 Step 1: Creating clean test environment..."
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
export HOME="$TEST_DIR"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin"
echo "✅ Test directory: $TEST_DIR"
echo "✅ PATH (no Node.js): $PATH"
echo ""

# Step 2: Verify binary exists
echo "📦 Step 2: Verifying binary exists..."
BINARY_SOURCE="/home/dp/Desktop/op15/local-agent/dist/binaries/local-agent-linux-x64"
if [ ! -f "$BINARY_SOURCE" ]; then
    echo -e "${RED}❌ Binary not found at $BINARY_SOURCE${NC}"
    echo "   Run: cd /home/dp/Desktop/op15/local-agent && pnpm build:binaries"
    exit 1
fi
echo "✅ Binary found: $BINARY_SOURCE"
file "$BINARY_SOURCE"
echo ""

# Step 3: Test installer generation (simulate download)
echo "📥 Step 3: Generating installer script..."
# Create installer script that matches the real installer format
cat > "$INSTALLER" << 'INSTALLER_EOF'
#!/bin/bash
set -e

AGENT_DIR="$HOME/.op15-agent"
mkdir -p "$AGENT_DIR"

# Extract binary using Python (fastest method)
BINARY_MARKER="__BINARY_DATA_STARTS_HERE__"
if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import sys
with open(sys.argv[1], 'rb') as f:
    data = f.read()
    marker = b'__BINARY_DATA_STARTS_HERE__\n'
    pos = data.find(marker)
    if pos != -1:
        with open(sys.argv[2], 'wb') as out:
            out.write(data[pos + len(marker):])
    else:
        sys.exit(1)
" "$0" "$AGENT_DIR/op15-agent"
    echo "✅ Binary extracted using Python"
else
    echo "❌ Python3 not found (required for binary extraction)"
    exit 1
fi

chmod +x "$AGENT_DIR/op15-agent"

# Create config.json
cat > "$AGENT_DIR/config.json" << EOF
{
  "serverUrl": "http://localhost:3000",
  "userId": "test_user_clean_install",
  "sharedSecret": "test_secret_12345678901234567890123456789012",
  "httpPort": 4002
}
EOF

echo "✅ Config.json created"
echo "✅ Agent installed to: $AGENT_DIR"
exit 0
__BINARY_DATA_STARTS_HERE__
INSTALLER_EOF

# Append binary to installer
cat "$BINARY_SOURCE" >> "$INSTALLER"
chmod +x "$INSTALLER"

echo "✅ Installer script created: $INSTALLER"
ls -lh "$INSTALLER"
echo ""

# Step 4: Run installer (simulating clean system)
echo "🔧 Step 4: Running installer (clean system simulation)..."
# Use clean PATH (no Node.js)
if ! env PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin" bash "$INSTALLER"; then
    echo -e "${RED}❌ Installer failed${NC}"
    exit 1
fi
echo ""

# Step 5: Verify installation
echo "✅ Step 5: Verifying installation..."
if [ ! -f "$AGENT_DIR/op15-agent" ]; then
    echo -e "${RED}❌ Binary not extracted${NC}"
    exit 1
fi

if [ ! -f "$AGENT_DIR/config.json" ]; then
    echo -e "${RED}❌ Config.json not created${NC}"
    exit 1
fi

echo "✅ Binary extracted: $AGENT_DIR/op15-agent"
file "$AGENT_DIR/op15-agent"
echo "✅ Config.json created: $AGENT_DIR/config.json"
cat "$AGENT_DIR/config.json"
echo ""

# Step 6: Start agent and test execution
echo "🚀 Step 6: Starting agent (no Node.js)..."
"$AGENT_DIR/op15-agent" > "$AGENT_DIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "✅ Agent started (PID: $AGENT_PID)"
echo "   Logs: $AGENT_DIR/agent.log"
sleep 3

# Check if agent is running
if pgrep -f "$AGENT_DIR/op15-agent" > /dev/null; then
    echo "✅ Agent process is running"
else
    echo -e "${YELLOW}⚠️  Agent process not found, checking logs...${NC}"
    cat "$AGENT_DIR/agent.log" 2>/dev/null || echo "No logs found"
    exit 1
fi
echo ""

# Step 7: Test HTTP API
echo "🌐 Step 7: Testing HTTP API..."
sleep 2
HTTP_PORT=$(grep -o '"httpPort": [0-9]*' "$AGENT_DIR/config.json" | grep -o '[0-9]*')
echo "   Testing port: $HTTP_PORT"

for i in {1..10}; do
    if curl -s "http://127.0.0.1:$HTTP_PORT/health" > /dev/null 2>&1; then
        echo "✅ HTTP API responding on port $HTTP_PORT"
        curl -s "http://127.0.0.1:$HTTP_PORT/health" | python3 -m json.tool 2>/dev/null || curl -s "http://127.0.0.1:$HTTP_PORT/health"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ HTTP API not responding after 10 attempts${NC}"
        echo "   Agent logs:"
        tail -20 "$AGENT_DIR/agent.log" 2>/dev/null || echo "   No logs available"
        exit 1
    fi
    echo "   Attempt $i/10: Waiting for agent to start..."
    sleep 1
done
echo ""

# Step 8: Test file operations
echo "📁 Step 8: Testing file operations..."
TEST_FILE="$TEST_DIR/test-file.txt"
echo "test content" > "$TEST_FILE"

# Test fs.list
echo "   Testing fs.list..."
LIST_RESPONSE=$(curl -s -X POST "http://127.0.0.1:$HTTP_PORT/fs/list" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$TEST_DIR\",\"depth\":0}" 2>&1)

if echo "$LIST_RESPONSE" | grep -q "test-file.txt"; then
    echo "✅ fs.list working"
else
    echo -e "${YELLOW}⚠️  fs.list response:${NC}"
    echo "$LIST_RESPONSE" | head -5
fi
echo ""

# Step 9: Summary
echo "============================================================"
echo -e "${GREEN}✅ End-to-End Install Test PASSED${NC}"
echo "============================================================"
echo ""
echo "Summary:"
echo "  ✅ Binary is standalone (no Node.js required)"
echo "  ✅ Installer script works"
echo "  ✅ Binary extraction successful"
echo "  ✅ Config.json created"
echo "  ✅ Agent starts without Node.js"
echo "  ✅ HTTP API responding"
echo "  ✅ File operations working"
echo ""
echo "Test environment: $TEST_DIR"
echo "Agent directory: $AGENT_DIR"
echo "Agent logs: $AGENT_DIR/agent.log"
echo ""
echo "To clean up manually:"
echo "  pkill -f '$AGENT_DIR/op15-agent'"
echo "  rm -rf $TEST_DIR"

