import express from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = express.Router();

router.use(authenticate, requirePasswordChanged);

// Người ra đề: xem đáp án đúng/sai từng câu nên KHÔNG mở cho thí sinh.
router.get('/questions', requireRoleCodes('examiner', 'admin'), analyticsController.questions);
// Người duyệt đề: chỉ số liệu gộp theo phòng ban, không có định danh cá nhân.
router.get('/department-competency', requireRoleCodes('leader', 'admin'), analyticsController.departmentCompetency);
// Người duyệt đề: tỷ lệ thí sinh đã luyện tập theo phòng ban (chỉ số gộp, không có định danh cá nhân).
router.get('/practice-readiness', requireRoleCodes('leader', 'admin'), analyticsController.practiceReadiness);
// Người duyệt đề: dấu hiệu bất thường (có tên thí sinh, chỉ là gợi ý để xem xét). KHÔNG mở cho thí sinh/người ra đề.
router.get('/anomalies', requireRoleCodes('leader', 'admin'), analyticsController.anomalies);
// Thí sinh: chỉ xem của chính mình (userId lấy từ token, không nhận từ query).
router.get('/my-competency', requireRoleCodes('candidate'), analyticsController.myCompetency);

export default router;