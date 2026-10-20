# Tình huống Ngoại lệ & Hạn chế Hệ thống Z176

Tài liệu này tổng hợp các tình huống ngoại lệ (edge cases) mà hệ thống đã **chủ động xử lý** để tránh lỗi trong vận hành thực tế, cùng các **hạn chế kỹ thuật** mà dự án hiện chưa giải quyết hoặc chấp nhận đánh đổi.

---

## PHẦN A — TÌNH HUỐNG NGOẠI LỆ ĐÃ KHẮC PHỤC

### A1. Trùng lặp ngẫu nhiên mã đề khi tạo ExamCode (Retry E11000)

**Tình huống:** Hàm `buildExamCode` sinh mã đề có hậu tố ngẫu nhiên (ví dụ `D3F9A1-XUONG1-NV001-A8F1`). Trong trường hợp hi hữu trùng mã duy nhất `{examId, code}` trên MongoDB (ném lỗi `E11000`).

**Cách khắc phục:** Hàm `ensureExamCodeForEmployee` trong `exam-code-generation.service.js` chủ động bắt mã lỗi `11000`, tự động retry sinh lại mã đề mới với hậu tố ngẫu nhiên khác và tiếp tục lưu DB an toàn.

---

### A2. Publish kỳ thi bị gián đoạn giữa chừng (Idempotent Recovery theo từng nhân viên)

**Tình huống:** Quá trình publish kỳ thi đã tạo xong `ExamCode` và `ExamCandidate` cho một số nhân viên thì gặp lỗi mạng hoặc DB timeout. Leader bấm "Đăng chính thức" lại lần nữa.

**Cách khắc phục:** Hàm `generateExamCodesAndAssignCandidates` được thiết kế idempotent theo **từng nhân viên**:
- Quét danh sách nhân viên đã có `ExamCandidate` cho kỳ thi này (`alreadyAssignedIds`) → bỏ qua, không tạo lại.
- Chỉ tạo `ExamCode` và `ExamCandidate` cho những nhân viên còn thiếu (`pendingEmployees`).
- Trạng thái kỳ thi chỉ chuyển sang `published` **sau khi** sinh đề và gán thành công cho tất cả nhân viên của mọi phòng ban → không bao giờ publish dở dang.

---

### A3. Thí sinh tải lại trang / đổi thiết bị giữa chừng khi đang thi

**Tình huống:** Máy tính thí sinh bị treo, phải chuyển sang điện thoại, hoặc vô tình nhấn F5 reload trang trong lúc đang làm bài.

**Cách khắc phục:** Hàm `startAttempt` kiểm tra: nếu đang có lượt thi `in_progress` còn hạn → **trả về đúng lượt thi đó** (`resumed: true`), không tạo lượt mới và không tốn lượt thi. Snapshot `AttemptQuestion` (thứ tự câu hỏi và đáp án đã xáo) và `CandidateAnswer` (đáp án đã autosave) đều được giữ nguyên trên server → thí sinh mở lại từ bất kỳ thiết bị nào vẫn thấy đúng bài thi và đáp án đã chọn trước đó.

---

### A4. Tài khoản nhân viên đã nghỉ (đã khóa) trùng mã với nhân viên mới

**Tình huống:** Nhân viên A nghỉ việc (tài khoản bị khóa `isActive: false`), sau đó nhân viên B mới vào trùng mã nhân viên hoặc trùng username với A.

**Cách khắc phục:** Hàm `createUser` trong `user.service.js` gọi `findExistingAccountForReuse` tìm theo cả `employeeCode` và `username`:
- Nếu tài khoản trùng đang **bị khóa** và role là `candidate` → tự động **tái sử dụng** (hàm `reactivateLockedAccount`): mở khóa, cập nhật hồ sơ Employee mới, đổi username nếu khác, sinh mật khẩu tạm mới, ghi audit log "Tái sử dụng tài khoản đã khóa".
- Nếu tài khoản trùng đang **hoạt động** → báo lỗi `USERNAME_EXISTS` hoặc `EMPLOYEE_CODE_ACTIVE`, không cho ghi đè.

---

### A5. Phòng ban / Chủ đề bị xóa mềm rồi tạo lại trùng tên

**Tình huống:** Quản trị viên xóa phòng ban "Kỹ thuật" (xóa mềm → `isActive: false`), sau đó tạo lại phòng ban cùng tên "Kỹ thuật" hoặc import Excel có phòng ban đó.

**Cách khắc phục:**
- `upsertDepartmentForImport` và `findOrCreateDepartmentByName` trong `department.service.js`: tìm cả bản ghi đã bị xóa mềm (`isActive: false`); nếu trùng tên/mã → **khôi phục** (bật lại `isActive: true`, cập nhật thông tin mới) thay vì tạo bản ghi mới đụng unique index.
- `createTopic` trong `topic.service.js`: tương tự, nếu tên chủ đề trùng với chủ đề đã xóa mềm → khôi phục và trả thêm cờ `restored: true` để giao diện hiển thị thông báo "đã khôi phục chủ đề cũ (bao gồm các câu hỏi cũ thuộc chủ đề này)".

---

### A6. Thí sinh bỏ thi / ngắt kết nối đột ngột (3 Tầng Bảo vệ Tự động nộp bài)

**Tình huống:** Thí sinh tắt máy tính, mất điện, hoặc cố tình đóng trình duyệt để "câu giờ" không nộp bài.

**Cách khắc phục:** Hệ thống dựng **3 tầng phòng thủ song song**:

---

### A7. Trợ lý AI sinh câu hỏi lỗi hoặc vượt quá Context Window (AI Question Generation Safety)

**Tình huống:** Tệp tài liệu ôn tập (.pdf, .docx) quá dài vượt quá giới hạn token của LLM, hoặc AI phản hồi định dạng JSON bị khuyết thiếu/sai cú pháp câu hỏi trắc nghiệm.

**Cách khắc phục:**
- Hàm `extractDocumentText` chủ động cắt ngắn văn bản theo trần `maxDocChars` cấu hình trong `AiSetting` (mặc định 60.000 ký tự) để đảm bảo không bị tràn context.
- Cơ chế parse JSON phòng thủ có fallback trích xuất khối mã Markdown ` ```json ... ``` ` và kiểm tra cấu trúc từng câu hỏi trước khi tạo file.
- **Human-in-the-loop**: Kết quả sinh đề không ghi thẳng vào database mà nén thành file Word/Excel (`QuestionFileBuilder`) để Examiner tải về kiểm duyệt bằng mắt trước khi nạp vào ngân hàng câu hỏi.


| Tầng | Vị trí | Thời gian | Cơ chế |
|---|---|---|---|
| **Tầng 1** | Client (`ExamModal.jsx`) | 10 giây | Sự kiện `visibilitychange` / `blur` → hiện cảnh báo đếm ngược 10s → quá hạn tự gọi `submitAttempt` |
| **Tầng 2** | Server Request Guard (`checkAndAutoSubmitIfInactive`) | 60 giây | Kiểm tra `lastActiveAt` tại mọi API (`getMyExam`, `recordAnswer`, `heartbeat`) → nếu idle > 60s → cưỡng chế nộp bài, chấm điểm dựa trên `CandidateAnswer` đã autosave |
| **Tầng 3** | Background Cron (`abandoned-attempt.scheduler.js`) | 1 phút | Chạy mỗi phút (`* * * * *`), tự động quét và nộp tất cả bài thi `in_progress` bị treo mạng/ngắt máy quá 60s trong DB |

Lớp 2 và Lớp 3 là các lớp bảo vệ cốt lõi không thể bị vô hiệu hóa từ phía client.

---

### A7. Nộp bài 2 lần liên tiếp (Double-submit)

**Tình huống:** Mạng lag, thí sinh nhấn "Nộp bài" 2 lần liên tiếp hoặc client tự động nộp đúng lúc thí sinh cũng bấm nộp.

**Cách khắc phục:** Hàm `submitAttempt` kiểm tra: nếu lượt thi đã ở trạng thái `submitted` từ trước → trả về đúng `Result` đã chấm trước đó, **không chấm lại**, không tạo `Result` trùng. Tính chất idempotent.

---

### A8. Gán đề thi cho nhân viên mới tạo thất bại (nuốt lỗi an toàn + thông báo)

**Tình huống:** Trong lúc kỳ thi đang `published`, Quản trị viên tạo nhân viên mới thuộc phòng ban có ngân hàng câu hỏi không đủ → lỗi `INSUFFICIENT_QUESTIONS`.

**Cách khắc phục:** Hàm `assignEmployeeToActiveExamIfAny`:
- **Không ném lỗi ra ngoài** → tài khoản nhân viên vẫn tạo thành công bình thường.
- Ghi cảnh báo `console.error` ra log hệ thống.
- Gọi `notifyExamAssignmentFailed` gửi thông báo tới tất cả Admin và Examiner đã tạo kỳ thi, kèm tên nhân viên, phòng ban, và lý do thất bại → để người quản trị chủ động bổ sung câu hỏi.

---

### A9. File Excel import bị hỏng hoặc đổi đuôi giả

**Tình huống:** File `.txt` đổi đuôi thành `.xlsx`, hoặc file Excel bị hỏng giữa chừng lúc upload.

**Cách khắc phục:** Hàm `readImportRows` trong `question.service.js` bọc `XLSX.readFile` trong try-catch: nếu thư viện `xlsx` ném lỗi kỹ thuật (vd "Corrupted zip", "Unsupported file") → bọc lại thành `ApiError` tiếng Việt rõ ràng: *"File không đúng định dạng Excel hoặc đã bị hỏng. Vui lòng kiểm tra lại file (.xlsx) và tải lên lại."*

---

### A10. Import câu hỏi trùng lặp với ngân hàng hiện có

**Tình huống:** File Excel hoặc Word chứa câu hỏi giống hệt câu đã có trong DB (do import lại file cũ, hoặc copy-paste nội dung).

**Cách khắc phục:** Hệ thống tải trước toàn bộ câu hỏi `isActive: true` vào `Set` (key = `topicId|scope|departmentId|normalizedContent`), so khớp từng câu import:
- Trùng → đưa vào danh sách `duplicates`, hiển thị ở bước preview để người dùng quyết định giữ/bỏ.
- Không trùng → đưa vào `ready`.
Tránh N+1 query bằng cách dùng `Set` thay vì query DB từng câu.

---

### A11. Chặn thay đổi `usage` hoặc xóa câu hỏi khi kỳ thi đang diễn ra

**Tình huống:** Examiner đổi mục đích sử dụng (`usage` từ `exam` sang `practice`) hoặc xóa câu hỏi thuộc chủ đề đang được kỳ thi `published` sử dụng. Dù câu hỏi đó không nằm trong đề đã sinh, nhưng nếu nhân viên mới được thêm vào → hệ thống cần tạo `ExamCode` mới và query lại `Question.isActive:true` → thiếu số lượng → lỗi `INSUFFICIENT_QUESTIONS`.

**Cách khắc phục:**
- `deactivateQuestion` và `deactivateManyQuestions`: chặn **toàn bộ** câu hỏi thuộc chủ đề đang được kỳ thi `published` dùng (theo `topicId`), kèm thông báo rõ tên kỳ thi.
- `updateQuestion`: chặn sửa trường `usage` nếu câu hỏi thuộc chủ đề có kỳ thi đang `published` (`QUESTION_USAGE_LOCKED`).
- `deactivateTopic`: chặn xóa chủ đề nếu có `Exam` đang `published` tham chiếu `topicId` đó.

---

### A12. Phân biệt token hết hạn vs token giả mạo

**Tình huống:** Frontend không phân biệt được khi nào access token hết hạn (cần refresh) và khi nào token bị sai/giả mạo (cần logout). Trước đây cả 2 trường hợp cùng trả mã `AUTH_ACCESS_INVALID`, khiến client luôn gọi thêm 1 API `/auth/refresh` vô ích.

**Cách khắc phục:** Hàm `verifyAccessToken` phân biệt 2 loại lỗi:
- `TokenExpiredError` (token đúng chữ ký nhưng quá `exp`) → mã `AUTH_ACCESS_EXPIRED` → client tự động gọi refresh rồi thử lại request gốc.
- Các lỗi khác (sai chữ ký, bị sửa, sai định dạng) → mã `AUTH_ACCESS_INVALID` → client logout ngay, không tốn lượt gọi refresh.

---

### A13. Chỉ cho phép 1 phiên đăng nhập hoạt động tại 1 thời điểm

**Tình huống:** Nhân viên đăng nhập ở 2 trình duyệt/thiết bị khác nhau → có thể nhờ người khác thi hộ ở thiết bị thứ 2.

**Cách khắc phục:** Mỗi lần đăng nhập thành công, hàm `loginWithUsernamePassword` tự tăng `tokenVersion` → mọi access/refresh token đã cấp trước đó (ở phiên cũ) lập tức bị lệch `tv` so với DB → bị middleware `authenticate` từ chối với mã `AUTH_ACCESS_REVOKED` ở request kế tiếp. Client polling hoặc nhận diện mã lỗi lập tức bật `SessionRevokedModal`.

---

### A14. Khóa tài khoản khi đăng nhập sai nhiều lần & Rate Limit theo IP + Username

**Tình huống:** Tấn công brute-force mật khẩu, hoặc nhân viên quên mật khẩu bấm thử nhiều lần.

**Cách khắc phục:** 
- Middleware `loginRateLimiter` đánh dấu khóa theo `${req.ip}|${username}` với `skipSuccessfulRequests: true` (chỉ tính lần nhập sai).
- Hàm `registerFailedLogin` đếm `failedLoginAttempts`: khi vượt `accountLockMaxAttempts` → gán `lockUntil` (thời gian khóa tạm 15 phút) → lần đăng nhập tiếp theo bị chặn với mã `AUTH_LOCKED` (HTTP 423). Đăng nhập thành công sẽ reset bộ đếm về 0.

---

### A15. Bù đắp câu hỏi riêng có điều kiện (`allowCommonCompensation`)

**Tình huống:** Phòng ban X cần 5 câu riêng nhưng ngân hàng chỉ có 3 câu riêng → nếu chặn hẳn thì cả kỳ thi không publish được chỉ vì 1 phòng ban thiếu 2 câu riêng.

**Cách khắc phục:** `validateQuestionAvailability` trong `exam-code-generation.service.js` kiểm tra cờ cấu hình `allowCommonCompensation`:
- Nếu `allowCommonCompensation === true`: Tự động bù 2 câu thiếu từ pool câu hỏi Chung (`commonPickCount = commonQuestionCount + shortfall`). Chỉ ném lỗi khi **tổng 2 pool (Chung + Riêng)** vẫn không đủ tổng số câu của đề thi.
- Nếu `allowCommonCompensation === false`: Chặn lại ngay lập tức và ném lỗi `INSUFFICIENT_DEPARTMENT_QUESTIONS`, yêu cầu bổ sung câu hỏi riêng đúng theo quy chuẩn.

---

### A16. Ảnh câu hỏi dùng chung trên Cloudinary (Content-addressable)

**Tình huống:** 2 câu hỏi import ảnh giống hệt nhau → tạo 2 bản sao asset trên Cloudinary, tốn dung lượng.

**Cách khắc phục:** `uploadQuestionImageBuffer` tính `SHA-256` nội dung ảnh làm `public_id` + `overwrite: true` → ảnh giống nhau tự dùng chung 1 asset, import/upload lại đúng ảnh cũ sẽ ghi đè thay vì tạo bản sao.

---

### A17. File tạm import bị bỏ dở không dọn (Upload Cleanup Scheduler)

**Tình huống:** Người dùng upload file Excel hoặc Word import, xem preview rồi đóng tab/đổi ý → file tạm nằm lại trên đĩa vĩnh viễn.

**Cách khắc phục:** Scheduler `upload-cleanup.scheduler.js` chạy mỗi giờ, xóa file tạm trong `uploadDir` cũ hơn 6 tiếng. Ghi audit log `UPLOAD_TMP_CLEANUP` để truy vết. Chạy ngay 1 lần lúc server khởi động để dọn rác tồn đọng.

---

### A18. Race Condition & Xung đột khi Publish kỳ thi (`publishLockedAt` & Single Published Exam)

**Tình huống:** 2 cán bộ quản lý (Leader) cùng bấm "Đăng chính thức" cho 2 kỳ thi khác nhau tại cùng 1 giây, hoặc một người click đúp chuột gửi 2 request publish đồng thời.

**Cách khắc phục:**
1. **Khóa chống click đúp / Concurrency lock**: Trước khi bắt đầu sinh đề, hệ thống cập nhật `publishLockedAt = new Date()`. Nếu request khác đến trong vòng 5 phút khi khóa chưa được giải phóng, hệ thống từ chối ngay với mã `PUBLISH_IN_PROGRESS`.
2. **Quy tắc Single Active Exam**: Index partial unique `uniq_single_published_exam` trên CSDL MongoDB đảm bảo chỉ duy nhất 1 kỳ thi ở trạng thái `published`.
3. **Cơ chế Force Override & Tự động Archive**: Khi publish kỳ thi mới, kỳ thi cũ tự động chuyển sang `archived`. Nếu có thí sinh đang thi trong kỳ thi cũ, hệ thống cung cấp API kiểm tra tác động (`/publish-impact`) và yêu cầu xác nhận `force: true`.

---

### A19. Import Excel & Word với tiêu đề cột tiếng Việt linh hoạt

**Tình huống:** File import có tiêu đề cột "Chủ đề", "CHU DE", "chude", "Chủ Đề", hoặc định dạng Word có khoảng trắng/chữ hoa chữ thường.

**Cách khắc phục:** Hàm `normalizeKey` loại bỏ dấu tiếng Việt (thay `đ` -> `d`), chuyển chữ thường, bỏ khoảng trắng. Map enum được build bằng `buildNormalizedMap` đảm bảo khớp chuẩn xác.

---

### A20. Rate Limiting theo `userId` thay vì IP trong Phòng thi

**Tình huống:** Trong phòng thi lớn (50–100+ thí sinh cùng mạng LAN công ty), tất cả thí sinh đều chia sẻ chung 1 IP công cộng (NAT). Rate limiter mặc định đếm theo IP khiến hàng trăm thí sinh gửi heartbeat và autosave cộng dồn vào cùng 1 bộ đếm → bị chặn nhầm 429.

**Cách khắc phục:** `examAttemptRateLimiter` sử dụng `keyGenerator: (req) => req.auth?.userId ?? req.ip` — đếm rate limit theo **userId** (mỗi thí sinh 100 req/phút), không bị ảnh hưởng bởi người khác cùng mạng.

---

### A21. Tự động xóa cứng tài khoản bị khóa liên tục quá 6 tháng (Account Purge Scheduler)

**Tình huống:** Tài khoản nhân viên đã nghỉ việc bị khóa lâu ngày tích tụ làm tăng dung lượng CSDL nhưng không thể xóa bừa bãi làm mất dữ liệu lịch sử thi cử và kiểm toán.

**Cách khắc phục:** Scheduler `account-purge.scheduler.js` chạy lúc **04:00 hàng ngày**:
1. Lọc các tài khoản `isActive: false` và có `lockedAt <= now - 6 tháng` liên tục.
2. Kiểm tra dấu vết lịch sử (`hasHistoricalFootprint`): Nếu tài khoản **đã từng tham gia kỳ thi** (`ExamCandidate > 0`) hoặc **từng ghi audit log** (`AuditLog > 0`) → **Tuyệt đối không xóa**, giữ lại vĩnh viễn để bảo vệ tính toàn vẹn báo cáo.
3. Chỉ xóa cứng tài khoản không có vết lịch sử, ghi 1 dòng audit log tổng hợp `ACCOUNT_PURGE_AUTO`.

---

### A22. Xử lý Nhân sự Kiêm nhiệm nhiều Phòng ban (`extraDepartmentIds`)

**Tình huống:** Một nhân viên thuộc biên chế Xưởng Cơ khí nhưng kiêm nhiệm Tổ An toàn. Khi tham gia kỳ thi chuyên môn, hệ thống không biết nên lấy đề thi theo phòng ban nào.

**Cách khắc phục:**
1. Model `Employee` hỗ trợ trường `extraDepartmentIds` lưu danh sách phòng ban kiêm nhiệm.
2. Khi mở phòng thi, nếu nhân viên kiêm nhiệm chưa được xác nhận phòng ban thi (`roleConfirmedAt = null`), giao diện hiển thị Modal yêu cầu chọn phòng ban dự thi.
3. Khi bắt đầu làm bài, trường `ExamAttempt.departmentId` được sao chép và đóng băng vĩnh viễn theo phòng ban đã chọn để đảm bảo chấm điểm và thống kê chính xác tuyệt đối.

---

## PHẦN B — HẠN CHẾ HIỆN TẠI CỦA DỰ ÁN

### B1. Tổ chức Kỳ thi Độc quyền (Single Active Exam Policy)

Hệ thống thiết kế theo cơ chế một thời điểm chỉ có tối đa 1 kỳ thi ở trạng thái `published`. Khi phát hành kỳ thi mới, kỳ thi cũ tự động lưu trữ (`archived`).

**Hệ quả:** Chưa thể tổ chức song song 2 kỳ thi độc lập tại cùng một thời điểm (ví dụ kỳ thi Kiểm tra Tay nghề Xưởng 1 và kỳ thi PCCC Khối Văn phòng cùng diễn ra trong một ngày).

---

### B2. Giao tiếp dựa trên Polling (Chưa có WebSocket Real-time)

Hệ thống hiện dùng **HTTP polling** (client gọi API định kỳ) thay vì WebSocket:
- Client polling `tokenVersion` mỗi 5 giây để phát hiện phiên bị thu hồi.
- Thông báo (Notification) cần refresh trang hoặc chờ polling để hiển thị.

**Hệ quả:** Độ trễ phản hồi lên tới vài giây khi phiên bị thu hồi. Chưa có tính năng đẩy tin nhắn tức thì (Push notification).

---

### B3. Không sử dụng MongoDB Transaction (Atomicity dựa trên Service)

Do hệ thống hướng tới khả năng triển khai linh hoạt trên các cụm MongoDB đơn lẻ (Standalone MongoDB) không bắt buộc Replica Set, các thao tác ghi dữ liệu nhiều bước (như Publish Exam tạo ExamCode + ExamCandidate) được bảo vệ bằng cơ chế **Idempotent Recovery** thay vì MongoDB Multi-document Transactions.

**Hệ quả:** Trong trường hợp hi hữu server bị mất điện đúng tích tắc đang ghi CSDL, có thể tồn tại bản ghi mồ côi cần Leader bấm publish lại để hệ thống tự động hoàn tất.

---

### B4. Cơ chế Xóa mềm Danh mục Nghiệp vụ

Đối với Phòng ban (`Department`), Chủ đề (`Topic`), và Câu hỏi (`Question`), hệ thống áp dụng cơ chế xóa mềm (`isActive: false`) để bảo toàn tính toàn vẹn tham chiếu với các đề thi đã phát hành và kết quả thi trong quá khứ. Chưa có công cụ quản trị (Purge Tool) để xóa cứng các danh mục này.

---

### B5. Sao lưu Phụ thuộc Công cụ Hệ điều hành & Google Drive

- **mongodump / mongorestore** phải được cài sẵn trên server (`mongodb-database-tools`).
- **Google Drive** lưu bản backup qua OAuth2 cá nhân. Refresh token cần được quản lý định kỳ để tránh hết hạn.
- Khôi phục dữ liệu (`mongorestore --drop`) sẽ ghi đè toàn bộ dữ liệu CSDL hiện tại.

---

### B6. Ảnh câu hỏi phụ thuộc Dịch vụ Cloudinary

Ảnh câu hỏi được lưu trữ đám mây trên Cloudinary (dù tài liệu ôn tập PDF/Word được lưu an toàn trên ổ đĩa server nội bộ). Nếu mất kết nối Internet quốc tế tới Cloudinary, ảnh câu hỏi có thể tải chậm hoặc không hiển thị được.

