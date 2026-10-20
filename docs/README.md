# Z176 — Module thi chuyên môn (Hệ thống thực tế)

Thư mục này chứa tài liệu đặc tả kỹ thuật, mô hình dữ liệu, cơ chế bảo mật và quy trình vận hành chính thức của hệ thống thi trắc nghiệm chuyên môn nội bộ Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng.

---

## 1. Cấu trúc Tài liệu Dự án

- **Tài liệu Yêu cầu & Quy trình tổng thể**:
  - [BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md](file:///d:/code%20file/Z176-main/BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md) — Đặc tả yêu cầu nghiệp vụ (BRS) & phần mềm (SRS) chuẩn hóa toàn hệ thống.
  - [dieu-phoi-quy-trinh-lam-viec.md](file:///d:/code%20file/Z176-main/dieu-phoi-quy-trinh-lam-viec.md) — Sổ tay điều phối và quy trình chuẩn bị/tổ chức đợt thi.
  - [SECURITY_BASELINE.md](file:///d:/code%20file/Z176-main/SECURITY_BASELINE.md) — Tiêu chuẩn kiểm soát an toàn thông tin & bảo mật cấp quân đội.
  - [security_report.md](file:///d:/code%20file/Z176-main/security_report.md) — Báo cáo đánh giá bảo mật & danh mục kiểm toán an ninh.
  - [SKILLS.md](file:///d:/code%20file/Z176-main/SKILLS.md) — Hướng dẫn kiến trúc, quy tắc phát triển cốt lõi và tech stack cho lập trình viên/Agent.
  - [design/design-system.md](file:///d:/code%20file/Z176-main/design/design-system.md) — Hệ thống thiết kế chuẩn UI/UX cho người dùng 30–60 tuổi (Inter, 5 màu chức năng, Mobile-first).

- **Tài liệu Kỹ thuật Chi tiết (`docs/`)**:
  - [ACTIVE.md](file:///d:/code%20file/Z176-main/docs/ACTIVE.md) — Đặc tả chi tiết luồng hoạt động 4 vai trò (Admin, Examiner, Leader, Candidate), bảng mã lỗi và tích hợp Trợ lý AI (Mindmap Mermaid, sinh đề AI, hỏi đáp báo cáo).
  - [MONGOOSE_SCHEMA.md](file:///d:/code%20file/Z176-main/docs/MONGOOSE_SCHEMA.md) — Mô hình cơ sở dữ liệu MongoDB/Mongoose (ERD, Collections, Indexing, `AiSetting`, `PracticeSession`).
  - [AUTH_API.md](file:///d:/code%20file/Z176-main/docs/AUTH_API.md) — Cơ chế xác thực Dual Token (JWT in-memory + HttpOnly Cookie), quản lý phiên đơn lẻ (`tokenVersion`), và Rate Limiting (`aiChatRateLimiter`).
  - [sinh-de-tu-dong.md](file:///d:/code%20file/Z176-main/docs/sinh-de-tu-dong.md) — Thuật toán sinh đề tự động, cơ chế bù câu hỏi chung (`allowCommonCompensation`), phạm vi phòng ban, và khóa concurrency (`publishLockedAt`).
  - [luong-lam-bai-thi.md](file:///d:/code%20file/Z176-main/docs/luong-lam-bai-thi.md) — Luồng thi trắc nghiệm realtime: phòng ban đóng băng, autosave, heartbeat 15s, theo dõi rời màn hình (`leaveCount`) và 3 tầng tự động nộp bài chống gian lận.
  - [THNGOAILE.md](file:///d:/code%20file/Z176-main/docs/THNGOAILE.md) — Tổng hợp các tình huống ngoại lệ (Edge Cases) đã khắc phục (bao gồm an toàn Trợ lý AI & context window) và các hạn chế kỹ thuật của hệ thống.

---

## 2. Cấu trúc Mã nguồn Dự án

- **[client/](file:///d:/code%20file/Z176-main/client)** — Ứng dụng Frontend React 19 + Vite + Tailwind CSS v4.
  - Thiết kế Mobile-first, font chữ tối thiểu 16px, bảng màu nghiêm túc.
  - Thành phần phòng thi toàn màn hình `ExamModal.jsx`, quản lý thông báo `ToastContext.jsx`, hộp thoại xác nhận `ConfirmDialog.jsx`.
- **[server/](file:///d:/code%20file/Z176-main/server)** — Ứng dụng Backend Node.js / Express API + MongoDB/Mongoose.
  - Kiến trúc phân lớp: Controllers, Services, Models, Routes, Middlewares, Schedulers.
  - Hệ thống 4 tác vụ định kỳ tự động (`node-cron`): Backup Google Drive (03:00), Cleanup file tạm (mỗi 1h), Purge tài khoản khóa > 6 tháng (04:00), và Quét bài thi bị bỏ dở (mỗi 1 phút).

---

## 3. Khởi chạy Nhanh (Môi trường Dev)

### Terminal 1 — Backend (Server)
```bash
cd server
npm install
# Tạo và cấu hình tệp .env (tham khảo .env.example)
# Chạy server ở chế độ phát triển (watch mode)
npm run dev
```

### Terminal 2 — Frontend (Client)
```bash
cd client
npm install
# Chạy ứng dụng Vite dev server (cổng 3000)
npm run dev
```

---

## 4. Quy ước Phát triển Cốt lõi
1. **Bảo mật Thông tin Quân sự**: Tuyệt đối không lưu dữ liệu người dùng thật hoặc tài liệu nội bộ nhà máy lên dịch vụ đám mây công cộng (tài liệu ôn tập được lưu trữ trực tiếp trên ổ đĩa máy chủ nội bộ `uploadDir`).
2. **Nguyên tắc Đơn phiên & Chống gian lận**: Mọi tài khoản chỉ được đăng nhập trên 1 thiết bị/trình duyệt tại một thời điểm (`tokenVersion`). Mọi bài thi đều được giám sát qua 3 tầng (Client 10s, Server 60s, Scheduler 1 phút).
3. **Tuân thủ Design System**: Không tự ý thêm gradient, dark mode, hoặc các màu ngoài 5 màu chức năng quy định. Ưu tiên cỡ chữ lớn (>= 16px) và vùng chạm tối thiểu 44×44px cho người dùng 30–60 tuổi.

