const { FILES, PIECE_SYMBOLS, PIECE_VALUES, ChessEngine } = window.ChessCore;

const AI_LEVELS = {
  easy: { depth: 1, noise: 0.9 },
  medium: { depth: 2, noise: 0.45 },
  hard: { depth: 3, noise: 0.15 },
};

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

function sanitizeRoomCode(value) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

class ChessAI {
  getDifficultyConfig(level) {
    return AI_LEVELS[level] || AI_LEVELS.medium;
  }

  scoreMoveOrdering(engine, move) {
    const mover = engine.getPiece(move.fromX, move.fromY);
    const target = move.isEnPassant
      ? { type: "p" }
      : engine.getPiece(move.toX, move.toY);

    let score = 0;

    if (move.isCapture) {
      const capturedValue = target ? PIECE_VALUES[target.type] : 1;
      const moverValue = mover ? PIECE_VALUES[mover.type] : 1;
      score += capturedValue * 10 - moverValue;
    }

    if (move.promotionType) {
      score += PIECE_VALUES[move.promotionType] + 8;
    }

    if (move.isCastle) {
      score += 1.4;
    }

    return score;
  }

  orderMoves(engine, moves) {
    return [...moves].sort(
      (a, b) => this.scoreMoveOrdering(engine, b) - this.scoreMoveOrdering(engine, a),
    );
  }

  pieceSquareBonus(piece, x, y, endgame) {
    const rank = piece.color === "w" ? 7 - y : y;
    const centerDistance = Math.abs(3.5 - x) + Math.abs(3.5 - y);

    if (piece.type === "p") {
      return rank * 0.08 - centerDistance * 0.02;
    }

    if (piece.type === "n") {
      return 0.45 - centerDistance * 0.1;
    }

    if (piece.type === "b") {
      return 0.3 - centerDistance * 0.06;
    }

    if (piece.type === "r") {
      return rank * 0.03;
    }

    if (piece.type === "q") {
      return 0.18 - centerDistance * 0.03;
    }

    if (piece.type === "k") {
      if (endgame) {
        return 0.45 - centerDistance * 0.09;
      }
      return centerDistance * -0.04;
    }

    return 0;
  }

  evaluatePosition(engine, aiColor) {
    if (engine.gameOver && engine.result) {
      if (engine.result.type === "checkmate") {
        return engine.result.winner === aiColor ? 100000 : -100000;
      }
      if (engine.result.type === "timeout") {
        return engine.result.winner === aiColor ? 100000 : -100000;
      }
      return 0;
    }

    let totalMaterial = 0;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = engine.getPiece(x, y);
        if (!piece || piece.type === "k") {
          continue;
        }
        totalMaterial += PIECE_VALUES[piece.type];
      }
    }

    const endgame = totalMaterial <= 14;
    let score = 0;

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = engine.getPiece(x, y);
        if (!piece) {
          continue;
        }

        const multiplier = piece.color === aiColor ? 1 : -1;
        const material = PIECE_VALUES[piece.type];
        const placement = this.pieceSquareBonus(piece, x, y, endgame);
        score += multiplier * (material + placement);
      }
    }

    const aiMoves = engine.getAllLegalMoves(aiColor).length;
    const oppColor = aiColor === "w" ? "b" : "w";
    const oppMoves = engine.getAllLegalMoves(oppColor).length;
    score += (aiMoves - oppMoves) * 0.04;

    if (engine.isKingInCheck(aiColor)) {
      score -= 0.25;
    }
    if (engine.isKingInCheck(oppColor)) {
      score += 0.25;
    }

    return score;
  }

  search(engine, depth, alpha, beta, aiColor) {
    if (depth <= 0 || engine.gameOver) {
      return this.evaluatePosition(engine, aiColor);
    }

    const currentColor = engine.turn;
    const moves = this.orderMoves(engine, engine.getAllLegalMoves(currentColor));

    if (!moves.length) {
      return this.evaluatePosition(engine, aiColor);
    }

    if (currentColor === aiColor) {
      let value = Number.NEGATIVE_INFINITY;

      for (const move of moves) {
        const result = engine.applyMove(move);
        if (!result.ok) {
          continue;
        }

        const next = this.search(engine, depth - 1, alpha, beta, aiColor);
        engine.undo();

        if (next > value) {
          value = next;
        }
        if (value > alpha) {
          alpha = value;
        }
        if (beta <= alpha) {
          break;
        }
      }

      return value;
    }

    let value = Number.POSITIVE_INFINITY;

    for (const move of moves) {
      const result = engine.applyMove(move);
      if (!result.ok) {
        continue;
      }

      const next = this.search(engine, depth - 1, alpha, beta, aiColor);
      engine.undo();

      if (next < value) {
        value = next;
      }
      if (value < beta) {
        beta = value;
      }
      if (beta <= alpha) {
        break;
      }
    }

    return value;
  }

  chooseMove(engine, level, aiColor) {
    const config = this.getDifficultyConfig(level);
    const moves = this.orderMoves(engine, engine.getAllLegalMoves(aiColor));

    if (!moves.length) {
      return null;
    }

    let bestScore = Number.NEGATIVE_INFINITY;
    const scoredMoves = [];

    for (const move of moves) {
      const result = engine.applyMove(move);
      if (!result.ok) {
        continue;
      }

      const score = this.search(
        engine,
        Math.max(0, config.depth - 1),
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        aiColor,
      );

      engine.undo();

      scoredMoves.push({ move, score });
      if (score > bestScore) {
        bestScore = score;
      }
    }

    const tolerance = config.noise;
    const nearBest = scoredMoves.filter((entry) => entry.score >= bestScore - tolerance);
    const pool = nearBest.length ? nearBest : scoredMoves;
    const chosen = pool[randomInt(pool.length)];

    return chosen ? { ...chosen.move } : null;
  }
}

class OnlineClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.socket = null;
    this.connected = false;
  }

  emit(event) {
    if (this.onEvent) {
      this.onEvent(event);
    }
  }

  connect(roomId, preferredColor) {
    this.disconnect(false);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.emit({ type: "socket_open" });
      this.send({ type: "join", roomId, preferredColor });
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.emit(payload);
      } catch (error) {
        this.emit({ type: "error", message: "Invalid server response." });
      }
    });

    this.socket.addEventListener("error", () => {
      this.emit({ type: "socket_error" });
    });

    this.socket.addEventListener("close", (event) => {
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      this.emit({ type: "socket_close", wasConnected, reason: event.reason || "" });
    });
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  disconnect(emitEvent = true) {
    if (!this.socket) {
      if (emitEvent) {
        this.emit({ type: "socket_close", wasConnected: false, reason: "" });
      }
      return;
    }

    const socket = this.socket;
    this.socket = null;

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close(1000, "client_disconnect");
    }

    this.connected = false;

    if (emitEvent) {
      this.emit({ type: "socket_close", wasConnected: true, reason: "" });
    }
  }
}

class ChessApp {
  constructor() {
    this.boardElement = document.getElementById("board");
    this.statusLine = document.getElementById("status-line");
    this.metaLine = document.getElementById("meta-line");
    this.moveList = document.getElementById("move-list");
    this.capturedWhite = document.getElementById("captured-white");
    this.capturedBlack = document.getElementById("captured-black");

    this.gameModeSelect = document.getElementById("game-mode");
    this.timeControlWrap = document.getElementById("time-control-wrap");
    this.timeControlSelect = document.getElementById("time-control");

    this.aiControls = document.getElementById("ai-controls");
    this.aiDifficultySelect = document.getElementById("ai-difficulty");
    this.humanColorSelect = document.getElementById("human-color");

    this.onlineControls = document.getElementById("online-controls");
    this.onlineRoomInput = document.getElementById("online-room");
    this.onlineColorSelect = document.getElementById("online-color");
    this.onlineConnectButton = document.getElementById("online-connect");
    this.onlineDisconnectButton = document.getElementById("online-disconnect");
    this.onlineStatusLine = document.getElementById("online-status");

    this.newGameButton = document.getElementById("new-game");
    this.undoButton = document.getElementById("undo");
    this.flipButton = document.getElementById("flip");

    this.clockStack = document.getElementById("clock-stack");
    this.clockWhite = document.getElementById("clock-white");
    this.clockBlack = document.getElementById("clock-black");
    this.timeWhite = document.getElementById("time-white");
    this.timeBlack = document.getElementById("time-black");

    this.promotionModal = document.getElementById("promotion-modal");
    this.promotionButtons = Array.from(
      this.promotionModal.querySelectorAll("button[data-piece]"),
    );

    this.engine = new ChessEngine();
    this.ai = new ChessAI();
    this.onlineClient = new OnlineClient((event) => this.handleOnlineEvent(event));

    this.mode = this.gameModeSelect.value;
    this.humanColor = "w";
    this.aiColor = "b";

    this.orientation = "w";
    this.selected = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.pendingPromotion = null;

    this.aiThinking = false;
    this.aiTimer = null;

    this.online = {
      joining: false,
      connected: false,
      roomId: "",
      role: "offline",
      color: null,
      pendingMove: false,
      players: { w: false, b: false },
    };

    this.clockConfig = {
      enabled: true,
      baseSeconds: 300,
      increment: 0,
    };
    this.clocks = { w: 300, b: 300 };
    this.clockHistory = [];
    this.lastTick = performance.now();

    this.squareElements = [];

    this.buildBoard();
    this.bindEvents();
    this.configureAiSides();
    this.applyTimeControl();
    this.syncModeUI();
    this.renderAll();
    this.maybeQueueAIMove();

    this.clockInterval = window.setInterval(() => {
      this.handleClockTick();
    }, 100);
  }

  buildBoard() {
    for (let i = 0; i < 64; i += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = "square";
      square.dataset.displayX = String(i % 8);
      square.dataset.displayY = String(Math.floor(i / 8));

      square.addEventListener("click", () => {
        const x = Number(square.dataset.boardX);
        const y = Number(square.dataset.boardY);
        this.onSquareClick(x, y);
      });

      this.boardElement.appendChild(square);
      this.squareElements.push(square);
    }
  }

  bindEvents() {
    this.gameModeSelect.addEventListener("change", () => {
      this.onModeChange();
    });

    this.aiDifficultySelect.addEventListener("change", () => {
      if (this.mode === "ai") {
        this.startNewGame();
      }
    });

    this.humanColorSelect.addEventListener("change", () => {
      if (this.mode === "ai") {
        this.startNewGame();
      }
    });

    this.timeControlSelect.addEventListener("change", () => {
      if (this.mode !== "online") {
        this.startNewGame();
      }
    });

    this.newGameButton.addEventListener("click", () => {
      this.startNewGame();
    });

    this.undoButton.addEventListener("click", () => {
      this.undoMove();
    });

    this.flipButton.addEventListener("click", () => {
      this.orientation = this.orientation === "w" ? "b" : "w";
      this.renderBoard();
    });

    this.onlineConnectButton.addEventListener("click", () => {
      this.connectOnline();
    });

    this.onlineDisconnectButton.addEventListener("click", () => {
      this.disconnectOnline();
    });

    this.onlineRoomInput.addEventListener("input", () => {
      this.onlineRoomInput.value = sanitizeRoomCode(this.onlineRoomInput.value);
    });

    this.promotionModal.addEventListener("click", (event) => {
      if (event.target === this.promotionModal) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const promotionPiece = target.dataset.piece;
      if (!promotionPiece) {
        return;
      }
      this.onPromotionChoice(promotionPiece);
    });
  }

  onModeChange() {
    this.mode = this.gameModeSelect.value;

    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.clearSelection();

    if (this.mode !== "online") {
      if (this.online.connected || this.online.joining) {
        this.onlineClient.disconnect(false);
      }
      this.online = {
        joining: false,
        connected: false,
        roomId: "",
        role: "offline",
        color: null,
        pendingMove: false,
        players: { w: false, b: false },
      };
      this.setOnlineStatus("Not connected.", false);
    }

    this.startNewGame();
    this.syncModeUI();
  }

  configureAiSides() {
    const preference = this.humanColorSelect.value;

    if (preference === "random") {
      this.humanColor = Math.random() < 0.5 ? "w" : "b";
    } else {
      this.humanColor = preference === "b" ? "b" : "w";
    }

    this.aiColor = this.humanColor === "w" ? "b" : "w";
  }

  parseTimeControl(value) {
    if (!value || value === "untimed") {
      return { enabled: false, baseSeconds: 0, increment: 0 };
    }

    const [base, increment] = value.split("+").map((segment) => Number(segment));
    if (Number.isNaN(base) || Number.isNaN(increment)) {
      return { enabled: true, baseSeconds: 300, increment: 0 };
    }

    return {
      enabled: true,
      baseSeconds: base,
      increment,
    };
  }

  applyTimeControl() {
    this.clockHistory = [];

    if (this.mode === "online") {
      this.clockConfig = { enabled: false, baseSeconds: 0, increment: 0 };
      this.clocks = { w: 0, b: 0 };
      this.clockStack.classList.add("hidden");
      this.lastTick = performance.now();
      return;
    }

    this.clockConfig = this.parseTimeControl(this.timeControlSelect.value);

    if (this.clockConfig.enabled) {
      this.clocks = {
        w: this.clockConfig.baseSeconds,
        b: this.clockConfig.baseSeconds,
      };
      this.clockStack.classList.remove("hidden");
    } else {
      this.clocks = { w: 0, b: 0 };
      this.clockStack.classList.add("hidden");
    }

    this.lastTick = performance.now();
  }

  syncModeUI() {
    const aiMode = this.mode === "ai";
    const onlineMode = this.mode === "online";

    this.aiControls.classList.toggle("hidden", !aiMode);
    this.onlineControls.classList.toggle("hidden", !onlineMode);

    this.undoButton.disabled = onlineMode;
    this.timeControlWrap.classList.toggle("disabled", onlineMode);
    this.timeControlSelect.disabled = onlineMode;

    if (onlineMode && this.online.connected) {
      this.newGameButton.textContent = "Request New Game";
    } else {
      this.newGameButton.textContent = "New Game";
    }

    this.onlineConnectButton.disabled = !onlineMode || this.online.joining || this.online.connected;
    this.onlineDisconnectButton.disabled = !onlineMode || (!this.online.joining && !this.online.connected);

    if (onlineMode && !this.online.connected && !this.online.joining) {
      this.setOnlineStatus("Not connected.", false);
    }
  }

  startNewGame() {
    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();

    if (this.mode === "online" && this.online.connected) {
      this.onlineClient.send({ type: "new_game" });
      this.setOnlineStatus(`Requested new game in room ${this.online.roomId}.`, false);
      return;
    }

    this.engine.reset();
    this.selected = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.online.pendingMove = false;

    if (this.mode === "ai") {
      this.configureAiSides();
      this.orientation = this.humanColor;
    } else if (this.mode === "local") {
      this.orientation = "w";
    } else if (this.mode === "online") {
      this.orientation = this.online.color || "w";
    }

    this.applyTimeControl();
    this.renderAll();
    this.syncModeUI();
    this.maybeQueueAIMove();
  }

  undoMove() {
    if (this.mode === "online") {
      return;
    }

    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();

    let undoSteps = 1;
    if (this.mode === "ai" && this.engine.history.length >= 2) {
      const lastMover = this.engine.history[this.engine.history.length - 1].mover;
      if (lastMover === this.aiColor) {
        undoSteps = 2;
      }
    }

    for (let i = 0; i < undoSteps; i += 1) {
      const undoResult = this.engine.undo();
      if (!undoResult.ok) {
        break;
      }

      if (this.clockConfig.enabled) {
        const snapshot = this.clockHistory.pop();
        if (snapshot) {
          this.clocks.w = snapshot.w;
          this.clocks.b = snapshot.b;
        }
      }
    }

    this.lastTick = performance.now();
    this.selected = null;
    this.legalMoves = [];

    const lastHistoryEntry = this.engine.history[this.engine.history.length - 1];
    this.lastMove = lastHistoryEntry ? lastHistoryEntry.move : null;

    this.renderAll();
  }

  cancelAITurn() {
    if (this.aiTimer) {
      window.clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.aiThinking = false;
  }

  maybeQueueAIMove() {
    if (this.mode !== "ai") {
      return;
    }

    if (this.engine.gameOver || this.pendingPromotion || this.aiThinking) {
      return;
    }

    if (this.engine.turn !== this.aiColor) {
      return;
    }

    this.aiThinking = true;
    this.renderStatus();

    const delay = 300 + Math.random() * 420;

    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;

      if (this.mode !== "ai" || this.engine.gameOver || this.engine.turn !== this.aiColor) {
        this.aiThinking = false;
        this.renderStatus();
        return;
      }

      const move = this.ai.chooseMove(
        this.engine,
        this.aiDifficultySelect.value,
        this.aiColor,
      );

      this.aiThinking = false;

      if (!move) {
        this.renderAll();
        return;
      }

      this.executeMove(
        move.fromX,
        move.fromY,
        move.toX,
        move.toY,
        move.promotionType || null,
      );
    }, delay);
  }

  canCurrentUserMove() {
    if (this.engine.gameOver || this.pendingPromotion || this.aiThinking || this.online.pendingMove) {
      return false;
    }

    if (this.mode === "local") {
      return true;
    }

    if (this.mode === "ai") {
      return this.engine.turn === this.humanColor;
    }

    if (this.mode === "online") {
      return (
        this.online.connected &&
        this.online.role === "player" &&
        this.online.color === this.engine.turn
      );
    }

    return false;
  }

  onSquareClick(x, y) {
    if (!this.canCurrentUserMove()) {
      return;
    }

    const clickedPiece = this.engine.getPiece(x, y);

    if (!this.selected) {
      if (clickedPiece && clickedPiece.color === this.engine.turn) {
        this.selectSquare(x, y);
      }
      return;
    }

    if (this.selected.x === x && this.selected.y === y) {
      this.clearSelection();
      this.renderBoard();
      return;
    }

    if (clickedPiece && clickedPiece.color === this.engine.turn) {
      this.selectSquare(x, y);
      this.renderBoard();
      return;
    }

    this.executeMove(this.selected.x, this.selected.y, x, y);
  }

  selectSquare(x, y) {
    const legalMoves = this.engine.getLegalMovesForPiece(x, y, this.engine.turn);
    if (!legalMoves.length) {
      this.clearSelection();
      return;
    }

    this.selected = { x, y };
    this.legalMoves = legalMoves;
    this.renderBoard();
  }

  clearSelection() {
    this.selected = null;
    this.legalMoves = [];
  }

  consumeClockElapsed() {
    if (!this.clockConfig.enabled || this.engine.gameOver) {
      return;
    }

    const now = performance.now();
    const elapsedSeconds = (now - this.lastTick) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }

    const activeColor = this.engine.turn;
    this.clocks[activeColor] -= elapsedSeconds;
    this.lastTick = now;

    if (this.clocks[activeColor] <= 0) {
      this.clocks[activeColor] = 0;
      this.handleTimeout(activeColor);
    }
  }

  handleClockTick() {
    if (!this.clockConfig.enabled || this.engine.gameOver) {
      return;
    }

    this.consumeClockElapsed();
    this.renderClocks();
  }

  handleTimeout(loserColor) {
    if (this.engine.gameOver) {
      return;
    }

    const winner = loserColor === "w" ? "b" : "w";
    this.engine.setResult({
      type: "timeout",
      winner,
      loser: loserColor,
      reason: "Time out",
    });

    this.clearSelection();
    this.renderAll();
  }

  executeMove(fromX, fromY, toX, toY, promotionType = null) {
    if (this.mode === "online") {
      return this.submitOnlineMove(fromX, fromY, toX, toY, promotionType);
    }

    let clockSnapshot = null;
    if (this.clockConfig.enabled) {
      this.consumeClockElapsed();
      if (this.engine.gameOver) {
        this.renderAll();
        return false;
      }
      clockSnapshot = {
        w: this.clocks.w,
        b: this.clocks.b,
      };
    }

    const result = this.engine.attemptMove(fromX, fromY, toX, toY, promotionType);

    if (result.needsPromotion) {
      this.pendingPromotion = { fromX, fromY, toX, toY };
      this.openPromotionModal();
      return false;
    }

    if (!result.ok) {
      this.renderBoard();
      return false;
    }

    if (this.clockConfig.enabled) {
      this.clockHistory.push(clockSnapshot);
      this.clocks[result.move.mover] += this.clockConfig.increment;
      this.lastTick = performance.now();
    }

    this.pendingPromotion = null;
    this.closePromotionModal();
    this.clearSelection();
    this.lastMove = result.move.move;

    this.renderAll();

    if (this.mode === "ai") {
      this.maybeQueueAIMove();
    }

    return true;
  }

  submitOnlineMove(fromX, fromY, toX, toY, promotionType = null) {
    if (!this.online.connected || this.online.role !== "player") {
      return false;
    }

    if (this.online.color !== this.engine.turn) {
      return false;
    }

    const legalMoves = this.engine.getLegalMovesForPiece(fromX, fromY, this.engine.turn);
    const candidates = legalMoves.filter((move) => move.toX === toX && move.toY === toY);

    if (!candidates.length) {
      return false;
    }

    const needsPromotion = candidates.some((move) => Boolean(move.promotionType));
    if (needsPromotion && !promotionType) {
      this.pendingPromotion = { fromX, fromY, toX, toY };
      this.openPromotionModal();
      return false;
    }

    if (promotionType) {
      const hasMatch = candidates.some((move) => move.promotionType === promotionType);
      if (!hasMatch) {
        return false;
      }
    }

    this.onlineClient.send({
      type: "move",
      move: {
        fromX,
        fromY,
        toX,
        toY,
        promotionType,
      },
    });

    this.online.pendingMove = true;
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.clearSelection();
    this.setOnlineStatus("Move sent. Waiting for server...", false);
    this.renderBoard();

    return true;
  }

  openPromotionModal() {
    const color = this.engine.turn;
    for (const button of this.promotionButtons) {
      const type = button.dataset.piece;
      if (!type) {
        continue;
      }
      button.textContent = PIECE_SYMBOLS[color][type];
    }

    this.promotionModal.classList.remove("hidden");
  }

  closePromotionModal() {
    this.promotionModal.classList.add("hidden");
  }

  onPromotionChoice(pieceType) {
    if (!this.pendingPromotion) {
      return;
    }

    const { fromX, fromY, toX, toY } = this.pendingPromotion;
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.executeMove(fromX, fromY, toX, toY, pieceType);
  }

  boardCoordinatesForDisplay(displayX, displayY) {
    if (this.orientation === "w") {
      return { x: displayX, y: displayY };
    }
    return { x: 7 - displayX, y: 7 - displayY };
  }

  renderBoard() {
    const checkedColor = !this.engine.gameOver && this.engine.isKingInCheck(this.engine.turn)
      ? this.engine.turn
      : null;
    const checkedKing = checkedColor ? this.engine.findKing(checkedColor) : null;

    this.boardElement.classList.toggle("locked", !this.canCurrentUserMove());

    for (const square of this.squareElements) {
      const displayX = Number(square.dataset.displayX);
      const displayY = Number(square.dataset.displayY);
      const { x, y } = this.boardCoordinatesForDisplay(displayX, displayY);

      square.dataset.boardX = String(x);
      square.dataset.boardY = String(y);

      square.className = "square";
      square.classList.add((x + y) % 2 === 0 ? "light" : "dark");

      const piece = this.engine.getPiece(x, y);

      const legalMove = this.legalMoves.find((move) => move.toX === x && move.toY === y);
      if (legalMove) {
        if (legalMove.isCapture) {
          square.classList.add("is-capture");
        } else {
          square.classList.add("is-legal");
        }
      }

      if (this.selected && this.selected.x === x && this.selected.y === y) {
        square.classList.add("is-selected");
      }

      if (
        this.lastMove &&
        ((this.lastMove.fromX === x && this.lastMove.fromY === y) ||
          (this.lastMove.toX === x && this.lastMove.toY === y))
      ) {
        square.classList.add("is-last-move");
      }

      if (checkedKing && checkedKing.x === x && checkedKing.y === y) {
        square.classList.add("is-in-check");
      }

      square.replaceChildren();

      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        pieceElement.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        square.appendChild(pieceElement);
      }

      if (displayX === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "coord rank";
        rankLabel.textContent = String(8 - y);
        square.appendChild(rankLabel);
      }

      if (displayY === 7) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "coord file";
        fileLabel.textContent = FILES[x];
        square.appendChild(fileLabel);
      }
    }
  }

  formatGameResult() {
    if (!this.engine.gameOver || !this.engine.result) {
      return null;
    }

    const { type } = this.engine.result;

    if (type === "checkmate") {
      const winnerName = this.engine.result.winner === "w" ? "White" : "Black";
      return `${winnerName} wins by checkmate.`;
    }

    if (type === "timeout") {
      const winnerName = this.engine.result.winner === "w" ? "White" : "Black";
      return `${winnerName} wins on time.`;
    }

    if (type === "resign") {
      const winnerName = this.engine.result.winner === "w" ? "White" : "Black";
      return `${winnerName} wins by resignation.`;
    }

    if (type === "draw") {
      return `Draw by ${this.engine.result.reason}.`;
    }

    return null;
  }

  formatStatus() {
    const resultText = this.formatGameResult();
    if (resultText) {
      return resultText;
    }

    if (this.mode === "ai" && this.aiThinking) {
      return "Computer is thinking...";
    }

    const side = this.engine.turn === "w" ? "White" : "Black";

    if (this.mode === "online") {
      if (!this.online.connected) {
        return "Online mode: connect to a room.";
      }

      if (this.online.role === "spectator") {
        return `Spectating room ${this.online.roomId}. ${side} to move.`;
      }

      if (this.online.color === this.engine.turn) {
        if (this.engine.isKingInCheck(this.engine.turn)) {
          return `Your move (${side}). Check.`;
        }
        return `Your move (${side}).`;
      }

      if (this.engine.isKingInCheck(this.engine.turn)) {
        return `${side} to move. Opponent in check.`;
      }
      return `Waiting for opponent. ${side} to move.`;
    }

    if (this.engine.isKingInCheck(this.engine.turn)) {
      return `${side} to move. Check.`;
    }
    return `${side} to move.`;
  }

  renderStatus() {
    this.statusLine.textContent = this.formatStatus();

    const rights = [
      this.engine.castlingRights.w.k ? "K" : "",
      this.engine.castlingRights.w.q ? "Q" : "",
      this.engine.castlingRights.b.k ? "k" : "",
      this.engine.castlingRights.b.q ? "q" : "",
    ]
      .join("")
      .trim() || "-";

    let modeLabel = "Local";
    if (this.mode === "ai") {
      modeLabel = `AI (${this.aiDifficultySelect.value})`;
    }
    if (this.mode === "online") {
      modeLabel = this.online.connected
        ? `Online ${this.online.roomId} (${this.online.role === "player"
          ? this.online.color === "w"
            ? "White"
            : "Black"
          : "Spectator"})`
        : "Online (offline)";
    }

    this.metaLine.textContent = `Move ${this.engine.fullmoveNumber} · Halfmove ${this.engine.halfmoveClock} · Castling ${rights} · ${modeLabel}`;
  }

  renderHistory() {
    this.moveList.replaceChildren();

    const history = this.engine.history;
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement("li");
      const index = document.createElement("span");
      const white = document.createElement("span");
      const black = document.createElement("span");

      index.className = "move-index";
      white.className = "move-ply";
      black.className = "move-ply";

      index.textContent = `${Math.floor(i / 2) + 1}.`;
      white.textContent = history[i] ? history[i].notation : "";
      black.textContent = history[i + 1] ? history[i + 1].notation : "";

      li.appendChild(index);
      li.appendChild(white);
      li.appendChild(black);
      this.moveList.appendChild(li);
    }

    this.moveList.scrollTop = this.moveList.scrollHeight;
  }

  materialDelta() {
    const whiteGain = this.engine.capturedBy.w.reduce(
      (acc, piece) => acc + PIECE_VALUES[piece.type],
      0,
    );
    const blackGain = this.engine.capturedBy.b.reduce(
      (acc, piece) => acc + PIECE_VALUES[piece.type],
      0,
    );
    return whiteGain - blackGain;
  }

  renderCaptures() {
    const renderCaptureRow = (target, pieces) => {
      target.replaceChildren();
      const sorted = [...pieces].sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);

      for (const piece of sorted) {
        const span = document.createElement("span");
        span.className = `capture-piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        target.appendChild(span);
      }
    };

    renderCaptureRow(this.capturedWhite, this.engine.capturedBy.w);
    renderCaptureRow(this.capturedBlack, this.engine.capturedBy.b);

    const delta = this.materialDelta();
    if (delta > 0) {
      this.capturedWhite.dataset.advantage = `+${delta}`;
      this.capturedBlack.dataset.advantage = "";
    } else if (delta < 0) {
      this.capturedBlack.dataset.advantage = `+${Math.abs(delta)}`;
      this.capturedWhite.dataset.advantage = "";
    } else {
      this.capturedWhite.dataset.advantage = "";
      this.capturedBlack.dataset.advantage = "";
    }
  }

  formatClock(seconds) {
    const safe = Math.max(0, seconds);
    const minutes = Math.floor(safe / 60);
    const wholeSeconds = Math.floor(safe % 60);

    if (safe < 10) {
      const tenths = Math.floor((safe - Math.floor(safe)) * 10);
      return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  }

  renderClocks() {
    if (!this.clockConfig.enabled) {
      this.clockStack.classList.add("hidden");
      return;
    }

    this.clockStack.classList.remove("hidden");

    this.timeWhite.textContent = this.formatClock(this.clocks.w);
    this.timeBlack.textContent = this.formatClock(this.clocks.b);

    this.clockWhite.classList.remove("active");
    this.clockBlack.classList.remove("active");

    if (!this.engine.gameOver) {
      if (this.engine.turn === "w") {
        this.clockWhite.classList.add("active");
      } else {
        this.clockBlack.classList.add("active");
      }
    }
  }

  renderAll() {
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderCaptures();
    this.renderClocks();
    this.syncModeUI();
  }

  setOnlineStatus(message, isError) {
    this.onlineStatusLine.textContent = message;
    this.onlineStatusLine.classList.toggle("error", Boolean(isError));
  }

  describeOnlinePresence(players) {
    const white = players && players.w ? "White: connected" : "White: open";
    const black = players && players.b ? "Black: connected" : "Black: open";
    return `${white} · ${black}`;
  }

  connectOnline() {
    if (this.mode !== "online" || this.online.connected || this.online.joining) {
      return;
    }

    let roomId = sanitizeRoomCode(this.onlineRoomInput.value);
    if (!roomId) {
      roomId = randomRoomCode();
      this.onlineRoomInput.value = roomId;
    }

    const preferredColor = this.onlineColorSelect.value;

    this.online.joining = true;
    this.setOnlineStatus(`Connecting to ${roomId}...`, false);
    this.syncModeUI();

    this.onlineClient.connect(roomId, preferredColor);
  }

  disconnectOnline() {
    if (!this.online.connected && !this.online.joining) {
      return;
    }

    this.onlineClient.disconnect();
  }

  getLastMoveFromHistory() {
    const entry = this.engine.history[this.engine.history.length - 1];
    return entry ? entry.move : null;
  }

  handleOnlineEvent(event) {
    if (event.type === "socket_open") {
      this.setOnlineStatus("Connected. Joining room...", false);
      return;
    }

    if (event.type === "socket_error") {
      this.setOnlineStatus("Socket error. Check server availability.", true);
      return;
    }

    if (event.type === "socket_close") {
      const wasOnline = this.online.connected || this.online.joining;

      this.online.joining = false;
      this.online.connected = false;
      this.online.pendingMove = false;
      this.online.roomId = "";
      this.online.role = "offline";
      this.online.color = null;
      this.online.players = { w: false, b: false };

      if (this.mode === "online") {
        this.setOnlineStatus(wasOnline ? "Disconnected." : "Not connected.", false);
        this.engine.reset();
        this.lastMove = null;
        this.clearSelection();
        this.applyTimeControl();
        this.renderAll();
      } else {
        this.syncModeUI();
      }

      return;
    }

    if (event.type === "joined") {
      this.online.joining = false;
      this.online.connected = true;
      this.online.roomId = event.roomId;
      this.online.role = event.role;
      this.online.color = event.color || null;
      this.online.pendingMove = false;
      this.online.players = event.players || { w: false, b: false };

      this.engine.loadSerializableState(event.state);
      this.lastMove = this.getLastMoveFromHistory();
      this.clearSelection();
      this.pendingPromotion = null;
      this.closePromotionModal();

      if (this.online.role === "player" && this.online.color) {
        this.orientation = this.online.color;
      }

      this.applyTimeControl();
      this.renderAll();

      const presence = this.describeOnlinePresence(this.online.players);
      if (this.online.role === "player") {
        const colorName = this.online.color === "w" ? "White" : "Black";
        this.setOnlineStatus(
          `Joined ${event.roomId} as ${colorName}. ${presence}`,
          false,
        );
      } else {
        this.setOnlineStatus(`Joined ${event.roomId} as spectator. ${presence}`, false);
      }

      return;
    }

    if (event.type === "state") {
      if (!this.online.connected) {
        return;
      }

      this.engine.loadSerializableState(event.state);
      this.lastMove = event.lastMove || this.getLastMoveFromHistory();
      this.online.pendingMove = false;
      this.clearSelection();
      this.pendingPromotion = null;
      this.closePromotionModal();

      if (event.players) {
        this.online.players = event.players;
      }

      this.renderAll();

      if (event.info) {
        this.setOnlineStatus(event.info, false);
      }

      return;
    }

    if (event.type === "presence") {
      this.online.players = event.players || this.online.players;
      if (this.online.connected) {
        this.setOnlineStatus(this.describeOnlinePresence(this.online.players), false);
      }
      this.syncModeUI();
      return;
    }

    if (event.type === "error") {
      this.online.pendingMove = false;
      this.setOnlineStatus(event.message || "Server error.", true);
      this.syncModeUI();
      return;
    }

    if (event.type === "info") {
      this.setOnlineStatus(event.message || "", false);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new ChessApp();
});
