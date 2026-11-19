# HỆ THỐNG THI TRẮC NGHIỆM CHUYÊN MÔN NỘI BỘ Z176
> **SẢN PHẨM KHÓA LUẬN TỐT NGHIỆP**
> * Sinh viên thực hiện: **Phạm Ngọc Dương**
> * Mã lớp / Khóa: **K67**
> * Trường: **Học viện Nông nghiệp Việt Nam**
  * Portfolio: https://phamngocduong.vercel.app/
---

## 1. Giới thiệu chung

Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176 là giải pháp phần mềm toàn diện được nghiên cứu và phát triển nhằm tự động hóa quy trình tổ chức thi đánh giá năng lực, tay nghề chuyên môn và bồi dưỡng nghiệp vụ định kỳ dành cho cán bộ, công nhân viên tại **Công ty TNHH MTV 76 (Nhà máy Z176) - Tổng cục Công nghiệp Quốc phòng**.

Hệ thống được thiết kế theo quy trình nghiệp vụ khép kín:
* **Ngân hàng câu hỏi & tài liệu chuyên môn**: Phân định rạch ròi 2 mục đích **Thi chính thức** (`exam`) và **Ôn tập** (`practice`), hỗ trợ nhập câu hỏi 2 bước từ **Excel & Word (.docx)** (tự động nhận diện đáp án gạch chân, trích xuất ảnh minh họa), quản lý tài liệu học tập theo phạm vi chung hoặc theo từng phòng ban/phân xưởng.
* **Tích hợp Trợ lý AI đa năng**: Hỗ trợ Thí sinh hỏi đáp ôn tập kiến thức phân quyền theo tài liệu phòng ban, vẽ trực tiếp sơ đồ tư duy (Mindmap) và biểu đồ tương tác (Mermaid), hỗ trợ nhập lệnh giọng nói và đọc Text-to-Speech (TTS); hỗ trợ Người ra đề tự động soạn câu hỏi ra file Word/Excel; hỗ trợ Người duyệt đề phân tích dữ liệu báo cáo chuyên sâu.
* **Quy trình Đề xuất & Duyệt kỳ thi**: Soạn thảo ma trận đề thi (số câu chung, số câu riêng, thời lượng, ngưỡng đạt, phạm vi phòng ban, công tắc bù câu hỏi chung), quy trình phê duyệt/từ chối kèm lý do chi tiết và phát hành kỳ thi.
* **Sinh mã đề & Tổ chức thi an toàn thời gian thực**: Tự động xáo trộn ngẫu nhiên câu hỏi & đáp án độc lập cho từng thí sinh (thuật toán Fisher–Yates), hỗ trợ thí sinh kiêm nhiệm nhiều phòng ban chủ động chọn vai trò thi trước khi làm bài, phòng thi trực tuyến tự động lưu đáp án (Autosave), giám sát nhịp tim (Heartbeat 15s) và tự động thu bài khi mất kết nối/vắng mặt quá thời gian quy định.
* **Luyện tập cá nhân & Bản đồ năng lực**: Cho phép thí sinh tự do ôn luyện theo chủ đề (chế độ kiểm tra ngay từng câu hoặc làm bài bấm giờ), theo dõi tiến độ, tích lũy huy hiệu thành tích và trực quan hóa bản đồ năng lực radar cá nhân/phòng ban.
* **Chấm điểm, Phân tích & Báo cáo**: Chấm điểm tự động tức thì, phân tích độ phân biệt của câu hỏi (Discrimination Index), phát hiện dấu hiệu bất thường (làm bài siêu tốc, cặp thí sinh trùng đáp án sai), và xuất báo cáo kết quả thi chuẩn mẫu Excel.
* **Quản trị, Kiểm toán & An toàn dữ liệu**: Phân quyền chi tiết 4 vai trò, cơ chế thu hồi phiên đăng nhập đơn (Single Active Session qua `tokenVersion`), Audit Log toàn diện, cơ chế CLI khôi phục mật khẩu Admin nhanh, cùng hệ thống sao lưu CSDL tự động lên Google Drive định kỳ hàng ngày.

---

## 2. Tổng quan công nghệ sử dụng

Hệ thống xây dựng theo kiến trúc Client-Server phân lớp hiện đại, tối ưu hiệu năng và bảo mật:

### Client (Frontend)
* **Framework**: [React 19](https://react.dev/) & [Vite](https://vite.dev/) (Tối ưu tốc độ tải và xây dựng gói bundle cực nhanh).
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Hệ thống thiết kế hiện đại, responsive mobile-first, cấu hình token `@theme`).
* **Hiệu ứng & Hoạt ảnh**: [Lenis Smooth Scroll](https://github.com/darkroomengineering/lenis) (Cuộn trang mượt mà kết hợp registry quản lý singleton khi mở modal/drawer) & [Motion](https://motion.dev/) (Micro-animations sinh động).
* **Trực quan hóa dữ liệu & Sơ đồ tư duy**:
  * [Recharts](https://recharts.org/): Biểu đồ Radar năng lực, biểu đồ cột, biểu đồ tròn thống kê điểm số và tỷ lệ đạt/không đạt.
  * [Mermaid](https://mermaid.js.org/): Dựng trực tiếp sơ đồ tư duy (mindmap) và biểu đồ tương tác ngay trong hộp thoại Trợ lý AI.
* **Icons**: [Lucide React](https://lucide.dev/).
* **Âm thanh & Giọng nói**: Web Speech API hỗ trợ nhập lệnh giọng nói (Voice-to-Text) và đọc nội dung (Text-to-Speech).

### Server (Backend)
* **Runtime**: Node.js (Phiên bản `>=22.0.0 <25.0.0`).
* **Framework**: Express.js (Kiến trúc RESTful API chuẩn mực, phân tách Router - Controller - Service - Model rõ ràng).
* **Cơ sở dữ liệu**: MongoDB & Mongoose ODM (Quản lý 21 Models/Collections dữ liệu quan hệ chặt chẽ).
* **Trợ lý AI & Mô hình ngôn ngữ lớn (LLM)**:
  * Tương thích chuẩn OpenAI API / Google Gemini API.
  * Đọc và bóc tách nội dung tài liệu PDF/Word/Excel (`unpdf`, `mammoth`, `xlsx`).
  * Phục vụ 3 phân hệ: Thí sinh ôn tập, Người ra đề sinh câu hỏi, Người duyệt đề phân tích báo cáo.
* **Xác thực & Bảo mật**:
  * Xác thực kép **JWT** (`accessToken` ngắn hạn lưu bộ nhớ client, `refreshToken` dài hạn trong `httpOnly cookie`).
  * Cơ chế **`tokenVersion`** thu hồi phiên tức thì trên mọi thiết bị khi phát hiện đăng nhập mới hoặc đổi mật khẩu (chống đăng nhập đồng thời 1 tài khoản).
  * Tự động khóa tài khoản tạm thời khi đăng nhập sai quá số lần quy định (`failedLoginAttempts`, `lockUntil`).
  * `Helmet` bảo vệ các HTTP headers, `CORS` cấu hình an toàn cho phép giao tiếp Client-Server.
  * `express-rate-limit` giới hạn tần suất theo IP và theo `userId` (đăng nhập, làm bài thi, gọi Trợ lý AI).
* **Tiến trình tự động (Cron Schedulers)**:
  * **Sao lưu đám mây**: Tự động dump, nén `.gz` và sao lưu CSDL lên Google Drive lúc 03:00 hàng ngày (`0 3 * * *`, xoay vòng tối đa 5 bản lưu) kèm mã hóa `BACKUP_ENCRYPTION_KEY`.
  * **Dọn file tạm**: Tự động dọn dẹp file upload tạm quá 6 tiếng mỗi giờ một lần (`0 * * * *`).
  * **Dọn tài khoản khóa lâu**: Tự động quét và xóa cứng các tài khoản bị khóa liên tục quá 6 tháng không có lịch sử thi/audit lúc 04:00 hàng ngày (`0 4 * * *`).
  * **Quét bài thi bỏ rơi**: Tự động nộp và chấm điểm các bài thi bị mất kết nối quá thời gian quy định mỗi 1 phút (`* * * * *`).
* **Xử lý tệp tin & Đa phương tiện**:
  * `exceljs` & `xlsx`: Đọc/xuất báo cáo điểm thi, xuất danh sách cấp mật khẩu tạm, nhập danh sách nhân sự và ngân hàng câu hỏi.
  * `mammoth` & `unpdf`: Bóc tách và phân tích cấu trúc đề thi, tài liệu học tập từ tệp Word (.docx) và PDF.
  * `multer` + `Cloudinary SDK`: Tải và tối ưu hóa hình ảnh câu hỏi đám mây (định danh bằng SHA-256 hash chống lưu trùng ảnh).

---

## 3. Cấu trúc Mô hình & Dữ liệu Hệ thống

Hệ thống tổ chức dữ liệu chặt chẽ qua 21 Collections trong MongoDB:

| Phân nhóm dữ liệu | Models / Collections | Mô tả vai trò & Chức năng |
| :--- | :--- | :--- |
| **Tài khoản & Tổ chức** | `User`, `Role`, `Department`, `Employee` | Quản lý tài khoản đăng nhập, vai trò hệ thống, danh mục phòng ban/phân xưởng, thông tin hồ sơ nhân viên và danh sách phòng kiêm nhiệm (`extraDepartmentIds`). |
| **Ngân hàng câu hỏi & Chủ đề** | `Topic`, `Question`, `Answer` | Quản lý chuyên môn/chủ đề, nội dung câu hỏi (đơn/nhiều đáp án, mức độ khó, ảnh minh họa Cloudinary, phạm vi chung/riêng, mục đích `exam`/`practice`) và các lựa chọn đáp án. |
| **Đề thi & Thí sinh** | `Exam`, `ExamCode`, `ExamCodeQuestion`, `ExamCandidate`, `Schedule` | Cấu trúc ma trận kỳ thi, trạng thái duyệt (`draft` -> `pending_review` -> `approved` -> `published`), mã đề ngẫu nhiên sinh cho từng thí sinh, danh sách thí sinh dự thi và lịch thi. |
| **Phòng thi & Kết quả** | `ExamAttempt`, `AttemptQuestion`, `CandidateAnswer`, `Result` | Quá trình làm bài thi trực tuyến, snapshot câu hỏi/đáp án xáo trộn, lưu vết câu trả lời, trạng thái nộp bài và bảng điểm/kết quả thi chính thức. |
| **Luyện tập cá nhân** | `PracticeSession` | Lưu trữ các phiên thí sinh tự do luyện tập cá nhân (chế độ kiểm tra ngay hoặc mô phỏng thi, thống kê điểm, thời gian hoàn thành). |
| **Tài liệu học tập** | `StudyDocument` | Lưu trữ file tài liệu ôn tập (.pdf, .docx, .xlsx), phân quyền truy cập theo phòng ban hoặc toàn đơn vị. |
| **Giám sát & Thông báo** | `AuditLog`, `Notification` | Nhật ký ghi vết kiểm toán toàn bộ thao tác nhạy cảm (kèm IP, metadata) và hệ thống thông báo chuông in-app thời gian thực. |
| **Cấu hình Trợ lý AI** | `AiSetting` | Cấu hình Base URL, API Key, Model, System Prompt, hạn mức ký tự tài liệu và công tắc bật/tắt AI toàn hệ thống. |

---

## 4. Mô hình Phân quyền Người dùng (4 Roles)

```text
               ┌──────────────── Đăng Nhập Hệ Thống ────────────────┐
               │                                                    │
        [ Thí sinh ]           [ Người ra đề ]         [ Người duyệt ]      [ Quản trị viên ]
        (candidate)              (examiner)               (leader)              (admin)
             │                        │                       │                    │
   - Dashboard tổng quan    - Bảng điều khiển        - Bảng điều khiển    - Bảng điều khiển
   - Thi trực tuyến         - Ngân hàng câu hỏi      - Duyệt kỳ thi       - Quản lý tài khoản
   - Luyện tập cá nhân      - Phân tích câu hỏi      - Báo cáo phòng ban  - Nhật ký (Audit Log)
   - Lịch sử kết quả        - Quản lý chủ đề         - Năng lực phòng ban - Sao lưu & Phục hồi
   - Tài liệu ôn tập        - Phòng ban              - Dấu hiệu bất thường- Cấu hình Trợ lý AI
   - Trợ lý AI ôn tập       - Đề xuất kỳ thi         - Báo cáo bài thi    - Phân quyền & Khóa
   - Bản đồ năng lực radar  - Tài liệu ôn tập        - Kết quả chi tiết
                            - Tạo câu hỏi bằng AI    - Trợ lý AI báo cáo
```

### 1. Thí sinh (Candidate) - Gồm 6 phân hệ chính:
* **Dashboard**: Xem thông tin ca thi sắp tới/đang mở, tóm tắt lịch sử điểm số, thống kê tiến độ luyện tập và chuỗi ngày học tập.
* **Thi trực tuyến**: Xác nhận vai trò thi (nếu kiêm nhiệm nhiều phòng ban), vào phòng thi chính thức làm bài với cơ chế tự động lưu đáp án (Autosave), đếm ngược và kiểm tra nhịp tim (Heartbeat 15s).
* **Luyện tập cá nhân**: Tự do chọn chủ đề ôn tập, số câu (5/10/20/30), giới hạn thời gian, độ khó; chọn chế độ **Kiểm tra ngay** (biết đúng/sai và lời giải từng câu) hoặc **Mô phỏng thi**; mở khóa các huy hiệu thành tích (Achievements).
* **Lịch sử kết quả**: Tra cứu lịch sử toàn bộ các lần thi, xem bảng điểm, tỷ lệ đúng/sai và xem lại chi tiết bài làm.
* **Tài liệu ôn tập**: Xem trực tuyến hoặc tải về tài liệu chuyên môn được phân quyền (tài liệu chung + tài liệu phòng ban chính + tài liệu phòng kiêm nhiệm).
* **Trợ lý AI ôn tập & Bản đồ năng lực**: Hỏi đáp kiến thức dựa trên đúng tài liệu phòng ban mình, sinh mindmap/Mermaid diagram, hỗ trợ giọng nói; xem **Biểu đồ Radar năng lực cá nhân** theo từng chủ đề.

### 2. Người ra đề (Examiner) - Gồm 8 phân hệ chính:
* **Tổng quan**: Theo dõi số lượng câu hỏi, số chủ đề, số tài liệu và danh sách việc cần xử lý.
* **Ngân hàng câu hỏi**: Soạn thảo câu hỏi (đơn/nhiều đáp án, upload ảnh minh họa), nhập câu hỏi hàng loạt từ file **Excel & Word (.docx)** (nhận diện đáp án gạch chân), phân tách và chuyển đổi câu hỏi giữa 2 kho **Thi chính thức** và **Ôn tập**.
* **Phân tích câu hỏi**: Đánh giá độ phân biệt (Discrimination Index), tỷ lệ chọn từng phương án A/B/C/D, phát hiện và gắn cờ cảnh báo câu hỏi có nguy cơ sai đáp án.
* **Chủ đề**: Quản lý danh mục chuyên môn/lĩnh vực kiến thức.
* **Bộ phận / Phòng ban**: Theo dõi cơ cấu tổ chức và liên kết câu hỏi theo từng bộ phận.
* **Đề xuất kỳ thi**: Soạn thảo cấu trúc đề thi (số câu chung, số câu riêng, thời lượng, ngưỡng đạt, phạm vi phòng ban, công tắc bù câu hỏi chung) và gửi lên cấp trên phê duyệt (kèm huy hiệu đếm số đề cần xử lý).
* **Tài liệu ôn tập**: Upload, quản lý và phân quyền tài liệu lý thuyết (chung hoặc theo phòng ban).
* **Tạo câu hỏi bằng AI**: Tự động đọc tài liệu ôn tập và sinh bộ câu hỏi trắc nghiệm ra file Word/Excel chuẩn mẫu để xem lại trước khi import.

### 3. Người duyệt đề (Leader) - Gồm 8 phân hệ chính:
* **Tổng quan**: Dashboard số liệu toàn diện về các kỳ thi, tỷ lệ hoàn thành và chất lượng bài làm.
* **Duyệt kỳ thi**: Phê duyệt hoặc từ chối đề xuất kỳ thi kèm lý do chi tiết; cấu hình thời gian bắt đầu/kết thúc (`startDate`, `endDate`); phát hành chính thức kỳ thi (kích hoạt thuật toán sinh mã đề độc lập); **cấp thêm lượt thi** cho thí sinh gặp sự cố bất khả kháng.
* **Theo phòng ban**: Thống kê số lượng dự thi, điểm trung bình và tỷ lệ đạt/không đạt của từng đơn vị.
* **Năng lực phòng ban**: Biểu đồ Radar so sánh năng lực chuyên môn của các phòng ban theo từng chủ đề.
* **Dấu hiệu bất thường**: Phát hiện các dấu hiệu nghi vấn (cặp thí sinh có chuỗi đáp án sai trùng lặp, các ca thi hoàn thành nhanh bất thường so với thời gian trung bình).
* **Theo bài thi**: Thống kê phổ điểm, độ lệch chuẩn và tỷ lệ đạt theo từng kỳ thi cụ thể.
* **Kết quả chi tiết**: Bảng điểm chi tiết từng thí sinh, hỗ trợ lọc thông minh và xuất báo cáo ra file Excel chuẩn mẫu nhà máy.
* **Trợ lý báo cáo (AI)**: Trợ lý AI chuyên trách phân tích số liệu báo cáo, giải đáp nhanh các truy vấn số liệu toàn công ty.

### 4. Quản trị viên (Admin) - Gồm 5 phân hệ chính:
* **Tổng quan**: Thống kê tổng số tài khoản, tình trạng máy chủ và thông tin quản trị.
* **Tài khoản**: Quản lý người dùng, tạo nhanh đơn lẻ hoặc tạo phòng ban inline; quy trình **Import Excel 2 bước** (Preview kiểm tra trùng mã/tài khoản khóa rồi mới Confirm); **Xuất file Excel cấp mật khẩu tạm** cho thí sinh; khóa/mở khóa tài khoản; phân quyền vai trò.
* **Nhật ký (Audit Log)**: Theo dõi toàn bộ lịch sử thao tác hệ thống (đăng nhập, đổi mật khẩu, sửa phân quyền, sao lưu, duyệt đề, nộp bài...) có bộ lọc thông minh theo người thao tác, nhân viên và phòng ban.
* **Sao lưu & Phục hồi**: Tạo bản sao lưu CSDL tức thì lên Google Drive, tải bản sao lưu `.gz`, xem danh sách các bản sao lưu xoay vòng và khôi phục CSDL an toàn kèm mã xác nhận bảo mật.
* **Trợ lý AI**: Bật/tắt Trợ lý AI toàn hệ thống, cấu hình Base URL, API Key, Model, System Prompt và hạn mức ký tự trích xuất tài liệu.

---

## 5. Tính năng Kỹ thuật & An toàn Nổi bật

* 🤖 **Bộ 3 Trợ lý AI Chuyên biệt**: Hỗ trợ Thí sinh ôn tập trực quan (Mindmap/Mermaid/Voice), Người ra đề sinh câu hỏi chuẩn mẫu, và Leader phân tích số liệu báo cáo.
* ⚡ **Phòng thi An toàn Thời gian thực**: Tự động lưu đáp án tức thì (Autosave), giữ nhịp tim Heartbeat 15s/lần, tự động nộp và chấm điểm khi thí sinh ngắt kết nối quá thời gian quy định (`inactive_timeout`).
* 👥 **Hỗ trợ Nhân sự Kiêm nhiệm**: Hỗ trợ nhân viên thuộc nhiều phòng ban (`extraDepartmentIds`), thí sinh chủ động chọn vai trò thi trước khi làm bài và hệ thống tự động khóa vai trò gắn vào kết quả thi.
* ⚖️ **Công tắc Bù câu hỏi chung (`allowCommonCompensation`)**: Linh hoạt cho phép hoặc chặn bù trừ câu hỏi chung khi ngân hàng câu hỏi riêng của một phòng ban chưa đủ số lượng cấu hình.
* 🎲 **Xáo trộn Mã đề Độc lập (Fisher–Yates)**: Tự động trộn ngẫu nhiên thứ tự câu hỏi và thứ tự phương án trả lời độc lập cho từng thí sinh, đảm bảo không trùng lặp mã đề trong phòng thi.
* 🔒 **Chống Lộ đề Thi Nghiêm ngặt**: Phân tách rạch ròi 2 ngân hàng câu hỏi `exam` và `practice`. Hệ thống tự động chặn chuyển câu hỏi sang ngân hàng Ôn tập nếu chủ đề đang nằm trong kỳ thi đang diễn ra.
* 🛡️ **Kiểm soát Phiên Đơn & Chống Đăng nhập Đồng thời**: Quản lý phiên qua cơ chế `tokenVersion`, tự động cảnh báo và đăng xuất tức thì nếu tài khoản được đăng nhập ở thiết bị/trình duyệt khác.
* 🔑 **Công cụ CLI Khôi phục Mật khẩu Admin**: Hỗ trợ lệnh dòng lệnh `npm run reset-admin` giúp đặt lại mật khẩu và gỡ khóa tài khoản Admin tức thì khi lỡ quên mật khẩu mà không cần thao tác trực tiếp trên CSDL.
* 💾 **Sao lưu Tự động Đám mây & Khôi phục Trực quan**: Tự động backup CSDL lên Google Drive lúc 03:00 hàng ngày, mã hóa bản lưu an toàn và hỗ trợ khôi phục trực tiếp với thanh tiến trình % trực quan.
* 🧹 **Tiến trình Tự động Dọn dẹp**: Tự động dọn file tạm uploads mỗi giờ, quét nộp bài thi bỏ rơi mỗi phút và xóa an toàn các tài khoản bị khóa liên tục quá 6 tháng không có lịch sử.

---

## 6. Hướng dẫn Cài đặt & Khởi chạy Cục bộ (Local Development)

### Yêu cầu môi trường
* **Node.js**: Phiên bản `>= 22.0.0 < 25.0.0`
* **MongoDB**: MongoDB Atlas hoặc MongoDB Community Server cục bộ (`>= 7.0`)
* **Tài khoản Cloudinary & Google Cloud Console** (dành cho upload ảnh câu hỏi và sao lưu Google Drive)

### Các bước thực hiện

1. **Clone mã nguồn dự án:**
   ```bash
   git clone https://github.com/duong218/z176lms.git
   cd z176lms
   ```

2. **Cài đặt dependencies:**
   ```bash
   # Cài đặt cho Server
   cd server
   npm install

   # Cài đặt cho Client
   cd ../client
   npm install
   ```

3. **Cấu hình biến môi trường:**
   * Tạo file `server/.env` dựa trên file mẫu `server/.env.example`:
     ```env
     NODE_ENV=development
     PORT=5000
     MONGODB_URI=mongodb://127.0.0.1:27017/exam-system-dev

     JWT_SECRET=your_jwt_secret_key
     JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
     JWT_ACCESS_EXPIRES_IN=15m
     JWT_REFRESH_EXPIRES_IN=1d

     CORS_ORIGIN=http://localhost:5173,http://localhost:3000
     UPLOAD_DIR=./uploads
     SEED_ON_START=true

     ADMIN_SEED_EMAIL=admin
     ADMIN_SEED_PASSWORD=your_admin_password
     ADMIN_SEED_MUST_CHANGE_PASSWORD=false

     CLOUDINARY_CLOUD_NAME=your_cloudinary_name
     CLOUDINARY_API_KEY=your_cloudinary_key
     CLOUDINARY_API_SECRET=your_cloudinary_secret

     GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
     GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
     GOOGLE_REFRESH_TOKEN=your_google_refresh_token
     GOOGLE_DRIVE_BACKUP_FOLDER_ID=your_drive_folder_id
     BACKUP_ENCRYPTION_KEY=your_backup_encryption_key
     ```
   * Tạo file `client/.env`:
     ```env
     VITE_API_URL=http://localhost:5000/api
     ```

4. **Khởi tạo dữ liệu mẫu (Seed Data) & Khôi phục Admin:**
   ```bash
   cd server
   # Khởi tạo vai trò mặc định và tài khoản Admin ban đầu:
   npm run seed

   # Đặt lại mật khẩu Admin nếu lỡ quên hoặc tài khoản bị khóa:
   npm run reset-admin [mật_khẩu_mới]
   # Ví dụ: npm run reset-admin 123456
   ```

5. **Khởi chạy ứng dụng:**
   ```bash
   # Chạy Server Backend (tại thư mục server)
   npm run dev

   # Chạy Client Frontend (tại thư mục client ở một terminal khác)
   npm run dev
   ```
   * **Client UI**: `http://localhost:3000` (hoặc `http://localhost:5173`)
   * **Server API**: `http://localhost:5000/api`

---

## 7. Danh mục Lệnh Dòng Lệnh (CLI Scripts)

### Phía Server (`server/`)
* `npm run dev`: Chạy server chế độ phát triển với cờ `--watch-path=src`.
* `npm run start`: Chạy server môi trường sản xuất (`node src/index.js`).
* `npm run seed`: Chạy script khởi tạo dữ liệu mẫu và tài khoản admin ban đầu.
* `npm run reset-admin [password] [username]`: Đặt lại mật khẩu và gỡ khóa tài khoản Admin tức thì.
* `npm run backup`: Kích hoạt tiến trình sao lưu CSDL ngay lập tức lên Google Drive qua CLI.

### Phía Client (`client/`)
* `npm run dev`: Chạy ứng dụng Vite React trên cổng 3000 (`--host=0.0.0.0`).
* `npm run build`: Đóng gói ứng dụng để triển khai production.
* `npm run preview`: Xem trước bản build production cục bộ.
* `npm run lint`: Kiểm tra chất lượng mã nguồn bằng ESLint.

---
*Bản quyền sản phẩm thuộc về tác giả Phạm Ngọc Dương - Sinh viên K67 - Khoa Công nghệ thông tin - Học viện Nông nghiệp Việt Nam.*
