import { Server } from "socket.io";
import { createApp } from "./app.js";
import { sweepExpired } from "./sessions.js";

// 4000 is the TV app's default SOCKET_URL port
const PORT = process.env.PORT || 4000;

const server = createApp().listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

setInterval(sweepExpired, 60_000).unref();

const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});
