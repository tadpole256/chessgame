const fs = require("fs");
const http = require("http");
const path = require("path");

let WebSocketServer;
let WebSocket;

try {
  ({ WebSocketServer, WebSocket } = require("ws"));
} catch (error) {
  console.error("Missing dependency: ws");
  console.error("Run: npm install");
  process.exit(1);
}

const { ChessEngine } = require("./engine-core.js");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const rooms = new Map();
let nextClientId = 1;

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function normalizeRoomCode(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  return normalized || randomRoomCode();
}

function asColor(value) {
  return value === "w" || value === "b" ? value : null;
}

function createRoom(roomId) {
  return {
    id: roomId,
    engine: new ChessEngine(),
    players: { w: null, b: null },
    spectators: new Set(),
  };
}

function getOrCreateRoom(roomId) {
  const normalized = normalizeRoomCode(roomId);
  if (!rooms.has(normalized)) {
    rooms.set(normalized, createRoom(normalized));
  }
  return rooms.get(normalized);
}

function serializePlayers(room) {
  return {
    w: Boolean(room.players.w),
    b: Boolean(room.players.b),
  };
}

function send(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  send(room.players.w, payload);
  send(room.players.b, payload);
  for (const spectator of room.spectators) {
    send(spectator, payload);
  }
}

function releaseSeat(socket) {
  const roomId = socket.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    socket.roomId = null;
    socket.role = "none";
    socket.color = null;
    return;
  }

  if (room.players.w === socket) {
    room.players.w = null;
  }

  if (room.players.b === socket) {
    room.players.b = null;
  }

  room.spectators.delete(socket);

  socket.roomId = null;
  socket.role = "none";
  socket.color = null;

  const hasParticipants =
    Boolean(room.players.w) || Boolean(room.players.b) || room.spectators.size > 0;

  if (!hasParticipants) {
    rooms.delete(room.id);
    return;
  }

  broadcast(room, {
    type: "presence",
    players: serializePlayers(room),
  });
}

function assignRole(room, socket, preferredColor) {
  const preferred = asColor(preferredColor);

  let assignedColor = null;
  if (preferred && !room.players[preferred]) {
    assignedColor = preferred;
  } else if (!room.players.w) {
    assignedColor = "w";
  } else if (!room.players.b) {
    assignedColor = "b";
  }

  if (assignedColor) {
    room.players[assignedColor] = socket;
    socket.role = "player";
    socket.color = assignedColor;
    return;
  }

  room.spectators.add(socket);
  socket.role = "spectator";
  socket.color = null;
}

function validateMovePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const fromX = Number(payload.fromX);
  const fromY = Number(payload.fromY);
  const toX = Number(payload.toX);
  const toY = Number(payload.toY);

  if (
    !Number.isInteger(fromX) ||
    !Number.isInteger(fromY) ||
    !Number.isInteger(toX) ||
    !Number.isInteger(toY)
  ) {
    return null;
  }

  if (
    fromX < 0 ||
    fromX > 7 ||
    fromY < 0 ||
    fromY > 7 ||
    toX < 0 ||
    toX > 7 ||
    toY < 0 ||
    toY > 7
  ) {
    return null;
  }

  let promotionType = null;
  if (payload.promotionType != null) {
    const normalized = String(payload.promotionType).toLowerCase();
    if (["q", "r", "b", "n"].includes(normalized)) {
      promotionType = normalized;
    }
  }

  return { fromX, fromY, toX, toY, promotionType };
}

function handleJoin(socket, payload) {
  releaseSeat(socket);

  const room = getOrCreateRoom(payload.roomId);
  socket.roomId = room.id;

  assignRole(room, socket, payload.preferredColor);

  send(socket, {
    type: "joined",
    roomId: room.id,
    role: socket.role,
    color: socket.color,
    players: serializePlayers(room),
    state: room.engine.getSerializableState(),
  });

  broadcast(room, {
    type: "presence",
    players: serializePlayers(room),
  });

  if (socket.role === "player") {
    const colorName = socket.color === "w" ? "White" : "Black";
    broadcast(room, {
      type: "info",
      message: `${colorName} seat joined room ${room.id}.`,
    });
  }
}

function handleMove(socket, payload) {
  if (socket.role !== "player") {
    send(socket, { type: "error", message: "Spectators cannot move pieces." });
    return;
  }

  if (!socket.roomId || !rooms.has(socket.roomId)) {
    send(socket, { type: "error", message: "You are not in a room." });
    return;
  }

  const room = rooms.get(socket.roomId);

  if (room.engine.turn !== socket.color) {
    send(socket, { type: "error", message: "It is not your turn." });
    return;
  }

  const move = validateMovePayload(payload.move);
  if (!move) {
    send(socket, { type: "error", message: "Invalid move payload." });
    return;
  }

  const result = room.engine.attemptMove(
    move.fromX,
    move.fromY,
    move.toX,
    move.toY,
    move.promotionType,
  );

  if (!result.ok) {
    if (result.needsPromotion) {
      send(socket, { type: "error", message: "Promotion piece is required." });
      return;
    }

    send(socket, { type: "error", message: "Illegal move." });
    return;
  }

  broadcast(room, {
    type: "state",
    state: room.engine.getSerializableState(),
    lastMove: result.move.move,
    players: serializePlayers(room),
  });
}

function handleNewGame(socket) {
  if (socket.role !== "player") {
    send(socket, { type: "error", message: "Only players can reset the board." });
    return;
  }

  if (!socket.roomId || !rooms.has(socket.roomId)) {
    send(socket, { type: "error", message: "You are not in a room." });
    return;
  }

  const room = rooms.get(socket.roomId);
  room.engine.reset();

  broadcast(room, {
    type: "state",
    state: room.engine.getSerializableState(),
    players: serializePlayers(room),
    info: `New game started in room ${room.id}.`,
  });
}

function handleResign(socket) {
  if (socket.role !== "player") {
    send(socket, { type: "error", message: "Only players can resign." });
    return;
  }

  if (!socket.roomId || !rooms.has(socket.roomId)) {
    send(socket, { type: "error", message: "You are not in a room." });
    return;
  }

  const room = rooms.get(socket.roomId);

  if (room.engine.gameOver) {
    return;
  }

  const winner = socket.color === "w" ? "b" : "w";
  room.engine.setResult({
    type: "resign",
    winner,
    loser: socket.color,
    reason: "Resignation",
  });

  broadcast(room, {
    type: "state",
    state: room.engine.getSerializableState(),
    players: serializePlayers(room),
    info: `${socket.color === "w" ? "White" : "Black"} resigned.`,
  });
}

function handleSocketMessage(socket, message) {
  let payload;
  try {
    payload = JSON.parse(message.toString("utf8"));
  } catch (error) {
    send(socket, { type: "error", message: "Malformed JSON payload." });
    return;
  }

  if (!payload || typeof payload !== "object") {
    send(socket, { type: "error", message: "Invalid payload." });
    return;
  }

  if (payload.type === "join") {
    handleJoin(socket, payload);
    return;
  }

  if (payload.type === "move") {
    handleMove(socket, payload);
    return;
  }

  if (payload.type === "new_game") {
    handleNewGame(socket);
    return;
  }

  if (payload.type === "resign") {
    handleResign(socket);
    return;
  }

  if (payload.type === "ping") {
    send(socket, { type: "pong", now: Date.now() });
    return;
  }

  send(socket, { type: "error", message: `Unsupported message type: ${payload.type}` });
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === "/api/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const absolutePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!absolutePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(absolutePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(absolutePath, (readError, content) => {
      if (readError) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal Server Error");
        return;
      }

      res.writeHead(200, {
        "Content-Type": mimeType,
        "Cache-Control": "no-store",
      });
      res.end(content);
    });
  });
}

const httpServer = http.createServer(serveStatic);

const webSocketServer = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (clientSocket) => {
    webSocketServer.emit("connection", clientSocket, request);
  });
});

webSocketServer.on("connection", (socket) => {
  socket.clientId = `client-${nextClientId}`;
  nextClientId += 1;

  socket.roomId = null;
  socket.role = "none";
  socket.color = null;

  send(socket, { type: "info", message: "Socket connected." });

  socket.on("message", (message) => {
    handleSocketMessage(socket, message);
  });

  socket.on("close", () => {
    releaseSeat(socket);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Regal Chess server running on http://${HOST}:${PORT}`);
});
