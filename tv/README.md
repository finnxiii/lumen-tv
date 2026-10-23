# Lumen TV App

React Native app for Amazon Fire TV (Vega OS). Plays demo clips in four viewing modes, connects to the backend via Socket.IO, and shows AI recommendations from the phone controller.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| Vega SDK | 0.24.12112 | Installed at `~/vega/` |
| Vega CLI | 1.4.5 | Installed at `~/vega/` |
| ffmpeg | ≥ 5 | Media pipeline only |
| cloudflared | any | HTTPS tunnel to serve clips |

Source the Vega environment in every shell session before building:

```sh
source ~/vega/env
```

---

## Quick start — mock mode (no backend needed)

The app ships with a mock session client that simulates a phone and AI without any servers running.

```sh
cd tv
npm install
```

Make sure `USE_MOCK_SESSION = true` in `tv/src/config.ts` (the committed default). Build and run:

```sh
source ~/vega/env
npm run build:app
vega run-app tv/build/aarch64-release/lumentv_aarch64.vpkg com.lumen.tvapp.main -d VirtualDevice
```

What happens:
- Pairing screen shows a room code and QR
- After ~4 s: "Phone connected" pill appears (mock)
- After ~10 s of playback: AI recommendation panel opens automatically (mock)

No tunnel, backend, or config changes needed.

---

## Full setup with real backend

### 1. Start the backend

```sh
cd backend
npm install
# Create backend/.env — see backend/README.md for required keys
npm run dev     # starts on port 4000
```

### 2. Optional: scene insights (Python)

```sh
python3 -m venv ai/.venv
source ai/.venv/bin/activate
pip install -r ai/requirements.txt
python3 ai/analyze.py ~/lumen-media    # pre-processes frame data
```

### 3. Serve media over HTTPS

Vega rejects `http://` sources. Serve clips with a Cloudflare quick tunnel:

```sh
# Terminal 1: serve media files
python3 -m http.server 8000 --directory ~/lumen-media

# Terminal 2: open HTTPS tunnel (note the printed URL)
cloudflared tunnel --url http://localhost:8000
# → https://<hash>.trycloudflare.com
```

### 4. Create config.local.ts

```sh
cp tv/src/config.local.example.ts tv/src/config.local.ts
```

Edit `tv/src/config.local.ts`:

```ts
export const MEDIA_BASE_URL = 'https://YOUR-HASH.trycloudflare.com'; // from step 3
export const BACKEND_URL    = 'http://YOUR-MAC-IP:4000';             // see note below
export const USE_MOCK_SESSION = false;
```

**Network note:** the Vega Virtual Device runs in QEMU and cannot reach `localhost` or `10.0.2.2`. Use the Mac's LAN IP:

```sh
ipconfig getifaddr en0    # e.g. 10.136.73.54
```

### 5. Build and run

```sh
source ~/vega/env
cd tv && npm run build:app
vega run-app tv/build/aarch64-release/lumentv_aarch64.vpkg com.lumen.tvapp.main -d VirtualDevice
```

---

## Testing without the phone app

Use `fake-phone.js` to simulate the phone controller from a terminal. Run from inside `tv/`:

```sh
# First, note the room code shown on the TV pairing screen, then:
npm run fake-phone -- <ROOMCODE>
```

Optional flags:
- `--backend http://HOST:4000` — override backend URL (default: `http://localhost:4000`)
- `--demo` — scripted demo sequence instead of interactive

### Interactive mode (default)

```
phone> mode bright        ← switch to Bright Room mode
phone> ai too dark        ← request an AI suggestion
phone> undo               ← undo last settings change
phone> quit
```

All events received from the backend are printed as `← event {payload}`.

### Demo mode (`--demo`)

Runs a scripted sequence automatically:
1. Joins the room and waits 4 s for the TV to show "Phone connected"
2. Switches to **Bright Room** mode — watch the TV load the variant
3. Sends an AI request — watch the recommendation panel appear on the TV
4. Switches back to **Original** — watch the swap
5. Exits

```sh
npm run fake-phone -- <ROOMCODE> --demo
```

---

## Daily startup checklist

Each new day (or whenever the tunnel URL changes):

1. `source ~/vega/env` — always required
2. Start the backend: `cd backend && npm run dev`
3. Start media server: `python3 -m http.server 8000 --directory ~/lumen-media`
4. Start tunnel: `cloudflared tunnel --url http://localhost:8000`
5. Update `MEDIA_BASE_URL` in `tv/src/config.local.ts` with the new tunnel URL
6. Start Virtual Device: `vega virtual-device start`
7. Rebuild and run: `cd tv && npm run build:app && vega run-app ...`

**Restart notes:**
- Tunnel URL changes every time cloudflared restarts — always update `MEDIA_BASE_URL`.
- Backend restart creates a new in-memory state. The TV will show a stale room code; restart the app on the VD to get a fresh session.
- `vega virtual-device stop` / `start` sometimes takes 30–60 s. The VD must be fully started before `vega run-app`.

---

## Config

`tv/src/config.ts` (committed, placeholder defaults):

| Export | Default | Description |
|--------|---------|-------------|
| `MEDIA_BASE_URL` | `https://YOUR-TUNNEL.trycloudflare.com` | HTTPS base URL for clip `.mp4` files |
| `BACKEND_URL` | `http://YOUR-MAC-IP:4000` | Backend REST + Socket.IO server |
| `PHONE_URL` | `https://example.com` | Phone controller URL shown on pairing QR |
| `SOCKET_URL` | `= BACKEND_URL` | Alias — Socket.IO uses the same host |
| `USE_MOCK_SESSION` | `true` | `true` = mock; `false` = real backend |
| `ENABLE_SEEK` | `false` | Show ±10 s seek buttons (not safe on VD) |

Override any of these locally in `tv/src/config.local.ts` (gitignored, see `config.local.example.ts`). The file is merged at bundle time; `config.ts` keeps placeholder values in git.

---

## Media pipeline

One FFmpeg-processed `.mp4` per mode per clip. No runtime filtering — Vega OS does not support the React Native `filter` style property.

### Source material

| Clip | Source | Scene |
|------|--------|-------|
| `night` | Tears of Steel (blender.org) | Dark sci-fi interior — 00:09:09 |
| `day` | Big Buck Bunny (archive.org) | Bright outdoor meadow — 00:01:02 |

### Download + build

```sh
mkdir -p ~/lumen-media/source

curl -L -o ~/lumen-media/source/tears_of_steel_720p.mov \
  'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'

curl -L -o ~/lumen-media/source/big_buck_bunny_720p.mov \
  'https://archive.org/download/BigBuckBunny/big_buck_bunny_720p_h264.mov'

bash tv/scripts/make-media.sh
```

Output: `~/lumen-media/{night,day}/{original,cinema,night,bright,sports}.mp4` and frame JPGs.

---

## Source structure

```
tv/src/
  App.tsx                    Root: routes + KeplerVideoSurfaceView
  config.ts                  Committed defaults (real values in config.local.ts)
  config.local.example.ts    Template for config.local.ts
  theme.ts                   Colours and layout constants

  data/
    modes.ts                 Mode metadata (id, label, colour)
    clips.ts                 Clip metadata

  player/
    usePlayerEngine.ts       Swap-based video engine (no seeking)

  session/
    types.ts                 Shared TypeScript types + SessionClient interface
    SessionContext.tsx        React context + provider
    MockSessionClient.ts      Offline mock
    SocketSessionClient.ts    Real backend via Socket.IO

  components/
    FocusButton.tsx           Pressable with TV focus ring + disabled state
    StatusOverlay.tsx         Full-screen loading/transition/error overlay
    ScaledStage.tsx           1920×1080 design-space transform wrapper
    QRCode.tsx                QR rendered as a pixel grid
    icons.tsx                 All icons as plain Views

  screens/
    PairingScreen.tsx
    PlayerScreen.tsx
    overlays/
      ModesOverlay.tsx
      AssistantOverlay.tsx    Always available; shows spinner/error/empty states
      CompareOverlay.tsx

scripts/
  make-media.sh              FFmpeg pipeline
  fake-phone.js              Fake phone controller for testing
```

---

## Mock vs real backend

| `USE_MOCK_SESSION` | Behaviour |
|--------------------|-----------|
| `true` | No backend. Mock phone joins ~4 s in; AI suggestion fires ~10 s into playback. |
| `false` | Connects to `BACKEND_URL` via Socket.IO. Backend must be running. |

See [`docs/tv-integration.md`](../docs/tv-integration.md) for the full event contract.

---

## Troubleshooting

**`"Vega CLI was not found in ambient environment"`**  
Run `source ~/vega/env` before building.

**Video never plays / stays on "Loading…" (err:4)**  
- `MEDIA_BASE_URL` must be a live HTTPS URL. Verify: `curl -I $MEDIA_BASE_URL/night/original.mp4` → `200 video/mp4`.
- Tunnel URL changes every cloudflared restart — update `config.local.ts`.
- `http://` sources are rejected by Vega — HTTPS required.

**`EADDRINUSE :4000`**  
Another process has port 4000. Kill it: `lsof -ti:4000 | xargs kill -9`.

**Room code missing / "Cannot connect to backend"**  
- Backend is down, or `BACKEND_URL` is wrong.
- Check `USE_MOCK_SESSION = false` and backend is running at the expected URL.
- Remember: Virtual Device cannot reach `localhost` — use Mac LAN IP from `ipconfig getifaddr en0`.

**`Error: Cannot find module 'socket.io-client'` (fake-phone)**  
Run `npm run fake-phone` from inside `tv/`, not from the repo root or elsewhere. The script resolves modules from `tv/node_modules`.

**"Resuming…" overlay appears after pressing play**  
This is expected behaviour after a pause longer than 3 s. The Vega Virtual Device plays at fast-forward speed after a long pause to catch up. The app shows the overlay until the playback rate normalises (0.8–1.2× for 1 s), then hides it. If it hasn't normalised within 6 s the scene restarts. This is a known VD quirk; it does not occur on physical Fire TV hardware.

**Picture freezes after a mode switch**  
Known Vega Virtual Device limitation. The engine always loads mode variants from position 0 (swap-based, no seeking). Each swap takes ~4–8 s.

**Build fails with `kepler-compatibility.json` error**  
The w3cmedia package must be pinned to exactly `2.3.2`. Check `package.json`.

---

## Known Vega Virtual Device limitations

- **No runtime CSS filters** — picture modes use pre-processed `.mp4` variants.
- **No seeking** — `currentTime` assignment freezes the picture permanently on the VD. The engine never seeks; mode changes always restart from position 0.
- **One hardware decoder at a time** — two live `VideoPlayer` instances crash the app. The swap sequence always deinits the old player before creating the next.
- **`deinitialize()` is slow** — resolves in ~3 s after the first swap.
- **`onSurfaceViewCreated` fires twice** — React 19 concurrent rendering fires the callback twice on a key-change remount; the engine ignores the second call.
- **Fast-forward catchup after long pause** — after a pause > ~3 s, the VD resumes at 2–5× speed to catch up. The engine detects this via rate measurement and shows "Resuming…" until playback is confirmed at normal speed. Does not happen on physical hardware.
- **Play key handled by system** — the play/pause remote key is handled by system media controls; the app uses the on-screen button and does not intercept the hardware key.
- **SVG unavailable** — icons use the border/transform trick with plain `View` elements.
