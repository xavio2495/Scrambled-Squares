import { Request, Response } from 'express';
import { GridGenerator } from '../core/grid.js';

export const createPost = async (_: Request, res: Response): Promise<void> => {
  try {
    const grid = GridGenerator.generateGrid();
    // Create new post with the grid
    res.json({ success: true, grid });
  } catch (error) {
    console.error('Failed to create post:', error);
    res.status(500).json({ success: false, error: 'Failed to create post' });
  }
};