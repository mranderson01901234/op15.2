#!/bin/bash

# OP15 Web App Startup Script
# This script starts the Next.js development server with WebSocket support

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PORT=${PORT:-3000}
HOSTNAME=${HOSTNAME:-localhost}
NODE_ENV=${NODE_ENV:-development}

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if port is in use
check_port() {
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    print_warning "Port $PORT is already in use. Attempting to free it..."
    PID=$(lsof -ti :$PORT)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null || true
        sleep 1
        print_success "Freed port $PORT"
    fi
}

# Function to check if pnpm is installed
check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed. Please install it first:"
        echo "  npm install -g pnpm"
        exit 1
    fi
}

# Function to check if node_modules exists
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found. Installing dependencies..."
        pnpm install
    fi
}

# Main execution
main() {
    print_info "Starting OP15 Web Application..."
    print_info "Port: $PORT"
    print_info "Hostname: $HOSTNAME"
    print_info "Environment: $NODE_ENV"
    echo ""

    # Check prerequisites
    check_pnpm
    check_dependencies

    # Check and free port if needed
    if check_port; then
        kill_port
    fi

    # Export environment variables
    export PORT=$PORT
    export HOSTNAME=$HOSTNAME
    export NODE_ENV=$NODE_ENV

    print_success "Starting development server..."
    echo ""
    print_info "Server will be available at: http://$HOSTNAME:$PORT"
    print_info "WebSocket bridge available at: ws://$HOSTNAME:$PORT/api/bridge"
    echo ""
    print_info "Press Ctrl+C to stop the server"
    echo ""

    # Start the server
    exec pnpm dev
}

# Handle script interruption
trap 'echo ""; print_warning "Shutting down server..."; exit 0' INT TERM

# Run main function
main

