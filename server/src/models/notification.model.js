import mongoose from 'mongoose';

/**
 * Thông báo trong-app (chuông thông báo). Ba luồng sinh thông báo hiện tại:
 * 1) Examiner gửi duyệt đề xuất -> báo cho MỌI user role 'leader' đang active
 *    (đề mới chờ duyệt).
 * 2) Leader duyệt/từ chối đề xuất -> báo cho đúng Examiner đã tạo đề xuất đó.
 * 3) Leader đăng chính thức kỳ thi -> báo cho MỌI user đang active, TRỪ
 *    chính người bấm đăng (publisher) và role 'admin'.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['exam_submitted', 'exam_approved', 'exam_rejected', 'exam_published', 'exam_assignment_failed'],
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Truy vấn phổ biến nhất: "thông báo chưa đọc của user X, mới nhất trước" —
// index kép giúp cả đếm unread lẫn liệt kê đều nhanh.
notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);