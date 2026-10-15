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

// Thí sinh / Người duyệt đề: trạng thái bật-tắt
router.get('/status', requireRoleCodes('candidate', 'leader'), aiController.status);
// Thí sinh: hỏi đáp theo tài liệu phòng ban
router.post('/chat', requireRoleCodes('candidate'), aiChatRateLimiter, aiController.chat);
// Người duyệt đề: hỏi đáp trên số liệu báo cáo toàn công ty
router.post('/leader-chat', requireRoleCodes('leader'), aiChatRateLimiter, aiController.leaderChat);

export default router;