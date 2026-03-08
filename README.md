# Regal Chess

Regal Chess is a full-featured chess game with a polished browser UI, built-in computer opponent, and online multiplayer rooms over WebSockets.

## Features

- Complete chess rules and legality:
  - All standard pieces and legal move generation
  - Check, checkmate, stalemate
  - Castling, en passant, and promotion
  - Draw detection (threefold repetition, 50-move rule, insufficient material)
- Premium board interface:
  - Responsive animated board
  - Legal move and capture highlights
  - Last move and in-check indicators
  - Move history and captured pieces with material edge
  - Board flip and undo controls
- Play modes:
  - Local two-player (same device)
  - Vs Computer (minimax AI, Easy/Medium/Hard)
  - Online multiplayer rooms (player or spectator)
- Time controls:
  - Untimed, 3|2, 5|0, 10|5, 15|10
  - Clock mode is disabled in online multiplayer (server-authoritative state)

## Project Structure

- `index.html` - app layout and controls
- `styles.css` - visual design and responsive styling
- `engine-core.js` - shared chess engine (used by browser + server)
- `app.js` - frontend game controller (UI, AI, online client)
- `server.js` - static + WebSocket server for online multiplayer
- `package.json` - Node scripts and dependencies

## Quick Start

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the server:
   ```sh
   npm start
   ```
3. Open:
   [http://localhost:3000](http://localhost:3000)

## Using AI Mode

1. Set `Game Mode` to `Vs Computer`.
2. Pick `AI Difficulty` and `Play As` color.
3. Press `New Game`.

## Using Online Multiplayer

1. Set `Game Mode` to `Online Multiplayer`.
2. Enter a `Room Code` (or leave empty to auto-generate one).
3. Choose `Preferred Color` (or auto assign).
4. Press `Connect`.
5. Share the same room code with another player connected to the same server.

Notes:
- First two clients become White and Black players.
- Additional clients join as spectators.
- `Request New Game` resets board state for everyone in the room.

## Development Notes

- The server validates online moves using the same engine as the frontend.
- Undo is intentionally disabled in online mode to keep room state consistent.
