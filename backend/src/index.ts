import express, { type Request, type Response } from "express";
import { Server } from "socket.io";

const app = express();
const PORT = process.env.PORT || 3000;

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

const io = new Server(server);

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});
