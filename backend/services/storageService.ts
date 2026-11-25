import crypto from 'node:crypto';
import path from 'node:path';
import {getStorageBucket, isFirebaseStorageReady} from '../config/firebase.ts';

export type ImageUploadFolder = 'products' | 'slabs';

export interface UploadedImageResult {
  url: string;
  provider: 'firebase-storage' | 'inline-fallback';
  path: string;
  mimeType: string;
  sizeBytes: number;
}

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function sanitizeSafeImageUrl(raw?: string | null): string | undefined {
  const trimmed = (raw || '').trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('/assets/')
  ) {
    return trimmed;
  }
  return undefined;
}

export function validateImageUpload(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_IMAGE_MIME.has(mimeType.toLowerCase())) {
    throw new Error('Only JPEG, PNG, WebP, or GIF images are allowed.');
  }
  if (sizeBytes <= 0 || sizeBytes > 5 * 1024 * 1024) {
    throw new Error('Image size must be between 1 byte and 5 MB.');
  }
}

export async function uploadImageToStorage(
  file: {buffer: Buffer; originalname: string; mimetype: string},
  folder: ImageUploadFolder = 'products',
): Promise<UploadedImageResult> {
  validateImageUpload(file.mimetype, file.buffer.length);

  const extRaw = path.extname(file.originalname || '').toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extRaw)
    ? extRaw
    : file.mimetype.includes('png')
      ? '.png'
      : file.mimetype.includes('webp')
        ? '.webp'
        : '.jpg';

  const safeFolder: ImageUploadFolder = folder === 'slabs' ? 'slabs' : 'products';
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`;
  const objectPath = `stonepulse/${safeFolder}/${fileName}`;

  if (isFirebaseStorageReady()) {
    const bucket = getStorageBucket();
    if (bucket) {
      try {
        const gcsFile = bucket.file(objectPath);
        await gcsFile.save(file.buffer, {
          contentType: file.mimetype,
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });
        await gcsFile.makePublic().catch(() => undefined);
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
        return {
          url: publicUrl,
          provider: 'firebase-storage',
          path: objectPath,
          mimeType: file.mimetype,
          sizeBytes: file.buffer.length,
        };
      } catch (err) {
        console.warn('Firebase Storage upload fell back to inline image:', err);
      }
    }
  }

  const base64 = file.buffer.toString('base64');
  return {
    url: `data:${file.mimetype};base64,${base64}`,
    provider: 'inline-fallback',
    path: objectPath,
    mimeType: file.mimetype,
    sizeBytes: file.buffer.length,
  };
}
