export interface ImageKitStatus {
  configured: boolean;
  provider: 'imagekit';
  urlEndpoint: string | null;
  reason?: string;
}

export interface ImageKitUploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder: string;
}

export interface ImageKitUploadResponse {
  fileId: string;
  url: string;
  filePath: string;
  thumbnailUrl?: string;
}

function getImageKitConfig() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim() || '';
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim() || '';
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim() || '';
  return {privateKey, publicKey, urlEndpoint};
}

export function isImageKitReady(): boolean {
  const {privateKey} = getImageKitConfig();
  return Boolean(privateKey);
}

export function getImageKitStatus(): ImageKitStatus {
  const {privateKey, urlEndpoint} = getImageKitConfig();
  if (!privateKey) {
    return {
      configured: false,
      provider: 'imagekit',
      urlEndpoint: urlEndpoint || null,
      reason: 'IMAGEKIT_PRIVATE_KEY not set yet — using inline base64 fallback for uploads.',
    };
  }
  return {
    configured: true,
    provider: 'imagekit',
    urlEndpoint: urlEndpoint || null,
  };
}

export async function uploadToImageKit(
  params: ImageKitUploadParams,
): Promise<ImageKitUploadResponse> {
  const {privateKey} = getImageKitConfig();
  if (!privateKey) {
    throw new Error('ImageKit is not configured.');
  }

  const form = new FormData();
  const fileBytes = new Uint8Array(params.buffer);
  form.append('file', new Blob([fileBytes], {type: params.mimeType}), params.fileName);
  form.append('fileName', params.fileName);
  form.append('folder', params.folder);
  form.append('useUniqueFileName', 'true');

  const authToken = Buffer.from(`${privateKey}:`, 'utf8').toString('base64');
  const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authToken}`,
    },
    body: form,
  });

  const payload = (await res.json()) as Partial<ImageKitUploadResponse> & {message?: string};
  if (!res.ok || !payload.url) {
    throw new Error(payload.message || `ImageKit upload failed (${res.status})`);
  }

  return {
    fileId: payload.fileId || '',
    url: payload.url,
    filePath: payload.filePath || `${params.folder}/${params.fileName}`,
    thumbnailUrl: payload.thumbnailUrl,
  };
}
