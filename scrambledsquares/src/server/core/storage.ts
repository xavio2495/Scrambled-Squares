import { redis } from '@devvit/web/server';
import { GameGrid, GameState } from '../../shared/types/api';

// Key prefixes for Redis storage
const KEYS = {
    DAILY_GRID: 'scrambled:daily:grid',
    DAILY_WORDS: 'scrambled:daily:words',
    LEADERBOARD: 'scrambled:leaderboard',
    COMPLETION: 'scrambled:completion',
} as const;

// Time constants (in seconds)
const ONE_DAY = 86400;

/**
 * Helper class for managing game state in Redis
 */
export class GameStorage {
    /**
     * Get the current date in YYYY-MM-DD format for keys
     */
    private static getCurrentDateKey(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    /**
     * Store today's grid in Redis with 24-hour expiration
     */
    static async setDailyGrid(gridData: GameGrid): Promise<void> {
        const gridString = JSON.stringify(gridData);
        await redis.set(KEYS.DAILY_GRID, gridString);
        await redis.expire(KEYS.DAILY_GRID, ONE_DAY);
    }

    /**
     * Retrieve today's grid from Redis
     */
    static async getDailyGrid(): Promise<GameGrid | null> {
        const gridString = await redis.get(KEYS.DAILY_GRID);
        if (!gridString) return null;
        
        const data = JSON.parse(gridString);
        return {
            grid: data.grid,
            dailyId: data.dailyId,
            date: data.date
        };
    }

    /**
     * Get current game state for a user
     */
    static async getGameState(userId: string): Promise<GameState> {
        const gameKey = `${KEYS.DAILY_GRID}:${userId}`;
        const stateString = await redis.get(gameKey);
        
        if (!stateString) {
            const grid = await this.getDailyGrid();
            return {
                isActive: false,
                timeRemaining: 60,
                score: 0,
                foundWords: [],
                grid: grid?.grid || []
            };
        }

        return JSON.parse(stateString);
    }

    /**
     * Store valid words for today's grid with 24-hour expiration
     */
    static async setDailyWords(words: Set<string>): Promise<void> {
        const wordsArray = Array.from(words);
        await redis.set(KEYS.DAILY_WORDS, JSON.stringify(wordsArray));
        await redis.expire(KEYS.DAILY_WORDS, ONE_DAY);
    }

    /**
     * Retrieve valid words for today's grid
     */
    static async getDailyWords(): Promise<Set<string> | null> {
        const wordsString = await redis.get(KEYS.DAILY_WORDS);
        if (!wordsString) return null;
        return new Set(JSON.parse(wordsString));
    }

    /**
     * Update the leaderboard with a new score
     */
    static async updateLeaderboard(
        username: string, 
        score: number, 
        foundWords: string[], 
        timeElapsed: number
    ): Promise<void> {
        const leaderboardKey = `${KEYS.LEADERBOARD}:${this.getCurrentDateKey()}`;
        const userKey = `${leaderboardKey}:${username}`;

        // Store user's best score and details
        const currentScore = await redis.hGet(userKey, 'score');
        if (!currentScore || parseInt(currentScore) < score) {
            await redis.hSet(userKey, {
                score: score.toString(),
                foundWords: JSON.stringify(foundWords),
                timeElapsed: timeElapsed.toString(),
                timestamp: Date.now().toString()
            });
        }

        // Update sorted set for rankings
        await redis.zAdd(leaderboardKey, {
            score,
            member: username
        });

        // Set 24-hour expiration on both keys
        await Promise.all([
            redis.expire(leaderboardKey, ONE_DAY),
            redis.expire(userKey, ONE_DAY)
        ]);
    }

    /**
     * Get the leaderboard for today
     */
    static async getDailyLeaderboard(limit: number = 10): Promise<Array<{
        username: string;
        score: number;
        foundWords: string[];
        timeElapsed: number;
    }>> {
        const leaderboardKey = `${KEYS.LEADERBOARD}:${this.getCurrentDateKey()}`;
        // Get top scores in descending order
        const scores = await redis.zRange(leaderboardKey, `-${limit}`, -1);
        
        const results: Array<{
            username: string;
            score: number;
            foundWords: string[];
            timeElapsed: number;
        }> = [];

        for (const username of scores) {
            if (typeof username === 'string') {
                const userKey = `${leaderboardKey}:${username}`;
                const userScore = await redis.hGetAll(userKey);
                
                if (userScore?.score && userScore?.foundWords && userScore?.timeElapsed) {
                    try {
                        results.push({
                            username,
                            score: parseInt(userScore.score) || 0,
                            foundWords: JSON.parse(userScore.foundWords) || [],
                            timeElapsed: parseInt(userScore.timeElapsed) || 0
                        });
                    } catch (err) {
                        console.error(`Error parsing user score for ${username}:`, err);
                        // Skip invalid entries
                        continue;
                    }
                }
            }
        }
        
        for (const member of members) {
            if (typeof member === 'string') {
                const score = await redis.zScore(KEYS.LEADERBOARD, member);
                if (typeof score === 'number') {
                    results.push({ username: member, score });
                }
            }
        }
        
        return results;
    }

    /**
     * Mark the game as completed when all words are found
     */
    static async markGameCompleted(username: string): Promise<void> {
        await redis.set(KEYS.COMPLETION, username);
    }

    /**
     * Check if the game is completed
     */
    static async isGameCompleted(): Promise<{ completed: boolean; winner: string | undefined }> {
        const winner = await redis.get(KEYS.COMPLETION);
        return {
            completed: !!winner,
            winner: winner ?? undefined
        };
    }

    /**
     * Reset daily data (called when generating new puzzle)
     */
    static async resetDailyData(): Promise<void> {
        await Promise.all([
            redis.del(KEYS.DAILY_GRID),
            redis.del(KEYS.DAILY_WORDS),
            redis.del(KEYS.LEADERBOARD),
            redis.del(KEYS.COMPLETION)
        ]);
    }
}