import { Request, Response } from 'express';
import { GridGenerator } from '../core/grid.js';

import { initializeServices } from '../core/init';

export const onAppInstall = async (_: Request, res: Response): Promise<void> => {
  try {
    // Initialize all services properly
    await initializeServices();
    
    // Verify we can generate a grid
    await GridGenerator.generateDailyPuzzle();
    
    console.log('App installation completed successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('App installation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Installation failed'
    });
  }
};