import { readFile } from 'fs/promises';
import { join } from 'path';
import { GameStorage } from './storage';

// Constants for grid generation
const GRID_SIZE = 4;
const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;
const CONSONANTS = [
    'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
    'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'
] as const;
const MIN_VOWELS = 4;
const MIN_CONSONANTS = 8;

type Letter = typeof VOWELS[number] | typeof CONSONANTS[number];

// Common letter frequencies in English words
const LETTER_FREQUENCIES: Record<Letter, number> = {
    'A': 8.2, 'B': 1.5, 'C': 2.8, 'D': 4.3, 'E': 13, 'F': 2.2, 'G': 2.0, 'H': 6.1,
    'I': 7.0, 'J': 0.15, 'K': 0.77, 'L': 4.0, 'M': 2.4, 'N': 6.7, 'O': 7.5, 'P': 1.9,
    'Q': 0.095, 'R': 6.0, 'S': 6.3, 'T': 9.1, 'U': 2.8, 'V': 0.98, 'W': 2.4, 'X': 0.15,
    'Y': 2.0, 'Z': 0.074
};

export class GridGenerator {
    private static scrabbleWords: Set<string>;

    /**
     * Initialize the dictionary from a file
     */
    static async initialize(): Promise<void> {
        try {
            // Load official Scrabble word list
            const scrabbleData = await readFile(join(__dirname, '../../../data/scrabble.txt'), 'utf-8');
            this.scrabbleWords = new Set(scrabbleData.split('\n').map(word => word.trim().toUpperCase()));
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            throw new Error('Dictionary initialization failed');
        }
    }

    /**
     * Generate a new daily grid with a good distribution of letters
     */
    static generateGrid(): Letter[][] {
        // Initialize grid with default letter
        const grid: Letter[][] = Array.from({ length: GRID_SIZE }, 
            () => Array.from({ length: GRID_SIZE }, () => 'A' as Letter)
        );
        
        // Generate letters with proper distribution
        const letters: Letter[] = [];
        
        // Add minimum required vowels
        for (let i = 0; i < MIN_VOWELS; i++) {
            letters.push(this.weightedRandomChoice(
                VOWELS,
                letter => LETTER_FREQUENCIES[letter]
            ));
        }

        // Add minimum required consonants
        for (let i = 0; i < MIN_CONSONANTS; i++) {
            letters.push(this.weightedRandomChoice(
                CONSONANTS,
                letter => LETTER_FREQUENCIES[letter]
            ));
        }

        // Fill remaining spots randomly based on letter frequencies
        const remainingSpots = (GRID_SIZE * GRID_SIZE) - letters.length;
        const allLetters = [...VOWELS, ...CONSONANTS] as const;
        for (let i = 0; i < remainingSpots; i++) {
            letters.push(this.weightedRandomChoice(
                allLetters,
                letter => LETTER_FREQUENCIES[letter]
            ));
        }

        // Shuffle letters and place in grid
        this.shuffleArray(letters);
        for (let i = 0; i < GRID_SIZE; i++) {
            const row = grid[i];
            if (row) {
                for (let j = 0; j < GRID_SIZE; j++) {
                    const index = i * GRID_SIZE + j;
                    const letter = letters[index];
                    if (letter) {
                        row[j] = letter;
                    }
                }
            }
        }

        return grid;
    }

    /**
     * Find all valid words in a given grid
     */
    static findValidWords(grid: Letter[][]): Set<string> {
        const validWords = new Set<string>();
        const visited = Array(GRID_SIZE).fill(null)
            .map(() => Array(GRID_SIZE).fill(false));

        // Try starting from each cell
        for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
                this.findWordsFromCell(grid, row, col, '', visited, validWords);
            }
        }

        return validWords;
    }

    /**
     * Check if a word exists in the Scrabble dictionary
     */
    static isValidWord(word: string): boolean {
        return this.scrabbleWords.has(word.toUpperCase());
    }

    /**
     * Generate a new daily puzzle and store it in Redis
     */
    static async generateDailyPuzzle(): Promise<void> {
        const grid = this.generateGrid();
        const validWords = this.findValidWords(grid);

        // Regenerate if too few valid words
        if (validWords.size < 10) {
            return this.generateDailyPuzzle();
        }

        // Store in Redis
        await GameStorage.resetDailyData();
        await Promise.all([
            GameStorage.setDailyGrid(grid),
            GameStorage.setDailyWords(validWords)
        ]);
    }

    private static findWordsFromCell(
        grid: Letter[][],
        row: number,
        col: number,
        currentWord: string,
        visited: boolean[][],
        validWords: Set<string>
    ): void {
        if (!grid[row]?.[col] || !visited[row]?.[col]) {
            return;
        }

        // Mark current cell as visited
        visited[row][col] = true;
        currentWord += grid[row][col];

        // Check if current word is valid (minimum 3 letters)
        if (currentWord.length >= 3 && this.isValidWord(currentWord)) {
            validWords.add(currentWord);
        }

        // Check all adjacent cells
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const newRow = row + i;
                const newCol = col + j;

                if (
                    newRow >= 0 && newRow < GRID_SIZE &&
                    newCol >= 0 && newCol < GRID_SIZE &&
                    grid[newRow]?.[newCol] && 
                    visited[newRow]?.[newCol] === false
                ) {
                    this.findWordsFromCell(grid, newRow, newCol, currentWord, visited, validWords);
                }
            }
        }

        // Backtrack
        visited[row][col] = false;
    }

    private static weightedRandomChoice<T extends Letter>(
        items: readonly T[],
        weightFn: (item: T) => number
    ): T {
        const weights = items.map(weightFn);
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < items.length; i++) {
            const weight = weights[i] ?? 0;
            random -= weight;
            if (random <= 0) {
                return items[i] as T;
            }
        }
        
        return items[items.length - 1] as T;
    }

    private static shuffleArray<T>(array: T[]): void {
        const length = array.length;
        for (let i = length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = array[i];
            array[i] = array[j] as T;
            array[j] = temp as T;
        }
    }
}