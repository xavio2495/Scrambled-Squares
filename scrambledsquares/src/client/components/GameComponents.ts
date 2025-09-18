import { 
    GameGrid, 
    GameState, 
    GridPosition,
    ValidateWordRequest,
    ValidateWordResponse,
    SubmitScoreRequest,
    SubmitScoreResponse,
    DailyLeaderboard
} from '../../shared/types/api';

// Shared interfaces
interface GameComponentBase {
    render(): HTMLElement;
}

interface GameResults {
    score: number;
    foundWords: string[];
    rank?: number;
    isPersonalBest?: boolean;
    dailyId: string;
    timeElapsed: number;
}

// Shared utilities
class ComponentUtils {
    static sanitizeHTML(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    static showError(container: HTMLElement, message: string, duration: number = 3000) {
        const errorElement = document.createElement('div');
        errorElement.className = 'game-error';
        errorElement.textContent = message;
        container.appendChild(errorElement);

        setTimeout(() => {
            errorElement.classList.add('fade-out');
            setTimeout(() => {
                container.removeChild(errorElement);
            }, 300);
        }, duration);
    }

    static async retryFetch<T>(
        url: string, 
        options: RequestInit, 
        retries: number = 2,
        delay: number = 1000
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json() as T;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error('Failed to fetch after retries');
    }
}

// PreGame Component
export class PreGame implements GameComponentBase {
    private container: HTMLDivElement;
    private gridData: GameGrid;
    private onStartCallback?: () => void;

    constructor(gridData: GameGrid) {
        this.container = document.createElement('div');
        this.container.className = 'pre-game';
        this.gridData = gridData;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        const startButton = document.createElement('button');
        startButton.className = 'start-button';
        startButton.textContent = 'Start Game';
        startButton.addEventListener('click', () => {
            if (this.onStartCallback) {
                this.onStartCallback();
            }
        });
        this.container.appendChild(startButton);
    }

    onStart(callback: () => void) {
        this.onStartCallback = callback;
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="preview-grid">
                <div class="grid-wrapper">
                    ${this.gridData.grid.map((row, rowIndex) => `
                        <div class="row">
                            ${row.map((letter, colIndex) => `
                                <div class="cell preview" data-row="${rowIndex}" data-col="${colIndex}">
                                    ${ComponentUtils.sanitizeHTML(letter)}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                <button class="start-button">Start Game</button>
            </div>
        `;
        return this.container;
    }
}

// GameBoard Component
export class GameBoard implements GameComponentBase {
    private container: HTMLDivElement;
    private gridData: GameGrid;
    private state: GameState;
    private timerInterval: number | null = null;
    private selectedCells: GridPosition[] = [];
    private currentWord: string = '';
    private isValidating = false;
    private soundCache: Map<string, HTMLAudioElement> = new Map();

    constructor(gridData: GameGrid) {
        this.container = document.createElement('div');
        this.container.className = 'game-board';
        this.gridData = gridData;
        
        if (!gridData.grid || !Array.isArray(gridData.grid) || gridData.grid.length !== 4) {
            throw new Error('Invalid grid data received');
        }

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

        type TouchHandler = (event: MouseEvent | TouchEvent) => void;

        const handleTouchStart: TouchHandler = (event) => {
            if (!this.state.isActive || this.isValidating) return;
            
            isSelecting = true;
            this.selectedCells = [];
            this.currentWord = '';
            
            // Handle initial cell selection
            const cell = this.findCellFromEvent(event);
            if (cell) {
                this.addCell(cell);
            }
            
            this.updateUI();
            event.preventDefault();
        };

        const handleTouchMove: TouchHandler = (event) => {
            if (!isSelecting || !this.state.isActive || this.isValidating) return;

            const cell = this.findCellFromEvent(event);
            if (cell && this.isValidNextCell(cell)) {
                this.addCell(cell);
                this.updateUI();
            }

            event.preventDefault();
        };

        const handleTouchEnd: TouchHandler = async (event) => {
            if (!isSelecting || !this.state.isActive) return;
            isSelecting = false;

            if (this.currentWord.length >= 3) {
                this.isValidating = true;
                this.updateUI();

                try {
                    await this.validateWord(this.currentWord);
                } finally {
                    this.isValidating = false;
                }
            }

            this.selectedCells = [];
            this.currentWord = '';
            this.updateUI();
            event.preventDefault();
        };

        this.container.addEventListener('mousedown', handleTouchStart);
        this.container.addEventListener('mousemove', handleTouchMove);
        this.container.addEventListener('mouseup', handleTouchEnd);
        this.container.addEventListener('touchstart', handleTouchStart);
        this.container.addEventListener('touchmove', handleTouchMove);
        this.container.addEventListener('touchend', handleTouchEnd);
    }

    private findCellFromEvent(event: TouchEvent | MouseEvent): GridPosition | null {
        let targetElement: Element | null;
        
        if (event instanceof TouchEvent) {
            const touch = event.touches[0];
            if (!touch) return null;
            targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        } else {
            targetElement = event.target as Element;
        }

        if (!targetElement) return null;

        const cell = targetElement.closest('.cell');
        if (!(cell instanceof HTMLElement)) return null;

        const row = parseInt(cell.getAttribute('data-row') ?? '-1');
        const col = parseInt(cell.getAttribute('data-col') ?? '-1');
        
        if (row >= 0 && row < 4 && col >= 0 && col < 4) {
            return { row, col };
        }
        return null;
    }

    private isValidNextCell(cell: GridPosition): boolean {
        if (this.selectedCells.length === 0) return true;
        
        const lastCell = this.selectedCells[this.selectedCells.length - 1];
        if (!lastCell) return true;
        
        const rowDiff = Math.abs(cell.row - lastCell.row);
        const colDiff = Math.abs(cell.col - lastCell.col);
        
        return rowDiff <= 1 && colDiff <= 1 && 
               !(cell.row === lastCell.row && cell.col === lastCell.col) &&
               !this.selectedCells.some(c => c.row === cell.row && c.col === cell.col);
    }

    private addCell(cell: GridPosition) {
        const gridCell = this.state.grid[cell.row]?.[cell.col];
        if (!gridCell) return;

        this.selectedCells.push({ ...cell });
        this.currentWord += gridCell;
    }

    private async validateWord(word: string) {
        let retries = 2;
        
        while (retries > 0) {
            try {
                const result = await ComponentUtils.retryFetch<ValidateWordResponse>(
                    '/api/validate-word',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            word,
                            dailyId: this.gridData.dailyId,
                            path: this.selectedCells
                        } as ValidateWordRequest)
                    }
                );

                if (result.isValid) {
                    if (!this.state.foundWords.includes(word)) {
                        this.state.foundWords.push(word);
                        this.state.score += result.score;
                        void this.playSound('success');
                    } else {
                        ComponentUtils.showError(this.container, 'Word already found!');
                        void this.playSound('error');
                    }
                } else {
                    if (result.message) {
                        ComponentUtils.showError(this.container, result.message);
                    }
                    void this.playSound('error');
                }
                this.updateUI();
                break;

            } catch (error) {
                console.error('Error validating word:', error);
                retries--;
                
                if (retries === 0) {
                    ComponentUtils.showError(this.container, 'Network error. Please try again.');
                    void this.playSound('error');
                }
            }
        }
    }

    private async playSound(type: 'success' | 'error') {
        try {
            let audio = this.soundCache.get(type);
            
            if (!audio) {
                audio = new Audio(`/sounds/${type}.mp3`);
                this.soundCache.set(type, audio);
                
                try {
                    await audio.load();
                } catch (e) {
                    console.warn(`Failed to preload ${type} sound:`, e);
                    return;
                }
            }

            audio.currentTime = 0;
            await audio.play();
        } catch (error) {
            console.warn(`Failed to play ${type} sound:`, error);
        }
    }

    private updateUI() {
        this.container.className = `game-board${this.isValidating ? ' validating' : ''}`;

        const timerElement = this.container.querySelector('.timer');
        if (timerElement instanceof HTMLElement) {
            timerElement.textContent = this.state.timeRemaining.toString();
        }

        const cells = this.container.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('selected', 'validating');
        });
        
        this.selectedCells.forEach(({ row, col }) => {
            const cell = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (cell instanceof HTMLElement) {
                cell.classList.add('selected');
                if (this.isValidating) {
                    cell.classList.add('validating');
                }
            }
        });

        const wordDisplay = this.container.querySelector('.current-word');
        if (wordDisplay instanceof HTMLElement) {
            wordDisplay.textContent = this.currentWord;
            wordDisplay.classList.toggle('validating', this.isValidating);
        }

        const scoreDisplay = this.container.querySelector('.score');
        if (scoreDisplay instanceof HTMLElement) {
            scoreDisplay.textContent = `Score: ${this.state.score}`;
        }

        const foundWordsElement = this.container.querySelector('.found-words');
        if (foundWordsElement instanceof HTMLElement) {
            foundWordsElement.innerHTML = this.state.foundWords
                .map(word => `<span class="word">${ComponentUtils.sanitizeHTML(word)}</span>`)
                .join('');
        }
    }

    startTimer(onTimeUp: () => void) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.state.timeRemaining = 60;
        this.updateUI();

        this.timerInterval = window.setInterval(() => {
            if (this.state.timeRemaining <= 0) {
                void this.endGame(onTimeUp);
                return;
            }

            this.state.timeRemaining--;
            this.updateUI();

            if (this.state.timeRemaining === 10) {
                this.container.classList.add('time-warning');
            }
        }, 1000);
    }

    private async endGame(onTimeUp?: () => void) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.state.isActive = false;
        this.updateUI();

        try {
            const result = await ComponentUtils.retryFetch<SubmitScoreResponse>(
                '/api/submit-score',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        score: this.state.score,
                        dailyId: this.gridData.dailyId,
                        foundWords: this.state.foundWords,
                        timeElapsed: 60 - this.state.timeRemaining
                    } as SubmitScoreRequest)
                }
            );
            
            const event = new CustomEvent('gameEnd', {
                detail: {
                    score: this.state.score,
                    words: this.state.foundWords,
                    rank: result.rank,
                    isPersonalBest: result.isPersonalBest
                }
            });
            this.container.dispatchEvent(event);
            
        } catch (error) {
            console.error('Error submitting score:', error);
            ComponentUtils.showError(this.container, 'Failed to submit score. Your progress will be lost.');
        } finally {
            if (onTimeUp) onTimeUp();
        }
    }

    getScore(): number {
        return this.state.score;
    }

    getFoundWords(): string[] {
        return [...this.state.foundWords];
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="game-header">
                <div class="timer">${this.state.timeRemaining}</div>
                <div class="score">Score: ${this.state.score}</div>
            </div>
            <div class="grid">
                ${this.state.grid.map((row, rowIndex) => `
                    <div class="row">
                        ${row.map((letter, colIndex) => `
                            <div class="cell" data-row="${rowIndex}" data-col="${colIndex}">
                                ${ComponentUtils.sanitizeHTML(letter)}
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="current-word"></div>
            <div class="found-words">
                ${this.state.foundWords.map(word => `
                    <span class="word">${ComponentUtils.sanitizeHTML(word)}</span>
                `).join('')}
            </div>
        `;
        return this.container;
    }
}

// PostGame Component
export class PostGame implements GameComponentBase {
    private container: HTMLDivElement;
    private results: GameResults;
    private leaderboard: DailyLeaderboard | null = null;

    constructor(results: GameResults) {
        this.container = document.createElement('div');
        this.container.className = 'post-game';
        this.results = results;
        void this.loadLeaderboard();
    }

    private async loadLeaderboard() {
        try {
            this.leaderboard = await ComponentUtils.retryFetch<DailyLeaderboard>(
                `/api/leaderboard/${this.results.dailyId}`,
                { method: 'GET' }
            );
            this.updateUI();
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            ComponentUtils.showError(this.container, 'Failed to load leaderboard');
        }
    }

    private async submitScore() {
        const submitButton = this.container.querySelector('#submitScore') as HTMLButtonElement;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Submitting...';
        }

        try {
            const result = await ComponentUtils.retryFetch<SubmitScoreResponse>(
                '/api/submit-score',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        score: this.results.score,
                        dailyId: this.results.dailyId,
                        foundWords: this.results.foundWords,
                        timeElapsed: this.results.timeElapsed
                    } as SubmitScoreRequest)
                }
            );

            const resultElement = this.container.querySelector('.submission-result');
            if (resultElement instanceof HTMLElement) {
                if (result.isPersonalBest) {
                    resultElement.textContent = '🎉 New Personal Best! ' + 
                        (result.rank ? `Ranked #${result.rank} on the leaderboard!` : '');
                } else if (result.rank) {
                    resultElement.textContent = `Ranked #${result.rank} on the leaderboard!`;
                }
            }

            void this.loadLeaderboard(); // Refresh leaderboard
        } catch (error) {
            console.error('Error submitting score:', error);
            ComponentUtils.showError(this.container, 'Failed to submit score');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Score';
            }
        }
    }

    private generateShareText(): string {
        const { score, foundWords, rank } = this.results;
        let text = `🎯 Scrambled Squares Score: ${score}\n` +
                  `📝 Words Found: ${foundWords.length}\n`;
        
        if (rank) {
            text += `🏆 Rank: #${rank}\n`;
        }
        
        if (this.leaderboard?.topScore) {
            text += `📊 Today's Top Score: ${this.leaderboard.topScore}\n`;
        }
        
        text += `🎮 Play now on Reddit!`;
        return text;
    }

    private updateUI() {
        this.render();
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="results">
                <h2>Time's Up!</h2>
                <div class="final-score">Score: ${this.results.score}</div>
                <div class="words-found">
                    <h3>Words Found (${this.results.foundWords.length}):</h3>
                    <div class="word-list">
                        ${this.results.foundWords.map(word => `
                            <span class="word">${ComponentUtils.sanitizeHTML(word)}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="submission-result"></div>
                ${this.leaderboard ? `
                    <div class="leaderboard">
                        <h3>Today's Leaderboard</h3>
                        <div class="leaderboard-entries">
                            ${this.leaderboard.entries.slice(0, 5).map((entry, index) => `
                                <div class="leaderboard-entry">
                                    <span class="rank">#${index + 1}</span>
                                    <span class="username">${ComponentUtils.sanitizeHTML(entry.username)}</span>
                                    <span class="score">${entry.score}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="actions">
                    <button id="submitScore" class="primary-button">Submit Score</button>
                    <button id="shareScore" class="primary-button">Share Score</button>
                    <button id="playAgain" class="secondary-button">Play Again</button>
                </div>
            </div>
        `;

        const submitButton = this.container.querySelector('#submitScore');
        const shareButton = this.container.querySelector('#shareScore');

        if (submitButton instanceof HTMLElement) {
            submitButton.addEventListener('click', () => void this.submitScore());
        }

        if (shareButton instanceof HTMLElement) {
            shareButton.addEventListener('click', () => {
                const shareText = this.generateShareText();
                void navigator.clipboard.writeText(shareText)
                    .then(() => ComponentUtils.showError(this.container, 'Score copied to clipboard!', 2000))
                    .catch(err => {
                        console.error('Failed to copy:', err);
                        ComponentUtils.showError(this.container, 'Failed to copy score');
                    });
            });
        }

        return this.container;
    }

    onPlayAgain(callback: () => void) {
        const playAgainButton = this.container.querySelector('#playAgain');
        if (playAgainButton instanceof HTMLElement) {
            playAgainButton.addEventListener('click', callback);
        }
    }
}