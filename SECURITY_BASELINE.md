# SECURITY_BASELINE.md — Chuẩn bảo mật tối thiểu
## Module Thi Chuyên Môn Nội Bộ — Z176
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam  
**Mục đích:** Cụ thể hóa mục 4 "Do-Not-Touch" trong `SKILLS.md` thành checklist áp dụng được — dùng để tự review code (của mình lẫn AI sinh ra) trước khi merge, và để chạy trước mỗi lần demo/deploy.

> File này đồng bộ trực tiếp với `SKILLS.md`, `AGENT_RULES.md` và phản ánh 100% hiện trạng triển khai trong mã nguồn thực tế của hệ thống Z176.

---

## 1. Xác thực & Phân quyền (Auth / RBAC)

- [x] JWT access token có thời gian sống ngắn (`15m`), refresh token dài hạn (`7d`), lưu ở `httpOnly cookie` (`sameSite: 'lax'`, `secure` ở production) — không lưu access token ở `localStorage`.
- [x] Cơ chế **`tokenVersion`** thu hồi phiên tức thì: Khi người dùng đăng nhập mới ở thiết bị khác hoặc đổi mật khẩu, `tokenVersion` trên `User` tăng lên (+1), vô hiệu hóa ngay lập tức toàn bộ access token và refresh token của phiên cũ (`AUTH_ACCESS_REVOKED`).
- [x] Bắt buộc đổi mật khẩu lần đầu (`mustChangePassword`): Middleware `requirePasswordChanged` chặn mọi thao tác nghiệp vụ cho tới khi đổi mật khẩu mới.
- [x] Mọi route `/api/**` liên quan đề thi/đáp án/kết quả/tài liệu đều đi qua middleware `authenticate` + `requireRoleCodes(...)`, không có route "tạm bỏ qua để test" sót lại.
- [x] Phân quyền chặt chẽ 4 vai trò độc lập:
  - `candidate`: Chỉ truy cập tài liệu và câu hỏi theo đúng phòng ban chính và các phòng kiêm nhiệm `extraDepartmentIds`; không có endpoint nào trả về đáp án đúng (`isCorrect`) trước/trong khi thi.
  - `examiner`: Chỉ quản lý danh mục, ngân hàng câu hỏi và tạo bản nháp/đề xuất kỳ thi; không được duyệt hoặc tự phát hành kỳ thi.
  - `leader`: Phê duyệt/từ chối đề xuất, cấu hình thời gian thi, phát hành kỳ thi và cấp thêm lượt thi.
  - `admin`: Quản trị người dùng, sao lưu/khôi phục CSDL, xem Audit Log toàn hệ thống.
- [x] Kiểm tra quyền ở **server**, không chỉ ẩn UI ở client (ẩn nút không thay thế cho kiểm tra phân quyền backend).
- [x] Không hardcode secret/token trong code — cấu hình tập trung qua `env.js`, đọc từ biến môi trường (`.env`, không commit `.env` lên git).
- [x] Khóa tài khoản tạm thời chống brute-force: Đăng nhập sai quá 5 lần (`ACCOUNT_LOCK_MAX_ATTEMPTS`) sẽ khóa tài khoản trong 15 phút (`ACCOUNT_LOCK_MINUTES`).

## 2. Mật khẩu & Mã hóa

- [x] Mật khẩu người dùng hash bằng `bcrypt` với `saltRounds = 12`.
- [x] Đề thi bảo mật: Client không bao giờ nhận được đáp án đúng trước/trong khi thi. Chấm điểm 100% tự động ở phía server.
- [x] Trộn câu hỏi/đáp án sử dụng thuật toán xáo trộn an toàn (Fisher–Yates shuffle).
- [x] Session thi (`ExamAttempt`) được định danh bằng mã băm `examSessionTokenHash`, có thời hạn làm bài (`expiresAt`), khóa ngay khi nộp bài hoặc hết giờ.
- [x] Snapshot đề thi riêng biệt (`AttemptQuestion`): Mỗi lượt thi sinh một bản snapshot xáo trộn câu hỏi và các phương án A-B-C-D cố định, ngăn chặn nhìn bài chéo và cố định giao diện khi mất mạng tải lại trang.

## 3. Logging & Debug

- [x] `console.log`/logger không bao giờ in ra câu hỏi/đáp án dạng rõ (plaintext) — kể cả môi trường dev.
- [x] Log lỗi production không leak stack trace ra response cho client — trả về theo format chuẩn `{ success: false, message, code }` qua middleware xử lý lỗi tập trung trong `app.js`.
- [x] Nhật ký kiểm toán an ninh (`AuditLog`) ghi nhận tập trung tại Controller cho mọi hành vi nhạy cảm: tạo/sửa/xóa user, đổi mật khẩu, phân quyền, sửa/xóa câu hỏi, chuyển đổi ngân hàng thi/ôn tập, duyệt/từ chối/phát hành kỳ thi, sao lưu/khôi phục dữ liệu, dọn file tạm. Ghi kèm `actorUserId`, `action`, `resourceType`, `metadata` và `ipAddress`.
- [x] Tìm kiếm Audit Log thông minh theo họ tên nhân viên, mã nhân viên hoặc phòng ban.
- [x] Không tích hợp dịch vụ logging/error-tracking đám mây của bên thứ ba ra ngoài mạng nội bộ đơn vị.

## 4. Dữ liệu & Quản lý Tệp tin

- [x] Quản lý tải lên hình ảnh minh họa câu hỏi an toàn: Sử dụng `multer.memoryStorage()`, tính mã băm SHA-256 nội dung file ảnh làm `public_id` trên Cloudinary, không lưu file đĩa tạm, tự động hủy ảnh cũ khi cập nhật.
- [x] Bảo vệ tài liệu ôn tập nội bộ (.pdf, .doc, .docx, .xls, .xlsx): Lưu trữ trực tiếp trên đĩa server nội bộ (`uploadDir`), KHÔNG lưu trên cloud công cộng. Stream file nhị phân qua API yêu cầu xác thực JWT và kiểm tra đúng phòng ban của nhân viên.
- [x] Nhập đề thi đa định dạng an toàn:
  - Nhập Excel: Quy trình Preview 2 bước kiểm tra tính hợp lệ dữ liệu.
  - Nhập Word (.docx): Bóc tách qua `mammoth`, tự động nhận diện đáp án gạch chân hoặc ký hiệu `*`, phân loại vào `needsReview` nếu phát hiện định dạng bất thường.
- [x] Tự động dọn dẹp file tạm: Cron job chạy mỗi giờ (`0 * * * *`) tự động quét và xóa file tạm > 6 tiếng trong thư mục `uploadDir`.
- [x] Tự động xóa cứng tài khoản khóa > 6 tháng: Cron job chạy lúc 04:00 hàng ngày (`0 4 * * *`), chỉ xóa nếu tài khoản chưa từng tham gia kỳ thi (`ExamCandidate = 0`) và không có vết kiểm toán (`AuditLog = 0`), ghi audit `ACCOUNT_PURGE_AUTO`.
- [x] Sao lưu CSDL tự động lên Google Drive: Chạy định kỳ lúc 03:00 hàng ngày (`0 3 * * *`), xoay vòng giữ tối đa 5 bản sao lưu mới nhất. Thao tác khôi phục CSDL bắt buộc gửi `confirm=RESTORE`.

## 5. Giám sát Phòng thi & Chống Gian lận (Anti-Cheat & Concurrency)

- [x] **Autosave thời gian thực**: Lưu đáp án ngay từng câu qua `CandidateAnswer` (upsert theo `{examAttemptId, questionId}`).
- [x] **Heartbeat 15 giây**: Client định kỳ gửi tín hiệu duy trì hoạt động và cập nhật `lastActiveAt` trên server.
- [x] **Khóa nút thoát modal**: Ẩn nút "X" khi bắt đầu làm bài chính thức, ép thí sinh phải nộp bài hoặc chờ hết giờ.
- [x] **Cảnh báo rời tab 10 giây**: Bắt sự kiện `visibilitychange` và `window.onblur`, đếm ngược 10 giây tự nộp bài nếu thí sinh rời khỏi giao diện thi.
- [x] **Tự động nộp bài khi mất kết nối (Server-side 60s)**: Kiểm tra ở đầu mọi request; nếu không có hoạt động quá 60s, server tự động nộp bài (`inactive_timeout`) và chấm điểm trên các đáp án đã lưu.
- [x] **Abandoned Attempt Scheduler**: Cron job chạy mỗi phút (`* * * * *`) tự động nộp và chấm điểm các bài thi bị thí sinh bỏ rơi (tắt máy/ngắt mạng > 2 phút hoặc quá giờ làm bài).
- [x] **Kiểm soát phát hành kỳ thi (Single Published Exam & Publish Lock)**:
  - Partial unique index `uniq_single_published_exam` đảm bảo chỉ duy nhất 1 kỳ thi ở trạng thái `published` tại một thời điểm.
  - Khóa nguyên tử `publishLockedAt` (TTL 10 phút) chống xung đột khi nhiều Leader phát hành cùng lúc.
  - Cảnh báo số lượng thí sinh đang thi trước khi đăng đè kỳ thi mới (`getPublishImpact`).

## 6. Input, Validation & Tầng Mạng

- [x] Validate ở cả client (UX) và server (bắt buộc) — không tin dữ liệu gửi từ client.
- [x] Chống NoSQL Injection: Sử dụng Mongoose ODM với Parameterized Query, kiểm tra định dạng `ObjectId` trước khi truy vấn.
- [x] Chống XSS & Clickjacking: `helmet()` tự động thiết lập các header an toàn (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, ẩn `X-Powered-By`).
- [x] CORS cấu hình chặt chẽ theo danh sách whitelist trong biến môi trường `CORS_ORIGIN`.
- [x] **Rate Limiting thông minh (Keyed Rate Limiting)**:
  - Đăng nhập: Giới hạn theo cặp `${req.ip}|${username}` và chỉ đếm các lượt thất bại (`skipSuccessfulRequests: true`), chống brute-force mà không làm nghẽn người dùng khác trong cùng mạng LAN/NAT nhà máy.
  - Phòng thi: Giới hạn 100 req/phút theo **userId** cho các API làm bài thi, đảm bảo công bằng hạn ngạch cho từng thí sinh.
  - Trợ lý AI: Giới hạn tần suất qua `aiChatRateLimiter` (theo `userId`), chống lạm dụng token/quota và quá tải dịch vụ.

## 7. An toàn & Bảo mật Tích hợp Trợ lý AI (AI Safety & Data Isolation)

- [x] **Cách ly dữ liệu tài liệu theo phân quyền**: Thí sinh gọi Trợ lý AI (`POST /api/ai-assistant/chat`) chỉ được trích xuất dữ liệu từ các tài liệu ôn tập thuộc phòng ban chính và phòng kiêm nhiệm `extraDepartmentIds` của chính mình; không thể truy vấn chéo tài liệu phòng ban khác.
- [x] **Nguyên tắc "Do-Not-Touch" & Dữ liệu giả lập (Mock Data)**: Khi thử nghiệm dịch vụ AI bên ngoài, tuyệt đối chỉ sử dụng dữ liệu giả lập (mock data), không gửi thông tin thật, bí mật quân sự hay dữ liệu cá nhân cán bộ Nhà máy Z176 ra ngoài internet.
- [x] **Kiểm duyệt hai bước khi sinh đề thi AI**: Câu hỏi do AI sinh ra (`generate-questions`) chỉ được xuất thành file tải về (Word/Excel) để Người ra đề kiểm tra, rà soát trước khi import thủ công; AI không có quyền ghi thẳng dữ liệu vào ngân hàng câu hỏi.
- [x] **Giới hạn Context Window an toàn (`maxDocChars`)**: Giới hạn độ dài nội dung tài liệu trích xuất (mặc định 60.000 ký tự) nhằm tránh tràn context, kiểm soát chi phí token và ngăn ngừa tấn công prompt injection qua nội dung tệp.

## 8. Checklist kiểm tra trước khi Merge / Deploy

1. [x] Đã đối chiếu với danh sách nguyên tắc cứng trong `SKILLS.md` mục 4.
2. [x] Không để lộ thông tin đáp án đúng (`isCorrect`) hoặc cấu trúc đề thi bí mật xuống client.
3. [x] Mọi endpoint mới đều có middleware xác thực và phân quyền đúng role.
4. [x] Đã kiểm tra tính tương thích ngược và ràng buộc dữ liệu tại Mongoose Schema.
5. [x] Chạy kiểm thử luồng đăng nhập, làm bài thi, autosave, heartbeat và báo cáo xuất Excel.
6. [x] Dữ liệu kiểm thử sử dụng dữ liệu giả lập (mock data), không sử dụng thông tin thật của cán bộ Nhà máy Z176.

