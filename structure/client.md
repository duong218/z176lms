# Cấu trúc client

## Phạm vi

`client/` là ứng dụng Single Page Application (SPA) xây dựng bằng React 19, Vite và Tailwind CSS v4. Sử dụng Lenis cho smooth scroll, Lucide React cho hệ thống icon, Motion cho animation vi tương tác, Recharts cho biểu đồ thống kê báo cáo.

```text
client/
├── .gitignore                              # Loại trừ node_modules, dist, .env khỏi git
├── eslint.config.js                        # Cấu hình ESLint cho React/JSX (hook rules, refresh plugin)
├── index.html                              # Entry HTML, mount #root, favicon dùng logo.svg, viewport responsive
├── metadata.json                           # Metadata dự án (tên hệ thống Z176, mô tả, capabilities)
├── package.json                            # Dependencies & scripts (dev, build, lint, preview)
├── package-lock.json                       # Lockfile npm
├── vite.config.js                          # Cấu hình Vite: @vitejs/plugin-react, @tailwindcss/vite, alias @ -> /src
├── public/
│   ├── images/
│   │   ├── HeroSection.jpg                 # Ảnh nền hero section trang chủ
│   │   └── login-cover.jpg                 # Ảnh nền trang đăng nhập
│   ├── logo/
│   │   └── logo.svg                        # Logo doanh nghiệp mặc định / favicon
│   └── templates/
│       ├── Mau_Import_Cau_Hoi_Z176.xlsx    # Mẫu Excel chuẩn import câu hỏi ngân hàng đề
│       └── Mau_Import_Nhan_Vien_Z176.xlsx  # Mẫu Excel chuẩn import danh sách nhân viên
├── src/
│   ├── App.jsx                             # Component gốc: AppShell (ToastProvider + ConfirmProvider) → App (Auth, Routing, Polling active exam/session, khởi tạo Lenis smooth scroll)
│   ├── data.js                             # Dữ liệu tĩnh Z176: thông tin doanh nghiệp, quy chế thi, hướng dẫn thi, dữ liệu mẫu
│   ├── index.css                           # CSS gốc, import Tailwind CSS v4 (@theme tokens, custom scrollbar, animations)
│   ├── main.jsx                            # Entry point React: render AppShell bọc trong StrictMode + ErrorBoundary
│   ├── assets/
│   │   └── images/
│   │       └── military_banner_bg_*.jpg    # Ảnh nền banner phong cách quân đội Z176
│   ├── hooks/
│   │   └── useScrollLock.js                # Hook khóa cuộn: gọi lenis.stop() + body overflow hidden khi modal/drawer mở, tự phục hồi khi đóng
│   ├── lib/
│   │   ├── examPhase.js                    # Tiện ích trạng thái kỳ thi: getExamPhase (upcoming/ongoing/ended), getCountdownTarget, splitDuration
│   │   ├── lenis-instance.js               # Singleton module-level lưu trữ instance Lenis active (setLenisInstance / getLenisInstance)
│   │   ├── mdTable.js                      # Tiện ích bóc tách và định dạng bảng markdown cho khung hiển thị chatbox
│   │   └── speech.js                       # Tiện ích phân đoạn và phát âm thanh hỗ trợ đọc câu trả lời Text-to-Speech (TTS)
│   ├── components/
│   │   ├── Banner.jsx                      # Banner hiển thị tên đơn vị, tiêu đề cuộc thi, badge doanh nghiệp
│   │   ├── CompetencyBars.jsx              # Danh sách thanh ngang năng lực theo chủ đề (dễ đọc trên mobile, phân loại tốt/trung bình/cần ôn) + CompetencyView (responsive: desktop hiện radar + thanh, mobile hiện thanh)
│   │   ├── CompetencyRadar.jsx             # Biểu đồ radar Recharts thể hiện tỷ lệ đúng theo các chủ đề (chỉ render khi có từ 3 chủ đề trở lên)
│   │   ├── ChangePasswordModal.jsx         # Modal đổi mật khẩu bắt buộc lần đầu đăng nhập (mustChangePassword), useScrollLock
│   │   ├── ConfirmDialog.jsx               # Dialog xác nhận bất đồng bộ thay thế window.confirm(), hook useConfirm(), useScrollLock
│   │   ├── ContactSection.jsx              # Section thông tin liên hệ kỹ thuật + thông tin công ty Z176
│   │   ├── CTAButton.jsx                   # Nút gọi hành động chính trên trang chủ (Vào thi, Tra cứu kết quả)
│   │   ├── DashboardShell.jsx              # Khung điều hướng dùng chung cho dashboard Admin, Leader và Examiner: thanh chức năng DỌC bên trái từ lg (sticky, thu gọn được, nhớ lựa chọn trong localStorage), thanh tab ngang từ md đến dưới lg, dưới md dùng menu 3 gạch ở Header
│   │   ├── ErrorBoundary.jsx               # Bọc bắt lỗi render component React, hiển thị fallback UI an toàn
│   │   ├── ExamModal.jsx                   # Modal phòng thi toàn màn hình: cơ chế khóa đơn tab (chống mở thi đồng thời 2 tab cùng trình duyệt), chống click kép vào thi, chọn vai trò/phòng ban thi (nếu kiêm nhiệm), câu hỏi, đếm giờ, autosave, heartbeat 15s, tự nộp khi vắng mặt >1 phút, cảnh báo rời thi, useScrollLock
│   │   ├── FirstTimeGuideModal.jsx         # Modal hướng dẫn sử dụng toàn diện lần đầu đăng nhập cho từng vai trò người dùng (Admin, Examiner, Leader, Candidate), useScrollLock
│   │   ├── Footer.jsx                      # Footer trang chủ: thông tin bản quyền, liên hệ, chính sách
│   │   ├── Header.jsx                      # Header navigation: logo tùy chỉnh, menu điều hướng, user info, đăng xuất, NotificationBell, mobile drawer, useScrollLock(drawerOpen)
│   │   ├── LoginModal.jsx                  # Modal đăng nhập: form username/password, validation, gọi auth service, useScrollLock
│   │   ├── LogoSelectorModal.jsx           # Modal tùy chỉnh/chọn logo đơn vị hiển thị (dành cho Admin), useScrollLock
│   │   ├── NotificationBell.jsx            # Chuông thông báo: badge đếm chưa đọc (poll 30s), dropdown phân loại sự kiện, đọc tất cả, điều hướng theo role
│   │   ├── Pagination.jsx                  # Component phân trang chuẩn hóa (nút Trước/Sau, hiển thị trang hiện tại / tổng trang, min-touch-target 48px)
│   │   ├── QuickGuideSection.jsx           # Section hướng dẫn 4 bước thi trắc nghiệm trên trang chủ
│   │   ├── RegulationsSection.jsx          # Section quy chế thi trắc nghiệm chuyên môn Z176
│   │   ├── ResultsLookupSection.jsx        # Section tra cứu kết quả thi công khai theo Mã nhân viên / Phòng ban
│   │   ├── Select.jsx                      # Dropdown select tùy biến giao diện đồng bộ, hỗ trợ tìm kiếm và bàn phím
│   │   ├── SessionRevokedModal.jsx         # Modal chặn thao tác khi phiên đăng nhập bị thu hồi (đăng nhập từ nơi khác), useScrollLock
│   │   ├── TimeAndCountdown.jsx            # Hiển thị đồng hồ thời gian thực và đếm ngược kỳ thi active
│   │   ├── Toast.jsx                       # Toast notification thông báo kết quả thao tác (success/error/info/warning)
│   │   ├── ToastContext.jsx                # React Context + Provider quản lý hàng đợi Toast toàn app, hook useToast()
│   │   ├── UnitLogoDisplay.jsx             # Component hiển thị logo đơn vị (ưu tiên logo custom từ localStorage, fallback logo.svg)
│   │   └── UserInfoCard.jsx                # Thẻ hiển thị thông tin người dùng đang đăng nhập (họ tên, vai trò, đơn vị)
│   │
│   ├── components/admin/
│   │   ├── AccountTab.jsx                  # Tab quản lý tài khoản: CRUD user, tạo inline phòng ban, import Excel 2 bước (xử lý phòng ban kiêm nhiệm & tự tạo phòng thiếu kèm mã), sửa phòng ban chính/kiêm nhiệm (updateEmployeeDepartments), xuất Excel credentials, phân role, khóa/mở, reset password, useScrollLock
│   │   ├── AiSettingsTab.jsx               # Tab cấu hình Trợ lý AI: Admin cài đặt URL/API Key/Model/System Prompt/Giới hạn context cho LLM (chuẩn tương thích OpenAI / Gemini), bật/tắt toàn hệ thống
│   │   ├── AuditLogTab.jsx                 # Tab nhật ký hệ thống: phân trang, lọc theo action/user/resource/thời gian, tìm kiếm nhân viên, chi tiết metadata
│   │   ├── BackupTab.jsx                   # Tab sao lưu & phục hồi: danh sách backup Drive, tạo backup (hỗ trợ mã hóa AES-256-GCM .gz.enc), restore file .gz / .gz.enc với progress % và phrase xác nhận 'XOA DU LIEU HIEN TAI'
│   │   └── OverviewTab.jsx                 # Tab tổng quan admin: thống kê tài khoản theo role, kỳ thi active, số lượng câu hỏi
│   │
│   ├── components/candidate/
│   │   ├── AiAssistantChat.jsx             # Hộp thoại chat Trợ lý AI học tập: hỏi đáp dựa trên tài liệu ôn tập theo phòng ban, sinh sơ đồ tư duy (mindmap) và biểu đồ tương tác bằng Mermaid/JSON, hỗ trợ nhập giọng nói qua Web Speech API và đọc phát âm thành tiếng (TTS)
│   │   ├── CompetencyCard.jsx              # Khối "Bản đồ năng lực" trên Dashboard thí sinh: tích hợp CompetencyView (radar + thanh), gợi ý danh sách chủ đề yếu kèm nút "Luyện ngay"
│   │   └── PracticeSection.jsx             # Phân hệ luyện tập cá nhân: cấu hình bộ đề ôn tập (theo chủ đề, độ khó, chế độ instant/exam), làm bài, kiểm tra từng câu, đếm giờ, chấm điểm, xem tiến độ, chuỗi ngày liên tiếp (streak) và huy hiệu thành tích
│   │
│   ├── components/examiner/
│   │   ├── DepartmentTab.jsx               # Tab quản lý phòng ban: CRUD phòng ban, bắt buộc mã bộ phận (code chuẩn hóa) & tên bộ phận (name), slug không dấu, tìm kiếm, ngừng sử dụng/khôi phục, useScrollLock
│   │   ├── ExamProposalTab.jsx             # Tab đề xuất kỳ thi: tạo mới / chỉnh sửa dự thảo (draft/rejected), cấu hình câu hỏi theo độ khó/phạm vi, chọn phạm vi phòng ban dự thi (departmentScope: all/selected & allowedDepartmentIds), công tắc bù câu chung (allowCommonCompensation), modal 2 cột rộng rãi cỡ chữ lớn, tự động tính tổng số câu hỏi từ số câu chung + riêng, nộp duyệt, useScrollLock
│   │   ├── GenerationProgress.jsx          # Thanh tiến trình và badge hiển thị trạng thái sinh câu hỏi AI nền (Background Generation Badge)
│   │   ├── OverviewTab.jsx                 # Tab tổng quan examiner: thống kê ngân hàng câu hỏi, chủ đề, trạng thái đề xuất
│   │   ├── QuestionAnalysisTab.jsx         # Tab phân tích chất lượng câu hỏi thi chính thức: tính tỷ lệ đúng, độ phân biệt (nhóm cao trừ nhóm thấp), nhận diện đáp án nhiễu mạnh nhất, các cờ cảnh báo (suspect_key, low_discrimination, too_easy, too_hard, difficulty_mismatch), lọc theo chủ đề và phân trang
│   │   ├── QuestionBankTab.jsx             # Tab ngân hàng câu hỏi: phân tách 2 ngân hàng (Thi chính thức vs Ôn tập), CRUD câu hỏi đơn/nhiều đáp án (modal thêm/sửa rộng 2 cột to rõ), upload ảnh Cloudinary, import Excel/Word 2 bước (preview bóc tách + tự tạo phòng ban thiếu kèm mã -> confirm, nhận diện gạch chân trong Word), chuyển đổi ngân hàng hàng loạt, xóa hàng loạt, useScrollLock
│   │   ├── QuestionGeneratorTab.jsx        # Tab tạo câu hỏi bằng AI: đọc tài liệu ôn tập nội bộ (.docx, .pdf, .xlsx), trích xuất và sinh câu hỏi trắc nghiệm tự động xuất ra file Word/Excel chuẩn mẫu import (không ghi trực tiếp vào DB để Examiner kiểm duyệt)
│   │   ├── StudyDocumentTab.jsx            # Tab tài liệu ôn tập: upload file PDF/Word/Excel lên server nội bộ, phân quyền phòng ban, xem/tải/xóa
│   │   └── TopicTab.jsx                    # Tab chủ đề thi: CRUD chủ đề, tự động khôi phục nếu tạo trùng tên chủ đề đã xóa mềm
│   │
│   ├── components/leader/
│   │   ├── AnomalyTab.jsx                  # Tab dấu hiệu bất thường: so cặp đáp án sai trùng lặp (không phụ thuộc xáo đề), tốc độ làm bài nhanh bất thường. Chỉ gợi ý xem xét, không kết luận gian lận. Bộ chọn kỳ thi với tìm kiếm không dấu, phân trang, lọc không hiện kỳ thi 0 dấu hiệu
│   │   ├── CompetencyTab.jsx               # Tab năng lực theo phòng ban: phân tích tỷ lệ đúng theo chủ đề, sắp xếp/tìm kiếm phòng ban, ẩn số liệu phòng ban < 3 thí sinh để bảo vệ thông tin cá nhân, mở rộng xem chi tiết CompetencyView từng đơn vị
│   │   ├── DepartmentReportTab.jsx         # Tab báo cáo phòng ban: thống kê số thí sinh, số lượt thi, tỷ lệ đạt/không đạt theo từng đơn vị
│   │   ├── DetailedResultsTab.jsx          # Tab kết quả chi tiết: danh sách bảng điểm thí sinh, bộ lọc nâng cao, xuất Excel, cấp thêm lượt thi (chống click đúp, hỗ trợ đổi lại phòng ban thi nếu chọn nhầm)
│   │   ├── ExamReportTab.jsx               # Tab báo cáo kỳ thi: thống kê tổng hợp kết quả theo từng kỳ thi, xuất báo cáo Excel
│   │   ├── ExamReviewTab.jsx               # Tab duyệt đề thi: xem chi tiết cấu hình đề (bao gồm phạm vi phòng ban áp dụng và công tắc bù câu chung), kiểm tra tác động publishCheck (fetchPublishImpact), duyệt (approve cấu hình ngày bắt đầu/kết thúc), từ chối (reject kèm lý do), phát hành (publish), lưu trữ (archive), useScrollLock
│   │   ├── OverviewTab.jsx                 # Tab tổng quan leader: biểu đồ và chỉ số hiệu suất thi toàn đơn vị
│   │   └── ReadinessSection.jsx            # Phân tích mức độ sẵn sàng thi của các phòng ban dựa trên số liệu luyện tập và tài liệu
│   │
│   ├── pages/
│   │   ├── admin/AdminDashboard.jsx        # Dashboard Quản trị viên: điều phối các tab Admin (Overview, Account, AuditLog, Backup, AiSettings). Điều hướng tab qua DashboardShell (thanh DỌC từ lg, thanh tab ngang md–lg, menu 3 gạch dưới md).
│   │   ├── candidate/CandidateDashboard.jsx# Dashboard Thí sinh: hiển thị kỳ thi active, khối Bản đồ năng lực (CompetencyCard), tab Trợ lý AI học tập (AiAssistantChat), tài liệu ôn tập theo phòng ban, luyện tập tự do & thành tích, lịch sử làm bài và biểu đồ điểm số
│   │   ├── examiner/ExaminerDashboard.jsx  # Dashboard Người ra đề: điều phối các tab Examiner (Overview, QuestionBank, QuestionAnalysis, Topic, Department, ExamProposal, StudyDocument, QuestionGenerator). Điều hướng tab qua DashboardShell.
│   │   └── leader/LeaderDashboard.jsx      # Dashboard Người duyệt đề: điều phối các tab Leader (Overview, ExamReview, DepartmentReport, Competency, Anomaly, ExamReport, DetailedResults, Assistant - Trợ lý AI báo cáo). Điều hướng tab qua DashboardShell.
│   │
│   └── services/
│       ├── admin.service.js                # Service quản trị: fetchOverviewStats, CRUD user, updateEmployeeDepartments, import/export Excel nhân viên (kèm bóc tách phòng ban kiêm nhiệm), backup/restore API, audit log
│       ├── ai-assistant.service.js         # Service Trợ lý AI: fetchAiStatus, fetchAiSettings, updateAiSettings, askAiAssistant, askLeaderAssistant, generateQuestionsFromDoc (Examiner)
│       ├── analytics.service.js            # Service phân tích nâng cao: fetchQuestionAnalysis (chất lượng câu hỏi), fetchDepartmentCompetency (năng lực gộp theo đơn vị), fetchAnomalies (dấu hiệu bất thường theo kỳ thi: so cặp đáp án sai trùng lặp, tốc độ làm bài), fetchMyCompetency (bản đồ năng lực cá nhân)
│       ├── api.js                          # HTTP client trung tâm: apiRequest(), gắn Bearer token, silent refresh token với queueing, xử lý 401 & SESSION_EXPIRED_EVENT
│       ├── auth.service.js                 # Service xác thực: loginUser, refreshAccessToken, logoutUser, fetchMe, changePassword
│       ├── exam-attempt.service.js         # Service làm bài thi: fetchMyExam, startExamAttempt (truyền departmentId chọn vai trò), submitExamAttempt, answerExamQuestion (autosave), sendExamHeartbeat
│       ├── exam-review.service.js          # Service workflow kỳ thi: fetchPendingExams, fetchApprovedExams, fetchExamHistory, approveExam, rejectExam, publishExam, fetchPublishImpact, archiveExam, fetchActiveExam, grantExtraAttempt (hỗ trợ truyền departmentId đổi vai trò), fetchCandidateRoleOptions
│       ├── examiner.service.js             # Service người ra đề: CRUD câu hỏi, upload ảnh câu hỏi, preview/confirm import câu hỏi Excel & Word (.docx), chuyển ngân hàng hàng loạt, xóa hàng loạt, CRUD chủ đề, CRUD phòng ban, tạo/chỉnh sửa đề xuất kỳ thi
│       ├── notification.service.js         # Service thông báo: fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead
│       ├── practice.service.js             # Service luyện tập thí sinh: fetchPracticeTopics, fetchPracticeProgress, fetchPracticeAchievements, fetchActivePractice, startPracticeSession, checkPracticeAnswer, abandonPracticeSession, submitPracticeSession
│       ├── question-generation.store.js    # Store quản lý tiến trình sinh câu hỏi nền (background question generation) cho Người ra đề
│       ├── report.service.js               # Service báo cáo: fetchOverviewReport, fetchDepartmentReport, fetchExamReport, fetchDetailedResults, exportReport, lookupPublicResult, fetchMyResults
│       ├── study-document.service.js       # Service tài liệu: fetchStudyDocuments, fetchCandidateDocuments, uploadStudyDocument, deleteStudyDocument, previewStudyDocument, downloadStudyDocument (Stream Blob)
│       └── token-store.js                  # Module lưu trữ accessToken trong localStorage (get, save, clear, getAuthHeaders)
└── dist/                                   # Đầu ra build production (Vite build, không chỉnh sửa trực tiếp)
```

## Quản lý Trạng thái (State Management)

Dự án sử dụng chiến lược quản lý trạng thái phân tán, chủ yếu dựa trên React Context và Local State:

- **Auth State**: Quản lý tập trung tại `App.jsx` (lưu trữ `currentUser`, `activeTab`, `mustChangePassword`, `sessionRevokedMessage`) truyền xuống các component con dưới dạng props hoặc qua các component bọc (Wrapper).
- **Global UI State**: Sử dụng Context API.
  - `ToastContext`: Cung cấp hàm `showToast(msg, type)` / `addToast()` để hiển thị thông báo ở mọi nơi mà không cần truyền props.
  - `ConfirmDialog (ConfirmContext)`: Quản lý hiển thị dialog xác nhận bất đồng bộ qua hook `useConfirm()`.
- **Scroll Lock**: Module-level singleton (`lib/lenis-instance.js`) + hook (`hooks/useScrollLock.js`) quản lý trạng thái khóa cuộn khi modal/drawer mở. Tự động gọi `lenis.stop()` + `document.body.style.overflow = 'hidden'` khi `isLocked = true`, phục hồi khi `isLocked = false`. Được tích hợp vào tất cả modal và drawer trong hệ thống.
- **Local State**: Các form, danh sách, modal quản lý trạng thái độc lập bằng `useState`, `useReducer`, `useRef`.
- **Khóa đơn tab & Chống click đúp (Concurrency Guards)**:
  - `ExamModal`: Sử dụng cơ chế khóa localStorage (`z176.examTabLock`, nhịp tim 4s, TTL 12s) kết hợp `step === 'tab-blocked'` để đảm bảo mỗi tài khoản chỉ mở và làm bài ở 1 tab duy nhất trên cùng một trình duyệt; chặn `handleStartExam` khi đang bắt đầu (`startingRef` & state `starting`) để chống click kép tạo 2 lượt thi cùng lúc.
  - `DetailedResultsTab`: Sử dụng `grantBusyRef` khóa chặn click đúp khi Leader cấp lại lượt thi cho thí sinh.

## Tích hợp API và Gọi dữ liệu (API Integration & Data Fetching)

- **Fetch Helper (`api.js`)**: Cấu hình URL cơ sở (`VITE_API_URL`), credentials.
- **Interceptor Flow**:
  - Request: Tự động gắn header `Authorization: Bearer <token>` bằng token lấy từ `token-store.js`.
  - Response: Bắt lỗi 401 (Unauthorized). Gọi luồng *Silent Refresh Token* ngầm (`/api/auth/refresh`) để cấp lại access token.
  - **Queueing Mechanism**: Khi refresh đang chạy, mọi request gọi API khác sẽ bị tạm giữ (push vào queue) và chỉ được thực thi tiếp khi refresh thành công (tránh gọi refresh nhiều lần liên tiếp).
- **Custom Event `SESSION_EXPIRED_EVENT`**: Khi refresh thất bại hoặc tokenVersion bị thu hồi, hệ thống phát event để đẩy user ra ngoài (hiển thị modal thông báo và xóa token).

## Routing và Phân quyền Giao diện (Routing & Role-based UI)

- Không sử dụng thư viện Routing bên thứ 3 mà dùng luồng điều hướng (conditional rendering) thủ công gọn nhẹ qua trạng thái Auth tại `App.jsx`.
- **Tầng bảo vệ (Guards)**: `App.jsx` quyết định load trang chủ hay dashboard dựa vào role của `user` trả về từ `/api/auth/me`.
- Dashboard của từng vai trò được tải dựa vào role code (`admin`, `examiner`, `leader`, `candidate`):
  - **Admin**: Sử dụng `DashboardShell` cung cấp thanh điều hướng DỌC bên trái từ `lg` (thu gọn được, nhớ trạng thái trong localStorage), chuyển thành thanh tab ngang từ `md` đến dưới `lg`, và menu 3 gạch ở Header trên mobile dưới `md`. Quản lý 5 tab (Tổng quan, Tài khoản, Nhật ký, Sao lưu & Phục hồi, Trợ lý AI).
  - **Examiner**: Sử dụng `DashboardShell` tương tự Admin và Leader. Bao gồm 8 tab (Tổng quan, Ngân hàng câu hỏi, Phân tích câu hỏi, Chủ đề, Bộ phận/Phòng ban, Đề xuất kỳ thi, Tài liệu ôn tập, Tạo câu hỏi bằng AI `QuestionGeneratorTab` kèm `GenerationBadge` chạy nền). Hỗ trợ `questionsFilterSeed` để chuyển tab kèm bộ lọc từ tab Chủ đề/Phòng ban sang Ngân hàng câu hỏi.
  - **Leader**: Sử dụng `DashboardShell`. Bao gồm 8 tab (Tổng quan, Duyệt kỳ thi, Theo phòng ban, Năng lực phòng ban, Dấu hiệu bất thường, Theo bài thi, Kết quả chi tiết, và Trợ lý báo cáo `AiAssistantChat`).
  - **Candidate**: Tích hợp khối `CompetencyCard` trực quan hóa năng lực các chủ đề, tab Trợ lý AI học tập (`AiAssistantChat` hỏi đáp tài liệu phòng ban, tạo sơ đồ tư duy & biểu đồ Mermaid, hỗ trợ nhận diện giọng nói và phát âm Text-to-Speech), phân hệ Luyện tập cá nhân và tra cứu kết quả.
- Nếu user truy cập trái phép tab của người khác, UI mặc định sẽ không render component tab đó.

## Tiêu chuẩn UI/CSS (Tailwind v4)

- **Cấu hình**: Sử dụng Tailwind CSS v4 không cần cấu hình phức tạp trong `tailwind.config.js`, sử dụng cú pháp import CSS nội tuyến `@theme` trong `index.css`.
- **Thiết kế Responsive**: Mobile-first cho toàn bộ layout. Tab/Dashboard sử dụng Flexbox/CSS Grid.
- **Biểu đồ & Sơ đồ Trực quan hóa**:
  - `Recharts`: Biểu đồ radar năng lực (`CompetencyRadar`), thanh năng lực (`CompetencyBars`), biểu đồ cột kết quả thi.
  - `Mermaid.js`: Dựng tự động sơ đồ tư duy (mindmap cây JSON), biểu đồ tiến trình/quy trình (flowchart), biểu đồ cột ngang/dọc (`xychart`), biểu đồ tròn (`pie`) ngay trong khung chatbox của Trợ lý AI.
- **Animations**:
  - Sử dụng thư viện `Motion` (Framer Motion) hoặc Tailwind classes (`animate-spin`, `transition-all`) cho vi tương tác (micro-interactions).
  - Tối ưu cuộn trang: Sử dụng thư viện `Lenis` tạo hiệu ứng cuộn mượt (Smooth Scrolling) trên trang chủ, quản lý instance qua singleton (`lenis-instance.js`) và hook `useScrollLock` khóa cuộn khi overlay mở.
- **Icons**: Sử dụng bộ `lucide-react`, đồng nhất SVG format cho toàn bộ hệ thống (dễ dàng tùy chỉnh `size` và `strokeWidth`).