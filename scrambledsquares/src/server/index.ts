import express from "express";
import { GridPosition } from "../shared/types/api";
import {
  createServer,
  context,
  getServerPort,
  reddit,
} from "@devvit/web/server";
import { createPost } from "./core/post";
import { DictionaryService } from "./core/dictionary";
import { GameStorage } from "./core/storage";
import { GridGenerator } from "./core/grid.js";

const app = express();

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

// Error Handling
interface AppError {
  code: string;
  message: string;
  status: number;
  details: Record<string, unknown> | undefined;
}

function createError(
  code: string,
  message: string,
  status: number = 500,
  details?: Record<string, any>
): AppError {
  return { code, message, status, details };
}

const router = express.Router();

// Rate limiting
type RateInfo = { count: number; firstRequest: number };
const rateLimits = new Map<string, RateInfo>();

function rateLimit(windowMs: number, maxRequests: number): express.RequestHandler {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let info = rateLimits.get(ip) || { count: 0, firstRequest: now };
    
    if (info.firstRequest < windowStart) {
      info = { count: 0, firstRequest: now };
    }
    
    if (info.count >= maxRequests) {
      res.status(429).json(createError(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests, please try again later',
        429
      ));
      return;
    }
    
    info.count++;
    rateLimits.set(ip, info);
    next();
  };
}

const gameRateLimit = rateLimit(60000, 60); // 60 requests/minute

// Game Routes
router.get('/api/daily-grid', gameRateLimit, async (_req, res) => {
  try {
    const grid = await GameStorage.getDailyGrid();
    if (!grid) {
      res.status(404).json(createError('GRID_NOT_FOUND', 'No daily puzzle available', 404));
      return;
    }
    res.json(grid);
  } catch (error) {
    res.status(500).json(createError(
      'INTERNAL_ERROR',
      'Failed to get daily puzzle',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

router.get('/api/game-state', gameRateLimit, async (_req, res) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) {
      res.status(401).json(createError('UNAUTHORIZED', 'User not authenticated', 401));
      return;
    }
    
    const gameState = await GameStorage.getGameState(username);
    res.json(gameState);
  } catch (error) {
    res.status(500).json(createError(
      'INTERNAL_ERROR',
      'Failed to get game state',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

router.post('/api/validate-word', gameRateLimit, async (req, res) => {
  try {
    const { word, dailyId, path } = req.body as { 
      word?: string;
      dailyId?: string;
      path?: GridPosition[];
    };

    if (!word || !dailyId || !path) {
      res.status(400).json(createError(
        'INVALID_REQUEST',
        'Word, dailyId, and path are required',
        400
      ));
      return;
    }

    const result = await DictionaryService.validateWord(word, path);
    res.json(result);
  } catch (error) {
    res.status(500).json(createError(
      'VALIDATION_ERROR',
      'Word validation failed',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

router.post('/api/submit-score', gameRateLimit, async (req, res) => {
  try {
    const { score, words, timeElapsed } = req.body as {
      score?: number;
      words?: string[];
      timeElapsed?: number;
    };

    if (!score || !words || timeElapsed === undefined) {
      res.status(400).json(createError(
        'INVALID_REQUEST',
        'Score, words, and timeElapsed are required',
        400
      ));
      return;
    }

    const username = await reddit.getCurrentUsername();
    if (!username) {
      res.status(401).json(createError('UNAUTHORIZED', 'User not authenticated', 401));
      return;
    }

    // Check if game is already completed
    const gameState = await GameStorage.isGameCompleted();
    if (gameState.completed) {
      res.json({
        status: 'success',
        leaderboardClosed: true,
        winner: gameState.winner
      });
      return;
    }

    // Verify submitted words
    const validWords = await GameStorage.getDailyWords();
    if (!validWords) {
      res.status(500).json(createError('INTERNAL_ERROR', 'Daily words not found', 500));
      return;
    }

    const allWordsValid = words.every(word => validWords.has(word.toUpperCase()));
    if (!allWordsValid) {
      res.status(400).json(createError('INVALID_WORDS', 'Some submitted words are invalid', 400));
      return;
    }

    // Update leaderboard
    await GameStorage.updateLeaderboard(username, score, words, timeElapsed);

    // Check for game completion
    if (words.length === validWords.size) {
      await GameStorage.markGameCompleted(username);
      res.json({ status: 'success', completed: true, rank: 1 });
      return;
    }

    // Get player's rank
    const leaderboard = await GameStorage.getDailyLeaderboard();
    const rank = leaderboard.findIndex(entry => entry.username === username) + 1;
    res.json({ status: 'success', rank });
  } catch (error) {
    res.status(500).json(createError(
      'SUBMISSION_ERROR',
      'Failed to submit score',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

router.get('/api/leaderboard', gameRateLimit, async (_req, res) => {
  try {
    const [leaderboard, gameState] = await Promise.all([
      GameStorage.getDailyLeaderboard(),
      GameStorage.isGameCompleted()
    ]);

    res.json({
      leaderboard,
      completed: gameState.completed,
      winner: gameState.winner
    });
  } catch (error) {
    res.status(500).json(createError(
      'LEADERBOARD_ERROR',
      'Failed to get leaderboard',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

// Internal Routes
router.post('/internal/menu/post-create', async (_req, res) => {
  try {
    const post = await createPost();

    // Generate new puzzle
    await Promise.all([
      GridGenerator.generateDailyPuzzle(),
      DictionaryService.initialize()
    ]);

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`
    });
  } catch (error) {
    res.status(400).json(createError(
      'POST_CREATE_ERROR',
      'Failed to create post',
      400,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

router.post('/internal/on-app-install', async (_req, res) => {
  try {
    const post = await createPost();
    res.json({
      status: 'success',
      message: `Post created in r/${context.subredditName} with id ${post.id}`
    });
  } catch (error) {
    res.status(400).json(createError(
      'INSTALL_ERROR',
      'Failed to create initial post',
      400,
      { error: error instanceof Error ? error.message : String(error) }
    ));
  }
});

// Main setup
app.use(router);

// Initialize services
Promise.all([
  DictionaryService.initialize(),
  GridGenerator.generateDailyPuzzle()
]).catch(error => {
  console.error('Failed to initialize services:', error);
  process.exit(1);
});

// Start server
const server = createServer(app);
server.on('error', (err) => console.error('Server error:', err.stack));
server.listen(getServerPort());