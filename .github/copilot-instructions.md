# Copilot Instructions for Scrambled-Squares

## Project Overview
- **Scrambled-Squares** is a daily word hunt game built for Reddit's Devvit platform that challenges players to find words in a 4x4 letter grid within 60 seconds.
- The codebase uses [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) architecture with `client/`, `server/`, and `shared/` components.
- Built with TypeScript, Vite (client), and Express (server) following Reddit's game development guidelines.

## Core Game States
1. **Pre-Game State** (`client/components/PreGame.tsx`):
   - 4x4 letter grid preview with "Start Game" button
   - Grid updates daily via Redis storage
   - Uses Devvit splash screen for first-time visitors

2. **Active Game State** (`client/components/GameBoard.tsx`):
   - 60-second timer with mobile-first UI
   - Touch/click-and-drag word path tracing
   - Real-time dictionary validation via server endpoints
   - Instant feedback (sound + visual) for valid/invalid words

3. **Post-Game State** (`client/components/PostGame.tsx`):
   - Score submission to dynamic leaderboard
   - "Share Score" functionality using Reddit comments
   - Daily statistics tracked in Redis

## Project Setup
1. Configure development environment:
   ```bash
   node -v  # Must be v22+
   npm create devvit@latest -- --template=react
   cd scrambled-squares
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev  # Opens Reddit playtest environment
   ```

## Architecture & Communication
- **Client-Server Communication**: 
  - All endpoints must start with `/api/`
  - Example: `/api/validate-word` for word checks
  - Use `fetch()` from client, handle in `server/index.ts`

- **Data Persistence**:
  - Daily puzzles stored in Redis
  - Leaderboard state managed in `server/core/post.ts`
  - User progress tracked via Reddit user context

## Key Files & Components
- `devvit.json`: Core configuration (permissions, endpoints)
- `client/main.ts`: Web app entry point 
- `server/index.ts`: Express server setup
- `shared/types/api.ts`: Shared interfaces

## Integration Points
1. **Devvit Platform**:
   ```typescript
   // server/index.ts
   import { reddit } from '@devvit/web/server';
   
   // Client API calls
   router.post('/api/submit-score', async (req, res) => {
     const { score } = req.body;
     const username = await reddit.getCurrentUsername();
     // Update leaderboard
   });
   ```

2. **Redis for State**:
   ```typescript
   // server/core/post.ts
   import { redis } from '@devvit/web/server';
   
   async function getTodaysPuzzle() {
     return await redis.get('current_puzzle');
   }
   ```

## Leaderboard System
- Real-time component using Devvit's web capabilities
- Top 10 players displayed in post
- Two states in `server/core/post.ts`:
  - "Open": Accepting scores
  - "Closed": 100% completion achieved
- "First Clear! 🥇" badge for fastest complete solve

## Best Practices
- Mobile-first development (majority of users)
- Server-side validation for all game actions
- Strict TypeScript usage throughout
- Relative paths for Reddit asset compatibility
- Error states for offline/failure scenarios

## Testing & Deployment
1. Local testing:
   ```bash
   npm run dev  # Starts playtest server
   npm run check  # TypeScript + lint checks
   ```

2. Deployment:
   ```bash
   npm run build  # Build for production
   npm run deploy  # Upload to Reddit
   npm run launch  # Submit for review
   ```

For questions about game mechanics, player stats, or deployment, refer to the [Reddit Developer Platform docs](https://developers.reddit.com/docs).
