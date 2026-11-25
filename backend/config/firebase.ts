import fs from 'node:fs';
import path from 'node:path';
import {cert, getApp, getApps, initializeApp, type App} from 'firebase-admin/app';
import {getAuth, type Auth} from 'firebase-admin/auth';
import {getStorage, type Storage} from 'firebase-admin/storage';

export interface FirebaseOptionalConfig {
  projectId?: string;
  storageBucket?: string;
  authDomain?: string;
  apiKey?: string;
}

export interface FirebaseStatus {
  configured: boolean;
  authReady: boolean;
  storageReady: boolean;
  projectId: string | null;
  storageBucket: string | null;
  reason?: string;
}

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;
let firebaseStorage: Storage | null = null;
let resolvedBucketName: string | null = null;

let lastStatus: FirebaseStatus = {
  configured: false,
  authReady: false,
  storageReady: false,
  projectId: null,
  storageBucket: null,
  reason: 'Optional Firebase Auth & Storage not linked yet — using built-in auth & image fallback.',
};

function readFirebaseConfigFile(): FirebaseOptionalConfig | null {
  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'backend/firebase-applet-config.json'),
    path.resolve(process.cwd(), 'frontend/firebase-applet-config.json'),
  ];

  for (const configPath of candidatePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw) as FirebaseOptionalConfig;
      } catch (err) {
        console.warn(`Warning: Failed to parse ${configPath}:`, err);
      }
    }
  }
  return null;
}

export function initFirebase(): FirebaseStatus {
  const fileConfig = readFirebaseConfigFile();
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    fileConfig?.projectId?.trim() ||
    null;
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    fileConfig?.storageBucket?.trim() ||
    (projectId ? `${projectId}.appspot.com` : null);

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const hasAdc = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  if (!projectId && !serviceAccountJson && !hasAdc) {
    lastStatus = {
      configured: false,
      authReady: false,
      storageReady: false,
      projectId: null,
      storageBucket: null,
      reason: 'Optional Firebase Auth & Storage not linked yet — using built-in auth & image fallback.',
    };
    return lastStatus;
  }

  try {
    if (getApps().length > 0) {
      firebaseApp = getApp();
    } else if (serviceAccountJson) {
      const parsedCreds = JSON.parse(serviceAccountJson);
      firebaseApp = initializeApp({
        credential: cert(parsedCreds),
        projectId: projectId || parsedCreds.project_id,
        ...(storageBucket ? {storageBucket} : {}),
      });
    } else {
      firebaseApp = initializeApp({
        ...(projectId ? {projectId} : {}),
        ...(storageBucket ? {storageBucket} : {}),
      });
    }

    firebaseAuth = getAuth(firebaseApp);
    resolvedBucketName =
      storageBucket || firebaseApp.options.storageBucket || null;
    firebaseStorage = resolvedBucketName ? getStorage(firebaseApp) : null;

    lastStatus = {
      configured: true,
      authReady: Boolean(firebaseAuth),
      storageReady: Boolean(firebaseStorage && resolvedBucketName),
      projectId: projectId || firebaseApp.options.projectId || null,
      storageBucket: resolvedBucketName,
    };
    return lastStatus;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    firebaseApp = null;
    firebaseAuth = null;
    firebaseStorage = null;
    resolvedBucketName = null;
    lastStatus = {
      configured: Boolean(projectId),
      authReady: false,
      storageReady: false,
      projectId,
      storageBucket,
      reason: `Optional Firebase init skipped (${message}) — using built-in auth & image fallback.`,
    };
    return lastStatus;
  }
}

export function isFirebaseReady(): boolean {
  return Boolean(firebaseApp && firebaseAuth);
}

export function isFirebaseStorageReady(): boolean {
  return Boolean(firebaseApp && firebaseStorage && resolvedBucketName);
}

export function getFirebaseAuth(): Auth | null {
  return firebaseAuth;
}

export function getStorageBucket() {
  if (!firebaseStorage || !resolvedBucketName) return null;
  return firebaseStorage.bucket(resolvedBucketName);
}

export function getFirebaseStatus(): FirebaseStatus {
  return {...lastStatus};
}
