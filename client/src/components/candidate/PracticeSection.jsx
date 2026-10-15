import { useState, useEffect, useRef } from 'react';
import {
  Target,
  Loader2,
  AlertCircle,
  Clock,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Zap,
  ClipboardCheck,
} from 'lucide-react';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../ToastContext';
import {
  fetchPracticeTopics,
  fetchPracticeProgress,
  fetchPracticeAchievements,
  startPractice,
  submitPractice,
  checkPracticeAnswer,
  fetchActivePractice,
  abandonPractice,
} from '../../services/practice.service';

const QUESTION_COUNTS = [5, 10, 20, 30];
const TIME_LIMITS = [0, 5, 10, 15, 30];
const DIFFICULTIES = [
  { value: 'all', label: 'Tất cả' },
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];

const MODES = [
  {
    value: 'instant',
    label: 'Kiểm tra ngay',
    desc: 'Chọn xong biết đúng/sai và xem đáp án đúng ngay từng câu.',
    Icon: Zap,
  },
  {
    value: 'exam',
    label: 'Làm hết rồi chấm',
    desc: 'Làm toàn bộ bài, nộp bài rồi mới xem điểm (như thi thật).',
    Icon: ClipboardCheck,
  },
];

// Lưu tạm lựa chọn + vị trí câu đang làm để tiếp tục khi tải lại trang.
// Điểm số thật vẫn do server chấm; dữ liệu này chỉ để khôi phục giao diện.
const draftKey = (sessionId) => `z176_practice_draft_${sessionId}`;

const loadDraft = (sessionId) => {
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveDraft = (sessionId, data) => {
  try {
    localStorage.setItem(draftKey(sessionId), JSON.stringify(data));
  } catch {
    /* localStorage đầy/bị chặn: bỏ qua, không chặn luồng làm bài */
  }
};

const clearDraft = (sessionId) => {
  try {
    localStorage.removeItem(draftKey(sessionId));
  } catch {
    /* ignore */
  }
};

const getScrollBehavior = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Pháo hoa: vài cụm tia nổ ở vị trí ngẫu nhiên, mỗi tia bay theo 1 hướng (CSS thuần, không thư viện)
const FX_COLORS = ['#22C55E', '#F6AD37', '#008BC5', '#E53E3E', '#A855F7', '#FACC15'];
const makeBursts = () =>
  Array.from({ length: 3 }, (_, b) => {
    const x = 20 + Math.random() * 60;
    const y = 25 + Math.random() * 30;
    return {
      id: b,
      x,
      y,
      delay: b * 150,
      sparks: Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 60 + Math.random() * 50;
        return {
          id: i,
          dx: Math.round(Math.cos(angle) * dist),
          dy: Math.round(Math.sin(angle) * dist),
          color: FX_COLORS[(i + b) % FX_COLORS.length],
        };
      }),
    };
  });

const FX_CSS = `
@keyframes z176-spark { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; } }
@keyframes z176-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
.z176-spark { animation: z176-spark 900ms ease-out both; }
.z176-shake { animation: z176-shake 450ms ease-in-out; }
@media (prefers-reduced-motion: reduce) { .z176-spark, .z176-shake { animation: none; } }
`;

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const resultMessage = (percent) => {
  if (percent >= 80) return 'Rất tốt, bạn nắm chắc nội dung này.';
  if (percent >= 50) return 'Khá tốt, nên ôn thêm phần còn sai.';
  return 'Bạn cần ôn lại kỹ nội dung chủ đề này.';
};

/**
 * Luyện tập theo chủ đề: cấu hình -> làm bài (có đếm giờ nếu có giới hạn) -> kết quả.
 * initialTopicIds: chủ đề được chọn sẵn (ví dụ từ nút "Luyện ngay" trên dashboard).
 */
// Hết giờ tự nộp: số lần thử tối đa khi gặp lỗi tạm thời (rớt mạng...) và khoảng chờ giữa các lần
const AUTO_SUBMIT_MAX_TRIES = 4;
const AUTO_SUBMIT_RETRY_MS = 1500;

export const PracticeSection = ({ initialTopicIds = [] }) => {
  const [phase, setPhase] = useState('config'); // config | quiz | result
  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [selectedTopicIds, setSelectedTopicIds] = useState(initialTopicIds);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimitMin, setTimeLimitMin] = useState(15);
  const [difficulty, setDifficulty] = useState('all');
  const [mode, setMode] = useState('instant');
  const [error, setError] = useState(null);
  // Chưa chọn chủ đề mà bấm Bắt đầu: đánh dấu đỏ ngay khu vực chọn chủ đề
  const [topicError, setTopicError] = useState(false);
  const topicSectionRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(0);
  // Mốc hết hạn (ms). Thời gian còn lại luôn tính từ mốc này để không bị lệch khi điện thoại làm setInterval chậm/dừng
  const deadlineRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  // Chế độ instant: { [questionId]: { isCorrect, correctAnswerIds } } sau khi server chấm
  const [checked, setChecked] = useState({});
  const [checkingId, setCheckingId] = useState(null);
  // Bài đang làm dở lấy từ server (để hiện nút Tiếp tục)
  const [activeSession, setActiveSession] = useState(null);
  // Bài dở đã quá giờ khi thí sinh rời đi: tự nộp và báo cho thí sinh biết
  const [autoSubmitNotice, setAutoSubmitNotice] = useState(false);
  const confirmAction = useConfirm();
  const { showToast } = useToast();

  // Ref để tránh nộp bài 2 lần khi hết giờ và người dùng bấm nộp cùng lúc
  const submittedRef = useRef(false);
  // Mobile: cuộn tới phản hồi sau khi chấm, và cuộn lên đầu khi đổi câu
  const quizTopRef = useRef(null);
  const feedbackRef = useRef(null);
  const justCheckedRef = useRef(null);
  const prevIndexRef = useRef(0);
  // Hiệu ứng khi chấm xong 1 câu: { type: 'correct' | 'wrong', bursts } (tự tắt sau ~1.2s)
  const [fx, setFx] = useState(null);
  const fxTimerRef = useRef(null);
  // Tự chuyển câu sau khi chấm (chế độ instant)
  const autoNextRef = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(fxTimerRef.current);
      clearTimeout(autoNextRef.current);
    },
    [],
  );

  const triggerFx = (isCorrect) => {
    if (prefersReducedMotion()) return;
    clearTimeout(fxTimerRef.current);
    setFx(isCorrect ? { type: 'correct', bursts: makeBursts() } : { type: 'wrong' });
    if (!isCorrect) navigator.vibrate?.(120);
    fxTimerRef.current = setTimeout(() => setFx(null), 1200);
  };

  useEffect(() => {
    let cancelled = false;
    fetchPracticeTopics()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setTopics(list);
        // Chọn sẵn chủ đề của kỳ thi đang phát hành (chỉ lúc tải); không đè lên chủ đề đã chọn sẵn
        // (vd từ nút "Luyện ngay") và thí sinh vẫn bỏ chọn được.
        const examTopic = list.find((t) => t.isExamTopic);
        if (examTopic) setSelectedTopicIds((prev) => (prev.length === 0 ? [examTopic.id] : prev));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Không thể tải danh sách chủ đề.');
      })
      .finally(() => {
        if (!cancelled) setLoadingTopics(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchActivePractice()
      .then(async (data) => {
        if (cancelled) return;
        if (!data?.timedOut) {
          setActiveSession(data || null);
          return;
        }
        // Bài dở đã hết giờ: nộp với các lựa chọn đã có (server + bản nháp trên máy này)
        const draft = loadDraft(data.sessionId);
        const merged = { ...(draft.answers || {}), ...(data.answers || {}) };
        const payload = data.questionIds.map((id) => ({
          questionId: id,
          selectedAnswerIds: merged[id] || [],
        }));
        try {
          const res = await submitPractice(data.sessionId, payload);
          clearDraft(data.sessionId);
          if (cancelled) return;
          setResult(res);
          setAutoSubmitNotice(true);
          setPhase('result');
        } catch (err) {
          if (!cancelled) setError(err?.message || 'Không thể tự động nộp bài đã hết giờ.');
        }
      })
      .catch(() => {
        /* không lấy được bài dở: bỏ qua, vẫn cho làm bài mới */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lưu tạm tiến trình đang làm (chỉ khi đang ở màn làm bài)
  useEffect(() => {
    if (phase !== 'quiz' || !session?.sessionId) return;
    saveDraft(session.sessionId, { answers, index });
  }, [phase, session, answers, index]);

  // Nộp bài. auto = true khi hết giờ: gặp lỗi tạm thời (rớt mạng...) thì tự thử lại vài lần,
  // không để bài kẹt ở màn làm bài với đồng hồ 00:00.
  const handleSubmit = async (auto = false) => {
    if (submittedRef.current || !session) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);

    const payload = session.questions.map((q) => ({
      questionId: q.id,
      selectedAnswerIds: answers[q.id] || [],
    }));
    const maxTries = auto ? AUTO_SUBMIT_MAX_TRIES : 1;

    try {
      for (let attempt = 1; attempt <= maxTries; attempt += 1) {
        try {
          const data = await submitPractice(session.sessionId, payload);
          clearDraft(session.sessionId);
          setActiveSession(null);
          setResult(data);
          setPhase('result');
          return;
        } catch (err) {
          // Lượt đã bị hủy / bị thay bằng lượt mới: nộp lại cũng vô ích -> đưa về màn cấu hình
          if (err?.code === 'PRACTICE_SESSION_EXPIRED' || err?.code === 'PRACTICE_NOT_FOUND') {
            clearDraft(session.sessionId);
            setActiveSession(null);
            setSession(null);
            setPhase('config');
            setError('Lượt luyện này không còn hiệu lực (đã bị hủy hoặc bạn đã bắt đầu lượt mới). Hãy bắt đầu lại.');
            return;
          }
          if (attempt >= maxTries) throw err;
          await new Promise((resolve) => setTimeout(resolve, AUTO_SUBMIT_RETRY_MS * attempt));
        }
      }
    } catch (err) {
      // Hết lần thử: mở khóa để thí sinh còn bấm "Kết thúc & xem kết quả" nộp tay được
      submittedRef.current = false;
      setError(err?.message || 'Không thể nộp bài.');
    } finally {
      setSubmitting(false);
    }
  };

  // Đếm ngược thời gian làm bài (bỏ qua nếu không giới hạn).
  // Tính từ mốc hết hạn, tính lại ngay khi tab/app hiện lại (điện thoại có thể làm timer dừng khi chuyển app)
  useEffect(() => {
    if (phase !== 'quiz' || !session?.timeLimitSec) return undefined;
    const tick = () => {
      if (deadlineRef.current == null) return;
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [phase, session]);

  // Hết giờ thì tự nộp bài
  useEffect(() => {
    if (phase === 'quiz' && session?.timeLimitSec && remaining <= 0) {
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase, session]);

  // Chế độ "Kiểm tra ngay": kiểm tra xong câu cuối thì tự nộp luôn (chờ ~2.5s để kịp xem đúng/sai câu cuối).
  // Chạy trong effect để handleSubmit thấy đủ `answers` mới nhất; submittedRef chặn nộp 2 lần.
  useEffect(() => {
    if (phase !== 'quiz' || session?.mode !== 'instant') return undefined;
    const total = session.questions.length;
    if (total === 0 || Object.keys(checked).length < total) return undefined;
    const t = setTimeout(() => handleSubmit(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, phase, session]);

  // Vừa được server chấm -> cuộn tới khung phản hồi (câu dài trên điện thoại sẽ nằm ngoài màn hình)
  useEffect(() => {
    if (!justCheckedRef.current) return undefined;
    justCheckedRef.current = null;
    const t = setTimeout(() => {
      feedbackRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'nearest' });
    }, 50);
    return () => clearTimeout(t);
  }, [checked]);

  // Đổi câu -> đưa đầu khối làm bài về màn hình (nút Sau nằm cuối trang nên trang đang cuộn xuống)
  useEffect(() => {
    if (phase !== 'quiz') return;
    if (prevIndexRef.current !== index) {
      quizTopRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
    }
    prevIndexRef.current = index;
  }, [index, phase]);

  // Tiếp tục bài đang làm dở: server là nguồn chính cho câu đã kiểm tra, localStorage bổ sung phần còn lại
  const handleResume = () => {
    if (!activeSession) return;
    const draft = loadDraft(activeSession.sessionId);
    const lastIndex = activeSession.questions.length - 1;
    submittedRef.current = false;
    setSession(activeSession);
    setAnswers({ ...(draft.answers || {}), ...(activeSession.answers || {}) });
    setChecked(activeSession.checked || {});
    setIndex(Math.min(Math.max(Number(draft.index) || 0, 0), lastIndex));
    // Server trả remainingSec đã trừ thời gian đã trôi qua: lấy làm mốc mới
    deadlineRef.current = Date.now() + Math.max(0, Number(activeSession.remainingSec) || 0) * 1000;
    setRemaining(activeSession.remainingSec ?? 0);
    setResult(null);
    setError(null);
    setPhase('quiz');
  };

  const handleAbandon = async () => {
    if (!activeSession) return;
    const ok = await confirmAction('Bỏ bài đang làm dở? Kết quả bài này sẽ không được tính.', {
      title: 'Bỏ bài đang làm',
      confirmLabel: 'Bỏ bài',
      cancelLabel: 'Giữ lại',
    });
    if (!ok) return;
    try {
      await abandonPractice(activeSession.sessionId);
      clearDraft(activeSession.sessionId);
      setActiveSession(null);
    } catch (err) {
      setError(err?.message || 'Không thể bỏ bài này.');
    }
  };

  // Bấm Nộp bài: luôn hỏi lại (hết giờ thì tự nộp, không hỏi)
  const requestSubmit = async () => {
    if (submittedRef.current || !session) return;
    const left = session.questions.filter((q) => (answers[q.id] || []).length === 0).length;
    const ok = await confirmAction(
      left > 0
        ? `Bạn còn ${left} câu chưa trả lời. Bạn vẫn muốn nộp bài?`
        : 'Bạn đã trả lời tất cả các câu. Nộp bài và xem kết quả?',
      {
        title: 'Nộp bài luyện tập',
        confirmLabel: 'Nộp bài',
        cancelLabel: 'Làm tiếp',
        danger: left > 0,
      },
    );
    if (ok) handleSubmit();
  };

  const toggleTopic = (id) => {
    setTopicError(false);
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Cuộn đưa khối chọn chủ đề lên gần đầu màn hình, chừa chỗ cho Header cố định (~72px).
  // Tự tính vị trí thay vì scrollIntoView({ block: 'center' }) để tiêu đề "1. Chọn chủ đề"
  // không bị Header che và không phụ thuộc chiều cao khối.
  const scrollToTopics = () => {
    const el = topicSectionRef.current;
    if (!el) return;
    const HEADER_OFFSET = 96;
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: getScrollBehavior() });
  };

  const handleStart = async () => {
    if (selectedTopicIds.length === 0) {
      // Nút Bắt đầu nằm cuối form, xa khu vực chọn chủ đề: báo bằng toast nổi (luôn thấy dù đang ở đâu)
      // đồng thời cuộn tới khu vực chọn chủ đề và đánh dấu đỏ ngay tại chỗ.
      setError(null);
      setTopicError(true);
      showToast('Vui lòng chọn ít nhất một chủ đề để bắt đầu.', 'warning');
      scrollToTopics();
      return;
    }
    setTopicError(false);
    setError(null);
    setStarting(true);
    try {
      const data = await startPractice({
        topicIds: selectedTopicIds,
        questionCount,
        timeLimitMin,
        difficulty,
        mode,
      });
      if (activeSession) clearDraft(activeSession.sessionId);
      setActiveSession(null);
      submittedRef.current = false;
      setSession(data);
      setAnswers({});
      setChecked({});
      setIndex(0);
      deadlineRef.current = Date.now() + (data.timeLimitSec || 0) * 1000;
      setRemaining(data.timeLimitSec || 0);
      setResult(null);
      setPhase('quiz');
    } catch (err) {
      setError(err?.message || 'Không thể bắt đầu bài luyện.');
    } finally {
      setStarting(false);
    }
  };

  // Gọi server chấm 1 câu (chế độ instant). Chỉ khóa câu khi server trả kết quả thành công.
  const checkQuestion = async (question, selectedIds) => {
    if (!session || checked[question.id] || checkingId) return;
    if (selectedIds.length === 0) return;
    setCheckingId(question.id);
    setError(null);
    try {
      const data = await checkPracticeAnswer(session.sessionId, question.id, selectedIds);
      justCheckedRef.current = question.id;
      setChecked((prev) => ({
        ...prev,
        [question.id]: { isCorrect: data.isCorrect, correctAnswerIds: data.correctAnswerIds },
      }));
      setAnswers((prev) => ({ ...prev, [question.id]: data.selectedAnswerIds.map(String) }));
      triggerFx(data.isCorrect);
      // Tự sang câu sau: đúng chờ ngắn (kịp xem pháo hoa), sai chờ lâu hơn để đọc đáp án đúng.
      // Nếu thí sinh đã tự bấm sang câu khác trong lúc chờ thì không làm gì. Câu cuối thì ở lại.
      const qIdx = session.questions.findIndex((q) => q.id === question.id);
      if (qIdx < session.questions.length - 1) {
        clearTimeout(autoNextRef.current);
        autoNextRef.current = setTimeout(
          () => setIndex((i) => (i === qIdx ? qIdx + 1 : i)),
          data.isCorrect ? 1500 : 3500,
        );
      }
    } catch (err) {
      if (err?.code === 'PRACTICE_TIME_UP') {
        handleSubmit(true);
        return;
      }
      setError(err?.message || 'Không thể kiểm tra đáp án.');
    } finally {
      setCheckingId(null);
    }
  };

  const toggleAnswer = (question, optionId) => {
    if (session?.mode === 'instant') {
      if (checked[question.id] || checkingId) return; // đã khóa hoặc đang chấm
      if (question.answerType === 'single') {
        // Chọn 1 đáp án: chọn là chấm luôn
        setAnswers((prev) => ({ ...prev, [question.id]: [optionId] }));
        checkQuestion(question, [optionId]);
        return;
      }
    }
    setAnswers((prev) => {
      const current = prev[question.id] || [];
      if (question.answerType === 'single') {
        return { ...prev, [question.id]: [optionId] };
      }
      return {
        ...prev,
        [question.id]: current.includes(optionId)
          ? current.filter((x) => x !== optionId)
          : [...current, optionId],
      };
    });
  };

  // ── Cấu hình ──
  if (phase === 'config') {
    return (
      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Target className="w-5 h-5 text-[#008BC5]" />
            Luyện tập theo chủ đề
          </h2>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {activeSession && (
            <div className="p-4 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg space-y-3">
              <div className="flex items-start gap-2 text-[#0F172A] font-semibold">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#F6AD37]" />
                <span>
                  Bạn có một bài luyện tập đang làm dở ({activeSession.questions.length} câu
                  {activeSession.remainingSec != null
                    ? `, còn khoảng ${formatTime(activeSession.remainingSec)}`
                    : ''}
                  ).
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleResume}
                  className="flex-1 min-h-[48px] bg-[#008BC5] text-white font-bold rounded-lg min-touch-target touch-manipulation"
                >
                  Tiếp tục bài này
                </button>
                <button
                  onClick={handleAbandon}
                  className="flex-1 sm:flex-none min-h-[48px] px-4 border border-slate-300 text-[#0F172A] font-semibold rounded-lg hover:bg-slate-50 min-touch-target touch-manipulation"
                >
                  Bỏ bài này
                </button>
              </div>
              <p className="text-xs text-slate-500">Bắt đầu bài mới sẽ thay thế bài đang làm dở.</p>
            </div>
          )}

          <div
            ref={topicSectionRef}
            className={`scroll-mt-20 rounded-lg transition-colors ${
              topicError ? 'ring-2 ring-[#E53E3E]/60 bg-[#FEECEC]/50 p-3 -m-3' : ''
            }`}
          >
            <div className="font-semibold text-[#0F172A] mb-2">1. Chọn chủ đề</div>
            {topicError && (
              <p
                role="alert"
                className="mb-2 text-sm font-semibold text-[#C53030] flex items-center gap-1.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                Vui lòng chọn ít nhất một chủ đề để bắt đầu.
              </p>
            )}
            {loadingTopics ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : topics.length === 0 ? (
              <p className="text-slate-500 text-sm">
                Hiện chưa có câu hỏi ôn tập nào cho phòng ban của bạn. Người ra đề đang chuẩn bị, bạn vui lòng quay lại sau.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topics.map((t) => {
                  const selected = selectedTopicIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTopic(t.id)}
                      className={`text-left p-3 rounded-lg border transition-colors min-touch-target ${
                        selected
                          ? 'border-[#008BC5] bg-[#EAF6FF] text-[#0F172A]'
                          : t.isExamTopic
                            ? 'border-[#F6AD37] bg-[#FFF8EB] hover:bg-[#FEF1D6] text-[#0F172A]'
                            : 'border-slate-200 hover:bg-slate-50 text-[#0F172A]'
                      }`}
                    >
                      {t.isExamTopic && (
                        <span className="inline-flex items-center gap-1 mb-1.5 px-2 py-0.5 rounded-full bg-[#F6AD37]/20 text-[#B7791F] text-xs font-bold">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Chủ đề kỳ thi đang phát hành
                        </span>
                      )}
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-sm text-slate-500">{t.availableCount} câu có sẵn</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="font-semibold text-[#0F172A] mb-2">2. Số câu</div>
            <div className="flex flex-wrap gap-2">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`px-4 py-2 rounded-lg border font-semibold min-touch-target ${
                    questionCount === n
                      ? 'border-[#008BC5] bg-[#008BC5] text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {n} câu
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-semibold text-[#0F172A] mb-2">3. Thời gian</div>
            <div className="flex flex-wrap gap-2">
              {TIME_LIMITS.map((m) => (
                <button
                  key={m}
                  onClick={() => setTimeLimitMin(m)}
                  className={`px-4 py-2 rounded-lg border font-semibold min-touch-target ${
                    timeLimitMin === m
                      ? 'border-[#008BC5] bg-[#008BC5] text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m === 0 ? 'Không giới hạn' : `${m} phút`}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EAF6FF] border border-[#008BC5]/30 text-[#0F172A] font-semibold">
              <Clock className="w-5 h-5 text-[#008BC5] shrink-0" />
              <span>
                Đã chọn:{' '}
                {timeLimitMin === 0
                  ? 'Không giới hạn thời gian'
                  : `${timeLimitMin} phút (có đồng hồ đếm ngược khi làm bài)`}
              </span>
            </div>
          </div>

          <div>
            <div className="font-semibold text-[#0F172A] mb-2">4. Độ khó</div>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`px-4 py-2 rounded-lg border font-semibold min-touch-target ${
                    difficulty === d.value
                      ? 'border-[#008BC5] bg-[#008BC5] text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-semibold text-[#0F172A] mb-2">5. Chế độ ôn tập</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODES.map(({ value, label, desc, Icon }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`text-left p-3 rounded-lg border transition-colors min-touch-target ${
                    mode === value
                      ? 'border-[#008BC5] bg-[#EAF6FF] text-[#0F172A]'
                      : 'border-slate-200 hover:bg-slate-50 text-[#0F172A]'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[#008BC5] shrink-0" />
                    {label}
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-[#0F172A]"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={starting || loadingTopics || topics.length === 0}
            className="w-full min-h-[52px] bg-[#008BC5] disabled:bg-slate-300 text-white font-bold text-lg rounded-full flex items-center justify-center gap-2 min-touch-target"
          >
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
            <span>Bắt đầu luyện</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Kết quả ──
  if (phase === 'result' && result) {
    return (
      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 p-5 sm:p-8 text-center space-y-4">
        <div className="text-slate-500">Kết quả luyện tập</div>
        <div className="text-5xl font-bold text-[#0F172A]">{result.percent}%</div>
        <div className="text-lg text-[#334155]">
          Đúng {result.correctCount}/{result.totalQuestions} câu
        </div>
        <p className="text-slate-500">{resultMessage(result.percent)}</p>
        {autoSubmitNotice && (
          <p className="text-sm text-[#0F172A] bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg p-3">
            Bài luyện tập của bạn đã hết giờ khi bạn rời đi nên được nộp tự động với các đáp án đã chọn.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {session?.mode === 'instant' && Object.keys(checked).length > 0 && (
            <button
              onClick={() => {
                setIndex(0);
                setPhase('review');
              }}
              className="px-6 py-3 border border-[#008BC5] text-[#008BC5] font-bold rounded-lg min-touch-target"
            >
              Xem lại bài làm
            </button>
          )}
          <button
            onClick={() => {
              setAutoSubmitNotice(false);
              setPhase('config');
            }}
            className="px-6 py-3 bg-[#008BC5] text-white font-bold rounded-lg min-touch-target"
          >
            Luyện lại
          </button>
        </div>
      </div>
    );
  }

  // ── Làm bài ──
  const questions = session?.questions || [];
  const current = questions[index];
  const unansweredCount = questions.filter((q) => (answers[q.id] || []).length === 0).length;
  const isInstant = session?.mode === 'instant';
  const checkedCount = Object.keys(checked).length;
  const currentCheck = current ? checked[current.id] : null;
  const currentSelected = current ? answers[current.id] || [] : [];

  const reviewing = phase === 'review'; // xem lại bài sau khi nộp: chỉ đọc
  const hasTimer = !reviewing && session?.timeLimitSec > 0;
  const timeLow = hasTimer && remaining <= 60;

  return (
    <div ref={quizTopRef} className="space-y-3 scroll-mt-20">
      <style>{FX_CSS}</style>
      {fx?.type === 'correct' && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
          {fx.bursts.map((b) => (
            <div key={b.id} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
              {b.sparks.map((s) => (
                <span
                  key={s.id}
                  className="z176-spark absolute block w-2 h-2 rounded-full"
                  style={{
                    background: s.color,
                    animationDelay: `${b.delay}ms`,
                    '--dx': `${s.dx}px`,
                    '--dy': `${s.dy}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {/* Đồng hồ dính ngay dưới Header cố định (cao 64px = top-16, Header z-50 nên đồng hồ z-40) */}
      {hasTimer && (
        <div
          role="timer"
          aria-label={`Thời gian còn lại ${formatTime(Math.max(0, remaining))}`}
          className={`sticky top-16 z-40 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border-2 shadow-z176 ${
            timeLow
              ? 'bg-[#FEECEC] border-[#E53E3E] text-[#C53030] animate-pulse'
              : 'bg-[#EAF6FF] border-[#008BC5] text-[#008BC5]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-6 h-6 shrink-0" />
            <span className="font-semibold text-sm sm:text-base leading-tight">
              {timeLow ? 'Sắp hết giờ!' : 'Thời gian còn lại'}
            </span>
          </div>
          <span className="font-mono font-bold text-3xl leading-none tabular-nums">
            {formatTime(Math.max(0, remaining))}
          </span>
        </div>
      )}

      <div
        className={`bg-white rounded-xl shadow-z176 border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-5 ${
          fx?.type === 'wrong' ? 'z176-shake' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-[#0F172A]">
            Câu {index + 1}/{questions.length}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg text-[#0F172A]">
            {error}
          </div>
        )}

        {current && (
          <>
            <div>
              <p className="text-lg text-[#0F172A] font-medium mb-2">{current.content}</p>
              <p className="text-sm text-slate-500 mb-3">
                {current.answerType === 'multiple' ? 'Chọn tất cả đáp án đúng' : 'Chọn một đáp án'}
              </p>
              {current.imageUrl && (
                <img
                  src={current.imageUrl}
                  alt={`Hình minh hoạ câu ${index + 1}`}
                  loading="lazy"
                  className="max-h-64 max-w-full w-auto mx-auto object-contain rounded-lg mb-3"
                />
              )}
              <div className="space-y-2">
                {current.answers.map((opt) => {
                  const checkedOpt = currentSelected.includes(opt.id);
                  let cls = checkedOpt
                    ? 'border-[#008BC5] bg-[#EAF6FF]'
                    : 'border-slate-200 hover:bg-slate-50';
                  let mark = null;
                  if (currentCheck) {
                    const isRightOpt = currentCheck.correctAnswerIds.map(String).includes(String(opt.id));
                    if (isRightOpt) {
                      cls = 'border-[#22C55E] bg-[#F0FDF4]';
                      mark = <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" role="img" aria-label="Đáp án đúng" />;
                    } else if (checkedOpt) {
                      cls = 'border-[#E53E3E] bg-[#FEECEC]';
                      mark = <XCircle className="w-5 h-5 text-[#E53E3E] shrink-0" role="img" aria-label="Chọn sai" />;
                    } else {
                      cls = 'border-slate-200 opacity-70';
                    }
                  }
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleAnswer(current, opt.id)}
                      disabled={reviewing || Boolean(currentCheck) || checkingId === current.id}
                      className={`w-full text-left p-3 rounded-lg border transition-colors min-touch-target touch-manipulation flex items-start justify-between gap-2 ${cls}`}
                    >
                      <span className="break-words min-w-0">{opt.content}</span>
                      {mark}
                    </button>
                  );
                })}
              </div>

              {isInstant && currentCheck && (
                <div
                  ref={feedbackRef}
                  className={`mt-3 p-3 rounded-lg border space-y-3 scroll-mb-4 ${
                    currentCheck.isCorrect
                      ? 'bg-[#F0FDF4] border-[#22C55E]/40'
                      : 'bg-[#FEECEC] border-[#E53E3E]/30'
                  }`}
                  role="status"
                >
                  <div className="flex items-start gap-2 text-sm font-semibold text-[#0F172A]">
                    {currentCheck.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#E53E3E] shrink-0 mt-0.5" />
                    )}
                    <span>
                      {currentCheck.isCorrect
                        ? 'Chính xác!'
                        : 'Chưa đúng — đáp án đúng được đánh dấu màu xanh.'}
                    </span>
                  </div>
                  {index < questions.length - 1 && (
                    <button
                      onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                      className="w-full px-4 py-3 bg-[#008BC5] text-white font-bold rounded-lg flex items-center justify-center gap-1 min-touch-target touch-manipulation"
                    >
                      Câu tiếp theo <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {isInstant && !reviewing && !currentCheck && current.answerType === 'multiple' && (
                <button
                  onClick={() => checkQuestion(current, currentSelected)}
                  disabled={currentSelected.length === 0 || checkingId === current.id}
                  className="mt-3 w-full px-4 py-3 bg-[#008BC5] disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target"
                >
                  {checkingId === current.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  Kiểm tra đáp án
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex-1 sm:flex-none justify-center px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-1 disabled:opacity-40 min-touch-target touch-manipulation"
              >
                <ChevronLeft className="w-4 h-4" /> Trước
              </button>
              <button
                onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={index === questions.length - 1}
                className="flex-1 sm:flex-none justify-center px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-1 disabled:opacity-40 min-touch-target touch-manipulation"
              >
                Sau <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-6 min-[420px]:grid-cols-8 sm:grid-cols-10 gap-2">
              {questions.map((q, i) => {
                const answered = (answers[q.id] || []).length > 0;
                const qCheck = checked[q.id];
                let cls = 'border-slate-300 text-slate-500';
                if (i === index) cls = 'border-[#008BC5] text-[#008BC5] ring-2 ring-[#008BC5]/30';
                else if (qCheck) {
                  cls = qCheck.isCorrect
                    ? 'bg-[#22C55E] text-white border-[#22C55E]'
                    : 'bg-[#E53E3E] text-white border-[#E53E3E]';
                } else if (answered) cls = 'bg-[#008BC5] text-white border-[#008BC5]';
                return (
                  <button
                    key={q.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Đi tới câu ${i + 1}`}
                    aria-current={i === index}
                    className={`aspect-square min-h-[44px] rounded-lg text-sm font-semibold border touch-manipulation ${cls}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm text-slate-500">
                {reviewing
                  ? 'Đang xem lại bài đã làm'
                  : isInstant
                    ? `Đã kiểm tra ${checkedCount}/${questions.length} câu`
                    : unansweredCount > 0
                      ? `Còn ${unansweredCount} câu chưa trả lời`
                      : 'Đã trả lời tất cả câu hỏi'}
              </span>
              <button
                onClick={reviewing ? () => setPhase('result') : requestSubmit}
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-3 bg-[#008BC5] disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target touch-manipulation"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {reviewing ? 'Quay lại kết quả' : isInstant ? 'Kết thúc & xem kết quả' : 'Nộp bài'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/** Khối tiến độ luyện tập, hiển thị trên Dashboard thí sinh */
export const PracticeProgressCard = ({ onPracticeTopic }) => {
  const [progress, setProgress] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPracticeProgress(), fetchPracticeAchievements()])
      .then(([progressData, achievementsData]) => {
        if (!cancelled) {
          setProgress(progressData);
          setAchievements(achievementsData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProgress(null);
          setAchievements(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;

  if (!progress || progress.totalSessions === 0) {
    return (
      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 p-4 sm:p-6 text-slate-500 text-sm">
        Bạn chưa có bài luyện tập nào. Vào mục "Luyện tập" để bắt đầu ôn theo chủ đề.
      </div>
    );
  }

  const weakest = progress.topics[0];

  return (
    <div className="bg-white rounded-xl shadow-z176 border border-slate-200 p-4 sm:p-6 space-y-5">
      <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-[#008BC5]" />
        Tiến độ luyện tập
      </h2>

      {achievements?.message && (
        <div className="p-3 bg-[#EFF8FF] border border-[#008BC5]/20 rounded-lg text-sm text-[#0F172A]">
          {achievements.message}
        </div>
      )}

      {achievements?.streakDays > 0 && (
        <div className="text-sm text-slate-600">
          🔥 Chuỗi <strong>{achievements.streakDays}</strong> ngày luyện tập liên tiếp
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-sm text-slate-500">Bài đã làm</div>
          <div className="text-xl font-bold text-[#0F172A]">{progress.totalSessions}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-sm text-slate-500">Câu đã làm</div>
          <div className="text-xl font-bold text-[#0F172A]">{progress.totalQuestions}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-sm text-slate-500">Tỉ lệ đúng TB</div>
          <div className="text-xl font-bold text-[#0F172A]">{progress.averagePercent}%</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-[#0F172A]">Theo chủ đề</div>
        {progress.topics.map((t) => (
          <div key={t.topicId}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#0F172A]">{t.name}</span>
              <span className="text-slate-500">{t.percent}% đúng</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${t.percent >= 70 ? 'bg-[#22C55E]' : 'bg-[#F6AD37]'}`}
                style={{ width: `${t.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {weakest && weakest.percent < 70 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg">
          <span className="text-sm text-[#0F172A]">
            Chủ đề cần ôn thêm: <strong>{weakest.name}</strong> ({weakest.percent}% đúng)
          </span>
          <button
            onClick={() => onPracticeTopic?.(weakest.topicId)}
            className="px-4 py-2 bg-[#008BC5] text-white font-semibold rounded-lg text-sm min-touch-target"
          >
            Luyện ngay
          </button>
        </div>
      )}

      {achievements?.badges?.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-[#0F172A]">Huy hiệu đã đạt</div>
          <div className="flex flex-wrap gap-2">
            {achievements.badges.map((b) => (
              <span
                key={b.id}
                title={b.desc}
                className="px-3 py-1.5 bg-[#F0FDF4] border border-[#22C55E]/30 text-[#166534] text-xs font-semibold rounded-full"
              >
                🏅 {b.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};