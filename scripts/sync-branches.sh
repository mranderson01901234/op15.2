#!/bin/bash
# Script to sync commits between op15.2 branch and main branch
# Usage: ./scripts/sync-branches.sh

set -e  # Exit on error

echo "🔄 Syncing branches..."

# Fetch latest changes
echo "📥 Fetching latest changes..."
git fetch --all

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Check if we're on op15.2 branch
if [ "$CURRENT_BRANCH" != "op15.2" ]; then
    echo "⚠️  Warning: Not on op15.2 branch. Switching..."
    git checkout op15.2
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Push op15.2 to op15.2 remote
echo "📤 Pushing op15.2 to op15.2 remote..."
git push op15.2 op15.2

# Push op15.2 to origin remote
echo "📤 Pushing op15.2 to origin remote..."
git push origin op15.2

# Check if main branch needs updates
echo "🔍 Checking if main branch needs updates..."
COMMITS_AHEAD=$(git log op15.2/main..op15.2/op15.2 --oneline | wc -l)

if [ "$COMMITS_AHEAD" -gt 0 ]; then
    echo "📊 Found $COMMITS_AHEAD commit(s) to merge into main..."
    
    # Create temporary branch from main
    TEMP_BRANCH="temp-merge-$(date +%s)"
    echo "🌿 Creating temporary branch: $TEMP_BRANCH"
    git checkout -b "$TEMP_BRANCH" op15.2/main
    
    # Merge op15.2 into main
    echo "🔀 Merging op15.2 into main..."
    git merge op15.2/op15.2 -m "Merge op15.2 branch into main - $(date +%Y-%m-%d)"
    
    # Push merged main
    echo "📤 Pushing merged main branch..."
    git push op15.2 "$TEMP_BRANCH:main"
    
    # Cleanup
    echo "🧹 Cleaning up..."
    git checkout op15.2
    git branch -D "$TEMP_BRANCH"
    
    echo "✅ Successfully merged commits into main!"
else
    echo "✅ Main branch is already up to date."
fi

echo ""
echo "✨ Sync complete!"
echo ""
echo "Summary:"
echo "  - op15.2 branch pushed to both remotes"
echo "  - Main branch synced with op15.2"
echo "  - All commits are merged"

