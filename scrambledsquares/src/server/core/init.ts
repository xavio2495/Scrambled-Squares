import { GameStorage } from './storage';
import { GridGenerator } from './grid';
import { DictionaryService } from './dictionary';

export async function initializeServices(): Promise<void> {
    try {
        // Initialize core services
        await Promise.all([
            DictionaryService.initialize(),
            GridGenerator.initialize()
        ]);

        // Verify Redis connection
        await GameStorage.verifyConnection();
        
        console.log('Services initialized successfully');
    } catch (error) {
        console.error('Service initialization failed:', error);
        // Don't exit process, let Devvit handle the error
        throw error;
    }
}