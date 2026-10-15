import mongoose from 'mongoose';

/**
 * Cấu hình Trợ lý AI (singleton: luôn chỉ có 1 bản ghi, key = 'default').
 * Admin nhập base URL / API key / model / prompt trên giao diện → đổi được ngay, không cần khởi động lại server.
 * baseUrl dùng chuẩn OpenAI-compatible (Gemini, Groq, OpenRouter, model chạy nội bộ...) nên đổi nhà cung cấp chỉ là đổi cấu hình.
 * Chỉ dùng DỮ LIỆU MOCK với dịch vụ AI bên ngoài (xem AGENT_RULES.md mục 1, 2).
 */
const aiSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },
    isEnabled: { type: Boolean, default: false },
    baseUrl: {
      type: String,
      trim: true,
      default: 'https://generativelanguage.googleapis.com/v1beta/openai',
    },
    apiKey: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: 'gemini-flash-latest' },
    /** Prompt hệ thống do admin viết: vai trò trợ lý, hướng dẫn dùng hệ thống, cách ôn tập, giọng điệu... */
    systemPrompt: { type: String, default: '' },
    /** Giới hạn tổng số ký tự tài liệu đưa vào prompt (tránh vượt context / hết quota) */
    maxDocChars: { type: Number, default: 60000, min: 5000, max: 400000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const AiSetting = mongoose.model('AiSetting', aiSettingSchema);