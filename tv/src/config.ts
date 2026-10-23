// Replace with your Cloudflare quick-tunnel URL: cloudflared tunnel --url http://localhost:8000
export const MEDIA_BASE_URL =
  'https://label-tasks-off-although.trycloudflare.com';
// TODO: replace with deployed phone URL when backend is live
export const PHONE_URL = 'https://example.com';
// Vega Virtual Device (QEMU) cannot reach localhost — use the Mac's LAN IP.
// Update this if your LAN IP changes (ifconfig | grep "inet ").
export const BACKEND_URL = 'http://10.136.73.54:4000';
export const SOCKET_URL = BACKEND_URL;
export const USE_MOCK_SESSION = false;
// Set to true to show ±10 s seek buttons (seek freezes picture on the Virtual Device)
export const ENABLE_SEEK = false;
