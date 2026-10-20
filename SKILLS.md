# SKILLS.md — Quy ước kỹ thuật và Nguyên tắc phát triển
## Hệ Thống Thi Trắc Nghiệm Chuyên Môn Nội Bộ — Nhà Máy Z176
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam  
**Dự án:** Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176

**Mục đích:** Là bộ quy tắc và chuẩn mực kỹ thuật bắt buộc dành cho lập trình viên và AI Coding Assistant khi phát triển, bảo trì mã nguồn trong dự án. Đảm bảo toàn bộ hệ thống nhất quán về kiến trúc, tuân thủ an toàn thông tin và quy chuẩn nghiệp vụ.

---

## 1. Công nghệ sử dụng chính thức (Tech Stack)

| Thành phần | Lựa chọn chính thức | Chi tiết kỹ thuật & Thư viện |
|---|---|---|
| **Frontend** | React 19 + Vite | SPA hiệu năng cao, React Context cho state toàn cục (`ToastContext`, `ConfirmContext`). |
| **Styling & UI** | Tailwind CSS v4 | Thiết kế tối giản, responsive mobile-first, Lucide React icons, Lenis smooth scroll, Motion micro-animations, Recharts trực quan hóa biểu đồ, Mermaid.js (dựng sơ đồ tư duy mindmap), Web Speech API (nhận diện giọng nói và Text-to-Speech). |
| **Backend** | Node.js (>=22 <25) + Express.js | Kiến trúc phân lớp rõ ràng: Router - Middleware - Controller - Service - Model. |
| **Database** | MongoDB Atlas & Mongoose ODM | Lưu trữ CSDL NoSQL (16 Models quan hệ chặt chẽ, tối ưu compound index và partial unique index). |
| **Trợ lý AI & LLM** | OpenAI API / Gemini Compatible | Tích hợp Trợ lý AI hỏi đáp tài liệu, sinh đề thi trắc nghiệm ngầm (`unpdf`, `mammoth`, `xlsx`), và phân tích độ sẵn sàng/báo cáo kỳ thi. |
| **Xác thực & Bảo mật** | JWT kép + Cookie HttpOnly + Helmet | `accessToken` (15 phút, gửi Header) + `refreshToken` (7 ngày, httpOnly cookie) + `tokenVersion` (thu hồi phiên tức thì) + `helmet` bảo vệ HTTP headers. |
| **Giới hạn tần suất** | express-rate-limit (Keyed) | Đăng nhập: giới hạn theo `IP + username` chỉ tính lần thất bại; Phòng thi: 100 req/phút theo **userId**; Trợ lý AI: 20 req/phút theo **userId**. |
| **Tệp tin & Đa phương tiện**| Cloudinary + Multer + mammoth + unpdf + exceljs/xlsx | Upload ảnh câu hỏi đám mây qua RAM (hash SHA-256 không lưu đĩa); bóc tách tài liệu PDF/Word (.docx) nhận diện đáp án gạch chân; đọc/xuất file Excel báo cáo & nhân sự; lưu tài liệu ôn tập trên đĩa nội bộ. |
| **Tiến trình tự động (Cron)** | node-cron (Múi giờ Asia/Ho_Chi_Minh) | 1. Backup CSDL lên Google Drive lúc 03:00 (`0 3 * * *`).<br>2. Xóa tài khoản khóa lâu >6 tháng lúc 04:00 (`0 4 * * *`).<br>3. Dọn file upload tạm quá 6h mỗi giờ (`0 * * * *`).<br>4. Quét tự nộp bài thi dở dang mỗi phút (`* * * * *`). |

---

## 2. Cấu trúc thư mục chuẩn của dự án

```text
HethongZ176/
├── client/                              # Ứng dụng Frontend React 19 + Vite
│   ├── public/templates/                # File Excel mẫu chuẩn (Mau_Import_Cau_Hoi, Mau_Import_Nhan_Vien)
│   └── src/
│       ├── components/
│       │   ├── admin/                   # AccountTab, AiSettingsTab, AuditLogTab, BackupTab, OverviewTab
│       │   ├── candidate/               # AiAssistantChat, PracticeTab, ExamTab, ResultHistoryTab, RoleSelectionModal
│       │   ├── examiner/                # DepartmentTab, ExamProposalTab, GenerationProgress, OverviewTab, QuestionBankTab, QuestionGeneratorTab, StudyDocumentTab, TopicTab
│       │   ├── leader/                  # AiAssistantChat, ReadinessSection, DepartmentReportTab, DetailedResultsTab, ExamReportTab, ExamReviewTab, OverviewTab
│       │   ├── common/                  # FirstTimeGuideModal, Select, SessionRevokedModal
│       │   ├── ConfirmDialog.jsx        # Dialog xác nhận chuẩn thay thế window.confirm()
│       │   ├── ExamModal.jsx            # Giao diện làm bài thi toàn màn hình (autosave, heartbeat 15s, cảnh báo 10s rời tab)
│       │   └── ToastContext.jsx         # Quản lý thông báo toast toàn hệ thống
│       ├── lib/                         # examPhase.js, mdTable.js, speech.js (Web Speech API)
│       ├── pages/                       # AdminDashboard, CandidateDashboard, ExaminerDashboard, LeaderDashboard
│       ├── stores/                      # question-generation.store.js
│       └── services/                    # Tầng giao tiếp API (ai-assistant.service, api, auth, admin, examiner, exam-attempt...)
│
├── server/                              # Ứng dụng Backend Express.js REST API
│   ├── src/
│   │   ├── config/                      # db.js, env.js (validate runtime env)
│   │   ├── controllers/                 # ai-assistant.controller, auth, user, exam, question, report...
│   │   ├── middlewares/                 # auth.middleware, rate-limit.middleware (aiChatRateLimiter), upload.middleware
│   │   ├── models/                      # 16 Mongoose Schemas (AiSetting, User, Role, Employee, Department, Topic, Question, Exam...)
│   │   ├── routes/                      # Định tuyến RESTful API (/api/* bao gồm /api/ai-assistant)
│   │   ├── services/                    # Nghiệp vụ cốt lõi, AI LLM & Cron Schedulers:
│   │   │   ├── ai-assistant.service.js  # Trợ lý AI hỏi đáp tài liệu, sinh đề thi & phân tích báo cáo
│   │   │   ├── question-file-builder.js # Đóng gói câu hỏi sinh bởi AI ra file Excel/Word
│   │   │   ├── exam.service.js          # Vòng đời đề xuất, duyệt, xuất bản, lưu trữ kỳ thi
│   │   │   ├── exam-attempt.service.js  # Luồng thi, autosave, heartbeat, nộp bài, tính điểm
│   │   │   ├── question.service.js      # Ngân hàng đề, chuyển đổi usage, import Excel & Word (.docx)
│   │   │   ├── backup.scheduler.js      # Lập lịch sao lưu Drive 03:00 hàng ngày
│   │   │   ├── account-purge.scheduler.js # Lập lịch dọn tài khoản khóa 04:00 hàng ngày
│   │   │   ├── upload-cleanup.scheduler.js# Lập lịch dọn file tạm mỗi giờ
│   │   │   └── abandoned-attempt.scheduler.js # Quét tự nộp bài bỏ rơi mỗi phút
│   │   └── utils/                       # ApiError, asyncHandler
│
├── structure/                           # Tài liệu chi tiết kiến trúc (client.md, server.md)
├── GLOSSARY.md                          # Bảng thuật ngữ nghiệp vụ & tên Model chuẩn hóa
├── SECURITY_BASELINE.md                 # Checklist chuẩn an ninh tối thiểu
├── security_report.md                   # Báo cáo đánh giá bảo mật toàn diện
└── BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md# Đặc tả yêu cầu nghiệp vụ và hệ thống
```

---

## 3. Quy chuẩn lập trình (Coding Conventions)

1. **Phân chia trách nhiệm (Controller mỏng — Service dày):**
   * **Controller**: Nhận input (`req.params`, `req.query`, `req.body`), kiểm tra cú pháp cơ bản, gọi Service thực thi nghiệp vụ, ghi Audit Log (nếu là hành động nhạy cảm) và trả về response JSON thống nhất: `{ success: true, message, data }`.
   * **Service**: Chứa toàn bộ business logic, validate ràng buộc, truy vấn CSDL qua Model, ném lỗi qua `throw new ApiError(statusCode, message, code)`.
2. **Quy chuẩn ghi Audit Log:**
   * Ghi **tập trung tại Controller** sau khi service hoàn thành thao tác thành công (tránh ghi trùng lặp ở service).
   * Sử dụng mã hành động chuẩn tiếng Anh (`CREATE_USER`, `LOCK_USER`, `UPDATE_QUESTION`, `BULK_MOVE_QUESTIONS`, `PUBLISH_EXAM`, `BACKUP_RESTORE`...) và luôn truyền đầy đủ `actorUserId: req.auth.userId`, `resourceType`, `resourceId`, `metadata`, và `ipAddress`.
3. **Quy chuẩn kiểm soát trạng thái nguyên tử (Atomic State Transitions):**
   * Mọi thao tác đổi trạng thái kỳ thi (`draft` -> `pending_review` -> `approved` -> `published` -> `archived`) bắt buộc dùng `findOneAndUpdate` kèm điều kiện trạng thái hiện tại và tăng `__v` (`$inc: { __v: 1 }`).
   * Sử dụng khóa phát hành `publishLockedAt` (TTL 10 phút) để chặn tranh chấp khi nhiều Leader phát hành cùng lúc.
4. **Quy chuẩn xử lý nhân viên kiêm nhiệm & Khóa vai trò thi:**
   * Nhân viên có thể có nhiều phòng ban (`departmentId` chính và `extraDepartmentIds`).
   * Khi bắt đầu làm bài, thí sinh kiêm nhiệm phải xác nhận vai trò thi; hệ thống ghi nhận `roleConfirmedAt` và `roleChosenBy` trên `ExamCandidate`. Sau khi khóa, chỉ có Leader mới có quyền đổi lại vai trò khi cấp thêm lượt thi.
5. **Naming Conventions:**
   * `camelCase` cho biến, hàm, tham số (ví dụ: `loadData`, `allowCommonCompensation`, `examCandidateId`).
   * `PascalCase` cho React Components, Context và Mongoose Models (ví dụ: `AccountTab`, `ExamAttempt`, `AttemptQuestion`).
   * `UPPER_SNAKE_CASE` cho hằng số và Enum (ví dụ: `QUESTION_SCOPE`, `QUESTION_USAGE`, `EXAM_STATUS`).
   * `kebab-case` cho tên file routes và services (ví dụ: `exam-attempt.service.js`, `study-document.routes.js`).
6. **React Performance & Hooks:**
   * Bọc các hàm fetch dữ liệu trong `useCallback` khi truyền vào `useEffect` dependency.
   * Sử dụng `useRef` lưu các giá trị filter/search không cần kích hoạt re-render để tránh spam API.
   * Ưu tiên dùng `useConfirm()` từ `ConfirmDialog.jsx` thay vì `window.confirm()`.
   * Luôn khóa thanh cuộn khi mở modal qua hook `useScrollLock`.

---

## 4. Danh sách Nguyên tắc cứng (Bảo mật & Toàn vẹn) 🔒

Các nguyên tắc sau đây **tuyệt đối không được vi phạm**:

1. 🔒 **Bảo mật đề thi & Zero Client Trust:** Không bao giờ trả về trường đáp án đúng (`isCorrect`) về client của Thí sinh trước hoặc trong khi đang làm bài thi. Toàn bộ việc chấm điểm phải được thực thi 100% tại Server dựa trên snapshot `AttemptQuestion`.
2. 🔒 **Sinh số ngẫu nhiên an toàn:** Tuyệt đối không dùng `Math.random()` cho thuật toán trộn câu hỏi, xáo trộn đáp án hoặc sinh mã ngẫu nhiên liên quan đến bảo mật — phải sử dụng thuật toán xáo trộn an toàn Fisher–Yates shuffle và `crypto`.
3. 🔒 **Xác thực & Phân quyền đa lớp:** Mọi API thao tác dữ liệu đều phải đi qua `authenticate` (kiểm tra JWT + `tokenVersion`), `requirePasswordChanged` và `requireRoleCodes(...)` để kiểm soát đúng quyền hạn của từng vai trò (`admin`, `examiner`, `leader`, `candidate`).
4. 🔒 **Thu hồi phiên làm việc tức thì:** Khi tài khoản đăng nhập ở thiết bị mới, đổi mật khẩu hoặc bị admin khóa/reset mật khẩu, trường `tokenVersion` trên model `User` phải được tăng lên (`+1`) để vô hiệu hóa toàn bộ phiên cũ trên các thiết bị khác.
5. 🔒 **Kiểm soát độc bản kỳ thi phát hành:** Database chỉ cho phép duy nhất 1 kỳ thi ở trạng thái `published` tại một thời điểm nhờ partial unique index `uniq_single_published_exam`. Khi phát hành kỳ thi mới, kỳ thi cũ phải được chuyển sang `archived` và tự động thu bài các ca thi dở dang.
6. 🔒 **Bảo toàn dữ liệu kiểm toán khi dọn dẹp:** Cron job dọn tài khoản khóa lâu ngày tuyệt đối không xóa các tài khoản đã từng có lịch sử thi (`ExamCandidate > 0`) hoặc từng xuất hiện trong nhật ký kiểm toán (`AuditLog > 0`).
7. 🔒 **Không rò rỉ dữ liệu nhạy cảm:** Không in log mật khẩu, đáp án đề thi hoặc stacktrace lỗi nội bộ ra response client ở môi trường production.
8. 🔒 **Không dùng tài khoản thật khi kiểm thử:** Dữ liệu thử nghiệm hoặc mock data cho AI chỉ dùng thông tin giả lập, không sử dụng dữ liệu định danh thật của cán bộ, công nhân viên Nhà máy Z176.
9. 🔒 **An toàn Trợ lý AI & Cô lập dữ liệu (AI Data Isolation):** Khi thí sinh hỏi đáp kiến thức cùng AI, backend chỉ được trích xuất nội dung từ các tài liệu (`StudyDocument`) thuộc phòng ban của thí sinh đó (hoặc phòng ban kiêm nhiệm) để đưa vào context; tuyệt đối không để lộ tài liệu của phòng ban khác.
10. 🔒 **Kiểm duyệt 2 bước khi AI tạo câu hỏi (Human-in-the-loop):** Câu hỏi trắc nghiệm do Trợ lý AI tạo ra từ tài liệu PDF/Word tuyệt đối không được ghi trực tiếp vào cơ sở dữ liệu chính thức, mà bắt buộc phải đóng gói xuất ra tệp Excel/Word (`QuestionFileBuilder`) để Người ra đề (Examiner) kiểm tra, xác thực chuyên môn quân sự trước khi import vào hệ thống.

---
*Bản quyền sản phẩm thuộc về tác giả Phạm Ngọc Dương - Sinh viên K67 - Khoa Công nghệ thông tin - Học viện Nông nghiệp Việt Nam.*


