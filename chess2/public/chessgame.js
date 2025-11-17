// Initialize socket connection
const socket = io();

// Game state
let gameState = null;
let selectedSquare = null;

// Chess piece symbols (using better Unicode symbols)
const pieceSymbols = {
    // White pieces
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    // Black pieces  
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟︎'
};

// Create the chess board
function createBoard() {
    const boardTable = document.getElementById('chessboard');
    boardTable.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        const tr = document.createElement('tr');
        
        for (let col = 0; col < 8; col++) {
            const td = document.createElement('td');
            td.className = 'chess-square ' + ((row + col) % 2 === 0 ? 'light-square' : 'dark-square');
            td.dataset.row = row;
            td.dataset.col = col;
            td.onclick = () => handleSquareClick(row, col);
            td.innerHTML = '&nbsp;';
            
            tr.appendChild(td);
        }
        
        boardTable.appendChild(tr);
    }
    
    console.log('Chess board created successfully');
}

// Handle square click
function handleSquareClick(row, col) {
    console.log(`Clicked square: ${row}, ${col}`);
    
    if (!gameState) {
        showStatus('Game not loaded yet', 'error');
        return;
    }
    
    if (selectedSquare === null) {
        // Select piece
        const piece = gameState.board[row][col];
        if (piece !== '.') {
            const isWhitePiece = piece === piece.toUpperCase();
            const isWhiteTurn = gameState.currentPlayer === 'white';
            
            if (isWhitePiece === isWhiteTurn) {
                selectedSquare = { row, col };
                highlightSquare(row, col);
                showStatus('Piece selected. Click destination.', 'success');
            } else {
                showStatus('Not your turn!', 'error');
            }
        } else {
            showStatus('No piece on this square', 'error');
        }
    } else {
        // Make move or deselect
        if (selectedSquare.row === row && selectedSquare.col === col) {
            // Deselect
            clearSelection();
            showStatus('');
        } else {
            // Attempt move
            socket.emit('makeMove', { 
                from: selectedSquare, 
                to: { row, col } 
            });
            clearSelection();
        }
    }
}

// Highlight selected square
function highlightSquare(row, col) {
    const square = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (square) {
        square.classList.add('selected');
    }
}

// Clear selection
function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.chess-square').forEach(square => {
        square.classList.remove('selected');
    });
}

// Update board with pieces
function updateBoard() {
    if (!gameState) return;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
            const piece = gameState.board[row][col];
            
            if (square) {
                if (piece === '.') {
                    square.innerHTML = '&nbsp;';
                } else {
                    const pieceSymbol = pieceSymbols[piece] || piece;
                    const isWhitePiece = piece === piece.toUpperCase();
                    const colorClass = isWhitePiece ? 'white-piece' : 'black-piece';
                    
                    square.innerHTML = `<span class="${colorClass}">${pieceSymbol}</span>`;
                }
            }
        }
    }
    
    // Update current player
    document.getElementById('currentPlayer').textContent = 
        gameState.currentPlayer.charAt(0).toUpperCase() + gameState.currentPlayer.slice(1);
}

// Show status message
function showStatus(message, type = '') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.className = 'status ' + type;
}

// Reset game
function resetGame() {
    socket.emit('resetGame');
    clearSelection();
    showStatus('Game reset!', 'success');
}

// Socket event listeners
socket.on('connect', () => {
    console.log('Connected to server');
    showStatus('Connected to server', 'success');
});

socket.on('gameState', (newGameState) => {
    console.log('Received game state:', newGameState);
    gameState = newGameState;
    updateBoard();
    showStatus('');
});

socket.on('invalidMove', (message) => {
    showStatus(message, 'error');
});

socket.on('disconnect', () => {
    showStatus('Disconnected from server', 'error');
});

// Initialize when page loads
window.onload = function() {
    console.log('Page loaded, creating board...');
    createBoard();
    showStatus('Connecting to server...');
};