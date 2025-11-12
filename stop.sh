#!/bin/bash

# OP15 Web App Stop Script
# This script stops the running development server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PORT=${PORT:-3000}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info "Stopping OP15 Web Application..."

# Find and kill processes
PIDS=$(lsof -ti :$PORT 2>/dev/null || true)

if [ -z "$PIDS" ]; then
    print_warning "No process found running on port $PORT"
else
    for PID in $PIDS; do
        print_info "Stopping process $PID..."
        kill -9 $PID 2>/dev/null || true
    done
    print_success "Server stopped"
fi

# Also kill any node server.js or next dev processes
print_info "Cleaning up any remaining Node.js processes..."
pkill -f "node server.js" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

print_success "Cleanup complete"


