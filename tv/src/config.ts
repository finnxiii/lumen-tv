// Committed defaults — all placeholder values safe to commit.
// Local overrides go in config.local.ts (gitignored).
// On fresh clone: cp tv/src/config.local.example.ts tv/src/config.local.ts

type ConfigShape = {
  MEDIA_BASE_URL: string;
  BACKEND_URL: string;
  PHONE_URL: string;
  USE_MOCK_SESSION: boolean;
  ENABLE_SEEK: boolean;
};

const _defaults: ConfigShape = {
  /** HTTPS base URL for clip files — start a Cloudflare tunnel: cloudflared tunnel --url http://localhost:8000 */
  MEDIA_BASE_URL: 'https://YOUR-TUNNEL.trycloudflare.com',
  /** Backend server — Vega Virtual Device (QEMU) cannot reach localhost; use Mac LAN IP (ipconfig getifaddr en0) */
  BACKEND_URL: 'http://YOUR-MAC-IP:4000',
  /** Phone controller URL shown on pairing QR */
  PHONE_URL: 'https://example.com', // TODO: deployed phone URL
  /** true = MockSessionClient (no backend); false = SocketSessionClient (real backend) */
  USE_MOCK_SESSION: true,
  /** Show ±10 s seek buttons — not safe on the Virtual Device */
  ENABLE_SEEK: false,
};

// Metro injects require() globally; @types/node may not cover it in this tsconfig.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const _local: Partial<ConfigShape> = (() => { try { return (require as (id: string) => any)('./config.local') as Partial<ConfigShape>; } catch { return {}; } })();

const _c = {..._defaults, ..._local};

export const MEDIA_BASE_URL: string = _c.MEDIA_BASE_URL;
export const BACKEND_URL: string   = _c.BACKEND_URL;
export const PHONE_URL: string     = _c.PHONE_URL;
export const SOCKET_URL: string    = _c.BACKEND_URL;
export const USE_MOCK_SESSION: boolean = _c.USE_MOCK_SESSION;
export const ENABLE_SEEK: boolean  = _c.ENABLE_SEEK;
