# TV Integration Guide

This document is for backend and phone teammates. It describes exactly how the TV app connects to the backend, what it sends, what it expects in return, and how to test the integration end-to-end.

For the full event contract see [`shared/contract.md`](../shared/contract.md). Differences between the contract and the current TV implementation are called out at the end.

---

## Connection

The TV app connects to the backend on startup via Socket.IO:

```ts
import { io } from 'socket.io-client';

const socket = io(SOCKET_URL, {
  transports: ['websocket'],    // websocket only — no polling fallback
  query: { code, role: 'tv' },
});
```

`SOCKET_URL` defaults to `http://localhost:4000` (set in `tv/src/config.ts`). The TV creates the session via REST first, then connects with the returned room code.

---

## REST — what the TV calls

### Create session

```
POST /api/sessions
```

Response: `SessionState`

The TV calls this once on startup to obtain a room code. The code is shown on the pairing screen QR and as a 4-character text code.

### Get session

```
GET /api/sessions/:code
```

Response: `SessionState`

Called after reconnect to reload current state.

---

## Socket.IO — what the TV sends

### `mode:update`

Emitted when the user selects a mode in the Viewing Modes overlay.

```json
{ "mode": "cinema", "source": "tv" }
```

The TV does **not** apply the mode locally. It waits for `settings:apply` from the backend before the player loads the new variant.

### `recommendation:respond`

Emitted when the user taps Apply or Dismiss on the AI recommendation panel.

```json
{ "id": "<recommendation id>", "accepted": true }
```

### `settings:undo`

Emitted when the user requests an undo (phone-side "Undo" button sends `playback:request` with `action: 'undo'`; the TV forwards this).

```json
{}
```

### `playback:update`

Emitted every ~2 s while the player screen is active.

```json
{
  "clipId": "night",
  "position": 14.3,
  "playing": true
}
```

---

## Socket.IO — what the TV listens for

### `session:state` → `SessionState`

Full session snapshot. The TV uses `phoneConnected` to show/hide the phone connection pill and `code` for the room code display.

### `settings:apply`

Triggers the TV player to load the new mode variant. The TV responds to `mode`, ignoring `settings` (picture settings are encoded into the variant files at build time, not applied at runtime).

```json
{
  "mode": "cinema",
  "settings": { "brightness": 0, "contrast": 15, "saturation": -15, "warmth": -10, "shadows": 5, "sharpness": 0 },
  "source": "phone"
}
```

The TV calls `engine.load(currentClip, payload.mode)`, which starts the swap sequence and shows "Previewing Cinema from the start of the scene…".

### `ai:recommendation` → `Recommendation`

Displays the AI recommendation panel (TV-04) automatically. The TV shows:
- `recommendation.request` (user's original text, if present)
- `recommendation.mode` (e.g. `"cinema"`)
- `recommendation.title`
- `recommendation.reasons` (array of `{label, value}`)
- `recommendation.explanation`

### `scene:insights` → `SceneInsights`

Received but not currently displayed in the UI. Stored in session context for potential future use.

### `overlay:open`

Opens the specified overlay on the TV.

```json
{ "overlay": "assistant" }
```

Valid values: `"modes"` | `"assistant"` | `"compare"` | `null` (closes current overlay).

### `playback:command`

```json
{ "action": "play" }
{ "action": "pause" }
```

The TV calls `engine.play()` or `engine.pause()` accordingly. `seek` is forwarded by the contract but has no effect on the TV (seeking freezes the picture on the Virtual Device; `ENABLE_SEEK` is `false` by default).

---

## How to test

### Option 1 — mock session (no backend required)

Set `USE_MOCK_SESSION = true` in `tv/src/config.ts`. The TV uses `MockSessionClient`, which:
- Simulates a phone joining ~4 s after launch
- Fires a fake AI recommendation ~10 s into playback

This lets the TV UI be exercised without a running backend.

### Option 2 — real backend on localhost

1. Start the backend: `cd backend && npm start` (default port 4000)
2. Set `USE_MOCK_SESSION = false` and `SOCKET_URL = 'http://localhost:4000'` in `tv/src/config.ts`
3. Build and run the TV app on the Virtual Device
4. Check the Vega device network is bridged to your Mac (Vega VD uses the host network by default)

To simulate a phone sending a mode update, use curl:

```sh
# 1. Create a session and note the code
CODE=$(curl -s -X POST http://localhost:4000/api/sessions | jq -r .code)
echo "code: $CODE"

# 2. Emit mode:update via the Socket.IO test tool (or backend REST shim)
curl -s -X POST http://localhost:4000/api/sessions/$CODE/mode \
  -H 'Content-Type: application/json' \
  -d '{"mode":"cinema","source":"phone"}'
```

The backend should broadcast `settings:apply` and the TV player should swap to the cinema variant.

### Option 3 — phone + backend

1. Start the backend
2. Open the phone controller site and join the room code shown on the TV pairing screen
3. Use the phone UI to switch modes and send natural-language requests

---

## Differences from `shared/contract.md`

The TV implementation diverges from the v0 contract in a few places. These are proposed changes for the team to ratify:

| Area | Contract says | TV does | Notes |
|------|--------------|---------|-------|
| `settings:apply` | Backend sends full `PictureSettings` | TV ignores `settings`; only `mode` is used | Picture settings are baked into variant files; runtime deltas are not applied |
| `playback:command` `seek` | `{ action: 'seek', position: N }` | No-op | Seeking freezes picture on the Virtual Device; the TV silently ignores seek commands |
| `mode:update` source | `{ mode, source }` | Sends `source: 'tv'` | Phone sends `source: 'phone'`; the contract should specify valid sources |
| `playback:update` | Every ~2 s | Every ~2 s via `setInterval` | Position comes from `player.currentTime` polled at 500 ms; there may be slight lag |
| `preferences:update` | Phone → server | Not handled by TV | TV only acts on `settings:apply` after the backend processes preferences |

---

## TypeScript types (from `shared/contract.md`)

```ts
type ModeId = 'cinema' | 'night' | 'bright' | 'sports';
type VariantId = 'original' | ModeId;

interface PictureSettings {
  brightness: number;   // delta, clamped -50..+50
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  sharpness: number;
}

interface Recommendation {
  id: string;
  request?: string;
  mode: ModeId;
  title: string;
  settings: PictureSettings;
  reasons: { label: string; value: string }[];
  explanation: string;
}
```

Full types are in `shared/contract.md` and mirrored in `tv/src/session/types.ts`.
