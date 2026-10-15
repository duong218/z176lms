/**
 * Router tổng hợp (Root Router) của API Server.
 * Khởi tạo và gắn tiền tố đường dẫn (endpoint path) cho từng phân hệ nghiệp vụ.
 */

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import topicRoutes from './topic.routes.js';
import departmentRoutes from './department.routes.js';
import questionRoutes from './question.routes.js';
import userRoutes from './user.routes.js';
import roleRoutes from './role.routes.js';
import { reportRoutes } from './report.routes.js';
import auditRoutes from './audit.routes.js';
import examRoutes from './exam.routes.js';
import examAttemptRoutes from './exam-attempt.routes.js';
import notificationRoutes from './notification.routes.js';
import studyDocumentRoutes from './study-document.routes.js';
import backupRoutes from './backup.routes.js';
import practiceRoutes from './practice.routes.js';
import analyticsRoutes from './analytics.routes.js';
import aiAssistantRoutes from './ai-assistant.routes.js';

const router = Router();

// --- Phân hệ Xác thực, Người dùng & Phòng ban ---
router.use('/auth', authRoutes);                      // Đăng nhập, đăng xuất, đổi mật khẩu, refresh token
router.use('/users', userRoutes);                     // Quản lý người dùng, thí sinh, import Excel
router.use('/roles', roleRoutes);                     // Danh mục vai trò và quyền hạn
router.use('/departments', departmentRoutes);         // Quản lý danh mục phòng ban, phân xưởng

// --- Phân hệ Ngân hàng Đề & Tài liệu ôn tập ---
router.use('/topics', topicRoutes);                   // Quản lý chuyên môn/chủ đề câu hỏi
router.use('/questions', questionRoutes);             // Quản lý câu hỏi, đáp án, import/export câu hỏi
router.use('/study-documents', studyDocumentRoutes);   // Quản lý và tải tài liệu ôn tập

// --- Phân hệ Tổ chức Thi & Làm bài ---
router.use('/exams', examRoutes);                     // Quản lý kỳ thi, ca thi, danh sách thí sinh, sinh mã đề
router.use('/exam-attempts', examAttemptRoutes);       // Quá trình làm bài thi, lưu đáp án, nộp bài, xem kết quả

// --- Phân hệ Báo cáo, Giám sát & Quản trị Hệ thống ---
router.use('/reports', reportRoutes);                 // Báo cáo thống kê điểm thi, tỷ lệ hoàn thành
router.use('/notifications', notificationRoutes);     // Thông báo hệ thống gửi tới người dùng
router.use('/audit-logs', auditRoutes);               // Nhật ký thao tác bảo mật và kiểm toán hệ thống
router.use('/backups', backupRoutes);                 // Quản lý sao lưu/khôi phục CSDL lên Google Drive

router.use('/practice', practiceRoutes);
router.use('/analytics', analyticsRoutes);           // Phân tích chất lượng câu hỏi & bản đồ năng lực
router.use('/ai-assistant', aiAssistantRoutes);       // Trợ lý AI hỏi đáp theo tài liệu ôn tập (Admin cấu hình, Thí sinh dùng)

export default router;