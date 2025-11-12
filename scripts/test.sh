#!/bin/bash

# Test script for local-env LLM assistant
# Runs all tests and generates summary

set -e

echo "🧪 Running Local-Env Assistant Tests..."
echo ""

# Run tests
if command -v pnpm &> /dev/null; then
  echo "Using pnpm..."
  pnpm test
elif command -v npm &> /dev/null; then
  echo "Using npm..."
  npm test
else
  echo "Error: Neither pnpm nor npm found"
  exit 1
fi

echo ""
echo "✅ All tests completed!"

