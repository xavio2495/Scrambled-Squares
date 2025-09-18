import { GameGrid } from "../shared/types/api";
import { PreGame, GameBoard, PostGame } from "./components/GameComponents";

class GameManager {
    private container: HTMLElement;
    private currentComponent: PreGame | GameBoard | PostGame | null = null;

    constructor() {
        this.container = document.getElementById("game-container") as HTMLElement;
        if (!this.container) {
            throw new Error("Game container not found");
        }
        void this.initialize();
    }

    private async initialize() {
        try {
            // Fetch daily grid
            const response = await fetch("/api/daily-grid");
            if (!response.ok) {
                const errorMessage = response.status === 404 
                    ? "Today's puzzle is not yet available. Please try again in a few minutes."
                    : `Server error (${response.status}). Please try again later.`;
                throw new Error(errorMessage);
            }

            let gridData: GameGrid;
            try {
                gridData = await response.json();
            } catch (e) {
                throw new Error("Invalid game data received. Please refresh the page.");
            }

            if (!gridData.grid || !Array.isArray(gridData.grid) || gridData.grid.length !== 4) {
                throw new Error("Invalid grid format. Please contact support.");
            }
            
            // Start with PreGame component
            this.showPreGame(gridData);
        } catch (error) {
            console.error("Failed to initialize game:", error);
            this.showError(error instanceof Error ? error.message : "An unexpected error occurred.");
        }
    }

    private showPreGame(gridData: GameGrid) {
        try {
            const preGame = new PreGame(gridData);
            this.replaceComponent(preGame);

            preGame.onStart(() => {
                this.startGame(gridData);
            });
        } catch (error) {
            console.error("Failed to show pre-game screen:", error);
            this.showError("Failed to setup game screen. Please refresh the page.");
        }
    }

    private startGame(gridData: GameGrid) {
        try {
            const gameBoard = new GameBoard(gridData);
            this.replaceComponent(gameBoard);

            gameBoard.startTimer(() => {
                this.endGame({
                    score: gameBoard.getScore(),
                    foundWords: gameBoard.getFoundWords(),
                    dailyId: gridData.dailyId,
                    timeElapsed: 60
                });
            });
        } catch (error) {
            console.error("Failed to start game:", error);
            this.showError("Failed to start game. Please refresh and try again.");
        }
    }

    private endGame(results: { 
        score: number; 
        foundWords: string[]; 
        dailyId: string;
        timeElapsed: number;
    }) {
        try {
            const postGame = new PostGame(results);
            this.replaceComponent(postGame);

            postGame.onPlayAgain(() => {
                void this.initialize();
            });
        } catch (error) {
            console.error("Failed to end game:", error);
            this.showError("Failed to save game results. Please take a screenshot of your score.");
        }
    }

    private replaceComponent(component: PreGame | GameBoard | PostGame) {
        try {
            // Remove old component if exists
            if (this.currentComponent) {
                const oldElement = this.container.querySelector('.pre-game, .game-board, .post-game');
                if (oldElement) {
                    this.container.removeChild(oldElement);
                }
            }

            // Add new component
            this.currentComponent = component;
            this.container.appendChild(component.render());
        } catch (error) {
            console.error("Failed to switch game components:", error);
            this.showError("Failed to update game screen. Please refresh the page.");
        }
    }

    private showError(message: string) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'game-error';
        errorDiv.textContent = message;
        
        // Clear container
        this.container.innerHTML = '';
        this.container.appendChild(errorDiv);

        // Add retry button
        const retryButton = document.createElement('button');
        retryButton.className = 'retry-button';
        retryButton.textContent = 'Try Again';
        retryButton.onclick = () => {
            void this.initialize();
        };
        this.container.appendChild(retryButton);
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new GameManager();
});

// Handle service worker if needed
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('SW registered:', registration);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    });
}
