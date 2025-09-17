import { GameGrid, GameState } from "../shared/types/api";
import { PreGame } from "./components/PreGame";
import { GameBoard } from "./components/GameBoard";
import { PostGame } from "./components/PostGame";

class GameManager {
  private container: HTMLElement;
  private gameState: GameState | null = null;
  private currentComponent: PreGame | GameBoard | PostGame | null = null;

  constructor() {
    this.container = document.getElementById("game-container") as HTMLElement;
    if (!this.container) {
      throw new Error("Game container not found");
    }
    this.initialize();
  }

  private async initialize() {
    try {
      // Fetch daily grid
      const response = await fetch("/api/daily-grid");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const gridData = await response.json() as GameGrid;
      
      // Start with PreGame component
      this.showPreGame(gridData);
    } catch (error) {
      console.error("Failed to initialize game:", error);
      this.showError("Failed to load game. Please try again later.");
    }
  }

  private showPreGame(gridData: GameGrid) {
    const preGame = new PreGame(gridData);
    this.replaceComponent(preGame);

    // Handle game start
    preGame.onStart(() => {
      this.startGame(gridData);
    });
  }

  private startGame(gridData: GameGrid) {
    const gameBoard = new GameBoard(gridData);
    this.replaceComponent(gameBoard);

    // Start the timer
    gameBoard.startTimer(() => {
      this.endGame(gameBoard.getScore(), gameBoard.getFoundWords());
    });
  }

  private endGame(score: number, foundWords: string[]) {
    const postGame = new PostGame({
      score,
      foundWords,
      dailyId: this.gameState?.dailyId || '',
      timeElapsed: 60
    });
    this.replaceComponent(postGame);
  }

  private replaceComponent(component: PreGame | GameBoard | PostGame) {
    // Remove old component if exists
    if (this.currentComponent) {
      this.container.removeChild(this.currentComponent.render());
    }

    // Add new component
    this.currentComponent = component;
    this.container.appendChild(component.render());
  }

  private showError(message: string) {
    this.container.innerHTML = `
      <div class="error-container">
        <div class="error-message">${message}</div>
        <button onclick="window.location.reload()">Try Again</button>
      </div>
    `;
  }
}

// Initialize game manager
try {
  new GameManager();
} catch (error) {
  console.error('Failed to start game:', error);
  document.body.innerHTML = `
    <div class="error-container">
      <div class="error-message">Failed to start game. Please refresh the page.</div>
    </div>
  `;
}
