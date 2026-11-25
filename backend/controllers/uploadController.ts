import type {Request, Response} from 'express';
import {
  uploadImageToStorage,
  type ImageUploadFolder,
} from '../services/storageService.ts';

export const uploadImage = async (req: Request, res: Response) => {
  try {
    const file = (req as Request & {file?: Express.Multer.File}).file;
    if (!file) {
      return res.status(400).json({error: 'Image file is required.'});
    }

    const rawFolder = (req.body as {folder?: string} | undefined)?.folder;
    const folder: ImageUploadFolder = rawFolder === 'slabs' ? 'slabs' : 'products';

    const result = await uploadImageToStorage(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      folder,
    );

    return res.status(201).json(result);
  } catch (error) {
    console.error('Upload image error:', error);
    return res.status(400).json({error: (error as Error).message});
  }
};
