import { useSyncExternalStore } from 'react';
import { startBackup as apiStart, fetchBackupStatus } from './admin.service';

// Tiến độ backup thủ công nằm NGOÀI component (cùng mẫu question-generation.store.js):
// đổi tab / unmount thì vẫn tiếp tục hỏi tiến độ, quay lại vẫn thấy. Job thật chạy trên server nên F5 cũng không mất (resumeBackup).
const IDLE = { state: 'idle', phase: null, percent: 0, message: '', result: null };
const POLL_MS = 1000;
const MAX_POLL_FAILS = 5;

let state = IDLE;
let polling = false;
const listeners = new Set();
const set = (next) => {
  state = next;
  listeners.forEach((l) => l());
};

export const isBackupRunning = () => state.state === 'running';

// Đang sao lưu mà F5 / đóng tab -> trình duyệt hiện hộp cảnh báo (nội dung do trình duyệt quyết định)
window.addEventListener('beforeunload', (e) => {
  if (!isBackupRunning()) return;
  e.preventDefault();
  e.returnValue = '';
});

const poll = async () => {
  if (polling) return;
  polling = true;
  let fails = 0;
  while (isBackupRunning()) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      set(await fetchBackupStatus());
      fails = 0;
    } catch {
      // Rớt mạng thoáng qua thì thử lại; mất hẳn thì dừng và báo, tránh quay mãi
      if (++fails >= MAX_POLL_FAILS) {
        set({ ...IDLE, state: 'error', message: 'Mất kết nối tới máy chủ. Backup (nếu đang chạy) vẫn tiếp tục trên máy chủ, hãy tải lại trang để xem kết quả.' });
      }
    }
  }
  polling = false;
};

export async function startBackup() {
  if (isBackupRunning()) return;
  set({ ...IDLE, state: 'running', phase: 'dump' });
  try {
    set(await apiStart());
  } catch (err) {
    set({ ...IDLE, state: 'error', message: err?.message || 'Không thể bắt đầu sao lưu.' });
    return;
  }
  poll();
}

// Gọi 1 lần khi vào trang quản trị: nếu server đang có backup chạy (vd. vừa F5) thì hiện lại tiến độ.
// Kết quả done/error cũ của server không hiện lại để khỏi báo lại mỗi lần tải trang.
export async function resumeBackup() {
  if (state.state !== 'idle') return;
  try {
    const s = await fetchBackupStatus();
    if (s.state === 'running') {
      set(s);
      poll();
    }
  } catch {
    /* không lấy được trạng thái: coi như không có backup đang chạy */
  }
}

export const dismissBackup = () => !isBackupRunning() && set(IDLE);

export const useBackupJob = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => state,
  );