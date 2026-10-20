# ĐẶC TẢ CHI TIẾT LUỒNG HOẠT ĐỘNG 4 VAI TRÒ (ROLES)
## HỆ THỐNG THI TRẮC NGHIỆM CHUYÊN MÔN NỘI BỘ Z176

> **Đơn vị áp dụng:** Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng  
> **Tài liệu tham chiếu chuẩn xác:** Phản ánh 100% logic mã nguồn Backend (Node.js/Express/MongoDB) & Frontend (React/Vite).

---

## MỤC LỤC TỔNG QUAN

1. [Bảng ma trận phân quyền 4 Roles](#1-bảng-ma-trận-phân-quyền-4-roles)
2. [Đặc tả Role 1: Quản trị viên (Admin - `admin`)](#2-role-1-quản-trị-viên-admin---admin)
3. [Đặc tả Role 2: Người ra đề (Examiner - `examiner`)](#3-role-2-người-ra-đề-examiner---examiner)
4. [Đặc tả Role 3: Người duyệt đề (Leader - `leader`)](#4-role-3-người-duyệt-đề-leader---leader)
5. [Đặc tả Role 4: Thí sinh (Candidate - `candidate`)](#5-role-4-thí-sinh-candidate---candidate)
6. [Sơ đồ phối hợp liên vai trò (Inter-role Workflow)](#6-sơ-đồ-phối-hợp-liên-vai-trò-inter-role-workflow)
7. [Bảng mã lỗi và xử lý ngoại lệ theo từng Role](#7-bảng-mã-lỗi-và-xử-lý-ngoại-lệ-theo-từng-role)

---

## 1. BẢNG MA TRẬN PHÂN QUYỀN 4 ROLES

| Nhóm chức năng / Nghiệp vụ | Admin (`admin`) | Examiner (`examiner`) | Leader (`leader`) | Candidate (`candidate`) |
| :--- | :--- | :--- | :--- | :--- |
| **Quản lý người dùng & phân quyền** (CRUD, Import Excel, Reset pass) | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền | ❌ Không có quyền |
| **Gán phòng ban kiêm nhiệm (`extraDepartmentIds`)** | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền | ❌ Không có quyền |
| **Xuất danh sách tài khoản & mật khẩu tạm** (`/export-credentials`) | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền | ❌ Không có quyền |
| **Sao lưu & Phục hồi dữ liệu** (Drive Backup/Restore) | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền | ❌ Không có quyền |
| **Xem Nhật ký hệ thống (Audit Logs)** | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền | ❌ Không có quyền |
| **Quản lý Chủ đề thi & Phòng ban** (CRUD Topic / Department) | **Toàn quyền** | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền |
| **Quản lý Ngân hàng câu hỏi** (CRUD, Import Excel + Word .docx, Upload ảnh) | **Toàn quyền** | **Toàn quyền** | ❌ Không có quyền | ❌ Không có quyền |
| **Quản lý Tài liệu ôn tập** (Upload đĩa cứng Server, Phân quyền PB) | **Toàn quyền** | **Toàn quyền** | Chỉ xem/tải | Chỉ xem/tải theo PB |
| **Soạn thảo & Đệ trình Đề xuất kỳ thi** (`draft` -> `pending_review`) | ❌ Xem danh sách | **Toàn quyền tạo/gửi** | ❌ Chỉ thẩm định | ❌ Không có quyền |
| **Cấu hình Bù câu hỏi chung & Phạm vi PB** (`allowCommonCompensation`, `departmentScope`) | ❌ | **Toàn quyền cấu hình** | **Toàn quyền thẩm định** | ❌ Không có quyền |
| **Thẩm định, Phê duyệt / Từ chối Đề xuất kỳ thi** | ❌ Không có quyền | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Phát hành kỳ thi & Kích hoạt sinh đề tự động** (`publish`) | ❌ Không có quyền | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Ghi đè kỳ thi đang mở (Force Override Single Published)** | ❌ Không có quyền | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Lưu trữ kỳ thi đã kết thúc** (`archive`) | ❌ Không có quyền | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Xem Báo cáo thống kê toàn diện & Xuất Excel** | **Toàn quyền** | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Cấp thêm lượt thi chính thức cho thí sinh** (`grant-attempt`) | ❌ Không có quyền | ❌ Không có quyền | **Toàn quyền** | ❌ Không có quyền |
| **Xác nhận phòng ban dự thi cho nhân sự kiêm nhiệm** | ❌ | ❌ | Hỗ trợ xác nhận hộ | **Tự chọn & xác nhận** |
| **Xem tài liệu ôn tập được cấp quyền theo phòng ban** | ✅ | ✅ | ✅ | **Toàn quyền** |
| **Hỏi đáp Trợ lý AI (Mindmap, TTS, Speech-to-Text)** | Cấu hình tham số LLM | Sinh đề tự động bằng AI | Hỏi đáp báo cáo/kỳ thi | **Hỏi đáp tài liệu PB** |
| **Tham gia làm bài thi trắc nghiệm (Autosave, Heartbeat, 3 Tầng Guard)** | ❌ Không làm bài | ❌ Không làm bài | ❌ Không làm bài | **Toàn quyền** |
| **Luyện tập / Thi thử (Practice Mode)** | ❌ | ❌ | ❌ | **Toàn quyền** |
| **Xem Lịch sử kết quả thi cá nhân** | ❌ | ❌ | ❌ | **Toàn quyền** |
| **Nhận chuông thông báo In-app** | Chỉ thông báo lỗi gán đề | Nhận duyệt/từ chối/lỗi | Nhận đề xuất thi | Nhận kỳ thi phát hành |

---

## 2. ROLE 1: QUẢN TRỊ VIÊN (ADMIN - `admin`)

Vai trò Quản trị viên chịu trách nhiệm cao nhất về hạ tầng người dùng, tính an toàn thông tin, sao lưu dữ liệu và giám sát an ninh toàn hệ thống.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                    ROLE: ADMIN                         │
                    └───────────────────────────┬────────────────────────────┘
                                                │
       ┌────────────────────────┬───────────────┴───────────────┬─────────────────────────┐
       ▼                        ▼                               ▼                         ▼
┌──────────────┐      ┌──────────────────┐            ┌───────────────────┐     ┌───────────────────┐
│ Quản trị     │      │ Sao lưu &        │            │ Giám sát          │     │ Quản trị danh mục │
│ Tài khoản    │      │ Phục hồi DB      │            │ Nhật ký (Audit)   │     │ & Ngân hàng đề    │
└──────┬───────┘      └────────┬─────────┘            └─────────┬─────────┘     └─────────┬─────────┘
       │                       │                                │                         │
       ├─ CRUD / Khóa User     ├─ Backup Drive (Cron/Thủ công) ├─ Lọc theo Actor/Action  ├─ Topic / Dept
       ├─ Quản lý Kiêm nhiệm   ├─ Tải file .gz                  ├─ Xem Metadata chi tiết  ├─ Ngân hàng câu hỏi
       ├─ Import Excel 2 bước  ├─ Khôi phục (mongorestore)      └─ Truy vết IP/Thời gian  └─ Tài liệu ôn tập
       ├─ Xuất DS pass tạm     └─ Xoay vòng tối đa 5 bản                                  └─ Dọn rác 6h & 6m
       └─ Đổi vai trò (Role)
```

### 2.1. Quản lý Người dùng & Phân quyền (Account Management)
*   **Danh sách tài khoản**: Xem danh sách toàn bộ cán bộ công nhân viên kèm trạng thái hoạt động (`isActive`), vai trò (`roleCode`), phòng ban chính, phòng ban kiêm nhiệm (`extraDepartmentIds`), thông tin cá nhân. Hỗ trợ lọc theo phòng ban, vai trò, trạng thái khóa, tìm kiếm theo tên/mã nhân viên.
*   **Tạo mới tài khoản đơn lẻ**: Nhập thông tin nhân viên (`fullname`, `employeeCode`, `dob`, `gender`, `phone`, `position`, `departmentId`, `extraDepartmentIds`, `roleId`). Hệ thống tự động tạo `User` và `Employee`, đặt cờ `mustChangePassword = true`.
    *   *Đặc biệt*: Nếu đang có kỳ thi ở trạng thái `published`, hệ thống tự động kiểm tra phạm vi phòng ban và gán nhân viên mới vào kỳ thi thông qua `assignEmployeeToActiveExamIfAny`.
*   **Quản lý Kiêm nhiệm (`extraDepartmentIds`)**: Cấu hình các phòng ban bổ sung cho nhân viên giữ nhiều trọng trách trong nhà máy (ví dụ vừa thuộc Xưởng Cơ khí vừa phụ trách Tổ An toàn vệ sinh lao động).
*   **Import danh sách nhân viên từ tệp Excel (Quy trình 2 bước an toàn)**:
    1.  *Bước 1 (Preview - `POST /api/users/import/preview`)*: Tải file Excel danh sách nhân sự lên. Backend phân tích, kiểm tra tính hợp lệ dữ liệu, đối soát với CSDL và phân loại từng dòng (hợp lệ mới, trùng mã nhân viên đang hoạt động, trùng tài khoản bị khóa trước đó, lỗi định dạng). Trả kết quả xem trước trực quan cho Admin, **hoàn toàn chưa ghi dữ liệu vào DB**.
    2.  *Bước 2 (Confirm - `POST /api/users/import/confirm`)*: Admin kiểm tra bảng preview, xác nhận nhập thật. Hệ thống thực hiện ghi DB hàng loạt, tự động kích hoạt gán vào kỳ thi đang `published` nếu có.
*   **Xuất thông tin tài khoản & Reset mật khẩu hàng loạt (`POST /api/users/export-credentials`)**:
    *   Hành động có side-effect quan trọng: Reset mật khẩu của toàn bộ tài khoản `candidate` đang hoạt động thành mật khẩu ngẫu nhiên an toàn, đồng thời xuất ra tệp Excel gồm `Họ tên`, `Mã NV`, `Username`, `Mật khẩu mới` để bàn giao cho các đơn vị phòng ban.
*   **Khóa / Mở khóa tài khoản (`PATCH /api/users/:id/lock`)**:
    *   Khóa tài khoản nhân viên khi nghỉ việc hoặc vi phạm kỷ luật. Tài khoản bị khóa sẽ ngay lập tức bị thu hồi phiên làm việc (`tokenVersion++`) và cập nhật `lockedAt = new Date()`.
    *   Mở khóa tài khoản: Reset `lockedAt = null`, `failedLoginAttempts = 0`, `lockUntil = null`.
*   **Thay đổi vai trò (`PATCH /api/users/:id/role`)**: Nâng cấp hoặc chuyển đổi vai trò của người dùng (giữa Admin, Examiner, Leader, Candidate).
*   **Reset mật khẩu đơn lẻ (`POST /api/users/:id/reset-password`)**: Sinh mật khẩu ngẫu nhiên mới cho 1 tài khoản cụ thể và đặt `mustChangePassword = true`.

### 2.2. Quản lý Sao lưu & Phục hồi Dữ liệu (Backup & Restore)
*   **Sao lưu tự động**: Cron job chạy định kỳ **03:00 sáng hàng ngày** (múi giờ `Asia/Ho_Chi_Minh`), tự động xuất bản sao lưu `mongodump`, nén định dạng `.gz`, tải lên Google Drive (OAuth2) và tự động xoay vòng giữ tối đa **5 bản sao lưu mới nhất** (xóa bản cũ hơn).
*   **Sao lưu thủ công (`POST /api/backups`)**: Admin có thể bấm nút "Tạo bản sao lưu ngay" bất kỳ lúc nào để sao lưu tức thời trước khi thực hiện các thay đổi lớn.
*   **Xem danh sách bản sao lưu (`GET /api/backups`)**: Hiển thị danh sách các file sao lưu trên Google Drive gồm tên file, kích thước, thời gian tạo.
*   **Tải về bản sao lưu (`GET /api/backups/:fileId/download`)**: Stream trực tiếp file nén `.gz` từ Google Drive về máy tính của Admin.
*   **Khôi phục dữ liệu (`POST /api/backups/restore`)**:
    *   Admin tải lên tệp `.gz` (tối đa 2GB) và bắt buộc nhập chuỗi xác nhận `confirm = "RESTORE"`.
    *   Hệ thống thực hiện `mongorestore --drop` (xóa dữ liệu hiện tại và nạp lại toàn bộ dữ liệu từ bản sao lưu). Ghi audit log an ninh nghiêm ngặt `BACKUP_RESTORE`.

### 2.3. Giám sát Nhật ký An ninh Hệ thống (Audit Logs)
*   **Truy cập Nhật ký (`GET /api/audit-logs`)**: Admin có quyền tra cứu toàn bộ vết hoạt động trong hệ thống.
*   **Bộ lọc chi tiết**: Lọc theo người thực hiện (`actorUserId`), loại tài nguyên (`resourceType`), hành động (`action`: tạo/sửa/xóa/đăng nhập/khóa...), khoảng thời gian.
*   **Thông tin chi tiết**: Mỗi bản ghi lưu trữ địa chỉ IP client, thời gian thực hiện, metadata trước và sau khi thay đổi (diff) và trạng thái thành công/thất bại.

### 2.4. Cấu hình Trợ lý AI Hệ thống (`AiSettingsTab`)
*   **Quản lý tham số kết nối LLM (`GET/PUT /api/ai-assistant/settings`)**:
    *   Bật/tắt toàn hệ thống (`isEnabled`).
    *   Cấu hình endpoint OpenAI-compatible (`baseUrl`, ví dụ Google Gemini, Groq, hoặc máy chủ cục bộ Ollama/vLLM).
    *   Cấu hình `model` (ví dụ `gemini-flash-latest`), `apiKey` bảo mật lưu trữ phía server.
    *   Tùy chỉnh `systemPrompt` (định hướng phong cách trợ lý học tập chuẩn mực quân đội, hỗ trợ sơ đồ tư duy Mermaid).
    *   Thiết lập giới hạn trích xuất tài liệu `maxDocChars` (tối đa 400.000 ký tự) nhằm bảo vệ context window và kiểm soát chi phí API.

---

## 3. ROLE 2: NGƯỜI RA ĐỀ (EXAMINER - `examiner`)

Người ra đề chịu trách nhiệm xây dựng nội dung chuyên môn: quản trị danh mục chủ đề, phòng ban, biên soạn và import ngân hàng câu hỏi (Excel + Word .docx), upload tài liệu ôn tập và lập đề xuất kỳ thi đệ trình lên Leader.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   ROLE: EXAMINER                       │
                    └───────────────────────────┬────────────────────────────┘
                                                │
       ┌────────────────────────┬───────────────┴───────────────┬─────────────────────────┐
       ▼                        ▼                               ▼                         ▼
┌──────────────┐      ┌──────────────────┐            ┌───────────────────┐     ┌───────────────────┐
│ Quản lý      │      │ Ngân hàng        │            │ Tài liệu          │     │ Soạn thảo Đề xuất │
│ Chủ đề & PB  │      │ Câu hỏi          │            │ Ôn tập            │     │ Kỳ thi            │
└──────┬───────┘      └────────┬─────────┘            └─────────┬─────────┘     └─────────┬─────────┘
       │                       │                                │                         │
       ├─ Thêm/Sửa/Xóa Topic   ├─ Nhập câu hỏi lẻ (Lý thuyết/TH)├─ Upload Disk Server     ├─ Tạo đề xuất Draft
       └─ Thêm/Sửa/Xóa Dept    ├─ Import Excel (Preview/Confirm)├─ Gán Scope (Chung/PB)   ├─ Cấu hình tỷ lệ câu
                               ├─ Import Word (.docx, mammoth)  └─ Phân quyền phòng ban   ├─ allowCommonCompensation
                               ├─ Quản lý usage (exam/practice) └─ Xóa tài liệu           ├─ departmentScope
                               ├─ Upload ảnh Cloudinary (SHA256)                          ├─ Đệ trình (Submit)
                               └─ Khóa sửa usage nếu published                            └─ Nhận Notification
```

### 3.1. Quản lý Chủ đề thi & Phòng ban (Topics & Departments)
*   **Quản lý Chủ đề (`/api/topics`)**: Tạo mới, chỉnh sửa tên/mô tả, kích hoạt/hủy kích hoạt chủ đề kiểm tra chuyên môn (ví dụ: *An toàn lao động*, *Kỹ thuật dệt may*, *Nghiệp vụ cơ khí*). Cho phép bấm xem nhanh ngân hàng câu hỏi thuộc chủ đề đó.
*   **Quản lý Phòng ban (`/api/departments`)**: Quản lý danh mục các phòng ban/phân xưởng trong nhà máy kèm mã phòng ban (`code`) và chuẩn hóa định danh (`slug`).

### 3.2. Quản lý Ngân hàng Câu hỏi (Question Bank)
*   **Phân loại đa chiều**:
    *   Gắn theo **Chủ đề** (`topicId`).
    *   **Phạm vi áp dụng (`scope`)**: `Common` (Toàn nhà máy) hoặc `DepartmentSpecific` (Gắn đúng `departmentId`).
    *   **Mục đích sử dụng (`usage`)**: `exam` (Dùng cho kỳ thi chính thức) hoặc `practice` (Dùng cho chế độ thi thử). **Khóa chuyển đổi usage** nếu câu hỏi đang thuộc chủ đề của kỳ thi `published`.
    *   **Loại câu hỏi (`questionKind`)**: `theory` (Lý thuyết) hoặc `practice` (Thực hành).
    *   **Độ khó (`difficulty`)**: `easy` (Dễ), `medium` (Trung bình), `hard` (Khó).
    *   **Kiểu đáp án (`answerType`)**: `single` (Chọn 1 đáp án đúng) hoặc `multiple` (Chọn nhiều đáp án đúng).
*   **Tải ảnh minh họa câu hỏi (`POST /api/questions/upload-image`)**:
    *   Tải ảnh minh họa trực tiếp lên Cloudinary sử dụng bộ nhớ đệm `memoryStorage`.
    *   Tạo `public_id` bằng chuỗi băm SHA-256 nội dung ảnh để chống trùng lặp. Tự động xóa ảnh cũ trên Cloudinary khi người dùng thay ảnh khác.
*   **Nhập câu hỏi thủ công**: Thêm/sửa từng câu hỏi, nội dung câu hỏi, danh sách 2-6 phương án trả lời, đánh dấu phương án đúng (`isCorrect`).
*   **Import câu hỏi từ Excel (Quy trình 2 bước)**:
    1.  *Preview (`POST /api/questions/import/preview`)*: Đọc file Excel biểu mẫu câu hỏi, kiểm tra cú pháp, validate dữ liệu, trả về danh sách các câu hợp lệ và danh sách câu lỗi chi tiết từng dòng.
    2.  *Confirm (`POST /api/questions/import/confirm`)*: Nhận mảng câu hỏi đã được preview xác nhận và lưu đồng loạt vào DB.
*   **Import câu hỏi từ Word (.docx qua thư viện `mammoth`)**:
    *   Cho phép Examiner tải lên tài liệu đề thi Microsoft Word (.docx).
    *   Backend bóc tách cấu trúc đoạn văn bản, nhận diện cú pháp câu hỏi và phương án A, B, C, D kèm đáp án gạch chân/đánh dấu.
    *   Chuyển đổi thành preview tương tự Excel trước khi lưu chính thức vào ngân hàng câu hỏi.
*   **Thao tác hàng loạt (Bulk Operations)**: Hỗ trợ tìm kiếm, lọc theo chủ đề/phòng ban/loại/độ khó, và xóa nhiều câu hỏi cùng lúc (`POST /api/questions/bulk-delete`). Chặn xóa câu hỏi thuộc chủ đề đang mở thi `published`.

### 3.3. Quản lý Tài liệu Ôn tập (Study Documents)
*   **Lưu trữ bảo mật tuyệt đối**: Toàn bộ tệp tài liệu ôn tập (.pdf, .doc, .docx, .xls, .xlsx, tối đa 20MB) được **lưu trữ trực tiếp trên đĩa cứng máy chủ nội bộ (`uploadDir`)**, hoàn toàn không gửi lên dịch vụ đám mây công cộng.
*   **Phân quyền tài liệu**: Gắn theo chủ đề và cấu hình phạm vi `scope`: `Common` (tất cả thí sinh) hoặc `DepartmentSpecific` (chỉ thí sinh đúng phòng ban).
*   **Upload & Quản lý (`POST /api/study-documents`, `DELETE /api/study-documents/:id`)**: Thêm tài liệu mới kèm mô tả, xóa tài liệu cũ không còn hiệu lực.

### 3.4. Soạn thảo & Đệ trình Đề xuất Kỳ thi (Exam Proposals)
*   **Tạo Đề xuất Kỳ thi (`POST /api/exams`)**: Examiner tạo bản nháp kỳ thi (`status = 'draft'`) với các thông số:
    *   `title`: Tên kỳ thi (ví dụ: *"Kiểm tra An toàn Lao động & PCCC Quý 3"*).
    *   `topicId`: Chủ đề kỳ thi.
    *   `durationMinutes`: Thời gian làm bài (phút, ví dụ 30 phút).
    *   `totalQuestions`: Tổng số câu hỏi trong đề (ví dụ 30 câu).
    *   `commonQuestionCount`: Số câu hỏi chung cho toàn bộ nhân viên.
    *   `departmentQuestionCount`: Số câu hỏi riêng theo phòng ban.
    *   `allowCommonCompensation`: Cờ cho phép bù đắp câu hỏi chung khi ngân hàng câu hỏi riêng của phòng ban bị thiếu (`true`/`false`).
    *   `departmentScope`: Phạm vi phòng ban áp dụng (`all` - toàn bộ nhà máy, hoặc `selected` - chọn danh sách phòng ban cụ thể trong `allowedDepartmentIds`).
    *   `passThresholdPercent`: Ngưỡng điểm đạt (mặc định 70%).
*   **Đệ trình duyệt (`POST /api/exams/:id/submit`)**:
    *   Chuyển trạng thái từ `draft` (hoặc `rejected`) sang `pending_review`.
    *   Gửi In-app Notification tới **tất cả người dùng có role `leader` đang active**.
*   **Nhận phản hồi duyệt**:
    *   Nếu Leader duyệt -> Nhận thông báo `exam_approved`.
    *   Nếu Leader từ chối -> Nhận thông báo `exam_rejected` kèm lý do từ chối cụ thể (`rejectionReason`).

### 3.5. Soạn câu hỏi tự động bằng Trợ lý AI (`QuestionGeneratorTab`)
*   **Trợ lý AI tạo đề (`POST /api/ai-assistant/generate-questions`)**:
    *   Examiner chọn chủ đề, phòng ban, số lượng câu hỏi cần sinh và tải file tài liệu tham khảo (.pdf, .docx, .xlsx).
    *   Backend bóc tách nội dung tài liệu (`unpdf`, `mammoth`), phân tích cấu trúc kiến thức và gọi LLM tạo các câu hỏi trắc nghiệm kèm đáp án và giải thích chi tiết.
    *   **Nguyên tắc Human-in-the-loop (Kiểm duyệt 2 bước)**: Kết quả tạo từ AI **không ghi thẳng vào database** mà tự động đóng gói xuất ra tệp Excel/Word theo đúng mẫu nhập đề chuẩn của Z176.
    *   Examiner tải file về, rà soát tính chuẩn xác chuyên môn quân sự, chỉnh sửa nếu cần rồi mới thực hiện nạp vào hệ thống qua tính năng Import thông thường.
    *   Theo dõi tiến trình sinh đề thời gian thực trên giao diện `GenerationProgress.jsx`.

---

## 4. ROLE 3: NGƯỜI DUYỆT ĐỀ (LEADER - `leader`)

Người duyệt đề là cán bộ quản lý chịu trách nhiệm thẩm định chất lượng đề xuất kỳ thi, kiểm tra tác động phát hành, xử lý xung đột kỳ thi duy nhất, kích hoạt sinh đề tự động, cấp thêm lượt thi và theo dõi báo cáo.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                    ROLE: LEADER                        │
                    └───────────────────────────┬────────────────────────────┘
                                                │
       ┌────────────────────────┬───────────────┴───────────────┬─────────────────────────┐
       ▼                        ▼                               ▼                         ▼
┌──────────────┐      ┌──────────────────┐            ┌───────────────────┐     ┌───────────────────┐
│ Thẩm định &  │      │ Phát hành &      │            │ Cấp thêm Lượt thi │     │ Báo cáo Thống kê  │
│ Phê duyệt    │      │ Kích hoạt sinh đề│            │ (Khắc phục sự cố) │     │ & Xuất Excel      │
└──────┬───────┘      └────────┬─────────┘            └─────────┬─────────┘     └─────────┬─────────┘
       │                       │                                │                         │
       ├─ Xem chi tiết đề xuất ├─ Kiểm tra publish-impact       ├─ Tra cứu thí sinh gặp   ├─ Thống kê Overview
       ├─ Phê duyệt (Set date) ├─ Khóa publishLockedAt          │  sự cố mất mạng/treo máy├─ Thống kê Phòng ban
       ├─ Từ chối (Nêu lý do)  ├─ Force override exam cũ        ├─ Grant attempt (+1 lượt)├─ Thống kê Bài thi
       └─ Lưu trữ (Archive)    ├─ Trộn đề Fisher-Yates + Gán    └─ Thí sinh được thi lại  └─ Xuất Excel chi tiết
                               └─ Gửi Broadcast Notification
```

### 4.1. Thẩm định, Phê duyệt & Từ chối Kỳ thi (Exam Review Workflow)
*   **Danh sách chờ duyệt**: Xem toàn bộ các đề xuất kỳ thi ở trạng thái `pending_review`.
*   **Xem chi tiết đề xuất**: Kiểm tra tổng số câu, tỷ lệ câu chung/riêng, cấu hình `allowCommonCompensation`, phạm vi `departmentScope`, thời lượng thi, ngưỡng điểm đạt và số lượng câu hỏi hiện có trong ngân hàng của từng phòng ban.
*   **Phê duyệt kỳ thi (`POST /api/exams/:id/approve`)**:
    *   Leader phê duyệt đề xuất và bắt buộc thiết lập cấu hình khung thời gian tổ chức: `startDate` và `endDate`.
    *   Trạng thái chuyển thành `approved`. Gửi thông báo `exam_approved` tới Examiner.
*   **Từ chối đề xuất (`POST /api/exams/:id/reject`)**:
    *   Leader bắt buộc nhập lý do từ chối (`rejectionReason`).
    *   Trạng thái chuyển thành `rejected`. Gửi thông báo `exam_rejected` kèm lý do tới Examiner.

### 4.2. Kiểm tra Tác động & Phát hành Kỳ thi (`POST /api/exams/:id/publish`)
1.  **Kiểm tra Tác động trước khi phát hành (`GET /api/exams/:id/publish-impact`)**:
    *   Hiển thị cảnh báo cho Leader nếu hệ thống đang có một kỳ thi khác đang mở (`published`).
    *   Thống kê số lượng thí sinh đang làm bài dở dang trong kỳ thi cũ nếu bị cưỡng chế lưu trữ.
2.  **Khóa đồng thời (`publishLockedAt`)**:
    *   Ngăn chặn 2 Leader cùng bấm publish hoặc Leader click đúp gửi 2 request song song.
3.  **Quy tắc Kỳ thi Hoạt động Duy nhất (Single Published Exam)**:
    *   Nếu có cờ `force: true` (hoặc cấu hình tự động), kỳ thi đang `published` trước đó sẽ tự động chuyển sang `archived`.
    *   Bảo đảm toàn vẹn thông qua index độc nhất `uniq_single_published_exam`.
4.  **Kiểm tra ngân hàng câu hỏi & Sinh đề ngẫu nhiên**:
    *   Kiểm tra ngân hàng câu hỏi của từng phòng ban theo cờ `allowCommonCompensation`.
    *   Trộn đề Fisher–Yates sinh `ExamCode` độc lập cho từng nhân viên và gán `ExamCandidate`.
5.  **Cập nhật trạng thái & Broadcast Notification**:
    *   Kỳ thi chuyển sang `published`.
    *   Gửi In-app Notification thông báo kỳ thi mới tới toàn bộ người dùng active trong diện thi.

### 4.3. Lưu trữ Kỳ thi (`POST /api/exams/:id/archive`)
*   Khi kỳ thi hoàn thành hoặc hết hạn, Leader bấm "Lưu trữ" (`archive`).
*   Trạng thái chuyển thành `archived`. Khóa toàn bộ các thao tác làm bài thi, chuyển dữ liệu vào chế độ chỉ đọc.

### 4.4. Cấp thêm Lượt thi Chính thức (`POST /api/exam-attempts/candidates/:examCandidateId/grant-attempt`)
*   **Bối cảnh**: Thí sinh gặp sự cố bất khả kháng ngoài ý muốn (mất điện đột ngột, lỗi thiết bị phòng máy).
*   **Thao tác của Leader**:
    *   Tại tab *Kết quả chi tiết*, Leader bấm nút **"Cấp thêm lượt thi"**.
    *   Hệ thống tăng trường `extraAttemptsGranted` thêm 1 trong `ExamCandidate`.
    *   Thí sinh có thể vào lại phòng thi để làm bài với snapshot câu hỏi xáo trộn mới hoàn toàn.

### 4.5. Báo cáo & Thống kê Toàn diện (Reports & Analytics)
*   **Tổng quan (`GET /api/reports/overview`)**: Tổng số thí sinh đã thi, tỷ lệ đạt/không đạt toàn công ty, điểm trung bình chung.
*   **Theo phòng ban (`GET /api/reports/by-department`)**: Biểu đồ so sánh tỷ lệ đạt và điểm trung bình giữa các phân xưởng.
*   **Theo bài thi (`GET /api/reports/by-exam`)**: Phân tích kết quả, phổ điểm của từng kỳ thi cụ thể.
*   **Kết quả chi tiết (`GET /api/reports/results`)**: Danh sách kết quả điểm số từng cá nhân thí sinh. Hỗ trợ lọc theo phòng ban, trạng thái đạt/không đạt.
*   **Xuất Báo cáo Excel chuyên nghiệp (`exceljs`)**: Tải file Excel danh sách kết quả tổng hợp chi tiết hoặc báo cáo chuyên sâu từng bài thi.
*   **Phân tích Chất lượng Câu hỏi & Dấu hiệu Bất thường**: Đánh giá độ phân cách, tỷ lệ chọn từng phương án, và phát hiện các trường hợp rời màn hình thi nhiều lần (`leaveCount`).
*   **Trợ lý AI Phân tích Kỳ thi & Báo cáo (`POST /api/ai-assistant/leader-chat`, `ReadinessSection.jsx`)**:
    *   Leader hỏi đáp với AI về tình hình sẵn sàng tổ chức thi, phân tích độ phủ câu hỏi giữa các phòng ban.
    *   Hỏi đáp tổng hợp số liệu báo cáo kỳ thi: so sánh tỷ lệ đạt giữa các phân xưởng, tìm ra các nội dung câu hỏi thí sinh hay làm sai nhất.
    *   **Nguyên tắc Bảo mật Mock Data**: Toàn bộ dữ liệu gửi lên LLM đã được làm sạch và ẩn danh (chỉ gửi ID phòng ban, số liệu thống kê tổng hợp; không gửi CCCD, email hay họ tên thật).
    *   Tự động vẽ trực quan sơ đồ tư duy (Mindmap) hoặc biểu đồ phân tích bằng cú pháp Mermaid ngay trong cửa sổ chat.

---

## 5. ROLE 4: THÍ SINH (CANDIDATE - `candidate`)

Thí sinh là đối tượng trung tâm tham gia quá trình ôn tập, luyện tập và trực tiếp thực hiện bài thi trắc nghiệm trên hệ thống.

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   ROLE: CANDIDATE                      │
                    └───────────────────────────┬────────────────────────────┘
                                                │
       ┌────────────────────────┬───────────────┴───────────────┬─────────────────────────┐
       ▼                        ▼                               ▼                         ▼
┌──────────────┐      ┌──────────────────┐            ┌───────────────────┐     ┌───────────────────┐
│ Học tập &    │      │ Vào Phòng thi &  │            │ Giám sát Realtime │     │ Chấm điểm & Xem   │
│ Ôn tập       │      │ Nhận Đề xáo riêng│            │ 3 Tầng Bảo vệ     │     │ Lịch sử Kết quả   │
└──────┬───────┘      └────────┬─────────┘            └─────────┬─────────┘     └─────────┬─────────┘
       │                       │                                │                         │
       ├─ Xem TL theo PB       ├─ Xác nhận PB (Kiêm nhiệm)      ├─ Autosave từng câu (DB) ├─ Chấm điểm Server-side
       ├─ Xem trực tiếp PDF    ├─ getMyExam (Kiểm tra lượt)     ├─ Heartbeat định kỳ 15s  ├─ Đạt/Không đạt (%pass)
       ├─ Tải về máy tính      ├─ startAttempt (Đóng băng PB    ├─ Cảnh báo rời tab 10s   ├─ Tra cứu lịch sử cá nhân
       └─ Thi thử (Practice)   │  + Sinh AttemptQuestion riêng) ├─ Server idle check 60s  └─ Xem chi tiết câu sai
                               └─ Resume phiên đang dở          └─ Cron tự nộp 1 phút
```

### 5.1. Ôn tập, Tra cứu Tài liệu & Luyện tập (Practice Mode)
*   **Phân quyền xem tài liệu (`GET /api/study-documents/candidate`)**:
    *   Thí sinh chỉ nhìn thấy danh mục tài liệu phù hợp: Tài liệu Dùng chung (`Common`) và tài liệu Riêng đúng phòng ban của thí sinh (hoặc phòng ban kiêm nhiệm).
    *   Xem trực tiếp PDF trên trình duyệt hoặc tải về máy tính an toàn qua xác thực JWT.
*   **Hỏi đáp Kiến thức cùng Trợ lý AI (`POST /api/ai-assistant/chat`, `AiAssistantChat.jsx`)**:
    *   Thí sinh trò chuyện trực tiếp với Trợ lý AI về các nội quy, quy trình kỹ thuật và nghiệp vụ chuyên môn.
    *   **Cô lập dữ liệu theo phòng ban**: Hệ thống chỉ trích xuất ngữ cảnh từ các tài liệu học tập (`StudyDocument`) mà thí sinh được phân quyền xem để nạp vào prompt cho AI trả lời.
    *   **Trực quan hóa Sơ đồ tư duy (Mindmap)**: Tự động render sơ đồ tư duy bằng thư viện [Mermaid.js](https://mermaid.js.org/) để hệ thống hóa kiến thức trực quan.
    *   **Giao tiếp Giọng nói 2 chiều**: Tích hợp Web Speech API cho phép thí sinh ra lệnh bằng giọng nói (Speech-to-Text) và nghe AI đọc câu trả lời (Text-to-Speech).
*   **Chế độ Luyện tập Cá nhân (Practice Sessions)**:
    *   Cho phép thí sinh luyện tập trước với ngân hàng câu hỏi có gắn nhãn `usage: 'practice'`.
    *   Lựa chọn chế độ `instant` (kiểm tra đúng/sai và xem giải thích ngay từng câu) hoặc chế độ `exam` (làm hết bài có bấm giờ rồi mới nộp và chấm điểm).
    *   Không giới hạn số lượt thi thử và không ảnh hưởng đến điểm số chính thức.

### 5.2. Luồng Làm bài thi Trắc nghiệm (Exam Execution Flow)
1.  **Kiểm tra trạng thái (`GET /api/exam-attempts/my-exam`)**:
    *   Hệ thống xác định kỳ thi đang `published`, lấy mã đề thi của thí sinh. Toàn bộ câu hỏi trả về **đều bị loại bỏ trường `isCorrect`**.
    *   Nếu đang có lượt `in_progress` chưa hết hạn: Trả về bài làm dở dang kèm `savedAnswers` để khôi phục giao diện.
2.  **Xác nhận phòng ban dự thi (Dành cho nhân sự Kiêm nhiệm)**:
    *   Nếu nhân viên có `extraDepartmentIds` và chưa có `roleConfirmedAt`, giao diện bật Modal yêu cầu chọn phòng ban dự thi trước khi bắt đầu.
3.  **Khởi tạo Lượt thi (`POST /api/exam-attempts/start`)**:
    *   Kiểm tra số lượt: `attemptsUsed < (MAX_OFFICIAL_ATTEMPTS + extraAttemptsGranted)`.
    *   Tạo bản ghi `ExamAttempt` mới (`status = 'in_progress'`, `startedAt = now`, `expiresAt = now + durationMinutes * 60000`, `departmentId = candidateDeptId` đóng băng vĩnh viễn phòng ban thi).
    *   **Sinh snapshot xáo trộn độc lập (`AttemptQuestion`)**: Xáo ngẫu nhiên thứ tự câu hỏi và thứ tự các đáp án bằng Fisher–Yates. Snapshot là duy nhất và cố định cho riêng lượt thi.
4.  **Lưu đáp án tức thì (Autosave - `PATCH /api/exam-attempts/:id/answer`)**:
    *   Mỗi khi thí sinh chọn đáp án, client gọi API lưu ngay vào `CandidateAnswer`, bảo vệ bài làm trước sự cố mất điện hay sập nguồn.
5.  **Duy trì nhịp tim kết nối (Heartbeat - `POST /api/exam-attempts/:id/heartbeat`)**:
    *   Client gửi heartbeat định kỳ **15 giây/lần** khi tab hiển thị để cập nhật `lastActiveAt`.
6.  **3 Tầng Giám sát Chống gian lận & Bỏ thi**:
    *   *Tầng 1 (Client Warning - 10 giây)*: Chuyển tab hoặc blur trình duyệt -> Bật modal cảnh báo đếm ngược 10 giây. Không quay lại kịp -> Client tự nộp bài.
    *   *Tầng 2 (Server Request Guard - 60 giây)*: Tại mọi API gọi lên, nếu `now - lastActiveAt > 60s`, server cưỡng chế đóng bài thi với `autoSubmitReason: 'inactive_timeout'`.
    *   *Tầng 3 (Background Cron Guard - 1 phút)*: Scheduler `abandoned-attempt.scheduler.js` quét nền mỗi phút, tự động nộp bài và chấm điểm các bài thi bị treo máy ngắt mạng.
7.  **Nộp bài & Chấm điểm Server-side (`POST /api/exam-attempts/:id/submit`)**:
    *   Chấm điểm đối soát trực tiếp giữa `CandidateAnswer` và `Answer.isCorrect` trong DB.
    *   Câu 1 đáp án (`single`): Chọn đúng duy nhất 1 đáp án đúng -> Có điểm.
    *   Câu nhiều đáp án (`multiple`): Phải chọn đúng và đủ tất cả đáp án đúng, không chọn thừa đáp án sai -> Có điểm.
    *   Tính điểm thang 100 và đánh giá Đạt/Không đạt dựa trên `passThresholdPercent`. Lưu kết quả vào `Result`.

### 5.3. Xem Lịch sử Kết quả & Báo cáo Cá nhân
*   **Tra cứu lịch sử kết quả (`GET /api/reports/my-results`)**:
    *   Thí sinh xem lại toàn bộ lịch sử các lần thi, điểm số, trạng thái Đạt/Không đạt.
    *   Xem biểu đồ biến thiên điểm số qua các kỳ thi (`Recharts`).
    *   Xem chi tiết bài làm: Hiển thị lại các câu hỏi đã trả lời sai để rút kinh nghiệm nghiệp vụ.

---

## 6. BẢNG MÃ LỖI VÀ XỬ LÝ NGOẠI LỆ THEO TỪNG ROLE

| Vai trò | Mã lỗi / Tình huống ngoại lệ | Nguyên nhân kỹ thuật | Hành vi xử lý của hệ thống |
| :--- | :--- | :--- | :--- |
| **Chung** | `AUTH_ACCESS_REVOKED` | Tài khoản vừa đăng nhập trên thiết bị/trình duyệt khác (`tokenVersion` bị tăng). | Thu hồi phiên hiện tại, hiển thị `SessionRevokedModal` chặn thao tác và yêu cầu đăng nhập lại. |
| **Chung** | `PASSWORD_CHANGE_REQUIRED` | Tài khoản đang có cờ `mustChangePassword: true`. | Chặn toàn bộ route nghiệp vụ, tự động mở `ChangePasswordModal` bắt buộc đổi mật khẩu mới. |
| **Chung** | `ACCOUNT_LOCKED` | Đăng nhập sai mật khẩu quá 5 lần liên tiếp. | Tự động khóa tài khoản tạm thời trong 15 phút (`lockUntil = now + 15m`). |
| **Admin** | `IMPORT_VALIDATION_ERROR` | File Excel import nhân sự không đúng định dạng cột hoặc dữ liệu ngày sinh/mã NV lỗi. | Trả danh sách lỗi chi tiết từng dòng ở bước Preview, không ghi DB rác. |
| **Admin** | `BACKUP_RESTORE_INVALID_CONFIRM` | Khôi phục dữ liệu nhưng không gửi `confirm: "RESTORE"`. | Chặn request khôi phục để tránh thao tác xóa DB ngoài ý muốn. |
| **Examiner** | `EXAM_TOTAL_QUESTIONS_MISMATCH` | `commonQuestionCount + departmentQuestionCount !== totalQuestions`. | Model validation ném lỗi 400 ngay khi tạo/sửa đề xuất kỳ thi. |
| **Examiner** | `STUDY_DOC_SCOPE_INVALID` | Đặt tài liệu scope `DepartmentSpecific` nhưng không chỉ định `departmentId`. | Chặn lưu tài liệu, báo lỗi thiếu trường phòng ban bắt buộc. |
| **Examiner** | `QUESTION_USAGE_LOCKED` | Cố gắng sửa mục đích `usage` hoặc xóa câu hỏi thuộc chủ đề đang mở thi `published`. | Chặn thao tác để bảo vệ tính toàn vẹn đề thi đang diễn ra. |
| **Leader** | `NOT_ENOUGH_QUESTIONS` | Ngân hàng câu hỏi của một số phòng ban không đủ số lượng câu hỏi dù đã áp dụng bù đắp. | Chặn phát hành kỳ thi, trả về danh sách chi tiết các phòng ban đang bị thiếu câu hỏi. |
| **Leader** | `PUBLISH_IN_PROGRESS` | Có một tiến trình publish khác đang chạy cho cùng kỳ thi (`publishLockedAt < 5m`). | Chặn click đúp hoặc race condition giữa 2 cán bộ duyệt đề. |
| **Leader** | `ACTIVE_EXAM_EXISTS` | Đang có kỳ thi khác ở trạng thái `published` nhưng Leader chưa xác nhận ghi đè (`force`). | Cảnh báo tác động để Leader quyết định có force override hay không. |
| **Candidate**| `ATTEMPTS_EXHAUSTED` | Thí sinh đã sử dụng hết số lượt thi cho phép (`attemptsUsed >= MAX + extra`). | Chặn bắt đầu lượt mới, hiển thị màn hình thông báo đã hoàn thành bài thi. |
| **Candidate**| `ROLE_NOT_CONFIRMED` | Nhân sự kiêm nhiệm chưa xác nhận phòng ban dự thi trước khi vào phòng thi. | Yêu cầu chọn phòng ban dự thi qua Modal xác nhận. |
| **Candidate**| `EXAM_ATTEMPT_TIMEOUT` | Thí sinh ngắt kết nối/rời phòng thi quá 60 giây không gửi heartbeat. | Tự động đóng bài thi, chuyển trạng thái `submitted` với lý do `inactive_timeout` và chấm điểm. |
 định cho riêng lượt thi đó — khi thí sinh reload trang hoặc đổi máy, thứ tự câu hỏi và đáp án không bị đổi lại.
3.  **Lưu đáp án tức thì (Autosave - `PATCH /api/exam-attempts/:id/answer`)**:
    *   Mỗi khi thí sinh chọn/bỏ chọn một phương án, client gọi API lưu ngay lập tức vào bảng `CandidateAnswer`.
    *   Bảo vệ bài làm tuyệt đối trước các sự cố sập nguồn, mất điện, đóng trình duyệt đột ngột.
    *   Cập nhật mốc `lastActiveAt = new Date()`. Chưa tính điểm ở bước này.
4.  **Duy trì nhịp tim kết nối (Heartbeat - `POST /api/exam-attempts/:id/heartbeat`)**:
    *   Khi tab làm bài đang mở và hiển thị (`document.visibilityState === 'visible'`), client tự động gửi heartbeat định kỳ **15 giây/lần** lên server để cập nhật `lastActiveAt`.
5.  **Cơ chế 2 Tầng Chống gian lận & Bỏ thi**:
    *   *Tầng 1 (Client Warning - 10 giây)*: Khi thí sinh chuyển tab, mở cửa sổ khác hoặc blur trình duyệt, giao diện bật Modal cảnh báo đếm ngược 10 giây. Nếu không quay lại trong 10 giây, client tự động kích hoạt nộp bài.
    *   *Tầng 2 (Server Defense - 60 giây / `INACTIVITY_TIMEOUT_MS`)*: Nếu thí sinh tắt máy hoặc ngắt mạng quá 60 giây không có tín hiệu heartbeat/autosave, Server tự động đóng lượt thi, chuyển sang `submitted` với lý do `inactive_timeout` và chấm điểm dựa trên các câu đã autosave.
6.  **Nộp bài & Chấm điểm Server-side (`POST /api/exam-attempts/:id/submit`)**:
    *   Chấm điểm đối soát trực tiếp giữa `CandidateAnswer` và `Answer.isCorrect` trong DB.
    *   *Câu 1 đáp án (`single`)*: Chọn đúng duy nhất 1 phương án đúng -> Được điểm.
    *   *Câu nhiều đáp án (`multiple`)*: Phải chọn đúng và đủ tất cả các phương án đúng, không chọn thừa phương án sai -> Được điểm.
    *   Tính điểm thang 100: $\text{Điểm} = \text{round}\left(\frac{\text{Số câu đúng}}{\text{Tổng số câu}} \times 100\right)$.
    *   Đánh giá Đạt/Không đạt: $\text{Điểm} \ge \text{passThresholdPercent}$.
    *   Lưu kết quả vào `Result`, cập nhật `ExamAttempt` thành `submitted`. Đảm bảo tính Idempotent (không bị chấm điểm 2 lần nếu bấm đúp).

### 5.3. Xem Lịch sử Kết quả & Báo cáo Cá nhân
*   **Tra cứu lịch sử kết quả (`GET /api/reports/my-results`)**:
    *   Thí sinh xem lại toàn bộ lịch sử các lần thi của bản thân.
    *   Hiển thị điểm số, số câu đúng/sai, thời gian làm bài, trạng thái Đạt/Không đạt.
    *   Xem biểu đồ trực quan biến thiên điểm số qua các kỳ thi (`Recharts`).
    *   Xem chi tiết bài làm: Hiển thị lại các câu hỏi đã trả lời sai để rút kinh nghiệm chuyên môn.

---

## 6. SƠ ĐỒ PHỐI HỢP LIÊN VAI TRÒ (INTER-ROLE WORKFLOW)

Sơ đồ thể hiện luồng tương tác nghiệp vụ khép kín giữa 4 vai trò trong một chu kỳ thi:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin (Quản trị viên)
    actor Examiner as Examiner (Người ra đề)
    actor Leader as Leader (Người duyệt đề)
    actor Candidate as Candidate (Thí sinh)
    participant System as Hệ thống Z176 (Server/DB)

    Note over Admin,System: Giai đoạn 1: Chuẩn bị dữ liệu nhân sự & ngân hàng đề
    Admin->>System: Import DS nhân viên Excel / Tạo User (Cấp pass tạm)
    Admin->>System: Phân quyền vai trò (Admin, Examiner, Leader, Candidate)
    Examiner->>System: Tạo Chủ đề, Phòng ban, Import Ngân hàng câu hỏi
    Examiner->>System: Upload Tài liệu ôn tập lên Disk Server

    Note over Examiner,Leader: Giai đoạn 2: Soạn thảo & Thẩm định đề xuất kỳ thi
    Examiner->>System: Tạo Đề xuất kỳ thi (Cấu hình số câu Chung/Riêng, Thời gian)
    Examiner->>System: Đệ trình duyệt đề xuất (status: draft -> pending_review)
    System-->>Leader: Gửi In-app Notification (Có đề xuất mới chờ duyệt)
    
    alt Leader từ chối đề xuất
        Leader->>System: Từ chối (rejectionReason) -> status: rejected
        System-->>Examiner: Gửi Notification (Đề xuất bị từ chối kèm lý do)
        Examiner->>System: Chỉnh sửa đề xuất & Đệ trình lại
    else Leader phê duyệt đề xuất
        Leader->>System: Phê duyệt (Cấu hình startDate, endDate) -> status: approved
        System-->>Examiner: Gửi Notification (Đề xuất đã được duyệt)
    end

    Note over Leader,Candidate: Giai đoạn 3: Phát hành kỳ thi & Sinh đề tự động
    Leader->>System: Bấm "Đăng chính thức" (POST /exams/:id/publish)
    activate System
    System->>System: Kiểm tra ngân hàng câu hỏi các phòng ban (Smart Fallback)
    System->>System: Fisher-Yates xáo đề -> Sinh ExamCode cho từng phòng ban
    System->>System: Gán toàn bộ Candidate vào ExamCode tương ứng (ExamCandidate)
    System->>System: Chuyển trạng thái Exam -> published
    deactivate System
    System-->>Candidate: Broadcast Notification (Kỳ thi chính thức đã mở)

    Note over Candidate,System: Giai đoạn 4: Ôn tập & Thực hiện thi trắc nghiệm
    Candidate->>System: Xem/Tải tài liệu ôn tập theo phòng ban
    Candidate->>System: Bắt đầu làm bài (POST /start) -> Sinh snapshot AttemptQuestion xáo riêng
    loop Trong lúc làm bài
        Candidate->>System: Tích chọn đáp án -> Autosave (PATCH /answer)
        Candidate->>System: Heartbeat định kỳ 15s (POST /heartbeat)
    end

    alt Thí sinh nộp bài chủ động / Hết giờ
        Candidate->>System: Nộp bài (POST /submit)
    else Thí sinh ngắt mạng / Rời phòng thi > 60s
        System->>System: Tự động nộp bài (autoSubmitReason: inactive_timeout)
    end
    System->>System: Chấm điểm Server-side -> Tạo Result (Điểm, Đạt/Không đạt)
    System-->>Candidate: Hiển thị bảng điểm và danh sách câu sai

    Note over Leader,Admin: Giai đoạn 5: Xử lý sự cố, Báo cáo & Lưu trữ
    opt Thí sinh gặp sự cố bất khả kháng
        Leader->>System: Cấp thêm lượt thi (POST /grant-attempt) -> extraAttemptsGranted + 1
        Candidate->>System: Thi lại lượt mới với đề xáo mới
    end
    Leader->>System: Xem Báo cáo Dashboard & Xuất file Excel tổng hợp
    Admin->>System: Giám sát Audit Logs / Sao lưu DB lên Google Drive
    Leader->>System: Lưu trữ kỳ thi kết thúc (POST /archive) -> status: archived
```

---

## 7. BẢNG MÃ LỖI VÀ XỬ LÝ NGOẠI LỆ THEO TỪNG ROLE

| Vai trò | Mã lỗi / Tình huống ngoại lệ | Nguyên nhân kỹ thuật | Hành vi xử lý của hệ thống |
| :--- | :--- | :--- | :--- |
| **Chung** | `AUTH_ACCESS_REVOKED` | Tài khoản vừa đăng nhập trên thiết bị/trình duyệt khác (`tokenVersion` bị tăng). | Thu hồi phiên hiện tại, hiển thị `SessionRevokedModal` chặn thao tác và yêu cầu đăng nhập lại. |
| **Chung** | `PASSWORD_CHANGE_REQUIRED` | Tài khoản đang có cờ `mustChangePassword: true`. | Chặn toàn bộ route nghiệp vụ, tự động mở `ChangePasswordModal` bắt buộc đổi mật khẩu mới. |
| **Chung** | `ACCOUNT_LOCKED` | Đăng nhập sai mật khẩu quá 5 lần liên tiếp. | Tự động khóa tài khoản tạm thời trong 15 phút (`lockUntil = now + 15m`). |
| **Admin** | `IMPORT_VALIDATION_ERROR` | File Excel import nhân sự không đúng định dạng cột hoặc dữ liệu ngày sinh/mã NV lỗi. | Trả danh sách lỗi chi tiết từng dòng ở bước Preview, không ghi DB rác. |
| **Admin** | `BACKUP_RESTORE_INVALID_CONFIRM` | Khôi phục dữ liệu nhưng không gửi `confirm: "RESTORE"`. | Chặn request khôi phục để tránh thao tác xóa DB ngoài ý muốn. |
| **Examiner** | `EXAM_TOTAL_QUESTIONS_MISMATCH` | `commonQuestionCount + departmentQuestionCount !== totalQuestions`. | Model validation ném lỗi 400 ngay khi tạo/sửa đề xuất kỳ thi. |
| **Examiner** | `STUDY_DOC_SCOPE_INVALID` | Đặt tài liệu scope `DepartmentSpecific` nhưng không chỉ định `departmentId`. | Chặn lưu tài liệu, báo lỗi thiếu trường phòng ban bắt buộc. |
| **Leader** | `NOT_ENOUGH_QUESTIONS` | Ngân hàng câu hỏi của một số phòng ban không đủ số lượng câu hỏi dù đã áp dụng bù đắp. | Chặn phát hành kỳ thi, trả về danh sách chi tiết các phòng ban đang bị thiếu câu hỏi. |
| **Leader** | `NO_CANDIDATES_AVAILABLE` | Toàn hệ thống không có nhân viên nào đang ở trạng thái `isActive: true`. | Chặn phát hành và thông báo không có thí sinh khả dụng. |
| **Candidate**| `ATTEMPTS_EXHAUSTED` | Thí sinh đã sử dụng hết số lượt thi cho phép (`attemptsUsed >= MAX + extra`). | Chặn bắt đầu lượt mới, hiển thị màn hình thông báo đã hoàn thành bài thi. |
| **Candidate**| `CANDIDATE_NOT_ASSIGNED` | Thí sinh không có tên trong danh sách được gán mã đề của kỳ thi đang mở. | Hiển thị thông báo thí sinh không thuộc đối tượng tham gia kỳ thi này. |
| **Candidate**| `EXAM_ATTEMPT_TIMEOUT` | Thí sinh ngắt kết nối/rời phòng thi quá 60 giây không gửi heartbeat. | Tự động đóng bài thi, chuyển trạng thái `submitted` với lý do `inactive_timeout` và chấm điểm. |
