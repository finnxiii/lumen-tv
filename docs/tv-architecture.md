# TV App Architecture

## Role

The TV app plays demo clips in its own player (no other streaming apps). It shows the current viewing mode, AI recommendations, and before/after comparisons. The **phone is the controller** — the TV never applies settings directly; it sends an intent to the backend and waits for `settings:apply`.

---

## Screens

### TV-01 — Welcome & pairing

App name, short intro, QR code linking to `<PHONE_URL>/join/<CODE>`, 4-char room code, expiry countdown, phone connection status pill. Actions: **Start watching** / **Continue without phone**.

### TV-02 — Video player

- Top-left: mode pill (current mode name + colour)
- Top-right: AI status pill + "Phone connected · room CODE"
- Bottom bar (auto-hides after 6 s): clip title, current time, progress bar, play/pause button, **Clip** / **Modes** / **Assistant** / **Compare** buttons
- Seek buttons (−10 s / +10 s) are behind the `ENABLE_SEEK` flag (default `false`) and are not shown in normal use

### TV-03 — Viewing modes (overlay on player)

4 mode cards, each showing: mode name, description, key adjustments. Active mode gets a "Current" badge. Opening the overlay focuses the current mode's card.

### TV-04 — AI recommendation (side-panel overlay, right)

- User's original request
- Recommended mode + recommendation title
- "Why" rows: Scene / Room / Preference
- Adjustment bars showing the proposed picture settings
- Actions: **Apply** / **Compare first** / **Dismiss**
- Footer: "Undo from your phone"

### TV-05 — Original vs enhanced (overlay)

Split still-frame comparison (left = original, right = enhanced) with a draggable divider. Metrics panel shows before→after values. Actions: **Keep** / **Revert** / **Back to playback**. Uses `frame-<variant>.jpg` still frames — not two simultaneous video streams.

---

## Navigation

Two routes: **Pairing → Player**. Overlays open on top of the player; none of them pause playback or change app state. Closing an overlay restores focus to the last-focused bottom-bar button.

- **Back button**: close open overlay → hide controls → (from pairing) return to pairing.
- **Overlay trigger**: backend sends `overlay:open`; an AI suggestion arriving at the TV automatically opens TV-04.

---

## Remote / focus

- D-pad moves focus; OK/Select activates.
- Play/pause remote key is handled by the system media controls (not intercepted in the app).
- Focused element: white ring + slight scale-up.
- Each overlay declares `hasTVPreferredFocus` on the appropriate element for initial focus.
- Bottom-bar focus is restored to the last-used button when controls reappear.

---

## Actual `tv/src` layout

```
App.tsx
config.ts
theme.ts

data/
  modes.ts
  clips.ts

player/
  usePlayerEngine.ts        Swap-based engine — no seeking

session/
  types.ts
  SessionContext.tsx
  MockSessionClient.ts
  SocketSessionClient.ts

components/
  FocusButton.tsx
  ScaledStage.tsx
  QRCode.tsx
  icons.tsx                 Plain-View icons (SVG unavailable on Vega)

screens/
  PairingScreen.tsx
  PlayerScreen.tsx
  overlays/
    ModesOverlay.tsx
    AssistantOverlay.tsx
    CompareOverlay.tsx

spike/
  PlainReelTest.tsx
  SwapSoakTest.tsx

scripts/
  make-media.sh
```

---

## Playback & enhancement

### Player

`@amazon-devices/react-native-w3cmedia` v2.3.2 — `VideoPlayer` + `KeplerVideoSurfaceView`. Requires `initialize()` before setting `src`, and `setSurfaceHandle` before `initialize()`.

### Per-variant files

One FFmpeg-processed `.mp4` per mode per clip:

```
~/lumen-media/
  night/  original.mp4  cinema.mp4  night.mp4  bright.mp4  sports.mp4
  day/    original.mp4  cinema.mp4  night.mp4  bright.mp4  sports.mp4
```

Encode spec: 960×540, H.264 Main L3.1, 1.5 Mbps (max 2 Mbps), 24 fps, AAC 128 kbps 48 kHz, 25 s duration.

### Still frames

One `frame-<variant>.jpg` per variant for the compare screen (TV-05).

### Mode switching — swap-based, no seeking

Seeking freezes the picture permanently on the Virtual Device. Mode changes and clip changes load a fresh `VideoPlayer` with the new file from position 0, following the swap sequence below.

**Swap sequence (soak-tested, 10 cycles):**

1. `player.pause()`
2. `player.deinitialize()` (3 s timeout — slow after the first swap)
3. 300 ms settle
4. `player.clearSurfaceHandle(handle)`
5. Null the handle ref; unmount `KeplerVideoSurfaceView` (key change)
6. Create `new VideoPlayer()`
7. Remount surface (new React key)
8. Wait for `onSurfaceViewCreated`
9. `player.initialize()`
10. `player.src = url` + wait for `loadedmetadata` / `canplay`
11. `player.play()` + wait for `'playing'` event

The first load (swap 0) skips steps 1–4 (no old player to tear down).

### Long-pause resume

If the player has been paused for more than 10 s, `play()` shows a full-screen "Resuming…" overlay, calls `play()`, then hides the overlay only after the `'playing'` event fires and at least 1 s of `currentTime` has advanced (max 4 s total).

### `ENABLE_SEEK` flag

`config.ts` exports `ENABLE_SEEK = false`. When `true`, ±10 s seek buttons appear and the remote rewind/fastforward keys are wired. Seek is not safe on the Virtual Device — this flag exists solely for testing on hardware.

---

## Session & data flow

`SessionContext` owns the client. Two implementations, switched by `USE_MOCK_SESSION` in `config.ts`:

| Client | Behaviour |
|--------|-----------|
| `MockSessionClient` | No backend needed. Fake phone joins after ~4 s; fake AI suggestion fires ~10 s into playback. |
| `SocketSessionClient` | Connects to the real backend via Socket.IO (`websocket` transport). |

### TV listens for

`session:state` · `settings:apply` · `ai:recommendation` · `scene:insights` · `overlay:open` · `playback:command`

### TV sends

`mode:update` · `recommendation:respond` · `settings:undo` · `playback:update` (every ~2 s)

> **The TV never applies a mode itself.** It sends `mode:update` and waits for `settings:apply` from the backend.

---

## Design tokens

| Token | Value |
|-------|-------|
| Resolution | 1920 × 1080 |
| Safe area | 96 px left/right · 64 px top/bottom |
| Background | `#07090d` |
| Surface | `#12161e` |
| Text | `#f2f4f8` |
| Muted text | `#9aa3b2` |
| Accent | `#2d7fff` |
| Focus ring | `#ffffff` |
| Button radius | 14 |
| Panel radius | 32 |

### Mode colours

| Mode | Colour |
|------|--------|
| Cinema | `#f2b04a` |
| Night | `#9b8cff` |
| Bright Room | `#ffd166` |
| Sports | `#3ddc97` |

---

## Known Vega limitations

- **No runtime CSS filters** — `filter` style not supported; use pre-processed variants.
- **No seeking** — `currentTime` assignment freezes picture permanently on the Virtual Device.
- **One hardware decoder at a time** — two live `VideoPlayer` instances crash the app.
- **`deinitialize()` is slow** (~3 s from swap 2 onward on the Virtual Device).
- **`onSurfaceViewCreated` fires twice** on a key-change remount (React 19); guard the handler.
- **`overflow: 'hidden'` creates an opaque layer** — do not combine with `backgroundColor: 'transparent'` on a container that should be transparent.
- **SVG unavailable** — icons use the border/transform triangle trick with plain `View` elements.
- **`initialize()` must follow `setSurfaceHandle`** — call `setSurfaceHandle` immediately in `onSurfaceViewCreated`; do not guard it.
