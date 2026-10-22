# Lumen TV App

React Native app for Amazon Fire TV (Vega OS). Plays demo clips in four viewing modes, connects to the backend via Socket.IO, and shows AI recommendations from the phone controller.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | |
| Vega SDK | 0.24.12112 | Installed at `~/vega/` |
| Vega CLI | 1.4.5 | Installed at `~/vega/` |
| ffmpeg / ffprobe | ≥ 5 | For media pipeline only |
| cloudflared | any | For HTTPS tunnel to serve clips |

The Vega SDK and CLI are provided by Amazon as part of the Fire TV developer programme. Source the environment in every shell session before building:

```sh
source ~/vega/env
```

---

## Setup

```sh
cd tv
npm install
```

---

## Media pipeline

The app plays pre-processed clip variants — one `.mp4` per mode per clip. There is no runtime filtering (Vega OS does not support the React Native `filter` style property).

### Source material (CC-BY 3.0)

| Clip id | Source | Scene |
|---------|--------|-------|
| `night` | Tears of Steel (blender.org) | Dark sci-fi interior — 00:09:09 |
| `day` | Big Buck Bunny (archive.org) | Bright outdoor meadow — 00:01:02 |

### Download sources

```sh
mkdir -p ~/lumen-media/source

# Tears of Steel
curl -L -o ~/lumen-media/source/tears_of_steel_720p.mov \
  'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'

# Big Buck Bunny
curl -L -o ~/lumen-media/source/big_buck_bunny_720p.mov \
  'https://archive.org/download/BigBuckBunny/big_buck_bunny_720p_h264.mov'
```

### Build clips

```sh
bash tv/scripts/make-media.sh
```

Produces `~/lumen-media/{night,day}/{original,cinema,night,bright,sports}.mp4` and matching frame JPGs. Encode target: 960×540, H.264 Main L3.1, 1.5 Mbps, AAC 128 kbps 48 kHz.

### Serve over HTTPS

Vega rejects `http://` sources. Use a Cloudflare quick tunnel during development:

```sh
# Terminal 1
python3 -m http.server 8000 --directory ~/lumen-media

# Terminal 2
cloudflared tunnel --url http://localhost:8000
# → prints https://<hash>.trycloudflare.com
```

Set the printed URL as `MEDIA_BASE_URL` in `src/config.ts`.

---

## Config

`tv/src/config.ts`:

| Export | Default | Description |
|--------|---------|-------------|
| `MEDIA_BASE_URL` | `https://YOUR-TUNNEL.trycloudflare.com` | HTTPS base URL for clip files |
| `PHONE_URL` | `https://example.com` | Phone controller website URL (shown on pairing QR) |
| `SOCKET_URL` | `http://localhost:4000` | Backend Socket.IO server |
| `USE_MOCK_SESSION` | `true` | `true` = no backend needed (fake phone + AI); `false` = real backend |
| `ENABLE_SEEK` | `false` | `true` to show ±10 s seek buttons (freezes picture on the Virtual Device) |

---

## Build and run

```sh
# Build (Release, aarch64 for Virtual Device)
source ~/vega/env
cd tv && npm run build:app

# Run on Virtual Device
vega run-app tv/build/aarch64-release/lumentv_aarch64.vpkg com.lumen.tvapp.main -d VirtualDevice

# Start / stop the Virtual Device
vega virtual-device start
vega virtual-device stop
```

The armv7 build (`lumentv_armv7.vpkg`) targets a physical Fire TV Stick.

---

## Source structure

```
tv/src/
  App.tsx                    Root: mounts KeplerVideoSurfaceView + routes
  config.ts                  Runtime config (URLs, feature flags)
  theme.ts                   Colours and layout constants

  data/
    modes.ts                 Mode metadata (id, label, colour, adjustments)
    clips.ts                 Clip metadata (id, label)

  player/
    usePlayerEngine.ts       Swap-based video engine (no seeking)

  session/
    types.ts                 Shared TypeScript types
    SessionContext.tsx        React context + provider
    MockSessionClient.ts      Offline mock (fake phone join + AI suggestion)
    SocketSessionClient.ts    Real backend via Socket.IO

  components/
    FocusButton.tsx           Pressable with TV focus ring
    ScaledStage.tsx           1920×1080 design-space transform wrapper
    QRCode.tsx                QR code rendered as a pixel grid
    icons.tsx                 All icons as plain Views (SVG unavailable on Vega)

  screens/
    PairingScreen.tsx         Welcome + QR code + room code
    PlayerScreen.tsx          Video player UI + bottom bar + overlays
    overlays/
      ModesOverlay.tsx        Viewing modes panel (4 mode cards)
      AssistantOverlay.tsx    AI recommendation panel
      CompareOverlay.tsx      Original vs enhanced still-frame compare

  spike/
    PlainReelTest.tsx         Single-player playback test (kept for reference)
    SwapSoakTest.tsx          10-cycle swap soak test (kept for reference)

scripts/
  make-media.sh              FFmpeg pipeline — builds all 10 clip variants
```

---

## Mock vs real backend

Set `USE_MOCK_SESSION` in `config.ts`:

| Value | Behaviour |
|-------|-----------|
| `true` | No backend needed. A fake phone joins after ~4 s; a fake AI suggestion fires ~10 s into playback. Good for development and demos without a running backend. |
| `false` | Connects to the real backend at `SOCKET_URL` via Socket.IO (`websocket` transport). Requires the backend to be running and reachable. |

See [`docs/tv-integration.md`](../docs/tv-integration.md) for the full event contract and testing instructions.

---

## Troubleshooting

**`"Vega CLI was not found in ambient environment"`**
Run `source ~/vega/env` before building.

**Video never plays / stays on "Loading…"**
- Check `MEDIA_BASE_URL` is set to a live HTTPS URL.
- Verify the tunnel is running: `curl -I $MEDIA_BASE_URL/night/original.mp4` should return `200 video/mp4`.
- The Virtual Device rejects `http://` sources — HTTPS is required.

**Picture freezes after a mode switch**
This is a known Vega Virtual Device limitation. The player engine always loads mode variants from the start (swap-based); it never seeks. If you see a freeze, a seek was called — check `ENABLE_SEEK` is `false`.

**Build fails with `kepler-compatibility.json` error**
The w3cmedia package must be pinned to exactly `2.3.2`. Check `package.json`.

**`initialize()` hangs on first load**
`initialize()` blocks until `setSurfaceHandle` is called. Make sure `KeplerVideoSurfaceView` is mounted before the engine starts. The engine waits for `onSurfaceViewCreated` via `waitSurface()`.

---

## Vega limitations relevant to this app

- **No runtime CSS filters** — picture modes use pre-processed `.mp4` variants.
- **No seeking** — any `currentTime` assignment freezes the picture permanently on the Virtual Device. Modes switch by loading a new player at position 0.
- **One hardware decoder at a time** — creating a new `VideoPlayer` before the old one is deinitialized crashes the app. The swap sequence always deinits before creating the next player.
- **`deinitialize()` is slow** — resolves in ~3 s after the first swap. The engine wraps it in a 3 s timeout and treats a timeout as a soft warning (teardown still completes natively).
- **`onSurfaceViewCreated` fires twice** — React 19 concurrent rendering fires the callback twice on a key-change remount. The engine ignores the second call.
- **SVG unavailable** — icons are drawn with plain `View` elements using the border trick for triangles and rotated/clipped rings for the replay icon.
- **`overflow: 'hidden'` creates an opaque layer** — the `ScaledStage` container must not set `overflow: 'hidden'` with a transparent background, or the Vega compositor makes it opaque. Background colours are set explicitly to `'transparent'` on the stage.
