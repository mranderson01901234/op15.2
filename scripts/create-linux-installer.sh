#!/bin/bash
# Creates a self-extracting shell script installer for Linux

INSTALLER_BIN="$1"
OUTPUT="$2"

if [ -z "$INSTALLER_BIN" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <installer-binary> <output-file>"
    exit 1
fi

# Create self-extracting script
cat > "$OUTPUT" << 'EOF'
#!/bin/bash
# op15 Agent Installer - Self-extracting script

echo "🚀 op15 Local Agent Installer"
echo "================================"
echo ""

# Extract the binary to temp location
TMPDIR=$(mktemp -d)
BINARY="$TMPDIR/installer"

# Extract binary from end of this script
ARCHIVE=$(awk '/^__BINARY_FOLLOWS__/ {print NR + 1; exit 0; }' "$0")
tail -n+$ARCHIVE "$0" > "$BINARY"
chmod +x "$BINARY"

# Run the installer
"$BINARY" "$@"
EXIT_CODE=$?

# Cleanup
rm -rf "$TMPDIR"

exit $EXIT_CODE

__BINARY_FOLLOWS__
EOF

# Append the binary
cat "$INSTALLER_BIN" >> "$OUTPUT"
chmod +x "$OUTPUT"

echo "✅ Created self-extracting installer: $OUTPUT"

