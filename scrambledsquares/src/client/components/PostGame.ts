import { 
    SubmitScoreRequest,
    SubmitScoreResponse,
    DailyLeaderboard
} from '../../shared/types/api';

interface GameResults {
    score: number;
    foundWords: string[];
    rank?: number;
    isPersonalBest?: boolean;
    dailyId: string;
    timeElapsed: number;
}

export class PostGame {
    private container: HTMLDivElement;
    private results: GameResults;
    private leaderboard: DailyLeaderboard | null = null;

    constructor(results: GameResults) {
        this.container = document.createElement('div');
        this.container.className = 'post-game';
        this.results = results;
        this.loadLeaderboard();
    }

    private async loadLeaderboard() {
        try {
            const response = await fetch(`/api/leaderboard/${this.results.dailyId}`);
            if (!response.ok) throw new Error('Failed to load leaderboard');
            this.leaderboard = await response.json();
            this.updateUI();
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        }
    }

    private async submitScore() {
        try {
            const request: SubmitScoreRequest = {
                score: this.results.score,
                dailyId: this.results.dailyId,
                foundWords: this.results.foundWords,
                timeElapsed: this.results.timeElapsed
            };

            const response = await fetch('/api/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) throw new Error('Failed to submit score');
            const data: SubmitScoreResponse = await response.json();
            
            // Update UI based on submission result
            const resultElement = this.container.querySelector('.submission-result');
            if (resultElement) {
                if (data.isPersonalBest) {
                    resultElement.textContent = '🎉 New Personal Best! ' + 
                        (data.rank ? `Ranked #${data.rank} on the leaderboard!` : '');
                } else if (data.rank) {
                    resultElement.textContent = `Ranked #${data.rank} on the leaderboard!`;
                }
            }
        } catch (error) {
            console.error('Error submitting score:', error);
        }
    }

    private generateShareText(): string {
        const { score, foundWords, rank } = this.results;
        let text = `🎯 Scrambled Squares Score: ${score}\n` +
                  `📝 Words Found: ${foundWords.length}\n`;
        
        if (rank) {
            text += `🏆 Rank: #${rank}\n`;
        }
        
        if (this.leaderboard) {
            text += `📊 Today's Top Score: ${this.leaderboard.topScore}\n`;
        }
        
        text += `🎮 Play now on Reddit!`;
        return text;
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="results">
                <h2>Time's Up!</h2>
                <div class="final-score">Score: ${this.score}</div>
                <div class="words-found">
                    <h3>Words Found (${this.foundWords.length}):</h3>
                    <div class="word-list">
                        ${this.foundWords.map(word => `
                            <span class="word">${word}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="submission-result"></div>
                <div class="actions">
                    <button id="submitScore">Submit Score</button>
                    <button id="shareScore">Share Score</button>
                    <button id="playAgain">Play Again</button>
                </div>
            </div>
        `;

        // Add event listeners
        const submitButton = this.container.querySelector('#submitScore');
        const shareButton = this.container.querySelector('#shareScore');
        const playAgainButton = this.container.querySelector('#playAgain');

        submitButton?.addEventListener('click', () => this.submitScore());
        shareButton?.addEventListener('click', () => {
            const shareText = this.generateShareText();
            // Use Reddit's native share functionality or copy to clipboard
            navigator.clipboard.writeText(shareText)
                .then(() => alert('Score copied to clipboard!'))
                .catch(err => console.error('Failed to copy:', err));
        });

        return this.container;
    }

    onPlayAgain(callback: () => void) {
        const playAgainButton = this.container.querySelector('#playAgain');
        if (playAgainButton) {
            playAgainButton.addEventListener('click', callback);
        }
    }
}