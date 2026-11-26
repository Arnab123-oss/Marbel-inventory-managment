import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import {getImageKitStatus, type ImageKitStatus} from '../services/imagekitService.ts';

export const DATA_DIR = fs.existsSync(path.resolve(process.cwd(), 'data'))
  ? path.resolve(process.cwd(), 'data')
  : fs.existsSync(path.resolve(process.cwd(), '../data'))
    ? path.resolve(process.cwd(), '../data')
    : path.resolve(process.cwd(), 'data');

export const STORE_PATH = path.join(DATA_DIR, 'store.json');

export interface DbConnectionResult {
  connected: boolean;
  driver: 'mongodb-atlas' | 'local-json-ledger';
  mongoConnected: boolean;
  mongoHost: string | null;
  imagekit: ImageKitStatus;
  storePath: string;
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDB(): Promise<DbConnectionResult> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }

  const imagekitStatus = getImageKitStatus();

  const mongoUri =
    process.env.MONGODB_URI?.trim() ||
    process.env.MONGO_URI?.trim() ||
    '';

  if (mongoUri) {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 8000,
        });
      }
      const host = mongoose.connection.host || 'mongodb-atlas';
      console.log(`MongoDB Atlas connected via Mongoose (${host})`);
      return {
        connected: true,
        driver: 'mongodb-atlas',
        mongoConnected: true,
        mongoHost: host,
        imagekit: imagekitStatus,
        storePath: STORE_PATH,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `MongoDB Atlas connection deferred (${msg}). Running in local ledger mode (${STORE_PATH}).`,
      );
    }
  } else {
    console.log(
      `MONGODB_URI not set yet — running in local ledger persistence mode (${STORE_PATH}).`,
    );
  }

  return {
    connected: true,
    driver: 'local-json-ledger',
    mongoConnected: false,
    mongoHost: null,
    imagekit: imagekitStatus,
    storePath: STORE_PATH,
  };
}

export function getDbHealth(): {
  driver: 'mongodb-atlas' | 'local-json-ledger';
  mongooseReadyState: number;
  mongoHost: string | null;
  imagekit: ImageKitStatus;
  localStoreExists: boolean;
} {
  const connected = isMongoConnected();
  return {
    driver: connected ? 'mongodb-atlas' : 'local-json-ledger',
    mongooseReadyState: mongoose.connection.readyState,
    mongoHost: connected ? mongoose.connection.host || null : null,
    imagekit: getImageKitStatus(),
    localStoreExists: fs.existsSync(STORE_PATH),
  };
}
