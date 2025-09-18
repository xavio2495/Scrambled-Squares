import { readFile } from 'fs/promises';
import { join } from 'path';
import { GameStorage } from './storage';
import { GameGrid } from '../../shared/types/api';

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

    static generateGrid(): Letter[][] {
        // Initialize empty grid with explicit typing
        const grid: Letter[][] = Array.from(
            { length: GRID_SIZE },
            () => Array.from<Letter>(
                { length: GRID_SIZE }
            ).fill('A')
        );

        const letters = this.generateBalancedLetterSet();
        this.placeLettersInGrid(letters, grid);
        return grid;
    }

    private static generateBalancedLetterSet(): Letter[] {
        const letters: Letter[] = [];
        
        // Track letter distributions
        const vowelDist = new Map(VOWELS.map(v => [v, LETTER_FREQUENCIES[v]]));
        const consDist = new Map(CONSONANTS.map(c => [c, LETTER_FREQUENCIES[c]]));
        
        // Add minimum vowels
        for (let i = 0; i < MIN_VOWELS; i++) {
            const vowel = this.weightedRandomChoice(
                Array.from(vowelDist.keys()),
                letter => vowelDist.get(letter) ?? 0
            );
            letters.push(vowel);
            vowelDist.set(vowel, (vowelDist.get(vowel) ?? 0) * 0.5);
        }
        
        // Add minimum consonants
        for (let i = 0; i < MIN_CONSONANTS; i++) {
            const cons = this.weightedRandomChoice(
                Array.from(consDist.keys()),
                letter => consDist.get(letter) ?? 0
            );
            letters.push(cons);
            consDist.set(cons, (consDist.get(cons) ?? 0) * 0.5);
        }
        
        // Fill remaining spots
        const remaining = (GRID_SIZE * GRID_SIZE) - letters.length;
        const allDist = new Map([...vowelDist, ...consDist]);
        
        for (let i = 0; i < remaining; i++) {
            const letter = this.weightedRandomChoice(
                Array.from(allDist.keys()),
                letter => allDist.get(letter) ?? 0
            );
            letters.push(letter);
            allDist.set(letter, (allDist.get(letter) ?? 0) * 0.7);
        }
        
        return letters;
    }

    private static placeLettersInGrid(letters: Letter[], grid: Letter[][]): void {
        let attempts = 0;
        const maxAttempts = 10;

        do {
            this.shuffleArray(letters);
            attempts++;

            let validPlacement = true;
            for (let i = 0; i < GRID_SIZE && validPlacement; i++) {
                const row = grid[i];
                if (!row) continue;

                for (let j = 0; j < GRID_SIZE && validPlacement; j++) {
                    const index = i * GRID_SIZE + j;
                    const letter = letters[index];
                    if (!letter) continue;
                    
                    if (this.isValidPlacement(grid, i, j, letter)) {
                        row[j] = letter;
                    } else {
                        validPlacement = false;
                    }
                }
            }

            if (validPlacement) {
                break;
            }

            // Reset grid if placement was invalid
            for (const row of grid) {
                if (row) {
                    row.fill('A');
                }
            }
        } while (attempts < maxAttempts);

        // If we couldn't generate a valid grid after max attempts,
        // try generating a new set of letters
        if (attempts >= maxAttempts) {
            const newLetters = this.generateBalancedLetterSet();
            this.placeLettersInGrid(newLetters, grid);
        }
    }

    private static isValidPlacement(
        grid: Letter[][], 
        row: number, 
        col: number, 
        letter: Letter
    ): boolean {
        if (row < 0 || row >= grid.length || col < 0) return false;
        
        const currentRow = grid[row];
        if (!currentRow || col >= currentRow.length) return false;

        // Check horizontal triplets
        if (col >= 2) {
            const leftTwo = currentRow[col-2];
            const leftOne = currentRow[col-1];
            if (leftTwo === letter && leftOne === letter) {
                return false;
            }
        }
        
        // Check vertical triplets
        if (row >= 2) {
            const upTwo = grid[row-2]?.[col];
            const upOne = grid[row-1]?.[col];
            if (upTwo === letter && upOne === letter) {
                return false;
            }
        }
        
        return true;
    }

    static findValidWords(grid: Letter[][]): Set<string> {
        const validWords = new Set<string>();
        const visited: boolean[][] = Array.from(
            { length: GRID_SIZE }, 
            () => new Array<boolean>(GRID_SIZE).fill(false)
        );

        for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
                if (grid[row]?.[col]) {
                    this.findWordsFromCell(grid, row, col, '', visited, validWords);
                }
            }
        }

        return validWords;
    }

    static isValidWord(word: string): boolean {
        return word.length >= 3 && this.scrabbleWords.has(word.toUpperCase());
    }

    static async generateDailyPuzzle(): Promise<void> {
        const letters = this.generateGrid();
        const validWords = this.findValidWords(letters);

        // Regenerate if too few valid words
        if (validWords.size < 10) {
            return this.generateDailyPuzzle();
        }

        const todayDate = new Date().toISOString().split('T')[0];
        if (!todayDate) {
            throw new Error('Failed to generate date for puzzle');
        }

        const gridData: GameGrid = {
            grid: letters,
            dailyId: todayDate,
            date: todayDate
        };

        // Store in Redis
        await GameStorage.resetDailyData();
        await Promise.all([
            GameStorage.setDailyGrid(gridData),
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
        if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
            return;
        }

        const currentRow = grid[row];
        const visitedRow = visited[row];
        if (!currentRow || !visitedRow) {
            return;
        }

        const cell = currentRow[col];
        if (!cell || visitedRow[col]) {
            return;
        }

        visitedRow[col] = true;
        const newWord = currentWord + cell;

        if (newWord.length >= 3 && this.isValidWord(newWord)) {
            validWords.add(newWord);
        }

        // Check all adjacent cells
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;
                
                const newRow = row + i;
                const newCol = col + j;

                if (newRow >= 0 && newRow < GRID_SIZE &&
                    newCol >= 0 && newCol < GRID_SIZE &&
                    visited[newRow] &&
                    grid[newRow]?.[newCol] &&
                    !visited[newRow][newCol]) {
                    this.findWordsFromCell(grid, newRow, newCol, newWord, visited, validWords);
                }
            }
        }

        visitedRow[col] = false;
    }

    private static weightedRandomChoice<T extends Letter>(
        items: ReadonlyArray<T>,
        weightFn: (item: T) => number
    ): T {
        if (items.length === 0) {
            throw new Error('Cannot make a choice from an empty array');
        }

        const weights = Array.from(items, weightFn);
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item === undefined) continue;
            random -= weights[i] ?? 0;
            if (random <= 0) {
                return item;
            }
        }
        
        const firstItem = items[0];
        if (firstItem === undefined) {
            throw new Error('No valid items found');
        }
        return firstItem;
    }

    private static shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = array[i];
            if (temp !== undefined && array[j] !== undefined) {
                array[i] = array[j] as T;
                array[j] = temp;
            }
        }
    }
}