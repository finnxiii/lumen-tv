## Inspiration

Modern TVs have dozens of picture settings: brightness, contrast, colour, warmth, sharpness, plus a list of preset modes with names like "Vivid" or "Movie". Most people never touch them. When a scene is too dark to follow, or the screen is glaring in a dark bedroom, nobody stops the film to dig through menus.

We wanted a TV you could just *talk to*: *"it's too dark, I can't see anything"*, *"make it feel like a cinema"*, *"easier on my eyes"*. It should understand what you mean, look at what's on screen and how bright your room is, then pick the right picture for you and explain why.

## What it does

**Lumen** is an AI viewing assistant for Fire TV (Vega OS) with a phone remote.

- **Pair:** the TV shows a 4-letter room code and QR code. Your phone joins the room in the browser, with no app to install.
- **Ask in plain words:** typos and slang are fine. The assistant suggests a viewing mode (*Original, Cinema, Night, Bright Room, Sports*) and explains why.
- **Scene-aware:** each clip is analysed in advance, second by second. When a scene gets very dark, Lumen offers *"Dark scene: try Bright Room?"* without being asked.
- **Room-aware:** tell it your room lighting and its suggestions adapt.
- **You stay in control:** apply or dismiss suggestions from the TV or phone, compare the original and enhanced picture side by side, and undo any change.

## How we built it

```
phone (web) ──REST + Socket.IO──► backend (Node) ◄──Socket.IO── TV (Vega OS)
                                      │
                                      ├─ Gemini: understands the request
                                      ├─ settings engine: computes the values
                                      └─ scene data from OpenCV
```

**TV app:** React Native + TypeScript on the Vega SDK. It handles pairing, playback, the mode menu, the assistant panel and the comparison view, all navigable with a TV remote.

**Backend:** Node.js, TypeScript, Express and Socket.IO.

- Sessions are kept in memory and keyed by a short room code.
- Each session is a Socket.IO room, with separate sub-rooms for TV and phone, so the backend can message one side or both.
- Every socket message and API request is checked against a schema (zod) before use.

**AI: the LLM interprets, the engine decides.**

- Gemini receives the viewer's request plus context: the current mode, room lighting, preferences and live scene measurements.
- It returns only structured JSON: whether the request is relevant, the mode, a few named *intents* (such as `more_shadow_detail`) and a short explanation.
- It never outputs numbers. A deterministic engine turns that into picture settings:

$$
s = \operatorname{clamp}\big(p_{\text{mode}} + \Delta_{\text{room}} + \Delta_{\text{scene}} + \Delta_{\text{intents}} + \Delta_{\text{prefs}},\ -50,\ 50\big)
$$

The engine also records *why* each value changed, and those reasons are shown to the viewer.

If Gemini is slow, unavailable or returns something invalid, a keyword fallback takes over so the demo never breaks. The fallback tolerates typos using an edit distance that counts swapped letters, with an allowance that grows with word length:

$$
k(w) = \begin{cases} 0 & |w| < 6 \\ 1 & 6 \le |w| < 9 \\ 2 & |w| \ge 9 \end{cases}
$$

So *"cinmatic"* and *"footbal"* still work, but *"night"* never gets mistaken for *"light"*.

**Guardrails:**

- Off-topic requests (*"what's the weather?"*) are politely refused.
- The viewer's text is treated as data, not instructions, so prompt-injection attempts are rejected.
- A per-room cooldown protects the free-tier API quota.

**Scene analysis:** a Python/OpenCV script samples each clip once per second and measures:

- brightness (mean luma / 255)
- contrast (luma standard deviation)
- saturation

It also detects scene cuts by comparing colour histograms between samples. The backend serves these measurements by playback position, and they drive both the AI's context and the automatic suggestions.

**Phone remote:** a lightweight web page served by the backend.

- It shows a status for every action: sending, thinking, applied or failed.
- Controls are disabled while disconnected.
- It has one-tap example prompts.

## Challenges we ran into

- **Vega can't filter video at runtime.** CSS-style filters aren't supported, so we couldn't adjust the picture live. Instead, we pre-render each clip once per mode with FFmpeg, and the TV switches between versions. The engine still computes exact settings, which keeps the explanations accurate and would map directly onto a real TV's picture controls.
- **Seeking froze the Virtual Device.** Jumping to a position in a video froze the picture permanently, so switching modes restarts the clip. The device also allows only one hardware video decoder at a time, so the old player has to be fully released before the next one starts.
- **Networking quirks.** The emulator can't reach `localhost`, and Vega rejects `http://` video, so we served clips through an HTTPS tunnel and pointed the TV at the laptop's network address.
- **LLM latency on a free tier.** Gemini responses sometimes exceeded our timeout. That pushed us to make the rule-based fallback a first-class part of the design rather than an afterthought.
- **Calibrating to real footage.** Thresholds that looked sensible (e.g. "dark" < 0.25 brightness) didn't match our actual clips. A scene that *looks* dark measured 0.26, so we learned to check against real data.
- **Team changes mid-hackathon.** When a teammate left, we rebuilt the phone controller as a simple, no-build web page served by the backend.

## What we learned

- **Let the LLM handle language and keep numbers deterministic.** Asking the model for structured *intent* instead of raw values made the system predictable, testable and safe. Its output is validated like any other untrusted input.
- **Always have a fallback.** A demo that depends on a network call to an LLM needs a plan B.
- **A shared contract early saves hours later.** Agreeing on events and payloads between TV, phone and backend up front let us build in parallel.
- **Test on real constraints early.** Several of our assumptions about Vega (filters, seeking, networking) only broke once we ran on the Virtual Device.

## What's next

- Apply the computed settings directly through the TV's real picture controls instead of pre-rendered clips.
- Real-time scene analysis instead of offline processing.
- Learn each household's preferences over time.
- Voice input through the remote.
