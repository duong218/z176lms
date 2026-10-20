import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, AlertCircle, RotateCcw, X, Mic, Download, Volume2, VolumeX } from 'lucide-react';
import { askAiAssistant } from '../../services/ai-assistant.service';
import { splitTables } from '../../lib/mdTable';
import { speechChunks } from '../../lib/speech';

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

// Đọc câu trả lời thành tiếng: API có sẵn của trình duyệt (speechSynthesis). Không hỗ trợ thì ẩn nút loa.
// ponytail: dùng giọng tiếng Việt có sẵn của máy/trình duyệt, nên không đảm bảo mọi máy đọc được (vd Cốc Cốc trên Windows
// có giọng "Microsoft An" trong danh sách nhưng báo synthesis-failed). Cần chắc chắn mọi máy -> đọc bằng TTS phía server.
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

// AI hay ghi nhầm nhãn khối (```json thay vì ```mindmap) nên nhận cả hai: khối json bắt đầu bằng {"name" cũng là sơ đồ.
// Khối ```mermaid: AI viết thẳng cú pháp Mermaid cho mọi biểu đồ khác (cột, đường, tròn, quy trình, gantt...).
const isMindmap = (lang, code) => lang === 'mindmap' || lang === 'mermaid' || (['json', ''].includes(lang) && /^\s*\{\s*"name"/.test(code));
const findMindmap = (text) => {
  for (const m of text.matchAll(/```(\w*)\n?([\s\S]*?)```/g)) if (isMindmap(m[1], m[2])) return m[2];
  return null;
};

// AI trả cây JSON {name, children:[...]}; client tự dựng cú pháp Mermaid nên AI không thể viết sai thụt lề/ký tự đặc biệt.
const clean = (t) => String(t ?? '').replace(/[()[\]{}"`:;#<>]/g, ' ').replace(/\s+/g, ' ').trim() || '...';
// Biểu đồ cột có nhiều cột/nhãn dài thì chữ trục X đè lên nhau (Mermaid không tự xuống dòng) -> chuyển sang cột ngang, nhãn nằm bên trái.
const fixXyChart = (code) => {
  const m = code.match(/x-axis\s*\[([^\]]*)\]/);
  if (!m || /\bline\s*\[/.test(code) || /^\s*xychart(-beta)?\s+horizontal/m.test(code)) return code;
  const labels = m[1].split(',').map((l) => l.trim().replace(/^"|"$/g, ''));
  const crowded = labels.length * Math.max(...labels.map((l) => l.length)) > 32;
  return crowded ? code.replace(/^(\s*xychart(?:-beta)?)/m, '$1 horizontal') : code;
};

// Khổ biểu đồ theo số/độ dài nhãn để chữ không đè nhau: cột ngang thì rộng vừa và trục số chữ nhỏ hơn; cột/đường đứng thì nới theo nhãn.
const xyConfig = (text) => {
  if (!/^\s*xychart/m.test(text)) return MERMAID_CONFIG.xyChart;
  const labels = (text.match(/x-axis\s*\[([^\]]*)\]/)?.[1] ?? '').split(',');
  const horizontal = /^\s*xychart(-beta)?\s+horizontal/m.test(text);
  const width = horizontal ? 480 : Math.min(900, Math.max(420, labels.length * Math.max(...labels.map((l) => l.length)) * 9 + 80));
  const yAxis = horizontal ? { ...MERMAID_CONFIG.xyChart.yAxis, labelFontSize: 14 } : MERMAID_CONFIG.xyChart.yAxis;
  const height = horizontal ? Math.max(340, labels.length * 45 + 120) : MERMAID_CONFIG.xyChart.height; // nhiều cột ngang thì kéo dài xuống
  return { ...MERMAID_CONFIG.xyChart, width, height, yAxis };
};

const toMermaid = (json) => {
  if (!/^\s*\{/.test(json)) return fixXyChart(json.trim()); // cú pháp Mermaid thô (biểu đồ khác)
  const tree = JSON.parse(json);
  const lines = (n, d) => [`${'  '.repeat(d)}${clean(n?.name)}`, ...(n?.children ?? []).flatMap((c) => lines(c, d + 1))];
  return ['mindmap', `  root((${clean(tree.name)}))`, ...(tree.children ?? []).flatMap((c) => lines(c, 2))].join('\n');
};

// Chữ thường: bảng markdown dựng thành <table> (cuộn ngang được trên mobile), phần còn lại giữ **đậm** như cũ.
const NUM = /^[\d.,%\s+-]+$/; // ô toàn số -> căn phải cho dễ so sánh
const renderText = (text, key) =>
  splitTables(text).map((b, n) =>
    b.type === 'text' ? (
      <span key={`${key}-${n}`}>{renderBold(b.text)}</span>
    ) : (
      <div key={`${key}-${n}`} className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-base text-[#0F172A] whitespace-normal">
          <thead>
            <tr>
              {b.head.map((h, c) => (
                <th key={c} className="px-3 py-1.5 bg-slate-200 border border-slate-400 text-left font-bold">
                  {renderBold(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((v, c) => (
                  <td key={c} className={`px-3 py-1.5 border border-slate-400 ${NUM.test(v) ? 'text-right tabular-nums' : ''}`}>
                    {renderBold(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  );

// Tách khối ``` ``` : khối mindmap -> nút mở sơ đồ; khối khác -> chữ đơn cách (giữ nguyên cây ├──); còn lại -> chữ đậm.
const renderContent = (text, onShow) => {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g); // [chữ, lang, code, chữ, lang, code, ...]
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(...renderText(parts[i], i));
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
  // Bo góc + đổ bóng nhẹ cho nút; gốc sơ đồ tư duy màu xanh thương hiệu; nhãn mũi tên chữ đậm trên nền trắng
  // (vì chữ chính của sơ đồ là trắng trên nền màu, nhãn mũi tên nằm trên nền trắng nên phải ép màu riêng).
  themeCSS: `
    .node rect, .node polygon, .node circle, .node path { filter: drop-shadow(0 2px 4px rgba(15,23,42,.22)); }
    .node rect { rx: 12px; ry: 12px; }
    .section-root :is(circle, path, rect, ellipse) { fill: #008BC5 !important; stroke: #FFFFFF; stroke-width: 3px; filter: drop-shadow(0 3px 6px rgba(15,23,42,.30)); }
    .edgeLabel, .edgeLabel *, .edgeLabel p { color: #0F172A !important; fill: #0F172A !important; background-color: #FFFFFF !important; }
    .section-root text, .section-root tspan { fill: #FFFFFF !important; font-weight: 700; }
  `,
  gantt: { axisFormat: '%d/%m' }, // trục ngày mặc định YYYY-MM-DD dài nên chữ chồng lên nhau
  flowchart: { curve: 'basis', padding: 18, nodeSpacing: 40, rankSpacing: 50, htmlLabels: true },
  themeVariables: {
    fontSize: '16px',
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    primaryColor: '#008BC5', // nút/thanh: nền xanh thương hiệu + chữ trắng
    primaryBorderColor: '#0078AA',
    primaryTextColor: '#FFFFFF',
    textColor: '#0F172A', // phải đặt riêng: mặc định lấy theo primaryTextColor (trắng) -> tiêu đề/nhãn trên nền trắng sẽ vô hình
    titleColor: '#0F172A',
    lineColor: '#64748B',
    secondaryColor: '#EAF6FF',
    tertiaryColor: '#FFFFFF',
    edgeLabelBackground: '#FFFFFF',
    taskTextColor: '#FFFFFF',
    taskTextLightColor: '#FFFFFF',
    taskTextOutsideColor: '#0F172A',
    // Sơ đồ tư duy: mỗi nhánh 1 màu đậm, chữ trắng (mặc định là màu pastel chữ đen/trắng lẫn lộn)
    ...Object.fromEntries(COLORS.flatMap((c, i) => [[`cScale${i}`, c], [`cScaleLabel${i}`, '#FFFFFF']])),
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
      xAxisLabelColor: '#334155',
      xAxisTitleColor: '#64748B',
      xAxisTickColor: '#CBD5E1',
      xAxisLineColor: '#CBD5E1',
      yAxisLabelColor: '#334155',
      yAxisTitleColor: '#64748B',
      yAxisTickColor: '#CBD5E1',
      yAxisLineColor: '#CBD5E1',
      dataLabelColor: '#FFFFFF',
      plotColorPalette: ['#008BC5', ...COLORS.slice(1)].join(','), // cột/đường đầu tiên màu xanh thương hiệu
    },
  },
  // Chart hẹp lại để khi co vào khung chat chữ không bị thu nhỏ; hiện số trên cột
  xyChart: {
    width: 420,
    height: 340,
    titleFontSize: 22,
    showDataLabel: true,
    xAxis: { labelFontSize: 17, titleFontSize: 18 },
    yAxis: { labelFontSize: 17, titleFontSize: 18 },
  },
};

// Vẽ sơ đồ Mermaid thành SVG. Thư viện nặng nên chỉ tải khi có sơ đồ đầu tiên.
// securityLevel 'strict' vì nội dung do AI sinh ra.
const DiagramPanel = ({ code, onClose }) => {
  const boxRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // Sơ đồ tư duy rộng nên bị thu nhỏ khi vào khung chat -> dùng chữ to hơn để vẫn đọc rõ
        const fontSize = /^\s*\{/.test(code) ? '28px' : '16px';
        const text = toMermaid(code);
        mermaid.initialize({ ...MERMAID_CONFIG, xyChart: xyConfig(text), themeVariables: { ...MERMAID_CONFIG.themeVariables, fontSize } });
        const { svg } = await mermaid.render(`mm-${Date.now()}`, text);
        if (cancelled || !boxRef.current) return;
        boxRef.current.innerHTML = svg;
        // Hiện dần khi sơ đồ vừa vẽ xong (bỏ qua nếu người dùng bật "giảm chuyển động")
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
          boxRef.current.animate?.([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Mobile: sơ đồ mở toàn màn hình nên khoá cuộn trang phía sau; Esc để đóng
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (window.matchMedia('(max-width: 1023px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      role="dialog"
      aria-label="Sơ đồ / biểu đồ"
      className="fixed inset-0 z-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:p-0 lg:order-last lg:h-[28rem] flex flex-col bg-white lg:rounded-xl lg:border lg:border-slate-200 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <span className="font-bold text-lg lg:text-base text-[#0F172A] mr-auto">Sơ đồ / biểu đồ</span>
        {!failed && (
          <button
            onClick={download}
            aria-label="Tải sơ đồ xuống"
            title="Tải sơ đồ xuống"
            className="px-3 rounded-lg text-[#0F172A] font-semibold hover:bg-slate-200 min-touch-target flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#008BC5]"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">Tải về</span>
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Đóng sơ đồ"
          className="px-3 rounded-lg text-[#0F172A] font-semibold hover:bg-slate-200 min-touch-target flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#008BC5]"
        >
          <X className="w-5 h-5" />
          <span>Đóng</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 flex flex-col justify-center">
        {failed ? (
          <div className="space-y-2 text-slate-600">
            <p>Không vẽ được sơ đồ. Bạn bấm "Hỏi lại" hoặc nhờ trợ lý viết lại sơ đồ nhé.</p>
            <pre className="p-3 bg-slate-100 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">{code}</pre>
          </div>
        ) : (
          // Vừa khít chiều ngang màn hình (không phải vuốt ngang); cần xem kỹ thì tải về hoặc chụm 2 ngón
          <div ref={boxRef} className="w-full [&_svg]:h-auto [&_svg]:max-w-full [&_.line-plot-0_path]:[stroke-width:4px] [&_.line-plot-1_path]:[stroke-width:4px] [&_.line-plot-2_path]:[stroke-width:4px]" />
        )}
      </div>
    </div>
  );
};

/**
 * Khung hỏi đáp với Trợ lý AI. Mặc định là bản cho thí sinh (server tự lọc tài liệu theo phòng ban
 * của người đăng nhập — client không gửi phòng ban/tài liệu). Người duyệt đề dùng lại khung này
 * bằng cách truyền onAsk/suggestions/title/subtitle riêng.
 */
export const AiAssistantChat = ({
  currentTopicId,
  active = true,
  onAsk = askAiAssistant,
  suggestions = SUGGESTIONS,
  title = 'Hỏi đáp cùng Trợ lý AI',
  subtitle = 'Trợ lý chỉ dựa trên tài liệu chung và tài liệu của phòng ban bạn. Câu trả lời có thể chưa chính xác, hãy đối chiếu với tài liệu gốc.',
}) => {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [diagram, setDiagram] = useState(null); // JSON sơ đồ đang xem ở panel
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(null); // chỉ số tin nhắn đang được loa đọc
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
      const data = await onAsk(next, currentTopicId);
      setMessages([...next, { role: 'assistant', content: data.reply }]);
      const tree = findMindmap(data.reply);
      if (tree) setDiagram(tree); // có sơ đồ -> tự mở panel xem trước
      // Chỉ bản thí sinh có danh sách tài liệu; bản Người duyệt đề thì không hiện dòng "Dựa trên N tài liệu"
      if (data.usedDocuments) setDocInfo({ used: data.usedDocuments.length, skipped: data.skippedCount ?? 0, skippedTitles: data.skippedTitles ?? [] });
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

  // Bấm loa -> đọc tin nhắn đó (đang đọc đúng tin đó thì bấm lần nữa để dừng). Đọc tin khác thì tự dừng tin đang đọc.
  const toggleSpeak = (i, content) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking === i) return setSpeaking(null);
    const chunks = speechChunks(content);
    setSpeaking(i);
    chunks.forEach((text, n) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      // cancel() cũng bắn onend/onerror của tin cũ -> chỉ tắt trạng thái nếu vẫn là tin này
      const done = () => setSpeaking((cur) => (cur === i ? null : cur));
      u.onend = () => n === chunks.length - 1 && done();
      u.onerror = (e) => {
        if (['canceled', 'interrupted'].includes(e.error)) return;
        setError(`Trình duyệt này không đọc được thành tiếng (lỗi: ${e.error}). Bạn thử mở bằng Edge hoặc Chrome, hoặc dùng điện thoại.`);
        done();
      };
      synth.speak(u);
    });
  };
  useEffect(() => {
    if (!active) {
      window.speechSynthesis?.cancel(); // đổi sang mục khác thì tắt loa
      setSpeaking(null);
    }
  }, [active]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []); // rời trang thì tắt loa

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
          {title}
        </h2>
        <p className="text-base lg:text-sm text-slate-600 mt-0.5">{subtitle}</p>
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
                {suggestions.map((s) => (
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
              {m.role === 'assistant' && canSpeak && speechChunks(m.content).length > 0 && (
                <button
                  onClick={() => toggleSpeak(i, m.content)}
                  aria-label={speaking === i ? 'Dừng đọc' : 'Đọc câu trả lời thành tiếng'}
                  aria-pressed={speaking === i}
                  title={speaking === i ? 'Dừng đọc' : 'Nghe câu trả lời'}
                  className={`shrink-0 px-3 flex items-center justify-center rounded-full border min-touch-target transition-colors focus-visible:ring-2 focus-visible:ring-[#008BC5] ${
                    speaking === i
                      ? 'bg-[#008BC5] border-[#008BC5] text-white'
                      : 'bg-white border-slate-300 text-[#008BC5] hover:bg-[#EAF6FF]'
                  }`}
                >
                  {speaking === i ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
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