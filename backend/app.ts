import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, {type Request, type Response} from 'express';
import {createServer as createViteServer} from 'vite';
import {getHealth} from './controllers/inventoryController.ts';
import {errorHandler, notFoundApiHandler} from './middleware/errorHandler.ts';
import authRoutes from './routes/authRoutes.ts';
import customerRoutes from './routes/customerRoutes.ts';
import inventoryRoutes from './routes/inventoryRoutes.ts';
import layoutRoutes from './routes/layoutRoutes.ts';
import productRoutes from './routes/productRoutes.ts';
import purchaseBillRoutes from './routes/purchaseBillRoutes.ts';
import purchaseReturnRoutes from './routes/purchaseReturnRoutes.ts';
import salesBillRoutes from './routes/salesBillRoutes.ts';
import slabRoutes from './routes/slabRoutes.ts';
import supplierRoutes from './routes/supplierRoutes.ts';
import transferRoutes from './routes/transferRoutes.ts';
import uploadRoutes from './routes/uploadRoutes.ts';

function resolveFrontendPaths() {
  const rootViteConfig = path.resolve(process.cwd(), 'frontend/vite.config.ts');
  if (fs.existsSync(rootViteConfig)) {
    return {
      viteConfigFile: rootViteConfig,
      distDir: path.resolve(process.cwd(), 'dist'),
    };
  }
  return {
    viteConfigFile: path.resolve(process.cwd(), '../frontend/vite.config.ts'),
    distDir: path.resolve(process.cwd(), '../dist'),
  };
}

export async function createApp(): Promise<express.Express> {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({limit: '10mb'}));

  // Core API Routes
  app.get('/api/health', getHealth);
  app.use('/api/auth', authRoutes);
  app.use('/api/layout', layoutRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/uploads', uploadRoutes);

  // Clean Top-Level REST Resource Aliases
  app.use('/api/products', productRoutes);
  app.use('/api/slabs', slabRoutes);
  app.use('/api/purchase-bills', purchaseBillRoutes);
  app.use('/api/returns', purchaseReturnRoutes);
  app.use('/api/sales-bills', salesBillRoutes);
  app.use('/api/transfers', transferRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/suppliers', supplierRoutes);

  // Catch unmatched /api/* calls before falling through to SPA index.html
  app.use('/api', notFoundApiHandler);

  const {viteConfigFile, distDir} = resolveFrontendPaths();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: viteConfigFile,
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

export default createApp;
