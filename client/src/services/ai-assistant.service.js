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