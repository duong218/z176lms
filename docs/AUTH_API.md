# Cơ chế xác thực & Phân quyền (Auth API)

Hệ thống Z176 áp dụng cơ chế xác thực kép (Dual Token) thông qua JSON Web Token (JWT) kết hợp giữa **Access Token** ngắn hạn (15 phút, lưu trong bộ nhớ ứng dụng client) và **Refresh Token** dài hạn (7 ngày, lưu trữ trong HttpOnly Cookie bảo mật) để đảm bảo an toàn tối đa cho môi trường mạng nhà máy quân đội.

---

## 1. Các Endpoint Xác thực

| Method | Path | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Public | Đăng nhập hệ thống. Nhận vào `{ username, password }`. Trả về `accessToken` ở JSON body; set `refreshToken` vào Cookie bảo mật với thuộc tính `httpOnly: true`, `secure: isProduction`, `sameSite: 'strict'`, `path: '/api/auth'`. Áp dụng Rate Limiter chống brute-force keyed theo `${req.ip}|${username}`. |
| **POST** | `/api/auth/refresh` | Cookie | Sử dụng `refreshToken` trong HttpOnly Cookie để cấp mới cặp token. Cơ chế rotating refresh token tự động ngăn chặn replay attack. |
| **POST** | `/api/auth/logout` | Bearer | Đăng xuất người dùng. Thu hồi refresh token bằng cách xóa cookie và tăng `tokenVersion` trong database của User nếu muốn vô hiệu hóa ngay phiên hiện tại. |
| **GET** | `/api/auth/me` | Bearer | Trả về thông tin chi tiết tài khoản của người dùng hiện tại kèm theo vai trò (`role`) và hồ sơ nhân viên (`employee`) bao gồm phòng ban chính (`departmentId`) và danh sách phòng ban kiêm nhiệm (`extraDepartmentIds`). |
| **POST** | `/api/auth/change-password` | Bearer | Đổi mật khẩu tài khoản. Nhận `{ currentPassword, newPassword }`. Kiểm tra độ an toàn mật khẩu (tối thiểu 6 ký tự). Trường `mustChangePassword` chuyển thành `false` sau khi đổi thành công. |

---

## 2. Quy trình Khởi động hệ thống (Database Seeding)

- Khi khởi động server lần đầu hoặc bật cờ `SEED_ON_START = 'true'`, hệ thống tự động kiểm tra và khởi tạo 4 vai trò mặc định (`admin`, `examiner`, `leader`, `candidate`) vào collection `roles`.
- Đồng thời, tạo tài khoản quản trị ban đầu dựa trên biến môi trường `ADMIN_SEED_USERNAME` (hoặc `ADMIN_SEED_EMAIL`) và `ADMIN_SEED_PASSWORD`. Tài khoản này được gán `mustChangePassword: true` để yêu cầu bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
- Tự động tạo hồ sơ `Employee` tương ứng và liên kết phòng ban Ban Giám đốc cho tài khoản Admin mặc định nếu chưa tồn tại.

---

## 3. Kiểm soát Đơn phiên & Thu hồi phiên tức thì (Single Session & Token Version)

Hệ thống nghiêm ngặt áp dụng nguyên tắc **1 tài khoản chỉ được đăng nhập trên 1 thiết bị/trình duyệt tại một thời điểm** nhằm ngăn chặn gian lận thi hộ:
- Mỗi `User` sở hữu trường số nguyên `tokenVersion` (khởi tạo bằng 0) trong database.
- Mỗi khi người dùng đăng nhập thành công ở thiết bị mới hoặc đổi mật khẩu:
  1. Server tự động tăng `tokenVersion = tokenVersion + 1` trên DB.
  2. Cấp Access Token và Refresh Token mới mang payload `tokenVersion` mới nhất.
- Khi nhận request, middleware `authenticate` giải mã Access Token và đối soát:
  - Nếu `token.tokenVersion !== user.tokenVersion`: Trả mã lỗi `AUTH_ACCESS_REVOKED` (HTTP 401).
- **Phát hiện đa thiết bị phía Client**:
  - Giao diện Client định kỳ kiểm tra hoặc nhận diện mã `AUTH_ACCESS_REVOKED` từ bất kỳ API nào.
  - Lập tức kích hoạt Modal cảnh báo toàn màn hình `SessionRevokedModal` thông báo tài khoản vừa đăng nhập ở nơi khác và xóa bỏ mọi trạng thái làm bài/token trên máy hiện tại.

---

## 4. Giới hạn tần suất gọi API (Rate Limiting)

Để vừa bảo vệ hệ thống trước tấn công brute-force vừa đảm bảo phòng thi có 100+ thí sinh cùng chung 1 địa chỉ IP LAN không bị chặn nhầm, hệ thống thiết kế cơ chế Rate Limiting phân lớp:

1. **Đăng nhập (`loginRateLimiter` - `/api/auth/login`)**:
   - Sử dụng khóa tổng hợp: `keyGenerator: (req) => `${req.ip}|${req.body?.username || ''}``.
   - Giới hạn: **5 lần thử sai / 15 phút** (`skipSuccessfulRequests: true` — đăng nhập đúng không bị tính vào hạn mức).
   - Nếu nhập sai quá 5 lần liên tiếp: Hệ thống khóa tạm tài khoản (`lockUntil = now + 15 phút`) và trả lỗi `AUTH_LOCKED` (HTTP 423).
2. **Phòng thi (`examAttemptRateLimiter` - `/api/exam-attempts/*`)**:
   - Sử dụng định danh tài khoản: `keyGenerator: (req) => req.auth?.userId ?? req.ip`.
   - Giới hạn: **100 req/phút/user**.
   - **Lợi ích**: Hàng trăm thí sinh trong cùng phân xưởng/phòng máy chia sẻ chung 1 IP NAT công ty vẫn có hạn mức riêng biệt 100 req/phút/người, không bị nghẽn hay chặn nhầm khi gửi heartbeat (15s) và autosave liên tục.
3. **Trợ lý AI (`aiChatRateLimiter` - `/api/ai-assistant/*`)**:
   - Sử dụng định danh tài khoản: `keyGenerator: (req) => req.auth?.userId ?? req.ip`.
   - Giới hạn: **20 req/phút/user**.
   - **Mục tiêu**: Ngăn chặn quá tải tài nguyên LLM, hạn chế lạm dụng gửi spam câu hỏi và kiểm soát chi phí gọi API bên thứ ba.

---

## 5. Cách thức lưu trữ & Quản lý Token phía Client

- **Access Token**: Lưu trữ trong bộ nhớ runtime của trình duyệt (`memoryStorage` / biến module `token-store.js`) để phòng chống hoàn toàn các cuộc tấn công đánh cắp token qua XSS (Cross-Site Scripting).
- **Refresh Token**: Được trình duyệt tự động bảo vệ trong **HttpOnly Cookie**, JavaScript phía client không thể đọc được.
- **Silent Refresh**:
  - Khi người dùng F5 hoặc mở lại ứng dụng, hàm khởi tạo gọi `POST /api/auth/refresh` kèm cookie để nhận Access Token mới mà không cần người dùng nhập lại mật khẩu.
  - Tích hợp hàng đợi request queueing: Khi Access Token hết hạn, các request đồng thời được giữ lại trong hàng đợi chờ request refresh hoàn tất rồi tự động replay với token mới.


