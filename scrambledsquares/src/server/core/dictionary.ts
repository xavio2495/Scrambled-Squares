import { readFile } from 'fs/promises';
import { join } from 'path';
import { GameStorage } from './storage';
import { ValidateWordResponse, GridPosition } from '../../shared/types/api';

export class DictionaryService {
    private static scrabbleWords: Set<string>;
    private static initialized = false;

    /**
     * Initialize the dictionary from file
     */
    static async initialize(): Promise<void> {
        try {
            // Load official Scrabble word list
            const scrabbleData = await readFile(join(__dirname, '../../../data/scrabble.txt'), 'utf-8');
            this.scrabbleWords = new Set(scrabbleData.split('\n').map(word => word.trim().toUpperCase()));
            this.initialized = true;
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            throw new Error('Dictionary initialization failed');
        }
    }

    /**
     * Validate a word against the daily puzzle
     * Returns a ValidateWordResponse with validation result and score
     */
    static async validateWord(word: string, path: GridPosition[]): Promise<ValidateWordResponse> {
        // Ensure dictionary is initialized
        if (!this.initialized) {
            await this.initialize();
        }

        // Convert to uppercase for consistency
        const upperWord = word.trim().toUpperCase();

        // Basic validation
        if (upperWord.length < 3) {
            return { isValid: false, score: 0, message: 'Word must be at least 3 letters long' };
        }

        // Check against Scrabble dictionary
        if (!this.scrabbleWords.has(upperWord)) {
            return { isValid: false, score: 0, message: 'Not a valid word' };
        }

        // Validate path matches the word using daily grid
        const grid = await GameStorage.getDailyGrid();
        if (!grid) {
            return { isValid: false, score: 0, message: 'Daily puzzle not available' };
        }

        // Get today's valid words from cache
        const validWords = await GameStorage.getDailyWords();
        if (!validWords) {
            return { isValid: false, score: 0, message: 'Daily puzzle not available' };
        }

        // Check if word is possible in today's grid
        if (!validWords.has(upperWord)) {
            return { isValid: false, score: 0, message: 'Word not possible in current grid' };
        }

        // Check if the path forms the word
        let pathWord = '';
        for (const pos of path) {
            if (pos.row < 0 || pos.row >= 4 || pos.col < 0 || pos.col >= 4) {
                return { isValid: false, score: 0, message: 'Invalid path position' };
            }
            const letter = grid.grid[pos.row]?.[pos.col];
            if (!letter) {
                return { isValid: false, score: 0, message: 'Invalid grid position' };
            }
            pathWord += letter;
        }

        if (pathWord.toUpperCase() !== upperWord) {
            return { isValid: false, score: 0, message: 'Path does not match word' };
        }

        // Calculate score: base points + length bonus
        const basePoints = 10;
        const lengthBonus = Math.max(0, upperWord.length - 3) * 5;
        const finalScore = basePoints + lengthBonus;

        return { isValid: true, score: finalScore, message: 'Valid word!' };
    }

    /**
     * Check if the dictionary is properly initialized
     */
    static isInitialized(): boolean {
        return this.initialized;
    }
}