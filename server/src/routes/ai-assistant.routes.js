import { Router } from 'express';
import * as aiController from '../controllers/ai-assistant.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { aiChatRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.use(authenticate, requirePasswordChanged);

// Admin: cấu hình API ngoài (key, model, prompt)
router.get('/settings', requireRoleCodes('admin'), aiController.getSettings);
router.put('/settings', requireRoleCodes('admin'), aiController.updateSettings);

// Thí sinh: trạng thái + hỏi đáp
router.get('/status', requireRoleCodes('candidate'), aiController.status);
router.post('/chat', requireRoleCodes('candidate'), aiChatRateLimiter, aiController.chat);

export default router;