import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { loadScenes } from "./scenes.js";
import { sweepExpired } from "./sessions.js";
import { attachSocketHandlers } from "./socket.js";

// 4000 is the TV app's default SOCKET_URL port
const PORT = process.env.PORT || 4000;

loadScenes();

const io = new Server({ cors: { origin: "*" } });
const server = createServer(createApp(io));
io.attach(server);
attachSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

setInterval(sweepExpired, 60_000).unref();
