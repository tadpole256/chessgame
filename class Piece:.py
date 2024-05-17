class Piece:
    def __init__(self, color):
        self.color = color

    def is_valid_move(self, start, end, board):
        raise NotImplementedError("This method should be implemented by subclasses")

    def __str__(self):
        return self.__class__.__name__[0].upper() if self.color == 'white' else self.__class__.__name__[0].lower()

class Pawn(Piece):
    def is_valid_move(self, start, end, board):
        start_x, start_y = start
        end_x, end_y = end
        direction = -1 if self.color == 'white' else 1  # Corrected direction

        print(f"Validating Pawn move from {start} to {end}")

        # Single step forward
        if start_x == end_x and end_y - start_y == direction and board[end_y][end_x] is None:
            print("Valid single step forward")
            return True
        
        # Double step forward from starting position
        if start_x == end_x and end_y - start_y == 2 * direction and board[end_y][end_x] is None and board[start_y + direction][start_x] is None:
            if (self.color == 'white' and start_y == 6) or (self.color == 'black' and start_y == 1):  # Corrected starting positions
                print("Valid double step forward")
                return True

        # Capture move
        if abs(end_x - start_x) == 1 and end_y - start_y == direction and board[end_y][end_x] is not None and board[end_y][end_x].color != self.color:
            print("Valid capture move")
            return True

        print("Invalid Pawn move")
        return False

class Rook(Piece):
    def is_valid_move(self, start, end, board):
        start_x, start_y = start
        end_x, end_y = end

        print(f"Validating Rook move from {start} to {end}")

        if start_x != end_x and start_y != end_y:
            print("Invalid Rook move: must move in a straight line")
            return False

        step_x = (end_x - start_x) // max(1, abs(end_x - start_x))
        step_y = (end_y - start_y) // max(1, abs(end_y - start_y))

        x, y = start_x + step_x, start_y + step_y
        while (x, y) != (end_x, end_y):
            if board[y][x] is not None:
                print("Invalid Rook move: path blocked")
                return False
            x += step_x
            y += step_y

        print("Valid Rook move")
        return board[end_y][end_x] is None or board[end_y][end_x].color != self.color

class Board:
    def __init__(self):
        self.board = [
            [Rook('black'), None, None, None, None, None, None, Rook('black')],
            [Pawn('black')] * 8,
            [None] * 8,
            [None] * 8,
            [None] * 8,
            [None] * 8,
            [Pawn('white')] * 8,
            [Rook('white'), None, None, None, None, None, None, Rook('white')]
        ]

    def print_board(self):
        print("  a b c d e f g h")
        for i, row in enumerate(self.board):
            row_str = ' '.join(['.' if piece is None else str(piece) for piece in row])
            print(f"{8 - i} {row_str} {8 - i}")
        print("  a b c d e f g h")

    def move_piece(self, start, end):
        start_x, start_y = start
        end_x, end_y = end
        piece = self.board[start_y][start_x]

        if piece and piece.is_valid_move(start, end, self.board):
            self.board[end_y][end_x] = piece
            self.board[start_y][start_x] = None
            return True
        return False

class Game:
    def __init__(self):
        self.board = Board()
        self.turn = 'white'

    def parse_move(self, move):
        try:
            start, end = move.split()
            start = (ord(start[0]) - ord('a'), 8 - int(start[1]))
            end = (ord(end[0]) - ord('a'), 8 - int(end[1]))
            return start, end
        except ValueError:
            print("Invalid input. Please enter a move in the format 'e2 e4'.")
            return None, None
        except Exception as e:
            print(f"Error parsing move: {e}")
            return None, None

    def play(self):
        print("Welcome to Chess!")
        print("To make a move, enter the start and end positions in the format 'e2 e4'.")
        while True:
            self.board.print_board()
            move = input(f"{self.turn}'s move: ").strip()
            
            if move.lower() == 'exit':
                print("Game exited.")
                break

            start, end = self.parse_move(move)

            if start is None or end is None:
                continue

            print(f"Attempting to move from {start} to {end}")
            if self.board.move_piece(start, end):
                self.turn = 'black' if self.turn == 'white' else 'white'
            else:
                print("Invalid move. Try again.")

# Start the game
game = Game()
game.play()
