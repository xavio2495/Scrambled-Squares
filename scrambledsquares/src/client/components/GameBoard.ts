import { 
    GameGrid, 
    GameState, 
    GridPosition,
    ValidateWordRequest,
    ValidateWordResponse
} from '../../shared/types/api';

export class GameBoard {
    private container: HTMLDivElement;
    private gridData: GameGrid;
    private state: GameState;
    private timerInterval: number | null = null;
    private selectedCells: GridPosition[] = [];
    private currentWord: string = '';

    constructor(gridData: GameGrid) {
        this.container = document.createElement('div');
        this.container.className = 'game-board';
        this.gridData = gridData;
        this.state = {
            isActive: true,
            timeRemaining: 60,
            score: 0,
            foundWords: [],
            grid: gridData.grid
        };
        this.setupEventListeners();
    }

    private setupEventListeners() {
        let isSelecting = false;

        const handleTouchStart = () => {
            isSelecting = true;
            this.selectedCells = [];
            this.currentWord = '';
            this.updateUI();
        };

        const handleTouchMove = (event: TouchEvent | MouseEvent) => {
            if (!isSelecting) return;

            const cell = this.findCellFromEvent(event);
            if (cell && this.isValidNextCell(cell)) {
                this.addCell(cell);
                this.updateUI();
            }
        };

        const handleTouchEnd = () => {
            if (!isSelecting) return;
            isSelecting = false;

            if (this.currentWord.length >= 3) {
                this.validateWord(this.currentWord);
            }

            this.selectedCells = [];
            this.currentWord = '';
            this.updateUI();
        };

        this.container.addEventListener('mousedown', handleTouchStart);
        this.container.addEventListener('mousemove', handleTouchMove);
        this.container.addEventListener('mouseup', handleTouchEnd);
        this.container.addEventListener('touchstart', handleTouchStart);
        this.container.addEventListener('touchmove', handleTouchMove);
        this.container.addEventListener('touchend', handleTouchEnd);
    }

    private findCellFromEvent(event: TouchEvent | MouseEvent): { row: number; col: number } | null {
        const target = (event instanceof TouchEvent && event.touches[0]
            ? document.elementFromPoint(event.touches[0].clientX, event.touches[0].clientY)
            : event.target) as HTMLElement;

        const cell = target?.closest('.cell');
        if (!cell) return null;

        const row = parseInt(cell.getAttribute('data-row') || '-1');
        const col = parseInt(cell.getAttribute('data-col') || '-1');
        
        if (row >= 0 && col >= 0) {
            return { row, col };
        }
        return null;
    }

    private isValidNextCell(cell: { row: number; col: number }): boolean {
        if (this.selectedCells.length === 0) return true;
        
        const lastCell = this.selectedCells[this.selectedCells.length - 1];
        if (!lastCell) return true;
        
        const rowDiff = Math.abs(cell.row - lastCell.row);
        const colDiff = Math.abs(cell.col - lastCell.col);
        
        return rowDiff <= 1 && colDiff <= 1 && 
               !(cell.row === lastCell.row && cell.col === lastCell.col) &&
               !this.selectedCells.some(c => c.row === cell.row && c.col === cell.col);
    }

    private addCell(cell: { row: number; col: number }) {
        this.selectedCells.push(cell);
        const letter = this.grid[cell.row]?.[cell.col];
        if (letter) {
            this.currentWord += letter;
        }
    }

    private async validateWord(word: string) {
        try {
            const response = await fetch('/api/validate-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word,
                    dailyId: this.gridData.dailyId,
                    path: this.selectedCells
                } as ValidateWordRequest)
            });

            if (!response.ok) throw new Error('Network error');
            
            const result = await response.json() as ValidateWordResponse;
            if (result.isValid && !this.state.foundWords.includes(word)) {
                this.state.foundWords.push(word);
                this.state.score += result.score;
                this.playSound('success');
            } else {
                this.playSound('error');
            }
            this.updateUI();
        } catch (error) {
            console.error('Error validating word:', error);
        }
    }

    private async playSound(type: 'success' | 'error') {
        const audio = new Audio(`/sounds/${type}.mp3`);
        try {
            await audio.play();
        } catch (error) {
            console.warn(`Failed to play ${type} sound:`, error);
        }
    }

    startTimer(onTimeUp: () => void) {
        this.timerInterval = window.setInterval(() => {
            this.state.timeRemaining--;
            this.updateUI();
            if (this.state.timeRemaining <= 0) {
                this.endGame(onTimeUp);
            }
        }, 1000);
    }

    private async endGame(onTimeUp?: () => void) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        try {
            // Submit final score
            const response = await fetch('/api/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    score: this.state.score,
                    dailyId: this.gridData.dailyId,
                    foundWords: this.state.foundWords,
                    timeElapsed: 60 - this.state.timeRemaining
                })
            });

            const result = await response.json();
            
            // Dispatch game end event with results
            const event = new CustomEvent('gameEnd', {
                detail: {
                    score: this.state.score,
                    words: this.state.foundWords,
                    rank: result.rank,
                    isPersonalBest: result.isPersonalBest
                }
            });
            this.container.dispatchEvent(event);
            
            if (onTimeUp) onTimeUp();
        } catch (error) {
            console.error('Error submitting score:', error);
        }
    }

    private updateUI() {
        // Update timer
        const timerElement = this.container.querySelector('.timer');
        if (timerElement) {
            timerElement.textContent = this.state.timeRemaining.toString();
        }

        // Update selected cells
        const cells = this.container.querySelectorAll('.cell');
        cells.forEach(cell => cell.classList.remove('selected'));
        
        this.selectedCells.forEach(({ row, col }) => {
            const cell = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            cell?.classList.add('selected');
        });

        // Update current word
        const wordDisplay = this.container.querySelector('.current-word');
        if (wordDisplay) {
            wordDisplay.textContent = this.currentWord;
        }

        // Update score
        const scoreDisplay = this.container.querySelector('.score');
        if (scoreDisplay) {
            scoreDisplay.textContent = `Score: ${this.state.score}`;
        }

        // Update found words
        const foundWordsElement = this.container.querySelector('.found-words');
        if (foundWordsElement) {
            foundWordsElement.innerHTML = this.state.foundWords
                .map(word => `<span class="word">${word}</span>`)
                .join('');
        }
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="game-header">
                <div class="timer">${this.state.timeRemaining}</div>
                <div class="score">Score: ${this.state.score}</div>
            </div>
            <div class="grid">
                ${this.state.grid.map((row: string[], rowIndex: number) => `
                    <div class="row">
                        ${row.map((letter: string, colIndex: number) => `
                            <div class="cell" data-row="${rowIndex}" data-col="${colIndex}">
                                ${letter}
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="current-word"></div>
            <div class="found-words">
                ${this.state.foundWords.map((word: string) => `
                    <span class="word">${word}</span>
                `).join('')}
            </div>
        `;

        return this.container;
    }

    getScore(): number {
        return this.state.score;
    }

    getFoundWords(): string[] {
        return [...this.state.foundWords];
    }
}