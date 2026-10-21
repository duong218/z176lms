import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { publicLookupRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// PUBLIC — trang chủ "Tra cứu kết quả thi", không yêu cầu đăng nhập.
// Đặt TRƯỚC router.use(authenticate, ...) bên dưới, giống route /my-results,
// nếu không middleware sẽ chặn luôn các route này.
router.get('/public/by-department', reportController.getPublicResultsByDepartment);
router.get('/public/lookup', publicLookupRateLimiter, reportController.lookupPublicResult);

// Thí sinh xem lịch sử kết quả thi CỦA CHÍNH MÌNH.
// Đặt route này TRƯỚC router.use(...) bên dưới — nếu để sau, middleware
// requireRoleCodes('leader', 'admin') sẽ áp dụng luôn cho route này và
// chặn mọi thí sinh (role 'candidate') truy cập.
router.get('/my-results', authenticate, requireRoleCodes('candidate'), reportController.getMyResults);

// Người duyệt đề và Admin có quyền xem báo cáo tổng hợp toàn hệ thống
router.use(authenticate, requireRoleCodes('leader', 'admin'));

router.get('/overview', reportController.getOverviewStats);
router.get('/by-department', reportController.getResultsByDepartment);
router.get('/topics', reportController.getTopicOptions);
router.get('/by-exam', reportController.getResultsByExam);
router.get('/results', reportController.getDetailedResults);
router.get('/export', reportController.exportDetailedResultsExcel);
router.get('/export-by-exam', reportController.exportResultsByExamExcel);

export const reportRoutes = router;