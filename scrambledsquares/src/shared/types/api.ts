// Game state and response types
export interface GameState {
  isActive: boolean;
  timeRemaining: number;
  score: number;
  foundWords: string[];
  grid: string[][];
}

export interface GameGrid {
  grid: string[][];
  dailyId: string;  // Unique identifier for the daily puzzle
  date: string;     // ISO date string
}

// API Request/Response types
export interface ValidateWordRequest {
  word: string;
  dailyId: string;
  path: GridPosition[];  // Path of letter selections
}

export interface ValidateWordResponse {
  isValid: boolean;
  score: number;
  message?: string;
}

export interface SubmitScoreRequest {
  score: number;
  dailyId: string;
  foundWords: string[];
  timeElapsed: number;
}

export interface SubmitScoreResponse {
  success: boolean;
  rank?: number;        // Player's rank on leaderboard
  isPersonalBest?: boolean;
  message?: string;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  foundWords: number;  // Count of words found
  timeElapsed: number;
  date: string;
}

export interface DailyLeaderboard {
  dailyId: string;
  entries: LeaderboardEntry[];
  topScore: number;
  averageScore: number;
}

// Helper types
export interface GridPosition {
  row: number;
  col: number;
}

// Error types
export interface GameError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Redis stored types
export interface StoredGameData {
  dailyId: string;
  grid: string[][];
  validWords: Set<string>;
  date: string;
  leaderboard: DailyLeaderboard;
}

export interface UserProgress {
  userId: string;
  gamesPlayed: number;
  totalScore: number;
  bestScore: number;
  averageScore: number;
  lastPlayedDate: string;
}