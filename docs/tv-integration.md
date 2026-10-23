# TV Integration Guide

This document is for backend and phone teammates. It describes exactly how the TV app connects to the backend, what it sends, what it expects in return, and how to test the integration end-to-end.

For the full event contract see [`shared/contract.md`](../shared/contract.md). Differences between the contract and the current TV implementation are called out at the end.

---

## Verified end-to-end (real backend + VD)

The following flow has been confirmed working with the backend from `main` and the TV app on the Vega Virtual Device:

| Step | What was tested | Result |
|------|----------------|--------|
| Session create | `POST /api/sessions` → room code returned | ✅ |
| TV joins via Socket.IO | `session:state` received with `phoneConnected: false` | ✅ |
| Phone joins | `POST /api/sessions/:code/join` → `session:state` with `phoneConnected: true` | ✅ |
| Mode switch | Phone emits `mode:update` → backend broadcasts `settings:apply` → TV loads variant | ✅ |
| AI recommend | `POST /api/ai/recommend` → `ai:recommendation` socket event → TV opens panel | ✅ |
| Scene insights | `scene:insights` received after backend processes frame data | ✅ |

**`overlay:open` on AI recommendation**: the backend does not emit `overlay:open` alongside `ai:recommendation`. The TV opens the assistant panel locally whenever `ai:recommendation` arrives. The phone does not need to emit `overlay:open` for this flow.

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

Set `USE_MOCK_SESSION = true` in `tv/src/config.ts` (the committed default). The app uses `MockSessionClient`:
- Mock phone joins ~4 s after launch
- Fake AI recommendation fires ~10 s into playback

### Option 2 — fake-phone script (real backend, no phone website)

```sh
# Start the backend, build and run the TV, then from tv/:
npm run fake-phone -- <ROOMCODE>
```

Interactive commands:
```
phone> mode bright        ← triggers mode:update → settings:apply → TV loads variant
phone> ai too dark        ← calls POST /api/ai/recommend → ai:recommendation → TV opens panel
phone> undo               ← emits settings:undo
phone> quit
```

Run with `--demo` for the scripted sequence (join → bright → AI → original).

See `tv/README.md` — "Testing without the phone app" for full usage.

### Option 3 — phone website + backend

1. Start the backend
2. Open the phone controller site and join with the room code from the TV pairing screen
3. Use the phone UI to switch modes and send natural-language requests

---

## Exact phone payloads

These are the events and payloads the phone must send. The `fake-phone.js` script uses exactly these.

### Join a session

```
POST /api/sessions/:code/join
Content-Type: application/json
Body: {}
```

### Connect to Socket.IO

```js
io(BACKEND_URL, {
  transports: ['websocket'],
  query: { code, role: 'phone' },
});
```

### Switch mode

```json
socket.emit("mode:update", { "mode": "cinema", "source": "phone" })
```

Valid modes: `original` | `cinema` | `night` | `bright` | `sports`.

### Request AI recommendation

```
POST /api/ai/recommend
Content-Type: application/json
Body: { "code": "<ROOMCODE>", "request": "I can't see in this dark scene" }
```

Result arrives asynchronously via the `ai:recommendation` socket event on the TV.

### Undo

```json
socket.emit("settings:undo", {})
```

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
