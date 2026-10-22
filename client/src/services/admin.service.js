import { apiRequest, API_BASE_URL } from './api';
import { getAuthHeaders } from './auth.service';
import { fetchActiveExam } from './exam-review.service';

export async function fetchOverviewStats() {
  const [users, activeExam] = await Promise.all([
    fetchUsers(),
    fetchActiveExam(),
  ]);

  const usersByRole = users.reduce((acc, u) => {
    if (u.roleCode) acc[u.roleCode] = (acc[u.roleCode] || 0) + 1;
    return acc;
  }, {});

  return {
    totalUsers: users.length,
    usersByRole, // { admin, examiner, leader, candidate }
    activeExam,  // exam object hoặc null
  };
}

export async function fetchUsers() {
  const res = await apiRequest('/users', {
    headers: getAuthHeaders(),
  });
  const usersData = Array.isArray(res.data) ? res.data : [];
  return usersData.map(u => ({
    ...u,
    roleCode: u.roleId?.code,
    roleName: u.roleId?.name,
    roleId: u.roleId?._id || u.roleId // Fallback if not populated
  }));
}

export async function fetchRoles() {
  const res = await apiRequest('/roles', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

/**
 * @param {string} username
 * @param {string} roleId
 * @param {{ fullname: string, departmentId: string, employeeCode?: string, extraDepartmentIds?: string[] }} [employeeInfo]
 *   Chỉ cần truyền khi roleId ứng với role 'candidate' (thí sinh) — backend sẽ tự
 *   tạo Employee gắn với User mới tạo. Với các role khác, để undefined/bỏ qua.
 */
export async function createUser(username, roleId, employeeInfo) {
  const body = { username, roleId };
  if (employeeInfo) {
    body.fullname = employeeInfo.fullname;
    body.departmentId = employeeInfo.departmentId;
    body.employeeCode = employeeInfo.employeeCode;
    body.extraDepartmentIds = employeeInfo.extraDepartmentIds; // phòng kiêm nhiệm (không bắt buộc)
  }

  const res = await apiRequest('/users', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  return res; // contains data (user) and tempPassword
}

export async function updateUserRole(userId, roleId) {
  const res = await apiRequest(`/users/${userId}/role`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roleId })
  });
  return res.data;
}

// Sửa thông tin cá nhân (họ tên, mã NV, phòng ban, kiêm nhiệm, ngày sinh, giới tính, SĐT, địa chỉ, chức vụ)
export async function updateUserProfile(userId, payload) {
  const res = await apiRequest(`/users/${userId}/profile`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function toggleUserLock(userId, isActive) {
  const res = await apiRequest(`/users/${userId}/lock`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ isActive })
  });
  return res.data;
}

export async function resetUserPassword(userId) {
  const res = await apiRequest(`/users/${userId}/reset-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.tempPassword;
}

/**
 * @param {object} params
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {string} [params.action] - 1 hoặc nhiều action, phân tách bởi dấu phẩy
 * @param {string} [params.resourceType]
 * @param {string} [params.from] - ngày bắt đầu, format 'YYYY-MM-DD'
 * @param {string} [params.to] - ngày kết thúc, format 'YYYY-MM-DD'
 * @param {string} [params.q] - từ khóa tìm theo họ tên / mã nhân viên / phòng ban
 */
export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);
  if (params.action) query.append('action', params.action);
  if (params.resourceType) query.append('resourceType', params.resourceType);
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  if (params.q) query.append('q', params.q);

  const res = await apiRequest(`/audit-logs?${query.toString()}`, {
    headers: getAuthHeaders(),
  });
  return res; // { data: items[], pagination: {...} }
}

// Bắt đầu backup thủ công — chạy NỀN trên server, trả ngay trạng thái job (đang chạy thì trả job hiện tại).
// Theo dõi tiến độ bằng fetchBackupStatus (xem backup-job.store.js).
export async function startBackup() {
  const res = await apiRequest('/backups', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.data;
}

/** Trạng thái job backup thủ công: { state: idle|running|done|error, phase, percent, message, result } */
export async function fetchBackupStatus() {
  const res = await apiRequest('/backups/status', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

/** Danh sách các bản backup hiện có trên Google Drive (tối đa `maxKept` bản, mới nhất trước). */
export async function fetchBackups() {
  const res = await apiRequest('/backups', {
    headers: getAuthHeaders(),
  });
  return { items: res.data ?? [], maxKept: res.maxKept };
}

/**
 * Tải 1 bản backup cụ thể (.gz) về máy admin — dùng làm bước trung gian
 * trước khi khôi phục (tải về máy rồi mới upload lại qua form khôi phục),
 * vì API /restore chỉ nhận file upload trực tiếp, không nhận fileId trên Drive.
 * Không dùng apiRequest() (parse JSON) vì response là file nhị phân.
 */
export async function downloadBackupFile(fileId, fileName) {
  const headers = getAuthHeaders();
  delete headers['Content-Type'];

  const res = await fetch(
    `${API_BASE_URL}/backups/${fileId}/download?fileName=${encodeURIComponent(fileName || 'backup.gz')}`,
    { method: 'GET', credentials: 'include', headers },
  );

  if (!res.ok) {
    let message = 'Tải bản sao lưu thất bại';
    try {
      const errBody = await res.json();
      message = errBody?.message || message;
    } catch {
      // response không phải JSON
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'backup.gz';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Khôi phục dữ liệu từ 1 file backup (.gz) chọn từ máy admin — dùng
 * XMLHttpRequest (không phải apiRequest/fetch) vì cần theo dõi % tải lên
 * THẬT qua xhr.upload.onprogress (fetch không hỗ trợ progress upload).
 *
 * Có 2 giai đoạn tách biệt, callback onPhaseChange báo hiệu chuyển pha:
 * - 'uploading': đang gửi file lên server — có % thật.
 * - 'processing': file đã gửi xong, server đang chạy mongorestore --drop —
 *   KHÔNG có tín hiệu tiến trình nào từ backend (chạy đồng bộ, không dùng
 *   WebSocket/SSE), nên không thể hiện % thật ở bước này.
 *
 * Trả về { promise, cancel } thay vì chỉ Promise, để nơi gọi có thể chủ
 * động huỷ khi phát hiện mất mạng (vd sự kiện 'offline' của trình duyệt).
 * LƯU Ý: cancel() chỉ thực sự "huỷ" được nếu đang ở giai đoạn 'uploading'
 * (server chưa nhận đủ file, chưa bắt đầu restore). Nếu đã sang giai đoạn
 * 'processing', gọi cancel() chỉ dừng việc CLIENT chờ phản hồi — tiến trình
 * mongorestore ở server vẫn tiếp tục chạy độc lập, không có cách nào dừng
 * nó từ phía trình duyệt.
 */
export function restoreBackupFile(file, { onUploadProgress, onPhaseChange } = {}) {
  const xhr = new XMLHttpRequest();

  const promise = new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('backupFile', file);
    formData.append('confirm', 'RESTORE');

    const headers = getAuthHeaders();
    delete headers['Content-Type']; // để browser tự set boundary cho multipart/form-data

    xhr.open('POST', `${API_BASE_URL}/backups/restore`, true);
    xhr.withCredentials = true;
    Object.entries(headers).forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    // Toàn bộ file đã rời trình duyệt -> server bắt đầu xử lý (mongorestore).
    // Từ đây KHÔNG còn ý nghĩa "huỷ an toàn" nữa.
    xhr.upload.onload = () => {
      onPhaseChange?.('processing');
    };

    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // response không phải JSON hợp lệ
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.success) {
        resolve(body);
      } else {
        const err = new Error(body.message || `Khôi phục thất bại (mã lỗi HTTP ${xhr.status}).`);
        err.code = body.code || 'RESTORE_FAILED';
        reject(err);
      }
    };

    xhr.onerror = () => {
      const err = new Error(
        'Mất kết nối tới máy chủ trong khi khôi phục (lỗi mạng hoặc server không phản hồi).',
      );
      err.code = 'NETWORK_ERROR';
      reject(err);
    };

    xhr.onabort = () => {
      const err = new Error('Đã huỷ quá trình khôi phục.');
      err.code = 'ABORTED';
      reject(err);
    };

    xhr.send(formData);
  });

  return { promise, cancel: () => xhr.abort() };
}

/**
 * BƯỚC 1/2 — Xem trước import Excel: gửi file lên, nhận về danh sách từng
 * dòng đã phân loại (create/reuse/update/conflict/error), CHƯA ghi gì vào DB.
 * Trả về { total, toCreate, toReuse, toUpdate, conflicts, errors, rowsWithWarnings,
 * departments, departmentsNeedingCode, rows }. `departments` là danh sách phòng ban (chính + kiêm nhiệm)
 * được nhắc tới trong file, kèm cờ needsCode / isNew để admin điền mã trước khi xác nhận.
 * Xem server/src/services/user.service.js#previewEmployeesFromExcelFile để
 * biết đầy đủ ý nghĩa từng field trong mỗi phần tử của `rows`.
 */
export async function previewImportEmployeesExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = getAuthHeaders();
  delete headers['Content-Type']; // để browser tự set boundary cho multipart/form-data

  const res = await apiRequest('/users/import/preview', {
    method: 'POST',
    headers,
    body: formData,
  });
  return res.data;
}

/**
 * BƯỚC 2/2 — Xác nhận import: gửi lại đúng mảng `rows` nhận được từ bước
 * preview (đã phân loại action cho từng dòng) để ghi thật vào DB. Các dòng
 * action 'conflict'/'error' sẽ bị server bỏ qua.
 * departmentCodes: { [key]: mã } — mã phòng ban admin nhập ở bước preview cho các phòng
 * có `needsCode` (key lấy từ `departments[].key` của kết quả preview). Phòng đã có mã thì bỏ qua.
 * Trả về { total, created, updated, reused, failed, results: [...] }.
 */
export async function confirmImportEmployeesExcel(rows, departmentCodes = {}) {
  const res = await apiRequest('/users/import/confirm', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ rows, departmentCodes }),
  });
  return res.data;
}

/**
 * Sửa phòng ban chính / phòng kiêm nhiệm của 1 nhân viên (chỉ gửi field muốn đổi).
 * payload: { departmentId?: string, extraDepartmentIds?: string[] }
 * Trả về { userId, fullname, departmentId, departmentName, departmentCode, extraDepartments: [{ _id, name, code }] }.
 */
export async function updateEmployeeDepartments(userId, payload) {
  const res = await apiRequest(`/users/${userId}/departments`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

// Xuất kết quả import ra CSV (UTF-8 BOM) để admin tải về — dùng gửi
// username/mật khẩu tạm cho hàng nghìn nhân viên cùng lúc.
export function downloadImportResultsCsv(results) {
  const header = ['Dòng', 'Mã NV', 'Username', 'Họ tên', 'Phòng ban', 'Trạng thái', 'Mật khẩu tạm', 'Ghi chú'];
  const statusLabel = { created: 'Tạo mới', reused: 'Tái sử dụng', updated: 'Cập nhật', error: 'Lỗi' };
  const rows = results.map((r) => [
    r.row,
    r.employeeCode,
    r.username,
    r.fullname,
    r.department,
    statusLabel[r.status] || r.status,
    r.tempPassword,
    r.message,
  ]);
  const csvLines = [header, ...rows].map((row) =>
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM để Excel đọc đúng UTF-8

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ket-qua-import-nhan-vien-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Xuất một bảng dữ liệu bất kỳ (mảng object) ra CSV (UTF-8 BOM) — dùng chung
 * cho các nút "Xuất danh sách" trong dashboard admin, khác với
 * downloadImportResultsCsv (chỉ dành riêng cho kết quả import Excel).
 *
 * @param {{ label: string, key: string }[]} columns
 * @param {object[]} rows
 * @param {string} filenamePrefix
 */
export function downloadTableCsv(columns, rows, filenamePrefix) {
  const header = columns.map((c) => c.label);
  const dataRows = rows.map((row) => columns.map((c) => row[c.key]));
  const csvLines = [header, ...dataRows].map((row) =>
    row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM để Excel đọc đúng UTF-8

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/**
 * MỚI: Xuất danh sách tài khoản NHÂN VIÊN (role candidate) ra file Excel kèm
 * username + mật khẩu tạm — khác downloadTableCsv() (không có mật khẩu).
 * Backend sẽ RESET mật khẩu tạm cho toàn bộ tài khoản candidate đang hoạt
 * động trước khi trả file, nên không dùng apiRequest() (vốn parse JSON) mà
 * tự fetch để nhận blob nhị phân — nhưng vẫn dùng chung API_BASE_URL và
 * cùng cơ chế Bearer token với apiRequest() để đồng nhất.
 *
 * Không tự động refresh token khi 401 hết hạn (khác apiRequest) — vì đây là
 * action hiếm khi dùng, không đáng thêm độ phức tạp retry cho 1 lần bấm nút;
 * nếu gặp phiên hết hạn, báo lỗi rõ ràng để admin tự thao tác lại (lúc đó
 * lần gọi apiRequest tiếp theo trong app sẽ tự refresh như bình thường).
 */
export async function exportCandidateCredentialsExcel() {
  const headers = getAuthHeaders();
  delete headers['Content-Type'];

  const res = await fetch(`${API_BASE_URL}/users/export-credentials`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let message = 'Xuất danh sách thất bại';
    let code;
    try {
      const errBody = await res.json();
      message = errBody?.message || message;
      code = errBody?.code;
    } catch {
      // response không phải JSON
    }
    if (res.status === 401 && code === 'AUTH_ACCESS_EXPIRED') {
      message = 'Phiên đăng nhập đã hết hạn, vui lòng thử lại thao tác này lần nữa.';
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `danh-sach-nhan-vien-${Date.now()}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Tải về thông tin đăng nhập của MỘT tài khoản (sau khi tạo mới hoặc reset
 * mật khẩu) dưới dạng file text định dạng rõ ràng, dễ đọc — khác với CSV
 * hàng loạt ở trên, dùng cho tempPasswordModal khi admin xử lý từng tài
 * khoản một. Vì mật khẩu tạm chỉ được server trả về đúng 1 lần và không lưu
 * lại được, nút này chỉ khả dụng ngay sau khi tạo/reset — không thể tải lại
 * sau khi đã đóng modal.
 *
 * @param {{ title: string, username: string, password: string }} info
 */
export function downloadSingleAccountCredential({ title, username, password }) {
  const now = new Date();
  const formattedDate = now.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const line = '='.repeat(48);
  const content = [
    line,
    '  THÔNG TIN TÀI KHOẢN — HỆ THỐNG THI NỘI BỘ Z176',
    line,
    '',
    `  ${title}`,
    '',
    `  Tên đăng nhập   : ${username}`,
    `  Mật khẩu tạm    : ${password}`,
    `  Thời gian cấp   : ${formattedDate}`,
    '',
    line,
    '  LƯU Ý',
    line,
    '  - Mật khẩu tạm này chỉ hiển thị và tải về được DUY NHẤT 1 LẦN.',
    '  - Vui lòng gửi lại cho người dùng và không chia sẻ cho người khác.',
    '  - Người dùng sẽ bắt buộc phải đổi mật khẩu ngay lần đăng nhập đầu tiên.',
    '',
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tai-khoan-${username || 'nguoi-dung'}-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}