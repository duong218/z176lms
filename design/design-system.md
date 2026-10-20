# Design System — Phiên bản Đơn giản, Nghiêm túc, Dễ dùng

## 1. Tinh thần thiết kế & Cảm xúc thị giác

**Bối cảnh quan trọng nhất, chi phối mọi quyết định thiết kế bên dưới:** đây là hệ thống nội bộ cho doanh nghiệp thuộc Bộ Quốc phòng, người dùng chính là nhân viên/công nhân **30–60 tuổi**, phần lớn không rành công nghệ, dùng chủ yếu trên điện thoại. Vì vậy hệ thống **ưu tiên tuyệt đối cho sự đơn giản, rõ ràng, dễ đọc, dễ chạm** — không chạy theo xu hướng thiết kế hiện đại (gradient, màu nhấn "công nghệ", hiệu ứng nổi nhiều lớp) nếu điều đó làm tăng độ phức tạp thị giác. Khi phân vân giữa "đẹp/hiện đại" và "dễ hiểu ngay lập tức", luôn chọn dễ hiểu.

Giữ màu xanh dương (`#008BC5`) làm gốc nhận diện vì tính tin cậy, nghiêm túc, phù hợp môi trường doanh nghiệp quốc phòng. Bỏ hẳn tư duy "làm mới, bứt phá, đổi mới công nghệ" của phiên bản trước — không cần màu nhấn cyan/tím để tạo cảm giác trẻ trung, vì đối tượng dùng không đánh giá cao yếu tố này và nó chỉ làm tăng số lượng màu cần ghi nhớ.

**Ưu tiên nền tảng: Mobile-first**
Người dùng làm việc/thi chủ yếu trên điện thoại. Toàn bộ hệ thống thiết kế cho màn hình `< 640px` là trải nghiệm mặc định/gốc, sau đó mở rộng dần lên tablet/desktop, không thiết kế desktop trước rồi thu gọn.

**Đặc điểm chính**
- Chỉ 1 màu chính duy nhất (`#008BC5`) cho toàn bộ hành động chính — không dùng gradient cho các thành phần chức năng (nút, thẻ, trạng thái); gradient chỉ được cân nhắc cho 1 banner trang chủ duy nhất nếu thực sự cần thiết, không lan ra toàn hệ thống
- Bỏ màu nhấn "cyan công nghệ" và "tím điện" khỏi bộ nhận diện chính — hệ thống chỉ dùng đúng 5 màu chức năng: xanh dương (hành động chính), xanh lá (thành công/đạt), đỏ (lỗi/không đạt), vàng-cam (cảnh báo), xám (trung tính) — càng ít màu, người 30–60 tuổi càng dễ ghi nhớ ý nghĩa từng màu
- Bo góc vừa phải, nhất quán (8–12px) — không dùng bo góc lớn kiểu "mềm mại hiện đại" (16px+) tràn lan, giữ cảm giác nghiêm túc thay vì "trẻ hóa"
- Shadow tối giản, chỉ 1 mức duy nhất cho card — bỏ hệ thống nhiều lớp độ sâu (Level 0–3), tránh gây rối mắt với người không quen giao diện nhiều lớp
- Typography cỡ chữ lớn hơn mặt bằng chung ứng dụng hiện đại — cỡ chữ nội dung tối thiểu **16px** (không phải 15px), vì người 30–60 tuổi cần cỡ chữ lớn hơn để đọc thoải mái trên điện thoại
- Icon luôn đi kèm nhãn chữ (text label) — không dùng icon đơn độc không có chữ giải thích, tránh người dùng phải đoán ý nghĩa biểu tượng
- Layout nhất quán, lặp lại đúng 1 khuôn mẫu cho mỗi loại màn hình — không thay đổi bố cục giữa các phần để giảm gánh nặng học lại cách dùng
- Không dùng dark mode — không có nhu cầu thực tế, thêm lựa chọn giao diện chỉ gây rối cho người dùng lớn tuổi

## 2. Bảng màu & Vai trò

**Nguyên tắc:** chỉ 5 màu chức năng, không thêm màu trang trí. Mỗi màu gắn với đúng 1 ý nghĩa duy nhất, dùng nhất quán ở mọi màn hình để người dùng ghi nhớ dễ dàng.

### Màu chính (Primary — hành động)
- **Xanh chính** (`#008BC5`): mọi CTA chính, trạng thái active, thương hiệu — dùng phẳng (flat), không gradient
- **Xanh Hover/Nhấn** (`#0693E3`): hover cho nút và link chính (trên desktop; trên mobile dùng làm trạng thái "đang nhấn")
- **Xanh Active** (`#006BA1`): trạng thái nhấn/pressed

### Trạng thái (Semantic — dùng cho kết quả, cảnh báo)
- **Đỏ Lỗi** (`#E53E3E`): lỗi, xóa, không đạt, cảnh báo nghiêm trọng
- **Đỏ Đậm** (`#C53030`): hover/active cho trạng thái lỗi
- **Vàng Cảnh báo** (`#F6AD37`): cảnh báo nhẹ, cần chú ý (không dùng cam riêng — gộp về 1 màu vàng-cam duy nhất để giảm số màu phải nhớ)
- **Xanh Lá Thành công** (`#22C55E`): thành công, hoàn tất, đạt

### Nền & Trung tính
- **Nền Trắng** (`#FFFFFF`): nền chính, card
- **Nền Xám Nhạt** (`#F6F8FA`): nền phụ, phân vùng section
- **Chữ Đen** (`#0F172A`): heading, chữ chính — dùng cho phần lớn nội dung vì độ tương phản cao nhất, dễ đọc cho người lớn tuổi
- **Chữ Xám Đậm** (`#334155`): body text phụ
- **Chữ Xám** (`#64748B`): chú thích, text ít quan trọng — hạn chế dùng cho nội dung cần đọc kỹ vì tương phản thấp hơn
- **Viền Nhạt** (`#E2E8F0`): viền input, chia section

**Đã bỏ khỏi bộ nhận diện:** màu cyan "công nghệ", tím "đổi mới", cam badge riêng, nền tối/dark mode, gradient nhiều điểm dừng — các yếu tố này thuộc phong cách "hiện đại/startup" không phù hợp đối tượng người dùng 30–60 tuổi trong môi trường doanh nghiệp quốc phòng, và làm tăng số lượng màu cần diễn giải.

## 3. Typography

### Font chữ
**Font chính:** Inter (Google Fonts) — giữ nguyên vì đã tối ưu cho UI hiện đại
- Stack: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`

### Hệ thống cấp độ

| Vai trò | Size | Weight | Line Height | Ghi chú |
|---|---|---|---|---|
| Display / H1 | 32px | 700 | 40px | Tiêu đề trang lớn — giảm từ 40px để không quá "phô trương", vẫn đủ nổi bật |
| H2 | 24px | 700 | 32px | Tiêu đề section |
| H3 | 18px | 600 | 26px | Tiêu đề card, mục con |
| Body Lớn | 17px | 400 | 28px | Nội dung câu hỏi, mô tả chính — tăng để dễ đọc |
| Body Chuẩn | **16px** | 400 | 26px | Nội dung chính — mức tối thiểu bắt buộc cho toàn hệ thống, không dùng cỡ nhỏ hơn cho nội dung cần đọc |
| Body Nhấn | 16px | 600 | 26px | Nội dung cần nhấn mạnh |
| Caption | 14px | 500 | 20px | Label, chú thích, form helper — tăng từ 13px, chỉ dùng cho phụ chú ngắn không phải nội dung chính |
| Button | 16px | 600 | 22px | Chữ trong nút — tăng từ 15px |
| Link | 16px | 500 | 26px | Underline liên tục (không chỉ khi hover) để rõ ràng đây là link, không phải chữ thường |

### Nguyên tắc
- **Cỡ chữ tối thiểu toàn hệ thống là 16px** cho mọi nội dung người dùng cần đọc để thao tác (không áp dụng mức 13–15px của bản trước) — ưu tiên dễ đọc hơn việc "vừa nhiều nội dung trên màn hình"
- Chỉ dùng 2 cấp weight: 400 (nội dung) và 600–700 (nhấn/tiêu đề) — không dùng weight 300 (quá mảnh, khó đọc với người lớn tuổi)
- Line-height rộng (1.5–1.6x) giữ nguyên, giúp mắt dễ theo dõi dòng chữ
- Độ tương phản chữ/nền luôn ưu tiên mức cao nhất có thể (`#0F172A` trên nền trắng) cho nội dung quan trọng — hạn chế dùng `#64748B`/xám nhạt cho bất cứ nội dung nào người dùng cần đọc để ra quyết định (chỉ dùng cho placeholder, disabled)

## 4. Thành phần (Components)

### Nút bấm (Buttons)

#### Nút chính (Primary)
- **Nền:** `#008BC5` phẳng — **không dùng gradient**, dễ nhận diện và in ấn/chụp màn hình rõ ràng hơn
- **Chữ:** `#FFFFFF`, 16px, weight 600
- **Padding:** `14px 24px`
- **Chiều cao tối thiểu:** `48px` (tăng vùng chạm cho ngón tay, phù hợp người dùng lớn tuổi thao tác trên mobile)
- **Border radius:** `10px`
- **Shadow:** không dùng, hoặc tối đa `0px 1px 2px rgba(15,23,42,0.08)` nếu cần phân biệt nhẹ với nền
- **Active/Pressed:** nền `#006BA1`
- **Disabled:** opacity `0.4`

#### Nút phụ (Secondary)
- **Nền:** `#FFFFFF`
- **Chữ:** `#008BC5`, 16px, weight 600
- **Viền:** `1.5px solid #008BC5`
- **Border radius:** `10px`
- **Chiều cao tối thiểu:** `48px`
- **Active/Pressed:** nền `#F0F9FF`

#### Nút Ghost
- **Nền:** transparent
- **Chữ:** `#008BC5`
- **Border radius:** `10px`
- **Active/Pressed:** nền `rgba(0, 139, 197, 0.08)`

**Đã bỏ:** nút "Đổi mới/Innovation CTA" — không cần phân biệt "tính năng mới" bằng màu riêng trong hệ thống nội bộ nghiêm túc; mọi chức năng đều trình bày ngang hàng, rõ ràng.

### Thẻ (Cards)

#### Card chuẩn (dùng cho toàn hệ thống)
- **Nền:** `#FFFFFF`
- **Border radius:** `12px`
- **Padding:** `20px`
- **Shadow:** `0px 1px 3px rgba(15, 23, 42, 0.08)` — 1 mức duy nhất, không phân cấp nhiều lớp
- **Viền:** `1px solid #E2E8F0`

**Đã bỏ:** "Card nổi/Elevated" và "Card công nghệ nền tối" — hệ thống chỉ dùng 1 kiểu card duy nhất, nhất quán ở mọi màn hình để người dùng không phải học nhiều kiểu giao diện khác nhau.

### Form & Input

#### Text Input
- **Nền:** `#FFFFFF`
- **Viền:** `1.5px solid #E2E8F0`
- **Border radius:** `10px`
- **Padding:** `12px 16px`
- **Chiều cao:** `48px` (tăng từ 44px cho dễ chạm)
- **Chữ nhập:** 16px (không nhỏ hơn, tránh trình duyệt mobile tự zoom khi focus)
- **Focus:** viền `#008BC5`, shadow `0px 0px 0px 3px rgba(0, 139, 197, 0.15)`
- **Lỗi:** viền `#E53E3E`, kèm dòng chữ mô tả lỗi rõ ràng bên dưới (không chỉ dựa vào màu)
- **Disabled:** nền `#F6F8FA`, chữ `#94A3B8`

#### Label
- **Size:** 14px, weight 600, màu `#334155`, margin-bottom `8px` — luôn hiển thị thường trực phía trên input (không dùng placeholder-as-label, vì chữ biến mất khi gõ dễ gây nhầm cho người lớn tuổi)

### Điều hướng (Navigation)

#### Navbar
- **Nền:** `#FFFFFF` với viền dưới `1px solid #E2E8F0`
- **Chiều cao:** `64px` (mobile), `72px` (desktop)
- **Padding ngang:** `48px` (desktop), `16px` (mobile)
- **Link:** `#334155`, hover/active `#008BC5`, **luôn có nhãn chữ** (không dùng icon đơn độc)
- **Active indicator:** gạch ngang `3px` màu `#008BC5` phía dưới link

#### Nút CTA trong Navbar
- **Nền:** `#008BC5` phẳng
- **Border radius:** `10px` (đồng nhất với nút chính, không dùng pill riêng)

### Badge
- **Badge Mặc định:** nền `#EAF6FF`, chữ `#008BC5`, border radius `8px`, padding `4px 10px`
- **Badge Cảnh báo:** nền `#FFF7E6`, chữ `#B45309`
- **Badge Lỗi:** nền `#FEECEC`, chữ `#C53030`
- **Badge Thành công:** nền `#F0FDF4`, chữ `#166534`

**Đã bỏ:** badge "Mới/AI/Beta" màu cyan — không cần huy hiệu quảng bá tính năng trong hệ thống nội bộ.

### Thông báo (Toast Notification)
- **Nền & Viền:** Nền trắng `#FFFFFF`, viền trái `4px solid` theo màu semantic (Xanh lá `#22C55E` thành công, Đỏ `#E53E3E` lỗi, Vàng `#F6AD37` cảnh báo, Xanh `#008BC5` thông tin).
- **Vị trí:** Cố định góc trên/dưới màn hình, luôn có icon và nút đóng `X` (vùng chạm `44×44px`).
- **Thời lượng:** Tự đóng sau 3.5s hoặc cho phép đóng thủ công. Quản lý qua `ToastContext.jsx`.

### Hộp thoại xác nhận (ConfirmDialog)
- **Cấu trúc:** Thay thế hoàn toàn `window.confirm()` và `window.alert()`.
- **Giao diện:** Modal căn giữa màn hình, backdrop đen mờ (`bg-black/60`), tiêu đề in đậm, nội dung giải thích rõ ràng hậu quả hành động, 2 nút lựa chọn (Hủy: Secondary, Xác nhận: Primary/Danger).
- **Z-Index:** Thiết lập `z-[110]` để luôn nổi lên trên các modal thông thường khác.

### Hộp thoại Modal & Modal lồng nhau (Stacked Modals)
- **Modal chính:** `z-50`, bo góc `12px` (hoặc `rounded-[10px]`), padding `20px–24px`, thanh tiêu đề phân cách rõ ràng và nút đóng góc trên bên phải.
- **Modal con (Inline Action):** Mở đè lên modal cha (ví dụ: tạo nhanh phòng ban từ dropdown trong form tài khoản), thiết lập `z-[60]` để phân tách lớp hiển thị rõ ràng, backdrop riêng.
- **Modal chọn phòng ban dự thi (Kiêm nhiệm):** Dành cho thí sinh có `extraDepartmentIds`, hiển thị danh sách phòng ban/phân xưởng trực quan, radio button lớn, nút xác nhận rõ ràng trước khi vào phòng thi.
- **Hộp thoại Thu hồi phiên (SessionRevokedModal):** `z-[120]` nổi lên cao nhất khi phát hiện `AUTH_ACCESS_REVOKED` (tài khoản đăng nhập nơi khác), chặn hoàn toàn tương tác và yêu cầu đăng nhập lại.

### Thang phân cấp Z-Index Hệ thống
- `z-10`: Sticky headers / Controls
- `z-40`: Navigation bars / Bottom action bars
- `z-50`: Modal chính (Form, Preview, Exam)
- `z-60`: Modal con / Dropdown trong modal
- `z-[100]`: Toast notifications
- `z-[110]`: ConfirmDialog
- `z-[120]`: SessionRevokedModal (khóa màn hình khẩn cấp)

### Hiệu ứng & Hiệu năng GPU (Motion Guidelines)
- **Cuộn mượt Lenis**: Sử dụng Lenis cho thao tác cuộn tự nhiên, tắt `scroll-behavior: smooth` mặc định của trình duyệt để tránh xung đột gây giật khung hình.
- **Hiệu ứng fadeInUp an toàn**: Chỉ áp dụng biến đổi `opacity` và `transform: translateY` (được GPU compositor xử lý độc lập) cho danh sách bảng biểu. Hỗ trợ biến `--stagger-delay` phân tầng mượt mà.
- **Tôn trọng `prefers-reduced-motion`**: Luôn tắt bỏ hoàn toàn animation khi người dùng bật chế độ giảm chuyển động trong cài đặt thiết bị để đảm bảo tính tiếp cận (Accessibility).

### Thành phần Trợ lý AI & Sơ đồ tư duy (AiAssistantChat & Mindmaps)
- **Cửa sổ Chat Trợ lý AI (`AiAssistantChat.jsx`)**:
  - **Giao diện & Vị trí**: Hộp thoại nổi (floating drawer/modal) hoặc tích hợp trong tab, nền trắng `#FFFFFF`, bo góc `12px`, viền `1px solid #E2E8F0`, shadow `0px 2px 8px rgba(15,23,42,0.1)`.
  - **Bong bóng tin nhắn (Chat Bubbles)**:
    - *Người dùng*: Nền xanh chính `#008BC5`, chữ trắng `#FFFFFF`, bo góc `12px` (bo tròn góc dưới phải `4px`), căn phải.
    - *Trợ lý AI*: Nền xám nhạt `#F6F8FA`, chữ `#0F172A`, viền `1px solid #E2E8F0`, bo góc `12px` (bo tròn góc dưới trái `4px`), căn trái.
  - **Hiển thị Sơ đồ tư duy (Mermaid Mindmap/Diagram)**:
    - Render trực tiếp khối mã Mermaid (`mindmap`, `graph TD`, `pie`) thành SVG vector sắc nét.
    - Container sơ đồ có nền trắng `#FFFFFF`, viền `1px solid #CBD5E1`, bo góc `8px`, hỗ trợ nút "Phóng to / Toàn màn hình" và nút sao chép cú pháp.
    - Bảng màu sơ đồ tuân thủ đúng 5 màu chức năng của hệ thống (Xanh chính, Xanh lá, Đỏ, Vàng-cam, Xám), chữ tối thiểu 14px đảm bảo người lớn tuổi đọc rõ trên điện thoại.
  - **Điều khiển Giọng nói & Text-to-Speech (Web Speech API)**:
    - *Nút micro (Voice Input)*: Chiều cao tối thiểu `44×44px`, icon mic kèm nhãn chữ "Nói". Khi đang lắng nghe: viền đỏ `#E53E3E`, hiệu ứng nhấp nháy nhẹ (pulse) nhận diện trạng thái ghi âm.
    - *Nút đọc (Text-to-Speech)*: Icon loa nhỏ bên dưới câu trả lời của AI, màu `#64748B`, đổi sang `#008BC5` khi đang phát âm thanh, có nút dừng đọc tức thì.


---

## 5. Bố cục (Layout)

### Hệ khoảng cách (Spacing)
Đơn vị gốc `4px`:

- XS: 4px · S: 8px · M: 12px · L: 16px · XL: 24px · 2XL: 32px · 3XL: 48px

*(Bỏ mức 4XL/5XL 64–96px của bản trước — hệ thống nội bộ không cần khoảng trắng lớn kiểu landing page tiếp thị; ưu tiên hiển thị đủ nội dung trên màn hình mobile.)*

### Lưới & Container
- **Max width:** `1280px`
- **Padding ngang chuẩn:** `48px` desktop, `16px` mobile
- **Gutter:** `16px` (mobile), `24px` (desktop)
- **Column:** lưới đối xứng đơn giản (không dùng bố cục bất đối xứng 7/5, 8/4 — bố cục càng quen thuộc, càng dễ theo dõi với người dùng không rành công nghệ)

### Border Radius
- **Nhỏ:** `8px` — badge, input, ô lưới câu hỏi
- **Chuẩn:** `10px` — nút, card, modal
- **Lớn:** `12px` — question card, modal lớn
- **Không dùng bo góc pill (999px)** cho các thành phần chức năng — chỉ chấp nhận cho progress bar (đã quy định ở mục 9)

## 6. Độ sâu & Hiệu ứng (Elevation)

**Nguyên tắc:** chỉ 1 mức shadow duy nhất cho toàn hệ thống — `0px 1px 3px rgba(15,23,42,0.08)`, dùng cho card, dropdown, modal. Không phân cấp Level 0–3 như bản trước; sự phân cấp nhiều lớp không tạo thêm giá trị sử dụng cho nhóm người dùng này mà chỉ tăng độ phức tạp khi lập trình và dễ hiển thị không nhất quán trên các thiết bị Android đời cũ phổ biến trong môi trường doanh nghiệp.

## 7. Nên & Không nên

### Nên
- Chỉ dùng đúng 5 màu chức năng đã quy định ở mục 2 — nhất quán ở mọi màn hình
- Bo góc nhất quán theo thang 8/10/12px
- Icon luôn kèm nhãn chữ, không dùng icon đơn độc
- Cỡ chữ tối thiểu 16px cho nội dung cần đọc để thao tác (input text, câu hỏi, đáp án, nút)
- Giữ layout lặp lại đúng khuôn mẫu giữa các màn hình tương tự
- Sử dụng `useConfirm()` từ `ConfirmDialog.jsx` và `useToast()` cho mọi thao tác phản hồi người dùng

### Không nên
- Không dùng gradient cho bất kỳ thành phần chức năng nào (nút, card, trạng thái)
- Không thêm màu ngoài 5 màu chức năng đã quy định, kể cả với lý do "làm nổi bật tính năng mới"
- Không dùng shadow nhiều lớp/đậm — chỉ 1 mức duy nhất theo mục 6
- Không để chữ dưới 16px cho nội dung chính (caption tối thiểu 14px)
- Không dùng bố cục bất đối xứng hoặc icon-only để tạo cảm giác "hiện đại" — ưu tiên quen thuộc, dễ đoán hơn ấn tượng thị giác
- Không dùng `window.confirm()` hay `alert()` gốc của trình duyệt

## 8. Responsive (Mobile-first)

Thiết kế bắt đầu từ mobile (base style), dùng `min-width` media query để mở rộng dần lên tablet/desktop — không thiết kế desktop rồi co lại.

| Breakpoint | Độ rộng | Vai trò | Thay đổi chính |
|---|---|---|---|
| **Base (Mobile)** | `< 640px` | **Mặc định / gốc** | 1 cột, padding 16–20px, nút full-width, navbar rút gọn (hamburger hoặc bottom nav), mọi vùng chạm tối thiểu `44×44px` |
| Tablet | `≥ 640px` | Mở rộng | 2 cột, padding 32px |
| Desktop | `≥ 1024px` | Mở rộng | Lưới 12 cột đầy đủ, padding 48px |
| Large | `≥ 1280px` | Mở rộng | Container cố định 1280px, căn giữa |

### Nguyên tắc mobile-first
- Toàn bộ component ở mục 4 lấy giá trị **mobile làm mặc định**; giá trị desktop (padding lớn hơn, layout nhiều cột) chỉ áp dụng thêm ở `≥ 640px` / `≥ 1024px`.
- Vùng chạm (tap target) tối thiểu `44×44px` cho mọi phần tử tương tác trên mobile (nút, đáp án, ô điều hướng câu hỏi) — quan trọng hơn quy tắc kích thước cố định ở mục 4 nếu hai điều mâu thuẫn.
- Ưu tiên layout 1 cột, cuộn dọc; tránh cuộn ngang trừ khi là carousel có chủ đích.
- Các thành phần cố định vị trí (sticky/fixed) — thanh hành động đáy, header tiến trình — phải tính padding-bottom/top an toàn cho notch và thanh điều hướng hệ điều hành (safe-area-inset).
- Thành phần chỉ có ý nghĩa ở màn rộng (sidebar cố định, lưới nhiều cột) phải có phương án thay thế trên mobile (bottom sheet, drawer, accordion) thay vì ẩn hoàn toàn hoặc thu nhỏ khó dùng.

## 9. Thành phần riêng cho Hệ thống Thi Trắc nghiệm

Áp dụng đúng bảng màu/typography ở trên. Với người dùng 30–60 tuổi trong môi trường doanh nghiệp quốc phòng, nguyên tắc bao trùm là: **rõ ràng > mọi thứ khác**; trạng thái (đã làm/chưa làm/đúng/sai) phải nhận biết ngay bằng màu **và** có nhãn chữ đi kèm, không chỉ dựa vào màu (một số người dùng có thể khó phân biệt màu sắc).

### Header cố định (Mobile) — Tiến trình + Đồng hồ
Trên mobile, thanh tiến trình và đồng hồ nằm chung 1 header sticky trên cùng, cùng 1 hàng — không xuống dòng, không tách 2 vị trí như bản desktop cũ.
- **Progress bar:** nền track `#E2E8F0`, fill `#008BC5` flat, border radius `999px`, cao `8px`, chiếm phần lớn chiều ngang bên trái.
- **Label:** "Câu 12/40" — 13px, weight 600, màu `#334155`, đặt sát dưới hoặc cạnh progress bar.
- **Đồng hồ đếm giờ:** góc phải cùng hàng — bình thường nền `#F6F8FA`/chữ `#0F172A` weight 700; dưới 5 phút nền `#FEECEC`/chữ `#C53030`. Padding gọn `6px 12px` trên mobile (nhỏ hơn bản desktop `8px 16px`) để vừa 1 hàng.
- Header có `padding-top` tôn trọng safe-area-inset (notch) trên thiết bị di động.

### Danh sách câu hỏi (Question Navigator) — Bottom Sheet, không phải sidebar
Trên mobile, **không đặt lưới điều hướng cố định trên màn hình** (chiếm quá nhiều diện tích của thẻ câu hỏi). Thay bằng:
- 1 nút nhỏ dạng icon-lưới hoặc "Danh sách câu hỏi (12/40)" đặt trong header hoặc bottom bar, chạm để mở **bottom sheet trượt lên từ đáy màn hình**.
- Trong bottom sheet: lưới ô vuông nhỏ, tối thiểu `44×44px` mỗi ô (lớn hơn mốc `36×36px` của bản desktop cũ để đủ vùng chạm), bo góc `8px`, cuộn dọc nếu nhiều câu:
  - **Chưa làm:** nền `#FFFFFF`, viền `1.5px solid #E2E8F0`, chữ `#64748B`
  - **Đã làm:** nền `#EAF6FF`, viền `#008BC5`, chữ `#008BC5`
  - **Đang xem:** nền `#008BC5`, chữ `#FFFFFF`, shadow nhẹ `0px 2px 6px rgba(0,139,197,0.3)`
  - **Đã đánh dấu review (cờ):** thêm chấm nhỏ `#F6AD37` ở góc trên phải ô
  - **Không dùng cyan/tím ở đây** — giữ hệ đơn sắc xanh để không gây nhiễu khi có 40–60 câu
- Chạm 1 ô trong bottom sheet → nhảy tới câu đó và tự đóng sheet.

### Thẻ câu hỏi (Question Card)
- **Nền:** `#FFFFFF`, border radius `12px`, padding `20px` trên mobile (thay vì `32px` bản desktop — tiết kiệm diện tích màn hình nhỏ)
- **Viền:** `1px solid #E2E8F0`
- **Shadow:** `0px 1px 3px rgba(15,23,42,0.08)` (mức duy nhất theo mục 6)
- **Số thứ tự câu hỏi:** badge tròn `28px` trên mobile (thay vì `32px`), nền `#008BC5`, chữ trắng, weight 700
- **Nội dung câu hỏi:** Body Lớn (16px/26px), màu `#0F172A` — giữ nguyên trên mọi kích thước màn hình, không giảm size trên mobile (ưu tiên dễ đọc)

### Đáp án (Answer Options)
- **Trạng thái mặc định:** nền `#FFFFFF`, viền `1.5px solid #E2E8F0`, border radius `12px`, padding `14px 16px`, **chiều cao tối thiểu `48px`** (đủ vùng chạm mobile), cả hàng có thể chạm (không chỉ radio/checkbox)
- **Bố cục:** luôn xếp cột đơn (1 đáp án / hàng) trên mobile — không xếp lưới 2 cột dù ngắn, tránh chạm nhầm
- **Loại câu hỏi:** single choice dùng radio, multiple choice dùng checkbox — icon đặt bên trái, rõ ràng để thí sinh phân biệt ngay không cần đọc hướng dẫn
- **Hover/Active khi chạm:** viền `#0693E3`, nền `#F0F9FF`
- **Đã chọn:** viền `2px solid #008BC5`, nền `#EAF6FF`, chữ weight 600
- **Sau khi nộp bài — Đúng:** viền `#22C55E`, nền `#F0FDF4`, icon check xanh lá
- **Sau khi nộp bài — Sai (đã chọn):** viền `#E53E3E`, nền `#FEECEC`, icon x đỏ
- **Sau khi nộp bài — Đáp án đúng (chưa chọn):** viền `#22C55E` nét đứt, để người thi thấy đáp án đúng dù chọn sai

### Thanh hành động cố định (Bottom Action Bar — Mobile)
- **Nền:** `#FFFFFF`, border-top `1px solid #E2E8F0`, cố định đáy màn hình, `padding-bottom` tôn trọng safe-area-inset
- **Bố cục 1 hàng, tối đa 2 nút chính:** "Câu trước" / "Câu tiếp" chia đôi đều chiều ngang (nút Secondary, viền xanh) — **không nhét thêm nút "Nộp bài" hoặc "Danh sách câu hỏi" vào cùng hàng này** để tránh 3 nút chen chúc khó chạm chính xác trên màn hình hẹp
- **Nút "Danh sách câu hỏi":** đặt trong header (xem phần Bottom Sheet ở trên) hoặc thành 1 nút icon nhỏ riêng phía trên bottom bar
- **Nút "Nộp bài":** hiện thường trực trong bottom sheet danh sách câu hỏi (dễ thấy khi thí sinh đã rà lại toàn bộ câu), dùng nút chính, đổi màu sang `#E53E3E` khi thí sinh đang ở câu cuối hoặc đã xem hết để nhấn mạnh tính quyết định (không dùng cyan)

### Màn hình kết quả (Results Screen)
- **Khối điểm số tổng:** card lớn giữa trang, số điểm cỡ Display (32px/700), màu theo kết quả:
  - Đạt: `#22C55E` — Không đạt: `#E53E3E` — Trung bình/cảnh báo: `#F6AD37`
- **Biểu đồ phân loại câu đúng/sai:** dùng đúng 3 màu semantic (xanh lá/đỏ/xám `#64748B` cho câu bỏ trống), không thêm màu ngoài hệ thống
- **Bảng chi tiết từng câu:** hàng zebra nhẹ (`#F6F8FA` xen `#FFFFFF`), badge Đúng/Sai dùng đúng badge semantic đã định nghĩa ở mục 4, kèm chữ "Đúng"/"Sai" chứ không chỉ màu

### Nguyên tắc riêng cho giao diện thi
- **Không dùng gradient** trong màn hình làm bài
- **Toàn bộ trạng thái thi dùng đúng 4 màu:** xanh (`#008BC5` – đang làm/đã chọn), xanh lá (`#22C55E` – đúng/đạt), đỏ (`#E53E3E` – sai/không đạt), vàng-cam (`#F6AD37` – đánh dấu review)
- **Thẻ câu hỏi và đáp án bo góc tối đa 12px** — giữ sắc thái nghiêm túc, đồng nhất với quy tắc bo góc chung của mục 5

## 10. Tóm tắt nhanh cho AI/Agent khi tạo UI

0. **Đối tượng người dùng:** doanh nghiệp thuộc Bộ Quốc phòng, người dùng 30–60 tuổi, dùng chủ yếu trên mobile. Mọi quyết định thiết kế ưu tiên đơn giản/rõ ràng hơn "hiện đại/bắt mắt".
1. **Chỉ 5 màu chức năng trong toàn hệ thống:** xanh `#008BC5` (hành động chính), xanh lá `#22C55E` (thành công/đạt), đỏ `#E53E3E` (lỗi/không đạt), vàng-cam `#F6AD37` (cảnh báo), xám (trung tính). Không thêm màu nào khác dù với lý do gì.
2. **Không dùng gradient** ở bất kỳ thành phần chức năng nào (nút, card, trạng thái) trong toàn hệ thống, không riêng gì luồng thi.
3. Bo góc: 8px (nhỏ — badge, input) / 10px (chuẩn — nút, card) / 12px (card lớn, modal). Không dùng bo góc pill (999px) trừ progress bar.
4. Shadow chỉ 1 mức duy nhất `0px 1px 3px rgba(15,23,42,0.08)` cho toàn hệ thống — không phân cấp nhiều lớp.
5. Font Inter. **Cỡ chữ tối thiểu 16px cho mọi nội dung cần đọc để thao tác** — không dùng cỡ 13–15px như hệ thống hiện đại thông thường.
6. Trạng thái thi trắc nghiệm dùng đúng 4 màu cố định (xem mục 1).
7. Khoảng cách gọn (16–24px) toàn hệ thống, không có khoảng trắng lớn kiểu landing page (64–96px đã bỏ).
8. Input/nút cao tối thiểu 48px (vùng chạm tối thiểu 44×44px), bo góc 10px, focus ring xanh mềm.
9. **Icon luôn kèm nhãn chữ** — không dùng icon đơn độc không giải thích ở bất kỳ đâu trong hệ thống.
10. **Vùng chạm tối thiểu 44×44px** (ưu tiên 48×48px) cho mọi phần tử tương tác trên mobile.
11. **Lưới điều hướng câu hỏi không đặt cố định trên màn hình mobile** — dùng bottom sheet mở từ 1 nút trong header/bottom bar.
12. **Bottom action bar mobile tối đa 2 nút/hàng** ("Câu trước"/"Câu tiếp"); nút "Nộp bài" và nút mở danh sách câu hỏi đặt tách riêng.
13. Trạng thái đúng/sai/đạt/không đạt luôn có **cả màu và chữ** đi kèm — không dựa hoàn toàn vào màu sắc để truyền đạt thông tin.
14. **Sử dụng `ConfirmDialog` (`useConfirm`) và `ToastContext` (`useToast`)** thay cho các hộp thoại pop-up gốc của trình duyệt (`alert`, `confirm`).
15. **Sơ đồ tư duy AI (Mermaid) và Bong bóng Chat**: Tuân thủ đúng 5 màu chức năng của hệ thống, cỡ chữ sơ đồ tối thiểu 14px, các nút tương tác giọng nói/âm thanh đạt vùng chạm tối thiểu 44×44px.