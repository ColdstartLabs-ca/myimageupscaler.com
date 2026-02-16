#!/usr/bin/env bash
# Add before/after images to the Model Gallery for a quality tier.
# Resizes to 512px wide, converts to .webp, saves to public/before-after/{tier}/
#
# Usage:
#   ./add-gallery-images.sh <tier-slug> <before-image> <after-image> [--object-position "center 25%"]
#
# Examples:
#   ./add-gallery-images.sh budget-old-photo ./before.png ./after.png
#   ./add-gallery-images.sh face-pro ~/Downloads/portrait-before.jpg ~/Downloads/portrait-after.jpg --object-position "center 25%"

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PUBLIC_DIR="$PROJECT_ROOT/public/before-after"
MAX_WIDTH=512
WEBP_QUALITY=80

# --- Argument parsing ---
if [ $# -lt 3 ]; then
  echo "Usage: $0 <tier-slug> <before-image> <after-image> [--object-position \"<css-value>\"]"
  echo ""
  echo "Arguments:"
  echo "  tier-slug       Quality tier slug (e.g., budget-old-photo, face-pro)"
  echo "  before-image    Path to the before image (any format: png, jpg, webp)"
  echo "  after-image     Path to the after image (any format: png, jpg, webp)"
  echo "  --object-position  Optional CSS object-position for crop focus (e.g., 'center 25%')"
  exit 1
fi

TIER_SLUG="$1"
BEFORE_SRC="$2"
AFTER_SRC="$3"
OBJECT_POSITION=""

shift 3
while [ $# -gt 0 ]; do
  case "$1" in
    --object-position)
      OBJECT_POSITION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# --- Validate inputs ---
if [ ! -f "$BEFORE_SRC" ]; then
  echo "Error: Before image not found: $BEFORE_SRC"
  exit 1
fi

if [ ! -f "$AFTER_SRC" ]; then
  echo "Error: After image not found: $AFTER_SRC"
  exit 1
fi

if ! command -v convert &>/dev/null; then
  echo "Error: ImageMagick 'convert' not found. Install with: sudo apt install imagemagick"
  exit 1
fi

# --- Create output directory ---
OUT_DIR="$PUBLIC_DIR/$TIER_SLUG"
mkdir -p "$OUT_DIR"

# --- Convert and resize ---
echo "Converting before image..."
convert "$BEFORE_SRC" -resize "${MAX_WIDTH}x" -quality "$WEBP_QUALITY" "$OUT_DIR/before.webp"
BEFORE_DIMS=$(identify -format "%wx%h" "$OUT_DIR/before.webp")
BEFORE_SIZE=$(du -h "$OUT_DIR/before.webp" | cut -f1)

echo "Converting after image..."
convert "$AFTER_SRC" -resize "${MAX_WIDTH}x" -quality "$WEBP_QUALITY" "$OUT_DIR/after.webp"
AFTER_DIMS=$(identify -format "%wx%h" "$OUT_DIR/after.webp")
AFTER_SIZE=$(du -h "$OUT_DIR/after.webp" | cut -f1)

# --- Summary ---
echo ""
echo "=== Done ==="
echo "Tier:   $TIER_SLUG"
echo "Output: $OUT_DIR/"
echo "Before: $BEFORE_DIMS ($BEFORE_SIZE)"
echo "After:  $AFTER_DIMS ($AFTER_SIZE)"
echo ""
echo "--- Next step ---"
echo "Update QUALITY_TIER_CONFIG in shared/types/coreflow.types.ts:"
echo ""
echo "  '$TIER_SLUG': {"
echo "    ..."
echo "    previewImages: {"
echo "      before: '/before-after/$TIER_SLUG/before.webp',"
echo "      after: '/before-after/$TIER_SLUG/after.webp',"
if [ -n "$OBJECT_POSITION" ]; then
  echo "      objectPosition: '$OBJECT_POSITION',"
fi
echo "    },"
echo "  },"
