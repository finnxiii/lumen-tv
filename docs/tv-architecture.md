# TV App Architecture

## Role

The TV app plays demo clips in its own player (no other streaming apps). It shows the current viewing mode, AI recommendations, and before/after comparisons. The **phone is the controller** — the TV never acts on input from the user directly except D-pad navigation and the remote's play/pause key.

---

## Screens

### TV-01 — Welcome & pairing (route)

App name, short intro, QR code linking to `<PHONE_URL>/join/<CODE>`, 4-char room code, expiry countdown, phone connection status pill. Actions: **Start watching** / **Continue without phone**.

### TV-02 — Video player (route)

- Top-left: mode pill (current mode name + colour)
- Top-right: AI status pill + "Phone connected · room CODE"
- Bottom bar (auto-hides after 6 s): clip title, current time, progress bar, −10 s / play-pause / +10 s buttons, **Viewing modes** / **Assistant** / **Compare** buttons

### TV-03 — Viewing modes (overlay on player)

4 mode cards, each showing: mode name, description, key adjustments. Active mode gets a "Current" badge. After switching: "Cinema applied" toast (name changes per mode).

### TV-04 — AI recommendation (side-panel overlay, right)

- User's original request
- Recommended mode + recommendation title
- "Why" rows: Scene / Room / Preference
- Adjustment bars showing the proposed picture settings
- Actions: **Apply** / **Compare first** / **Dismiss**
- Footer: "Undo from your phone"

### TV-05 — Original vs enhanced (overlay)

Split frame (left = original, right = enhanced) with a draggable divider. Metrics panel shows before→after values. Reason label. Actions: **Keep** / **Revert** / **Back to playback**. Uses still frames — not two simultaneous video streams.

---

## Navigation

Two routes only: **Pairing → Player**. Overlays open on top of the player and never pause playback.

- **Back button**: close open overlay → hide controls → (from pairing) return to pairing.
- **Overlay trigger**: phone/backend sends `overlay:open`; an AI suggestion arriving at the TV automatically opens TV-04.

---

## Remote / focus

- D-pad moves focus; OK/Select activates.
- Play/pause remote key works from any screen.
- Focused element: white ring + slight scale-up.
- Each screen declares a `hasTVPreferredFocus` element for the initial focus.

---

## Planned `tv/src` layout

```
App.tsx
config.ts
theme.ts

data/
  modes.ts
  clips.ts

player/
  useVariantPlayer.ts

session/
  types.ts
  SocketSessionClient.ts
  MockSessionClient.ts
  SessionContext.tsx

components/
  FocusButton.tsx
  QRCode.tsx
  Chrome.tsx

screens/
  PairingScreen.tsx
  PlayerScreen.tsx
  overlays/
    ModesOverlay.tsx
    AssistantOverlay.tsx
    CompareOverlay.tsx

scripts/
  make-variants.sh
```

---

## Playback & enhancement

- Player: Vega `@amazon-devices/react-native-w3cmedia` `VideoPlayer` + `KeplerVideoView`. Requires `initialize()` before playback.
- One FFmpeg-made file per variant: `original`, `cinema`, `night`, `bright`, `sports`.
- One still frame per variant for TV-05 (compare screen).
- Mode change: swap the source URL and seek to the same position.
- Until real variants are hosted, a translucent tint overlay stands in as a placeholder.

---

## Session & data flow

`SessionContext` owns the client. Two client implementations, switched by `USE_MOCK_SESSION` in `config.ts`:

| Client | Behaviour |
|--------|-----------|
| `MockSessionClient` | No backend needed. Fake phone joins after ~4 s; fake AI suggestion fires ~10 s into playback. |
| `SocketSessionClient` | Connects to the real backend via Socket.IO (websocket transport). |

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
| Bright | `#ffd166` |
| Sports | `#3ddc97` |

---

## Risks to verify on the Vega Virtual Device

- Video playback works
- Source swapping + seeking resumes at the correct position
- `Pressable` `onFocus` / `hasTVPreferredFocus` behave as expected
- `BackHandler` (fallback: `'back'` in `useTVEventHandler`)
- Socket.IO over `websocket` transport reachable from the device
