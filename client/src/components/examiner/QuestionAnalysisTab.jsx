import { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, BarChart3, Info } from 'lucide-react';
import { fetchQuestionAnalysis } from '../../services/analytics.service';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 5;

const FLAGS = {
  suspect_key: { label: 'Nghi sai đáp án', cls: 'bg-[#FEECEC] text-[#C53030] border-[#E53E3E]/30' },
  low_discrimination: { label: 'Phân biệt thấp', cls: 'bg-[#FFF7E6] text-[#B45309] border-[#F6AD37]/50' },
  too_easy: { label: 'Quá dễ', cls: 'bg-[#FFF7E6] text-[#B45309] border-[#F6AD37]/50' },
  too_hard: { label: 'Quá khó', cls: 'bg-[#FFF7E6] text-[#B45309] border-[#F6AD37]/50' },
  difficulty_mismatch: { label: 'Độ khó khai báo lệch', cls: 'bg-[#FFF7E6] text-[#B45309] border-[#F6AD37]/50' },
};

const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

const Stat = ({ label, value, warn }) => (
  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4">
    <p className="text-sm text-[#334155]">{label}</p>
    <p className={`text-3xl font-bold mt-0.5 ${warn ? 'text-[#B45309]' : 'text-[#0F172A]'}`}>{value}</p>
  </div>
);

/**
 * Ô lọc chủ đề tự dựng thay cho <select> native. Danh sách xổ xuống của <select> do trình duyệt vẽ nên có thể rộng hơn
 * khung (tràn ra ngoài màn hình điện thoại) và không chỉnh được bằng CSS; bản tự dựng luôn nằm trong chiều rộng khung,
 * tên chủ đề dài tự xuống dòng, danh sách tối đa 256px rồi cuộn. Dùng chung cho desktop và mobile.
 * Hỗ trợ bàn phím: ↑/↓ di chuyển, Enter/Space chọn, Esc đóng.
 */
const TopicFilter = ({ value, topics, onChange }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  const options = useMemo(
    () => [{ value: 'all', label: 'Mọi chủ đề' }, ...topics.map((t) => ({ value: t, label: t }))],
    [topics]
  );
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selectedIndex];

  // Bấm ra ngoài hoặc nhấn Esc để đóng
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Giữ mục đang di chuyển bằng phím luôn nằm trong vùng nhìn thấy của danh sách
  useEffect(() => {
    if (open) menuRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (v) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1)));
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      choose(options[active].value);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full sm:ml-auto sm:w-64">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="qa-topic-listbox"
        aria-label="Lọc theo chủ đề"
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[10px] border-[1.5px] border-[#E2E8F0] bg-white text-left text-base text-[#0F172A] min-touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={menuRef}
          id="qa-topic-listbox"
          role="listbox"
          className="absolute left-0 right-0 sm:left-auto sm:w-80 sm:max-w-[calc(100vw-2rem)] z-30 mt-1 max-h-64 overflow-y-auto rounded-[10px] border border-[#E2E8F0] bg-white py-1 shadow-z176"
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-start justify-between gap-2 px-3 py-2.5 min-h-[44px] cursor-pointer text-base break-words ${
                  selected ? 'font-semibold text-[#008BC5]' : 'text-[#0F172A]'
                } ${i === active ? 'bg-[#EAF6FF]' : ''}`}
              >
                <span className="min-w-0">{o.label}</span>
                {selected && <Check className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** Phân tích chất lượng câu hỏi từ kỳ thi chính thức: tỷ lệ đúng, độ phân biệt, đáp án nhiễu. */
export const QuestionAnalysisTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [topic, setTopic] = useState('all');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchQuestionAnalysis();
      if (res.success) setData(res.data);
      else setError(res.message);
    } catch (err) {
      setError(err.message || 'Lỗi tải phân tích câu hỏi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const topics = useMemo(() => [...new Set(items.map((i) => i.topicName).filter(Boolean))].sort(), [items]);
  const flaggedCount = useMemo(() => items.filter((i) => i.flags.length > 0).length, [items]);
  const shown = useMemo(
    () => items.filter((i) => (topic === 'all' || i.topicName === topic) && (!onlyFlagged || i.flags.length > 0)),
    [items, topic, onlyFlagged]
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount);
  const rows = shown.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const changeFilter = (fn) => {
    fn();
    setPage(1);
    setOpenId(null);
  };
  const goPage = (p) => {
    setPage(p);
    setOpenId(null);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#008BC5] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030]">
        <p className="text-base">Lỗi: {error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-lg text-base font-semibold min-touch-target"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const { meta } = data;
  const seg = (active) =>
    `flex-1 sm:flex-none px-4 py-2.5 rounded-[10px] text-base font-semibold min-touch-target ${
      active ? 'bg-[#008BC5] text-white' : 'bg-white text-[#334155] border-[1.5px] border-[#CBD5E1] hover:bg-[#F6F8FA]'
    }`;

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
        <h2 className="text-xl font-bold text-[#0F172A]">Phân tích chất lượng câu hỏi</h2>

        <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
          <Stat label="Lượt thi đã phân tích" value={meta.attemptsAnalyzed} />
          <Stat label="Câu hỏi" value={items.length} />
          <Stat label="Câu cần rà soát" value={flaggedCount} warn={flaggedCount > 0} />
        </div>

        <details className="group rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#334155]">
          <summary className="flex items-center gap-2 cursor-pointer text-base font-semibold min-touch-target select-none">
            <Info className="w-4 h-4 text-[#008BC5] shrink-0" /> Cách đọc các chỉ số
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-[#475569] list-disc pl-5">
            <li>Không tính bài bị hệ thống tự nộp.</li>
            <li>
              Câu dưới {meta.minResponses} lượt trả lời chưa hiện chỉ số; từ {meta.reliableResponses} lượt trở lên mới có cảnh báo.
            </li>
            <li>
              Độ phân biệt = tỷ lệ đúng của nhóm điểm cao trừ nhóm điểm thấp. Càng gần 1 càng tốt; số âm nghĩa là người giỏi lại làm
              sai nhiều hơn.
            </li>
            <li>Cảnh báo chỉ là gợi ý để rà soát lại câu hỏi.</li>
          </ul>
        </details>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-2">
            <button className={seg(!onlyFlagged)} onClick={() => changeFilter(() => setOnlyFlagged(false))}>
              Tất cả ({items.length})
            </button>
            <button className={seg(onlyFlagged)} onClick={() => changeFilter(() => setOnlyFlagged(true))}>
              Có cảnh báo ({flaggedCount})
            </button>
          </div>
          <TopicFilter value={topic} topics={topics} onChange={(v) => changeFilter(() => setTopic(v))} />
        </div>
      </div>

      <div ref={listRef} className="scroll-mt-24 space-y-3">
        {shown.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#334155]">
            <BarChart3 className="w-12 h-12 mb-3 mx-auto" />
            <p className="text-base font-medium text-[#334155]">
              {items.length === 0 ? 'Chưa có dữ liệu phân tích' : 'Không có câu hỏi phù hợp bộ lọc'}
            </p>
            {items.length === 0 && <p className="text-base mt-1">Cần có lượt thi chính thức đã nộp để phân tích.</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-[#334155]">
              Hiển thị {(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, shown.length)} / {shown.length} câu
            </p>
            {rows.map((q) => {
              const isOpen = openId === q.questionId;
              const canOpen = !q.insufficientData;
              const strongest = q.options
                .filter((o) => !o.isCorrect)
                .reduce((best, o) => (!best || o.selectedRate > best.selectedRate ? o : best), null);
              return (
                <article key={q.questionId} className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 overflow-hidden">
                  <button
                    onClick={() => canOpen && setOpenId(isOpen ? null : q.questionId)}
                    className={`w-full text-left p-4 flex items-start gap-3 min-touch-target ${canOpen ? 'hover:bg-[#F6F8FA]' : 'cursor-default'}`}
                    aria-expanded={canOpen ? isOpen : undefined}
                  >
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <p className="text-base font-medium text-[#0F172A] line-clamp-3">{q.content || '(Câu hỏi đã bị xóa)'}</p>
                      <p className="text-sm text-[#334155]">
                        {q.topicName} · {q.responses} lượt trả lời
                      </p>
                      {canOpen ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                          <div>
                            <p className="text-base text-[#334155]">
                              Tỷ lệ đúng <b className="text-[#0F172A]">{pct(q.correctRate)}</b>
                            </p>
                            <div className="mt-1 h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                              <div className="h-full rounded-full bg-[#008BC5]" style={{ width: `${Math.round((q.correctRate ?? 0) * 100)}%` }} />
                            </div>
                          </div>
                          <p className="text-base text-[#334155]">
                            Độ phân biệt{' '}
                            <b className={q.discrimination < 0 ? 'text-[#C53030]' : 'text-[#0F172A]'}>{q.discrimination.toFixed(2)}</b>
                            {q.discrimination < 0 && <span className="block text-sm text-[#C53030]">Âm: người giỏi làm sai nhiều hơn</span>}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-[#334155]">Chưa đủ dữ liệu để phân tích</p>
                      )}
                      {(q.flags.length > 0 || (canOpen && q.reliability === 'low')) && (
                        <div className="flex flex-wrap gap-2">
                          {q.flags.map((f) => (
                            <span
                              key={f}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-semibold ${FLAGS[f].cls}`}
                            >
                              {f === 'suspect_key' && <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
                              {FLAGS[f].label}
                            </span>
                          ))}
                          {canOpen && q.reliability === 'low' && (
                            <span className="inline-flex px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-sm font-medium bg-[#F6F8FA] text-[#334155]">
                              Mẫu nhỏ, chỉ tham khảo
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {canOpen && (
                      <span className="shrink-0 mt-1 flex items-center gap-1 text-sm font-semibold text-[#008BC5]">
                        <span className="hidden sm:inline">{isOpen ? 'Thu gọn' : 'Xem đáp án'}</span>
                        {isOpen ? <ChevronUp className="w-5 h-5" aria-hidden="true" /> : <ChevronDown className="w-5 h-5" aria-hidden="true" />}
                      </span>
                    )}
                  </button>

                  {isOpen && canOpen && (
                    <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-4">
                      {q.options.length === 0 && <p className="text-base text-[#334155]">Không có dữ liệu đáp án.</p>}
                      {q.options.map((o, i) => {
                        const distractor = !o.isCorrect && strongest?.answerId === o.answerId && o.selectedRate > 0;
                        return (
                          <div key={o.answerId} className="space-y-1.5">
                            <p className="text-base text-[#0F172A]">
                              <span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {o.content}
                              {o.isCorrect && <span className="ml-2 text-sm font-semibold text-[#166534]">Đáp án đúng</span>}
                              {distractor && <span className="ml-2 text-sm font-semibold text-[#B45309]">Nhiễu mạnh nhất</span>}
                            </p>
                            <div className="h-3 rounded-full bg-[#E2E8F0] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${o.isCorrect ? 'bg-[#22C55E]' : distractor ? 'bg-[#F6AD37]' : 'bg-[#94A3B8]'}`}
                                style={{ width: `${Math.round((o.selectedRate ?? 0) * 100)}%` }}
                              />
                            </div>
                            <p className="text-sm text-[#334155]">
                              Chọn {pct(o.selectedRate)} · Nhóm cao {pct(o.upperRate)} · Nhóm thấp {pct(o.lowerRate)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
            <Pagination page={cur} pageCount={pageCount} onChange={goPage} />
          </>
        )}
      </div>
    </div>
  );
};