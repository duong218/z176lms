import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Circle,
  List,
  ListChecks,
  Flag,
  Info,
  ShieldAlert,
  Lock,
  Building2,
} from 'lucide-react';
import { Z176_COMPANY_INFO } from '../data';
import { fetchMyResults } from '../services/report.service';
import {
  fetchMyExam,
  startExamAttempt,
  submitExamAttempt,
  answerExamQuestion,
  sendExamHeartbeat,
  reportExamLeave,
} from '../services/exam-attempt.service';
import { useScrollLock } from '../hooks/useScrollLock';

// ── Cỡ chữ khi làm bài: 3 mức cố định, nhớ theo THIẾT BỊ (không theo kỳ thi) ──
// q = cỡ chữ câu hỏi, a = cỡ chữ đáp án (px). Mức mặc định đã >= 17px theo design-system (Body Lớn).
const FONT_KEY = 'z176.examFontLevel';
const FONT_LEVELS = [
  { label: 'Vừa', q: 19, a: 17 },
  { label: 'Lớn', q: 22, a: 20 },
  { label: 'Rất lớn', q: 26, a: 23 },
];

// ── Thành phần giao diện dùng lại (chỉ hiển thị, không chứa nghiệp vụ) ─────────
// Nút theo design-system: cao >= 52px, bo 10px, chữ 16px/600, focus ring rõ.
const BTN_BASE =
  'min-h-[52px] px-5 rounded-[10px] text-base font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30';
const BTN_PRIMARY = `${BTN_BASE} bg-[#008BC5] text-white hover:bg-[#0693E3] active:bg-[#006BA1]`;
const BTN_SECONDARY = `${BTN_BASE} bg-white text-[#006BA1] border-[1.5px] border-[#008BC5] hover:bg-[#F0F9FF] active:bg-[#F0F9FF]`;
const BTN_SUCCESS = `${BTN_BASE} bg-[#15803D] text-white hover:bg-[#166534] active:bg-[#14532D]`;

const TONES = {
  warn: { bg: 'bg-[#FFF7E6]', icon: 'text-[#B45309]' },
  danger: { bg: 'bg-[#FEECEC]', icon: 'text-[#C53030]' },
  success: { bg: 'bg-[#F0FDF4]', icon: 'text-[#166534]' },
  info: { bg: 'bg-[#EAF6FF]', icon: 'text-[#006BA1]' },
};

/** Màn hình trạng thái giữa trang: icon + tiêu đề + nội dung + nút. Dùng cho lỗi, tự nộp, bị chặn tab... */
const StatusScreen = ({ icon: Icon, tone = 'info', title, children, footer }) => (
  <div
    className="flex-1 overflow-y-auto bg-[#F6F8FA] p-6 flex flex-col items-center justify-center text-center gap-4"
    data-lenis-prevent
  >
    <div className={`w-20 h-20 rounded-full flex items-center justify-center ${TONES[tone].bg}`}>
      <Icon className={`w-10 h-10 ${TONES[tone].icon}`} aria-hidden="true" />
    </div>
    <h3 className="text-2xl font-bold text-[#0F172A] leading-snug">{title}</h3>
    <div className="text-base text-[#334155] max-w-md space-y-3 leading-relaxed">{children}</div>
    {footer}
  </div>
);

/** Vòng tròn điểm số (SVG phẳng, không gradient). Màu theo kết quả, kèm chữ số ở giữa. */
const ScoreRing = ({ score, passed }) => {
  const r = 70;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, Number(score) || 0));
  return (
    <div className="relative w-44 h-44 mx-auto" role="img" aria-label={`Điểm ${pct} trên 100`}>
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={passed ? '#22C55E' : '#E53E3E'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-extrabold text-[#0F172A] leading-none">{pct}</span>
        <span className="text-base text-[#334155] mt-1">/ 100 điểm</span>
      </div>
    </div>
  );
};
function loadFontLevel() {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    return n >= 0 && n < FONT_LEVELS.length ? n : 0;
  } catch {
    return 0; // localStorage bị chặn — dùng mức mặc định
  }
}

// ── Lưu tạm tiến trình đang làm dở vào localStorage ─────────────────────────
// Chỉ để tránh mất lựa chọn khi reload trang giữa chừng TRÊN CÙNG THIẾT BỊ.
// Điểm số/chấm điểm thật vẫn luôn do backend quyết định lúc nộp bài
// (submitExamAttempt), dữ liệu này KHÔNG được tin tưởng để tính điểm.
//
// Nguồn sự thật để KHÔI PHỤC lựa chọn khi mở lại (kể cả từ thiết bị khác) là
// `savedAnswers` server trả về trong fetchMyExam() — localStorage chỉ là lớp
// dự phòng cho trường hợp offline tạm thời trước khi autosave kịp gửi lên.
// ── Khóa "mỗi lúc chỉ 1 tab thi" ─────────────────────────────
// Token đăng nhập nằm trong localStorage nên mọi tab của cùng 1 trình duyệt dùng chung phiên (tokenVersion không phân
// biệt được). Khóa này ngăn mở bài thi ở tab thứ 2: tab đang thi ghi dấu + làm mới định kỳ; khóa quá hạn (tab bị tắt
// đột ngột) tự mất hiệu lực nên thí sinh không bị kẹt. Đây chỉ là lớp UX — lớp bảo vệ thật là chỉ mục duy nhất ở server.
const TAB_LOCK_KEY = 'z176.examTabLock';
const TAB_LOCK_TTL_MS = 12_000; // quá hạn này không làm mới -> coi như tab cũ đã chết
const TAB_LOCK_BEAT_MS = 4_000; // chu kỳ làm mới khóa
const TAB_LOCK_POLL_MS = 2_000; // tab bị chặn tự thử lại
const TAB_LOCK_VERIFY_MS = 150; // chờ rồi đọc lại để phân thắng bại khi 2 tab ghi khóa cùng lúc
const TAB_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readTabLock() {
  try {
    const raw = localStorage.getItem(TAB_LOCK_KEY);
    const lock = raw ? JSON.parse(raw) : null;
    return lock && typeof lock === 'object' ? lock : null;
  } catch {
    return null;
  }
}
function isTabLockLive(lock, userId) {
  return Boolean(lock) && String(lock.userId) === String(userId) && Date.now() - Number(lock.ts) < TAB_LOCK_TTL_MS;
}
function writeTabLock(userId) {
  try {
    localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tabId: TAB_ID, userId: String(userId), ts: Date.now() }));
    return true;
  } catch {
    return false; // localStorage bị chặn -> không khóa được, cho qua để không chặn nhầm thí sinh
  }
}
function releaseTabLock() {
  try {
    if (readTabLock()?.tabId === TAB_ID) localStorage.removeItem(TAB_LOCK_KEY);
  } catch {
    /* bỏ qua */
  }
}

const draftKey = (attemptId) => `z176_exam_draft_${attemptId}`;

function loadDraftAnswers(attemptId) {
  if (!attemptId) return {};
  try {
    const raw = localStorage.getItem(draftKey(attemptId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraftAnswers(attemptId, answers) {
  if (!attemptId) return;
  try {
    localStorage.setItem(draftKey(attemptId), JSON.stringify(answers));
  } catch {
    /* localStorage đầy/bị chặn — bỏ qua, không chặn luồng làm bài */
  }
}

function clearDraftAnswers(attemptId) {
  if (!attemptId) return;
  try {
    localStorage.removeItem(draftKey(attemptId));
  } catch {
    /* ignore */
  }
}

/** Chuyển savedAnswers dạng mảng [{questionId, selectedAnswerIds}] từ server
 * thành object { [questionId]: string[] } để khớp với state selectedAnswers. */
function savedAnswersToMap(savedAnswers) {
  const map = {};
  for (const item of savedAnswers ?? []) {
    if (!item?.questionId) continue;
    map[item.questionId] = Array.isArray(item.selectedAnswerIds) ? item.selectedAnswerIds : [];
  }
  return map;
}

// Client heartbeat mỗi 15s trong khi tab đang hiển thị — backend tính timeout
// dựa trên lastActiveAt (mốc server nhận request gần nhất), không phải đồng hồ
// client, nên khoảng heartbeat này chỉ cần đủ dày để phát hiện sớm, không cần
// chính xác tuyệt đối.
const HEARTBEAT_INTERVAL_MS = 15_000;

// Số giây đếm ngược cảnh báo "rời màn hình thi" trước khi tự nộp bài với đáp
// án hiện tại. Đây là lớp cảnh báo SỚM, RÕ RÀNG cho thí sinh thấy ngay — khác
// với cơ chế heartbeat/auto-submit sau 1 phút "im lặng" đã có sẵn ở backend
// (vẫn giữ nguyên, không đụng vào, đây chỉ là lớp UI cảnh báo thuần client).
const LEAVE_WARNING_SECONDS = 10;

export const ExamModal = ({ isOpen, onClose, currentUser, onOpenLogin }) => {
  useScrollLock(isOpen);

  // step: 'loading' | 'confirm' | 'testing' | 'submitting' | 'result' | 'auto-submitted' | 'error'
  const [step, setStep] = useState('loading');
  const [loadError, setLoadError] = useState(null);

  // Thông tin nhân viên thật (currentUser chỉ có id/username/roleCode, không có
  // họ tên/mã NV/phòng ban — phải lấy riêng, giống CandidateDashboard).
  const [employee, setEmployee] = useState(null);

  // Dữ liệu đề thi + trạng thái lượt thi lấy từ GET /exam-attempts/my-exam
  const [examData, setExamData] = useState(null);

  // MỚI — Vai trò (phòng ban) thí sinh đang chọn để thi. Mặc định = vai trò backend gán sẵn (phòng chính);
  // chỉ đổi được khi role.locked = false và thí sinh có phòng kiêm nhiệm.
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  // Lượt thi đang làm (sau khi bấm bắt đầu / resume)
  const [attemptId, setAttemptId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [fontLevel, setFontLevel] = useState(loadFontLevel);
  const fontSizes = FONT_LEVELS[fontLevel];
  const changeFontLevel = (delta) => {
    const next = Math.min(FONT_LEVELS.length - 1, Math.max(0, fontLevel + delta));
    setFontLevel(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {
      /* localStorage đầy/bị chặn — vẫn dùng được trong phiên này */
    }
  };
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: string[] }
  const [examSecondsLeft, setExamSecondsLeft] = useState(0);
  const [submitError, setSubmitError] = useState(null);

  // Ảnh minh hoạ đề bài (currentQ.imageUrl) bị lỗi tải (link hỏng, mất mạng...)
  // — reset về false mỗi khi chuyển câu, KHÔNG chặn thí sinh làm bài, chỉ ẩn
  // ảnh và hiện chú thích thay thế.
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // Chế độ xem: khi bật, thay TOÀN BỘ vùng nội dung câu hỏi bằng màn hình danh
  // sách câu hỏi full-height (thay vì chèn 1 khung nhỏ phía trên như trước) —
  // để thoải mái cuộn/chọn khi đề có 30-50 câu, đặc biệt trên điện thoại.
  // Thuần UI, không ảnh hưởng dữ liệu.
  const [showQuestionGrid, setShowQuestionGrid] = useState(false);

  // Hiện cảnh báo xác nhận trước khi nộp bài nếu còn câu chưa trả lời — tránh
  // thí sinh bấm nhầm "NỘP BÀI THI" khi đề dài (30-50 câu) mà chưa làm hết.
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // Câu thí sinh tự đánh dấu "xem lại" — chỉ để nhắc bản thân trên màn hình này, KHÔNG gửi server, không ảnh hưởng điểm.
  const [flagged, setFlagged] = useState({}); // { [questionId]: true }

  // ── Cảnh báo "rời màn hình thi" (chuyển tab/app, alt-tab, khoá máy...) ────
  // Hiện overlay ngay lập tức + đếm ngược LEAVE_WARNING_SECONDS giây. Quay lại
  // trước khi hết giờ thì huỷ, không ảnh hưởng gì. Hết giờ thì tự nộp bài với
  // đáp án hiện có (giống hệt luồng auto-submit đã có, chỉ rút ngắn thời gian
  // và có cảnh báo rõ ràng thay vì âm thầm).
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [leaveSecondsLeft, setLeaveSecondsLeft] = useState(LEAVE_WARNING_SECONDS);
  const leaveDeadlineRef = useRef(null);
  const leaveIntervalRef = useRef(null);
  const leaveActiveRef = useRef(false);

  const [resultData, setResultData] = useState(null);
  // Lý do bài bị hệ thống tự nộp ('inactive_timeout' | 'exam_replaced') và điểm (nếu server trả kèm) — để hiện đúng thông báo
  const [autoSubmitReason, setAutoSubmitReason] = useState(null);
  const [autoSubmitResult, setAutoSubmitResult] = useState(null);

  const finishingRef = useRef(false);

  // Chặn bấm đúp / 2 request /start chạy song song (mỗi request có thể tạo 1 lượt thi riêng).

  const startingRef = useRef(false);

  const [starting, setStarting] = useState(false);
  // Giữ attemptId mới nhất trong ref để heartbeat/interval luôn đọc đúng giá
  // trị hiện tại mà không phải dựng lại interval mỗi lần state đổi.
  const attemptIdRef = useRef(null);
  // Giữ step mới nhất trong ref — cần cho listener rời-màn-hình vì listener
  // được đăng ký ở cấp document/window, phải luôn biết step "testing" có còn
  // đúng không tại thời điểm sự kiện xảy ra, không phải lúc effect chạy.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Chỉ phụ thuộc id (không phải cả object currentUser): App.jsx có thể cập nhật currentUser
  // giữa chừng (vd admin sửa họ tên) và việc đó KHÔNG được reset bài thi đang làm.
  const currentUserId = currentUser?.id ?? null;

  // ── Giữ khóa 1 tab ────────────────────────────────────────
  // lockOk = tab này đã giữ khóa và được phép tải/bắt đầu bài thi. Chưa đăng nhập thì không cần khóa.
  const [lockOk, setLockOk] = useState(false);
  useEffect(() => {
    if (!isOpen || !currentUserId) {
      setLockOk(false);
      return undefined;
    }

    let disposed = false;
    let beatTimer = null;
    let pollTimer = null;
    let polling = false;

    const startBeat = () => {
      if (beatTimer) return;
      beatTimer = setInterval(() => {
        const lock = readTabLock();
        // Tab đang giữ khóa luôn được ưu tiên làm mới mốc thời gian (khóa trống / của mình / đã quá hạn).
        if (!lock || lock.tabId === TAB_ID || !isTabLockLive(lock, currentUserId)) writeTabLock(currentUserId);
      }, TAB_LOCK_BEAT_MS);
    };

    const tryAcquire = async () => {
      const lock = readTabLock();
      if (lock && lock.tabId !== TAB_ID && isTabLockLive(lock, currentUserId)) return false;
      if (!writeTabLock(currentUserId)) return true;
      await new Promise((resolve) => setTimeout(resolve, TAB_LOCK_VERIFY_MS));
      const after = readTabLock();
      return !after || after.tabId === TAB_ID;
    };

    const onAcquired = () => {
      setLockOk(true);
      startBeat();
    };

    setLockOk(false);
    setStep('loading');
    tryAcquire().then((ok) => {
      if (disposed) return;
      if (ok) {
        onAcquired();
        return;
      }
      setStep('tab-blocked');
      pollTimer = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          if ((await tryAcquire()) && !disposed) {
            clearInterval(pollTimer);
            pollTimer = null;
            onAcquired();
          }
        } finally {
          polling = false;
        }
      }, TAB_LOCK_POLL_MS);
    });

    window.addEventListener('pagehide', releaseTabLock);
    return () => {
      disposed = true;
      if (beatTimer) clearInterval(beatTimer);
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener('pagehide', releaseTabLock);
      releaseTabLock();
    };
  }, [isOpen, currentUserId]);

  // ── Tải dữ liệu khi mở modal ─────────────────────────────
  // Chỉ phụ thuộc id (không phải cả object currentUser): App.jsx có thể cập nhật currentUser
  // giữa chừng (vd admin sửa họ tên) và việc đó KHÔNG được reset bài thi đang làm.
  useEffect(() => {
    if (!isOpen) return;
    if (!currentUserId) {
      setStep('confirm');
      return;
    }
    if (!lockOk) return; // chưa giữ được khóa 1 tab (đang chờ hoặc bị chặn) -> chưa tải bài thi

    let cancelled = false;
    setStep('loading');
    setLoadError(null);
    setResultData(null);
    setAutoSubmitReason(null);
    setAutoSubmitResult(null);
    setAttemptId(null);
    setExpiresAt(null);
    setSelectedAnswers({});
    setCurrentQuestionIndex(0);
    setFlagged({});
    setSelectedRoleId(null);
    finishingRef.current = false;

    Promise.all([fetchMyResults(), fetchMyExam()])
      .then(([resultsData, exam]) => {
        if (cancelled) return;
        setEmployee(resultsData?.employee ?? null);
        setExamData(exam);
        setSelectedRoleId(exam?.role?.departmentId ? String(exam.role.departmentId) : null);

        // Nếu đang có lượt thi dở (resume, kể cả từ thiết bị/trình duyệt khác),
        // khôi phục ngay đáp án đã autosave trên server — đây là nguồn sự thật,
        // không phải localStorage (localStorage chỉ đúng trên đúng thiết bị đó).
        if (exam?.attempt) {
          setAttemptId(exam.attempt.id);
          setExpiresAt(exam.attempt.expiresAt ? new Date(exam.attempt.expiresAt) : null);
          setSelectedAnswers(savedAnswersToMap(exam.savedAnswers));
        }

        setStep('confirm');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Không thể tải dữ liệu bài thi.');
        setStep('error');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUserId, lockOk]);

  // ── Bắt đầu / tiếp tục lượt thi ────────────────────────────
  const handleStartExam = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      setSubmitError(null);
      // Vai trò đã khóa thì không gửi lại; chưa khóa thì gửi vai trò thí sinh đang chọn để backend xác nhận & khóa.
      const roleToSend = examData?.role && !examData.role.locked ? selectedRoleId : undefined;
      const data = await startExamAttempt(roleToSend || undefined);
      setAttemptId(data.attemptId);
      setExpiresAt(new Date(data.expiresAt));

      // Lấy lại đề thi ngay sau khi bắt đầu/tiếp tục lượt thi — lúc này backend
      // đã có attempt "in_progress" nên trả về đúng bộ câu/đáp án đã xáo riêng
      // cho lượt thi này, thay vì bản preview mặc định (chưa xáo) lúc xác nhận.
      // Đồng thời trả kèm savedAnswers — nếu là resume (kể cả từ thiết bị
      // khác) thì đây chính là chỗ khôi phục đúng các lựa chọn đã chọn trước đó.
      const freshExamData = await fetchMyExam();
      setExamData(freshExamData);
      if (freshExamData?.role?.departmentId) setSelectedRoleId(String(freshExamData.role.departmentId));
      setSelectedAnswers(savedAnswersToMap(freshExamData?.savedAnswers));

      setStep('testing');
    } catch (err) {
      setSubmitError(err?.message || 'Không thể bắt đầu lượt thi.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  // ── Nộp bài (thí sinh tự bấm) ─────────────────────────────
  const handleFinishExam = useCallback(async () => {
    if (!attemptId || finishingRef.current) return;
    finishingRef.current = true;
    setStep('submitting');

    const answers = (examData?.questions ?? []).map((q) => ({
      questionId: q.id,
      selectedAnswerIds: selectedAnswers[q.id] || [],
    }));

    try {
      const data = await submitExamAttempt(attemptId, answers);
      clearDraftAnswers(attemptId);
      if (['exam_replaced', 'exam_ended'].includes(data?.autoSubmitReason)) {
        // Bài đã được hệ thống nộp trước đó (kỳ thi bị thay thế / hết hạn) -> báo đúng lý do kèm điểm đã lưu
        setAutoSubmitReason(data.autoSubmitReason);
        setAutoSubmitResult(data);
        setStep('auto-submitted');
      } else {
        setResultData(data);
        setStep('result');
      }
    } catch (err) {
      if ((err?.code === 'EXAM_REPLACED' || err?.code === 'EXAM_CLOSED')) {
        clearDraftAnswers(attemptId);
        setAutoSubmitReason(err.code === 'EXAM_CLOSED' ? 'exam_ended' : 'exam_replaced');
        setStep('auto-submitted');
      } else {
        setSubmitError(err?.message || 'Nộp bài thất bại, vui lòng thử lại.');
        setStep('testing');
      }
    } finally {
      finishingRef.current = false;
    }
  }, [attemptId, examData, selectedAnswers]);

  // ── Đồng hồ đếm ngược — tính theo expiresAt thật của server ─
  useEffect(() => {
    if (step !== 'testing' || !expiresAt) return;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setExamSecondsLeft(secondsLeft);
      if (secondsLeft <= 0) {
        handleFinishExam();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step, expiresAt, handleFinishExam]);

  // Khôi phục lựa chọn đã lưu tạm trong localStorage (nếu có) ngay khi biết
  // attemptId — chỉ dùng làm lớp dự phòng bổ sung cho những câu CHƯA có trong
  // savedAnswers từ server (vd vừa chọn xong nhưng autosave chưa kịp gửi lên
  // trước khi F5). Không ghi đè lên đáp án đã có từ server.
  useEffect(() => {
    if (!attemptId) return;
    const draft = loadDraftAnswers(attemptId);
    if (Object.keys(draft).length > 0) {
      setSelectedAnswers((prev) => ({ ...draft, ...prev }));
    }
  }, [attemptId]);

  // ── Giữ attemptIdRef đồng bộ với state để interval bên dưới luôn đọc đúng ──
  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // Reset trạng thái "ảnh lỗi tải" mỗi khi chuyển sang câu khác — tránh 1 ảnh
  // lỗi ở câu trước làm ẩn nhầm ảnh hợp lệ của câu sau.
  useEffect(() => {
    setImageLoadFailed(false);
  }, [currentQuestionIndex]);

  // ── Heartbeat định kỳ trong lúc đang làm bài ─────────────────────────────
  // Chỉ gửi khi tab đang thực sự hiển thị (document.visibilityState==='visible')
  // — đúng yêu cầu ban đầu, tránh heartbeat "ma" khi thí sinh đang ở tab khác.
  // Nếu backend phát hiện đã rời quá 1 phút (autoSubmitReason khác null), coi
  // như bài đã bị hệ thống tự nộp — dừng làm bài ngay và hiện đúng thông báo.
  // Lớp này KHÔNG đổi — cảnh báo 10s bên dưới là lớp UI bổ sung, không thay
  // thế cơ chế 1-phút-im-lặng này (phòng trường hợp thí sinh rời tab nhưng
  // JS bị treo/throttle nặng và overlay không kịp bắn).
  useEffect(() => {
    if (step !== 'testing' || !attemptId) return;

    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;
      try {
        const data = await sendExamHeartbeat(currentAttemptId);
        if (cancelled) return;
        if (data?.autoSubmitReason) {
          clearDraftAnswers(currentAttemptId);
          setAutoSubmitReason(data.autoSubmitReason);
          if (data.result) setAutoSubmitResult(data.result);
          setStep('auto-submitted');
        }
      } catch (err) {
        if (!cancelled && (err?.code === 'EXAM_REPLACED' || err?.code === 'EXAM_CLOSED')) {
          clearDraftAnswers(currentAttemptId);
          setAutoSubmitReason(err.code === 'EXAM_CLOSED' ? 'exam_ended' : 'exam_replaced');
          setStep('auto-submitted');
        }
        // Lỗi mạng tạm thời khi heartbeat — bỏ qua, thử lại ở lần kế tiếp,
        // không làm gián đoạn bài thi vì 1 lần heartbeat lỡ nhịp.
      }
    };

    // Gửi ngay 1 lần khi vào testing (không đợi đủ 15s đầu tiên), và mỗi khi
    // tab quay lại hiển thị — để bắt kịp trường hợp thí sinh rời tab >1 phút
    // rồi quay lại ngay, thay vì phải đợi tới chu kỳ interval kế tiếp.
    beat();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [step, attemptId]);

  // ── Cảnh báo rời màn hình thi + đếm ngược 10s ────────────────────────────
  // Bắt CẢ 2 nguồn sự kiện để không lọt trường hợp nào:
  // - visibilitychange -> 'hidden': đổi tab, đóng/mở app khác trên mobile,
  //   khoá màn hình, tắt màn hình.
  // - window 'blur': bắt cả trường hợp alt-tab sang cửa sổ khác nhưng tab
  //   trình duyệt vẫn kỹ thuật "visible" (visibilitychange không bắn).
  // Dùng chung 1 hàm start/cancel, có cờ leaveActiveRef để tránh 2 sự kiện
  // cùng lúc dựng 2 interval chồng nhau.
  const clearLeaveTimer = useCallback(() => {
    if (leaveIntervalRef.current) {
      clearInterval(leaveIntervalRef.current);
      leaveIntervalRef.current = null;
    }
  }, []);

  const cancelLeaveWarning = useCallback(() => {
    leaveActiveRef.current = false;
    leaveDeadlineRef.current = null;
    clearLeaveTimer();
    setShowLeaveWarning(false);
    setLeaveSecondsLeft(LEAVE_WARNING_SECONDS);
  }, [clearLeaveTimer]);

  const startLeaveWarning = useCallback(() => {
    if (stepRef.current !== 'testing') return;
    if (leaveActiveRef.current) return; // đã đang đếm rồi, không dựng lại
    leaveActiveRef.current = true;
    // Báo server đếm 1 lần rời màn hình (chỉ để Người duyệt đề xem dấu hiệu). Lỗi mạng bỏ qua, không ảnh hưởng bài thi.
    if (attemptIdRef.current) reportExamLeave(attemptIdRef.current).catch(() => {});

    const deadline = Date.now() + LEAVE_WARNING_SECONDS * 1000;
    leaveDeadlineRef.current = deadline;
    setLeaveSecondsLeft(LEAVE_WARNING_SECONDS);
    setShowLeaveWarning(true);

    // Tính theo deadline thời gian thực (Date.now()) chứ không đếm theo số
    // lần tick — nên vẫn ra đúng kết quả ngay cả khi trình duyệt throttle
    // setInterval lúc tab ẩn (delay tick không làm sai tổng thời gian).
    clearLeaveTimer();
    leaveIntervalRef.current = setInterval(() => {
      const remainingMs = leaveDeadlineRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setLeaveSecondsLeft(remainingSec);
      if (remainingMs <= 0) {
        clearLeaveTimer();
        leaveActiveRef.current = false;
        setShowLeaveWarning(false);
        handleFinishExam();
      }
    }, 500);
  }, [clearLeaveTimer, handleFinishExam]);

  useEffect(() => {
    if (step !== 'testing') {
      // Rời khỏi bước testing (đã nộp bài, đóng modal...) — dọn sạch cảnh báo
      // đang treo nếu có, tránh countdown chạy ngầm vô nghĩa.
      cancelLeaveWarning();
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        startLeaveWarning();
      } else if (document.visibilityState === 'visible') {
        cancelLeaveWarning();
      }
    };
    const handleBlur = () => startLeaveWarning();
    const handleFocus = () => cancelLeaveWarning();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearLeaveTimer();
    };
  }, [step, startLeaveWarning, cancelLeaveWarning, clearLeaveTimer]);

  // ── Chặn copy nội dung câu hỏi/đáp án (mức răn đe, không chặn screenshot) ─
  const handleBlockCopy = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ── Autosave 1 câu trả lời lên server, không chặn UI (fire-and-forget) ───
  const answerRequestSeqRef = useRef(0);
  const autosaveAnswer = useCallback(
    async (questionId, selectedAnswerIds) => {
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;
      const seq = ++answerRequestSeqRef.current;
      try {
        const data = await answerExamQuestion(currentAttemptId, questionId, selectedAnswerIds);
        // Nếu có request answer khác đã chạy sau request này, bỏ qua kết quả
        // cũ để tránh xử lý autoSubmit trùng/lệch thứ tự.
        if (seq !== answerRequestSeqRef.current) return;
        if (data?.autoSubmitReason) {
          clearDraftAnswers(currentAttemptId);
          setAutoSubmitReason(data.autoSubmitReason);
          setStep('auto-submitted');
        }
      } catch (err) {
        // Kỳ thi bị thay thế (Người duyệt đề đăng kỳ thi mới) giữa lúc đang gửi câu trả lời.
        if ((err?.code === 'EXAM_REPLACED' || err?.code === 'EXAM_CLOSED')) {
          clearDraftAnswers(currentAttemptId);
          setAutoSubmitReason(err.code === 'EXAM_CLOSED' ? 'exam_ended' : 'exam_replaced');
          setStep('auto-submitted');
          return;
        }
        // Backend trả lỗi ATTEMPT_INVALID_STATUS nếu lượt thi vừa bị tự nộp
        // ngay giữa lúc client đang gửi câu trả lời — coi như đã tự nộp.
        if (err?.code === 'ATTEMPT_INVALID_STATUS') {
          clearDraftAnswers(currentAttemptId);
          setStep('auto-submitted');
        }
        // Các lỗi mạng khác: bỏ qua, đáp án vẫn còn trong localStorage draft
        // và selectedAnswers state, sẽ tự thử gửi lại ở lần chọn tiếp theo.
      }
    },
    [],
  );

  if (!isOpen) return null;

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const questions = examData?.questions ?? [];
  const currentQ = questions[currentQuestionIndex];
  const answeredCount = Object.keys(selectedAnswers).filter((qId) => (selectedAnswers[qId] || []).length > 0).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSelectOption = (question, optionId) => {
    setSelectedAnswers((prev) => {
      const prevSelected = prev[question.id] || [];
      const next =
        question.answerType === 'multiple'
          ? prevSelected.includes(optionId)
            ? prevSelected.filter((id) => id !== optionId)
            : [...prevSelected, optionId]
          : [optionId];
      const updated = { ...prev, [question.id]: next };
      saveDraftAnswers(attemptId, updated);
      autosaveAnswer(question.id, next);
      return updated;
    });
  };

  const unansweredIndexes = questions
    .map((q, idx) => ({ idx, answered: (selectedAnswers[q.id] || []).length > 0 }))
    .filter((x) => !x.answered)
    .map((x) => x.idx);

  const handleJumpToQuestion = (index) => {
    setCurrentQuestionIndex(index);
    setShowQuestionGrid(false);
    setConfirmSubmitOpen(false);
  };

  // Bấm "Nộp bài": luôn hiện hộp xác nhận (kể cả khi đã làm hết) để tránh bấm nhầm;
  // nộp thật chỉ diễn ra khi thí sinh bấm xác nhận trong hộp thoại.
  const handleRequestFinishExam = () => {
    setShowQuestionGrid(false);
    setConfirmSubmitOpen(true);
  };

  const toggleFlag = (questionId) => setFlagged((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  const flaggedCount = questions.filter((q) => flagged[q.id]).length;
  const lowTime = examSecondsLeft <= 300;

  const exam = examData?.exam;

  const renderFontControls = () => (
                  <div className="flex items-center gap-2" role="group" aria-label="Cỡ chữ câu hỏi">
                    <span className="text-sm font-semibold text-[#334155]">Cỡ chữ</span>
                    <button
                      type="button"
                      onClick={() => changeFontLevel(-1)}
                      disabled={fontLevel === 0}
                      aria-label="Giảm cỡ chữ"
                      className="h-11 min-w-[44px] px-2 rounded-[10px] border-[1.5px] border-[#CBD5E1] bg-white font-bold text-base text-[#0F172A] hover:bg-[#F0F9FF] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
                    >
                      A−
                    </button>
                    <span className="min-w-[56px] text-center text-sm font-semibold text-[#0F172A]" aria-live="polite">
                      {fontSizes.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeFontLevel(1)}
                      disabled={fontLevel === FONT_LEVELS.length - 1}
                      aria-label="Tăng cỡ chữ"
                      className="h-11 min-w-[44px] px-2 rounded-[10px] border-[1.5px] border-[#CBD5E1] bg-white font-bold text-xl text-[#0F172A] hover:bg-[#F0F9FF] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
                    >
                      A+
                    </button>
                  </div>
  );

  const renderLegend = () => (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#334155]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#008BC5] shrink-0" aria-hidden="true" /> Đang xem
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-md bg-[#EAF6FF] border-[1.5px] border-[#008BC5] shrink-0"
                          aria-hidden="true"
                        />{' '}
                        Đã làm
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-md bg-white border-[1.5px] border-[#CBD5E1] shrink-0"
                          aria-hidden="true"
                        />{' '}
                        Chưa làm
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Flag className="w-4 h-4 text-[#B45309]" fill="currentColor" aria-hidden="true" /> Xem lại
                        {flaggedCount > 0 && ` (${flaggedCount})`}
                      </span>
                    </div>
  );

  const renderGrid = (gridClass) => (
                    <div className={gridClass}>
                      {questions.map((q, idx) => {
                        const isAnswered = (selectedAnswers[q.id] || []).length > 0;
                        const isCurrent = idx === currentQuestionIndex;
                        const isFlagged = Boolean(flagged[q.id]);
                        return (
                          <button
                            key={q.id}
                            onClick={() => handleJumpToQuestion(idx)}
                            className={`relative aspect-square min-h-[48px] rounded-lg text-base font-bold flex items-center justify-center border-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30 ${
                              isCurrent
                                ? 'bg-[#008BC5] border-[#008BC5] text-white'
                                : isAnswered
                                  ? 'bg-[#EAF6FF] border-[#008BC5] text-[#006BA1]'
                                  : 'bg-white border-[#CBD5E1] text-[#334155] hover:bg-[#F6F8FA]'
                            }`}
                            aria-label={`Câu ${idx + 1}, ${isAnswered ? 'đã làm' : 'chưa làm'}${isFlagged ? ', đã đánh dấu xem lại' : ''}${isCurrent ? ', đang xem' : ''}`}
                            aria-current={isCurrent ? 'true' : undefined}
                          >
                            {idx + 1}
                            {isAnswered && !isCurrent && (
                              <Check
                                className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-[#008BC5]"
                                strokeWidth={3}
                                aria-hidden="true"
                              />
                            )}
                            {isFlagged && (
                              <Flag
                                className="absolute top-0.5 left-0.5 w-3.5 h-3.5 text-[#F6AD37]"
                                fill="currentColor"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 sm:flex sm:items-center sm:justify-center sm:p-4" data-lenis-prevent>
      <div className="relative bg-white w-full h-[100dvh] sm:h-[92dvh] sm:max-h-[900px] sm:max-w-3xl lg:h-[94dvh] lg:max-h-[960px] lg:max-w-[1180px] xl:max-w-[1320px] sm:rounded-xl sm:border sm:border-[#E2E8F0] sm:shadow-2xl overflow-hidden flex flex-col">
        {/* Cảnh báo rời màn hình thi: che toàn bộ, chỉ còn 1 việc để làm là quay lại. */}
        {showLeaveWarning && step === 'testing' && (
          <div
            className="absolute inset-0 z-[60] bg-[#0F172A]/80 flex items-center justify-center p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <div className="w-full max-w-sm bg-white rounded-xl p-6 text-center space-y-4 shadow-z176">
              <div className="w-16 h-16 rounded-full bg-[#FFF7E6] flex items-center justify-center mx-auto">
                <ShieldAlert className="w-9 h-9 text-[#B45309]" aria-hidden="true" />
              </div>
              <h3 id="leave-title" className="text-xl font-bold text-[#0F172A]">
                Bạn vừa rời khỏi màn hình thi
              </h3>
              <p className="text-base text-[#334155] leading-relaxed">
                Hãy quay lại ngay. Nếu không, bài thi sẽ tự động nộp với các đáp án bạn đang chọn.
              </p>
              <div className="rounded-xl bg-[#FEECEC] py-4">
                <div className="text-5xl font-extrabold text-[#C53030] font-mono tabular-nums leading-none">
                  {leaveSecondsLeft}
                </div>
                <div className="text-base font-semibold text-[#C53030] mt-1">giây nữa tự nộp bài</div>
              </div>
            </div>
          </div>
        )}

        {/* Thanh thương hiệu: chỉ hiện ngoài lúc làm bài để dành chỗ cho câu hỏi. */}
        {step !== 'testing' && (
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-white border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[10px] bg-[#008BC5] text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">
                  Hệ thống thi trực tuyến Z176
                </h2>
                <p className="hidden sm:block text-sm text-[#334155] truncate">An toàn lao động &amp; Quy chế nội bộ</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[10px] font-semibold text-[#334155] hover:bg-[#F6F8FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
              aria-label="Đóng giao diện thi"
            >
              <X className="w-5 h-5" aria-hidden="true" />
              <span>Đóng</span>
            </button>
          </header>
        )}

        {/* BỊ CHẶN: bài thi đang mở ở tab khác của cùng trình duyệt */}
        {step === 'tab-blocked' && (
          <StatusScreen
            icon={ShieldAlert}
            tone="warn"
            title="Bài thi đang mở ở tab khác"
            footer={
              <button onClick={onClose} className={`${BTN_SECONDARY} min-w-[160px]`}>
                Đóng
              </button>
            }
          >
            <p>
              Mỗi lúc chỉ được làm bài ở một tab. Hãy quay lại tab đang thi, hoặc đóng tab đó rồi quay lại đây. Trang này
              sẽ tự mở khi tab kia đóng.
            </p>
          </StatusScreen>
        )}

        {/* LOADING */}
        {step === 'loading' && (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F6F8FA] text-[#334155]"
            role="status"
          >
            <Loader2 className="w-10 h-10 animate-spin text-[#008BC5]" aria-hidden="true" />
            <span className="text-base font-medium">Đang tải dữ liệu bài thi...</span>
          </div>
        )}

        {/* ERROR (không lấy được đề, chưa được gán đề, chưa có kỳ thi active...) */}
        {step === 'error' && (
          <StatusScreen
            icon={AlertCircle}
            tone="danger"
            title="Chưa thể vào phòng thi"
            footer={
              <button onClick={onClose} className={`${BTN_SECONDARY} min-w-[160px]`}>
                Đóng
              </button>
            }
          >
            <p className="font-semibold text-[#0F172A]">{loadError}</p>
          </StatusScreen>
        )}

        {/* ── MÀN HÌNH XÁC NHẬN TRƯỚC KHI THI ─────────────────────────────────
            Nút bắt đầu nằm ở thanh đáy cố định nên luôn thấy được, không phải cuộn hết nội quy. */}
        {step === 'confirm' && (
          <>
            <div className="flex-1 overflow-y-auto bg-[#F6F8FA]" data-lenis-prevent>
              <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 space-y-4 lg:max-w-6xl lg:px-8 lg:py-8 lg:grid lg:grid-cols-12 lg:gap-x-8 lg:gap-y-0 lg:space-y-0 lg:items-start">
                <div className={`space-y-4 ${currentUser ? 'lg:col-span-5' : 'lg:col-span-12 lg:max-w-xl lg:mx-auto lg:w-full'}`}>
                {/* Chưa đăng nhập */}
                {!currentUser && (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-z176 text-center space-y-3">
                    <div className="w-14 h-14 rounded-full bg-[#EAF6FF] flex items-center justify-center mx-auto">
                      <Lock className="w-7 h-7 text-[#006BA1]" aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-bold text-[#0F172A]">Vui lòng đăng nhập để vào thi</h3>
                    <p className="text-base text-[#334155]">Bạn cần đăng nhập bằng tài khoản được cấp để làm bài.</p>
                  </div>
                )}

                {currentUser && exam && (
                  <>
                    {/* Tên kỳ thi + 3 con số cần biết */}
                    <div>
                      <p className="text-sm font-semibold text-[#006BA1]">Kỳ thi hiện hành</p>
                      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#0F172A] leading-snug mt-0.5">{exam.title}</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { icon: ListChecks, value: exam.totalQuestions, label: 'câu hỏi' },
                        { icon: Clock, value: exam.durationMinutes, label: 'phút' },
                        { icon: RefreshCw, value: examData.maxAttempts, label: 'lượt thi' },
                      ].map(({ icon: Icon, value, label }) => (
                        <div
                          key={label}
                          className="bg-white border border-[#E2E8F0] rounded-xl py-3 px-2 lg:py-5 text-center shadow-z176"
                        >
                          <Icon className="w-6 h-6 lg:w-7 lg:h-7 mx-auto text-[#006BA1]" aria-hidden="true" />
                          <div className="text-2xl lg:text-4xl font-extrabold text-[#0F172A] mt-1 lg:mt-2 leading-none">{value}</div>
                          <div className="text-sm text-[#334155] mt-1">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Đang có lượt dở: báo rõ đây là TIẾP TỤC, không mất lượt */}
                    {examData.attempt && (
                      <div className="flex items-start gap-3 bg-[#EAF6FF] border border-[#008BC5]/40 rounded-xl p-4">
                        <Info className="w-6 h-6 shrink-0 text-[#006BA1] mt-0.5" aria-hidden="true" />
                        <p className="text-base text-[#0F172A] leading-relaxed">
                          <strong>Bạn đang có một lượt thi dở dang.</strong> Bấm nút bên dưới để làm tiếp đúng lượt đó.
                          Không bị tính thêm lượt mới, các câu đã chọn vẫn được giữ, kể cả khi đổi thiết bị.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Thông tin thí sinh */}
                {currentUser && (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 shadow-z176 space-y-3">
                    <h4 className="text-lg font-bold text-[#0F172A]">Thông tin thí sinh</h4>
                    {employee ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base lg:text-lg lg:gap-y-3">
                        <dt className="text-[#334155]">Họ và tên</dt>
                        <dd className="font-bold text-[#0F172A]">{employee.fullname}</dd>
                        <dt className="text-[#334155]">Mã nhân viên</dt>
                        <dd className="font-bold text-[#006BA1] font-mono">{employee.employeeCode || '-'}</dd>
                        {exam?.code && (
                          <>
                            <dt className="hidden lg:block text-[#334155]">Mã đề</dt>
                            <dd className="hidden lg:block font-bold text-[#0F172A] font-mono">{exam.code}</dd>
                          </>
                        )}
                        {!examData?.role && (
                          <>
                            <dt className="text-[#334155]">Xưởng / Phòng</dt>
                            <dd className="font-bold text-[#0F172A]">{employee.departmentName || '-'}</dd>
                          </>
                        )}
                      </dl>
                    ) : (
                      <div className="flex items-start gap-3 bg-[#FFF7E6] border border-[#F6AD37]/50 rounded-lg p-3 text-base text-[#0F172A]">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#B45309]" aria-hidden="true" />
                        <span>
                          Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên. Vui lòng liên hệ quản trị viên.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                </div>

                {currentUser && (
                <div className="space-y-4 lg:col-span-7">
                {/* Thi với tư cách phòng ban nào (logic giữ nguyên, chỉ đổi giao diện) */}
                {currentUser &&
                  employee &&
                  examData?.role &&
                  (() => {
                    const role = examData.role;
                    // canPick: chưa khóa vai trò và có >= 2 phòng -> hiện danh sách chọn. Phòng chưa đủ câu hỏi riêng
                    // (eligible = false, khi kỳ thi TẮT bù câu chung) bị làm mờ và không chọn được.
                    const canPick = !role.locked && !examData.attempt && role.options.length > 1;
                    const eligibleCount = role.options.filter((o) => o.eligible !== false).length;
                    const noEligibleRole = role.hasEligibleRole === false;
                    const activeId = canPick ? selectedRoleId : String(role.departmentId ?? '');
                    const activeOption =
                      role.options.find((o) => String(o.departmentId) === activeId) ?? role.options[0] ?? null;
                    // Kỳ thi BẬT bù: phòng đang xét có số câu riêng ít hơn yêu cầu -> phần thiếu được bù bằng câu chung
                    const compensated =
                      role.allowCommonCompensation !== false &&
                      activeOption &&
                      (activeOption.requiredDeptQuestions ?? 0) > 0 &&
                      (activeOption.deptQuestionCount ?? 0) < activeOption.requiredDeptQuestions;
                    return (
                      <div className="rounded-xl border-2 border-[#008BC5] bg-[#EAF6FF] p-4 space-y-3">
                        <div className="flex items-center gap-2 text-base font-bold text-[#006BA1]">
                          {canPick ? (
                            <Building2 className="w-5 h-5" aria-hidden="true" />
                          ) : (
                            <Lock className="w-5 h-5" aria-hidden="true" />
                          )}
                          <span>Bạn sẽ thi với tư cách phòng ban</span>
                        </div>

                        {canPick ? (
                          <div className="space-y-2" role="radiogroup" aria-label="Chọn phòng ban thi">
                            {role.options.map((o) => {
                              const id = String(o.departmentId);
                              const active = id === activeId;
                              const disabled = o.eligible === false;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  aria-disabled={disabled}
                                  disabled={disabled}
                                  onClick={() => {
                                    if (!disabled) setSelectedRoleId(id);
                                  }}
                                  className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-colors min-h-[56px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30 ${
                                    disabled
                                      ? 'bg-[#F6F8FA] border-transparent opacity-60 cursor-not-allowed'
                                      : active
                                        ? 'bg-white border-[#008BC5]'
                                        : 'bg-white border-[#E2E8F0] hover:border-[#0693E3]'
                                  }`}
                                >
                                  {disabled ? (
                                    <Lock className="w-6 h-6 text-[#64748B] shrink-0" aria-hidden="true" />
                                  ) : active ? (
                                    <CheckCircle2 className="w-6 h-6 text-[#008BC5] shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Circle className="w-6 h-6 text-[#94A3B8] shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="flex-1 min-w-0">
                                    <span
                                      className={`block font-bold text-base ${
                                        disabled ? 'text-[#64748B]' : 'text-[#0F172A]'
                                      }`}
                                    >
                                      {o.name}
                                    </span>
                                    {disabled && (
                                      <span className="block text-sm text-[#334155]">
                                        {o.reason === 'out_of_scope'
                                          ? 'Phòng ban không thuộc phạm vi kỳ thi này'
                                          : o.reason === 'insufficient_questions'
                                            ? `Chưa đủ câu hỏi riêng (${o.deptQuestionCount ?? 0}/${o.requiredDeptQuestions ?? 0} câu) - kỳ thi tắt bù câu chung`
                                            : 'Kỳ thi này không dành cho phòng ban này'}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${
                                      disabled
                                        ? 'bg-[#E2E8F0] text-[#334155]'
                                        : o.isMain
                                          ? 'bg-[#0F172A] text-white'
                                          : 'bg-[#EAF6FF] text-[#006BA1] border border-[#008BC5]/40'
                                    }`}
                                  >
                                    {o.isMain ? 'Phòng chính' : 'Kiêm nhiệm'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl sm:text-2xl font-extrabold text-[#0F172A] leading-tight">
                              {activeOption?.name ?? role.name ?? '-'}
                            </span>
                            {activeOption && (
                              <span
                                className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${
                                  activeOption.isMain
                                    ? 'bg-[#0F172A] text-white'
                                    : 'bg-white text-[#006BA1] border border-[#008BC5]/40'
                                }`}
                              >
                                {activeOption.isMain ? 'Phòng chính' : 'Kiêm nhiệm'}
                              </span>
                            )}
                          </div>
                        )}

                        {noEligibleRole ? (
                          <p className="text-base text-[#C53030] bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              Kỳ thi này <strong>không dành cho phòng ban nào của bạn</strong>. Vui lòng liên hệ Người
                              duyệt đề hoặc quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
                            </span>
                          </p>
                        ) : canPick && eligibleCount > 1 ? (
                          <p className="text-base text-[#0F172A] flex items-start gap-2 leading-relaxed">
                            <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              Bạn có phòng kiêm nhiệm nên cần chọn <strong>1 phòng ban</strong> để thi. Sau khi bấm
                              “Xác nhận &amp; bắt đầu thi”, lựa chọn sẽ <strong>bị khóa</strong> cho kỳ thi này. Muốn đổi
                              phải nhờ Người duyệt đề.
                            </span>
                          </p>
                        ) : canPick ? (
                          <p className="text-base text-[#0F172A] flex items-start gap-2 leading-relaxed">
                            <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              Kỳ thi này chỉ dành cho <strong>1 phòng ban</strong> của bạn nên bạn sẽ thi với phòng này.
                              Các phòng bị mờ không nằm trong phạm vi kỳ thi.
                            </span>
                          </p>
                        ) : (
                          <p className="text-base text-[#334155] leading-relaxed">
                            Đề thi và điểm của bạn trong kỳ này được tính theo phòng ban trên
                            {role.options.length > 1 ? ' (vai trò đã được khóa).' : '.'}
                          </p>
                        )}

                        {!noEligibleRole && compensated && (
                          <p className="text-base text-[#0F172A] bg-white border border-[#008BC5]/30 rounded-lg px-3 py-2.5 leading-relaxed">
                            Phòng ban này chỉ có {activeOption.deptQuestionCount ?? 0}/{activeOption.requiredDeptQuestions}{' '}
                            câu hỏi riêng trong kỳ thi, nên đề của bạn có <strong>câu hỏi chung bù vào</strong> phần còn
                            thiếu. Bạn vẫn được thi bình thường.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                {/* Lưu ý khi làm bài */}
                {currentUser && exam && (
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 shadow-z176 space-y-3">
                    <h4 className="text-lg font-bold text-[#0F172A]">Lưu ý khi làm bài</h4>
                    <ul className="space-y-3">
                      {[
                        {
                          icon: Clock,
                          text: `Làm trong tối đa ${exam.durationMinutes} phút. Hết giờ, hệ thống tự động nộp bài.`,
                        },
                        {
                          icon: ListChecks,
                          text: 'Mỗi câu chọn 1 hoặc nhiều đáp án, có ghi rõ trên từng câu. Đáp án được tự động lưu mỗi lần bạn chọn.',
                        },
                        {
                          icon: ShieldAlert,
                          text: `Không chuyển tab hay mở ứng dụng khác. Nếu rời màn hình thi, hệ thống sẽ cảnh báo và tự nộp bài sau ${LEAVE_WARNING_SECONDS} giây nếu bạn chưa quay lại.`,
                        },
                        {
                          icon: RefreshCw,
                          text: `Mỗi thí sinh có ${examData.maxAttempts} lượt thi chính thức. Muốn thi lại cần Người duyệt đề cấp phép.`,
                        },
                        {
                          icon: Info,
                          text: 'Nếu mất mạng hoặc tải lại trang, hãy vào lại để làm tiếp. Các câu đã chọn vẫn được giữ.',
                        },
                      ].map(({ icon: Icon, text }) => (
                        <li key={text} className="flex items-start gap-3 text-base text-[#0F172A] leading-relaxed">
                          <Icon className="w-5 h-5 shrink-0 mt-1 text-[#006BA1]" aria-hidden="true" />
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
                )}
              </div>
            </div>

            {/* Thanh hành động cố định ở đáy */}
            <div className="shrink-0 bg-white border-t border-[#E2E8F0] px-4 sm:px-6 lg:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-2xl lg:max-w-6xl space-y-3">
                {submitError && (
                  <div
                    className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg text-base text-[#0F172A] flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#C53030]" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                {!currentUser ? (
                  <button onClick={onOpenLogin} className={`${BTN_PRIMARY} w-full text-lg lg:flex lg:w-[420px] lg:ml-auto`}>
                    Đăng nhập để vào thi
                  </button>
                ) : !examData?.canTake ? (
                  <div className="text-center text-base text-[#334155] p-3 bg-[#F6F8FA] border border-[#E2E8F0] rounded-lg">
                    Bạn đã sử dụng hết lượt thi chính thức. Nếu cần thi lại, vui lòng liên hệ Người duyệt đề.
                  </div>
                ) : (
                  <button
                    onClick={handleStartExam}
                    disabled={
                      starting ||
                      !employee ||
                      (examData?.role && (!examData.role.departmentId || examData.role.hasEligibleRole === false))
                    }
                    className={`${BTN_PRIMARY} w-full text-lg lg:flex lg:w-[420px] lg:ml-auto`}
                  >
                    {starting ? (
                      <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                    )}
                    <span>
                      {starting
                        ? 'Đang vào bài thi...'
                        : examData?.attempt
                          ? 'Tiếp tục bài thi đang dở'
                          : 'Xác nhận & bắt đầu thi'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── MÀN HÌNH LÀM BÀI ───────────────────────────────────────────── */}
        {step === 'testing' && currentQ && (
          <div className="relative flex flex-col flex-1 min-h-0 bg-[#F6F8FA]">
            {/* Header cố định: câu hiện tại + đồng hồ + tiến độ */}
            <div className="shrink-0 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 lg:px-8 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setShowQuestionGrid(true)}
                  className="inline-flex lg:hidden items-center gap-2 min-h-[48px] px-3 -ml-3 rounded-[10px] text-lg font-bold text-[#0F172A] hover:bg-[#F6F8FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
                  aria-label={`Câu ${currentQuestionIndex + 1} trên ${questions.length}. Mở danh sách câu hỏi`}
                >
                  <List className="w-5 h-5 text-[#006BA1]" aria-hidden="true" />
                  <span>
                    Câu {currentQuestionIndex + 1}/{questions.length}
                  </span>
                </button>
                <span className="hidden lg:inline-flex items-center text-2xl font-bold text-[#0F172A]">
                  Câu {currentQuestionIndex + 1}/{questions.length}
                </span>

                <div
                  role="timer"
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] font-mono font-bold text-xl tabular-nums border ${
                    lowTime
                      ? 'bg-[#FEECEC] text-[#C53030] border-[#E53E3E]/40'
                      : 'bg-[#F6F8FA] text-[#0F172A] border-[#E2E8F0]'
                  }`}
                >
                  <Clock className={`w-5 h-5 ${lowTime ? 'text-[#C53030]' : 'text-[#006BA1]'}`} aria-hidden="true" />
                  <span className="sr-only">Thời gian còn lại: </span>
                  <span>{formatTimer(examSecondsLeft)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label="Tiến độ trả lời"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <div
                    className="h-full bg-[#008BC5] rounded-full transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-[#334155] whitespace-nowrap">
                  Đã làm {answeredCount}/{questions.length}
                </span>
              </div>

              {lowTime && (
                <p className="text-base font-semibold text-[#C53030] flex items-center gap-2" role="status">
                  <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>Còn dưới 5 phút. Hãy kiểm tra các câu chưa làm.</span>
                </p>
              )}
            </div>

            <div className="flex flex-col flex-1 min-h-0 lg:flex-row">
            <div className="flex flex-col flex-1 min-h-0 min-w-0">
            {/* Nội dung câu hỏi — chặn copy + không cho bôi đen (mức răn đe, không chặn được chụp màn hình). */}
            <div
              className="flex-1 min-h-0 overflow-y-auto select-none lg:px-6"
              data-lenis-prevent
              onCopy={handleBlockCopy}
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-4 space-y-4 lg:max-w-none lg:px-0 lg:py-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
                {/* Thông tin kỳ thi + chỉnh cỡ chữ */}
                <div className="flex items-center justify-between gap-3 flex-wrap lg:hidden">
                  <div className="text-sm text-[#334155] space-y-0.5 min-w-0 lg:hidden">
                    {examData?.exam?.code && (
                      <div>
                        Mã đề: <strong className="font-mono text-[#0F172A]">{examData.exam.code}</strong>
                      </div>
                    )}
                    {examData?.role?.name && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 shrink-0 text-[#006BA1]" aria-hidden="true" />
                        <span className="truncate">
                          Thi với tư cách: <strong className="text-[#0F172A]">{examData.role.name}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {renderFontControls()}
                </div>

                {/* Thẻ câu hỏi */}
                <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 lg:p-7 shadow-z176 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center h-8 px-3 rounded-lg bg-[#008BC5] text-white font-bold text-base">
                      Câu {currentQuestionIndex + 1}
                    </span>
                    {currentQ.answerType === 'multiple' ? (
                      <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#FFF7E6] text-[#B45309] font-semibold text-sm border border-[#F6AD37]/50">
                        <ListChecks className="w-4 h-4" aria-hidden="true" />
                        Chọn TẤT CẢ đáp án đúng
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#F6F8FA] text-[#334155] font-semibold text-sm border border-[#E2E8F0]">
                        <Circle className="w-4 h-4" aria-hidden="true" />
                        Chọn 1 đáp án
                      </span>
                    )}
                  </div>

                  <p className="font-semibold text-[#0F172A] leading-relaxed" style={{ fontSize: fontSizes.q }}>
                    {currentQ.content}
                  </p>

                  {/* Ảnh minh hoạ (nếu có) — lỗi tải ảnh không chặn làm bài */}
                  {currentQ.imageUrl && !imageLoadFailed && (
                    <div className="rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#F6F8FA] flex justify-center">
                      <img
                        key={currentQ.id}
                        src={currentQ.imageUrl}
                        alt={`Hình minh hoạ câu ${currentQuestionIndex + 1}`}
                        loading="lazy"
                        onError={() => setImageLoadFailed(true)}
                        onDragStart={(e) => e.preventDefault()}
                        className="max-h-[38dvh] sm:max-h-80 lg:max-h-[34dvh] w-auto object-contain"
                      />
                    </div>
                  )}
                  {currentQ.imageUrl && imageLoadFailed && (
                    <div className="flex items-start gap-2 text-sm text-[#334155] bg-[#F6F8FA] border border-[#E2E8F0] rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>Không tải được hình minh hoạ cho câu này. Bạn vẫn có thể làm bài bình thường.</span>
                    </div>
                  )}
                </section>

                <div className="space-y-4">
                {/* Đáp án: 1 cột, cả hàng bấm được, có chữ cái A/B/C/D */}
                <div
                  className="space-y-3"
                  role={currentQ.answerType === 'multiple' ? 'group' : 'radiogroup'}
                  aria-label="Các đáp án"
                >
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = (selectedAnswers[currentQ.id] || []).includes(opt.id);
                    const isMultiple = currentQ.answerType === 'multiple';
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role={isMultiple ? 'checkbox' : 'radio'}
                        aria-checked={isSelected}
                        onClick={() => handleSelectOption(currentQ, opt.id)}
                        className={`w-full min-h-[56px] px-4 py-3.5 lg:px-5 lg:py-4 rounded-xl text-left flex items-start gap-3 border-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30 ${
                          isSelected
                            ? 'border-[#008BC5] bg-[#EAF6FF]'
                            : 'border-[#E2E8F0] bg-white hover:border-[#0693E3] hover:bg-[#F0F9FF] active:bg-[#F0F9FF]'
                        }`}
                      >
                        <span
                          className={`mt-0.5 shrink-0 w-7 h-7 flex items-center justify-center border-2 ${
                            isMultiple ? 'rounded-md' : 'rounded-full'
                          } ${
                            isSelected
                              ? 'bg-[#008BC5] border-[#008BC5] text-white'
                              : 'bg-white border-[#94A3B8] text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </span>
                        <span className="flex-1 leading-relaxed text-[#0F172A]" style={{ fontSize: fontSizes.a }}>
                          <span className="font-bold text-[#006BA1] mr-2">{String.fromCharCode(65 + idx)}.</span>
                          <span className={isSelected ? 'font-semibold' : ''}>{opt.content}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Đánh dấu xem lại (chỉ nhắc trên màn hình, không gửi server) */}
                <button
                  type="button"
                  onClick={() => toggleFlag(currentQ.id)}
                  aria-pressed={Boolean(flagged[currentQ.id])}
                  className={`min-h-[48px] px-4 rounded-[10px] inline-flex items-center gap-2 text-base font-semibold border-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30 ${
                    flagged[currentQ.id]
                      ? 'bg-[#FFF7E6] border-[#F6AD37] text-[#B45309]'
                      : 'bg-white border-[#CBD5E1] text-[#334155] hover:bg-[#F6F8FA]'
                  }`}
                >
                  <Flag className="w-5 h-5" fill={flagged[currentQ.id] ? 'currentColor' : 'none'} aria-hidden="true" />
                  <span>{flagged[currentQ.id] ? 'Đã đánh dấu xem lại (bấm để bỏ)' : 'Đánh dấu để xem lại sau'}</span>
                </button>
                </div>
              </div>
            </div>

            {/* Thanh đáy: đúng 2 nút, to, cách đều. Nộp bài nằm trong danh sách câu hỏi và ở câu cuối. */}
            <div className="shrink-0 bg-white border-t border-[#E2E8F0] px-4 sm:px-6 lg:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-2xl lg:max-w-none space-y-3">
                {submitError && (
                  <div
                    className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg text-base text-[#0F172A] flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#C53030]" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className={BTN_SECONDARY}
                  >
                    <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                    <span>Câu trước</span>
                  </button>

                  {currentQuestionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      className={BTN_PRIMARY}
                    >
                      <span>Câu sau</span>
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button onClick={handleRequestFinishExam} className={BTN_SUCCESS}>
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                      <span>Nộp bài</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>

            {/* Sidebar chỉ hiện ở desktop (lg+): thông tin thí sinh, tiến độ, danh sách câu hỏi, nút nộp bài */}
            <aside
              className="hidden lg:flex w-[340px] xl:w-[380px] shrink-0 flex-col min-h-0 bg-white border-l border-[#E2E8F0]"
              aria-label="Thông tin và danh sách câu hỏi"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6" data-lenis-prevent>
                {employee && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F6F8FA] p-4 space-y-1.5">
                    <p className="text-sm font-semibold text-[#006BA1]">Thí sinh</p>
                    <p className="text-lg font-bold text-[#0F172A] leading-snug">{employee.fullname}</p>
                    <p className="text-base text-[#334155]">
                      Mã nhân viên: <strong className="font-mono text-[#0F172A]">{employee.employeeCode || '-'}</strong>
                    </p>
                    {examData?.role?.name && (
                      <p className="flex items-center gap-1.5 text-base text-[#334155]">
                        <Building2 className="w-4 h-4 shrink-0 text-[#006BA1]" aria-hidden="true" />
                        <span className="min-w-0">
                          Thi với tư cách: <strong className="text-[#0F172A]">{examData.role.name}</strong>
                        </span>
                      </p>
                    )}
                    {examData?.exam?.code && (
                      <p className="text-base text-[#334155]">
                        Mã đề: <strong className="font-mono text-[#0F172A]">{examData.exam.code}</strong>
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: answeredCount, label: 'Đã làm', color: 'text-[#006BA1]' },
                    { value: unansweredIndexes.length, label: 'Chưa làm', color: 'text-[#C53030]' },
                    { value: flaggedCount, label: 'Xem lại', color: 'text-[#B45309]' },
                  ].map(({ value, label, color }) => (
                    <div key={label} className="rounded-xl border border-[#E2E8F0] bg-white py-3 text-center">
                      <div className={`text-3xl font-extrabold leading-none ${color}`}>{value}</div>
                      <div className="text-sm text-[#334155] mt-1.5">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h4 className="text-lg font-bold text-[#0F172A]">Danh sách câu hỏi</h4>
                  {renderLegend()}
                  {renderGrid('grid grid-cols-5 xl:grid-cols-6 gap-2.5')}
                </div>
              </div>

              <div className="shrink-0 border-t border-[#E2E8F0] p-6 space-y-4">
                <div className="flex justify-center">{renderFontControls()}</div>
                <button onClick={handleRequestFinishExam} className={`${BTN_SUCCESS} w-full`}>
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                  <span>Nộp bài</span>
                </button>
              </div>
            </aside>
            </div>

            {/* Danh sách câu hỏi: bottom sheet trượt từ đáy (không chiếm chỗ của câu hỏi) */}
            {showQuestionGrid && (
              <div
                className="absolute inset-0 z-[55] flex items-end justify-center lg:hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="exam-nav-title"
              >
                <div
                  className="absolute inset-0 bg-[#0F172A]/50 animate-fade-in"
                  onClick={() => setShowQuestionGrid(false)}
                  aria-hidden="true"
                />
                <div className="relative w-full max-w-2xl max-h-[88%] bg-white rounded-t-xl shadow-z176 flex flex-col animate-slide-up">
                  <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-[#E2E8F0]">
                    <div>
                      <h4 id="exam-nav-title" className="text-lg font-bold text-[#0F172A]">
                        Danh sách câu hỏi
                      </h4>
                      <p className="text-base text-[#334155]">
                        Đã làm <strong className="text-[#006BA1]">{answeredCount}</strong>/{questions.length} câu
                        {unansweredIndexes.length > 0 && (
                          <>
                            {', còn '}
                            <strong className="text-[#C53030]">{unansweredIndexes.length}</strong> câu chưa làm
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowQuestionGrid(false)}
                      className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[10px] font-semibold text-[#334155] hover:bg-[#F6F8FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
                    >
                      <X className="w-5 h-5" aria-hidden="true" />
                      <span>Đóng</span>
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" data-lenis-prevent>
                    {renderLegend()}

                    {renderGrid('grid grid-cols-5 min-[400px]:grid-cols-6 sm:grid-cols-8 gap-2.5')}
                  </div>

                  <div className="shrink-0 grid grid-cols-2 gap-3 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#E2E8F0]">
                    <button onClick={() => setShowQuestionGrid(false)} className={BTN_SECONDARY}>
                      Làm tiếp
                    </button>
                    <button onClick={handleRequestFinishExam} className={BTN_SUCCESS}>
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                      <span>Nộp bài</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hộp xác nhận nộp bài: luôn hiện trước khi nộp, cho biết còn thiếu câu nào */}
            {confirmSubmitOpen && (
              <div
                className="absolute inset-0 z-[58] flex items-center justify-center p-4"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-submit-title"
              >
                <div
                  className="absolute inset-0 bg-[#0F172A]/60 animate-fade-in"
                  onClick={() => setConfirmSubmitOpen(false)}
                  aria-hidden="true"
                />
                <div className="relative w-full max-w-md max-h-full overflow-y-auto bg-white rounded-xl p-5 shadow-z176 space-y-4 animate-fade-in">
                  <h4 id="confirm-submit-title" className="text-xl font-bold text-[#0F172A]">
                    Nộp bài thi?
                  </h4>

                  {unansweredIndexes.length > 0 ? (
                    <div className="bg-[#FFF7E6] border border-[#F6AD37]/60 rounded-lg p-3 space-y-2">
                      <p className="flex items-start gap-2 text-base text-[#0F172A] leading-relaxed">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#B45309]" aria-hidden="true" />
                        <span>
                          Bạn còn <strong>{unansweredIndexes.length}</strong> câu chưa trả lời. Bấm vào số câu để quay
                          lại làm.
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto" data-lenis-prevent>
                        {unansweredIndexes.map((idx) => (
                          <button
                            key={idx}
                            onClick={() => handleJumpToQuestion(idx)}
                            className="min-h-[44px] min-w-[44px] px-3 rounded-lg bg-white border-[1.5px] border-[#F6AD37] text-[#B45309] font-bold text-base hover:bg-[#FFF7E6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#008BC5]/30"
                            aria-label={`Quay lại câu ${idx + 1}`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-base text-[#0F172A] leading-relaxed bg-[#F0FDF4] border border-[#22C55E]/50 rounded-lg p-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#166534]" aria-hidden="true" />
                      <span>
                        Bạn đã trả lời đủ <strong>{questions.length}/{questions.length}</strong> câu.
                      </span>
                    </p>
                  )}

                  {flaggedCount > 0 && (
                    <p className="flex items-start gap-2 text-base text-[#0F172A]">
                      <Flag className="w-5 h-5 shrink-0 mt-0.5 text-[#B45309]" fill="currentColor" aria-hidden="true" />
                      <span>
                        Có <strong>{flaggedCount}</strong> câu bạn đã đánh dấu xem lại.
                      </span>
                    </p>
                  )}

                  <p className="text-base text-[#334155]">Sau khi nộp, bạn không thể sửa đáp án.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setConfirmSubmitOpen(false)} className={BTN_SECONDARY}>
                      Làm tiếp
                    </button>
                    <button
                      onClick={() => {
                        setConfirmSubmitOpen(false);
                        handleFinishExam();
                      }}
                      className={BTN_SUCCESS}
                    >
                      Nộp bài
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ĐANG NỘP BÀI */}
        {step === 'submitting' && (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F6F8FA] text-[#334155]"
            role="status"
          >
            <Loader2 className="w-10 h-10 animate-spin text-[#008BC5]" aria-hidden="true" />
            <span className="text-base font-medium">Đang nộp bài và chấm điểm...</span>
            <span className="text-sm">Vui lòng không đóng trang.</span>
          </div>
        )}

        {/* TỰ ĐỘNG NỘP (rời ca thi quá 1 phút / kỳ thi kết thúc / bị thay thế) */}
        {step === 'auto-submitted' && (
          <StatusScreen
            icon={AlertCircle}
            tone="warn"
            title={
              autoSubmitReason === 'exam_ended'
                ? 'Kỳ thi đã kết thúc'
                : autoSubmitReason === 'exam_replaced'
                  ? 'Kỳ thi đã được thay thế'
                  : 'Bài thi đã được tự động nộp'
            }
            footer={
              <button onClick={onClose} className={`${BTN_SECONDARY} min-w-[160px]`}>
                Đóng
              </button>
            }
          >
            {autoSubmitReason === 'exam_ended' ? (
              <p>
                Thời gian của kỳ thi đã kết thúc. Hệ thống đã <strong>tự động nộp và chấm bài</strong> với các đáp án bạn
                đã chọn; kết quả đã được lưu.
              </p>
            ) : autoSubmitReason === 'exam_replaced' ? (
              <p>
                <strong>Người duyệt đề vừa đăng một kỳ thi mới</strong> nên kỳ thi bạn đang làm đã kết thúc. Hệ thống đã
                tự động nộp và chấm bài với các đáp án bạn đã chọn tính đến thời điểm này; kết quả đã được lưu.
              </p>
            ) : (
              <>
                <p>
                  Hệ thống ghi nhận bạn <strong>không có thao tác nào trên trang thi trong hơn 1 phút</strong>. Có thể do
                  chuyển sang tab hoặc ứng dụng khác, khoá màn hình, đóng trình duyệt hoặc mất kết nối mạng. Để đảm bảo
                  tính nghiêm túc của kỳ thi, hệ thống đã tự động nộp bài với các đáp án bạn đã chọn gần nhất.
                </p>
                <p>
                  Nếu đây là sự cố ngoài ý muốn (mất mạng, mất điện...) và cần thi lại, vui lòng liên hệ Người duyệt đề
                  để được xem xét cấp phép lượt thi mới.
                </p>
              </>
            )}
            {autoSubmitResult && autoSubmitReason !== null && autoSubmitReason !== 'inactive_timeout' && (
              <p className="text-lg font-bold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl py-3 px-4">
                Điểm của bạn: {autoSubmitResult.score}/100 ({autoSubmitResult.correctCount}/
                {autoSubmitResult.totalQuestions} câu đúng) - {autoSubmitResult.passed ? 'Đạt' : 'Chưa đạt'}
              </p>
            )}
            {autoSubmitReason === 'exam_replaced' && (
              <p>Nếu bạn cần thi lại, vui lòng liên hệ Người duyệt đề để được xem xét.</p>
            )}
          </StatusScreen>
        )}

        {/* KẾT QUẢ */}
        {step === 'result' && resultData && (
          <div className="flex-1 overflow-y-auto bg-[#F6F8FA]" data-lenis-prevent>
            <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-6 space-y-5 text-center">
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-lg font-bold ${
                  resultData.passed ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#FEECEC] text-[#C53030]'
                }`}
              >
                {resultData.passed ? (
                  <Award className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-6 h-6" aria-hidden="true" />
                )}
                <span>{resultData.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-[#0F172A] leading-snug">
                  {resultData.passed ? 'Chúc mừng, bạn đã đạt yêu cầu!' : 'Rất tiếc, bạn chưa đạt yêu cầu'}
                </h3>
                <p className="text-base text-[#334155] mt-1">{Z176_COMPANY_INFO.contestTitle}</p>
              </div>

              <ScoreRing score={resultData.score} passed={resultData.passed} />

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-[#E2E8F0] rounded-xl py-3 px-2 shadow-z176">
                  <div className="text-2xl font-extrabold text-[#166534]">{resultData.correctCount}</div>
                  <div className="text-sm text-[#334155] mt-0.5">câu đúng</div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl py-3 px-2 shadow-z176">
                  <div className="text-2xl font-extrabold text-[#C53030]">
                    {Math.max(0, resultData.totalQuestions - resultData.correctCount)}
                  </div>
                  <div className="text-sm text-[#334155] mt-0.5">câu chưa đúng</div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl py-3 px-2 shadow-z176">
                  <div className="text-2xl font-extrabold text-[#0F172A]">{resultData.totalQuestions}</div>
                  <div className="text-sm text-[#334155] mt-0.5">tổng số câu</div>
                </div>
              </div>

              {resultData.passed && (
                <p className="text-base text-[#166534] font-semibold">
                  Bạn đã đáp ứng quy định thi an toàn lao động Z176.
                </p>
              )}

              {!resultData.passed && (
                <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg text-base text-[#334155] flex items-start gap-3 text-left">
                  <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 text-[#64748B]" aria-hidden="true" />
                  <span>
                    Kết quả đã được ghi nhận. Nếu cần thi lại, vui lòng liên hệ Người duyệt đề để được xem xét cấp phép
                    cho lượt thi mới.
                  </span>
                </div>
              )}

              <button onClick={onClose} className={`${BTN_PRIMARY} w-full`}>
                Trở về trang chủ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};