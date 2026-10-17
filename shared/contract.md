# Event contract (v0, draft, agree before changing)

> **Do not change this file unilaterally.** It is shared by `tv/`, `phone/`, `backend/`, and `ai/`. Propose changes in a PR or team discussion first.

## TypeScript types

```ts
type ModeId = 'cinema' | 'night' | 'bright' | 'sports';

interface PictureSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  sharpness: number;
} // deltas, clamped -50..+50

interface SessionState {
  code: string; // 4 chars, no 0/O/1/I
  phoneConnected: boolean;
  mode: ModeId;
  settings: PictureSettings;
  clipId: string;
  roomLight: 'dark' | 'dim' | 'normal' | 'bright';
  expiresAt: number;
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

interface SceneInsights {
  clipId: string;
  timestamp: number;
  brightness: number;
  contrast: number;
  saturation: number; // 0..1
  sceneChange: boolean;
  label?: string;
}
```

## REST endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/sessions` | — | `SessionState` |
| `POST` | `/api/sessions/:code/join` | — | `SessionState` |
| `GET` | `/api/sessions/:code` | — | `SessionState` |
| `POST` | `/api/ai/recommend` | `{ code, request }` | `Recommendation` |
| `POST` | `/api/scenes/analyze` | `{ clipId, timestamp }` | `SceneInsights` |

## Socket.IO

Connect with query `{ code, role: 'tv' | 'phone' }`, using `websocket` transport.

### Server → all clients

| Event | Payload |
|-------|---------|
| `session:state` | `SessionState` |
| `settings:apply` | `{ mode, settings, source: 'phone' \| 'ai' \| 'tv' \| 'undo' }` |
| `ai:recommendation` | `Recommendation` |
| `scene:insights` | `SceneInsights` |

### Server → TV only

| Event | Payload |
|-------|---------|
| `overlay:open` | `{ overlay: 'modes' \| 'assistant' \| 'compare' \| null }` |
| `playback:command` | `{ action: 'play' \| 'pause' \| 'seek', position? }` |

### Client → server

| Event | Sender | Payload |
|-------|--------|---------|
| `mode:update` | any | `{ mode, source }` |
| `recommendation:respond` | any | `{ id, accepted }` |
| `settings:undo` | any | `{}` |
| `playback:update` | TV | `{ clipId, position, playing }` (every ~2 s) |
| `preferences:update` | phone | `{ roomLight?, style?, shadowDetail?, colourIntensity? }` |
| `playback:request` | phone | `{ action, position? }` (forwarded to TV as `playback:command`) |
