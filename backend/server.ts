import 'dotenv/config';
import {createApp} from './app.ts';
import {connectDB} from './config/db.ts';
import {startSnapshotSyncLoop} from './services/sseService.ts';
import {initializeStorePersistence} from './services/storeService.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  try {
    await connectDB();
    await initializeStorePersistence();
    startSnapshotSyncLoop();
    const app = await createApp();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`StonePulse backend & frontend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start StonePulse backend:', error);
    process.exit(1);
  }
}

void startServer();
