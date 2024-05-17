# Chess Game

Welcome to the Chess Game project! This is a simple command-line chess game implemented in Python. The game supports basic chess moves and allows players to play against each other in a turn-based manner.

## Features

- Command-line interface for playing chess
- Supports basic chess moves for pawns and rooks
- Clear representation of the board with distinguishable white and black pieces

## Getting Started

### Prerequisites

- Python 3.x

### Installation

1. Clone the repository to your local machine:
    ```sh
    git clone https://github.com/tadpole256/chessgame.git
    ```
2. Navigate to the project directory:
    ```sh
    cd chess-game
    ```

### Running the Game

To start the game, run the following command:
```sh
python chess_game.py

## How to Play

    The game starts with the white pieces at the bottom and the black pieces at the top of the board.
    To make a move, enter the start and end positions in the format e2 e4. This will move the piece from the square e2 to the square e4.
    The board is labeled with columns a to h and rows 1 to 8, making it easy to identify squares.
    The game will display an error message if the move is invalid, prompting the player to try again.
    Type exit to quit the game.

## Sample Gameplay

Welcome to Chess!
To make a move, enter the start and end positions in the format 'e2 e4'.
  a b c d e f g h
8 r . . . . . . r 8
7 p p p p p p p p 7
6 . . . . . . . . 6
5 . . . . . . . . 5
4 . . . . . . . . 4
3 . . . . . . . . 3
2 P P P P P P P P 2
1 R . . . . . . R 1
  a b c d e f g h
white's move: e2 e4
Attempting to move from (4, 6) to (4, 4)
Valid single step forward
  a b c d e f g h
8 r . . . . . . r 8
7 p p p p p p p p 7
6 . . . . . . . . 6
5 . . . . . . . . 5
4 . . . . P . . . 4
3 . . . . . . . . 3
2 P P P P . P P P 2
1 R . . . . . . R 1
  a b c d e f g h
black's move: e7 e5
Attempting to move from (4, 1) to (4, 3)
Valid single step forward
