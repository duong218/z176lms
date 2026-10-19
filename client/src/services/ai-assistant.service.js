import { apiRequest } from './api';
import { getAuthHeaders } from './auth.service';

// === ADMIN — cấu hình Trợ lý AI ===

export async function fetchAiSettings() {
  const res = await apiRequest('/ai-assistant/settings', { headers: getAuthHeaders() });
  return res.data;
}

export async function saveAiSettings(payload) {
  const res = await apiRequest('/ai-assistant/settings', {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

// === THÍ SINH / NGƯỜI DUYỆT ĐỀ — hỏi đáp ===

export async function fetchAiStatus() {
  const res = await apiRequest('/ai-assistant/status', { headers: getAuthHeaders() });
  return res.data; // { enabled } — dùng chung cho thí sinh và Người duyệt đề
}

export async function askAiAssistant(messages, currentTopicId) {
  const res = await apiRequest('/ai-assistant/chat', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ messages, currentTopicId }),
  });
  return res.data; // { reply, usedDocuments, skippedCount }
}

// Người duyệt đề: hỏi đáp trên số liệu báo cáo toàn công ty. Server tự gom số liệu, client chỉ gửi hội thoại.
export async function askLeaderAssistant(messages) {
  const res = await apiRequest('/ai-assistant/leader-chat', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ messages }),
  });
  return res.data; // { reply }
}

// === NGƯỜI TẠO ĐỀ — AI soạn câu hỏi từ tài liệu ôn tập, xuất file Word/Excel đúng khuôn import ===
// Chủ đề / phạm vi / phòng ban / độ khó do người dùng chọn; server tự dựng file nên không sai cột, sai khuôn.
export async function generateQuestionFile(payload) {
  const res = await apiRequest('/ai-assistant/generate-questions', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data; // { fileName, mimeType, fileBase64, count, requested, rejected, format, preview }
}

// Tải file base64 (do server trả về) xuống máy
export function downloadBase64File({ fileBase64, mimeType, fileName }) {
  const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // thu hồi ngay có thể làm trình duyệt hủy tải
}