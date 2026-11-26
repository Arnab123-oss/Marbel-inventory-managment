import crypto from 'node:crypto';
import path from 'node:path';
import {isImageKitReady, uploadToImageKit} from './imagekitService.ts';

export type ImageUploadFolder = 'products' | 'slabs';

export interface UploadedImageResult {
  url: string;
  provider: 'imagekit' | 'inline-fallback';
  path: string;
  mimeType: string;
  sizeBytes: number;
  fileId?: string;
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
  const folderPath = `/stonepulse/${safeFolder}`;
  const objectPath = `stonepulse/${safeFolder}/${fileName}`;

  if (isImageKitReady()) {
    try {
      const uploaded = await uploadToImageKit({
        buffer: file.buffer,
        fileName,
        mimeType: file.mimetype,
        folder: folderPath,
      });
      return {
        url: uploaded.url,
        provider: 'imagekit',
        path: uploaded.filePath || objectPath,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        fileId: uploaded.fileId,
      };
    } catch (err) {
      console.warn('ImageKit upload fell back to inline image:', err);
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
