# Lumen — AI Viewing Assistant for Fire TV

An AI-powered viewing assistant for Amazon Vega OS that personalises the TV experience through intelligent viewing modes, natural-language controls, and adaptive visual enhancements. The TV app pairs with a phone controller website: viewers can switch between cinema, night, bright, and sports modes or send natural-language requests, while the AI analyses scene content, reads room lighting conditions, and applies learned preferences — then offers a side-by-side comparison of the original versus the enhanced picture so viewers can judge and keep or revert the change. Built for the Amazon Developer Hackathon, Fire TV track.

## Repo layout

| Folder | What it is | Owner |
|--------|-----------|-------|
| `tv/` | Vega OS app — React Native + TypeScript (Vega SDK) | Finn (NHL) |
| `phone/` | Phone controller website — React + TypeScript | NLH |
| `backend/` | Node.js + Express + Socket.IO, in-memory sessions | AYTH |
| `ai/` | LLM intent + Python/OpenCV frame analysis | AYTH / NLH |
| `shared/` | Event contract used by all parts | All |
| `docs/` | Architecture and prototype notes | All |

## Branch model

- `main` — shared structure and merged, working features
- One feature branch per person (e.g. `feature/tv-app`, `feature/phone`, `feature/backend`, `feature/ai`)
- Open a PR into `main` when a stage works end-to-end

## References

- [docs/tv-architecture.md](docs/tv-architecture.md) — TV app design: screens, navigation, data flow, design tokens
- [shared/contract.md](shared/contract.md) — REST endpoints and Socket.IO event contract
