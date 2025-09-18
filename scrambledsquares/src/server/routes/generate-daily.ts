import { Request, Response } from 'express';
import { GridGenerator } from '../core/grid.js';

export const generateDaily = async (_: Request, res: Response): Promise<void> => {
  try {
    const grid = GridGenerator.generateGrid();
    // Store the grid in Redis for today
    res.json({ success: true, grid });
  } catch (error) {
    console.error('Failed to generate daily puzzle:', error);
    res.status(500).json({ success: false, error: 'Failed to generate puzzle' });
  }
};