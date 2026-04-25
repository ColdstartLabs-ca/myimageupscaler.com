#!/bin/bash
set -e

# Extension Packaging Script
# Builds and packages the extension for Chrome, Edge, and Firefox

echo "🔧 Building MyImageUpscaler Browser Extension..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
EXTENSION_DIR="$SCRIPT_DIR"
BUILD_DIR="$EXTENSION_DIR/build"
DIST_DIR="$EXTENSION_DIR/dist"

# Version from package.json
VERSION=$(node -p "require('$EXTENSION_DIR/package.json').version")
echo -e "${BLUE}Version: $VERSION${NC}"

# Clean and create build directory
echo -e "${YELLOW}🧹 Cleaning build directory...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build for each browser
build_browser() {
  local browser=$1
  local browser_name=$2
  local build_subdir="$BUILD_DIR/$browser_name"

  echo -e "${BLUE}📦 Building for $browser_name...${NC}"

  # Build the extension
  cd "$EXTENSION_DIR"
  yarn build

  # Copy dist to browser-specific directory
  mkdir -p "$build_subdir"
  cp -r "$DIST_DIR"/* "$build_subdir/"

  # Update manifest for browser-specific differences
  local manifest="$build_subdir/manifest.json"

  case $browser in
    chrome)
      # Chrome manifest is already correct
      ;;
    edge)
      # Edge uses the same manifest as Chrome
      # Just add Edge-specific info if needed
      ;;
    firefox)
      # Firefox needs some manifest adjustments
      # Update manifest for Firefox
      node -e "
        const fs = require('fs');
        const manifest = JSON.parse(fs.readFileSync('$manifest', 'utf8'));

        // Firefox doesn't use 'service_worker' in background
        // It needs 'scripts' array
        if (manifest.background && manifest.background.service_worker) {
          manifest.background.scripts = [manifest.background.service_worker.replace('.ts', '.js').replace('src/', '')];
          delete manifest.background.service_worker;
          delete manifest.background.type;
        }

        // Remove Chrome-specific permissions
        manifest.permissions = manifest.permissions.filter(p => p !== 'sidePanel');
        delete manifest.side_panel;

        // Firefox uses browser_specific_settings instead of some Chrome keys
        // But for basic compatibility, keep it simple

        fs.writeFileSync('$manifest', JSON.stringify(manifest, null, 2));
      "
      ;;
  esac

  # Create zip file
  echo -e "${YELLOW}📦 Creating zip for $browser_name...${NC}"
  cd "$build_subdir"
  zip -r "../myimageupscaler-extension-$browser_name-$VERSION.zip" . -q
  cd "$BUILD_DIR"

  echo -e "${GREEN}✅ $browser_name build complete: myimageupscaler-extension-$browser_name-$VERSION.zip${NC}"
}

# Build for all browsers
build_browser "chrome" "Chrome"
build_browser "edge" "Edge"
# build_browser "firefox" "Firefox" # Firefox support can be added later

echo -e "${GREEN}🎉 All builds complete!${NC}"
echo -e "${BLUE}📂 Build artifacts:${NC}"
ls -lh "$BUILD_DIR"/*.zip 2>/dev/null || echo "No zip files found"

echo -e "${YELLOW}${NC}"
echo "Next steps:"
echo "1. Test the extension in each browser by loading the unpacked extension from:"
echo "   - Chrome: $BUILD_DIR/Chrome"
echo "   - Edge: $BUILD_DIR/Edge"
echo "2. Upload zip files to respective browser stores:"
echo "   - Chrome Web Store: https://chrome.google.com/webstore/devcenter"
echo "   - Edge Add-ons: https://partner.microsoft.com/dashboard"
