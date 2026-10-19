import { useState, useEffect } from 'react';
import { Bot, Loader2, AlertTriangle, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { fetchAiSettings, saveAiSettings } from '../../services/ai-assistant.service';

// Gợi ý nhanh: điền sẵn base URL + model (đều theo chuẩn OpenAI-compatible). Tên model có thể đổi theo nhà cung cấp.
const PRESETS = [
  { label: 'Gemini (Google AI Studio)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
];

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40';

export const AiSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [meta, setMeta] = useState({ hasApiKey: false, apiKeyMasked: '', defaultPrompt: '' });
  const [form, setForm] = useState({
    isEnabled: false,
    baseUrl: '',
    model: '',
    apiKey: '', // chỉ gửi khi admin nhập key mới
    systemPrompt: '',
    maxDocChars: 60000,
  });

  const applyServer = (s) => {
    setMeta({ hasApiKey: s.hasApiKey, apiKeyMasked: s.apiKeyMasked, defaultPrompt: s.defaultPrompt });
    setForm({
      isEnabled: s.isEnabled,
      baseUrl: s.baseUrl,
      model: s.model,
      apiKey: '',
      systemPrompt: s.systemPrompt || '',
      maxDocChars: s.maxDocChars,
    });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAiSettings()
      .then((s) => !cancelled && applyServer(s))
      .catch((err) => !cancelled && setError(err?.message || 'Không tải được cấu hình.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const s = await saveAiSettings({ ...form, maxDocChars: Number(form.maxDocChars) });
      applyServer(s);
      setSaved(true);
    } catch (err) {
      setError(err?.message || 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Đang tải cấu hình...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#008BC5]" />
          Trợ lý AI cho thí sinh
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Thí sinh hỏi đáp dựa trên tài liệu chung và tài liệu phòng ban của mình. Đổi key/model có hiệu lực ngay, không cần khởi động lại server.
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg flex items-start gap-2 text-sm text-[#0F172A]">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#F6AD37]" />
          <span>
            Nội dung tài liệu sẽ được gửi tới dịch vụ AI bên ngoài. Bản demo chỉ dùng tài liệu mẫu, không dùng tài liệu nội bộ thật.
            Với free tier, nhà cung cấp có thể dùng dữ liệu để cải thiện mô hình.
          </span>
        </div>

        <label className="flex items-center gap-3 min-touch-target">
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => set({ isEnabled: e.target.checked })}
            className="w-5 h-5"
          />
          <span className="font-semibold text-[#0F172A]">Bật Trợ lý AI cho thí sinh</span>
        </label>

        <div>
          <div className="text-sm font-semibold text-[#0F172A] mb-2">Điền nhanh theo nhà cung cấp</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ baseUrl: p.baseUrl, model: p.model })}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 min-touch-target"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-semibold text-[#0F172A] mb-1">Base URL (chuẩn OpenAI-compatible)</span>
            <input className={inputCls} value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-[#0F172A] mb-1">Tên model</span>
            <input className={inputCls} value={form.model} onChange={(e) => set({ model: e.target.value })} />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-semibold text-[#0F172A] mb-1">API key</span>
          <input
            type="password"
            autoComplete="off"
            className={inputCls}
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={meta.hasApiKey ? `Đang dùng key ${meta.apiKeyMasked} — để trống để giữ nguyên` : 'Dán API key vào đây'}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-[#0F172A] mb-1">
            Giới hạn ký tự tài liệu đưa vào AI (5.000 – 400.000)
          </span>
          <input
            type="number"
            min={5000}
            max={400000}
            step={5000}
            className={inputCls}
            value={form.maxDocChars}
            onChange={(e) => set({ maxDocChars: e.target.value })}
          />
        </label>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-[#0F172A]">Prompt hướng dẫn trợ lý</span>
            <button
              type="button"
              onClick={() => set({ systemPrompt: meta.defaultPrompt })}
              className="text-sm text-[#008BC5] font-semibold"
            >
              Điền prompt mặc định
            </button>
          </div>
          <textarea
            rows={8}
            maxLength={8000}
            className={inputCls}
            value={form.systemPrompt}
            onChange={(e) => set({ systemPrompt: e.target.value })}
            placeholder="Để trống = dùng prompt mặc định. Có thể viết thêm: cách dùng hệ thống, mẹo làm bài, giọng điệu trả lời..."
          />
          <p className="text-xs text-slate-500 mt-1">
            Server luôn tự thêm các quy tắc cố định (chỉ trả lời theo tài liệu được phép, không lộ đáp án kỳ thi chính thức) nên prompt này không thể gỡ bỏ chúng.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div role="status" className="p-3 bg-[#F0FDF4] border border-[#22C55E]/40 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
            <CheckCircle className="w-4 h-4 shrink-0 text-[#22C55E]" />
            <span>Đã lưu cấu hình.</span>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-6 py-3 bg-[#008BC5] disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu cấu hình
        </button>
      </div>
    </div>
  );
};