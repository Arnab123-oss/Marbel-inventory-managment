import express from 'express';
import {uploadImage} from '../controllers/uploadController.ts';
import {requireAuth} from '../middleware/auth.ts';
import {upload} from '../middleware/upload.ts';

const router = express.Router();

router.post('/image', requireAuth, upload.single('image'), uploadImage);

export default router;
