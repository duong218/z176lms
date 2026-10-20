# Cấu trúc server

## Phạm vi

`server/` là hệ thống Backend RESTful API xây dựng trên nền tảng Node.js (`>=22 <25`), Express và cơ sở dữ liệu MongoDB thông qua Mongoose ODM.
Hệ thống sử dụng cơ chế xác thực JWT kép (Access Token ngắn hạn + Refresh Token HttpOnly Cookie), mã hoá mật khẩu `bcryptjs` / `bcrypt`, quản lý lưu trữ tệp tin tải lên (Multer + Cloudinary SDK), bóc tách Word (.docx) bằng `mammoth`, xử lý định dạng tệp Excel bằng `exceljs` / `xlsx`, bảo mật tầng mạng bằng `helmet`, `cors`, `rate-limit`, và tự động hóa quy trình sao lưu dữ liệu lên Google Drive cá nhân thông qua Google OAuth2 (`googleapis`).

```text
server/
├── .env.example                                    # Mẫu khai báo biến môi trường (không chứa giá trị nhạy cảm)
├── package.json                                    # Quản lý dependencies, engines và scripts (dev, start, seed, backup)
├── package-lock.json                               # Lockfile quản lý phiên bản gói npm
├── test/
│   ├── test-analytics.mjs                          # Kiểm thử service phân tích bằng dữ liệu giả lập (node test/test-analytics.mjs): hàm thuần computeQuestionStats, tallyByTopic, buildTopicCompetency, pickWeakest, detectAnomalies và luồng DB giả lập getMyCompetency, getDepartmentCompetency, getQuestionAnalysis, getAnomalies
│   └── test_rate_limit.js                          # Kịch bản kiểm thử tự động cơ chế Rate Limiting
└── src/
    ├── app.js                                      # Khởi tạo Express app: Helmet, CORS, cookie parser, JSON body, mount routes, global error handler
    ├── index.js                                    # Entry point máy chủ: validate biến môi trường, kết nối MongoDB, chạy seed khởi tạo, đăng ký cron schedulers, lắng nghe cổng
    ├── config/
    │   ├── db.js                                   # Thiết lập kết nối MongoDB qua Mongoose với auto reconnect & event loggers
    │   └── env.js                                  # Định nghĩa, validate và export cấu hình môi trường (port, JWT secrets/TTL, DB URI, CORS origin, Cloudinary, Google OAuth2...)
    ├── controllers/
    │   ├── ai-assistant.controller.js              # Xử lý request Trợ lý AI: cấu hình API key/model/prompt (Admin), kiểm tra trạng thái bật/tắt (Public/Auth), hỏi đáp theo tài liệu phòng ban (Thí sinh), hỏi đáp trên số liệu báo cáo toàn công ty (Người duyệt đề), sinh câu hỏi trắc nghiệm ra file Word/Excel từ tài liệu ôn tập (Người ra đề)
    │   ├── analytics.controller.js                 # Xử lý request phân tích: chất lượng câu hỏi (Người ra đề), năng lực theo phòng ban (Người duyệt đề), dấu hiệu bất thường theo kỳ thi (Người duyệt đề), năng lực cá nhân (Thí sinh)
    │   ├── audit.controller.js                     # Xử lý request tra cứu nhật ký hệ thống (phân trang, lọc theo action/user/resource/thời gian)
    │   ├── auth.controller.js                      # Xử lý request xác thực: đăng nhập, refresh token, đăng xuất, lấy hồ sơ cá nhân (/me), đổi mật khẩu
    │   ├── backup.controller.js                    # Xử lý request sao lưu: danh sách bản lưu trên Drive, tạo sao lưu mới, tải về máy, khôi phục từ file .gz
    │   ├── department.controller.js                # Xử lý request CRUD phòng ban: bắt buộc cả tên và mã phòng ban (code chuẩn hóa), ngừng sử dụng (xóa mềm) và khôi phục
    │   ├── exam.controller.js                      # Xử lý request kỳ thi: tạo dự thảo, cấu hình phạm vi phòng ban dự thi (departmentScope: all/selected, allowedDepartmentIds), công tắc bù câu chung (allowCommonCompensation), chỉnh sửa đề xuất, nộp duyệt, phê duyệt, từ chối, kiểm tra tác động publish-check, phát hành, lưu trữ, lấy kỳ thi active
    │   ├── exam-attempt.controller.js              # Xử lý request lượt thi: lấy đề thi, bắt đầu/resume (chặn thí sinh ngoài phạm vi với CANDIDATE_OUT_OF_SCOPE, chọn vai trò/phòng ban), nộp bài, autosave đáp án, heartbeat 15s, lấy danh sách vai trò để cấp lượt (role-options) và cấp thêm lượt kèm đổi vai trò
    │   ├── notification.controller.js              # Xử lý request thông báo: danh sách, đếm chưa đọc, đánh dấu đã đọc / đọc tất cả
    │   ├── practice.controller.js                  # Xử lý request luyện tập cá nhân: lấy chủ đề khả dụng, xem tiến độ, chuỗi ngày & huy hiệu (achievements), bắt đầu phiên, kiểm tra tức thì, nộp bài, bỏ bài
    │   ├── question.controller.js                  # Xử lý request ngân hàng câu hỏi: CRUD, import Excel 2 bước (preview -> confirm), import Word (.docx) 2 bước (preview bóc tách gạch chân -> confirm ghi đè), upload ảnh Cloudinary, chuyển ngân hàng hàng loạt (thi/ôn tập), thống kê theo chủ đề, xóa hàng loạt
    │   ├── report.controller.js                    # Xử lý request báo cáo: tổng quan, theo phòng ban, theo kỳ thi, chi tiết bảng điểm, xuất Excel, tra cứu kết quả công khai, lịch sử thí sinh
    │   ├── role.controller.js                      # Xử lý request lấy danh mục vai trò người dùng (roles)
    │   ├── study-document.controller.js            # Xử lý request tài liệu ôn tập: CRUD, xem/tải file (inline/download), phân quyền tài liệu cho thí sinh
    │   ├── topic.controller.js                     # Xử lý request CRUD chủ đề thi (kèm cascade ẩn câu hỏi khi xóa mềm và tự động khôi phục)
    │   └── user.controller.js                      # Xử lý request quản lý tài khoản: CRUD user, sửa phòng ban chính/kiêm nhiệm (updateDepartments), import Excel 2 bước (xử lý phòng ban kiêm nhiệm & tạo phòng thiếu kèm mã), xuất Excel credentials, phân role, khóa/mở, reset password
    ├── middlewares/
    │   ├── auth.middleware.js                       # Xác thực JWT (authenticate), kiểm tra tokenVersion phát hiện đăng nhập nơi khác, phân quyền role (requireRoleCodes)
    │   ├── rate-limit.middleware.js                 # Giới hạn tần suất: loginRateLimiter (chống brute force), examAttemptRateLimiter (theo userId, chống spam phòng thi lớn), aiChatRateLimiter (chống spam gọi API AI)
    │   ├── require-password-changed.middleware.js   # Chặn truy cập API nghiệp vụ nếu tài khoản chưa đổi mật khẩu mặc định (mustChangePassword = true)
    │   └── upload.middleware.js                     # Multer middleware: uploadExcel (file .xlsx/.xls), uploadWord (file .docx), uploadQuestionImage (ảnh câu hỏi), uploadStudyDocument (tài liệu ôn tập)
    ├── models/
    │   ├── index.js                                # Re-export tất cả Schema Models và hằng số constants
    │   ├── constants.js                            # Enum constants: QUESTION_SCOPE, QUESTION_KIND, QUESTION_USAGE, ANSWER_TYPE, DIFFICULTY, EXAM_STATUS, ATTEMPT_TYPE, ATTEMPT_STATUS, DOCUMENT_SCOPE
    │   ├── ai-setting.model.js                     # Schema cấu hình Trợ lý AI: key singleton 'default', isEnabled, baseUrl (chuẩn OpenAI/Gemini), apiKey, model, systemPrompt, maxDocChars, updatedBy
    │   ├── answer.model.js                         # Schema đáp án câu hỏi: nội dung, trạng thái đúng/sai, ref questionId
    │   ├── attempt-question.model.js               # Schema câu hỏi trong lượt thi: snapshot thứ tự câu hỏi và danh sách đáp án xáo riêng cho từng lượt
    │   ├── audit-log.model.js                      # Schema nhật ký hệ thống: hành động (action), người thực hiện, thời gian, metadata chi tiết
    │   ├── candidate-answer.model.js               # Schema đáp án thí sinh đã chọn khi nộp bài: attemptId, questionId, selectedAnswerIds
    │   ├── department.model.js                     # Schema phòng ban: tên, mã (code duy nhất, bắt buộc), mô tả, slug chuẩn hóa không dấu, trạng thái active
    │   ├── employee.model.js                       # Schema hồ sơ nhân sự: họ tên, mã nhân viên, phòng ban chính (departmentId), danh sách phòng ban kiêm nhiệm (extraDepartmentIds), chức vụ, liên kết tài khoản userId
    │   ├── exam.model.js                           # Schema kỳ thi: tiêu đề, chủ đề ref, phạm vi phòng ban dự thi (departmentScope: all/selected, allowedDepartmentIds), công tắc bù câu chung (allowCommonCompensation), cấu hình số câu theo độ khó/phạm vi, thời gian làm bài, điểm đạt, trạng thái workflow
    │   ├── exam-attempt.model.js                   # Schema lượt thi: thí sinh, kỳ thi, phòng ban thi (departmentId), trạng thái (in_progress/submitted/expired), loại (practice/official), thời gian, lastActiveAt, autoSubmitReason, partial unique index đảm bảo mỗi thí sinh tối đa 1 lượt chính thức in_progress
    │   ├── exam-candidate.model.js                 # Schema thí sinh được phân bổ vào kỳ thi: examId, employeeId, mã đề examCodeId, extraAttemptsGranted, roleConfirmedAt, roleChosenBy
    │   ├── exam-code.model.js                      # Schema mã đề thi: examId, departmentId, code, fingerprint (hash bộ câu hỏi)
    │   ├── exam-code-question.model.js             # Schema câu hỏi trong mã đề: examCodeId, questionId, thứ tự index
    │   ├── notification.model.js                   # Schema thông báo hệ thống: recipientUserId, title, message, type, examId, isRead
    │   ├── practice-session.model.js               # Schema phiên luyện tập cá nhân: userId, topicIds, mode (instant/exam), questions (snapshot đáp án đúng, options xáo, checked), status, timeLimitSec
    │   ├── question.model.js                       # Schema câu hỏi: content, imageUrl, imageCloudinaryId, topicId, departmentId, difficulty, scope, kind, answerType, usage (exam/practice), isActive, questionUsageFilter()
    │   ├── result.model.js                         # Schema kết quả thi: userId, examId, attemptId, score, passed, correctCount, totalQuestions
    │   ├── role.model.js                           # Schema vai trò người dùng: code (admin/examiner/leader/candidate), name
    │   ├── schedule.model.js                       # Schema lịch thi: examId, plannedDate, note
    │   ├── study-document.model.js                 # Schema tài liệu ôn tập: title, topicId, scope, departmentId, filePath, originalFileName, mimeType, uploadedBy
    │   ├── topic.model.js                          # Schema chủ đề thi: name, description, isActive
    │   └── user.model.js                           # Schema tài khoản người dùng: username, passwordHash, roleId, isActive, lockedAt, lockUntil, mustChangePassword, tokenVersion
    ├── routes/
    │   ├── index.js                                # Router tổng: định tuyến tất cả sub-routers vào tiền tố /api/*
    │   ├── ai-assistant.routes.js                  # Tuyến API Trợ lý AI: /settings (Admin), /status (Auth), /chat (Candidate), /leader-chat (Leader), /generate-questions (Examiner)
    │   ├── auth.routes.js                          # Tuyến API xác thực: /login, /refresh, /logout, /me, /change-password
    │   ├── backup.routes.js                        # Tuyến API sao lưu & phục hồi dữ liệu: danh sách, tạo backup, download, restore (Admin)
    │   ├── analytics.routes.js                     # Tuyến API phân tích: /questions (Examiner, Admin), /department-competency (Leader, Admin), /anomalies (Leader, Admin), /my-competency (Candidate)
    │   ├── audit.routes.js                         # Tuyến API tra cứu audit log (Admin)
    │   ├── department.routes.js                    # Tuyến API CRUD phòng ban (Admin, Examiner)
    │   ├── exam.routes.js                          # Tuyến API kỳ thi: /active (Public), CRUD (tạo/sửa đề xuất), /publish-check và workflow phê duyệt (Examiner, Leader)
    │   ├── exam-attempt.routes.js                  # Tuyến API làm bài thi thí sinh (Candidate) và cấp thêm lượt thi, lấy danh sách vai trò (Leader)
    │   ├── notification.routes.js                  # Tuyến API thông báo (Tất cả người dùng đã đăng nhập)
    │   ├── practice.routes.js                      # Tuyến API luyện tập cá nhân theo chủ đề, tiến độ, thành tựu (Candidate)
    │   ├── question.routes.js                      # Tuyến API ngân hàng câu hỏi: CRUD, import Excel/Word, upload ảnh, chuyển ngân hàng, thống kê, xóa hàng loạt (Admin, Examiner)
    │   ├── report.routes.js                        # Tuyến API báo cáo, xuất Excel, tra cứu kết quả công khai và lịch sử cá nhân
    │   ├── role.routes.js                          # Tuyến API lấy danh sách roles (Admin)
    │   ├── study-document.routes.js                # Tuyến API tài liệu ôn tập: quản lý upload/xóa và phân quyền xem/tải
    │   ├── topic.routes.js                         # Tuyến API CRUD chủ đề thi (Admin, Examiner)
    │   └── user.routes.js                          # Tuyến API quản lý người dùng: CRUD, sửa phòng ban chính/kiêm nhiệm, import/export Excel, phân role, khóa/mở, reset mật khẩu (Admin)
    ├── scripts/
    │   ├── backup-cli.js                           # CLI script sao lưu CSDL thủ công (dump -> nén .gz -> upload Drive và xoay vòng)
    │   ├── cleanup-tmp-employees.js                # Script dọn dẹp dữ liệu nhân viên tạm (tạo trong quá trình import)
    │   ├── get-google-refresh-token.js             # Script tạo và lấy Google Drive Refresh Token OAuth2 lần đầu
    │   └── seed-cli.js                             # CLI script khởi tạo 4 vai trò mặc định và tài khoản Admin ban đầu
    ├── services/
    │   ├── abandoned-attempt.scheduler.js          # Cron scheduler: Tự động quét và nộp bài các lượt thi bị bỏ rơi (thí sinh rời tab >60s) mỗi 1 phút (* * * * *)
    │   ├── account-purge.scheduler.js              # Cron scheduler: Tự động xóa cứng tài khoản khóa lâu lúc 04:00 hàng ngày (Asia/Ho_Chi_Minh)
    │   ├── account-purge.service.js                # Logic xóa cứng tài khoản: quét user khóa >6 tháng (lockedAt), loại trừ user có vết lịch sử thi/audit
    │   ├── ai-assistant.service.js                 # Logic Trợ lý AI: gọi LLM (tương thích OpenAI API/Gemini), đọc văn bản từ tài liệu (.docx, .pdf, .xlsx), trích xuất tài liệu theo phòng ban, phân tích báo cáo toàn công ty cho Leader, prompt engineering chống hallucination, sinh câu hỏi trắc nghiệm kèm định dạng Word/Excel
    │   ├── analytics.service.js                    # Logic phân tích (chỉ đọc, không đổi schema): tỷ lệ đúng/độ phân biệt/đáp án nhiễu/cờ cảnh báo từng câu hỏi thi chính thức; bản đồ năng lực theo chủ đề (thi chính thức + luyện tập), gộp theo phòng ban có ngưỡng ẩn số liệu; phát hiện bất thường theo kỳ thi (so cặp đáp án sai trùng lặp theo mã đáp án bất chấp xáo đề, phát hiện tốc độ làm bài nhanh bất thường) — chỉ gợi ý, không kết luận gian lận
    │   ├── audit.service.js                        # Ghi log vết hành động, truy vấn/lọc/phân trang nhật ký hệ thống (hỗ trợ tìm kiếm theo nhân viên/phòng ban)
    │   ├── auth.service.js                         # Logic xác thực: kiểm tra bcrypt, tạo JWT Access/Refresh tokens, set cookie, tăng tokenVersion
    │   ├── backup.scheduler.js                     # Cron scheduler: Tự động sao lưu dữ liệu lúc 03:00 hàng ngày (Asia/Ho_Chi_Minh)
    │   ├── backup.service.js                       # Logic sao lưu: mongodump nén .gz, kết nối Google Drive API v3, upload, xoay vòng lưu trữ tối đa 5 bản, khôi phục mongorestore --drop
    │   ├── department.service.js                   # Logic phòng ban: CRUD, bắt buộc cả name và code (chuẩn hóa normalizeDeptCode), xóa mềm, tự động khôi phục khi tạo trùng, slugify chuẩn hóa tiếng Việt, upsert phòng ban khi import Excel/Word
    │   ├── exam.service.js                         # Logic kỳ thi: tạo dự thảo, cấu hình phạm vi phòng ban dự thi (toàn bộ hoặc chọn lọc), công tắc bù câu chung (allowCommonCompensation), kiểm tra tác động publishCheck (getActiveAttemptImpact), chỉnh sửa đề xuất, đệ trình duyệt, approve/reject kèm lý do, publish, archive
    │   ├── exam-attempt.service.js                 # Logic làm bài thi chính thức: kiểm tra tính hợp lệ phạm vi phòng ban (chặn CANDIDATE_OUT_OF_SCOPE), xác nhận vai trò/phòng ban thi (chính hoặc kiêm nhiệm), sinh snapshot câu hỏi xáo trộn, start/resume (bảo vệ lỗi trùng khóa E11000 chuyển thành resume), autosave, heartbeat giữ phiên, tự nộp khi vắng mặt >1 phút, chấm điểm tự động, cấp thêm lượt thi bằng $inc nguyên tử kèm đổi vai trò
    │   ├── exam-code-generation.service.js         # Logic sinh mã đề thi: thuật toán phân bổ câu hỏi chung/riêng theo phạm vi phòng ban được phép (allowedDepartmentIds hoặc all), kiểm tra công tắc bù câu chung (isCommonCompensationEnabled), lọc chỉ lấy câu hỏi thi chính thức (usage=exam), assert câu hỏi đủ số lượng, xáo Fisher-Yates, sinh mã đề và chỉ gán cho thí sinh thuộc phạm vi được thi
    │   ├── notification.service.js                 # Logic thông báo: tạo thông báo tự động theo sự kiện kỳ thi (nộp duyệt, phê duyệt, từ chối, phát hành), đánh dấu đã đọc
    │   ├── practice.service.js                     # Logic luyện tập cá nhân: lọc câu hỏi ôn tập (usage=practice), sinh bài luyện ngẫu nhiên theo chủ đề/độ khó, kiểm tra từng câu (chế độ instant), nộp bài, tính điểm, thống kê tiến độ, tính streak & thành tựu
    │   ├── question-file-builder.js                # Tiện ích sinh file Word (.docx) và Excel (.xlsx) chuẩn hóa từ danh sách câu hỏi do AI tạo (gạch chân đáp án đúng trong Word, tô màu ô đúng trong Excel)
    │   ├── question.service.js                     # Logic ngân hàng câu hỏi: CRUD, upload ảnh Cloudinary, import Excel 2 bước, import Word (.docx) 2 bước sử dụng mammoth (nhận diện gạch chân làm đáp án đúng), chuyển đổi mục đích sử dụng (exam/practice), xóa hàng loạt
    │   ├── report.service.js                       # Logic báo cáo: tổng quan thống kê, báo cáo phòng ban, báo cáo kỳ thi, bảng điểm chi tiết, xuất Excel chuẩn bằng ExcelJS, tra cứu công khai
    │   ├── role.service.js                         # Logic vai trò: truy vấn danh mục Role từ database
    │   ├── seed.service.js                         # Logic seed: tạo 4 role (admin/examiner/leader/candidate) và tài khoản Admin mặc định khi hệ thống khởi động
    │   ├── study-document.service.js               # Logic tài liệu ôn tập: lưu trữ trực tiếp trên đĩa server nội bộ (uploadDir), phân quyền xem theo phòng ban, stream tải/xem tài liệu an toàn
    │   ├── topic.service.js                        # Logic chủ đề: CRUD, xóa mềm (cascade ẩn câu hỏi thuộc chủ đề), tự động khôi phục khi tạo trùng tên
    │   └── user.service.js                         # Logic người dùng: CRUD, cập nhật phòng ban chính/kiêm nhiệm, import Excel 2 bước (parse phòng ban chính + kiêm nhiệm `{PB1; PB2}`, preview phân loại -> confirm ghi DB), xuất Excel tài khoản kèm mật khẩu tạm ngẫu nhiên, khóa/mở (cập nhật lockedAt), reset mật khẩu
    └── utils/
        ├── api-error.js                            # Class ApiError tùy biến chuẩn hóa HTTP statusCode và mã lỗi hệ thống (code), helper assertFound
        ├── async-handler.js                        # Wrapper bọc các async controller functions, tự động bắt exception đẩy vào next(err)
        └── import-departments.js                   # Tiện ích phòng ban cho import Excel: parse cú pháp ô "Phòng chính {Kiêm nhiệm 1; Kiêm nhiệm 2}", tra cứu snapshot và lập kế hoạch tạo/gán mã phòng ban
```

## Chi tiết các Thành phần Nghiệp vụ & Kiến trúc

### 1. Cơ chế Khởi tạo & Lập lịch tự động (`index.js`, `Schedulers`)
- **Startup Sequence**:
  1. `assertRuntimeEnv()`: Kiểm tra sự tồn tại đầy đủ của các biến môi trường bắt buộc (Cổng, MongoDB URI, JWT Secrets, Cloudinary, Google OAuth...).
  2. `connectDatabase()`: Kết nối tới cụm MongoDB qua Mongoose.
  3. `runStartupSeed()`: Nếu cấu hình `SEED_ON_START=true`, kiểm tra và khởi tạo 4 vai trò mặc định cùng tài khoản Admin quản trị ban đầu.
  4. `initBackupScheduler()`: Đăng ký tiến trình cron chạy tự động vào **03:00 hàng ngày** để dump database, nén `.gz`, đẩy lên Google Drive và giữ lại tối đa 5 bản sao lưu mới nhất.
  5. `initUploadCleanupScheduler()`: Đăng ký tiến trình cron chạy **mỗi 1 giờ** để quét và xóa sạch các file tạm còn tồn đọng trong thư mục upload quá 6 tiếng.
  6. `initAccountPurgeScheduler()`: Đăng ký tiến trình cron chạy vào **04:00 hàng ngày** để quét và xóa cứng các tài khoản bị khóa liên tục quá 6 tháng (`lockedAt <= now - 6m`) và không có dấu vết lịch sử (chưa từng thi, chưa từng ghi audit log).
  7. `initAbandonedAttemptScheduler()`: Đăng ký tiến trình cron chạy **mỗi 1 phút (`* * * * *`)** để tự động quét, thu hồi và nộp/chấm điểm các lượt thi bị bỏ rơi (thí sinh tắt tab/máy không tương tác quá 60s), tránh để bài thi treo vĩnh viễn ở trạng thái `in_progress`.
  8. `app.listen()`: Mở cổng Express nhận kết nối.

### 2. Mô hình Dữ liệu và Các mối quan hệ (Schema Relations)
- **Tài khoản & Nhân sự**:
  - `User` (1) ↔ (1) `Role`: Quản lý định danh và quyền hạn truy cập.
  - `User` (1) ↔ (1) `Employee`: Liên kết tài khoản thí sinh với hồ sơ nhân sự (họ tên, mã nhân viên, ngày sinh, giới tính, số điện thoại, chức vụ).
  - `Employee` liên kết với phòng ban chính `departmentId` và mảng phòng ban kiêm nhiệm `extraDepartmentIds: [ObjectId]`.
  - Cú pháp ô Excel: `Tên phòng chính {Kiêm nhiệm 1; Kiêm nhiệm 2}` được tự động bóc tách và phân bổ.
- **Ngân hàng đề thi & Phân loại mục đích sử dụng**:
  - `Topic` (1) ↔ (N) `Question`: Mỗi câu hỏi thuộc về một chủ đề chuyên môn.
  - `Department` (1) ↔ (N) `Question` (khi `scope = 'DepartmentSpecific'`).
  - `Question.usage`: Phân định rõ mục đích sử dụng: `exam` (dành riêng thi chính thức, tuyệt đối bảo mật đáp án) và `practice` (dành cho thí sinh tự luyện tập, cho phép xem đáp án và giải thích).
  - `Question` (1) ↔ (N) `Answer`: Danh sách phương án trả lời (hỗ trợ single/multiple correct answers).
- **Quy trình Kỳ thi & Mã đề**:
  - `Exam` (1) ↔ (N) `ExamCode`: Khi phát hành kỳ thi (`publish`), hệ thống sinh các mã đề tương ứng cho từng phòng ban tham gia (chỉ rút các câu hỏi có `usage = 'exam'`).
  - Hỗ trợ phân quyền phạm vi phòng ban dự thi: `departmentScope` (`'all'` hoặc `'selected'`), `allowedDepartmentIds: [ObjectId]`. Nếu kỳ thi chọn lọc phòng ban, chỉ các phòng ban được chỉ định mới được phân bổ đề và sinh mã đề.
  - Hỗ trợ công tắc bù câu chung: `allowCommonCompensation` (bật: thiếu câu riêng bù bằng câu chung; tắt: phòng thiếu câu riêng bị coi là không đủ điều kiện dự thi).
  - `ExamCode` (1) ↔ (N) `ExamCodeQuestion` ↔ (1) `Question`: Tập hợp các câu hỏi được trộn ngẫu nhiên gán vào từng mã đề.
  - `Exam` (1) ↔ (N) `ExamCandidate` ↔ (1) `Employee`: Danh sách thí sinh tham gia kỳ thi kèm mã đề, quyền bổ sung lượt thi (`extraAttemptsGranted`), thời điểm và nguồn xác nhận vai trò (`roleConfirmedAt`, `roleChosenBy`). Chỉ những thí sinh có ít nhất một phòng ban (chính hoặc kiêm nhiệm) nằm trong phạm vi kỳ thi mới được tạo `ExamCandidate`.
- **Lượt thi Chính thức & Chấm điểm**:
  - `ExamCandidate` (1) ↔ (N) `ExamAttempt`: Mỗi thí sinh có số lượt thi nhất định (mặc định 1 lượt chính thức, có thể được Leader cấp thêm bằng thao tác `$inc: { extraAttemptsGranted: 1 }` nguyên tử).
  - Thí sinh ngoài phạm vi phòng ban bị chặn truy cập và ném mã lỗi `CANDIDATE_OUT_OF_SCOPE`.
  - Thí sinh có phòng kiêm nhiệm được chọn vai trò thi (trong số các phòng thuộc phạm vi kỳ thi) trước khi bắt đầu; sau khi bắt đầu, vai trò bị khóa chặt chẽ và ghi nhận vào `ExamAttempt.departmentId`.
  - **Chống tạo lượt thi trùng lặp**: `ExamAttempt` thiết lập chỉ mục duy nhất một phần (`uniq_one_in_progress_official_attempt` với `{ attemptType: 'official', status: 'in_progress' }`), kết hợp cơ chế bắt lỗi `E11000` tại `startAttempt` để tự động chuyển sang chế độ tiếp tục (resume) nếu có 2 request `/start` gửi đồng thời (bấm đúp, mở 2 tab).
  - `ExamAttempt` (1) ↔ (N) `AttemptQuestion`: Lưu snapshot câu hỏi và thứ tự đáp án xáo riêng cho từng lượt thi để đảm bảo tính công bằng.
  - `ExamAttempt` (1) ↔ (N) `CandidateAnswer`: Lưu vết các phương án thí sinh đã chọn.
  - `ExamAttempt` (1) ↔ (1) `Result`: Kết quả tổng kết lượt thi (Điểm số, Đạt/Không đạt, thời gian làm bài).
- **Phân hệ Luyện tập Cá nhân (Practice)**:
  - `User` (1) ↔ (N) `PracticeSession`: Lưu phiên luyện tập tự do theo chủ đề do thí sinh tự chọn (chỉ rút từ câu hỏi có `usage = 'practice'`). Snapshot đáp án đúng và thứ tự xáo trộn được lưu tại session, kết quả độc lập hoàn toàn không ảnh hưởng tới kết quả thi chính thức.
  - Hỗ trợ theo dõi chuỗi ngày luyện tập (streak) và huy hiệu tích lũy qua endpoint `/api/practice/achievements`.

### 3. Quy trình Trộn đề và Phát hành Kỳ thi (`exam-code-generation.service.js`)
- Khi Leader duyệt hoặc bấm "Đăng chính thức" (`publish`):
  1. Xác định phạm vi phòng ban dự thi: Nếu `departmentScope === 'selected'`, tập hợp phòng ban hợp lệ được giới hạn trong `allowedDepartmentIds`; nếu `'all'`, duyệt qua toàn bộ phòng ban có nhân viên active.
  2. Hệ thống kiểm tra số lượng nhân viên ngoài phạm vi (`outOfScopeEmployeeCount`) và hiển thị cảnh báo minh bạch nếu có thí sinh không thuộc phạm vi kỳ thi.
  3. Tính toán phương án lấy câu hỏi: Rút số câu Chung (`Common`) và số câu Riêng (`DepartmentSpecific`) theo cấu hình đề xuất (chỉ lọc câu hỏi có `usage = 'exam'` đang `isActive = true`). Kiểm tra tính đầy đủ của ngân hàng câu hỏi (`assertScopeQuestionsSufficient`).
  4. Cơ chế bù đắp thông minh (Smart Fallback): Nếu `allowCommonCompensation = true`, phòng ban không đủ số câu riêng sẽ được tự động bù số câu thiếu từ ngân hàng câu hỏi chung của chủ đề đó. Nếu tắt bù, phòng ban thiếu câu riêng sẽ bị coi là không đủ điều kiện (ineligible).
  5. Rút ngẫu nhiên câu hỏi độc lập (thuật toán Fisher–Yates) và tạo bản ghi `ExamCode` riêng biệt cho **từng cá nhân nhân viên** (`D3F9A1-PB-NV-RandomHex`), tránh nhìn bài chéo.
  6. Tự động gán từng thí sinh đủ điều kiện vào mã đề mặc định ban đầu trong `ExamCandidate` (idempotent theo từng nhân viên).
  7. Gửi thông báo hệ thống tự động tới toàn bộ thí sinh được tham gia.

### 4. Quy trình Phòng thi và Giám sát phiên thi (`exam-attempt.service.js`)
- **Kiểm tra phạm vi & Chọn vai trò**:
  - Khi thí sinh truy cập, hệ thống xác minh thí sinh có thuộc phạm vi phòng ban của kỳ thi hay không. Nếu không, chặn với lỗi `CANDIDATE_OUT_OF_SCOPE` và hiển thị giải thích thân thiện trên Dashboard. 
  - Nếu thí sinh thuộc nhiều phòng ban (có kiêm nhiệm) và chưa khóa vai trò (`roleConfirmedAt` rỗng), popup yêu cầu chọn phòng ban dự thi. Sau khi chọn, hệ thống cập nhật mã đề tương ứng của phòng ban đó và khóa vai trò (`roleChosenBy: 'candidate'`).
  - Sinh snapshot thứ tự câu hỏi và thứ tự phương án trả lời xáo riêng biệt cho từng lượt thi của thí sinh (`AttemptQuestion`), ẩn hoàn toàn cờ `isCorrect` của đáp án trước khi trả về client.
- **Tự động lưu câu trả lời (`answer`)**: Lưu tức thì phương án thí sinh đã chọn vào bảng `CandidateAnswer` theo thời gian thực (autosave).
- **Heartbeat & Tự động nộp bài (`heartbeat`)**: Client gửi tín hiệu heartbeat mỗi 15 giây. Nếu thí sinh tắt trình duyệt hoặc gián đoạn kết nối quá 1 phút (`INACTIVITY_TIMEOUT_MS`), hệ thống sẽ tự động đóng phiên và chấm điểm dựa trên các đáp án đã autosave (`autoSubmitReason: 'inactive_timeout'`).
- **Chấm điểm tự động (`submit`)**:
  - Đối với câu hỏi chọn 1 đáp án (`single`): Thí sinh chọn đúng đáp án duy nhất -> Tính điểm.
  - Đối với câu hỏi chọn nhiều đáp án (`multiple`): Thí sinh phải chọn đúng và đủ tất cả các đáp án đúng, không chọn thừa đáp án sai -> Tính điểm.
  - Tính điểm thang 100 (`Math.round((correctCount / totalQuestions) * 100)`), so sánh với `passThresholdPercent` (mặc định 70%) của kỳ thi để xác định kết quả `passed`.

---

## Bảng API Endpoints Chi tiết

### 1. `/api` — Kiểm tra Sức khỏe máy chủ
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/health` | Public | Kiểm tra trạng thái hoạt động của máy chủ (`HEALTH_OK`). |

### 2. `/api/auth` — Xác thực & Quản lý Phiên
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public (Rate Limited) | Đăng nhập tài khoản, cấp Access Token và Refresh Token HttpOnly Cookie. |
| `POST` | `/api/auth/refresh` | Public (Cookie) | Cấp mới Access Token thông qua Refresh Token hợp lệ. |
| `POST` | `/api/auth/logout` | Authenticated | Đăng xuất, xóa Refresh Token cookie trên trình duyệt. |
| `GET` | `/api/auth/me` | Authenticated | Lấy thông tin tài khoản hiện tại, vai trò và hồ sơ nhân sự liên kết. |
| `POST` | `/api/auth/change-password` | Authenticated | Đổi mật khẩu tài khoản (hỗ trợ quy trình bắt buộc đổi mật khẩu lần đầu). |

### 3. `/api/users` — Quản trị Tài khoản Người dùng
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/users` | Admin | Lấy danh sách tài khoản (phân trang, lọc theo vai trò, phòng ban, từ khóa). |
| `POST` | `/api/users` | Admin | Tạo tài khoản người dùng đơn lẻ (tự động gắn hồ sơ nhân viên nếu là candidate). |
| `PATCH` | `/api/users/:id/departments` | Admin | Cập nhật phòng ban chính (`departmentId`) và danh sách phòng kiêm nhiệm (`extraDepartmentIds`) của một nhân viên. |
| `POST` | `/api/users/export-credentials` | Admin | Xuất file Excel danh sách tài khoản thí sinh kèm mật khẩu tạm ngẫu nhiên. |
| `POST` | `/api/users/import/preview` | Admin | Đọc file Excel nhân sự, bóc tách phòng chính + kiêm nhiệm `{PB1; PB2}`, phân loại dòng mới/cập nhật/lỗi và tổng hợp phòng ban thiếu cần nhập mã. |
| `POST` | `/api/users/import/confirm` | Admin | Xác nhận ghi dữ liệu nhân viên, tự động tạo/khôi phục/gán mã phòng ban theo kế hoạch. |
| `PATCH` | `/api/users/:id/role` | Admin | Thay đổi vai trò (Role) của người dùng. |
| `PATCH` | `/api/users/:id/lock` | Admin | Khóa hoặc mở khóa tài khoản người dùng (cập nhật `lockedAt`). |
| `POST` | `/api/users/:id/reset-password` | Admin | Reset mật khẩu người dùng về mật khẩu tạm ngẫu nhiên. |

### 4. `/api/roles` — Danh mục Vai trò
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/roles` | Admin | Lấy danh sách tất cả các vai trò trong hệ thống (admin, examiner, leader, candidate). |

### 5. `/api/topics` — Quản lý Chủ đề thi
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/topics` | Admin, Examiner | Danh sách chủ đề thi (hỗ trợ lọc `activeOnly` và tính số câu hỏi `withCounts=true`). |
| `POST` | `/api/topics` | Admin, Examiner | Tạo chủ đề mới (tự động khôi phục nếu trùng tên chủ đề đã xóa mềm). |
| `PATCH` | `/api/topics/:id` | Admin, Examiner | Cập nhật thông tin tên/mô tả chủ đề thi. |
| `DELETE` | `/api/topics/:id` | Admin, Examiner | Ngừng sử dụng chủ đề (xóa mềm và tự động cascade ẩn các câu hỏi thuộc chủ đề). |

### 6. `/api/departments` — Quản lý Phòng ban
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/departments` | Admin, Examiner | Danh sách phòng ban cơ quan (hỗ trợ lọc `activeOnly`). |
| `POST` | `/api/departments` | Admin, Examiner | Tạo mới phòng ban (bắt buộc tên và mã code, tự động sinh slug). |
| `PATCH` | `/api/departments/:id` | Admin, Examiner | Cập nhật tên, mã hoặc mô tả phòng ban. |
| `DELETE` | `/api/departments/:id` | Admin, Examiner | Ngừng sử dụng phòng ban (xóa mềm). |

### 7. `/api/questions` — Ngân hàng Câu hỏi
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/questions` | Admin, Examiner | Danh sách câu hỏi (lọc theo topicId, scope, departmentId, difficulty, answerType, usage, search, phân trang). |
| `GET` | `/api/questions/:id` | Admin, Examiner | Lấy chi tiết câu hỏi kèm danh sách đáp án đúng/sai. |
| `POST` | `/api/questions` | Admin, Examiner | Tạo câu hỏi mới kèm danh sách các phương án trả lời và mục đích sử dụng (`usage`). |
| `PATCH` | `/api/questions/:id` | Admin, Examiner | Cập nhật nội dung câu hỏi, ảnh đính kèm, đáp án và mục đích sử dụng. |
| `DELETE` | `/api/questions/:id` | Admin, Examiner | Xóa câu hỏi (xóa mềm `isActive = false`). |
| `POST` | `/api/questions/import/preview` | Admin, Examiner | Tải file Excel câu hỏi lên để phân tích cú pháp, chỉ định mục đích sử dụng, phát hiện phòng ban thiếu và dòng lỗi. |
| `POST` | `/api/questions/import/confirm` | Admin, Examiner | Xác nhận ghi dữ liệu câu hỏi từ Excel vào ngân hàng đề và tự động tạo các phòng ban thiếu. |
| `POST` | `/api/questions/import/word/preview` | Admin, Examiner | Tải file Word (.docx) câu hỏi lên để phân tích định dạng bằng mammoth, bóc tách câu hỏi, đáp án đúng/gợi ý qua chữ gạch chân và danh sách cần xem lại. |
| `POST` | `/api/questions/import/word/confirm` | Admin, Examiner | Xác nhận ghi dữ liệu câu hỏi từ Word vào ngân hàng đề (hỗ trợ ghi đè đáp án đúng từ form kiểm duyệt). |
| `POST` | `/api/questions/upload-image` | Admin, Examiner | Tải ảnh minh họa câu hỏi lên máy chủ Cloudinary (băm SHA-256 chống trùng). |
| `GET` | `/api/questions/stats/by-topic/:topicId` | Admin, Examiner | Thống kê số lượng câu hỏi theo chủ đề (phân bổ theo độ khó). |
| `POST` | `/api/questions/bulk-delete` | Admin, Examiner | Xóa hàng loạt câu hỏi theo danh sách ID hoặc theo tiêu chí lọc (bảo vệ câu hỏi thuộc kỳ thi đang diễn ra). |
| `POST` | `/api/questions/bulk-move-usage` | Admin, Examiner | Chuyển đổi hàng loạt câu hỏi giữa ngân hàng thi chính thức và ngân hàng ôn tập (chặn nếu chủ đề có kỳ thi published). |

### 8. `/api/practice` — Luyện tập Cá nhân Thí sinh
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/practice/topics` | Candidate | Lấy danh sách các chủ đề có câu hỏi ôn tập phù hợp với phòng ban của thí sinh. |
| `GET` | `/api/practice/progress` | Candidate | Lấy thống kê tiến độ luyện tập cá nhân (tổng số lượt, tỷ lệ đúng, phân tích theo chủ đề, lịch sử gần nhất). |
| `GET` | `/api/practice/achievements` | Candidate | Lấy chuỗi ngày luyện tập liên tiếp (streak), huy hiệu tích lũy và thông điệp động viên. |
| `GET` | `/api/practice/active` | Candidate | Lấy thông tin bài luyện đang làm dở (để tiếp tục khi tải lại trang / đổi thiết bị). |
| `POST` | `/api/practice/start` | Candidate | Bắt đầu bài luyện mới theo cấu hình (chủ đề, số câu, thời gian, độ khó, chế độ instant/exam). |
| `POST` | `/api/practice/:id/check` | Candidate | Kiểm tra ngay đúng/sai cho 1 câu hỏi trong chế độ làm bài tức thì (`instant`). |
| `POST` | `/api/practice/:id/abandon` | Candidate | Bỏ bài luyện đang làm dở (đánh dấu hết hạn, không tính vào thống kê). |
| `POST` | `/api/practice/:id/submit` | Candidate | Nộp bài luyện tập, hệ thống chấm điểm và lưu kết quả phiên ôn tập. |

### 9. `/api/exams` — Quản lý Kỳ thi & Workflow
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/exams/active` | Public | Lấy thông tin kỳ thi đang mở thi công khai trên trang chủ. |
| `GET` | `/api/exams` | Admin, Leader, Examiner | Lấy danh sách kỳ thi theo quyền (Examiner xem đề của mình, Leader/Admin xem tất cả). |
| `POST` | `/api/exams` | Examiner | Tạo dự thảo đề xuất kỳ thi mới (`draft`, chọn phạm vi phòng ban, cấu hình công tắc bù câu chung). |
| `PATCH` | `/api/exams/:id` | Examiner | Chỉnh sửa đề xuất kỳ thi (áp dụng cho `draft`/`rejected`, tự động quay về `draft` và xóa lý do từ chối cũ). |
| `POST` | `/api/exams/:id/submit` | Examiner | Đệ trình dự thảo kỳ thi lên Leader phê duyệt (`pending_review`). |
| `POST` | `/api/exams/:id/approve` | Leader | Phê duyệt dự thảo kỳ thi (`approved`, cài đặt `startDate`, `endDate`). |
| `POST` | `/api/exams/:id/reject` | Leader | Từ chối dự thảo kỳ thi kèm lý do cụ thể (`rejected`). |
| `GET` | `/api/exams/:id/publish-check` | Leader | Kiểm tra tác động trước khi phát hành (đếm số thí sinh đang làm bài ở kỳ thi cũ sẽ bị ảnh hưởng). |
| `POST` | `/api/exams/:id/publish` | Leader | Đăng phát hành chính thức kỳ thi (`published`), kích hoạt trộn mã đề độc lập và gán thí sinh. |
| `POST` | `/api/exams/:id/archive` | Leader | Lưu trữ kỳ thi đã kết thúc (`archived`). |

### 10. `/api/exam-attempts` — Làm bài thi Thí sinh
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/exam-attempts/my-exam` | Candidate | Lấy thông tin đề thi của thí sinh (ẩn đáp án đúng), trạng thái lượt thi, danh sách phòng ban chọn thi và đáp án đã lưu dở. |
| `POST` | `/api/exam-attempts/start` | Candidate (Rate Limited) | Bắt đầu lượt thi mới (xác nhận `departmentId` nếu có nhiều phòng) hoặc tiếp tục (resume) lượt thi đang dở. |
| `POST` | `/api/exam-attempts/:id/submit` | Candidate (Rate Limited) | Nộp bài thi, hệ thống khóa bài và tự động chấm điểm. |
| `PATCH` | `/api/exam-attempts/:id/answer` | Candidate (Rate Limited) | Autosave phương án trả lời cho 1 câu hỏi cụ thể. |
| `POST` | `/api/exam-attempts/:id/heartbeat` | Candidate (Rate Limited) | Gửi tín hiệu duy trì phòng thi định kỳ (tự nộp nếu ngắt kết nối >1 phút). |
| `GET` | `/api/exam-attempts/candidates/:examCandidateId/role-options` | Leader | Lấy danh sách các vai trò (phòng ban) khả dụng của thí sinh kèm trạng thái đủ điều kiện để chọn lại khi cấp lượt thi. |
| `POST` | `/api/exam-attempts/candidates/:examCandidateId/grant-attempt` | Leader | Cấp thêm lượt thi chính thức cho một thí sinh cụ thể (hỗ trợ đổi lại phòng ban thi `departmentId` nếu chọn nhầm). |

### 11. `/api/notifications` — Thông báo Hệ thống
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/notifications` | Authenticated | Lấy danh sách thông báo của người dùng (tối đa 30 tin mới nhất). |
| `GET` | `/api/notifications/unread-count` | Authenticated | Đếm số lượng thông báo chưa đọc. |
| `PATCH` | `/api/notifications/:id/read` | Authenticated | Đánh dấu 1 thông báo là đã đọc. |
| `PATCH` | `/api/notifications/read-all` | Authenticated | Đánh dấu tất cả thông báo là đã đọc. |

### 12. `/api/study-documents` — Tài liệu Ôn tập
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/study-documents/candidate` | Candidate | Lấy danh sách tài liệu ôn tập thí sinh được phép xem (theo phòng ban trực thuộc). |
| `GET` | `/api/study-documents` | Admin, Examiner, Leader | Danh sách tất cả tài liệu ôn tập trong hệ thống. |
| `POST` | `/api/study-documents` | Admin, Examiner | Tải tài liệu ôn tập mới lên đĩa server nội bộ (PDF, Word, Excel, tối đa 20MB). |
| `DELETE` | `/api/study-documents/:id` | Admin, Examiner | Xóa tài liệu ôn tập (gỡ file trên đĩa server nội bộ và xóa trong CSDL). |
| `GET` | `/api/study-documents/:id/file` | Authenticated | Xem trực tiếp (`mode=inline`) hoặc tải về (`mode=download`) tệp tài liệu qua Stream Blob an toàn. |

### 13. `/api/audit-logs` — Nhật ký Hệ thống
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/audit-logs` | Admin | Tra cứu nhật ký hệ thống (phân trang, lọc theo action/user/thời gian/resourceType, tìm kiếm nhân viên). |

### 14. `/api/backups` — Sao lưu & Phục hồi Dữ liệu
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/backups` | Admin | Xem danh sách các bản sao lưu đang lưu trữ trên Google Drive. |
| `POST` | `/api/backups` | Admin | Tạo một bản sao lưu CSDL thủ công tức thì lên Google Drive (tự động xoay vòng tối đa 5 bản). |
| `GET` | `/api/backups/:fileId/download` | Admin | Tải một bản sao lưu cụ thể từ Google Drive về máy tính cá nhân. |
| `POST` | `/api/backups/restore` | Admin | Tải tệp `.gz` lên để khôi phục toàn bộ cơ sở dữ liệu (`mongorestore --drop`). |

### 15. `/api/reports` — Thống kê & Báo cáo
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/reports/public/by-department` | Public | Kết quả thi công khai theo phòng ban trên trang chủ. |
| `GET` | `/api/reports/public/lookup` | Public | Tra cứu kết quả thi cá nhân theo Mã nhân viên trên trang chủ. |
| `GET` | `/api/reports/my-results` | Candidate | Xem lịch sử toàn bộ kết quả thi của chính thí sinh. |
| `GET` | `/api/reports/overview` | Leader, Admin | Báo cáo tổng quan toàn hệ thống (số lượng thí sinh, câu hỏi, tỷ lệ đạt chung). |
| `GET` | `/api/reports/by-department` | Leader, Admin | Báo cáo chi tiết kết quả theo từng phòng ban. |
| `GET` | `/api/reports/topics` | Leader, Admin | Lấy danh sách tùy chọn chủ đề có dữ liệu báo cáo. |
| `GET` | `/api/reports/by-exam` | Leader, Admin | Báo cáo kết quả tổng hợp theo từng kỳ thi. |
| `GET` | `/api/reports/results` | Leader, Admin | Bảng điểm chi tiết của từng thí sinh trong kỳ thi. |
| `GET` | `/api/reports/export` | Leader, Admin | Xuất file Excel báo cáo kết quả chi tiết chuẩn định dạng bằng ExcelJS. |
| `GET` | `/api/reports/export-by-exam` | Leader, Admin | Xuất file Excel báo cáo kết quả tổng hợp theo kỳ thi. |

### 16. `/api/analytics` — Phân tích Chất lượng Câu hỏi, Năng lực & Bất thường
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/analytics/questions` | Examiner, Admin | Phân tích từng câu hỏi từ kỳ thi chính thức đã nộp: tỷ lệ đúng, độ phân biệt (nhóm cao/thấp), tỷ lệ chọn từng đáp án, cờ cảnh báo (nghi sai đáp án, quá dễ/khó, lệch độ khó). Dưới 5 lượt trả lời: chưa đủ dữ liệu; từ 30 lượt mới gắn cờ. Lọc tùy chọn `examId`, `topicId`. |
| `GET` | `/api/analytics/department-competency` | Leader, Admin | Năng lực theo chủ đề gộp theo phòng ban (thi chính thức, tính theo vai trò đã thi). Phòng ban dưới 3 thí sinh bị ẩn số liệu. Không trả về định danh cá nhân. |
| `GET` | `/api/analytics/anomalies` | Leader, Admin | Dấu hiệu bất thường theo từng kỳ thi (CÓ định danh thí sinh để Leader xem xét). So cặp đáp án sai trùng lặp (theo mã đáp án, bất chấp xáo đề) khi kỳ thi ≥ 10 lượt; phát hiện tốc độ làm bài nhanh bất thường (< 8 giây/câu). Bài bị hệ thống tự nộp bị loại. Lọc tùy chọn `examId`. Chỉ là gợi ý, không kết luận gian lận. |
| `GET` | `/api/analytics/my-competency` | Candidate | Bản đồ năng lực của chính thí sinh theo chủ đề (thi chính thức + luyện tập) kèm các chủ đề yếu. |

### 17. `/api/ai-assistant` — Trợ lý AI Hỏi đáp & Soạn đề thi
| Method | Endpoint | Quyền hạn | Chức năng |
|---|---|---|---|
| `GET` | `/api/ai-assistant/settings` | Admin | Lấy cấu hình Trợ lý AI (URL, model, prompt, context chars, trạng thái kích hoạt). |
| `PUT` | `/api/ai-assistant/settings` | Admin | Cập nhật cấu hình Trợ lý AI (bật/tắt, API key, model, prompt hệ thống, max context). |
| `GET` | `/api/ai-assistant/status` | Candidate, Leader, Examiner | Kiểm tra trạng thái kích hoạt của Trợ lý AI (`{ enabled: boolean }`). |
| `POST` | `/api/ai-assistant/chat` | Candidate (Rate Limited) | Hỏi đáp Trợ lý AI dựa trên nội dung tài liệu ôn tập của phòng ban thí sinh. Hỗ trợ sinh cú pháp Mermaid mindmap và biểu đồ. |
| `POST` | `/api/ai-assistant/leader-chat` | Leader (Rate Limited) | Hỏi đáp thông minh phân tích toàn bộ số liệu báo cáo, kết quả thi và tỷ lệ đạt của các phòng ban. |
| `POST` | `/api/ai-assistant/generate-questions` | Examiner (Rate Limited) | Đọc tài liệu ôn tập nội bộ (.docx, .pdf, .xlsx), trích xuất kiến thức và tự động sinh file đề thi Word/Excel chuẩn mẫu import. |

---

## Tiêu chuẩn Bảo mật & Xử lý Ngoại lệ

- **Helmet**: Cấu hình bảo mật HTTP response headers chống Clickjacking, Cross-Site Scripting (XSS).
- **CORS**: Chỉ chấp nhận các request từ `CLIENT_ORIGIN` được định nghĩa trong cấu hình môi trường.
- **Bảo mật Phiên làm việc (Single Active Session)**: Quản lý qua trường `tokenVersion` trên model `User`. Khi người dùng đăng nhập tại thiết bị mới hoặc đổi mật khẩu, `tokenVersion` được tăng lên -> Vô hiệu hóa toàn bộ token của các phiên trước đó.
- **Bảo vệ Endpoint Nhạy cảm**:
  - `loginRateLimiter`: Giới hạn tần suất đăng nhập ngăn chặn tấn công dò mật khẩu (Brute Force) theo IP + tên đăng nhập (`${req.ip}|${username}`), bỏ qua các lần đăng nhập thành công (`skipSuccessfulRequests: true`) để không gây nghẽn phòng thi.
  - `examAttemptRateLimiter`: Kiểm soát lưu lượng request trong phòng thi (`start`, `answer`, `heartbeat`, `submit`) theo **userId** (`keyGenerator: (req) => req.auth?.userId ?? req.ip`) — đảm bảo mỗi thí sinh có hạn ngạch độc lập, không bị nghẽn hay chặn nhầm khi hàng trăm thí sinh thi cùng lúc sau 1 địa chỉ IP/NAT mạng LAN.
- **Tự động Dọn dẹp Tài khoản Khóa (`account-purge`)**: Scheduler 04:00 hàng ngày tự động xóa cứng các tài khoản bị khóa liên tục quá 6 tháng (`lockedAt <= now - 6m`) và chưa từng có vết lịch sử (chưa từng tham gia kỳ thi, chưa từng ghi audit log), đồng thời ghi vết `ACCOUNT_PURGE_AUTO`.
- **Tự động Thu hồi & Chấm bài Bị bỏ rơi (`abandoned-attempt`)**: Tiến trình Cron chạy định kỳ **mỗi phút (`* * * * *`)** tự động nộp bài và chấm điểm các lượt thi bị bỏ rơi (khi thí sinh tắt tab/máy hoặc mất kết nối quá thời gian quy định), tránh việc lượt thi bị treo vĩnh viễn ở trạng thái `in_progress`.
- **Quản lý Mật khẩu**: Băm mật khẩu bằng `bcrypt` / `bcryptjs` với salt rounds chuẩn bảo mật cao (12 rounds).
- **Global Error Handling**: Tất cả các lỗi bất đồng bộ được gom lại qua `asyncHandler` và xử lý tập trung tại error middleware ở cuối `app.js`, ẩn toàn bộ stacktrace nội bộ khi chạy trên môi trường production.

## Phân quyền Tổng hợp

| Role | Quyền hạn |
|---|---|
| **Public** | Xem kỳ thi, tra cứu kết quả công khai (theo phòng ban, theo mã nhân viên), health check. |
| **Candidate** (Thí sinh) | Xem kỳ thi, tài liệu ôn tập (theo phòng ban), chọn vai trò phòng ban thi (nếu kiêm nhiệm), vào thi (start/autosave/heartbeat/submit), luyện tập cá nhân & theo dõi thành tựu, xem lịch sử kết quả, thông báo cá nhân. |
| **Examiner** (Người ra đề) | CRUD câu hỏi/chủ đề/phòng ban, import Excel/Word câu hỏi 2 bước, upload ảnh câu hỏi, tạo + chỉnh sửa + đệ trình đề xuất kỳ thi (chọn phạm vi phòng ban, cấu hình công tắc bù câu chung), quản lý tài liệu ôn tập, thông báo. |
| **Leader** (Người duyệt đề) | Xem tất cả đề xuất, duyệt/từ chối/phát hành/lưu trữ kỳ thi, kiểm tra tác động publish-check, xem báo cáo tổng hợp, xuất Excel, cấp thêm lượt thi (hỗ trợ chọn lại vai trò phòng ban thi), thông báo. |
| **Admin** (Quản trị viên) | Toàn quyền quản lý user (CRUD, sửa phòng ban chính/kiêm nhiệm, import Excel bóc tách kiêm nhiệm/export Excel credentials, phân role, khóa/mở, reset password), audit log, sao lưu & phục hồi dữ liệu (Backup/Restore), quản lý câu hỏi/chủ đề/phòng ban, xem báo cáo, thông báo. |

---

## Luồng xử lý dữ liệu (Data Flow)

Kiến trúc tuân thủ mô hình **Controller-Service-Repository** (Mongoose đảm nhiệm vai trò Repository).

1. **Request Lifecycle**: Client Gửi Request → Express Router → `auth.middleware` (nếu có) → `rate-limit` (nếu có) → `upload.middleware` (nếu có) → **Controller**.
2. **Controller**: Xử lý input (req.params, req.body, req.query, req.file), gọi Service xử lý nghiệp vụ, ghi audit log (nếu có), trả về HTTP status và JSON response (chuẩn format `res.json({ success: true, message, code, data })`). Dùng `asyncHandler` để tự động đẩy lỗi.
3. **Service**: Đảm nhận mọi logic nghiệp vụ (validate, kết nối model, tính toán, gọi external API như Cloudinary, Google Drive). Trả về dữ liệu sạch hoặc ném ra `ApiError`.
4. **Model/Mongoose**: Tương tác với MongoDB (thêm/sửa/xóa/truy vấn), validate schema cấp cơ sở dữ liệu, kích hoạt pre/post hooks.
5. **Error Handler**: Lỗi từ bất kỳ đâu bị ném sẽ rơi vào global error middleware (định nghĩa cuối cùng trong `app.js`). Middleware này log lỗi và chuẩn hóa JSON báo lỗi trước khi gửi về client.

## Kiến trúc cơ sở dữ liệu & Liên kết (Relations)

Dữ liệu được tổ chức theo tính toàn vẹn thông qua tham chiếu (Ref):

- **Tổ chức nhân sự**: `Department` (1) ↔ (N) `Employee` (departmentId + extraDepartmentIds) (1) ↔ (1) `User` ↔ (1) `Role`.
  - Một user gắn với một role cụ thể. User liên kết tới thông tin nhân sự (Employee) qua mã nhân viên. `User.lockedAt` lưu mốc thời gian lần khóa gần nhất.
- **Kỳ thi và Đề thi**: `Exam` (1) ↔ (N) `ExamCode` (1) ↔ (N) `ExamCodeQuestion` ↔ (1) `Question`.
  - `Exam` (Kỳ thi) là container. Khi duyệt và phát hành, `ExamCode` (Mã đề thi) được sinh ra từ việc trộn ngẫu nhiên `Question`.
- **Lượt thi và Kết quả**: `Employee (Candidate)` ↔ `ExamCandidate` ↔ `ExamAttempt` ↔ `AttemptQuestion` ↔ `Answer`.
  - Một `ExamAttempt` lưu trạng thái (in_progress/submitted/expired), thời gian kết thúc, log heartbeat, phòng ban thí sinh đã chọn thi (`departmentId`), lý do tự nộp (`autoSubmitReason`). `AttemptQuestion` lưu lại đáp án đang chọn dở. Kết thúc tạo ra `Result`.

## Quản lý Lỗi (Error Handling Strategy)

- Sử dụng `ApiError` class kế thừa `Error` có thêm `statusCode` và `code` (mã định danh).
- Ví dụ: `throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');`
- Bọc toàn bộ controller bằng `asyncHandler` để không cần khối `try/catch` dài dòng.
- Global Error Handler (`app.js`) sẽ tự map statusCode (hoặc 500 nếu lỗi server) và loại bỏ chi tiết stacktrace nếu đang ở môi trường production.

## Tiêu chuẩn Bảo mật (Security Standards)

- **Helmet**: Tự động set HTTP headers chống XSS, Clickjacking.
- **CORS**: Chỉ cho phép `CLIENT_ORIGIN` được quyền gọi API, bảo vệ resource cross-origin.
- **Rate Limit**: Áp dụng chặt chẽ cho endpoint nhạy cảm:
  - `/login`: Giới hạn lần đăng nhập ở production (ngừa brute force) theo IP.
  - `/start`, `/answer`, `/submit`, `/heartbeat`: Áp dụng `examAttemptRateLimiter` theo `userId` (100 req/phút/user), giúp phòng thi nhiều máy tính sau cùng 1 IP NAT không bị chặn nhầm.
- **JWT**: Sử dụng chiến lược *Access Token (ngắn hạn, trong Header)* và *Refresh Token (dài hạn, HTTP-Only Cookie)* để chống XSS đánh cắp token.
- **Mật khẩu**: Băm bằng `bcrypt` / `bcryptjs` (hash + salt), bắt buộc đổi mật khẩu khi cấp tài khoản mới (`mustChangePassword`).
- **Ngăn chặn phiên (Session Revocation)**: Sử dụng trường `tokenVersion` trên model `User`. Đăng nhập mới sẽ tăng phiên bản, làm access token cũ lập tức trở nên bất hợp lệ.


