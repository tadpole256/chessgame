const FILES = "abcdefgh";

const PIECE_SYMBOLS = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function coordToAlgebraic(x, y) {
  return `${FILES[x]}${8 - y}`;
}

class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = this.createInitialBoard();
    this.turn = "w";
    this.castlingRights = {
      w: { k: true, q: true },
      b: { k: true, q: true },
    };
    this.enPassant = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.history = [];
    this.capturedBy = { w: [], b: [] };
    this.gameOver = false;
    this.result = null;
    this.positionCounts = new Map();
    this.positionCounts.set(this.getPositionKey(), 1);
  }

  createInitialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];

    for (let x = 0; x < 8; x += 1) {
      board[0][x] = { color: "b", type: backRank[x], moved: false };
      board[1][x] = { color: "b", type: "p", moved: false };
      board[6][x] = { color: "w", type: "p", moved: false };
      board[7][x] = { color: "w", type: backRank[x], moved: false };
    }

    return board;
  }

  cloneBoard(board = this.board) {
    return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
  }

  cloneCastlingRights(rights = this.castlingRights) {
    return {
      w: { ...rights.w },
      b: { ...rights.b },
    };
  }

  cloneCapturedBy(capturedBy = this.capturedBy) {
    return {
      w: capturedBy.w.map((piece) => ({ ...piece })),
      b: capturedBy.b.map((piece) => ({ ...piece })),
    };
  }

  cloneMoveHistoryEntry(entry) {
    return {
      move: { ...entry.move },
      notation: entry.notation,
      mover: entry.mover,
      captured: entry.captured ? { ...entry.captured } : null,
      snapshotBefore: entry.snapshotBefore ? this.cloneSnapshot(entry.snapshotBefore) : null,
    };
  }

  cloneSnapshot(snapshot) {
    return {
      board: this.cloneBoard(snapshot.board),
      turn: snapshot.turn,
      castlingRights: this.cloneCastlingRights(snapshot.castlingRights),
      enPassant: snapshot.enPassant ? { ...snapshot.enPassant } : null,
      halfmoveClock: snapshot.halfmoveClock,
      fullmoveNumber: snapshot.fullmoveNumber,
      capturedBy: this.cloneCapturedBy(snapshot.capturedBy),
      gameOver: snapshot.gameOver,
      result: snapshot.result ? { ...snapshot.result } : null,
      positionCounts: new Map(snapshot.positionCounts),
    };
  }

  captureSnapshot() {
    return {
      board: this.cloneBoard(),
      turn: this.turn,
      castlingRights: this.cloneCastlingRights(),
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
      capturedBy: this.cloneCapturedBy(),
      gameOver: this.gameOver,
      result: this.result ? { ...this.result } : null,
      positionCounts: new Map(this.positionCounts),
    };
  }

  restoreSnapshot(snapshot) {
    this.board = this.cloneBoard(snapshot.board);
    this.turn = snapshot.turn;
    this.castlingRights = this.cloneCastlingRights(snapshot.castlingRights);
    this.enPassant = snapshot.enPassant ? { ...snapshot.enPassant } : null;
    this.halfmoveClock = snapshot.halfmoveClock;
    this.fullmoveNumber = snapshot.fullmoveNumber;
    this.capturedBy = this.cloneCapturedBy(snapshot.capturedBy);
    this.gameOver = snapshot.gameOver;
    this.result = snapshot.result ? { ...snapshot.result } : null;
    this.positionCounts = new Map(snapshot.positionCounts);
  }

  getSerializableState() {
    return {
      board: this.cloneBoard(),
      turn: this.turn,
      castlingRights: this.cloneCastlingRights(),
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
      capturedBy: this.cloneCapturedBy(),
      gameOver: this.gameOver,
      result: this.result ? { ...this.result } : null,
      history: this.history.map((entry) => ({
        move: { ...entry.move },
        notation: entry.notation,
        mover: entry.mover,
        captured: entry.captured ? { ...entry.captured } : null,
      })),
      positionCounts: Array.from(this.positionCounts.entries()),
    };
  }

  loadSerializableState(state) {
    this.board = this.cloneBoard(state.board || []);
    this.turn = state.turn;
    this.castlingRights = this.cloneCastlingRights(state.castlingRights || {
      w: { k: false, q: false },
      b: { k: false, q: false },
    });
    this.enPassant = state.enPassant ? { ...state.enPassant } : null;
    this.halfmoveClock = state.halfmoveClock || 0;
    this.fullmoveNumber = state.fullmoveNumber || 1;
    this.capturedBy = this.cloneCapturedBy(state.capturedBy || { w: [], b: [] });
    this.gameOver = Boolean(state.gameOver);
    this.result = state.result ? { ...state.result } : null;
    this.history = (state.history || []).map((entry) => ({
      move: { ...entry.move },
      notation: entry.notation,
      mover: entry.mover,
      captured: entry.captured ? { ...entry.captured } : null,
      snapshotBefore: null,
    }));
    this.positionCounts = new Map(state.positionCounts || []);
  }

  inBounds(x, y) {
    return x >= 0 && x < 8 && y >= 0 && y < 8;
  }

  getPiece(x, y) {
    if (!this.inBounds(x, y)) {
      return null;
    }
    return this.board[y][x];
  }

  getPositionKey() {
    const rows = [];

    for (let y = 0; y < 8; y += 1) {
      let row = "";
      for (let x = 0; x < 8; x += 1) {
        const piece = this.board[y][x];
        if (!piece) {
          row += ".";
        } else {
          const symbol = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
          row += symbol;
        }
      }
      rows.push(row);
    }

    const castle = [
      this.castlingRights.w.k ? "K" : "",
      this.castlingRights.w.q ? "Q" : "",
      this.castlingRights.b.k ? "k" : "",
      this.castlingRights.b.q ? "q" : "",
    ]
      .join("")
      .trim() || "-";

    const enPassantKey = this.enPassant
      ? coordToAlgebraic(this.enPassant.x, this.enPassant.y)
      : "-";

    return `${rows.join("/")}:${this.turn}:${castle}:${enPassantKey}`;
  }

  findKing(color, board = this.board) {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = board[y][x];
        if (piece && piece.color === color && piece.type === "k") {
          return { x, y };
        }
      }
    }
    return null;
  }

  isSquareAttacked(x, y, byColor, board = this.board) {
    const pawnDir = byColor === "w" ? -1 : 1;
    const pawnSources = [
      [x - 1, y - pawnDir],
      [x + 1, y - pawnDir],
    ];

    for (const [sx, sy] of pawnSources) {
      if (!this.inBounds(sx, sy)) {
        continue;
      }
      const piece = board[sy][sx];
      if (piece && piece.color === byColor && piece.type === "p") {
        return true;
      }
    }

    const knightOffsets = [
      [1, 2],
      [2, 1],
      [2, -1],
      [1, -2],
      [-1, -2],
      [-2, -1],
      [-2, 1],
      [-1, 2],
    ];

    for (const [dx, dy] of knightOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) {
        continue;
      }
      const piece = board[ny][nx];
      if (piece && piece.color === byColor && piece.type === "n") {
        return true;
      }
    }

    const diagonalDirs = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (const [dx, dy] of diagonalDirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (this.inBounds(nx, ny)) {
        const piece = board[ny][nx];
        if (piece) {
          if (piece.color === byColor && (piece.type === "b" || piece.type === "q")) {
            return true;
          }
          break;
        }
        nx += dx;
        ny += dy;
      }
    }

    const straightDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of straightDirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (this.inBounds(nx, ny)) {
        const piece = board[ny][nx];
        if (piece) {
          if (piece.color === byColor && (piece.type === "r" || piece.type === "q")) {
            return true;
          }
          break;
        }
        nx += dx;
        ny += dy;
      }
    }

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) {
          continue;
        }
        const piece = board[ny][nx];
        if (piece && piece.color === byColor && piece.type === "k") {
          return true;
        }
      }
    }

    return false;
  }

  isKingInCheck(color, board = this.board) {
    const king = this.findKing(color, board);
    if (!king) {
      return false;
    }
    const attacker = color === "w" ? "b" : "w";
    return this.isSquareAttacked(king.x, king.y, attacker, board);
  }

  addPromotionMoves(baseMove, moves) {
    const promotionPieces = ["q", "r", "b", "n"];
    for (const promotionType of promotionPieces) {
      moves.push({ ...baseMove, promotionType });
    }
  }

  getPseudoMovesForPiece(x, y) {
    const piece = this.getPiece(x, y);
    if (!piece) {
      return [];
    }

    const color = piece.color;
    const enemy = color === "w" ? "b" : "w";
    const moves = [];

    if (piece.type === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRank = color === "w" ? 6 : 1;
      const promotionRank = color === "w" ? 0 : 7;

      const oneForwardY = y + dir;
      if (this.inBounds(x, oneForwardY) && !this.getPiece(x, oneForwardY)) {
        const move = {
          fromX: x,
          fromY: y,
          toX: x,
          toY: oneForwardY,
          isCapture: false,
        };
        if (oneForwardY === promotionRank) {
          this.addPromotionMoves(move, moves);
        } else {
          moves.push(move);
        }

        const twoForwardY = y + 2 * dir;
        if (y === startRank && !this.getPiece(x, twoForwardY)) {
          moves.push({
            fromX: x,
            fromY: y,
            toX: x,
            toY: twoForwardY,
            isCapture: false,
            isDoublePawnPush: true,
          });
        }
      }

      for (const dx of [-1, 1]) {
        const nx = x + dx;
        const ny = y + dir;
        if (!this.inBounds(nx, ny)) {
          continue;
        }

        const target = this.getPiece(nx, ny);
        if (target && target.color === enemy) {
          const move = {
            fromX: x,
            fromY: y,
            toX: nx,
            toY: ny,
            isCapture: true,
          };
          if (ny === promotionRank) {
            this.addPromotionMoves(move, moves);
          } else {
            moves.push(move);
          }
        }

        if (this.enPassant && this.enPassant.x === nx && this.enPassant.y === ny) {
          const captureY = ny - dir;
          const enPassantTarget = this.getPiece(nx, captureY);
          if (
            enPassantTarget &&
            enPassantTarget.type === "p" &&
            enPassantTarget.color === enemy
          ) {
            moves.push({
              fromX: x,
              fromY: y,
              toX: nx,
              toY: ny,
              isCapture: true,
              isEnPassant: true,
              captureX: nx,
              captureY,
            });
          }
        }
      }
    }

    if (piece.type === "n") {
      const offsets = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ];
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) {
          continue;
        }
        const target = this.getPiece(nx, ny);
        if (!target || target.color !== color) {
          moves.push({
            fromX: x,
            fromY: y,
            toX: nx,
            toY: ny,
            isCapture: Boolean(target),
          });
        }
      }
    }

    const addSlidingMoves = (directions) => {
      for (const [dx, dy] of directions) {
        let nx = x + dx;
        let ny = y + dy;
        while (this.inBounds(nx, ny)) {
          const target = this.getPiece(nx, ny);
          if (!target) {
            moves.push({
              fromX: x,
              fromY: y,
              toX: nx,
              toY: ny,
              isCapture: false,
            });
          } else {
            if (target.color !== color) {
              moves.push({
                fromX: x,
                fromY: y,
                toX: nx,
                toY: ny,
                isCapture: true,
              });
            }
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
    };

    if (piece.type === "b") {
      addSlidingMoves([
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]);
    }

    if (piece.type === "r") {
      addSlidingMoves([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
    }

    if (piece.type === "q") {
      addSlidingMoves([
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
    }

    if (piece.type === "k") {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) {
            continue;
          }
          const target = this.getPiece(nx, ny);
          if (!target || target.color !== color) {
            moves.push({
              fromX: x,
              fromY: y,
              toX: nx,
              toY: ny,
              isCapture: Boolean(target),
            });
          }
        }
      }

      if (!piece.moved && !this.isKingInCheck(color)) {
        const rank = color === "w" ? 7 : 0;
        const rights = this.castlingRights[color];
        const opponent = color === "w" ? "b" : "w";

        if (
          rights.k &&
          !this.getPiece(5, rank) &&
          !this.getPiece(6, rank) &&
          !this.isSquareAttacked(5, rank, opponent) &&
          !this.isSquareAttacked(6, rank, opponent)
        ) {
          const rook = this.getPiece(7, rank);
          if (rook && rook.type === "r" && rook.color === color && !rook.moved) {
            moves.push({
              fromX: 4,
              fromY: rank,
              toX: 6,
              toY: rank,
              isCapture: false,
              isCastle: "k",
            });
          }
        }

        if (
          rights.q &&
          !this.getPiece(1, rank) &&
          !this.getPiece(2, rank) &&
          !this.getPiece(3, rank) &&
          !this.isSquareAttacked(3, rank, opponent) &&
          !this.isSquareAttacked(2, rank, opponent)
        ) {
          const rook = this.getPiece(0, rank);
          if (rook && rook.type === "r" && rook.color === color && !rook.moved) {
            moves.push({
              fromX: 4,
              fromY: rank,
              toX: 2,
              toY: rank,
              isCapture: false,
              isCastle: "q",
            });
          }
        }
      }
    }

    return moves;
  }

  wouldLeaveKingInCheck(move, color) {
    const simulation = this.cloneBoard();
    const movingPiece = simulation[move.fromY][move.fromX];
    if (!movingPiece) {
      return true;
    }

    simulation[move.fromY][move.fromX] = null;

    if (move.isEnPassant) {
      simulation[move.captureY][move.captureX] = null;
    }

    if (move.isCastle) {
      const rank = color === "w" ? 7 : 0;
      if (move.isCastle === "k") {
        const rook = simulation[rank][7];
        simulation[rank][7] = null;
        simulation[rank][5] = rook ? { ...rook, moved: true } : null;
      } else {
        const rook = simulation[rank][0];
        simulation[rank][0] = null;
        simulation[rank][3] = rook ? { ...rook, moved: true } : null;
      }
    }

    const placed = { ...movingPiece, moved: true };
    if (move.promotionType) {
      placed.type = move.promotionType;
    }

    simulation[move.toY][move.toX] = placed;
    return this.isKingInCheck(color, simulation);
  }

  getLegalMovesForPiece(x, y, color = this.turn) {
    const piece = this.getPiece(x, y);
    if (!piece || piece.color !== color) {
      return [];
    }

    const pseudoMoves = this.getPseudoMovesForPiece(x, y);
    return pseudoMoves.filter((move) => !this.wouldLeaveKingInCheck(move, color));
  }

  getAllLegalMoves(color = this.turn) {
    const legalMoves = [];

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = this.getPiece(x, y);
        if (!piece || piece.color !== color) {
          continue;
        }
        const pieceMoves = this.getLegalMovesForPiece(x, y, color);
        legalMoves.push(...pieceMoves);
      }
    }

    return legalMoves;
  }

  updateCastlingRights(piece, move, captured) {
    const color = piece.color;

    if (piece.type === "k") {
      this.castlingRights[color].k = false;
      this.castlingRights[color].q = false;
    }

    if (piece.type === "r") {
      const homeRank = color === "w" ? 7 : 0;
      if (move.fromY === homeRank && move.fromX === 0) {
        this.castlingRights[color].q = false;
      }
      if (move.fromY === homeRank && move.fromX === 7) {
        this.castlingRights[color].k = false;
      }
    }

    if (captured && captured.type === "r") {
      const capturedHomeRank = captured.color === "w" ? 7 : 0;
      if (move.toY === capturedHomeRank && move.toX === 0) {
        this.castlingRights[captured.color].q = false;
      }
      if (move.toY === capturedHomeRank && move.toX === 7) {
        this.castlingRights[captured.color].k = false;
      }
    }
  }

  createNotation(move, captured) {
    if (move.isCastle === "k") {
      return this.appendCheckState("O-O");
    }

    if (move.isCastle === "q") {
      return this.appendCheckState("O-O-O");
    }

    const from = coordToAlgebraic(move.fromX, move.fromY);
    const to = coordToAlgebraic(move.toX, move.toY);
    const captureMark = captured || move.isEnPassant ? "x" : "-";

    let notation = `${from}${captureMark}${to}`;

    if (move.promotionType) {
      notation += `=${move.promotionType.toUpperCase()}`;
    }

    return this.appendCheckState(notation);
  }

  appendCheckState(baseNotation) {
    if (this.gameOver && this.result && this.result.type === "checkmate") {
      return `${baseNotation}#`;
    }

    if (!this.gameOver && this.isKingInCheck(this.turn)) {
      return `${baseNotation}+`;
    }

    return baseNotation;
  }

  applyMove(move) {
    if (this.gameOver) {
      return { ok: false, reason: "game_over" };
    }

    const snapshotBefore = this.captureSnapshot();
    const piece = this.getPiece(move.fromX, move.fromY);

    if (!piece || piece.color !== this.turn) {
      return { ok: false, reason: "invalid_piece" };
    }

    let captured = null;

    if (move.isEnPassant) {
      captured = this.getPiece(move.captureX, move.captureY);
      this.board[move.captureY][move.captureX] = null;
    } else {
      captured = this.getPiece(move.toX, move.toY);
    }

    this.board[move.fromY][move.fromX] = null;

    const movedPiece = { ...piece, moved: true };
    if (move.promotionType) {
      movedPiece.type = move.promotionType;
    }

    this.board[move.toY][move.toX] = movedPiece;

    if (move.isCastle) {
      const rank = piece.color === "w" ? 7 : 0;
      if (move.isCastle === "k") {
        const rook = this.board[rank][7];
        this.board[rank][7] = null;
        this.board[rank][5] = rook ? { ...rook, moved: true } : null;
      } else {
        const rook = this.board[rank][0];
        this.board[rank][0] = null;
        this.board[rank][3] = rook ? { ...rook, moved: true } : null;
      }
    }

    const capturedInfo = captured ? { type: captured.type, color: captured.color } : null;
    if (capturedInfo) {
      this.capturedBy[piece.color].push(capturedInfo);
    }

    this.updateCastlingRights(piece, move, capturedInfo);

    if (piece.type === "p" && Math.abs(move.toY - move.fromY) === 2) {
      this.enPassant = {
        x: move.fromX,
        y: (move.fromY + move.toY) / 2,
      };
    } else {
      this.enPassant = null;
    }

    if (piece.type === "p" || capturedInfo) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock += 1;
    }

    if (this.turn === "b") {
      this.fullmoveNumber += 1;
    }

    this.turn = this.turn === "w" ? "b" : "w";

    const positionKey = this.getPositionKey();
    const count = (this.positionCounts.get(positionKey) || 0) + 1;
    this.positionCounts.set(positionKey, count);

    this.evaluateGameState();

    const notation = this.createNotation(move, capturedInfo);

    const historyEntry = {
      move: { ...move },
      notation,
      mover: piece.color,
      captured: capturedInfo,
      snapshotBefore,
    };

    this.history.push(historyEntry);

    return {
      ok: true,
      move: historyEntry,
    };
  }

  attemptMove(fromX, fromY, toX, toY, promotionType = null) {
    if (this.gameOver) {
      return { ok: false, reason: "game_over" };
    }

    const legalMoves = this.getLegalMovesForPiece(fromX, fromY, this.turn);
    const candidates = legalMoves.filter((move) => move.toX === toX && move.toY === toY);

    if (!candidates.length) {
      return { ok: false, reason: "illegal_move" };
    }

    const needsPromotion = candidates.some((move) => Boolean(move.promotionType));
    if (needsPromotion && !promotionType) {
      return { ok: false, needsPromotion: true };
    }

    let selected = candidates[0];
    if (promotionType) {
      const match = candidates.find((move) => move.promotionType === promotionType);
      if (!match) {
        return { ok: false, reason: "invalid_promotion" };
      }
      selected = match;
    }

    return this.applyMove(selected);
  }

  evaluateGameState() {
    const legalMoves = this.getAllLegalMoves(this.turn);
    const inCheck = this.isKingInCheck(this.turn);

    this.gameOver = false;
    this.result = null;

    if (legalMoves.length === 0) {
      if (inCheck) {
        this.gameOver = true;
        this.result = {
          type: "checkmate",
          winner: this.turn === "w" ? "b" : "w",
          reason: "Checkmate",
        };
      } else {
        this.gameOver = true;
        this.result = {
          type: "draw",
          reason: "Stalemate",
        };
      }
      return;
    }

    if (this.halfmoveClock >= 100) {
      this.gameOver = true;
      this.result = {
        type: "draw",
        reason: "50-move rule",
      };
      return;
    }

    const key = this.getPositionKey();
    if ((this.positionCounts.get(key) || 0) >= 3) {
      this.gameOver = true;
      this.result = {
        type: "draw",
        reason: "Threefold repetition",
      };
      return;
    }

    if (this.isInsufficientMaterial()) {
      this.gameOver = true;
      this.result = {
        type: "draw",
        reason: "Insufficient material",
      };
    }
  }

  isInsufficientMaterial() {
    const pieces = [];

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = this.getPiece(x, y);
        if (!piece || piece.type === "k") {
          continue;
        }
        pieces.push({
          type: piece.type,
          color: piece.color,
          squareColor: (x + y) % 2,
        });
      }
    }

    if (pieces.some((piece) => ["p", "r", "q"].includes(piece.type))) {
      return false;
    }

    if (pieces.length === 0) {
      return true;
    }

    if (pieces.length === 1 && ["b", "n"].includes(pieces[0].type)) {
      return true;
    }

    if (pieces.length === 2) {
      const [a, b] = pieces;
      if (a.type === "n" && b.type === "n") {
        return true;
      }

      if (a.type === "b" && b.type === "b") {
        if (a.color !== b.color) {
          return true;
        }
        return a.squareColor === b.squareColor;
      }
    }

    if (pieces.every((piece) => piece.type === "b")) {
      const sameColorSquares = pieces.every(
        (piece) => piece.squareColor === pieces[0].squareColor,
      );
      if (sameColorSquares) {
        return true;
      }
    }

    return false;
  }

  setResult(result) {
    this.gameOver = true;
    this.result = { ...result };
  }

  undo() {
    if (!this.history.length) {
      return { ok: false };
    }

    const last = this.history[this.history.length - 1];
    if (!last.snapshotBefore) {
      return { ok: false };
    }
    this.history.pop();
    this.restoreSnapshot(last.snapshotBefore);
    return { ok: true, undone: last };
  }
}

const ChessCore = {
  FILES,
  PIECE_SYMBOLS,
  PIECE_VALUES,
  coordToAlgebraic,
  ChessEngine,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ChessCore;
}

if (typeof window !== "undefined") {
  window.ChessCore = ChessCore;
}
