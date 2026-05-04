const { FILES, PIECE_SYMBOLS, PIECE_VALUES, ChessEngine } = window.ChessCore;

/* ── Constants ── */

const AI_LEVELS = {
  easy:   { depth: 1, noise: 0.9 },
  medium: { depth: 2, noise: 0.45 },
  hard:   { depth: 3, noise: 0.15 },
};

// Opening book: arrays of LAN notation strings (e.g. "e2-e4")
// The AI will follow these lines before switching to minimax.
const OPENING_LINES = [
  ["e2-e4","e7-e5","g1-f3","b8-c6","f1-b5"],          // Ruy Lopez
  ["e2-e4","e7-e5","g1-f3","b8-c6","f1-c4"],           // Italian
  ["e2-e4","e7-e5","g1-f3","b8-c6","d2-d4"],           // Scotch
  ["e2-e4","e7-e5","f2-f4"],                            // King's Gambit
  ["e2-e4","c7-c5","g1-f3","d7-d6","d2-d4"],           // Sicilian Open
  ["e2-e4","c7-c5","b1-c3"],                            // Sicilian Closed
  ["e2-e4","e7-e6","d2-d4","d7-d5"],                   // French
  ["e2-e4","c7-c6","d2-d4","d7-d5"],                   // Caro-Kann
  ["e2-e4","d7-d5","e4-d5"],                            // Scandinavian
  ["d2-d4","d7-d5","c2-c4"],                            // Queen's Gambit
  ["d2-d4","d7-d5","c2-c4","e7-e6","b1-c3","g8-f6"],  // QGD
  ["d2-d4","d7-d5","c2-c4","d5-c4","g1-f3"],           // QGA
  ["d2-d4","g8-f6","c2-c4","g7-g6","b1-c3","f8-g7"],  // King's Indian
  ["d2-d4","g8-f6","c2-c4","e7-e6","b1-c3","f8-b4"],  // Nimzo-Indian
  ["d2-d4","g8-f6","g1-f3","d7-d5","c1-f4"],           // London System
  ["c2-c4","e7-e5","b1-c3"],                            // English
  ["g1-f3","d7-d5","c2-c4"],                            // Réti
  ["e2-e4","e7-e5","g1-f3","g8-f6"],                   // Petrov
];

// Opening name lookup keyed by space-joined LAN sequence
const OPENING_NAMES = {
  "e2-e4":                                              "King's Pawn",
  "e2-e4 e7-e5":                                        "Open Game",
  "e2-e4 e7-e5 g1-f3":                                 "King's Knight",
  "e2-e4 e7-e5 g1-f3 b8-c6 f1-b5":                    "Ruy Lopez",
  "e2-e4 e7-e5 g1-f3 b8-c6 f1-c4":                    "Italian Game",
  "e2-e4 e7-e5 g1-f3 b8-c6 d2-d4":                    "Scotch Game",
  "e2-e4 e7-e5 f2-f4":                                 "King's Gambit",
  "e2-e4 e7-e5 g1-f3 g8-f6":                           "Petrov Defense",
  "e2-e4 c7-c5":                                        "Sicilian Defense",
  "e2-e4 c7-c5 g1-f3":                                 "Sicilian – Open",
  "e2-e4 c7-c5 b1-c3":                                 "Sicilian – Closed",
  "e2-e4 e7-e6":                                        "French Defense",
  "e2-e4 e7-e6 d2-d4 d7-d5":                           "French Defense",
  "e2-e4 c7-c6":                                        "Caro-Kann Defense",
  "e2-e4 c7-c6 d2-d4 d7-d5":                           "Caro-Kann Defense",
  "e2-e4 d7-d5":                                        "Scandinavian Defense",
  "e2-e4 g8-f6":                                        "Alekhine's Defense",
  "d2-d4":                                              "Queen's Pawn",
  "d2-d4 d7-d5 c2-c4":                                 "Queen's Gambit",
  "d2-d4 d7-d5 c2-c4 e7-e6":                           "Queen's Gambit Declined",
  "d2-d4 d7-d5 c2-c4 d5-c4":                           "Queen's Gambit Accepted",
  "d2-d4 g8-f6":                                        "Indian Defense",
  "d2-d4 g8-f6 c2-c4 g7-g6":                           "King's Indian",
  "d2-d4 g8-f6 c2-c4 g7-g6 b1-c3 f8-g7":              "King's Indian Defense",
  "d2-d4 g8-f6 c2-c4 e7-e6 b1-c3 f8-b4":              "Nimzo-Indian Defense",
  "d2-d4 g8-f6 g1-f3 d7-d5 c1-f4":                    "London System",
  "c2-c4":                                              "English Opening",
  "c2-c4 e7-e5 b1-c3":                                 "English Opening",
  "g1-f3":                                              "Réti Opening",
  "g1-f3 d7-d5 c2-c4":                                 "Réti Opening",
};

/* ── Helpers ── */

function randomInt(max) { return Math.floor(Math.random() * max); }

function randomRoomCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += alpha[randomInt(alpha.length)];
  return code;
}

function sanitizeRoomCode(value) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function stripAnnotations(notation) {
  return notation.replace(/[+#]/g, "").replace(/=[QRBN]/gi, "");
}

/* ══════════════════════════════════════════
   SoundSystem  –  Web Audio procedural tones
   ══════════════════════════════════════════ */
class SoundSystem {
  constructor() {
    this._ctx = null;
    this.enabled = true;
  }

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) { return null; }
    }
    if (this._ctx.state === "suspended") this._ctx.resume();
    return this._ctx;
  }

  _tone(ctx, freq, gainPeak, startOffset, duration, type = "sine") {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  play(type) {
    if (!this.enabled) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    switch (type) {
      case "move":     this._tone(ctx, 680, 0.08, 0,    0.12); break;
      case "capture":  this._tone(ctx, 520, 0.12, 0,    0.09, "square");
                       this._tone(ctx, 340, 0.14, 0.07, 0.14); break;
      case "castle":   this._tone(ctx, 480, 0.07, 0,    0.11);
                       this._tone(ctx, 640, 0.07, 0.1,  0.12); break;
      case "check":    this._tone(ctx, 960, 0.13, 0,    0.07);
                       this._tone(ctx,1160, 0.10, 0.07, 0.12); break;
      case "game-end": [523,659,784,1047,1319].forEach((f, i) => {
                         this._tone(ctx, f, 0.07, i * 0.14, 0.35);
                       }); break;
      case "select":   this._tone(ctx, 780, 0.04, 0,    0.07); break;
      case "invalid":  this._tone(ctx, 220, 0.08, 0,    0.09, "square"); break;
    }
  }
}

/* ══════════════════════════════════════════
   ChessAI  –  minimax + opening book + TT
   ══════════════════════════════════════════ */
class ChessAI {
  getDifficultyConfig(level) {
    return AI_LEVELS[level] || AI_LEVELS.medium;
  }

  // ── Opening book ────────────────────────
  _getBookMove(engine, aiColor) {
    const history = engine.history.map((e) => stripAnnotations(e.notation));
    for (const line of OPENING_LINES) {
      if (history.length >= line.length) continue;
      const prefix = line.slice(0, history.length);
      if (!prefix.every((m, i) => m === history[i])) continue;
      const next = line[history.length];
      const move = this._lanToMove(engine, next);
      if (move) return move;
    }
    return null;
  }

  _lanToMove(engine, lan) {
    const m = lan.match(/^([a-h][1-8])[-x]([a-h][1-8])(?:=([qrbn]))?$/i);
    if (!m) return null;
    const fx = FILES.indexOf(m[1][0]);
    const fy = 8 - Number(m[1][1]);
    const tx = FILES.indexOf(m[2][0]);
    const ty = 8 - Number(m[2][1]);
    const legal = engine.getLegalMovesForPiece(fx, fy, engine.turn);
    return legal.find((mv) => mv.toX === tx && mv.toY === ty) || null;
  }

  // ── Move ordering ────────────────────────
  _scoreMoveOrder(engine, move) {
    const mover  = engine.getPiece(move.fromX, move.fromY);
    const target = move.isEnPassant ? { type: "p" } : engine.getPiece(move.toX, move.toY);
    let score = 0;
    if (move.isCapture)    score += (target ? PIECE_VALUES[target.type] : 1) * 10 - (mover ? PIECE_VALUES[mover.type] : 1);
    if (move.promotionType) score += PIECE_VALUES[move.promotionType] + 8;
    if (move.isCastle)      score += 1.4;
    return score;
  }

  _orderMoves(engine, moves) {
    return [...moves].sort((a, b) => this._scoreMoveOrder(engine, b) - this._scoreMoveOrder(engine, a));
  }

  // ── Evaluation ───────────────────────────
  _pstBonus(piece, x, y, endgame) {
    const rank = piece.color === "w" ? 7 - y : y;
    const cd   = Math.abs(3.5 - x) + Math.abs(3.5 - y);
    if (piece.type === "p") return rank * 0.08 - cd * 0.02;
    if (piece.type === "n") return 0.45 - cd * 0.10;
    if (piece.type === "b") return 0.30 - cd * 0.06;
    if (piece.type === "r") return rank * 0.03;
    if (piece.type === "q") return 0.18 - cd * 0.03;
    if (piece.type === "k") return endgame ? 0.45 - cd * 0.09 : cd * -0.04;
    return 0;
  }

  _evaluate(engine, aiColor) {
    if (engine.gameOver && engine.result) {
      if (engine.result.type === "checkmate" || engine.result.type === "timeout") {
        return engine.result.winner === aiColor ? 100000 : -100000;
      }
      return 0;
    }

    let totalMat = 0;
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const p = engine.getPiece(x, y);
      if (p && p.type !== "k") totalMat += PIECE_VALUES[p.type];
    }
    const endgame = totalMat <= 14;

    let score = 0;
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const p = engine.getPiece(x, y);
      if (!p) continue;
      const mul = p.color === aiColor ? 1 : -1;
      score += mul * (PIECE_VALUES[p.type] + this._pstBonus(p, x, y, endgame));
    }

    const opp = aiColor === "w" ? "b" : "w";
    score += (engine.getAllLegalMoves(aiColor).length - engine.getAllLegalMoves(opp).length) * 0.04;
    if (engine.isKingInCheck(aiColor)) score -= 0.25;
    if (engine.isKingInCheck(opp))     score += 0.25;
    return score;
  }

  // ── Minimax with alpha-beta + TT ─────────
  _search(engine, depth, alpha, beta, aiColor, tt) {
    if (depth <= 0 || engine.gameOver) {
      const key = engine.getPositionKey();
      let val = tt.get(key);
      if (val === undefined) {
        val = this._evaluate(engine, aiColor);
        tt.set(key, val);
      }
      return val;
    }

    const current = engine.turn;
    const moves = this._orderMoves(engine, engine.getAllLegalMoves(current));
    if (!moves.length) return this._evaluate(engine, aiColor);

    if (current === aiColor) {
      let value = -Infinity;
      for (const move of moves) {
        if (!engine.applyMove(move).ok) continue;
        const next = this._search(engine, depth - 1, alpha, beta, aiColor, tt);
        engine.undo();
        if (next > value) value = next;
        if (value > alpha) alpha = value;
        if (beta <= alpha) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      if (!engine.applyMove(move).ok) continue;
      const next = this._search(engine, depth - 1, alpha, beta, aiColor, tt);
      engine.undo();
      if (next < value) value = next;
      if (value < beta) beta = value;
      if (beta <= alpha) break;
    }
    return value;
  }

  chooseMove(engine, level, aiColor) {
    // Try opening book first
    const bookMove = this._getBookMove(engine, aiColor);
    if (bookMove) return { ...bookMove };

    const config = this.getDifficultyConfig(level);
    const moves  = this._orderMoves(engine, engine.getAllLegalMoves(aiColor));
    if (!moves.length) return null;

    const tt = new Map();
    let bestScore = -Infinity;
    const scored = [];

    for (const move of moves) {
      if (!engine.applyMove(move).ok) continue;
      const score = this._search(engine, Math.max(0, config.depth - 1), -Infinity, Infinity, aiColor, tt);
      engine.undo();
      scored.push({ move, score });
      if (score > bestScore) bestScore = score;
    }

    const pool = scored.filter((e) => e.score >= bestScore - config.noise);
    const chosen = (pool.length ? pool : scored)[randomInt((pool.length ? pool : scored).length)];
    return chosen ? { ...chosen.move } : null;
  }
}

/* ══════════════════════════════════════════
   OnlineClient
   ══════════════════════════════════════════ */
class OnlineClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.socket = null;
    this.connected = false;
  }

  emit(event) { if (this.onEvent) this.onEvent(event); }

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
      try { this.emit(JSON.parse(event.data)); }
      catch (_) { this.emit({ type: "error", message: "Invalid server response." }); }
    });
    this.socket.addEventListener("error", () => { this.emit({ type: "socket_error" }); });
    this.socket.addEventListener("close", (event) => {
      const was = this.connected;
      this.connected = false;
      this.socket = null;
      this.emit({ type: "socket_close", wasConnected: was, reason: event.reason || "" });
    });
  }

  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(payload));
  }

  disconnect(emitEvent = true) {
    if (!this.socket) {
      if (emitEvent) this.emit({ type: "socket_close", wasConnected: false, reason: "" });
      return;
    }
    const s = this.socket;
    this.socket = null;
    if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING)
      s.close(1000, "client_disconnect");
    this.connected = false;
    if (emitEvent) this.emit({ type: "socket_close", wasConnected: true, reason: "" });
  }
}

/* ══════════════════════════════════════════
   ChessApp
   ══════════════════════════════════════════ */
class ChessApp {
  constructor() {
    /* DOM refs */
    this.boardElement      = document.getElementById("board");
    this.statusLine        = document.getElementById("status-line");
    this.metaLine          = document.getElementById("meta-line");
    this.openingNameEl     = document.getElementById("opening-name");
    this.moveList          = document.getElementById("move-list");
    this.capturedWhite     = document.getElementById("captured-white");
    this.capturedBlack     = document.getElementById("captured-black");

    this.gameModeSelect    = document.getElementById("game-mode");
    this.timeControlWrap   = document.getElementById("time-control-wrap");
    this.timeControlSelect = document.getElementById("time-control");
    this.aiControls        = document.getElementById("ai-controls");
    this.aiDifficultySelect= document.getElementById("ai-difficulty");
    this.humanColorSelect  = document.getElementById("human-color");
    this.onlineControls    = document.getElementById("online-controls");
    this.onlineRoomInput   = document.getElementById("online-room");
    this.onlineColorSelect = document.getElementById("online-color");
    this.onlineConnectBtn  = document.getElementById("online-connect");
    this.onlineDisconnectBtn=document.getElementById("online-disconnect");
    this.onlineStatusLine  = document.getElementById("online-status");
    this.drawOfferUI       = document.getElementById("draw-offer-ui");
    this.drawAcceptBtn     = document.getElementById("draw-accept");
    this.drawDeclineBtn    = document.getElementById("draw-decline");
    this.copyRoomLinkBtn   = document.getElementById("copy-room-link");

    this.newGameBtn        = document.getElementById("new-game");
    this.undoBtn           = document.getElementById("undo");
    this.flipBtn           = document.getElementById("flip");
    this.resignBtn         = document.getElementById("resign");
    this.offerDrawBtn      = document.getElementById("offer-draw");
    this.themeToggleBtn    = document.getElementById("theme-toggle");
    this.copyFenBtn        = document.getElementById("copy-fen");
    this.copyPgnBtn        = document.getElementById("copy-pgn");

    this.clockStack        = document.getElementById("clock-stack");
    this.clockWhite        = document.getElementById("clock-white");
    this.clockBlack        = document.getElementById("clock-black");
    this.timeWhite         = document.getElementById("time-white");
    this.timeBlack         = document.getElementById("time-black");

    this.promotionModal    = document.getElementById("promotion-modal");
    this.promotionBtns     = Array.from(this.promotionModal.querySelectorAll("button[data-piece]"));
    this.gameOverModal     = document.getElementById("game-over-modal");
    this.gameOverIcon      = document.getElementById("game-over-icon");
    this.gameOverTitle     = document.getElementById("game-over-title");
    this.gameOverSub       = document.getElementById("game-over-sub");
    this.gameOverNewBtn    = document.getElementById("game-over-new");
    this.gameOverCloseBtn  = document.getElementById("game-over-close");

    this.browseBar         = document.getElementById("browse-bar");
    this.browseFirst       = document.getElementById("browse-first");
    this.browsePrev        = document.getElementById("browse-prev");
    this.browseCounter     = document.getElementById("browse-counter");
    this.browseNext        = document.getElementById("browse-next");
    this.browseLast        = document.getElementById("browse-last");
    this.browseExitBtn     = document.getElementById("browse-exit");

    /* State */
    this.engine     = new ChessEngine();
    this.ai         = new ChessAI();
    this.sounds     = new SoundSystem();
    this.onlineClient = new OnlineClient((e) => this.handleOnlineEvent(e));

    this.mode        = this.gameModeSelect.value;
    this.humanColor  = "w";
    this.aiColor     = "b";
    this.orientation = "w";

    this.selected      = null;
    this.legalMoves    = [];
    this.lastMove      = null;
    this.pendingPromotion = null;
    this.aiThinking    = false;
    this.aiTimer       = null;
    this.dragSource    = null;

    // Browse mode
    this.browseIndex   = null;  // null = live; integer = browsing position after N moves

    // Game-over modal tracking (avoid re-showing for same game end)
    this._lastShownResult = null;

    this.online = {
      joining: false, connected: false, roomId: "",
      role: "offline", color: null, pendingMove: false,
      players: { w: false, b: false },
    };

    this.clockConfig  = { enabled: true, baseSeconds: 300, increment: 0 };
    this.clocks       = { w: 300, b: 300 };
    this.clockHistory = [];
    this.lastTick     = performance.now();

    this.squareElements = [];

    // Dark theme
    this._loadTheme();

    // Auto-fill room code from URL ?room=
    const urlRoom = new URLSearchParams(window.location.search).get("room");
    if (urlRoom) {
      this.onlineRoomInput.value = sanitizeRoomCode(urlRoom);
      this.gameModeSelect.value = "online";
      this.mode = "online";
    }

    this.buildBoard();
    this.bindEvents();
    this.configureAiSides();
    this.applyTimeControl();
    this.syncModeUI();
    this.renderAll();
    this.maybeQueueAIMove();

    this.clockInterval = window.setInterval(() => this.handleClockTick(), 100);
  }

  /* ── Board construction ──────────────────────── */

  buildBoard() {
    for (let i = 0; i < 64; i += 1) {
      const sq = document.createElement("button");
      sq.type = "button";
      sq.className = "square";
      sq.dataset.displayX = String(i % 8);
      sq.dataset.displayY = String(Math.floor(i / 8));

      sq.addEventListener("click", () => {
        if (this.browseIndex !== null) return;
        this.onSquareClick(Number(sq.dataset.boardX), Number(sq.dataset.boardY));
      });

      // Drag & drop
      sq.addEventListener("dragstart", (e) => this._onDragStart(e, sq));
      sq.addEventListener("dragover",  (e) => this._onDragOver(e, sq));
      sq.addEventListener("dragleave", ()  => sq.classList.remove("is-drag-over"));
      sq.addEventListener("drop",      (e) => this._onDrop(e, sq));
      sq.addEventListener("dragend",   ()  => this._onDragEnd(sq));

      this.boardElement.appendChild(sq);
      this.squareElements.push(sq);
    }
  }

  /* ── Event binding ───────────────────────────── */

  bindEvents() {
    this.gameModeSelect.addEventListener("change", () => this.onModeChange());
    this.aiDifficultySelect.addEventListener("change", () => { if (this.mode === "ai") this.startNewGame(); });
    this.humanColorSelect.addEventListener("change",   () => { if (this.mode === "ai") this.startNewGame(); });
    this.timeControlSelect.addEventListener("change",  () => { if (this.mode !== "online") this.startNewGame(); });

    this.newGameBtn.addEventListener("click", () => this.startNewGame());
    this.undoBtn.addEventListener("click",    () => this.undoMove());
    this.flipBtn.addEventListener("click",    () => {
      this.orientation = this.orientation === "w" ? "b" : "w";
      if (this.browseIndex !== null) this._renderBrowseBoard();
      else this.renderBoard();
    });
    this.resignBtn.addEventListener("click",   () => this.resignGame());
    this.offerDrawBtn.addEventListener("click",() => this.offerDraw());

    this.onlineConnectBtn.addEventListener("click",     () => this.connectOnline());
    this.onlineDisconnectBtn.addEventListener("click",  () => this.disconnectOnline());
    this.onlineRoomInput.addEventListener("input",      () => {
      this.onlineRoomInput.value = sanitizeRoomCode(this.onlineRoomInput.value);
    });
    this.copyRoomLinkBtn.addEventListener("click",      () => this.copyRoomLink());
    this.drawAcceptBtn.addEventListener("click",  () => { this.onlineClient.send({ type: "draw_accept" });  this.drawOfferUI.classList.add("hidden"); });
    this.drawDeclineBtn.addEventListener("click", () => { this.onlineClient.send({ type: "draw_decline" }); this.drawOfferUI.classList.add("hidden"); });

    this.promotionModal.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-piece]");
      if (btn) this.onPromotionChoice(btn.dataset.piece);
    });

    this.gameOverModal.addEventListener("click", (e) => {
      if (e.target === this.gameOverModal) this.closeGameOverModal();
    });
    this.gameOverNewBtn.addEventListener("click",   () => { this.closeGameOverModal(); this.startNewGame(); });
    this.gameOverCloseBtn.addEventListener("click", () => this.closeGameOverModal());

    this.themeToggleBtn.addEventListener("click", () => this.toggleTheme());
    this.copyFenBtn.addEventListener("click", () => this.copyFEN());
    this.copyPgnBtn.addEventListener("click", () => this.copyPGN());

    // Browse bar
    this.browseFirst.addEventListener("click",  () => this.goBrowse(0));
    this.browsePrev.addEventListener("click",   () => this.goBrowse((this.browseIndex ?? 0) - 1));
    this.browseNext.addEventListener("click",   () => this.goBrowse((this.browseIndex ?? 0) + 1));
    this.browseLast.addEventListener("click",   () => this.goBrowse(this.engine.history.length));
    this.browseExitBtn.addEventListener("click",() => this.exitBrowse());

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  /* ── Keyboard shortcuts ──────────────────────── */

  handleKeyDown(e) {
    // Ignore if focus is in an input/select
    if (["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)) return;

    const key = e.key;
    if (key === "Escape") {
      if (this.browseIndex !== null) { this.exitBrowse(); return; }
      this.closeGameOverModal();
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      if (this.browseIndex !== null) this.goBrowse(this.browseIndex - 1);
      else if (this.engine.history.length) this.goBrowse(this.engine.history.length - 1);
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      if (this.browseIndex !== null) this.goBrowse(this.browseIndex + 1);
      return;
    }
    if (key === "ArrowUp")   { e.preventDefault(); this.goBrowse(0); return; }
    if (key === "ArrowDown") { e.preventDefault(); this.goBrowse(this.engine.history.length); return; }
    if (key === "n" || key === "N") { this.startNewGame(); return; }
    if (key === "u" || key === "U") { this.undoMove(); return; }
    if (key === "f" || key === "F") {
      this.orientation = this.orientation === "w" ? "b" : "w";
      if (this.browseIndex !== null) this._renderBrowseBoard();
      else this.renderBoard();
      return;
    }
  }

  /* ── Dark theme ──────────────────────────────── */

  _loadTheme() {
    const saved = localStorage.getItem("regal-chess-theme");
    const dark  = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    this.themeToggleBtn.textContent = dark ? "☀" : "☽";
  }

  toggleTheme() {
    const isDark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "light" : "dark";
    this.themeToggleBtn.textContent = isDark ? "☽" : "☀";
    localStorage.setItem("regal-chess-theme", isDark ? "light" : "dark");
  }

  /* ── FEN / PGN export ────────────────────────── */

  async _copyText(text, btnEl) {
    try {
      await navigator.clipboard.writeText(text);
      const orig = btnEl.textContent;
      btnEl.textContent = "Copied!";
      setTimeout(() => { btnEl.textContent = orig; }, 1500);
    } catch (_) {
      prompt("Copy this:", text);
    }
  }

  copyFEN() { this._copyText(this.engine.getFEN(), this.copyFenBtn); }
  copyPGN() { this._copyText(this.engine.getPGN(), this.copyPgnBtn); }

  /* ── Room link ───────────────────────────────── */

  copyRoomLink() {
    const room = sanitizeRoomCode(this.onlineRoomInput.value) || randomRoomCode();
    this.onlineRoomInput.value = room;
    const url = `${window.location.origin}${window.location.pathname}?room=${room}`;
    this._copyText(url, this.copyRoomLinkBtn);
  }

  /* ── Resign / draw ───────────────────────────── */

  resignGame() {
    if (this.engine.gameOver) return;

    if (this.mode === "online") {
      this.onlineClient.send({ type: "resign" });
      return;
    }

    const loser  = this.engine.turn;
    const winner = loser === "w" ? "b" : "w";
    this.engine.setResult({ type: "resign", winner, loser, reason: "Resignation" });
    this.sounds.play("game-end");
    this.renderAll();
    this.maybeShowGameOverModal();
  }

  offerDraw() {
    if (this.engine.gameOver) return;

    if (this.mode === "online") {
      this.onlineClient.send({ type: "draw_offer" });
      return;
    }

    // Local / AI mode — simple confirm dialog
    if (this.mode === "ai") {
      const score = this.ai._evaluate(this.engine, this.aiColor);
      // AI accepts if slightly worse or roughly equal
      if (score <= 1.5 && confirm("Offer draw to the computer?")) {
        this.engine.setResult({ type: "draw", reason: "Agreement" });
        this.sounds.play("game-end");
        this.renderAll();
        this.maybeShowGameOverModal();
      } else if (score > 1.5) {
        this.setOnlineStatus("Computer declines the draw offer.", false);
      }
    } else {
      if (confirm("Accept draw?")) {
        this.engine.setResult({ type: "draw", reason: "Agreement" });
        this.sounds.play("game-end");
        this.renderAll();
        this.maybeShowGameOverModal();
      }
    }
  }

  /* ── Browse mode ─────────────────────────────── */

  goBrowse(n) {
    const total = this.engine.history.length;
    if (total === 0) return;
    n = Math.max(0, Math.min(n, total));

    if (n === total && this.browseIndex === null) return; // already live at end
    if (n === total) { this.exitBrowse(); return; }

    this.browseIndex = n;
    this.browseBar.classList.remove("hidden");
    this.browseCounter.textContent = `${n} / ${total}`;
    this.browseFirst.disabled = n === 0;
    this.browsePrev.disabled  = n === 0;
    this.browseNext.disabled  = n === total;
    this.browseLast.disabled  = n === total;
    this._renderBrowseBoard();
    this._highlightHistoryAt(n - 1);
  }

  exitBrowse() {
    this.browseIndex = null;
    this.browseBar.classList.add("hidden");
    this._highlightHistoryAt(this.engine.history.length - 1);
    this.renderBoard();
  }

  _getBrowseData(n) {
    const history = this.engine.history;
    if (n === 0 && history.length > 0 && history[0].snapshotBefore) {
      return { board: history[0].snapshotBefore.board, lastMove: null };
    }
    if (n < history.length && history[n] && history[n].snapshotBefore) {
      return { board: history[n].snapshotBefore.board, lastMove: history[n - 1].move };
    }
    return { board: this.engine.board, lastMove: this.lastMove };
  }

  _renderBrowseBoard() {
    const { board, lastMove } = this._getBrowseData(this.browseIndex);
    this.boardElement.classList.add("locked");

    for (const sq of this.squareElements) {
      const dx = Number(sq.dataset.displayX);
      const dy = Number(sq.dataset.displayY);
      const { x, y } = this._displayToBoard(dx, dy);
      sq.dataset.boardX = String(x);
      sq.dataset.boardY = String(y);
      sq.className = "square";
      sq.classList.add((x + y) % 2 === 0 ? "light" : "dark");

      if (lastMove && (
        (lastMove.fromX === x && lastMove.fromY === y) ||
        (lastMove.toX   === x && lastMove.toY   === y)
      )) sq.classList.add("is-last-move");

      sq.replaceChildren();
      const piece = board[y][x];
      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        sq.appendChild(span);
      }
      if (dx === 0) {
        const rl = document.createElement("span");
        rl.className = "coord rank";
        rl.textContent = String(8 - y);
        sq.appendChild(rl);
      }
      if (dy === 7) {
        const fl = document.createElement("span");
        fl.className = "coord file";
        fl.textContent = FILES[x];
        sq.appendChild(fl);
      }
    }
  }

  _highlightHistoryAt(moveIndex) {
    // moveIndex is 0-based history index (-1 = none)
    for (const span of this.moveList.querySelectorAll(".move-ply")) {
      span.classList.remove("is-active");
    }
    if (moveIndex < 0) return;
    const spans = Array.from(this.moveList.querySelectorAll(".move-ply"));
    if (spans[moveIndex]) {
      spans[moveIndex].classList.add("is-active");
      spans[moveIndex].scrollIntoView({ block: "nearest" });
    }
  }

  /* ── Game-over modal ─────────────────────────── */

  maybeShowGameOverModal() {
    if (!this.engine.gameOver || !this.engine.result) return;
    const key = JSON.stringify(this.engine.result);
    if (key === this._lastShownResult) return;
    this._lastShownResult = key;

    const { type, winner, reason } = this.engine.result;

    if (type === "checkmate") {
      const w = winner === "w" ? "White" : "Black";
      this.gameOverIcon.textContent  = winner === "w" ? "♔" : "♚";
      this.gameOverTitle.textContent = `${w} wins!`;
      this.gameOverSub.textContent   = "by checkmate";
    } else if (type === "timeout") {
      const w = winner === "w" ? "White" : "Black";
      this.gameOverIcon.textContent  = "⏱";
      this.gameOverTitle.textContent = `${w} wins!`;
      this.gameOverSub.textContent   = "on time";
    } else if (type === "resign") {
      const w = winner === "w" ? "White" : "Black";
      this.gameOverIcon.textContent  = "🏳";
      this.gameOverTitle.textContent = `${w} wins!`;
      this.gameOverSub.textContent   = "by resignation";
    } else {
      this.gameOverIcon.textContent  = "½";
      this.gameOverTitle.textContent = "Draw!";
      this.gameOverSub.textContent   = reason || "";
    }

    this.gameOverModal.classList.remove("hidden");
    this.gameOverNewBtn.focus();
  }

  closeGameOverModal() {
    this.gameOverModal.classList.add("hidden");
  }

  /* ── Piece animation ─────────────────────────── */

  _getSquareEl(boardX, boardY) {
    return this.squareElements.find(
      (sq) => Number(sq.dataset.boardX) === boardX && Number(sq.dataset.boardY) === boardY,
    );
  }

  _captureFromRect(boardX, boardY) {
    const sq = this._getSquareEl(boardX, boardY);
    if (!sq) return null;
    return sq.getBoundingClientRect();
  }

  _animateFly(fromRect, toX, toY, symbol, colorClass) {
    if (!fromRect) return;
    const toSq = this._getSquareEl(toX, toY);
    if (!toSq) return;
    const toRect = toSq.getBoundingClientRect();
    const toPiece = toSq.querySelector(".piece");
    if (toPiece) toPiece.style.opacity = "0";

    const clone = document.createElement("span");
    clone.className = `piece-fly ${colorClass}`;
    clone.textContent = symbol;
    clone.style.width  = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    clone.style.left   = `${fromRect.left}px`;
    clone.style.top    = `${fromRect.top}px`;
    document.body.appendChild(clone);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.left = `${toRect.left}px`;
      clone.style.top  = `${toRect.top}px`;
    }));

    const finish = () => {
      if (toPiece) toPiece.style.opacity = "";
      clone.remove();
    };
    clone.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 300); // safety fallback
  }

  /* ── Mode helpers ────────────────────────────── */

  onModeChange() {
    this.mode = this.gameModeSelect.value;
    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.clearSelection();

    if (this.mode !== "online") {
      if (this.online.connected || this.online.joining) this.onlineClient.disconnect(false);
      this.online = { joining: false, connected: false, roomId: "", role: "offline", color: null, pendingMove: false, players: { w: false, b: false } };
      this.setOnlineStatus("Not connected.", false);
    }
    this.startNewGame();
    this.syncModeUI();
  }

  configureAiSides() {
    const pref = this.humanColorSelect.value;
    this.humanColor = pref === "random" ? (Math.random() < 0.5 ? "w" : "b") : (pref === "b" ? "b" : "w");
    this.aiColor = this.humanColor === "w" ? "b" : "w";
  }

  parseTimeControl(value) {
    if (!value || value === "untimed") return { enabled: false, baseSeconds: 0, increment: 0 };
    const [base, inc] = value.split("+").map(Number);
    if (Number.isNaN(base) || Number.isNaN(inc)) return { enabled: true, baseSeconds: 300, increment: 0 };
    return { enabled: true, baseSeconds: base, increment: inc };
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
      this.clocks = { w: this.clockConfig.baseSeconds, b: this.clockConfig.baseSeconds };
      this.clockStack.classList.remove("hidden");
    } else {
      this.clocks = { w: 0, b: 0 };
      this.clockStack.classList.add("hidden");
    }
    this.lastTick = performance.now();
  }

  syncModeUI() {
    const ai     = this.mode === "ai";
    const online = this.mode === "online";

    this.aiControls.classList.toggle("hidden", !ai);
    this.onlineControls.classList.toggle("hidden", !online);
    this.undoBtn.disabled = online;
    this.timeControlWrap.classList.toggle("disabled", online);
    this.timeControlSelect.disabled = online;
    this.resignBtn.disabled  = this.engine.gameOver;
    this.offerDrawBtn.disabled = this.engine.gameOver || (online && !this.online.connected);
    this.newGameBtn.textContent = online && this.online.connected ? "Request New Game" : "New Game";
    this.onlineConnectBtn.disabled    = !online || this.online.joining || this.online.connected;
    this.onlineDisconnectBtn.disabled = !online || (!this.online.joining && !this.online.connected);
    if (online && !this.online.connected && !this.online.joining) this.setOnlineStatus("Not connected.", false);
  }

  /* ── New game / undo ─────────────────────────── */

  startNewGame() {
    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.closeGameOverModal();
    this.exitBrowse();
    this._lastShownResult = null;

    if (this.mode === "online" && this.online.connected) {
      this.onlineClient.send({ type: "new_game" });
      this.setOnlineStatus(`Requested new game in room ${this.online.roomId}.`, false);
      return;
    }

    this.engine.reset();
    this.selected   = null;
    this.legalMoves = [];
    this.lastMove   = null;
    this.online.pendingMove = false;

    if (this.mode === "ai") { this.configureAiSides(); this.orientation = this.humanColor; }
    else if (this.mode === "local")  this.orientation = "w";
    else if (this.mode === "online") this.orientation = this.online.color || "w";

    this.applyTimeControl();
    this.renderAll();
    this.syncModeUI();
    this.maybeQueueAIMove();
  }

  undoMove() {
    if (this.mode === "online") return;
    this.cancelAITurn();
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.exitBrowse();

    let steps = 1;
    if (this.mode === "ai" && this.engine.history.length >= 2) {
      if (this.engine.history[this.engine.history.length - 1].mover === this.aiColor) steps = 2;
    }
    for (let i = 0; i < steps; i += 1) {
      if (!this.engine.undo().ok) break;
      if (this.clockConfig.enabled) {
        const snap = this.clockHistory.pop();
        if (snap) { this.clocks.w = snap.w; this.clocks.b = snap.b; }
      }
    }
    this.lastTick = performance.now();
    this.selected  = null;
    this.legalMoves = [];
    const last = this.engine.history[this.engine.history.length - 1];
    this.lastMove = last ? last.move : null;
    this.renderAll();
  }

  /* ── AI ──────────────────────────────────────── */

  cancelAITurn() {
    if (this.aiTimer) { window.clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.aiThinking = false;
  }

  maybeQueueAIMove() {
    if (this.mode !== "ai" || this.engine.gameOver || this.pendingPromotion || this.aiThinking) return;
    if (this.engine.turn !== this.aiColor) return;

    this.aiThinking = true;
    this.renderStatus();

    const delay = 280 + randomInt(380);
    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;
      if (this.mode !== "ai" || this.engine.gameOver || this.engine.turn !== this.aiColor) {
        this.aiThinking = false;
        this.renderStatus();
        return;
      }
      const move = this.ai.chooseMove(this.engine, this.aiDifficultySelect.value, this.aiColor);
      this.aiThinking = false;
      if (!move) { this.renderAll(); return; }
      this.executeMove(move.fromX, move.fromY, move.toX, move.toY, move.promotionType || null);
    }, delay);
  }

  /* ── Click / drag interactions ───────────────── */

  canCurrentUserMove() {
    if (this.engine.gameOver || this.pendingPromotion || this.aiThinking || this.online.pendingMove) return false;
    if (this.mode === "local")  return true;
    if (this.mode === "ai")     return this.engine.turn === this.humanColor;
    if (this.mode === "online") return this.online.connected && this.online.role === "player" && this.online.color === this.engine.turn;
    return false;
  }

  onSquareClick(x, y) {
    if (!this.canCurrentUserMove()) return;
    const clicked = this.engine.getPiece(x, y);

    if (!this.selected) {
      if (clicked && clicked.color === this.engine.turn) {
        this.sounds.play("select");
        this.selectSquare(x, y);
      }
      return;
    }
    if (this.selected.x === x && this.selected.y === y) { this.clearSelection(); this.renderBoard(); return; }
    if (clicked && clicked.color === this.engine.turn) {
      this.sounds.play("select");
      this.selectSquare(x, y);
      this.renderBoard();
      return;
    }
    this.executeMove(this.selected.x, this.selected.y, x, y);
  }

  selectSquare(x, y) {
    const moves = this.engine.getLegalMovesForPiece(x, y, this.engine.turn);
    if (!moves.length) { this.clearSelection(); return; }
    this.selected   = { x, y };
    this.legalMoves = moves;
    this.renderBoard();
  }

  clearSelection() { this.selected = null; this.legalMoves = []; }

  /* ── Drag & drop ─────────────────────────────── */

  _onDragStart(e, sq) {
    if (!this.canCurrentUserMove() || this.browseIndex !== null) { e.preventDefault(); return; }
    const x = Number(sq.dataset.boardX);
    const y = Number(sq.dataset.boardY);
    const p = this.engine.getPiece(x, y);
    if (!p || p.color !== this.engine.turn) { e.preventDefault(); return; }
    this.dragSource = { x, y };
    this.selectSquare(x, y);
    this.renderBoard();
    sq.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${x},${y}`);
  }

  _onDragOver(e, sq) {
    if (!this.dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    sq.classList.add("is-drag-over");
  }

  _onDrop(e, sq) {
    e.preventDefault();
    sq.classList.remove("is-drag-over");
    if (!this.dragSource) return;
    const toX = Number(sq.dataset.boardX);
    const toY = Number(sq.dataset.boardY);
    const { x: fromX, y: fromY } = this.dragSource;
    this.dragSource = null;
    // Clear is-dragging from source
    const srcSq = this._getSquareEl(fromX, fromY);
    if (srcSq) srcSq.classList.remove("is-dragging");
    this.executeMove(fromX, fromY, toX, toY);
  }

  _onDragEnd(sq) {
    sq.classList.remove("is-dragging");
    this.dragSource = null;
    this.clearSelection();
    this.renderBoard();
  }

  /* ── Clock helpers ───────────────────────────── */

  consumeClockElapsed() {
    if (!this.clockConfig.enabled || this.engine.gameOver) return;
    const now     = performance.now();
    const elapsed = (now - this.lastTick) / 1000;
    if (elapsed <= 0) return;
    const color = this.engine.turn;
    this.clocks[color] -= elapsed;
    this.lastTick = now;
    if (this.clocks[color] <= 0) {
      this.clocks[color] = 0;
      this.handleTimeout(color);
    }
  }

  handleClockTick() {
    if (!this.clockConfig.enabled || this.engine.gameOver) return;
    this.consumeClockElapsed();
    this.renderClocks();
  }

  handleTimeout(loserColor) {
    if (this.engine.gameOver) return;
    const winner = loserColor === "w" ? "b" : "w";
    this.engine.setResult({ type: "timeout", winner, loser: loserColor, reason: "Time out" });
    this.sounds.play("game-end");
    this.clearSelection();
    this.renderAll();
    this.maybeShowGameOverModal();
  }

  /* ── Execute move ────────────────────────────── */

  executeMove(fromX, fromY, toX, toY, promotionType = null) {
    if (this.mode === "online") return this.submitOnlineMove(fromX, fromY, toX, toY, promotionType);

    let clockSnap = null;
    if (this.clockConfig.enabled) {
      this.consumeClockElapsed();
      if (this.engine.gameOver) { this.renderAll(); return false; }
      clockSnap = { w: this.clocks.w, b: this.clocks.b };
    }

    const result = this.engine.attemptMove(fromX, fromY, toX, toY, promotionType);
    if (result.needsPromotion) {
      this.pendingPromotion = { fromX, fromY, toX, toY };
      this.openPromotionModal();
      return false;
    }
    if (!result.ok) {
      this.sounds.play("invalid");
      this.renderBoard();
      return false;
    }

    if (this.clockConfig.enabled) {
      this.clockHistory.push(clockSnap);
      this.clocks[result.move.mover] += this.clockConfig.increment;
      this.lastTick = performance.now();
    }

    // Determine sound before rendering
    const move = result.move.move;
    let soundType = "move";
    if (this.engine.gameOver) soundType = "game-end";
    else if (this.engine.isKingInCheck(this.engine.turn)) soundType = "check";
    else if (move.isCastle)  soundType = "castle";
    else if (move.isCapture) soundType = "capture";

    // Capture fromRect before renderAll for animation
    const fromRect = this._captureFromRect(fromX, fromY);
    const movingPiece = this.engine.history[this.engine.history.length - 1];
    const pieceColor  = movingPiece ? movingPiece.mover : "w";
    const pieceType   = move.promotionType || this.engine.getPiece(toX, toY)?.type || "p";
    const pieceSymbol = PIECE_SYMBOLS[pieceColor]?.[pieceType] ?? "";

    this.pendingPromotion = null;
    this.closePromotionModal();
    this.clearSelection();
    this.lastMove = move;
    if (this.browseIndex !== null) this.exitBrowse();

    this.renderAll();
    this._animateFly(fromRect, toX, toY, pieceSymbol, pieceColor === "w" ? "white" : "black");
    this.sounds.play(soundType);
    this._updateOpeningName();
    this.maybeShowGameOverModal();

    if (this.mode === "ai") this.maybeQueueAIMove();
    return true;
  }

  /* ── Online move submission ──────────────────── */

  submitOnlineMove(fromX, fromY, toX, toY, promotionType = null) {
    if (!this.online.connected || this.online.role !== "player") return false;
    if (this.online.color !== this.engine.turn) return false;

    const legal = this.engine.getLegalMovesForPiece(fromX, fromY, this.engine.turn);
    const candidates = legal.filter((m) => m.toX === toX && m.toY === toY);
    if (!candidates.length) return false;

    if (candidates.some((m) => Boolean(m.promotionType)) && !promotionType) {
      this.pendingPromotion = { fromX, fromY, toX, toY };
      this.openPromotionModal();
      return false;
    }

    this.onlineClient.send({ type: "move", move: { fromX, fromY, toX, toY, promotionType } });
    this.online.pendingMove = true;
    this.pendingPromotion   = null;
    this.closePromotionModal();
    this.clearSelection();
    this.setOnlineStatus("Move sent. Waiting for server...", false);
    this.renderBoard();
    return true;
  }

  /* ── Promotion modal ─────────────────────────── */

  openPromotionModal() {
    const color = this.engine.turn;
    for (const btn of this.promotionBtns) {
      btn.textContent = PIECE_SYMBOLS[color][btn.dataset.piece];
    }
    this.promotionModal.classList.remove("hidden");
  }

  closePromotionModal() { this.promotionModal.classList.add("hidden"); }

  onPromotionChoice(pieceType) {
    if (!this.pendingPromotion) return;
    const { fromX, fromY, toX, toY } = this.pendingPromotion;
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.executeMove(fromX, fromY, toX, toY, pieceType);
  }

  /* ── Opening name ────────────────────────────── */

  _updateOpeningName() {
    const moves = this.engine.history.map((e) => stripAnnotations(e.notation)).join(" ");
    // Walk from longest possible match down
    let name = "";
    for (let len = this.engine.history.length; len >= 1; len -= 1) {
      const key = this.engine.history.slice(0, len).map((e) => stripAnnotations(e.notation)).join(" ");
      if (OPENING_NAMES[key]) { name = OPENING_NAMES[key]; break; }
    }
    void moves; // suppress lint
    this.openingNameEl.textContent = name;
  }

  /* ── Board coordinate helpers ────────────────── */

  _displayToBoard(dx, dy) {
    return this.orientation === "w" ? { x: dx, y: dy } : { x: 7 - dx, y: 7 - dy };
  }

  /* ── Render: board ───────────────────────────── */

  renderBoard() {
    if (this.browseIndex !== null) { this._renderBrowseBoard(); return; }

    const checkedColor = !this.engine.gameOver && this.engine.isKingInCheck(this.engine.turn) ? this.engine.turn : null;
    const checkedKing  = checkedColor ? this.engine.findKing(checkedColor) : null;

    this.boardElement.classList.toggle("locked", !this.canCurrentUserMove());

    for (const sq of this.squareElements) {
      const dx = Number(sq.dataset.displayX);
      const dy = Number(sq.dataset.displayY);
      const { x, y } = this._displayToBoard(dx, dy);
      sq.dataset.boardX = String(x);
      sq.dataset.boardY = String(y);
      sq.className = "square";
      sq.classList.add((x + y) % 2 === 0 ? "light" : "dark");

      const piece = this.engine.getPiece(x, y);

      const lm = this.legalMoves.find((m) => m.toX === x && m.toY === y);
      if (lm) sq.classList.add(lm.isCapture ? "is-capture" : "is-legal");

      if (this.selected && this.selected.x === x && this.selected.y === y)
        sq.classList.add("is-selected");

      if (this.lastMove && (
        (this.lastMove.fromX === x && this.lastMove.fromY === y) ||
        (this.lastMove.toX   === x && this.lastMove.toY   === y)
      )) sq.classList.add("is-last-move");

      if (checkedKing && checkedKing.x === x && checkedKing.y === y)
        sq.classList.add("is-in-check");

      sq.replaceChildren();

      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        span.draggable = true;
        sq.appendChild(span);
      }

      if (dx === 0) {
        const rl = document.createElement("span");
        rl.className = "coord rank";
        rl.textContent = String(8 - y);
        sq.appendChild(rl);
      }
      if (dy === 7) {
        const fl = document.createElement("span");
        fl.className = "coord file";
        fl.textContent = FILES[x];
        sq.appendChild(fl);
      }
    }
  }

  /* ── Render: status ──────────────────────────── */

  formatGameResult() {
    if (!this.engine.gameOver || !this.engine.result) return null;
    const { type, winner, reason } = this.engine.result;
    if (type === "checkmate") return `${winner === "w" ? "White" : "Black"} wins by checkmate.`;
    if (type === "timeout")   return `${winner === "w" ? "White" : "Black"} wins on time.`;
    if (type === "resign")    return `${winner === "w" ? "White" : "Black"} wins by resignation.`;
    if (type === "draw")      return `Draw by ${reason}.`;
    return null;
  }

  formatStatus() {
    const res = this.formatGameResult();
    if (res) return res;
    if (this.mode === "ai" && this.aiThinking) return "Computer is thinking…";
    const side = this.engine.turn === "w" ? "White" : "Black";
    if (this.mode === "online") {
      if (!this.online.connected) return "Online mode: connect to a room.";
      if (this.online.role === "spectator") return `Spectating ${this.online.roomId}. ${side} to move.`;
      if (this.online.color === this.engine.turn)
        return this.engine.isKingInCheck(this.engine.turn) ? `Your move (${side}). Check!` : `Your move (${side}).`;
      return this.engine.isKingInCheck(this.engine.turn) ? `${side} to move. Opponent in check.` : `Waiting for opponent. ${side} to move.`;
    }
    return this.engine.isKingInCheck(this.engine.turn) ? `${side} to move. Check!` : `${side} to move.`;
  }

  renderStatus() {
    this.statusLine.textContent = this.formatStatus();

    const rights = [
      this.engine.castlingRights.w.k ? "K" : "",
      this.engine.castlingRights.w.q ? "Q" : "",
      this.engine.castlingRights.b.k ? "k" : "",
      this.engine.castlingRights.b.q ? "q" : "",
    ].join("").trim() || "-";

    let modeLabel = "Local";
    if (this.mode === "ai") modeLabel = `AI (${this.aiDifficultySelect.value})`;
    if (this.mode === "online") modeLabel = this.online.connected
      ? `Online ${this.online.roomId} (${this.online.role === "player" ? (this.online.color === "w" ? "White" : "Black") : "Spectator"})`
      : "Online (offline)";

    this.metaLine.textContent = `Move ${this.engine.fullmoveNumber} · Halfmove ${this.engine.halfmoveClock} · Castling ${rights} · ${modeLabel}`;
  }

  /* ── Render: history ─────────────────────────── */

  renderHistory() {
    this.moveList.replaceChildren();
    const history = this.engine.history;
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement("li");

      const idx = document.createElement("span");
      idx.className = "move-index";
      idx.textContent = `${Math.floor(i / 2) + 1}.`;

      const w = document.createElement("span");
      w.className = "move-ply";
      w.textContent = history[i] ? history[i].notation : "";
      w.dataset.moveIndex = String(i);
      w.addEventListener("click", () => this.goBrowse(i + 1));

      const b = document.createElement("span");
      b.className = "move-ply";
      b.textContent = history[i + 1] ? history[i + 1].notation : "";
      b.dataset.moveIndex = String(i + 1);
      if (history[i + 1]) b.addEventListener("click", () => this.goBrowse(i + 2));

      li.append(idx, w, b);
      this.moveList.appendChild(li);
    }
    this.moveList.scrollTop = this.moveList.scrollHeight;
    if (this.browseIndex === null) this._highlightHistoryAt(history.length - 1);
  }

  /* ── Render: captures ────────────────────────── */

  renderCaptures() {
    const render = (target, pieces) => {
      target.replaceChildren();
      const sorted = [...pieces].sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);
      for (const p of sorted) {
        const span = document.createElement("span");
        span.className = `capture-piece ${p.color === "w" ? "white" : "black"}`;
        span.textContent = PIECE_SYMBOLS[p.color][p.type];
        target.appendChild(span);
      }
    };
    render(this.capturedWhite, this.engine.capturedBy.w);
    render(this.capturedBlack, this.engine.capturedBy.b);

    const delta = this.engine.capturedBy.w.reduce((a, p) => a + PIECE_VALUES[p.type], 0)
                - this.engine.capturedBy.b.reduce((a, p) => a + PIECE_VALUES[p.type], 0);
    this.capturedWhite.dataset.advantage = delta > 0 ? `+${delta}` : "";
    this.capturedBlack.dataset.advantage = delta < 0 ? `+${Math.abs(delta)}` : "";
  }

  /* ── Render: clocks ──────────────────────────── */

  formatClock(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const w = Math.floor(s % 60);
    if (s < 10) {
      const t = Math.floor((s - Math.floor(s)) * 10);
      return `${String(m).padStart(2, "0")}:${String(w).padStart(2, "0")}.${t}`;
    }
    return `${String(m).padStart(2, "0")}:${String(w).padStart(2, "0")}`;
  }

  renderClocks() {
    if (!this.clockConfig.enabled) { this.clockStack.classList.add("hidden"); return; }
    this.clockStack.classList.remove("hidden");
    this.timeWhite.textContent = this.formatClock(this.clocks.w);
    this.timeBlack.textContent = this.formatClock(this.clocks.b);
    this.timeWhite.classList.toggle("low", this.clocks.w < 30 && this.clocks.w > 0);
    this.timeBlack.classList.toggle("low", this.clocks.b < 30 && this.clocks.b > 0);
    this.clockWhite.classList.toggle("active", !this.engine.gameOver && this.engine.turn === "w");
    this.clockBlack.classList.toggle("active", !this.engine.gameOver && this.engine.turn === "b");
  }

  /* ── renderAll ───────────────────────────────── */

  renderAll() {
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderCaptures();
    this.renderClocks();
    this.syncModeUI();
  }

  /* ── Online helpers ──────────────────────────── */

  setOnlineStatus(msg, isError) {
    this.onlineStatusLine.textContent = msg;
    this.onlineStatusLine.classList.toggle("error", Boolean(isError));
  }

  describeOnlinePresence(players) {
    const w = players && players.w ? "White: connected" : "White: open";
    const b = players && players.b ? "Black: connected" : "Black: open";
    return `${w} · ${b}`;
  }

  connectOnline() {
    if (this.mode !== "online" || this.online.connected || this.online.joining) return;
    let roomId = sanitizeRoomCode(this.onlineRoomInput.value);
    if (!roomId) { roomId = randomRoomCode(); this.onlineRoomInput.value = roomId; }
    this.online.joining = true;
    this.setOnlineStatus(`Connecting to ${roomId}…`, false);
    this.syncModeUI();
    this.onlineClient.connect(roomId, this.onlineColorSelect.value);
  }

  disconnectOnline() {
    if (!this.online.connected && !this.online.joining) return;
    this.onlineClient.disconnect();
  }

  getLastMoveFromHistory() {
    const e = this.engine.history[this.engine.history.length - 1];
    return e ? e.move : null;
  }

  /* ── Online event handler ────────────────────── */

  handleOnlineEvent(event) {
    if (event.type === "socket_open") {
      this.setOnlineStatus("Connected. Joining room…", false);
      return;
    }
    if (event.type === "socket_error") {
      this.setOnlineStatus("Socket error. Check server.", true);
      return;
    }
    if (event.type === "socket_close") {
      const was = this.online.connected || this.online.joining;
      this.online = { joining: false, connected: false, roomId: "", role: "offline", color: null, pendingMove: false, players: { w: false, b: false } };
      if (this.mode === "online") {
        this.setOnlineStatus(was ? "Disconnected." : "Not connected.", false);
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
      this.online.joining   = false;
      this.online.connected = true;
      this.online.roomId    = event.roomId;
      this.online.role      = event.role;
      this.online.color     = event.color || null;
      this.online.pendingMove = false;
      this.online.players   = event.players || { w: false, b: false };
      this.engine.loadSerializableState(event.state);
      this.lastMove = this.getLastMoveFromHistory();
      this.clearSelection();
      this.pendingPromotion = null;
      this.closePromotionModal();
      if (this.online.role === "player" && this.online.color) this.orientation = this.online.color;
      this.applyTimeControl();
      this.renderAll();
      const presence = this.describeOnlinePresence(this.online.players);
      const colorName = this.online.color === "w" ? "White" : "Black";
      this.setOnlineStatus(
        this.online.role === "player"
          ? `Joined ${event.roomId} as ${colorName}. ${presence}`
          : `Joined ${event.roomId} as spectator. ${presence}`,
        false,
      );
      return;
    }
    if (event.type === "state") {
      if (!this.online.connected) return;
      const fromRect = this.online.pendingMove && this.lastMove ? this._captureFromRect(this.lastMove.toX, this.lastMove.toY) : null;
      this.engine.loadSerializableState(event.state);
      this.lastMove = event.lastMove || this.getLastMoveFromHistory();
      this.online.pendingMove = false;
      this.clearSelection();
      this.pendingPromotion = null;
      this.closePromotionModal();
      if (event.players) this.online.players = event.players;
      this.renderAll();
      if (fromRect && this.lastMove) {
        const lm   = this.lastMove;
        const hist = this.engine.history[this.engine.history.length - 1];
        const pc   = hist ? hist.mover : "w";
        const pt   = lm.promotionType || this.engine.getPiece(lm.toX, lm.toY)?.type || "p";
        this._animateFly(fromRect, lm.toX, lm.toY, PIECE_SYMBOLS[pc]?.[pt] ?? "", pc === "w" ? "white" : "black");
      }
      if (event.info) this.setOnlineStatus(event.info, false);

      // Determine sound
      if (this.engine.gameOver) this.sounds.play("game-end");
      else if (this.lastMove) {
        if (this.engine.isKingInCheck(this.engine.turn)) this.sounds.play("check");
        else if (this.lastMove.isCastle)  this.sounds.play("castle");
        else if (this.lastMove.isCapture) this.sounds.play("capture");
        else this.sounds.play("move");
      }
      this._updateOpeningName();
      this.maybeShowGameOverModal();
      return;
    }
    if (event.type === "presence") {
      this.online.players = event.players || this.online.players;
      if (this.online.connected) this.setOnlineStatus(this.describeOnlinePresence(this.online.players), false);
      this.syncModeUI();
      return;
    }
    if (event.type === "draw_offer") {
      this.drawOfferUI.classList.remove("hidden");
      this.setOnlineStatus(`${event.from === "w" ? "White" : "Black"} offers a draw.`, false);
      return;
    }
    if (event.type === "draw_declined") {
      this.setOnlineStatus("Draw offer declined.", false);
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

/* ── Boot ── */
window.addEventListener("DOMContentLoaded", () => { new ChessApp(); });
