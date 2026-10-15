import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, AlertCircle, RotateCcw, X, Mic, Download } from 'lucide-react';
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

// Nhập bằng giọng nói: API có sẵn của trình duyệt (Chrome/Edge/Android). Không hỗ trợ thì ẩn nút micro.
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const MIC_ERRORS = {
  'not-allowed': 'Bạn chưa cho phép dùng micro. Hãy bấm vào biểu tượng ổ khóa trên thanh địa chỉ để cho phép.',
  'no-speech': 'Không nghe thấy giọng nói, bạn thử lại nhé.',
};

// AI hay ghi nhầm nhãn khối (```json thay vì ```mindmap) nên nhận cả hai: khối json bắt đầu bằng {"name" cũng là sơ đồ.
// Khối ```mermaid: AI viết thẳng cú pháp Mermaid cho mọi biểu đồ khác (cột, đường, tròn, quy trình, gantt...).
const isMindmap = (lang, code) => lang === 'mindmap' || lang === 'mermaid' || (['json', ''].includes(lang) && /^\s*\{\s*"name"/.test(code));
const findMindmap = (text) => {
  for (const m of text.matchAll(/```(\w*)\n?([\s\S]*?)```/g)) if (isMindmap(m[1], m[2])) return m[2];
  return null;
};

// AI trả cây JSON {name, children:[...]}; client tự dựng cú pháp Mermaid nên AI không thể viết sai thụt lề/ký tự đặc biệt.
const clean = (t) => String(t ?? '').replace(/[()[\]{}"`:;#<>]/g, ' ').replace(/\s+/g, ' ').trim() || '...';
const toMermaid = (json) => {
  if (!/^\s*\{/.test(json)) return json.trim(); // cú pháp Mermaid thô (biểu đồ khác)
  const tree = JSON.parse(json);
  const lines = (n, d) => [`${'  '.repeat(d)}${clean(n?.name)}`, ...(n?.children ?? []).flatMap((c) => lines(c, d + 1))];
  return ['mindmap', `  root((${clean(tree.name)}))`, ...(tree.children ?? []).flatMap((c) => lines(c, 2))].join('\n');
};

// Tách khối ``` ``` : khối mindmap -> nút mở sơ đồ; khối khác -> chữ đơn cách (giữ nguyên cây ├──); còn lại -> chữ đậm.
const renderContent = (text, onShow) => {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g); // [chữ, lang, code, chữ, lang, code, ...]
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(<span key={i}>{renderBold(parts[i])}</span>);
    if (i + 2 >= parts.length) break;
    const [lang, code] = [parts[i + 1], parts[i + 2]];
    out.push(
      isMindmap(lang, code) ? (
        <button
          key={i + 1}
          onClick={() => onShow(code)}
          className="block my-2 px-4 py-2 font-semibold text-[#008BC5] border border-[#008BC5]/40 rounded-lg hover:bg-[#EAF6FF] min-touch-target"
        >
          Xem sơ đồ / biểu đồ
        </button>
      ) : (
        <pre key={i + 1} className="my-2 p-3 bg-slate-100 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">
          {code}
        </pre>
      ),
    );
  }
  return out;
};

// Màu/cỡ chữ đậm, tương phản cao (WCAG AA với chữ trắng) cho người dùng 25-55 tuổi; mặc định của Mermaid là pastel rất nhạt.
const COLORS = ['#1D4ED8', '#C2410C', '#15803D', '#7E22CE', '#B91C1C', '#0E7490', '#A16207', '#BE185D', '#334155', '#4D7C0F', '#0369A1', '#9A3412'];
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict', // nội dung do AI sinh ra
  suppressErrorRendering: true,
  theme: 'base',
  themeVariables: {
    fontSize: '16px',
    primaryColor: '#DBEAFE',
    primaryBorderColor: '#1D4ED8',
    primaryTextColor: '#0F172A',
    lineColor: '#1E293B',
    ...Object.fromEntries(COLORS.map((c, i) => [`pie${i + 1}`, c])),
    pieOpacity: '1',
    pieSectionTextColor: '#FFFFFF',
    pieSectionTextSize: '24px',
    pieTitleTextSize: '26px',
    pieTitleTextColor: '#0F172A',
    pieLegendTextSize: '22px',
    pieLegendTextColor: '#0F172A',
    pieStrokeColor: '#FFFFFF',
    pieStrokeWidth: '3px',
    pieOuterStrokeColor: '#FFFFFF',
    xyChart: {
      backgroundColor: '#FFFFFF',
      titleColor: '#0F172A',
      xAxisLabelColor: '#0F172A',
      xAxisTitleColor: '#0F172A',
      xAxisTickColor: '#0F172A',
      xAxisLineColor: '#0F172A',
      yAxisLabelColor: '#0F172A',
      yAxisTitleColor: '#0F172A',
      yAxisTickColor: '#0F172A',
      yAxisLineColor: '#0F172A',
      dataLabelColor: '#FFFFFF',
      plotColorPalette: COLORS.join(','),
    },
  },
  // Chart hẹp lại để khi co vào khung chat chữ không bị thu nhỏ; hiện số trên cột
  xyChart: {
    width: 560,
    height: 420,
    titleFontSize: 22,
    showDataLabel: true,
    xAxis: { labelFontSize: 16, titleFontSize: 17 },
    yAxis: { labelFontSize: 16, titleFontSize: 17 },
  },
};

// Vẽ sơ đồ Mermaid thành SVG. Thư viện nặng nên chỉ tải khi có sơ đồ đầu tiên.
// securityLevel 'strict' vì nội dung do AI sinh ra.
const DiagramPanel = ({ code, onClose }) => {
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    panelRef.current?.scrollIntoView({ block: 'nearest' }); // trên mobile panel nằm trên khung chat
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // Sơ đồ tư duy rộng nên bị thu nhỏ khi vào khung chat -> dùng chữ to hơn để vẫn đọc rõ
        const fontSize = /^\s*\{/.test(code) ? '28px' : '16px';
        mermaid.initialize({ ...MERMAID_CONFIG, themeVariables: { ...MERMAID_CONFIG.themeVariables, fontSize } });
        const { svg } = await mermaid.render(`mm-${Date.now()}`, toMermaid(code));
        if (!cancelled && boxRef.current) boxRef.current.innerHTML = svg;
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Tải sơ đồ về máy dạng PNG (nền trắng, nét 2x). Trình duyệt không cho vẽ canvas (vd Safari) thì tải SVG.
  const download = () => {
    const svg = boxRef.current?.querySelector('svg');
    if (!svg) return;
    const [, , w, h] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const save = (href, ext) => Object.assign(document.createElement('a'), { href, download: `so-do-tu-duy.${ext}` }).click();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        save(c.toDataURL('image/png'), 'png');
      } catch {
        save(url, 'svg');
      }
    };
    img.onerror = () => save(url, 'svg');
    img.src = url;
  };

  return (
    <div
      ref={panelRef}
      className="order-first lg:order-last mb-3 lg:mb-0 h-[50dvh] lg:h-[28rem] flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <span className="font-semibold text-[#0F172A] mr-auto">Sơ đồ / biểu đồ</span>
        {!failed && (
          <button
            onClick={download}
            aria-label="Tải sơ đồ xuống"
            title="Tải sơ đồ xuống"
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 min-touch-target flex items-center justify-center"
          >
            <Download className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Đóng sơ đồ"
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 min-touch-target flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {failed ? (
          <div className="space-y-2 text-slate-600">
            <p>Không vẽ được sơ đồ. Bạn bấm "Hỏi lại" hoặc nhờ trợ lý viết lại sơ đồ nhé.</p>
            <pre className="p-3 bg-slate-100 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">{code}</pre>
          </div>
        ) : (
          // Mobile: giữ sơ đồ đủ rộng để đọc, vuốt ngang để xem; desktop: vừa khung
          <div ref={boxRef} className="[&_svg]:h-auto [&_svg]:min-w-[640px] lg:[&_svg]:min-w-0 [&_.line-plot-0_path]:[stroke-width:4px] [&_.line-plot-1_path]:[stroke-width:4px] [&_.line-plot-2_path]:[stroke-width:4px]" />
        )}
      </div>
    </div>
  );
};

/**
 * Khung hỏi đáp với Trợ lý AI (thí sinh).
 * Server tự lọc tài liệu theo phòng ban của người đăng nhập — client không gửi phòng ban/tài liệu.
 */
export const AiAssistantChat = ({ currentTopicId, active = true }) => {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [diagram, setDiagram] = useState(null); // JSON sơ đồ đang xem ở panel
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const [docInfo, setDocInfo] = useState(null); // { used, skipped, skippedTitles } của câu trả lời gần nhất
  const listRef = useRef(null);

  // Chỉ cuộn bên trong khung chat, không kéo cả trang
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, active]); // active: ẩn bằng display:none làm mất vị trí cuộn, hiện lại thì cuộn xuống cuối
  useEffect(() => {
    if (!active) recRef.current?.abort(); // đổi sang mục khác thì tắt micro
  }, [active]);

  // Gọi AI với danh sách tin nhắn đã có (dùng chung cho gửi mới và "Hỏi lại" để không trùng tin của người dùng)
  const ask = async (next) => {
    setError('');
    setSending(true);
    try {
      const data = await askAiAssistant(next, currentTopicId);
      setMessages([...next, { role: 'assistant', content: data.reply }]);
      const tree = findMindmap(data.reply);
      if (tree) setDiagram(tree); // có sơ đồ -> tự mở panel xem trước
      setDocInfo({ used: data.usedDocuments?.length ?? 0, skipped: data.skippedCount ?? 0, skippedTitles: data.skippedTitles ?? [] });
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

  // Bấm micro -> nói 1 câu -> chữ hiện vào ô nhập (không tự gửi, để người dùng kiểm tra lại rồi bấm Gửi).
  // Lưu ý: trình duyệt chỉ cho dùng micro trên HTTPS hoặc localhost.
  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'vi-VN';
    rec.onstart = () => {
      setError('');
      setListening(true);
    };
    rec.onresult = (e) => setInput((v) => `${v ? `${v} ` : ''}${e.results[0][0].transcript}`.slice(0, 2000));
    rec.onerror = (e) => e.error !== 'aborted' && setError(MIC_ERRORS[e.error] || 'Không ghi âm được, bạn thử lại hoặc gõ chữ nhé.');
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
  };

  useEffect(() => () => recRef.current?.abort(), []); // rời trang thì tắt micro

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

      <div className={`p-3 sm:p-6 ${diagram ? 'lg:grid lg:grid-cols-2 lg:gap-4' : ''}`}>
        {diagram && <DiagramPanel code={diagram} onClose={() => setDiagram(null)} />}
        <div className="space-y-3 sm:space-y-4 min-w-0">
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
                {m.role === 'user' ? m.content : renderContent(m.content, setDiagram)}
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
            {docInfo.skipped > 0
              ? ` (${docInfo.skipped} tài liệu chưa đọc được${docInfo.skippedTitles?.length ? `: ${docInfo.skippedTitles.join(', ')}` : ''})`
              : ''}.
          </p>
        )}

        {error && (
          <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-[#0F172A] text-base lg:text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            {messages.at(-1)?.role === 'user' && (
            <button
              onClick={() => ask(messages)}
              disabled={sending}
              className="px-3 flex items-center gap-1.5 font-semibold text-[#C53030] border border-[#C53030]/40 bg-white rounded-lg hover:bg-[#FEECEC] disabled:opacity-50 min-touch-target transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Hỏi lại</span>
            </button>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={listening ? 'Đang nghe... hãy nói câu hỏi của bạn' : 'Nhập câu hỏi của bạn...'}
            className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40"
          />
          {SpeechRec && (
            <button
              onClick={toggleMic}
              disabled={sending}
              aria-label={listening ? 'Dừng ghi âm' : 'Nói câu hỏi'}
              className={`px-3 flex items-center justify-center rounded-xl border min-touch-target transition-colors disabled:opacity-50 ${
                listening
                  ? 'bg-[#C53030] border-[#C53030] text-white animate-pulse'
                  : 'bg-white border-slate-300 text-[#008BC5] hover:bg-[#EAF6FF]'
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
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
    </div>
  );
};