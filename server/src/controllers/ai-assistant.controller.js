/**
 * Controller Trợ lý AI: Admin cấu hình API ngoài, Thí sinh hỏi đáp theo tài liệu của phòng ban mình.
 */

import * as aiService from '../services/ai-assistant.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { writeAudit } from '../services/audit.service.js';

// Admin: xem cấu hình (API key đã được che)
export const getSettings = asyncHandler(async (_req, res) => {
  const data = await aiService.getAiSettings();
  res.json({ success: true, message: 'OK', code: 'AI_SETTINGS_OK', data });
});

// Admin: cập nhật cấu hình (không ghi key/prompt vào nhật ký)
export const updateSettings = asyncHandler(async (req, res) => {
  const data = await aiService.updateAiSettings(req.body ?? {}, req.auth.userId);
  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_AI_SETTINGS',
    resourceType: 'AiSetting',
    metadata: { detail: `Cập nhật cấu hình Trợ lý AI (model: ${data.model}, bật: ${data.isEnabled})` },
    ipAddress: req.ip,
  });
  res.json({ success: true, message: 'Đã lưu cấu hình Trợ lý AI', code: 'AI_SETTINGS_UPDATED', data });
});

// Thí sinh: trợ lý có đang bật không
export const status = asyncHandler(async (_req, res) => {
  const data = await aiService.getAiStatus();
  res.json({ success: true, message: 'OK', code: 'AI_STATUS_OK', data });
});

// Thí sinh: hỏi đáp
export const chat = asyncHandler(async (req, res) => {
  const data = await aiService.chatWithAssistant(
    req.auth.userId,
    req.body?.messages,
    req.body?.currentTopicId, // chỉ để ưu tiên thứ tự tài liệu, không ảnh hưởng quyền truy cập
  );
  res.json({ success: true, message: 'OK', code: 'AI_CHAT_OK', data });
});