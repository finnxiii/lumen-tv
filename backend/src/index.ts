import cors from "cors";
import express, { type Request, type Response } from "express";
import { Server } from "socket.io";

const app = express();
// 4000 is the TV app's default SOCKET_URL port
const PORT = process.env.PORT || 4000;

// shortcut: any origin allowed, lock to the phone site's URL once it's hosted
app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello from TypeScript + Express!" });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "OK" });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});
