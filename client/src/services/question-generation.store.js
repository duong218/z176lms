import { useSyncExternalStore } from 'react';
import { generateQuestionFile } from './ai-assistant.service';

// Trạng thái tạo câu hỏi nằm NGOÀI component → đổi tab (component unmount) request vẫn chạy, kết quả không mất.
// Server chạy song song GEN_CONCURRENCY=3 phòng ban, mỗi lượt ~45s → ước tính theo số "đợt".
const SECONDS_PER_WAVE = 45;
const CONCURRENCY = 3;
const MAX_HISTORY = 5;

const EMPTY = { generating: false, startedAt: 0, estimateSec: 0, total: 0, error: '', results: [], unseen: false };
let state = EMPTY;
let owner = ''; // username chủ của kết quả đang giữ
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

// Đang tạo hoặc có file chưa tải → F5 / đóng tab / đăng xuất đều phải cảnh báo
export const hasPending = () => state.generating || state.results.some((r) => !r.downloaded);
window.addEventListener('beforeunload', (e) => hasPending() && e.preventDefault());

export const markDownloaded = (id) => set({ results: state.results.map((r) => (r.id === id ? { ...r, downloaded: true } : r)) });
export const resetGeneration = () => set({ ...EMPTY }); // ponytail: request đang bay (nếu có) vẫn ghi kết quả khi xong; chấp nhận vì server không hỗ trợ hủy
// Đăng nhập tài khoản KHÁC trên cùng trình duyệt → xóa kết quả của người trước (cùng tài khoản đăng nhập lại thì giữ)
export const claimOwner = (username) => {
  if (username && owner && owner !== username) resetGeneration();
  if (username) owner = username;
};

export async function startGeneration(payload, { docTitle, deptCount, count }) {
  if (state.generating) return;
  const waves = Math.ceil(Math.max(deptCount, 1) / CONCURRENCY);
  set({ generating: true, startedAt: Date.now(), estimateSec: waves * SECONDS_PER_WAVE, total: count * Math.max(deptCount, 1), error: '' });
  try {
    const data = await generateQuestionFile(payload);
    set({ results: [{ ...data, id: Date.now(), docTitle }, ...state.results].slice(0, MAX_HISTORY), unseen: true });
  } catch (err) {
    set({ error: err?.message || 'Không thể tạo câu hỏi, vui lòng thử lại.', unseen: true });
  } finally {
    set({ generating: false });
  }
}

export const markSeen = () => state.unseen && set({ unseen: false });
export const clearGenerationError = () => state.error && set({ error: '' });

export const useGeneration = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => state,
  );