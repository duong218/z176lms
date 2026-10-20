# AGENT_RULES.md — Quy tắc làm việc & Chuẩn mực phát triển AI Agent
## Module Thi Chuyên Môn Nội Bộ — Z176
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam  
**Đơn vị áp dụng:** Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng  
**Trạng thái tài liệu:** Bản chính thức hoàn thiện (Áp dụng bắt buộc trong toàn bộ quá trình phát triển, bảo trì & bàn giao)  
**Mục đích:** Bộ quy tắc và chuẩn mực kỹ thuật bắt buộc khi sử dụng AI Coding Agent (Antigravity, Claude, Cursor, Codex, Gemini...) để lập trình, thiết kế, tái cấu trúc và tối ưu hóa hệ thống. Áp dụng cho cả tác giả (Dương) và AI Agent tự động đọc, tuân thủ nghiêm ngặt.

> **Độ ưu tiên cao nhất:** File này có hiệu lực quy định cao nhất đối với mọi thao tác kỹ thuật và tư duy kiến trúc trong dự án. Mọi đề xuất, mã nguồn sinh ra hay tài liệu kỹ thuật đều phải tuân thủ các nguyên tắc bên dưới.

---

## 1. Nguyên tắc tối thượng: Bảo mật thông tin nội bộ & Dữ liệu đặc thù

1. 🔒 **Chỉ dùng dữ liệu mock/giả lập trong môi trường phát triển & trao đổi với AI**:
   - Dữ liệu quân sự/doanh nghiệp quốc phòng thật (danh sách CBCNV Z176 thật, ngân hàng câu hỏi nghiệp vụ mật, đáp án thật, lịch sử thi thật) **tuyệt đối không** được đưa vào prompt, đính kèm file chat, hay đẩy lên các dịch vụ AI bên ngoài.
   - Toàn bộ dữ liệu mẫu đặt trong `mock-data/` và seed script (`server/src/scripts/seed.js`, `seed-large.js`) — AI chỉ thao tác trên các định danh/dữ liệu giả lập này.
2. 🔒 **Nhập dữ liệu thật hoàn toàn độc lập với AI**:
   - Dữ liệu thật chỉ được đưa vào hệ thống sau khi nghiệm thu/triển khai máy chủ nội bộ thông qua các công cụ nhập liệu nghiệp vụ có sẵn: Import Excel 2 bước (`/api/import/questions`, `/api/import/users`), Import Word `.docx` (`/api/import/questions/word`), hoặc giao diện quản trị viên.
3. 🔒 **Cơ chế khẩn cấp khi rò rỉ dữ liệu**:
   - Nếu phát hiện thông tin thật vô tình xuất hiện trong context của AI: Dừng phiên ngay lập tức, xóa lịch sử hội thoại và thu hồi các mã/thông tin liên quan.

---

## 2. Kiểm soát tích hợp dịch vụ thứ ba & Lưu trữ đám mây

1. 🔒 **Cloudinary Media Storage**:
   - Chỉ dùng để lưu ảnh minh họa câu hỏi thi/luyện tập (`question.service.js`).
   - Sử dụng bộ nhớ RAM `memoryStorage` khi upload, không tạo file rác trên đĩa server.
   - Định danh ảnh được băm SHA-256 nội dung để chống trùng lặp dữ liệu.
   - Tuyệt đối không upload ảnh scan văn bản mật hoặc căn cước/hồ sơ cá nhân lên Cloudinary.
2. 🔒 **Sao lưu cơ sở dữ liệu (Google Drive Backup)**:
   - Module sao lưu tự động/thủ công (`backup.service.js`) kết nối đến Google Drive chỉ định của đơn vị qua giao thức OAuth2 (Client ID, Client Secret, Refresh Token được bảo mật qua biến môi trường `.env`).
   - Tệp sao lưu nén định dạng `.gz` chuẩn BSON từ `mongodump`, tuyệt đối không dùng link chia sẻ công khai.
3. 🔒 **Tài liệu học tập & Ôn tập nội bộ (.pdf, .docx, .xlsx)**:
   - Lưu trữ cục bộ hoàn toàn trên đĩa máy chủ nội bộ (`server/uploads/study-documents/`).
   - Truy cập file bắt buộc qua stream có xác thực JWT (`study-document.service.js`), kiểm tra quyền tải/đọc theo phòng ban, tuyệt đối không đặt trong thư mục public static.
4. 🔒 **An toàn Trợ lý AI & Cô lập dữ liệu**:
   - Khi thí sinh trò chuyện với AI, chỉ trích xuất tài liệu của phòng ban thí sinh vào prompt context (`ai-assistant.service.js`).
   - Leader chat và AI phân tích chỉ sử dụng dữ liệu thống kê tổng hợp/mã hóa, tuyệt đối không gửi PII, email, CCCD hay câu hỏi thi chính thức ra API ngoài.
   - AI sinh đề tự động tuân thủ Human-in-the-loop: chỉ xuất file Word/Excel tạm thời để Examiner kiểm duyệt trước khi nạp vào hệ thống.
5. 🔒 **Không tùy tiện thêm SDK/Telemetry bên ngoài**:
   - Không cài đặt các thư viện giám sát telemetry đám mây (Google Analytics, LogRocket, Sentry SaaS...) gửi dữ liệu ra Internet khi chưa có sự phê chuẩn của Ban CNTT Nhà máy Z176.

---

## 3. Quy chuẩn Kiến trúc Hệ thống (Architectural Standards)

### 3.1. Phân tầng Backend (Node.js/Express)
1. **Controller mỏng, Service dày (Thin Controllers, Rich Services)**:
   - Controller chỉ làm nhiệm vụ tiếp nhận `req`, trích xuất `params/query/body`, gọi Service xử lý và trả về `res.status().json()`.
   - Toàn bộ logic nghiệp vụ, tính toán điểm số, kiểm tra ràng buộc thời gian, phân quyền dữ liệu và ghi Audit Log bắt buộc nằm trong `server/src/services/`.
2. **Quản lý dữ liệu với 16 Mongoose Models**:
   - Mọi truy vấn và mô hình hóa dữ liệu phải tuân thủ chuẩn 16 Model hiện có:
     - *Hệ thống & Tổ chức:* `User`, `Role`, `Department`, `Employee`, `AuditLog`, `AiSetting`
     - *Ngân hàng câu hỏi:* `Topic`, `Question`, `Answer` (hỗ trợ phân định `usage: 'exam'` vs `'practice'`, phạm vi `Common` vs `DepartmentSpecific`)
     - *Thi & Luyện tập:* `Exam`, `ExamCode`, `ExamCodeQuestion`, `ExamCandidate`, `ExamAttempt`, `AttemptQuestion`, `CandidateAnswer`, `Result`, `PracticeSession`
     - *Tài liệu & Thông báo:* `StudyDocument`, `Notification`
3. **Quản trị Tiến trình nền (Cron Schedulers)**:
   - Hệ thống vận hành 4 tác vụ định kỳ tự động (`server/src/schedulers/`):
     - `backup.scheduler.js`: Sao lưu MongoDB và tải lên Google Drive (chạy lúc 03:00 hàng ngày).
     - `upload-cleanup.scheduler.js`: Dọn dẹp tệp tin tạm phát sinh khi import/export quá 6h (chạy mỗi giờ một lần).
     - `account-purge.scheduler.js`: Xóa các tài khoản bị khóa vĩnh viễn >6 tháng chưa từng có lịch sử thi và audit log (chạy lúc 04:00 hàng ngày).
     - `abandoned-attempt.scheduler.js`: Tự động nộp bài và tính điểm cho các lượt thi `in_progress` bị bỏ rơi mất kết nối quá thời hạn `inactive_timeout` (quét định kỳ mỗi phút một lần).
4. **Kiểm soát Tần suất (Rate Limiting)**:
   - Mọi endpoint nhạy cảm phải qua Rate Limiter chuyên biệt.
   - `loginRateLimiter`: Giới hạn theo cặp định danh `req.ip + username`, cấu hình `skipSuccessfulRequests: true` (5 lần sai / 15 phút).
   - `examAttemptRateLimiter`: 100 req/phút/user cho phòng thi.
   - `aiChatRateLimiter`: 20 req/phút/user cho Trợ lý AI.

### 3.2. Chuẩn mực Frontend (React 19 + Vite + Tailwind CSS v4)
1. **Quản lý State & Phiên đăng nhập**:
   - `accessToken` lưu trong bộ nhớ; `refreshToken` lưu trong HttpOnly Cookie bảo mật cao.
   - Kiểm soát đơn phiên qua `tokenVersion`: Khi Quản trị viên thay đổi vai trò hoặc tài khoản đăng nhập nơi khác, hệ thống tăng `tokenVersion`. Client tự động phát hiện mã `AUTH_ACCESS_REVOKED`, hiển thị `SessionRevokedModal` và thu hồi phiên làm việc.
2. **Cấu trúc Tab theo vai trò (Role-based Dynamic Tabs)**:
   - Hệ thống chia làm 4 Dashboard tương ứng 4 vai trò:
     - `AdminDashboard.jsx` (5 tab: Overview, Users, Backups, AuditLogs, AiSettings)
     - `ExaminerDashboard.jsx` (8 tab: Overview, Topics, Departments, Questions, QuestionGenerator, StudyDocuments, Exams, QuestionQuality)
     - `LeaderDashboard.jsx` (8 tab: Overview, ExamReview, Readiness, Anomaly, DetailedResults, DepartmentReport, ExamReport, AiAssistant)
     - `CandidateDashboard.jsx` (Exams, Practice, History, StudyDocuments, AiAssistantChat)
3. **Thiết kế UI/UX & Responsive**:
   - Tuân thủ nghiêm ngặt [design-system.md](file:///d:/code%20file/Z176-main/design/design-system.md): Bảng màu 5 màu chức năng nghiêm túc (xanh chính `#008BC5`, xanh lá `#22C55E`, đỏ `#E53E3E`, vàng `#F6AD37`, xám `#64748B`), không dùng gradient cho các nút/thẻ chức năng.
   - Cỡ chữ tối thiểu 16px cho nội dung đọc, vùng chạm tối thiểu 44×44px cho Mobile-first.
   - Trực quan hóa sơ đồ tư duy bằng Mermaid.js và biểu đồ Recharts; giao tiếp giọng nói 2 chiều qua Web Speech API.
3. **Thiết kế UI/UX & Responsive**:
   - Tuân thủ nghiêm ngặt [design-system.md](file:///d:/code%20file/Z176-main/design/design-system.md): Bảng màu 5 màu chức năng nghiêm túc (xanh chính `#008BC5`, xanh lá `#22C55E`, đỏ `#E53E3E`, vàng `#F6AD37`, xám `#64748B`), không dùng gradient cho các nút/thẻ chức năng.
   - Cỡ chữ tối thiểu 16px cho nội dung đọc, vùng chạm tối thiểu 44×44px cho Mobile-first.
   - Trực quan hóa sơ đồ tư duy bằng Mermaid.js và biểu đồ Recharts; giao tiếp giọng nói 2 chiều qua Web Speech API.
   - Sử dụng thư viện icon `lucide-react`, component UI thống nhất (Button, Card, Modal, Badge, Pagination, LoadingSkeleton).

---

## 4. Nghiệp vụ Thi cử & Quản lý Nhân sự Cốt lõi (Core Business Rules)

### 4.1. Quản lý Tài khoản & Hồ sơ Nhân sự (User & Employee)
1. **Tính độc lập giữa User và Employee**:
   - `User`: Chịu trách nhiệm xác thực, tên đăng nhập, mật khẩu băm bcrypt, vai trò `roleCode`, trạng thái tài khoản.
   - `Employee`: Chịu trách nhiệm thông tin nhân sự (Họ tên, Mã nhân viên, Phòng ban chính `departmentId`, Danh sách phòng ban kiêm nhiệm `extraDepartmentIds`, Chức vụ, Ngày sinh, Giới tính, SĐT, Địa chỉ).
   - Khi chỉnh sửa thông tin cá nhân qua `PATCH /api/users/:id/profile`, nếu user chưa có bản ghi `Employee` thì hệ thống tự động khởi tạo và liên kết hai chiều. Trạng thái `Employee.isActive` tự động đồng bộ theo vai trò.
2. **Ràng buộc khi đổi vai trò (Role Change)**:
   - Không cho phép chuyển một tài khoản sang vai trò `candidate` nếu tài khoản đó chưa có hồ sơ `Employee` (thiếu Mã nhân viên hoặc Phòng ban).
   - Không cho phép đổi vai trò nếu người dùng đang có lượt thi `in_progress` chưa hoàn tất.
   - Khi đổi vai trò thành công, bắt buộc tăng `tokenVersion` để thu hồi phiên cũ lập tức.

### 4.2. Cơ chế Ngân hàng Câu hỏi & Soạn đề Thi
1. **Phân loại Ngân hàng câu hỏi (`Question`)**:
   - `usage`: Phân định rạch ròi giữa ngân hàng `exam` (dùng cho kỳ thi chính thức) và `practice` (dùng cho thí sinh tự luyện tập).
   - Hỗ trợ câu hỏi theo phòng ban cụ thể (`departmentId`, `scope: 'DepartmentSpecific'`) và câu hỏi dùng chung (`scope: 'Common'`).
2. **Cơ chế Bù câu hỏi chung (`allowCommonCompensation`)**:
   - Khi tạo đề thi cho nhiều phòng ban, nếu một phòng ban thiếu câu hỏi nghiệp vụ riêng, hệ thống tự động kiểm tra công tắc `allowCommonCompensation` để bù đắp bằng câu hỏi chung.
3. **Nhập liệu linh hoạt (Word & Excel)**:
   - Hỗ trợ Import Excel 2 bước (Upload -> Validate & Preview -> Commit).
   - Hỗ trợ Import Word `.docx` sử dụng thư viện `mammoth`, tự động bóc tách câu hỏi, đáp án, và nhận diện đáp án đúng thông qua định dạng gạch chân (`<u>`) hoặc tiền tố `*`.

### 4.3. Giám sát Lượt thi & Tính điểm Trung thực
1. **Sinh mã đề thi (`ExamCode`) & Đề thi cá nhân hóa (`AttemptQuestion`)**:
   - Khi thí sinh vào thi, hệ thống tạo bản ghi `AttemptQuestion` snapshot: xáo trộn thứ tự câu hỏi và thứ tự các đáp án riêng biệt cho từng thí sinh bằng Fisher–Yates, ngăn chặn gian lận nhìn bài.
2. **Heartbeat & Tự động nộp bài (Auto-submit)**:
   - Thí sinh gửi tín hiệu Heartbeat mỗi 15 giây lên server.
   - Nếu quá thời gian làm bài hoặc client ngắt kết nối quá thời gian chờ, hệ thống nộp bài tự động (3 tầng phòng thủ: Client 10s, Server 60s, Scheduler 1 phút).
   - Giám sát số lần rời màn hình `leaveCount` để Leader phát hiện dấu hiệu bất thường trên `AnomalyTab`.
3. **Chấm điểm bảo mật ở Backend**:
   - Thí sinh nộp bài qua `CandidateAnswer`, việc so khớp đáp án đúng và tính điểm số `Result` tuyệt đối thực hiện tại server (`exam-attempt.service.js`).
   - Kết quả xếp loại (Đạt/Không đạt) tính toán theo `passThresholdPercent` của kỳ thi.

---

## 5. Phân định Trách nhiệm: AI Tự chủ vs. Cần Dương Duyệt trước

| Loại công việc | AI được tự chủ thực hiện | Cần Dương duyệt kỹ trước khi merge |
|---|:---:|:---:|
| Xây dựng UI component, CSS, Mermaid Mindmap, Animation, Skeleton, Dialog | ✅ | |
| Viết CRUD cơ bản, helper định dạng ngày tháng, xuất Excel/Word | ✅ | |
| Căn chỉnh Responsive, sửa lỗi UI hiển thị, icon, tooltip | ✅ | |
| Bổ sung Unit test, Mock data, Seeding scripts cho môi trường test | ✅ | |
| Cập nhật tài liệu kỹ thuật, sơ đồ hệ thống, API docs | ✅ | |
| Thay đổi cấu trúc Mongoose Schema (16 models cốt lõi) | | ⚠️ (Bắt buộc duyệt cấu trúc) |
| Chỉnh sửa Middleware xác thực JWT, thu hồi phiên, Cookie bảo mật | | ⚠️ (Bắt buộc kiểm thử bảo mật) |
| Điều chỉnh thuật toán sinh đề, bù câu hỏi, snapshot xáo đáp án | | ⚠️ (Bắt buộc kiểm thử logic) |
| Sửa đổi logic tính điểm bài thi, điều kiện hoàn tất kỳ thi | | ⚠️ (Bắt buộc kiểm thử kết quả) |
| Cấu hình sao lưu Google Drive hoặc dọn dẹp dữ liệu tự động | | ⚠️ (Bắt buộc kiểm thử an toàn DB) |
| Thao tác với môi trường Production hoặc tiếp cận dữ liệu thật | | ❌ (Chỉ Dương / QTV đơn vị thực hiện) |

---

## 6. Quy trình Làm việc khi AI Đề xuất Code (Workflow Rules)

1. **Tuân thủ quy ước mã nguồn đã có**:
   - Không tự tiện cài thêm các thư viện cồng kềnh khi hệ thống đã có giải pháp tương đương (ví dụ: đã dùng Tailwind thì không cài Bootstrap; đã dùng Zustand thì không cài Redux; đã có `api.js` Axios instance thì không dùng fetch trần).
2. **Xử lý khi yêu cầu nghiệp vụ phức tạp hoặc mơ hồ**:
   - AI không được tự ý đoán mò nghiệp vụ nhạy cảm của đơn vị. Khi gặp tình huống chưa rõ ràng, AI phải trình bày các lựa chọn phân tích (kèm ưu/nhược điểm) để Dương chọn phương án tối ưu.
3. **Kiểm tra tính nhất quán sau mỗi lần cập nhật**:
   - Khi chỉnh sửa API hoặc Model, phải kiểm tra ảnh hưởng dây chuyền đến các Controller, Service, Scheduler và giao diện Frontend liên quan.
4. **Minh bạch & Ghi chép học thuật**:
   - Ghi lại nhật ký tiến độ các phần việc chính đã thực hiện cùng AI vào tài liệu theo dõi khóa luận.
   - Đảm bảo nắm vững 100% kiến trúc, luồng dữ liệu và thuật toán cốt lõi để tự tin thuyết minh và giải trình minh bạch trước Hội đồng chấm khóa luận tốt nghiệp.

