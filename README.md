# Regal Chess

Regal Chess is a fully featured, browser-based chess game with a premium visual style and complete move legality.

## What You Get

- Full standard chess rules:
  - Legal move validation for all pieces
  - Check, checkmate, and stalemate
  - Castling (both sides)
  - En passant
  - Promotion (choose queen, rook, bishop, or knight)
  - Draw detection via threefold repetition, 50-move rule, and insufficient material
- Polished, responsive UI:
  - Animated board with move highlighting
  - In-check and last-move indicators
  - Captured piece tracking with material advantage
  - Move history notation
  - Board flip control
  - Undo support
- Optional clock modes:
  - Untimed or preset time controls with increment
  - Active player clock highlighting
  - Timeout result handling

## Project Structure

- `index.html` - app shell and UI structure
- `styles.css` - visual design, layout, and animations
- `app.js` - chess rules engine + UI behavior

## Run Locally

1. Open the project folder.
2. Start a local static server (recommended):
   ```sh
   python3 -m http.server 8000
   ```
3. Visit:
   [http://localhost:8000](http://localhost:8000)

You can also open `index.html` directly in a browser, but a local server is more reliable for future expansion.

## Controls

- Click a piece to see legal moves.
- Click a highlighted square to move.
- Use:
  - `New Game` to reset
  - `Undo` to step back one move
  - `Flip Board` to swap perspective
  - `Time Control` to switch clock mode

## Notes

- This version is optimized for local two-player play.
- No external backend or database is required.
