// Pretend to be the TV or phone from a terminal.
// Usage: npx tsx scripts/fake-client.ts <CODE> <tv|phone> [url]
// Then type lines like:  mode:update {"mode":"night"}
import { createInterface } from "node:readline";
import { io } from "socket.io-client";

const [code, role, url = "http://localhost:4000"] = process.argv.slice(2);
if (!code || !role) {
  console.error("usage: fake-client.ts <CODE> <tv|phone> [url]");
  process.exit(1);
}

const socket = io(url, { transports: ["websocket"], query: { code, role } });
socket.on("connect", () => console.log(`connected as ${role} to ${code}`));
socket.on("connect_error", (e) => console.log(`connect_error: ${e.message}`));
socket.onAny((event, payload) => console.log(`← ${event}`, JSON.stringify(payload)));

createInterface({ input: process.stdin }).on("line", (line) => {
  const [event, ...rest] = line.trim().split(" ");
  if (!event) return;
  try {
    socket.emit(event, rest.length ? JSON.parse(rest.join(" ")) : {});
  } catch {
    console.log("payload must be JSON");
  }
});
