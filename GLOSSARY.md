# GLOSSARY.md — Thuật ngữ dùng thống nhất trong dự án
## Hệ Thống Thi Trắc Nghiệm Chuyên Môn Nội Bộ — Nhà Máy Z176
**Người thực hiện:** Phạm Ngọc Dương — VNUA | **Dự án:** Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176

**Mục đích:** Định nghĩa và chuẩn hóa **một tên gọi duy nhất** cho mỗi khái niệm nghiệp vụ, model cơ sở dữ liệu, vai trò người dùng và thuật ngữ kỹ thuật trong toàn bộ dự án. Mọi thành viên và AI coding assistant phải tuân thủ nghiêm ngặt các thuật ngữ này khi đặt tên model, controller, service, component, routes, state hay viết tài liệu kỹ thuật để đảm bảo tính nhất quán.

---

## 1. Thuật ngữ nghiệp vụ & Model cơ sở dữ liệu (Domain & DB Models)

| Thuật ngữ tiếng Việt | Tên gọi chuẩn trong code / Model | Định nghĩa | Ghi chú |
|---|---|---|---|
| Ngân hàng câu hỏi | `Question` / `QuestionBank` | Tập hợp toàn bộ câu hỏi trắc nghiệm chuyên môn, được phân loại theo chủ đề, độ khó, phạm vi và dạng câu trả lời. | Quản lý tại `QuestionBankTab.jsx`, API `/api/questions`. |
| Câu hỏi | `Question` | Đơn vị câu hỏi trắc nghiệm. Gồm nội dung, ảnh minh họa (Cloudinary), độ khó (`easy`/`medium`/`hard`), phạm vi (`Common`/`DepartmentSpecific`), loại câu (`theory`/`practice`), kiểu đáp án (`single`/`multiple`). | Đáp án liên kết qua collection `Answer`. |
| Đáp án câu hỏi | `Answer` | Danh sách đáp án của một câu hỏi, gồm nội dung text và cờ `isCorrect`. | **Tuyệt đối không** trả về `isCorrect` cho thí sinh khi lấy đề thi. |
| Chủ đề thi | `Topic` | Nhóm/chuyên đề kiến thức chuyên môn (ví dụ: An toàn lao động, Quy trình kỹ thuật...). | Quản lý tại `TopicTab.jsx`, API `/api/topics`. |
| Phòng ban / Phân xưởng | `Department` | Đơn vị/phòng ban/phân xưởng trong nhà máy (ví dụ: XDM1, P.Kế hoạch, P.Kỹ thuật...). | Quản lý tại `DepartmentTab.jsx`, API `/api/departments`. |
| Nhân viên | `Employee` | Hồ sơ nhân sự: họ tên, mã nhân viên, phòng ban liên kết (`departmentId`), chức vụ, liên kết tài khoản (`userId`). | Dùng để phân quyền đề thi theo phòng ban và xuất báo cáo. |
| Kỳ thi / Đề xuất kỳ thi | `Exam` | Kỳ thi chuyên môn. Chứa cấu hình đề thi (số câu theo độ khó, thời lượng, điểm đạt, số lượt thi tối đa) và trạng thái vòng đời (`draft` → `pending_review` → `approved` → `published` → `archived`). | Không dùng `Test` hay `Quiz`. |
| Mã đề thi | `ExamCode` | Bộ đề cụ thể được hệ thống xáo trộn ngẫu nhiên thứ tự câu hỏi và đáp án từ ngân hàng câu hỏi khi kỳ thi được duyệt phát hành (`published`). | Một `Exam` có nhiều `ExamCode` (đảo câu hỏi/đáp án). |
| Câu hỏi trong mã đề | `ExamCodeQuestion` | Bảng liên kết câu hỏi và thứ tự hiển thị trong một mã đề thi cụ thể. | |
| Thí sinh trong kỳ thi | `ExamCandidate` | Danh sách thí sinh được phân bổ vào kỳ thi, gắn với một mã đề thi (`ExamCode`), theo dõi số lượt thi đã sử dụng và giới hạn lượt thi. | Cho phép Leader cấp thêm lượt thi chính thức khi cần. |
| Lượt thi / Ca làm bài | `ExamAttempt` | Một lượt làm bài cụ thể của thí sinh (loại `practice` hoặc `official`), lưu trạng thái (`in_progress`, `submitted`, `expired`), mốc thời gian bắt đầu/kết thúc, và `lastHeartbeat`. | Thay thế cho thuật ngữ cũ `ExamSession`. |
| Câu hỏi trong lượt thi (Autosave) | `AttemptQuestion` | Lưu tạm các đáp án thí sinh đã chọn trong quá trình làm bài phục vụ autosave và khôi phục khi reload/resume. | Tự động lưu mỗi khi thí sinh chọn đáp án. |
| Đáp án thí sinh đã nộp | `CandidateAnswer` | Chi tiết toàn bộ đáp án thí sinh đã chọn sau khi chính thức nộp bài, phục vụ chấm điểm và tra cứu. | |
| Kết quả thi | `Result` | Điểm số cuối cùng, trạng thái đạt/không đạt (`passed`/`failed`), số câu đúng, liên kết với `ExamAttempt`. | Lưu trữ phục vụ báo cáo và tra cứu kết quả. |
| Tài liệu ôn tập | `StudyDocument` | Tài liệu dạng file (PDF, Word, Excel...) được lưu trữ an toàn trên đĩa server nội bộ, phân theo chủ đề và phạm vi phòng ban cho thí sinh ôn luyện. | Quản lý tại `StudyDocumentTab.jsx`, API `/api/study-documents`. |
| Cấu hình Trợ lý AI | `AiSetting` | Bản ghi cấu hình singleton lưu Base URL, API Key, Model LLM, System Prompt và hạn mức ký tự tài liệu cho Trợ lý AI. | Quản lý tại `AiSettingsTab.jsx`, API `/api/ai-assistant/settings`. |
| Trợ lý AI / Chatbox | `AiAssistantChat` | Khung chat hỏi đáp AI theo tài liệu ôn tập của phòng ban thí sinh hoặc phân tích báo cáo cho Leader; hỗ trợ sinh biểu đồ/sơ đồ Mermaid, nhập giọng nói và phát âm Text-to-Speech. | Tích hợp tại Dashboard Thí sinh và Leader, API `/api/ai-assistant/chat`. |
| Nhật ký hệ thống / Audit log | `AuditLog` | Bản ghi vết toàn bộ hành động nhạy cảm: tạo/sửa/xóa tài khoản, khóa/mở, reset mật khẩu, sao lưu/khôi phục, duyệt đề thi, chấm điểm, gỡ tài liệu... | Chuẩn hóa ghi tập trung tại tầng Controller. Xem `AuditLogTab.jsx`. |

---

## 2. Vai trò người dùng (Roles)

Hệ thống có **4 vai trò** phân quyền rõ ràng:

| Tên vai trò (Tiếng Việt) | Mã chuẩn trong code (`role.code`) | Quyền hạn chính |
|---|---|---|
| **Quản trị viên** | `admin` | Toàn quyền quản trị tài khoản (CRUD, import/export Excel, phân quyền, khóa/mở, reset mật khẩu), xem nhật ký hệ thống (`AuditLog`), quản lý sao lưu & khôi phục CSDL (`BackupTab`), cấu hình tích hợp Trợ lý AI (`AiSettingsTab`). |
| **Người ra đề** | `examiner` | Quản lý ngân hàng câu hỏi (CRUD, import Excel/Word, upload ảnh), phân tích câu hỏi (`QuestionAnalysisTab`), tạo câu hỏi tự động bằng AI (`QuestionGeneratorTab`), quản lý chủ đề, quản lý phòng ban, quản lý tài liệu ôn tập, tạo và đệ trình đề xuất kỳ thi (`ExamProposalTab`). |
| **Người duyệt đề / Lãnh đạo** | `leader` | Xem và phê duyệt/từ chối/phát hành/lưu trữ các đề xuất kỳ thi (`ExamReviewTab`), xem báo cáo thống kê toàn diện, theo dõi dấu hiệu bất thường (`AnomalyTab`) & năng lực phòng ban (`CompetencyTab`), hỏi đáp số liệu với Trợ lý báo cáo AI, xuất file Excel kết quả, cấp thêm lượt thi cho thí sinh. |
| **Thí sinh** | `candidate` | Xem kỳ thi được phân bổ, tra cứu/tải tài liệu ôn tập theo phòng ban, hỏi đáp học tập với Trợ lý AI kèm sơ đồ tư duy/biểu đồ Mermaid, luyện tập tự do & tích lũy thành tích, thực hiện bài thi (làm bài, autosave, heartbeat, nộp bài), xem lịch sử kết quả thi cá nhân. |

> ⚠️ Không dùng các từ chung chung như `user`, `teacher`, `student` trong mã nguồn.

---

## 3. Thuật ngữ kỹ thuật & Cơ chế hệ thống

| Thuật ngữ | Tên chuẩn trong code | Phân biệt & Cơ chế hoạt động |
|---|---|---|
| **Access Token** | `accessToken` | JWT ngắn hạn (15 phút), lưu ở Client (`token-store.js` / localStorage), gửi qua Header `Authorization: Bearer <token>`. |
| **Refresh Token** | `refreshToken` | JWT dài hạn (7 ngày), lưu trong `httpOnly cookie` an toàn, dùng để cấp lại Access Token mới tự động khi hết hạn (Silent Refresh). |
| **Phiên bản Token** | `tokenVersion` | Số nguyên trên model `User`. Tăng lên khi đăng nhập mới, đổi mật khẩu hoặc reset mật khẩu để lập tức vô hiệu hóa (thu hồi) toàn bộ token cũ ở các thiết bị/trình duyệt khác. |
| **Giữ nhịp phiên thi** | `sendExamHeartbeat()` | Cơ chế ping định kỳ (15s/lần) từ client lên server khi thí sinh đang làm bài thi. Nếu thí sinh thoát khỏi bài thi quá 1 phút, hệ thống tự động thu bài (`autoSubmitted`). |
| **Tự động lưu bài** | `answerExamQuestion()` / `autosave` | Gửi đáp án đã chọn lên server ngay lập tức khi thí sinh bấm chọn, lưu vào `AttemptQuestion` mà không cần chờ đến lúc nộp bài. |
| **Trộn đề ngẫu nhiên** | `exam-code-generation.service.js` | Sinh các mã đề xáo trộn thứ tự câu hỏi và thứ tự đáp án từ ngân hàng câu hỏi bằng thuật toán an toàn khi phát hành đề thi. |
| **Sao lưu & Khôi phục** | `backup.service.js` | Dump cơ sở dữ liệu MongoDB ra file nén `.gz`, đồng bộ lên Google Drive (OAuth2 cá nhân) tự động xoay vòng (tối đa 5 bản), khôi phục trực tiếp với theo dõi tiến trình upload (`XMLHttpRequest.onprogress`). |
| **Trợ lý AI & Soạn đề tự động** | `ai-assistant.service.js` | Kết nối LLM (Gemini / OpenAI API tương thích), đọc tài liệu (.docx, .pdf, .xlsx), hỏi đáp bám sát nội dung phòng ban và sinh file đề thi Word/Excel chuẩn hóa phục vụ kiểm duyệt. |

---

## 4. Quy tắc áp dụng thuật ngữ

1. **Khi viết Code & Model:** Phải dùng đúng các tên Model và thuộc tính đã nêu ở Mục 1 & 2 (ví dụ: dùng `ExamAttempt` thay cho `ExamSession`, `examCandidateId` thay cho `candidateSessionId`).
2. **Khi thiết kế API:** Đường dẫn RESTful phải thống nhất: `/api/exams`, `/api/exam-attempts`, `/api/questions`, `/api/topics`, `/api/departments`, `/api/study-documents`, `/api/audit-logs`, `/api/backups`, `/api/analytics`, `/api/ai-assistant`.
3. **Khi trao đổi & Viết tài liệu:** Giữ đúng danh xưng 4 vai trò (Quản trị viên, Người ra đề, Người duyệt đề/Lãnh đạo, Thí sinh) và cấu trúc trạng thái của hệ thống.
