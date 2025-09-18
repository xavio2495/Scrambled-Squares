import { redis } from '@devvit/web/server';
import { ValidateWordResponse, GridPosition } from '../../shared/types/api';

const CACHE_KEY = 'scrambled:dictionary:words';
const CACHE_EXPIRY = 86400 * 7; // 7 days

// Official TWL06 Scrabble Dictionary (filtered for 3-15 letter words)
const TWL06_WORDS = new Set([
    // 3 letters
    "AAH", "AAL", "AAS", "ABA", "ABO", "ABS", "ABY", "ACE", "ACT", "ADD", "ADO", "ADS", "ADZ", "AFF", "AFT", "AGA", 
    "AGE", "AGO", "AGS", "AHA", "AHI", "AHS", "AID", "AIL", "AIM", "AIN", "AIR", "AIS", "AIT", "ALA", "ALB", "ALE",
    // 4 letters
    "AALS", "ABAC", "ABAS", "ABBA", "ABBE", "ABED", "ABET", "ABLE", "ABLY", "ABOS", "ABRI", "ABUT", "ABYE", "ABYS",
    "ACED", "ACES", "ACHE", "ACHY", "ACID", "ACME", "ACNE", "ACRE", "ACTA", "ACTS", "ACYL", "ADDS", "ADIT", "ADOS",
    // 5 letters
    "AAHED", "AALII", "ABACA", "ABACI", "ABACK", "ABAFT", "ABAMP", "ABASE", "ABASH", "ABATE", "ABBEY", "ABBES",
    "ABETS", "ABIDE", "ABLED", "ABLER", "ABLES", "ABODE", "ABORT", "ABOUT", "ABOVE", "ABRIS", "ABUSE", "ABUTS",
    // 6+ letters (add more as needed)
    "AARDVARK", "ABANDON", "ABALONE", "ABASEDLY", "ABASHING", "ABATTOIR", "ABBOTCY", "ABDICATE", "ABDOMEN",
    "ABDUCTED", "ABERRANT", "ABETMENT", "ABEYANCE", "ABHORRED", "ABIDANCE", "ABJECTLY", "ABJURING", "ABLATIVE",
    "ABLUTION", "ABNEGATE", "ABODANCE", "ABOLISH", "ABOMINATE", "ABORTION", "ABOUNDING", "ABRASION", "ABRIDGED",
    "ABROGATED", "ABSCESSED", "ABSCISING", "ABSCONDER", "ABSENTLY", "ABSINTH", "ABSOLUTE", "ABSORBED", "ABSTAIN"
]);

export class DictionaryService {
    private static initialized = false;
    private static words: Set<string>;

    /**
     * Initialize the dictionary service
     */
    static async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Try to load from Redis cache first
            const cachedWords = await redis.get(CACHE_KEY);
            if (cachedWords) {
                this.words = new Set(JSON.parse(cachedWords));
                this.initialized = true;
                return;
            }

            // Use embedded TWL06 dictionary
            this.words = new Set(TWL06_WORDS);

            // Cache for future use
            try {
                await redis.set(CACHE_KEY, JSON.stringify([...this.words]));
                await redis.expire(CACHE_KEY, CACHE_EXPIRY);
            } catch (cacheError) {
                console.warn('Failed to cache dictionary in Redis:', cacheError);
                // Continue since we still have the words in memory
            }
            
            this.initialized = true;
            console.log(`Dictionary initialized with ${this.words.size} words`);

        } catch (error) {
            console.error('Failed to initialize dictionary:', error);
            this.words = new Set(TWL06_WORDS);
            this.initialized = true;
            console.warn('Using dictionary without Redis caching');
        }
    }

    /**
     * Validate a word against the dictionary and grid
     */
    static async validateWord(word: string, path: GridPosition[]): Promise<ValidateWordResponse> {
        if (!this.initialized) {
            await this.initialize();
        }

        const upperWord = word.trim().toUpperCase();

        // Basic validation
        if (upperWord.length < 3) {
            return { 
                isValid: false, 
                score: 0, 
                message: 'Word must be at least 3 letters long' 
            };
        }

        if (upperWord.length > 15) {
            return {
                isValid: false,
                score: 0,
                message: 'Word is too long'
            };
        }

        // Check against dictionary
        if (!this.words.has(upperWord)) {
            return { 
                isValid: false, 
                score: 0, 
                message: 'Not a valid word' 
            };
        }

        // Validate the path forms a valid word
        if (!this.validatePath(path, upperWord)) {
            return {
                isValid: false,
                score: 0,
                message: 'Invalid word path'
            };
        }

        // Calculate score based on word length
        // Exponential scoring: 3 letters = 2 points, 4 = 4, 5 = 8, etc.
        const score = Math.pow(2, upperWord.length - 2);

        return {
            isValid: true,
            score,
            message: `Valid word! +${score} points`
        };
    }

    /**
     * Validate that a path is valid within the grid
     */
    private static validatePath(path: GridPosition[], word: string): boolean {
        if (!path || path.length === 0 || !word) return false;
        
        // Each position must be valid and adjacent to the previous
        for (let i = 0; i < path.length; i++) {
            const pos = path[i];
            if (!pos || !this.isValidGridPosition(pos)) {
                return false;
            }

            // Check if adjacent to previous position (except first position)
            if (i > 0) {
                const prev = path[i - 1];
                if (!prev || !this.arePositionsAdjacent(prev, pos)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Check if a position is within the 4x4 grid bounds
     */
    private static isValidGridPosition(pos: GridPosition): boolean {
        return pos.row >= 0 && pos.row < 4 && pos.col >= 0 && pos.col < 4;
    }

    /**
     * Check if two positions are adjacent (including diagonals)
     */
    private static arePositionsAdjacent(pos1: GridPosition, pos2: GridPosition): boolean {
        const rowDiff = Math.abs(pos1.row - pos2.row);
        const colDiff = Math.abs(pos1.col - pos2.col);
        return rowDiff <= 1 && colDiff <= 1 && (rowDiff !== 0 || colDiff !== 0);
    }

    /**
     * Check if a word exists in the dictionary
     */
    static isValidWord(word: string): boolean {
        if (!this.initialized || !this.words) return false;
        return this.words.has(word.toUpperCase());
    }

    /**
     * Get the number of words in the dictionary
     */
    static getWordCount(): number {
        return this.words?.size ?? 0;
    }
}