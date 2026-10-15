import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { askAiAssistant } from '../../services/ai-assistant.service';

const SUGGESTIONS = [
  'Tóm tắt các kiến thức chính trong tài liệu của tôi',
  'Làm sao để ôn tập hiệu quả trước kỳ thi?',
  'Chế độ "Kiểm tra ngay" khác "Làm hết rồi chấm" thế nào?',
  'Tôi nên lưu ý gì khi làm bài thi trực tuyến?',
];

// Hiển thị **đậm** của AI thành chữ đậm thật (không cần thư viện markdown).
const renderBold = (text) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

/**
 * Khung hỏi đáp với Trợ lý AI (thí sinh).
 * Server tự lọc tài liệu theo phòng ban của người đăng nhập — client không gửi phòng ban/tài liệu.
 */
export const AiAssistantChat = ({ currentTopicId }) => {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [docInfo, setDocInfo] = useState(null); // { used, skipped } của câu trả lời gần nhất
  const listRef = useRef(null);

  // Chỉ cuộn bên trong khung chat, không kéo cả trang
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Gọi AI với danh sách tin nhắn đã có (dùng chung cho gửi mới và "Hỏi lại" để không trùng tin của người dùng)
  const ask = async (next) => {
    setError('');
    setSending(true);
    try {
      const data = await askAiAssistant(next, currentTopicId);
      setMessages([...next, { role: 'assistant', content: data.reply }]);
      setDocInfo({ used: data.usedDocuments?.length ?? 0, skipped: data.skippedCount ?? 0 });
    } catch (err) {
      setError(err?.message || 'Không thể kết nối Trợ lý AI.');
    } finally {
      setSending(false);
    }
  };

  const send = (text) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    ask(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-xl lg:text-lg font-bold text-[#0F172A] flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#008BC5]" />
          Hỏi đáp cùng Trợ lý AI
        </h2>
        <p className="text-base lg:text-sm text-slate-600 mt-0.5">
          Trợ lý chỉ dựa trên tài liệu chung và tài liệu của phòng ban bạn. Câu trả lời có thể chưa chính
          xác, hãy đối chiếu với tài liệu gốc.
        </p>
      </div>

      <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
        {/* Chiều cao cố định + chừa sẵn chỗ thanh cuộn: khung không co giãn nên trang không bị giật */}
        <div
          ref={listRef}
          className="h-[55dvh] min-h-72 lg:h-[28rem] overflow-y-auto overscroll-contain space-y-4 p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 [scrollbar-gutter:stable]"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#EAF6FF] flex items-center justify-center">
                <Bot className="w-6 h-6 text-[#008BC5]" />
              </div>
              <p className="text-base lg:text-sm text-slate-600">Bạn có thể hỏi thử:</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={sending}
                    className="px-4 py-3 text-base lg:text-sm text-left rounded-lg border border-slate-200 bg-white hover:border-[#008BC5]/50 hover:bg-[#EAF6FF] text-[#0F172A] transition-colors min-touch-target"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="hidden sm:flex w-8 h-8 rounded-full bg-[#EAF6FF] items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-[#008BC5]" />
                </div>
              )}
              <div
                className={`max-w-[92%] sm:max-w-[85%] lg:max-w-[70%] px-4 py-2.5 rounded-2xl text-lg lg:text-base leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-[#008BC5] text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-[#0F172A] rounded-bl-sm'
                }`}
              >
                {m.role === 'user' ? m.content : renderBold(m.content)}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-base lg:text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Trợ lý đang trả lời...
            </div>
          )}
        </div>

        {docInfo && messages.length > 0 && (
          <p className="text-sm lg:text-xs text-slate-600">
            Dựa trên {docInfo.used} tài liệu
            {docInfo.skipped > 0 ? ` (${docInfo.skipped} tài liệu chưa đọc được)` : ''}.
          </p>
        )}

        {error && (
          <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-[#0F172A] text-base lg:text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => ask(messages)}
              disabled={sending}
              className="px-3 flex items-center gap-1.5 font-semibold text-[#C53030] border border-[#C53030]/40 bg-white rounded-lg hover:bg-[#FEECEC] disabled:opacity-50 min-touch-target transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Hỏi lại</span>
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Nhập câu hỏi của bạn..."
            className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40"
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="px-4 py-3 flex items-center gap-2 font-semibold bg-[#008BC5] hover:bg-[#0078AA] disabled:bg-slate-300 text-white rounded-xl min-touch-target transition-colors"
          >
            <Send className="w-5 h-5" />
            <span>Gửi</span>
          </button>
        </div>
        <p className="hidden lg:block text-xs text-slate-500">Enter để gửi, Shift+Enter xuống dòng.</p>
      </div>
    </div>
  );
};