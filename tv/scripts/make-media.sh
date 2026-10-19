#!/usr/bin/env bash
# make-media.sh — Build lumen-reel.mp4 from CC-licensed source clips.
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
SEG_S=45          # seconds per segment
FRAME_T=22        # timestamp inside each segment for the preview frame (≈midpoint)

# Encode target — lighter profile for the Virtual Device software decoder
# (original 1280x720 H.264 High @ ~4.3 Mbps caused picture freeze / audio-only)
VID_SCALE="960:540"
VID_PROFILE="-profile:v main -level 3.1"
VID_RATE="-b:v 1500k -maxrate 2000k -bufsize 3000k"
GOP=24            # 1 s at 24 fps

# Scene timestamps in the source files (input seek = fast byte-range seek)
NIGHT_SRC="$SOURCE_DIR/tears_of_steel_720p.mov"
NIGHT_SS="00:09:09"   # dark VFX interior scene — Thom's apartment, Tears of Steel

DAY_SRC="$SOURCE_DIR/big_buck_bunny_720p.mov"
DAY_SS="00:01:02"     # Big Buck Bunny sniffing daisies — bright outdoor meadow

TV_REEL_JSON="$(dirname "$0")/../src/data/reel.json"

# ── 0. Sanity checks ─────────────────────────────────────────────────────────
for bin in ffmpeg ffprobe curl; do
  command -v "$bin" >/dev/null || { echo "ERROR: $bin not found"; exit 1; }
done

if [[ ! -f "$NIGHT_SRC" ]]; then
  echo "ERROR: night source not found: $NIGHT_SRC"
  echo "Run: curl -L -o $NIGHT_SRC 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'"
  exit 1
fi
if [[ ! -f "$DAY_SRC" ]]; then
  echo "ERROR: day source not found: $DAY_SRC"
  echo "Run: curl -L -o $DAY_SRC 'https://archive.org/download/BigBuckBunny/big_buck_bunny_720p_h264.mov'"
  exit 1
fi

mkdir -p "$MEDIA_DIR/night" "$MEDIA_DIR/day"

# ── 1. Trim 45 s originals ────────────────────────────────────────────────────
echo "[1/5] Trimming source clips to ${SEG_S}s at 1280x720..."

ffmpeg -y -ss "$NIGHT_SS" -i "$NIGHT_SRC" \
  -t $SEG_S -vf "scale=${VID_SCALE},format=yuv420p" \
  -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart \
  "$MEDIA_DIR/night/original.mp4"

ffmpeg -y -ss "$DAY_SS" -i "$DAY_SRC" \
  -t $SEG_S -vf "scale=${VID_SCALE},format=yuv420p" \
  -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart \
  "$MEDIA_DIR/day/original.mp4"

# ── 2. Generate filter variants ───────────────────────────────────────────────
echo "[2/5] Generating 5 variants per clip..."

# cinema: slightly desaturated, lifted contrast, cooler blue tint, letter-box feeling
CINEMA_VF="eq=contrast=1.25:saturation=0.75:brightness=-0.08,colorchannelmixer=rr=0.88:gg=0.95:bb=1.10"
# night: warm amber push, reduced brightness, boosted saturation (night-vision warmth)
NIGHT_VF="eq=contrast=0.95:saturation=1.20:brightness=-0.18,colorchannelmixer=rr=1.15:gg=0.95:bb=0.70"
# bright: lifted exposure, punchy saturation
BRIGHT_VF="eq=contrast=1.15:saturation=1.40:brightness=0.12"
# sports: sharp, vibrant, high contrast
SPORTS_VF="eq=contrast=1.35:saturation=1.50:brightness=0.06,unsharp=5:5:1.2:5:5:0"

make_variant() {
  local clip="$1"       # night | day
  local variant="$2"    # cinema | night | bright | sports
  local vf="$3"
  local src="$MEDIA_DIR/$clip/original.mp4"
  local dst="$MEDIA_DIR/$clip/$variant.mp4"
  ffmpeg -y -i "$src" \
    -vf "${vf},format=yuv420p" \
    -c:v libx264 -preset fast $VID_PROFILE $VID_RATE -g $GOP -keyint_min $GOP \
    -c:a copy -movflags +faststart \
    "$dst"
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

# ── 3. Extract preview frames ─────────────────────────────────────────────────
echo "[3/5] Extracting frame-<variant>.jpg for each clip..."

for clip in night day; do
  for variant in original cinema night bright sports; do
    ffmpeg -y -ss $FRAME_T -i "$MEDIA_DIR/$clip/$variant.mp4" \
      -frames:v 1 -q:v 3 -vf "scale=${VID_SCALE}" \
      "$MEDIA_DIR/$clip/frame-$variant.jpg"
  done
done

# ── 4. Concatenate into lumen-reel.mp4 ────────────────────────────────────────
echo "[4/5] Concatenating 10 segments into lumen-reel.mp4..."

# Order: night×5 then day×5, matching reel.json
CONCAT="$MEDIA_DIR/concat.txt"
cat > "$CONCAT" << EOF
file '$MEDIA_DIR/night/original.mp4'
file '$MEDIA_DIR/night/cinema.mp4'
file '$MEDIA_DIR/night/night.mp4'
file '$MEDIA_DIR/night/bright.mp4'
file '$MEDIA_DIR/night/sports.mp4'
file '$MEDIA_DIR/day/original.mp4'
file '$MEDIA_DIR/day/cinema.mp4'
file '$MEDIA_DIR/day/night.mp4'
file '$MEDIA_DIR/day/bright.mp4'
file '$MEDIA_DIR/day/sports.mp4'
EOF

# Build keyframe expression: force keyframe at every segment boundary
# Boundaries: 0, 45, 90, 135, 180, 225, 270, 315, 360, 405 seconds
ffmpeg -y -f concat -safe 0 -i "$CONCAT" \
  -c:v libx264 -preset slow $VID_PROFILE $VID_RATE \
  -g $GOP -keyint_min $GOP \
  -force_key_frames "0,45,90,135,180,225,270,315,360,405" \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$MEDIA_DIR/lumen-reel.mp4"

echo "  lumen-reel.mp4: $(du -h "$MEDIA_DIR/lumen-reel.mp4" | cut -f1)"

# ── 5. Update reel.json ───────────────────────────────────────────────────────
echo "[5/5] Updating reel.json..."

cat > "$MEDIA_DIR/reel.json" << 'RJSON'
{
  "segmentSeconds": 45,
  "order": [
    { "clip": "night", "variant": "original", "start": 0 },
    { "clip": "night", "variant": "cinema",   "start": 45 },
    { "clip": "night", "variant": "night",    "start": 90 },
    { "clip": "night", "variant": "bright",   "start": 135 },
    { "clip": "night", "variant": "sports",   "start": 180 },
    { "clip": "day",   "variant": "original", "start": 225 },
    { "clip": "day",   "variant": "cinema",   "start": 270 },
    { "clip": "day",   "variant": "night",    "start": 315 },
    { "clip": "day",   "variant": "bright",   "start": 360 },
    { "clip": "day",   "variant": "sports",   "start": 405 }
  ]
}
RJSON

cp "$MEDIA_DIR/reel.json" "$TV_REEL_JSON"
echo "  reel.json updated in both locations ✓"

# ── 6. Side-by-side preview (night original | bright) ─────────────────────────
echo "[6/6] Building preview-night.jpg..."
ffmpeg -y \
  -i "$MEDIA_DIR/night/frame-original.jpg" \
  -i "$MEDIA_DIR/night/frame-bright.jpg" \
  -filter_complex "[0]scale=960:-1[left];[1]scale=960:-1[right];[left][right]hstack=inputs=2" \
  -frames:v 1 -q:v 2 \
  "$MEDIA_DIR/preview-night.jpg"
# Note: drawtext requires libfreetype; if unavailable the hstack alone still
# shows the brightness difference clearly (Original=left, Bright Room=right).
echo "  preview-night.jpg ✓"

echo ""
echo "Done. Serve ~/lumen-media/ over HTTPS and verify lumen-reel.mp4 + frame-*.jpg."
