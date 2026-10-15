/**
 * Điểm tập trung xuất khẩu (Export Barrel) toàn bộ Mongoose Models và hằng số của CSDL.
 */

// Nhóm Tài khoản, Phân quyền & Nhân sự
export { Role } from './role.model.js';
export { User } from './user.model.js';
export { Department } from './department.model.js';
export { Employee } from './employee.model.js';

// Nhóm Ngân hàng câu hỏi & Chủ đề
export { Topic } from './topic.model.js';
export { Question } from './question.model.js';
export { Answer } from './answer.model.js';

// Nhóm Cấu trúc Đề thi & Danh sách thí sinh
export { Exam } from './exam.model.js';
export { ExamCode } from './exam-code.model.js';
export { ExamCodeQuestion } from './exam-code-question.model.js';
export { ExamCandidate } from './exam-candidate.model.js';

// Nhóm Lượt thi, Bài làm & Điểm số
export { ExamAttempt } from './exam-attempt.model.js';
export { AttemptQuestion } from './attempt-question.model.js';
export { CandidateAnswer } from './candidate-answer.model.js';
export { Result } from './result.model.js';

// Nhóm Tài liệu học tập, Lịch trình, Nhật ký & Thông báo
export { StudyDocument } from './study-document.model.js';
export { Schedule } from './schedule.model.js';
export { AuditLog } from './audit-log.model.js';
export { Notification } from './notification.model.js';
export { AiSetting } from './ai-setting.model.js';

// Hằng số định nghĩa vai trò, trạng thái, mã lỗi CSDL
export * from './constants.js';