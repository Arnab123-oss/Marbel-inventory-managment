import {api} from '../services/api';

export const DEFAULT_PRODUCT_IMAGE =
  '/src/assets/images/default_stone_product_1795112915212.jpg';

export function resolveProductImage(imageUrl?: string | null): string {
  const trimmed = imageUrl?.trim();
  return trimmed ? trimmed : DEFAULT_PRODUCT_IMAGE;
}

function resizeImageToBlob(file: File): Promise<{blob: Blob; dataUrl: string}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Empty image data.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 400;
          let {width, height} = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({blob: file, dataUrl: rawDataUrl});
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          canvas.toBlob(
            (blob) => {
              resolve({blob: blob || file, dataUrl});
            },
            'image/jpeg',
            0.85,
          );
        } catch {
          resolve({blob: file, dataUrl: rawDataUrl});
        }
      };
      img.onerror = () => resolve({blob: file, dataUrl: rawDataUrl});
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const {dataUrl} = await resizeImageToBlob(file);
  return dataUrl;
}

export async function uploadProductOrSlabImage(
  file: File,
  folder: 'products' | 'slabs' = 'products',
): Promise<string> {
  const {blob, dataUrl} = await resizeImageToBlob(file);
  try {
    const uploadFile = new File([blob], file.name || 'image.jpg', {
      type: blob.type || 'image/jpeg',
    });
    const uploaded = await api.uploadImage(uploadFile, folder);
    return uploaded.url || dataUrl;
  } catch {
    return dataUrl;
  }
}
