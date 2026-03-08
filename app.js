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

  createNotation(move, piece, captured) {
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

    const notation = this.createNotation(move, piece, capturedInfo);

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

    const last = this.history.pop();
    this.restoreSnapshot(last.snapshotBefore);
    return { ok: true, undone: last };
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
    this.timeControlSelect = document.getElementById("time-control");
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

    this.orientation = "w";
    this.selected = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.pendingPromotion = null;

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
    this.applyTimeControl();
    this.renderAll();

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

    this.timeControlSelect.addEventListener("change", () => {
      this.startNewGame();
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
    this.clockConfig = this.parseTimeControl(this.timeControlSelect.value);
    this.clockHistory = [];

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

  startNewGame() {
    this.engine.reset();
    this.selected = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.pendingPromotion = null;
    this.closePromotionModal();
    this.applyTimeControl();
    this.renderAll();
  }

  undoMove() {
    this.pendingPromotion = null;
    this.closePromotionModal();

    const undoResult = this.engine.undo();
    if (!undoResult.ok) {
      return;
    }

    if (this.clockConfig.enabled) {
      const snapshot = this.clockHistory.pop();
      if (snapshot) {
        this.clocks.w = snapshot.w;
        this.clocks.b = snapshot.b;
      }
      this.lastTick = performance.now();
    }

    this.selected = null;
    this.legalMoves = [];
    const lastHistoryEntry = this.engine.history[this.engine.history.length - 1];
    this.lastMove = lastHistoryEntry ? lastHistoryEntry.move : null;

    this.renderAll();
  }

  onSquareClick(x, y) {
    if (this.pendingPromotion || this.engine.gameOver) {
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

  formatStatus() {
    if (this.engine.gameOver && this.engine.result) {
      const { type } = this.engine.result;

      if (type === "checkmate") {
        const winnerName = this.engine.result.winner === "w" ? "White" : "Black";
        return `${winnerName} wins by checkmate.`;
      }

      if (type === "timeout") {
        const winnerName = this.engine.result.winner === "w" ? "White" : "Black";
        return `${winnerName} wins on time.`;
      }

      if (type === "draw") {
        return `Draw by ${this.engine.result.reason}.`;
      }
    }

    const side = this.engine.turn === "w" ? "White" : "Black";
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

    this.metaLine.textContent = `Move ${this.engine.fullmoveNumber} · Halfmove ${this.engine.halfmoveClock} · Castling ${rights}`;
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
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new ChessApp();
});
