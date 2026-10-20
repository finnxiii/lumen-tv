#!/usr/bin/env bash
# make-media.sh — Build per-variant clip files from CC-licensed source footage.
#
# Output: ~/lumen-media/{night,day}/{original,cinema,night,bright,sports}.mp4
#         ~/lumen-media/{night,day}/frame-<variant>.jpg
#         ~/lumen-media/preview-night.jpg
#
# The app loads each clip individually (MEDIA_BASE_URL/<clip>/<variant>.mp4).
# No reel concatenation needed.
#
# Sources (CC-BY 3.0):
#   night: Tears of Steel 720p (blender.org) — dark sci-fi interior sequence
#   day:   Big Buck Bunny 720p (archive.org)  — bright outdoor meadow sequence
#
# Usage: bash tv/scripts/make-media.sh
# Requires: ffmpeg ≥ 5, curl; run from the repo root.
set -euo pipefail

MEDIA_DIR="$HOME/lumen-media"
SOURCE_DIR="$MEDIA_DIR/source"
CLIP_S=25         # seconds per clip (trimmed to the strongest scene segment)
FRAME_T=12        # timestamp for the preview frame (≈midpoint of 25 s clip)

# Encode target — light profile for the Virtual Device software decoder
# 960x540, H.264 Main L3.1, 1.5 Mbps (max 2 Mbps), 24 fps, AAC 128k 48 kHz
VID_SCALE="960:540"
VID_PROFILE="-profile:v main -level 3.1"
VID_RATE="-b:v 1500k -maxrate 2000k -bufsize 3000k"
GOP=24            # 1 s at 24 fps

# Scene timestamps in the source files (input seek = fast byte-range seek)
NIGHT_SRC="$SOURCE_DIR/tears_of_steel_720p.mov"
NIGHT_SS="00:09:09"   # dark VFX interior — Thom's apartment, Tears of Steel

DAY_SRC="$SOURCE_DIR/big_buck_bunny_720p.mov"
DAY_SS="00:01:02"     # Big Buck Bunny in bright daisy meadow

# ── 0. Sanity checks ─────────────────────────────────────────────────────────
for bin in ffmpeg ffprobe curl; do
  command -v "$bin" >/dev/null || { echo "ERROR: $bin not found"; exit 1; }
done

if [[ ! -f "$NIGHT_SRC" ]]; then
  echo "ERROR: night source not found: $NIGHT_SRC"
  echo "Run: curl -L -o \"$NIGHT_SRC\" 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'"
  exit 1
fi
if [[ ! -f "$DAY_SRC" ]]; then
  echo "ERROR: day source not found: $DAY_SRC"
  echo "Run: curl -L -o \"$DAY_SRC\" 'https://archive.org/download/BigBuckBunny/big_buck_bunny_720p_h264.mov'"
  exit 1
fi

mkdir -p "$MEDIA_DIR/night" "$MEDIA_DIR/day"

# ── 1. Trim originals ─────────────────────────────────────────────────────────
echo "[1/4] Trimming ${CLIP_S}s originals at ${VID_SCALE}..."

ffmpeg -y -ss "$NIGHT_SS" -i "$NIGHT_SRC" \
  -t $CLIP_S -vf "scale=${VID_SCALE},format=yuv420p" \
  -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart \
  "$MEDIA_DIR/night/original.mp4"

ffmpeg -y -ss "$DAY_SS" -i "$DAY_SRC" \
  -t $CLIP_S -vf "scale=${VID_SCALE},format=yuv420p" \
  -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart \
  "$MEDIA_DIR/day/original.mp4"

# ── 2. Generate filter variants ───────────────────────────────────────────────
echo "[2/4] Generating 4 filter variants per clip..."

# cinema: desaturated, lifted contrast, cool blue tint
CINEMA_VF="eq=contrast=1.25:saturation=0.75:brightness=-0.08,colorchannelmixer=rr=0.88:gg=0.95:bb=1.10"
# night: warm amber push, reduced brightness
NIGHT_VF="eq=contrast=0.95:saturation=1.20:brightness=-0.18,colorchannelmixer=rr=1.15:gg=0.95:bb=0.70"
# bright: lifted exposure, punchy saturation
BRIGHT_VF="eq=contrast=1.15:saturation=1.40:brightness=0.12"
# sports: sharp, vibrant, high contrast
SPORTS_VF="eq=contrast=1.35:saturation=1.50:brightness=0.06,unsharp=5:5:1.2:5:5:0"

make_variant() {
  local clip="$1"    # night | day
  local variant="$2" # cinema | night | bright | sports
  local vf="$3"
  ffmpeg -y -i "$MEDIA_DIR/$clip/original.mp4" \
    -vf "${vf},format=yuv420p" \
    -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
    -c:a copy -movflags +faststart \
    "$MEDIA_DIR/$clip/$variant.mp4"
  echo "  $clip/$variant.mp4 ✓"
}

make_variant night cinema  "$CINEMA_VF"
make_variant night night   "$NIGHT_VF"
make_variant night bright  "$BRIGHT_VF"
make_variant night sports  "$SPORTS_VF"
make_variant day   cinema  "$CINEMA_VF"
make_variant day   night   "$NIGHT_VF"
make_variant day   bright  "$BRIGHT_VF"
make_variant day   sports  "$SPORTS_VF"

# ── 3. Preview frames ─────────────────────────────────────────────────────────
echo "[3/4] Extracting preview frames at t=${FRAME_T}s..."

for clip in night day; do
  for variant in original cinema night bright sports; do
    ffmpeg -y -ss $FRAME_T -i "$MEDIA_DIR/$clip/$variant.mp4" \
      -frames:v 1 -q:v 3 -vf "scale=${VID_SCALE}" \
      "$MEDIA_DIR/$clip/frame-$variant.jpg"
  done
done

# ── 4. Side-by-side comparison preview ───────────────────────────────────────
echo "[4/4] Building preview-night.jpg (original | bright)..."
ffmpeg -y \
  -i "$MEDIA_DIR/night/frame-original.jpg" \
  -i "$MEDIA_DIR/night/frame-bright.jpg" \
  -filter_complex "[0]scale=960:-1[l];[1]scale=960:-1[r];[l][r]hstack=inputs=2" \
  -frames:v 1 -q:v 2 \
  "$MEDIA_DIR/preview-night.jpg"
# Note: drawtext requires libfreetype; hstack alone shows the brightness
# difference clearly (Original=left, Bright Room=right).
echo "  preview-night.jpg ✓"

echo ""
echo "Done. Serve ~/lumen-media/ over HTTPS."
echo "Verify: curl -I \$MEDIA_BASE_URL/night/original.mp4  → 200 video/mp4"
