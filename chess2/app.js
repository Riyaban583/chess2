const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// Initial game state
function createInitialGameState() {
    return {
        board: [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            ['.', '.', '.', '.', '.', '.', '.', '.'],
            ['.', '.', '.', '.', '.', '.', '.', '.'],
            ['.', '.', '.', '.', '.', '.', '.', '.'],
            ['.', '.', '.', '.', '.', '.', '.', '.'],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ],
        currentPlayer: 'white',
        gameOver: false,
        winner: null,
        moveHistory: [],
        capturedPieces: { white: [], black: [] }
    };
}

// Game state
let gameState = createInitialGameState();

// Connected players
let connectedPlayers = {};
let playerCount = 0;

// Socket connection handling
io.on('connection', (socket) => {
    playerCount++;
    console.log(`Player connected: ${socket.id} (Total players: ${playerCount})`);
    
    // Assign player color
    connectedPlayers[socket.id] = {
        id: socket.id,
        color: Object.keys(connectedPlayers).length % 2 === 0 ? 'white' : 'black',
        joinedAt: new Date()
    };
    
    // Send current game state to new player
    socket.emit('gameState', gameState);
    socket.emit('playerAssigned', connectedPlayers[socket.id]);
    
    // Broadcast player count
    io.emit('playerCount', playerCount);
    
    // Handle move attempt
    socket.on('makeMove', (moveData) => {
        try {
            const { from, to } = moveData;
            const playerColor = connectedPlayers[socket.id]?.color;
            
            // Validate it's the player's turn
            if (playerColor !== gameState.currentPlayer) {
                socket.emit('invalidMove', 'Not your turn!');
                return;
            }
            
            // Validate move
            if (isValidMove(from, to, gameState)) {
                // Record the move
                const piece = gameState.board[from.row][from.col];
                const capturedPiece = gameState.board[to.row][to.col];
                
                // Handle capture
                if (capturedPiece !== '.') {
                    const capturedBy = gameState.currentPlayer;
                    gameState.capturedPieces[capturedBy].push(capturedPiece);
                }
                
                // Make the move
                gameState.board[to.row][to.col] = gameState.board[from.row][from.col];
                gameState.board[from.row][from.col] = '.';
                
                // Add to move history
                gameState.moveHistory.push({
                    from,
                    to,
                    piece,
                    capturedPiece,
                    player: gameState.currentPlayer,
                    timestamp: new Date()
                });
                
                // Check for game over conditions
                if (isCheckmate(gameState)) {
                    gameState.gameOver = true;
                    gameState.winner = gameState.currentPlayer;
                    console.log(`Game Over! ${gameState.winner} wins by checkmate!`);
                } else if (isStalemate(gameState)) {
                    gameState.gameOver = true;
                    gameState.winner = 'draw';
                    console.log('Game Over! Stalemate - Draw!');
                }
                
                // Switch players
                if (!gameState.gameOver) {
                    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
                }
                
                // Broadcast the updated game state
                io.emit('gameState', gameState);
                
                console.log(`Move made: ${piece} from (${from.row},${from.col}) to (${to.row},${to.col})`);
                
            } else {
                socket.emit('invalidMove', 'Invalid move - check chess rules!');
            }
        } catch (error) {
            console.error('Error processing move:', error);
            socket.emit('invalidMove', 'Error processing move');
        }
    });
    
    // Handle game reset
    socket.on('resetGame', () => {
        gameState = createInitialGameState();
        io.emit('gameState', gameState);
        console.log('Game reset by player:', socket.id);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        playerCount--;
        delete connectedPlayers[socket.id];
        io.emit('playerCount', playerCount);
        console.log(`Player disconnected: ${socket.id} (Total players: ${playerCount})`);
    });
});

// Enhanced move validation
function isValidMove(from, to, gameState) {
    // Basic boundary checks
    if (to.row < 0 || to.row > 7 || to.col < 0 || to.col > 7) {
        return false;
    }
    
    const piece = gameState.board[from.row][from.col];
    const targetPiece = gameState.board[to.row][to.col];
    
    // Check if there's a piece to move
    if (piece === '.') {
        return false;
    }
    
    // Check if it's the right player's turn
    const isWhitePiece = piece === piece.toUpperCase();
    const isWhiteTurn = gameState.currentPlayer === 'white';
    
    if (isWhitePiece !== isWhiteTurn) {
        return false;
    }
    
    // Can't capture own pieces
    if (targetPiece !== '.') {
        const isTargetWhite = targetPiece === targetPiece.toUpperCase();
        if (isWhitePiece === isTargetWhite) {
            return false;
        }
    }
    
    // Can't move to same square
    if (from.row === to.row && from.col === to.col) {
        return false;
    }
    
    // Piece-specific movement validation
    return isValidPieceMove(piece.toLowerCase(), from, to, gameState.board, isWhitePiece);
}

// Validate piece-specific moves
function isValidPieceMove(pieceType, from, to, board, isWhite) {
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    const absRowDiff = Math.abs(rowDiff);
    const absColDiff = Math.abs(colDiff);
    
    switch (pieceType) {
        case 'p': // Pawn
            const direction = isWhite ? -1 : 1;
            const startRow = isWhite ? 6 : 1;
            
            // Forward move
            if (colDiff === 0) {
                if (rowDiff === direction && board[to.row][to.col] === '.') {
                    return true;
                }
                // Double move from start
                if (from.row === startRow && rowDiff === 2 * direction && board[to.row][to.col] === '.') {
                    return true;
                }
            }
            // Diagonal capture
            else if (absColDiff === 1 && rowDiff === direction && board[to.row][to.col] !== '.') {
                return true;
            }
            return false;
            
        case 'r': // Rook
            if (rowDiff === 0 || colDiff === 0) {
                return isPathClear(from, to, board);
            }
            return false;
            
        case 'n': // Knight
            return (absRowDiff === 2 && absColDiff === 1) || (absRowDiff === 1 && absColDiff === 2);
            
        case 'b': // Bishop
            if (absRowDiff === absColDiff) {
                return isPathClear(from, to, board);
            }
            return false;
            
        case 'q': // Queen
            if (rowDiff === 0 || colDiff === 0 || absRowDiff === absColDiff) {
                return isPathClear(from, to, board);
            }
            return false;
            
        case 'k': // King
            return absRowDiff <= 1 && absColDiff <= 1;
            
        default:
            return false;
    }
}

// Check if path is clear for sliding pieces
function isPathClear(from, to, board) {
    const rowStep = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
    const colStep = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;
    
    let currentRow = from.row + rowStep;
    let currentCol = from.col + colStep;
    
    while (currentRow !== to.row || currentCol !== to.col) {
        if (board[currentRow][currentCol] !== '.') {
            return false;
        }
        currentRow += rowStep;
        currentCol += colStep;
    }
    
    return true;
}

// Simple checkmate detection (basic implementation)
function isCheckmate(gameState) {
    // This is a simplified version - a full implementation would be much more complex
    // For now, we'll just check if the king has been captured
    const enemyColor = gameState.currentPlayer === 'white' ? 'black' : 'white';
    const kingSymbol = enemyColor === 'white' ? 'K' : 'k';
    
    // Check if enemy king is still on the board
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (gameState.board[row][col] === kingSymbol) {
                return false; // King still exists, not checkmate
            }
        }
    }
    
    return true; // King captured = checkmate
}

// Simple stalemate detection
function isStalemate(gameState) {
    // Simplified stalemate detection
    // In a real chess game, this would be much more complex
    return false;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Chess Game Server running on port ${PORT}`);
    console.log(`🌐 Access the game at: http://localhost:${PORT}`);
    console.log(`📊 Server started at: ${new Date().toLocaleString()}`);
});
