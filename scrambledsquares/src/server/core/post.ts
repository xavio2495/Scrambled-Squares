import { reddit, context } from "@devvit/web/server";
import { GameStorage } from "./storage";
import { GridGenerator } from "./grid";

export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    console.error("Failed to create post: subredditName is missing from context");
    throw new Error("subredditName is required");
  }

  try {
    // Generate today's puzzle
    console.log(`Generating daily puzzle for r/${subredditName}...`);
    await GridGenerator.generateDailyPuzzle();
    
    // Get the stored grid for post preview
    const grid = await GameStorage.getDailyGrid();
    if (!grid) {
      throw new Error("Failed to generate or retrieve daily grid");
    }

    // Create the post with proper metadata
    const currentDate = new Date();
    const dailyId = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
    
    console.log(`Creating Reddit post for dailyId: ${dailyId}...`);
    const post = await reddit.submitCustomPost({
      splash: {
        appDisplayName: "Scrambled Squares",
        description: "Find words in a 4x4 grid before time runs out!",
      },
      subredditName,
      title: `[Daily Puzzle #${dailyId}] Scrambled Squares - Word Hunt Game`,
      postData: {
        dailyId,
        version: "1.0.0"
      }
    });

    // Reset and initialize today's data
    await GameStorage.resetDailyData();

    // Initialize leaderboard structure with initial values
    await GameStorage.updateLeaderboard(
      'system',  // placeholder user
      0,         // initial score
      [],        // no words found
      0          // no time elapsed
    );

    // Flair will be handled by default styling via devvit.json

    console.log("Post creation completed successfully!");
    return post;
  } catch (error) {
    console.error("Failed to create daily puzzle post:", error);
    throw error;
  }
};
