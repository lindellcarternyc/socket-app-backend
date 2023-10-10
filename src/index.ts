import express from "express";
import { Server, type Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 6969;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to LocShare");
});

const server = app.listen(port, () => {
  console.log(`Server is listening on PORT: ${port}`);
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

interface CustomSocket extends Socket {
  roomId?: string;
}

const roomCreator = new Map<string, string>();

io.on("connection", (socket: CustomSocket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(
    "createRoom",
    (data: { position: { lat: number; lng: number } }) => {
      const roomId = Math.random().toString(36).substring(2, 7);
      socket.join(roomId);
      const totalRoomUsers = io.sockets.adapter.rooms.get(roomId);
      socket.emit("roomCreated", {
        roomId,
        position: data.position,
        totalConnectedUsers: Array.from(totalRoomUsers ?? []),
      });
      roomCreator.set(roomId, socket.id);
      socket.roomId = roomId;
    }
  );

  socket.on("joinRoom", (data: { roomId: string }) => {
    const roomExists = io.sockets.adapter.rooms.has(data.roomId);

    if (roomExists) {
      socket.join(data.roomId);
      socket.roomId = data.roomId;

      const creatorSocketId = roomCreator.get(data.roomId);
      if (creatorSocketId) {
        const creatorSocket = io.sockets.sockets.get(creatorSocketId);
        if (creatorSocket) {
          const totalRoomUsers = io.sockets.adapter.rooms.get(data.roomId);
          creatorSocket.emit("userJoinedRoom", {
            userId: socket.id,
            totalConnectedUsers: Array.from(totalRoomUsers ?? []),
          });
        }
      }

      io.to(socket.id).emit("roomJoined", {
        status: "OK",
      });
    } else {
      io.to(socket.id).emit("roomJoined", {
        status: "ERROR",
      });
    }
  });

  socket.on("updateLocation", (data) => {
    io.emit("updateLocationResponse", data);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    const roomId = socket.roomId;
    if (roomId) {
      if (roomCreator.get(roomId) === socket.id) {
        const roomUsers = io.sockets.adapter.rooms.get(roomId);
        if (roomUsers) {
          for (const socketId of roomUsers) {
            io.to(socketId).emit("roomDestroyed", {
              status: "OK",
            });
          }
        }
        io.sockets.adapter.rooms.delete(roomId);
        roomCreator.delete(roomId);
      } else {
        socket.leave(roomId);
        const creatorSocketId = roomCreator.get(roomId);
        if (creatorSocketId) {
          const creatorSocket = io.sockets.sockets.get(creatorSocketId);
          if (creatorSocket) {
            creatorSocket.emit("userLeftRoom", {
              userId: socket.id,
              totalConnectedUsers: Array.from(
                io.sockets.adapter.rooms.get(roomId) ?? []
              ),
            });
          }
        }
      }
    }
  });
});
