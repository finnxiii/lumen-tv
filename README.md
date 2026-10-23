# Lumen — AI Viewing Assistant for Fire TV

An AI-powered viewing assistant for Amazon Vega OS that personalises the TV experience through intelligent viewing modes, natural-language controls, and adaptive visual enhancements. The TV app pairs with a phone controller website: viewers can switch between cinema, night, bright, and sports modes or send natural-language requests, while the AI analyses scene content, reads room lighting conditions, and applies learned preferences — then offers a side-by-side comparison of the original versus the enhanced picture so viewers can judge and keep or revert the change. Built for the Amazon Developer Hackathon, Fire TV track.

## Repo layout

| Folder | What it is |
|--------|-----------|
| `tv/` | Vega OS app — React Native + TypeScript (Vega SDK) |
| `phone/` | Phone controller web page (plain HTML, served by the backend) |
| `backend/` | Node.js + Express + Socket.IO, in-memory sessions, Gemini AI |
| `ai/` | Python/OpenCV offline scene analysis |
| `shared/` | Event contract used by all parts |
| `docs/` | Architecture and integration notes |

## How it works

```
phone ──REST + Socket.IO──► backend :4000 ◄──Socket.IO── TV (Vega)
                              │
                              ├─ Gemini: turns "it's too dark" into a mode + intents
                              ├─ engine: computes and clamps the picture settings
                              └─ ai/scenes/*.json: per-second scene brightness/colour
```

The TV plays a pre-rendered video for each mode (`original`, `cinema`, `night`, `bright`, `sports`) because Vega can't filter video at runtime. The backend decides which mode to use and explains why. Without a Gemini key, or if Gemini fails, the backend falls back to keyword rules so the demo still works.

## Run it

### Prerequisites

| Tool | Version | For |
|------|---------|-----|
| Node.js | ≥ 20 | backend, TV build, fake phone |
| Python | ≥ 3.10 | scene analysis |
| ffmpeg | ≥ 5 | building the demo clips |
| cloudflared | any | HTTPS tunnel for the clips (Vega rejects `http://` video) |
| Vega SDK + CLI | 0.24 / 1.4.5 | building and running the TV app ([Amazon Vega docs](https://developer.amazon.com/docs/vega/)) |

On macOS: `brew install node python ffmpeg cloudflared`.

### 1. Get a Gemini API key (free)

1. Go to <https://aistudio.google.com/apikey> and create a key.
2. Create the backend env file:

   ```sh
   cp backend/.env.example backend/.env
   ```

3. Open `backend/.env` and paste your key:

   ```
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-flash-latest
   PORT=4000
   ```

`backend/.env` is gitignored. Never commit it. If you skip this step, the backend uses keyword rules instead of Gemini.

### 2. Start the backend

```sh
cd backend
npm install
npm test          # optional: runs the test suite
npm run dev       # http://localhost:4000
```

Check it's up: `curl localhost:4000/health`.

### 3. Build the demo clips

The clips come from open movies by the Blender Foundation (CC BY 3.0). They are downloaded and processed, not committed.

```sh
mkdir -p ~/lumen-media/source
curl -L -o ~/lumen-media/source/tears_of_steel_720p.mov \
  'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'
curl -L -o ~/lumen-media/source/big_buck_bunny_720p.mov \
  'https://archive.org/download/BigBuckBunny/big_buck_bunny_720p_h264.mov'
bash tv/scripts/make-media.sh
```

This writes `~/lumen-media/{night,day}/{original,cinema,night,bright,sports}.mp4`.

### 4. Run the scene analysis

```sh
python3 -m venv ai/.venv
source ai/.venv/bin/activate
pip install -r ai/requirements.txt
python3 ai/analyze.py ~/lumen-media      # writes ai/scenes/night.json and day.json
```

Restart the backend afterwards. It should log `[scenes] loaded day, night`. This step enables scene insights and the automatic "Dark scene: try Bright Room?" suggestion. Everything else works without it.

### 5. Serve the clips over HTTPS

Run each command in its own terminal:

```sh
python3 -m http.server 8000 --directory ~/lumen-media
cloudflared tunnel --url http://localhost:8000     # prints https://<something>.trycloudflare.com
```

### 6. Configure and run the TV app

```sh
cp tv/src/config.local.example.ts tv/src/config.local.ts
ipconfig getifaddr en0       # your Mac's LAN IP; the Virtual Device can't reach localhost
```

Edit `tv/src/config.local.ts`:

```ts
export const MEDIA_BASE_URL   = 'https://<something>.trycloudflare.com';  // from step 5
export const BACKEND_URL      = 'http://<your-mac-ip>:4000';
export const PHONE_URL        = 'http://<your-mac-ip>:4000';               // the QR code opens the phone remote
export const USE_MOCK_SESSION = false;
```

Build and run:

```sh
source ~/vega/env
vega virtual-device start            # wait until it has fully booted
cd tv
npm install
npm run build:app
vega run-app build/aarch64-release/lumentv_aarch64.vpkg com.lumen.tvapp.main -d VirtualDevice
```

The TV shows a pairing screen with a 4-letter room code.

To try the TV app without a backend, leave `USE_MOCK_SESSION = true`. A simulated phone and AI then drive it.

### 7. Control it from your phone

The backend serves the phone remote. Put your phone on the same Wi-Fi as the Mac, then either:

- scan the QR code on the TV pairing screen, or
- open `http://<your-mac-ip>:4000` and type the room code.

To test on the laptop instead, open `http://localhost:4000` in a browser. Optionally, turn on the mobile view in the browser's dev tools.

On the remote you can switch modes, ask the assistant, Apply or Dismiss its suggestions, Undo, and set the room lighting.

| Try asking | What happens |
|------------|--------------|
| `It's way too dark, I can't see anything` | Suggests Bright Room. Press Apply on the phone or the TV |
| `Make it feel like a movie theatre` | Suggests Cinema |
| `im watching footbal` | Typos are fine: suggests Sports |
| `Reset it to the original` | Suggests Original |
| `What's the weather tomorrow` | Rejected: it only helps with the picture |

The backend log shows how each request was handled. `(gemini)` means Gemini answered, and `(rules)` means the keyword fallback was used.

There's also a terminal remote: `cd tv && npm install && npm run fake-phone -- ABCD`.
`npm run fake-phone -- ABCD --demo` runs a scripted demo instead.

### Backend only, no TV

```sh
curl -s -X POST localhost:4000/api/sessions                 # note the "code"
cd backend && npx tsx scripts/fake-client.ts ABCD tv        # fake TV: prints every event
open http://localhost:4000/join/ABCD                        # phone remote in a browser
```

In the fake TV terminal, type these to drive it:
- `playback:update {"clipId":"night","position":1,"playing":true}` reports playback position.
- `recommendation:respond {"id":"<id>","accepted":true}` presses Apply on a recommendation.

## Troubleshooting

- **`EADDRINUSE :4000`:** another process is using the port. Run `lsof -ti:4000 | xargs kill`.
- **The backend log shows `Gemini failed, using rules`:** the reason is printed on the same line. Usually the key is wrong, the free-tier quota is used up, or the request timed out. The demo keeps working on rules.
- **The TV says it can't connect:** `BACKEND_URL` must use your Mac's LAN IP, not `localhost`.
- **Video never plays:** the tunnel URL changes every time cloudflared restarts. Update `MEDIA_BASE_URL` and rebuild.

More detail is in [tv/README.md](tv/README.md).

## References

- [tv/README.md](tv/README.md) — TV app: setup, media pipeline, config, build, troubleshooting
- [docs/tv-architecture.md](docs/tv-architecture.md) — TV app design: screens, player, swap sequence, Vega constraints
- [docs/tv-integration.md](docs/tv-integration.md) — Backend/phone integration: REST, Socket.IO events, payloads, testing
- [shared/contract.md](shared/contract.md) — REST endpoints and Socket.IO event contract

## Contributors

- Aung Ye Thant Hein
- Naing Htoo Lwin
- Nyan Lin Htet

## License

[MIT](LICENSE)
