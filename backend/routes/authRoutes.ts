import express from 'express';
import {
  demoLogin,
  getMe,
  login,
  logout,
  register,
} from '../controllers/authController.ts';

const router = express.Router();

router.get('/me', getMe);
router.post('/login', login);
router.post('/register', register);
router.post('/demo', demoLogin);
router.post('/logout', logout);

export default router;
