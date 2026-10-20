# Luồng làm bài thi và Chấm điểm

## Nguồn

| File | Vai trò |
|---|---|
| `server/src/services/exam-attempt.service.js` | Toàn bộ logic nghiệp vụ thi trắc nghiệm: khởi tạo/resume lượt thi, lưu vết câu trả lời tức thì (autosave), duy trì nhịp tim phiên thi (heartbeat), phát hiện vắng mặt >1 phút tự động nộp bài, đóng băng phòng ban thi cho thí sinh (`departmentId`), chấm điểm tự động (câu đơn/nhiều đáp án), và cấp thêm lượt thi. |
| `server/src/controllers/exam-attempt.controller.js` | Tiếp nhận và điều hướng các HTTP request, bọc `asyncHandler`, và ghi nhận audit log hệ thống. |
| `server/src/routes/exam-attempt.routes.js` | Khai báo các endpoint API của phòng thi, áp dụng middleware xác thực (`authenticate`), phân quyền role (`candidate`/`leader`), kiểm tra bắt buộc đổi mật khẩu (`requirePasswordChanged`), và áp dụng Rate Limiting theo `userId`. |
| `server/src/schedulers/abandoned-attempt.scheduler.js` | Cron job chạy **mỗi 1 phút (`* * * * *`)**, tự động quét và nộp các bài thi bị treo máy, ngắt mạng hoặc bỏ thi quá 1 phút không có tương tác (`autoSubmitReason: 'inactive_timeout'`). |
| `client/src/components/ExamModal.jsx` | Giao diện phòng thi toàn màn hình: xác nhận thông tin, modal chọn phòng ban cho nhân sự kiêm nhiệm, hiển thị câu hỏi/đáp án xáo ngẫu nhiên, đếm ngược thời gian thi, autosave, heartbeat định kỳ 15s, cảnh báo chuyển tab 10s, và hiển thị bảng điểm tổng kết. |

---

## Bài toán nghiệp vụ

Quy trình tổ chức thi trắc nghiệm tại Nhà máy Z176 đòi hỏi tính nghiêm ngặt, bảo mật cao và chống gian lận, đồng thời phải đảm bảo trải nghiệm thông suốt cho cán bộ công nhân viên:
- **Giới hạn số lượt thi**: Mỗi thí sinh có đúng **1 lượt thi chính thức** (`attemptsUsed < MAX_OFFICIAL_ATTEMPTS + extraAttemptsGranted`). Chỉ Người duyệt đề (Leader) mới có thẩm quyền cấp thêm lượt do sự cố bất khả kháng.
- **Hỗ trợ Nhân sự Kiêm nhiệm (`extraDepartmentIds`)**: Cán bộ kiêm nhiệm nhiều phòng ban/phân xưởng sẽ được yêu cầu xác nhận phòng ban dự thi trước khi bắt đầu. Hệ thống đóng băng mã phòng ban này vào `ExamAttempt.departmentId` để phục vụ chấm điểm và thống kê không bị lệch nếu có điều chuyển công tác sau này.
- **Chống mất dữ liệu do sự cố**: Nếu mất kết nối mạng, vô tình F5/reload trang, hoặc máy tính bị treo phải chuyển sang điện thoại -> thí sinh vẫn tiếp tục được bài thi đang dở (`resumed: true`) với nguyên vẹn các câu trả lời đã chọn trước đó.
- **Xáo trộn câu hỏi và đáp án cá nhân hóa**: Tránh nhìn bài nhau bằng cách xáo ngẫu nhiên thứ tự câu hỏi và thứ tự các phương án trả lời riêng biệt cho từng thí sinh (`AttemptQuestion`).
- **Phát hiện gian lận và bỏ thi (3 Tầng Bảo vệ)**: Tự động phát hiện khi thí sinh rời phòng thi/bỏ tab để đếm ngược 10s, cưỡng chế nộp bài ở mọi request sau 60s idle, và quét bằng background scheduler mỗi 1 phút.
- **Giám sát Chuyển tab & Rời màn hình (`leaveCount`)**: Hệ thống tự động đếm số lần thí sinh chuyển tab hoặc rời ứng dụng thi (`leaveCount`) và lưu trên `ExamAttempt` để hỗ trợ Người duyệt đề (Leader) thẩm định dấu hiệu bất thường trên giao diện `AnomalyTab`.
- **Bảo mật tuyệt đối đáp án**: Đáp án đúng (`isCorrect`) và logic chấm điểm được bảo vệ hoàn toàn tại máy chủ (server-side), không bao giờ gửi cờ đáp án đúng xuống trình duyệt trong lúc làm bài.

---

## Bảng API Endpoints Phòng thi
 
| Method | Đường dẫn | Quyền hạn | Chức năng | Rate Limit |
|---|---|---|---|---|
| `GET` | `/api/exam-attempts/my-exam` | Candidate | Lấy đề thi, cấu hình và trạng thái lượt thi hiện tại của thí sinh (loại bỏ `isCorrect`) | Không |
| `POST` | `/api/exam-attempts/start` | Candidate | Bắt đầu lượt thi mới hoặc tiếp tục lượt thi đang dở (`resumed`). Hỗ trợ nhận `departmentId` đã chọn cho nhân sự kiêm nhiệm | 100 req/min/user (prod) |
| `PATCH` | `/api/exam-attempts/:id/answer` | Candidate | Tự động lưu đáp án 1 câu hỏi tức thì (Autosave) | 100 req/min/user (prod) |
| `POST` | `/api/exam-attempts/:id/heartbeat` | Candidate | Gửi tín hiệu duy trì phòng thi (Heartbeat mỗi 15s) | 100 req/min/user (prod) |
| `POST` | `/api/exam-attempts/:id/submit` | Candidate | Nộp bài thi chính thức và kích hoạt chấm điểm tự động | 100 req/min/user (prod) |
| `POST` | `/api/exam-attempts/candidates/:id/grant-attempt` | Leader | Cấp thêm lượt thi chính thức cho thí sinh gặp sự cố | Không |

---

## Luồng xử lý chi tiết (8 Giai đoạn)

```text
Thí sinh mở Modal
   │
   ├─ [1. getMyExam] Lấy đề thi (ẩn đáp án đúng), kiểm tra lượt đang dở, auto-submit nếu quá hạn
   │
   ├─ [2. Xác nhận vai trò/phòng ban] Thí sinh kiêm nhiệm chọn phòng ban dự thi (nếu chưa chốt)
   │
   ├─ [3. startAttempt] Bắt đầu lượt thi mới -> Đóng băng departmentId vào ExamAttempt
   │                    -> Sinh snapshot xáo trộn AttemptQuestion (hoặc resume lượt in_progress)
   │
   ├─ [4. Làm bài thi]
   │     ├─ Thí sinh click chọn đáp án -> [5. recordAnswer (Autosave)] lưu tức thì vào DB
   │     ├─ Tab đang mở -> [6. Heartbeat] gửi mỗi 15s cập nhật lastActiveAt
   │     └─ Rời tab / tắt trình duyệt -> [7. Ba tầng bảo vệ tự động nộp bài]
   │
   └─ [8. submitAttempt] Thí sinh chủ động nộp / Hết giờ / Hệ thống tự nộp
                         -> Chấm điểm server-side -> Trả về Result
```

### 1. Mở màn hình thi (`getMyExam`)
Khi thí sinh mở `ExamModal.jsx`, client gửi `GET /api/exam-attempts/my-exam`:
1. `resolveCandidateContext`: Xác thực thí sinh thuộc nhân viên nào, lấy kỳ thi `published` hiện hành và mã đề `ExamCode` được gán.
2. Quét các lượt thi cũ: Nếu có lượt đang `in_progress` nhưng thời gian hiện tại đã vượt quá `expiresAt`, tự động cập nhật trạng thái thành `expired`.
3. Kiểm tra tính năng bỏ đi: Nếu có lượt `in_progress` nhưng thí sinh đã ngắt kết nối quá 1 phút (`lastActiveAt` cách hiện tại > 60s), hệ thống tự động nộp bài và gắn cờ `autoSubmitted: true`.
4. Trả về dữ liệu đề thi:
   - Nếu đang có lượt `in_progress`: Trả về danh sách câu hỏi đã xáo theo đúng snapshot `AttemptQuestion` của lượt đó, kèm các câu trả lời đã lưu dở (`savedAnswers`).
   - Nếu chưa bắt đầu: Trả về danh sách câu hỏi xem trước theo thứ tự gốc.
   - **Tất cả đáp án đều bị loại bỏ trường `isCorrect`**.

### 2. Xác nhận Phòng ban Dự thi đối với Nhân sự Kiêm nhiệm
- Nếu nhân viên có `extraDepartmentIds` và chưa có `roleConfirmedAt`:
  - `ExamModal` hiển thị bảng chọn phòng ban dự thi cho thí sinh.
  - Khi thí sinh chọn và bấm xác nhận, hệ thống ghi nhận `roleConfirmedAt = new Date()`, `roleChosenBy = 'candidate'`.
  - Nếu kỳ thi cấu hình theo phạm vi phòng ban hẹp (`departmentScope: 'selected'`), thí sinh chỉ được chọn các phòng ban hợp lệ nằm trong `allowedDepartmentIds`.

### 3. Khởi tạo / Tiếp tục Lượt thi (`startAttempt`)
Khi thí sinh bấm *"Bắt đầu làm bài"*, client gửi `POST /api/exam-attempts/start`:
- **Trường hợp tiếp tục (Resume)**: Nếu đang có lượt `in_progress` còn hạn, hệ thống trả về ngay lượt thi đó (`resumed: true`) kèm `expiresAt` ban đầu, không tạo bản ghi mới và không làm mất lượt thi.
- **Trường hợp bắt đầu mới**:
  1. Kiểm tra số lượt thi đã sử dụng: `attemptsUsed < (MAX_OFFICIAL_ATTEMPTS + extraAttemptsGranted)`. Nếu hết lượt -> chặn với lỗi `ATTEMPTS_EXHAUSTED`.
  2. Tạo bản ghi `ExamAttempt` mới với `status = 'in_progress'`, `startedAt = now`, `expiresAt = now + durationMinutes * 60000`, `departmentId = candidateDepartmentId` (đóng băng vĩnh viễn phòng ban thi).
  3. Tăng `attemptsUsed` trong `ExamCandidate`.
  4. Kích hoạt sinh snapshot câu hỏi cá nhân hóa (`generateAttemptQuestionSnapshot`).

### 4. Xáo trộn Câu hỏi & Đáp án Cá nhân hóa (`AttemptQuestion`)
Để đảm bảo tính minh bạch và chống nhìn bài:
- Hệ thống lấy toàn bộ câu hỏi trong `ExamCodeQuestion` của mã đề thí sinh.
- Thực hiện thuật toán Fisher–Yates xáo ngẫu nhiên thứ tự các câu hỏi.
- Đồng thời với từng câu hỏi, xáo ngẫu nhiên thứ tự hiển thị các phương án trả lời `Answer`.
- Lưu snapshot kết quả xáo vào bảng `AttemptQuestion` gắn với `attemptId`.
- **Snapshot này là duy nhất và cố định trong suốt lượt thi** (khi thí sinh reload trang hoặc đổi thiết bị, thứ tự câu hỏi và đáp án vẫn giữ nguyên).

### 5. Lưu tạm Đáp án Tức thì (`recordAnswer` - Autosave)
Mỗi khi thí sinh click chọn hoặc thay đổi phương án trả lời, client gọi `PATCH /api/exam-attempts/:id/answer`:
1. Kiểm tra quyền sở hữu lượt thi và đảm bảo lượt thi đang ở trạng thái `in_progress` và chưa hết giờ.
2. Lưu/Cập nhật bản ghi `CandidateAnswer` cho câu hỏi tương ứng (hỗ trợ lưu mảng `selectedAnswerIds` cho câu hỏi nhiều đáp án).
3. Cập nhật mốc thời gian hoạt động gần nhất `lastActiveAt = new Date()`.
4. *Lưu ý:* Bước này chỉ lưu vết lựa chọn, **hoàn toàn không tính điểm**.

### 6. Cơ chế Nhịp tim Giữ phiên (`heartbeat`)
- Phía Client: `ExamModal.jsx` thiết lập timer gửi `POST /api/exam-attempts/:id/heartbeat` định kỳ mỗi **15 giây** (chỉ gửi khi `document.visibilityState === 'visible'`).
- Phía Server: Cập nhật `lastActiveAt` của lượt thi, xác nhận thí sinh vẫn đang tương tác trực tiếp với phòng thi.

### 7. Ba Tầng Bảo vệ Phát hiện Thí sinh Bỏ thi / Rời phòng thi
Hệ thống Z176 thiết lập **3 tầng phòng thủ độc lập**:

1. **Tầng 1: Cảnh báo Trực quan trên Giao diện (Client-side - 10 giây)**:
   - Sử dụng các sự kiện trình duyệt `visibilitychange` và `window.onblur`.
   - Khi thí sinh chuyển sang tab khác, mở ứng dụng khác hoặc thu nhỏ trình duyệt: Giao diện lập tức hiển thị Modal cảnh báo vi phạm quy chế thi kèm đồng hồ đếm ngược **10 giây**.
   - Nếu thí sinh không quay lại màn hình thi trong 10 giây: Client tự động kích hoạt nộp bài ngay lập tức.
2. **Tầng 2: Kiểm soát ở Từng Request (Server-side - 1 phút / `INACTIVITY_TIMEOUT_MS = 60_000`)**:
   - Nếu thí sinh tắt máy tính, ngắt mạng hoặc vô hiệu hóa JavaScript phía client: Heartbeat và Autosave sẽ ngừng gửi.
   - Tại tất cả các API (`getMyExam`, `recordAnswer`, `heartbeat`), hệ thống kiểm tra: Nếu `now - lastActiveAt > 60_000ms`, lượt thi lập tức bị cưỡng chế đóng và tự động nộp (`autoSubmitReason: 'inactive_timeout'`).
3. **Tầng 3: Tiến trình Quét nền Tự động (Cron Scheduler - 1 phút)**:
   - Scheduler `abandoned-attempt.scheduler.js` chạy định kỳ **mỗi 1 phút (`* * * * *`)**.
   - Quét toàn bộ các lượt thi `in_progress` trong CSDL có `lastActiveAt < now - 60s`.
   - Cưỡng chế nộp bài và chấm điểm ngay lập tức trên DB, bất kể client có gửi request lên hay không.
   - Điểm số được chấm tự động dựa trên toàn bộ các câu trả lời đã autosave thành công trước đó trong `CandidateAnswer`.

### 8. Nộp bài & Chấm điểm Tự động (`submitAttempt`)
Xảy ra khi thí sinh bấm *"Nộp bài"*, hết giờ làm bài, hoặc do hệ thống tự động nộp:
1. **Kiểm tra tính Idempotent**: Nếu lượt thi đã ở trạng thái `submitted` từ trước (do bấm đúp hoặc mạng lag), hệ thống trả về kết quả đã chấm trước đó, không chấm lại.
2. Đọc bộ câu hỏi từ snapshot `AttemptQuestion` của lượt thi.
3. Truy vấn đáp án chính xác từ bảng `Answer` (`isCorrect === true`).
4. **Thuật toán Chấm điểm**:
   - **Câu hỏi 1 đáp án (`single`)**: Thí sinh chọn đúng duy nhất 1 đáp án đúng -> Đúng (1 điểm).
   - **Câu hỏi nhiều đáp án (`multiple`)**: Thí sinh phải chọn đúng và đủ tất cả các đáp án đúng, không chọn thừa bất kỳ đáp án sai nào -> Đúng (1 điểm).
5. **Tính toán Kết quả**:
   - $\text{Điểm số} = \text{round}\left(\frac{\text{Số câu đúng}}{\text{Tổng số câu}} \times 100\right)$ (thang điểm 100).
   - $\text{Kết quả Đạt} = \text{Điểm số} \ge \text{passThresholdPercent}$ (mặc định 70%).
6. Lưu kết quả vào bảng `Result`, cập nhật trạng thái `ExamAttempt` thành `submitted`, ghi nhận `submittedAt`.

---

## Quản lý Lượt thi Bổ sung (`grantExtraAttempt`)

Trong các trường hợp bất khả kháng (mất điện toàn phân xưởng, lỗi thiết bị phần cứng):
- Người duyệt đề (Leader) có thẩm quyền cấp thêm lượt thi thông qua API `POST /api/exam-attempts/candidates/:examCandidateId/grant-attempt`.
- Hệ thống tăng giá trị `extraAttemptsGranted` thêm 1 trong `ExamCandidate`.
- Thí sinh được phép bắt đầu một lượt thi mới với snapshot đề thi xáo trộn mới hoàn toàn.


