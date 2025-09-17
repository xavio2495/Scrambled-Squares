import { GameGrid } from '../../shared/types/api';

export class PreGame {
    private container: HTMLDivElement;
    private gridData: GameGrid;

    constructor(gridData: GameGrid) {
        this.container = document.createElement('div');
        this.container.className = 'pre-game';
        this.gridData = gridData;
    }

    render(): HTMLElement {
        this.container.innerHTML = `
            <div class="game-preview">
                <div class="grid">
                    ${this.gridData.grid.map((row: string[]) => `
                        <div class="row">
                            ${row.map((letter: string) => `
                                <div class="cell">${letter}</div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                <div class="daily-info">
                    <span class="daily-id">Puzzle #${this.gridData.dailyId}</span>
                    <span class="daily-date">${new Date(this.gridData.date).toLocaleDateString()}</span>
                </div>
                <button class="start-button" id="startGame">Start Game</button>
            </div>
        `;

        return this.container;
    }

    onStart(callback: () => void) {
        const startButton = this.container.querySelector('#startGame');
        if (startButton) {
            startButton.addEventListener('click', callback);
        }
    }
}