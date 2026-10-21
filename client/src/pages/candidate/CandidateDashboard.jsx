import { useState, useEffect, useRef } from 'react';
import {
  UserCircle2,
  Building2,
  BadgeCheck,
  Award,
  XCircle,
  History,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  CheckSquare,
  BookOpen,
  Bot,
  Clock,
  ShieldCheck,
  FileText,
  Eye,
  Download,
  Calendar,
  Info,
  Target,
  Lock,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Trophy,
  ListChecks,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { fetchMyResults } from '../../services/report.service';
import { fetchMyExam } from '../../services/exam-attempt.service';
import { getExamEntryState } from '../../components/CTAButton';
import { getExamPhase, getCountdownTarget, splitDuration, COUNTDOWN_LABEL } from '../../lib/examPhase';
import {
  fetchMyStudyDocuments,
  previewStudyDocument,
  downloadStudyDocument,
} from '../../services/study-document.service';
import {
  PracticeSection,
  PracticeProgressCard,
} from '../../components/candidate/PracticeSection';
import { CompetencyCard } from '../../components/candidate/CompetencyCard';
import { AiAssistantChat } from '../../components/candidate/AiAssistantChat';
import { fetchAiStatus } from '../../services/ai-assistant.service';

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format chỉ riêng ngày (không kèm giờ), dùng cho card "Kỳ thi đang diễn ra"
// trên Dashboard — đồng bộ định dạng dd/mm/yyyy với TimeAndCountdown.jsx.
const formatDateOnly = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Custom tick cho trục X của biểu đồ "Điểm số qua các lần thi". Tên kỳ thi
// có thể dài, cắt còn tối đa 14 ký tự + "…"; tên đầy đủ hiện qua <title>.
const MAX_TICK_CHARS = 14;
const TruncatedTick = ({ x, y, payload }) => {
  const full = String(payload.value ?? '');
  const short = full.length > MAX_TICK_CHARS ? `${full.slice(0, MAX_TICK_CHARS)}…` : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="end"
        transform="rotate(-40)"
        fill="#334155"
        fontSize={14}
      >
        {short}
      </text>
    </g>
  );
};

const isPdf = (doc) =>
  doc.mimeType === 'application/pdf' || doc.originalFileName?.toLowerCase().endsWith('.pdf');

const HISTORY_PAGE_SIZE = 10;
// Bỏ dấu tiếng Việt để gõ "ky thi" vẫn tìm ra "Kỳ thi"
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

// Màu theo 5 màu chức năng của design-system (dùng sắc đậm để chữ trắng đủ tương phản). Class viết đủ để Tailwind quét được.
const TONES = {
  blue: { bg: 'bg-[#006BA1]', fg: 'text-white', chip: 'bg-white/20' },
  green: { bg: 'bg-[#166534]', fg: 'text-white', chip: 'bg-white/20' },
  yellow: { bg: 'bg-[#F6AD37]', fg: 'text-[#0F172A]', chip: 'bg-white/50' },
  gray: { bg: 'bg-[#334155]', fg: 'text-white', chip: 'bg-white/20' },
};

// Dải trạng thái kỳ thi: luôn có icon + chữ, không chỉ dựa vào màu.
const PHASE_BADGE = {
  open: { label: 'Đang mở', icon: CheckCircle2, band: 'bg-[#166534]' },
  upcoming: { label: 'Sắp diễn ra', icon: Clock, band: 'bg-[#B45309]' },
  ended: { label: 'Đã kết thúc', icon: XCircle, band: 'bg-[#334155]' },
};

const StatTile = ({ icon: Icon, label, value, hint, tone }) => {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl shadow-z176 p-4 flex flex-col gap-2 min-w-0 ${t.bg} ${t.fg}`}>
      <div className="flex items-center gap-2.5 text-sm font-semibold">
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${t.chip}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
        {label}
      </div>
      <div className="text-3xl font-bold leading-tight break-words">{value}</div>
      {hint && <div className="text-sm font-medium">{hint}</div>}
    </div>
  );
};

const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'exam', label: 'Thi trực tuyến', icon: CheckSquare },
  { id: 'practice', label: 'Luyện tập', icon: Target },
  { id: 'history', label: 'Lịch sử kết quả', icon: History },
  { id: 'materials', label: 'Tài liệu ôn tập', icon: BookOpen },
  { id: 'ai', label: 'Trợ lý AI', icon: Bot },
];

export const CandidateDashboard = ({ onOpenExam, examModalOpen, activeExam }) => {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [aiEnabled, setAiEnabled] = useState(false); // admin bật/tắt Trợ lý AI -> ẩn/hiện mục menu

  useEffect(() => {
    fetchAiStatus()
      .then((st) => setAiEnabled(Boolean(st?.enabled)))
      .catch(() => setAiEnabled(false));
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [results, setResults] = useState([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  // MỚI — Nhịp 1 giây để nút "VÀO THI CHÍNH THỨC" tự khóa/mở đúng lúc tới giờ bắt đầu / hết giờ mà không cần F5.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Chế độ luyện tập: key để remount PracticeSection (reset cấu hình),
  // và danh sách chủ đề được chọn sẵn khi bấm "Luyện ngay".
  const [practiceKey, setPracticeKey] = useState(0);
  const [practiceTopicIds, setPracticeTopicIds] = useState([]);

  // Đếm ngược thời gian còn lại của kỳ thi đang active, đồng bộ logic với
  // TimeAndCountdown.jsx ở trang chủ.
  const [examTimeLeft, setExamTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Chưa tới giờ bắt đầu thì đếm ngược tới GIỜ BẮT ĐẦU (không đếm tới hạn nộp, tránh tưởng kỳ thi đã mở).
  const [examPhase, setExamPhase] = useState(() => getExamPhase(activeExam));

  useEffect(() => {
    if (!activeExam?.endDate) return undefined;

    const tick = () => {
      const p = getExamPhase(activeExam);
      const target = getCountdownTarget(activeExam, p);
      setExamPhase(p);
      setExamTimeLeft(splitDuration(target == null ? 0 : target - Date.now()));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeExam]);

  // Trạng thái lượt thi THẬT từ backend (GET /api/exam-attempts/my-exam), nguồn
  // duy nhất biết về extraAttemptsGranted (lượt được Người duyệt đề cấp thêm).
  //   examStatus = { attemptsUsed, maxAttempts, canTake, attempt } | null
  const [examStatus, setExamStatus] = useState(null);
  const [examStatusLoading, setExamStatusLoading] = useState(true);
  // Lưu riêng mã lỗi để phân biệt CANDIDATE_NOT_ASSIGNED với "đã hết lượt thi".
  const [examStatusErrorCode, setExamStatusErrorCode] = useState(null);

  // Tài liệu ôn tập: 2 danh sách — theo kỳ thi đang active (lọc theo topicId)
  // và toàn bộ tài liệu đã đăng. Tải lười khi mở mục "Tài liệu ôn tập" lần đầu.
  const [activeDocs, setActiveDocs] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState(null);
  const [docsLoadedOnce, setDocsLoadedOnce] = useState(false);
  const [busyDocId, setBusyDocId] = useState(null);

  // ExamModal được mở/đóng ở App.jsx. Khi modal vừa đóng, tự fetch lại kết quả.
  const prevExamModalOpenRef = useRef(examModalOpen);
  useEffect(() => {
    if (prevExamModalOpenRef.current && !examModalOpen) {
      setRefreshTick((t) => t + 1);
    }
    prevExamModalOpenRef.current = examModalOpen;
  }, [examModalOpen]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchMyResults()
      .then((data) => {
        if (cancelled) return;
        setEmployee(data?.employee ?? null);
        setResults(Array.isArray(data?.results) ? data.results : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Không thể tải dữ liệu kết quả thi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    let cancelled = false;

    setExamStatusLoading(true);

    fetchMyExam()
      .then((data) => {
        if (cancelled) return;
        setExamStatusErrorCode(null);
        setExamStatus({
          attemptsUsed: data?.attemptsUsed ?? 0,
          maxAttempts: data?.maxAttempts ?? 1,
          canTake: Boolean(data?.canTake),
          attempt: data?.attempt ?? null,
          role: data?.role ?? null,
        });
      })
      .catch((err) => {
        // EXAM_NOT_ACTIVE: không hiện lỗi (đã có UI riêng). Các mã khác được giữ
        // lại để phần render phân biệt đúng thông báo.
        if (cancelled) return;
        setExamStatus(null);
        setExamStatusErrorCode(err?.code ?? 'UNKNOWN_ERROR');
      })
      .finally(() => {
        if (!cancelled) setExamStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTick, activeExam?._id]);

  // Tải tài liệu ôn tập khi mở mục "materials" lần đầu, hoặc khi kỳ thi active
  // thay đổi (topicId đổi -> danh sách tài liệu kỳ thi hiện tại tải lại).
  useEffect(() => {
    if (activeSection !== 'materials') return;

    let cancelled = false;
    setDocsLoading(true);
    setDocsError(null);

    const activeTopicId = activeExam?.topicId?._id || activeExam?.topicId;

    const requests = [
      activeTopicId ? fetchMyStudyDocuments({ topicId: activeTopicId }) : Promise.resolve([]),
      fetchMyStudyDocuments(),
    ];

    Promise.all(requests)
      .then(([activeList, allList]) => {
        if (cancelled) return;
        setActiveDocs(Array.isArray(activeList) ? activeList : []);
        setAllDocs(Array.isArray(allList) ? allList : []);
        setDocsLoadedOnce(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setDocsError(err?.message || 'Không thể tải tài liệu ôn tập.');
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, activeExam?.topicId?._id, activeExam?.topicId]);

  const handlePreviewDoc = async (doc) => {
    setBusyDocId(doc._id);
    setDocsError(null);
    try {
      await previewStudyDocument(doc._id);
    } catch (err) {
      setDocsError(err?.message || 'Không thể mở tài liệu.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleDownloadDoc = async (doc) => {
    setBusyDocId(doc._id);
    setDocsError(null);
    try {
      await downloadStudyDocument(doc._id, doc.originalFileName || doc.title);
    } catch (err) {
      setDocsError(err?.message || 'Không thể tải tài liệu.');
    } finally {
      setBusyDocId(null);
    }
  };

  // Mở mục luyện tập, có thể kèm sẵn 1 chủ đề (từ nút "Luyện ngay")
  const startPracticeWithTopic = (topicId) => {
    setPracticeTopicIds(topicId ? [topicId] : []);
    setPracticeKey((k) => k + 1);
    setActiveSection('practice');
  };

  // "Số lần đã thi" ở khối tổng quan vẫn hiển thị TOÀN BỘ lịch sử.
  const totalAttempts = results.length;
  const filteredResults = results.filter((r) => norm(r.examTitle).includes(norm(historyQuery.trim())));
  const historyPages = Math.max(1, Math.ceil(filteredResults.length / HISTORY_PAGE_SIZE));
  const page = Math.min(historyPage, historyPages);
  const pagedResults = filteredResults.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
  const passedCount = results.filter((r) => r.passed).length;
  const lastName = employee?.fullname?.trim().split(/\s+/).pop() ?? '';
  const bestResult = results.reduce((best, r) => {
    if (!best) return r;
    return r.score > best.score ? r : best;
  }, null);

  // Lượt thi CHÍNH THỨC cho kỳ thi đang active, lấy từ examStatus (backend).
  const maxAttempts = examStatus?.maxAttempts ?? 1;
  const attemptsForActiveExam = examStatus?.attemptsUsed ?? 0;
  const attemptsLeft = examStatus ? Math.max(0, maxAttempts - attemptsForActiveExam) : 0;
  // MỚI — Kỳ thi TẮT bù câu chung mà không phòng ban nào của thí sinh đủ câu riêng thì không cho vào thi
  // MỚI — Khóa nút theo khung giờ kỳ thi (startDate/endDate). Lượt đang làm dở (examStatus.attempt)
  // luôn được vào lại để resume/nộp bài, kể cả khi đã quá endDate — đồng bộ với server (resume được xét trước giờ thi).
  const hasResumableAttempt = Boolean(examStatus?.attempt);
  const entryState = getExamEntryState(activeExam); // tính lại mỗi lần render; nhịp 1 giây ở trên kích hoạt render mỗi giây
  const timeBlocked = Boolean(activeExam) && !entryState.open && !hasResumableAttempt;
  const canStartExam =
    Boolean(activeExam) &&
    Boolean(examStatus?.canTake) &&
    examStatus?.role?.hasEligibleRole !== false &&
    !timeBlocked;

  // MỚI — Vai trò (phòng ban) sẽ dùng để thi trong kỳ thi đang mở (từ backend). null nếu chưa tải được.
  const examRole = examStatus?.role ?? null;
  const examRoleNoEligible = examRole?.hasEligibleRole === false;
  const examRoleEligibleCount = examRole?.options?.filter((o) => o.eligible !== false).length ?? 0;
  const examRoleHint = examRole
    ? examRoleNoEligible
      ? 'Kỳ thi này không dành cho phòng ban nào của bạn. Vui lòng liên hệ Người duyệt đề nếu bạn cho rằng đây là nhầm lẫn.'
      : examRole.locked
        ? 'Vai trò đã được khóa cho kỳ thi này.'
        : examRoleEligibleCount > 1
          ? 'Bạn có phòng kiêm nhiệm — sẽ chọn vai trò khi bấm vào thi.'
          : examRole.options?.length > 1
            ? 'Kỳ thi này không dành cho một số phòng kiêm nhiệm của bạn nên bạn chỉ thi được với phòng còn lại.'
            : ''
    : '';

  const handleStartExam = () => {
    if (!canStartExam) return;
    if (typeof onOpenExam === 'function') {
      onOpenExam();
    }
  };

  // Tài liệu cũ = toàn bộ tài liệu TRỪ những tài liệu đã hiện trong "kỳ thi hiện tại".
  const activeDocIds = new Set(activeDocs.map((d) => d._id));
  const olderDocs = allDocs.filter((d) => !activeDocIds.has(d._id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 mt-16 min-h-screen">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[32px] md:leading-10 font-bold text-[#0F172A] mb-1">Dashboard của tôi</h1>
          <p className="text-base text-[#334155]">
            Thông tin cá nhân, thi trực tuyến và lịch sử kết quả thi của bạn.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Đang tải dữ liệu...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : !employee ? (
        <div className="p-4 bg-[#FFFBEB] border border-[#F6AD37]/40 text-[#0F172A] rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>
            Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên nào. Vui lòng liên hệ quản trị
            viên để được hỗ trợ.
          </span>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <aside className="md:w-60 shrink-0">
            <nav
              className="bg-white rounded-xl shadow-z176 border border-slate-200 p-2 grid grid-cols-3 gap-1.5 md:flex md:flex-col md:gap-1 md:sticky md:top-20"
              aria-label="Menu chức năng thí sinh"
            >
              {SIDEBAR_ITEMS.filter((item) => item.id !== 'ai' || aiEnabled).map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-3 min-h-[76px] md:min-h-[56px] rounded-lg text-sm md:text-base font-semibold text-center md:text-left transition-colors min-touch-target ${
                      isActive
                        ? 'bg-[#006BA1] text-white border border-[#006BA1]'
                        : 'text-[#0F172A] md:text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 border border-slate-200 md:border-transparent'
                    }`}
                  >
                    <Icon className="w-6 h-6 md:w-5 md:h-5 shrink-0" aria-hidden="true" />
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Nội dung chính */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* ── Dashboard ── */}
            {activeSection === 'dashboard' && (
              <>
                {/* Hồ sơ */}
                <div
                  className="animate-fade-in-up rounded-xl shadow-z176 bg-[#006BA1] text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4"
                  style={{ '--stagger-delay': '0ms' }}
                >
                  <div
                    className="w-16 h-16 rounded-xl bg-white text-[#006BA1] text-3xl font-bold flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    {(lastName[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl sm:text-[28px] font-bold leading-tight break-words">
                      Xin chào, {lastName || employee.fullname}
                    </h2>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
                          <UserCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          Họ và tên
                        </dt>
                        <dd className="text-base font-semibold break-words">{employee.fullname}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
                          <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                          Mã nhân viên
                        </dt>
                        <dd className="text-base font-semibold font-mono">{employee.employeeCode || '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
                          <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          Phòng ban
                        </dt>
                        <dd className="text-base font-semibold break-words">{employee.departmentName || '—'}</dd>
                        {employee.extraDepartments?.length > 0 && (
                          <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-white/90">Kiêm nhiệm:</span>
                            {employee.extraDepartments.map((d) => (
                              <span key={d._id} className="px-2.5 py-0.5 rounded-lg bg-white text-[#006BA1] text-sm font-semibold">
                                {d.name}
                              </span>
                            ))}
                          </dd>
                        )}
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Việc cần làm: kỳ thi hiện tại */}
                {activeExam ? (
                  <div
                    className="animate-fade-in-up rounded-xl shadow-z176 border border-[#E2E8F0] bg-white overflow-hidden"
                    style={{ '--stagger-delay': '30ms' }}
                  >
                    {(() => {
                      const B = PHASE_BADGE[examPhase] ?? PHASE_BADGE.ended;
                      return (
                        <div className={`${B.band} text-white px-5 sm:px-6 py-2.5 flex items-center gap-2 text-base font-bold`}>
                          <B.icon className="w-5 h-5" aria-hidden="true" />
                          Kỳ thi hiện tại · {B.label}
                        </div>
                      );
                    })()}
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                        <div className="min-w-0">
                          <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] leading-snug break-words">
                            {activeExam.title}
                          </h2>
                          <p className="mt-2 text-base text-[#334155] flex items-start gap-2">
                            <Calendar className="w-5 h-5 shrink-0 mt-0.5 text-[#008BC5]" aria-hidden="true" />
                            <span>
                              Từ ngày <strong className="text-[#0F172A]">{formatDateOnly(activeExam.startDate)}</strong>{' '}
                              đến hết <strong className="text-[#0F172A]">{formatDateOnly(activeExam.endDate)}</strong>
                            </span>
                          </p>
                        </div>

                        {examPhase !== 'ended' && examPhase !== 'none' && (
                          <div className="lg:shrink-0">
                            <div className="text-sm font-semibold text-[#334155] mb-2 flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-[#008BC5]" aria-hidden="true" />
                              {examPhase === 'open' ? 'Thời gian còn lại' : COUNTDOWN_LABEL[examPhase]}
                            </div>
                            <div className="grid grid-cols-4 gap-2 lg:w-[19rem]">
                              {[
                                { value: examTimeLeft.days, label: 'Ngày' },
                                { value: examTimeLeft.hours, label: 'Giờ' },
                                { value: examTimeLeft.minutes, label: 'Phút' },
                                { value: examTimeLeft.seconds, label: 'Giây' },
                              ].map((unit) => (
                                <div key={unit.label} className="flex flex-col text-center">
                                  <div className="bg-[#006BA1] text-white font-bold text-2xl leading-none py-3 rounded-t-lg tabular-nums">
                                    {unit.value < 10 ? `0${unit.value}` : unit.value}
                                  </div>
                                  <div className="bg-[#EAF6FF] text-[#006BA1] text-sm font-semibold py-1 rounded-b-lg">
                                    {unit.label}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 pt-5 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="text-base text-[#0F172A] space-y-1.5">
                          <div className="font-semibold">
                            {examStatusLoading
                              ? 'Đang kiểm tra lượt thi…'
                              : examStatus
                                ? `Bạn còn ${attemptsLeft} lượt thi cho kỳ thi này.`
                                : 'Xem trạng thái lượt thi ở mục "Thi trực tuyến".'}
                          </div>
                          {examRole?.name && (
                            <div className="flex items-center gap-1.5 flex-wrap text-[#334155]">
                              <Building2 className="w-4 h-4 text-[#008BC5] shrink-0" aria-hidden="true" />
                              <span>Thi với tư cách:</span>
                              <strong className="px-2 py-0.5 rounded-lg bg-[#EAF6FF] text-[#006BA1]">{examRole.name}</strong>
                              {examRole.locked && <Lock className="w-4 h-4 text-[#334155]" aria-label="Đã khóa" />}
                            </div>
                          )}
                          {examRoleHint && <div className="text-sm text-[#334155]">{examRoleHint}</div>}
                        </div>
                        <button
                          onClick={() => setActiveSection('exam')}
                          className="w-full sm:w-auto min-h-[52px] px-8 bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white font-bold text-lg rounded-[10px] transition-colors shrink-0 flex items-center justify-center gap-2"
                        >
                          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                          Vào thi ngay
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="animate-fade-in-up flex items-center gap-3 bg-[#F6F8FA] border border-[#E2E8F0] rounded-xl p-5 text-[#334155] text-base"
                    style={{ '--stagger-delay': '30ms' }}
                  >
                    <Info className="w-6 h-6 text-[#334155] shrink-0" aria-hidden="true" />
                    Hiện chưa có kỳ thi nào đang diễn ra.
                  </div>
                )}

                {/* Số liệu nhanh */}
                <div
                  className="animate-fade-in-up grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
                  style={{ '--stagger-delay': '60ms' }}
                >
                  <StatTile icon={History} label="Số lần đã thi" value={totalAttempts} tone="blue" />
                  <StatTile icon={CheckCircle2} label="Số lần đạt" value={passedCount} tone="green" />
                  <StatTile
                    icon={Trophy}
                    label="Điểm cao nhất"
                    value={bestResult ? `${bestResult.score} điểm` : '—'}
                    tone="yellow"
                   
                  />
                  <StatTile
                    icon={ListChecks}
                    label="Lượt thi còn lại"
                    value={activeExam && examStatus ? `${attemptsLeft}/${maxAttempts}` : '—'}
                    hint={activeExam ? 'Kỳ thi hiện tại' : 'Chưa có kỳ thi'}
                    tone="gray"
                   
                  />
                </div>

                {/* Tiến độ luyện tập */}
                <div className="animate-fade-in-up" style={{ '--stagger-delay': '90ms' }}>
                  <PracticeProgressCard onPracticeTopic={startPracticeWithTopic} />
                </div>

                {/* Bản đồ năng lực theo chủ đề */}
                <div className="animate-fade-in-up" style={{ '--stagger-delay': '120ms' }}>
                  <CompetencyCard onPracticeTopic={startPracticeWithTopic} />
                </div>

                {/* Biểu đồ điểm số qua các lần thi */}
                {results.length > 0 &&
                  (() => {
                    const chartData = [...results]
                      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
                      .map((r) => ({
                        label: r.examTitle,
                        score: r.score,
                        passed: r.passed,
                        submittedAt: formatDateTime(r.submittedAt),
                      }));
                    // Mỗi cột cần tối thiểu ~90px để nhãn xoay đủ góc không đè nhau.
                    const MIN_BAR_WIDTH = 90;
                    const chartMinWidth = Math.max(chartData.length * MIN_BAR_WIDTH, 320);

                    return (
                      <div
                        className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-[#E2E8F0] p-5 sm:p-6"
                        style={{ '--stagger-delay': '150ms' }}
                      >
                        <h2 className="text-lg font-bold text-[#0F172A] mb-1 flex items-center gap-2">
                          <History className="w-5 h-5 text-[#008BC5]" aria-hidden="true" />
                          Điểm số qua các lần thi
                        </h2>
                        <p className="text-base text-[#334155] mb-3">
                          Sắp xếp theo thời gian, từ lần thi cũ nhất đến gần nhất
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm font-semibold text-[#0F172A]">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" aria-hidden="true" /> Đạt (cột xanh lá)
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <XCircle className="w-4 h-4 text-[#E53E3E]" aria-hidden="true" /> Chưa đạt (cột đỏ)
                          </span>
                        </div>
                        <div className="h-72 overflow-x-auto overflow-y-hidden -mx-2 px-2">
                          <div style={{ minWidth: chartMinWidth, height: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={chartData}
                                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                <XAxis
                                  dataKey="label"
                                  tick={<TruncatedTick />}
                                  axisLine={{ stroke: '#E2E8F0' }}
                                  tickLine={false}
                                  interval={0}
                                  angle={-40}
                                  textAnchor="end"
                                  height={78}
                                />
                                <YAxis
                                  allowDecimals={false}
                                  tick={{ fill: '#334155', fontSize: 14 }}
                                  axisLine={{ stroke: '#E2E8F0' }}
                                  tickLine={false}
                                  width={36}
                                />
                                <Tooltip
                                  contentStyle={{
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: 8,
                                  }}
                                  labelFormatter={(label) => label}
                                  formatter={(value, _name, props) => [
                                    `${value} điểm — ${props?.payload?.passed ? 'Đạt' : 'Không đạt'}`,
                                    props?.payload?.submittedAt,
                                  ]}
                                />
                                <Bar
                                  dataKey="score"
                                  name="Điểm"
                                  radius={[6, 6, 0, 0]}
                                  maxBarSize={48}
                                >
                                  {chartData.map((r, index) => (
                                    <Cell key={index} fill={r.passed ? '#22C55E' : '#E53E3E'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        {chartData.length > 4 && (
                          <p className="text-sm text-[#334155] mt-2 sm:hidden">
                            Vuốt ngang để xem thêm các kỳ thi khác →
                          </p>
                        )}
                      </div>
                    );
                  })()}
              </>
            )}

            {/* ── Thi trực tuyến ── */}
            {activeSection === 'exam' && (
              <div
                className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden"
                style={{ '--stagger-delay': '0ms' }}
              >
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-[#008BC5]" />
                    Thi trực tuyến
                  </h2>
                </div>

                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-sm text-slate-500 mb-1">Số lượt đã thi (kỳ thi hiện tại)</div>
                      <div className="text-xl font-bold text-[#0F172A]">
                        {attemptsForActiveExam}/{maxAttempts}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-sm text-slate-500 mb-1">Lượt còn lại</div>
                      <div className="text-xl font-bold text-[#0F172A]">{attemptsLeft}</div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-sm text-slate-500 mb-1">Điểm cao nhất</div>
                      <div className="text-xl font-bold text-[#0F172A]">
                        {bestResult ? `${bestResult.score} điểm` : '—'}
                      </div>
                    </div>
                  </div>

                  {!activeExam ? (
                    <div className="p-4 bg-[#F6F8FA] border border-slate-200 rounded-lg text-slate-500 text-sm flex items-start gap-2.5">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                      <span>
                        Hiện không có kỳ thi nào đang diễn ra. Vui lòng quay lại sau khi Người duyệt đề
                        đăng kỳ thi mới.
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg text-[#0F172A] text-sm flex items-start gap-2.5">
                      <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                      <span>
                        Vui lòng chuẩn bị đầy đủ thời gian trước khi bắt đầu — bài thi có giới hạn thời
                        gian và không thể tạm dừng giữa chừng. Không thoát trình duyệt trong khi đang làm
                        bài.
                      </span>
                    </div>
                  )}

                  {activeExam && examRole?.name && (
                    <div className="rounded-xl border-2 border-[#008BC5] bg-[#EAF6FF] p-4 flex flex-col gap-1">
                      <div className="text-xs font-bold uppercase tracking-wide text-[#008BC5] flex items-center gap-1.5">
                        {examRole.locked ? <Lock className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                        Bạn sẽ thi với tư cách phòng ban
                      </div>
                      {!examRoleNoEligible && (
                        <div className="text-xl font-extrabold text-[#0F172A]">{examRole.name}</div>
                      )}
                      {examRoleHint && (
                        <div className={`text-sm ${examRoleNoEligible ? 'text-[#C53030]' : 'text-slate-600'}`}>
                          {examRoleHint}
                        </div>
                      )}
                      {!examRoleNoEligible && examRole.allowCommonCompensation !== false && examRole.hasDepartmentQuestions === false && (
                        <div className="text-sm text-slate-600">
                          Phòng ban này chưa có câu hỏi riêng nên đề gồm toàn câu hỏi chung.
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleStartExam}
                    disabled={examStatusLoading || !canStartExam}
                    className="w-full min-h-[56px] bg-[#008BC5] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-full hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 shadow-z176 min-touch-target"
                  >
                    <ShieldCheck className="w-6 h-6" />
                    <span>VÀO THI CHÍNH THỨC</span>
                  </button>

                  {activeExam && !examStatusLoading && !canStartExam && (
                    <p className="text-center text-sm text-slate-500">
                      {examStatusErrorCode === 'CANDIDATE_OUT_OF_SCOPE' ? (
                        <>
                          Kỳ thi "{activeExam.title}" không dành cho phòng ban của bạn. Vui lòng liên hệ
                          Người ra đề hoặc Quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
                        </>
                      ) : examStatusErrorCode === 'ROLE_NOT_ELIGIBLE' ? (
                        <>
                          Kỳ thi "{activeExam.title}" chưa đủ câu hỏi riêng cho phòng ban của bạn (kỳ thi đang tắt chế độ bù câu chung).
                          Vui lòng liên hệ Người ra đề để bổ sung câu hỏi.
                        </>
                      ) : examStatusErrorCode === 'CANDIDATE_NOT_ASSIGNED' ? (
                        <>
                          Bạn chưa được phân bổ đề thi cho kỳ thi "{activeExam.title}". Vui lòng liên hệ
                          Người ra đề hoặc Quản trị viên để được hỗ trợ.
                        </>
                      ) : examStatusErrorCode === 'EMPLOYEE_NOT_FOUND' ? (
                        <>
                          Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên nào. Vui lòng liên hệ
                          Quản trị viên để được cập nhật thông tin nhân viên.
                        </>
                      ) : !examStatusErrorCode && timeBlocked ? (
                        <>{entryState.message}</>
                      ) : examStatusErrorCode && examStatusErrorCode !== 'EXAM_NOT_ACTIVE' ? (
                        <>
                          Không thể tải trạng thái lượt thi ({examStatusErrorCode}). Vui lòng thử tải lại
                          trang, hoặc liên hệ Quản trị viên nếu lỗi vẫn tiếp diễn.
                        </>
                      ) : (
                        <>
                          Bạn đã hoàn thành lượt thi chính thức cho kỳ thi "{activeExam.title}". Nếu cần thi
                          lại, vui lòng liên hệ Người duyệt đề để được xem xét cấp phép cho lượt thi mới.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Luyện tập ── */}
            {activeSection === 'practice' && (
              <div className="animate-fade-in-up" style={{ '--stagger-delay': '0ms' }}>
                <PracticeSection key={practiceKey} initialTopicIds={practiceTopicIds} />
              </div>
            )}

            {/* ── Lịch sử kết quả ── */}
            {activeSection === 'history' && (
              <div
                className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden"
                style={{ '--stagger-delay': '0ms' }}
              >
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                    <History className="w-5 h-5 text-[#008BC5]" />
                    Lịch sử kết quả thi
                  </h2>
                </div>

                {results.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    Bạn chưa có lượt thi nào được ghi nhận.
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="relative sm:max-w-sm">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="search"
                          value={historyQuery}
                          onChange={(e) => {
                            setHistoryQuery(e.target.value);
                            setHistoryPage(1);
                          }}
                          placeholder="Tìm theo tên kỳ thi..."
                          aria-label="Tìm kết quả theo kỳ thi"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40"
                        />
                      </div>
                    </div>
                    {filteredResults.length === 0 && (
                      <div className="p-8 text-center text-slate-500">Không có kỳ thi nào khớp với "{historyQuery}".</div>
                    )}
                    <div
                      className="animate-fade-in-up hidden sm:block overflow-x-auto"
                      style={{ '--stagger-delay': '80ms' }}
                    >
                      <table className="w-full text-base">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-sm uppercase">
                            <th className="px-4 py-3 text-left font-semibold">Bài thi</th>
                            <th className="px-4 py-3 text-left font-semibold">Thời gian nộp</th>
                            <th className="px-4 py-3 text-center font-semibold">Điểm</th>
                            <th className="px-4 py-3 text-center font-semibold">Số câu đúng</th>
                            <th className="px-4 py-3 text-center font-semibold">Kết quả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagedResults.map((r) => (
                            <tr key={r._id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-[#0F172A]">{r.examTitle}</td>
                              <td className="px-4 py-3 text-slate-500">{formatDateTime(r.submittedAt)}</td>
                              <td className="px-4 py-3 text-center font-bold text-[#0F172A]">{r.score}</td>
                              <td className="px-4 py-3 text-center text-slate-500">
                                {r.correctCount}/{r.totalQuestions}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {r.passed ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0FDF4] text-[#166534] font-semibold text-sm">
                                    <Award className="w-3.5 h-3.5" /> Đạt
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEECEC] text-[#C53030] font-semibold text-sm">
                                    <XCircle className="w-3.5 h-3.5" /> Chưa đạt
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div
                      className="animate-fade-in-up sm:hidden p-4 space-y-3"
                      style={{ '--stagger-delay': '80ms' }}
                    >
                      {pagedResults.map((r) => (
                        <div
                          key={r._id}
                          className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-[#0F172A] text-base leading-snug">
                              {r.examTitle}
                            </span>
                            {r.passed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F0FDF4] text-[#166534] font-semibold text-sm shrink-0">
                                <Award className="w-3.5 h-3.5" /> Đạt
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEECEC] text-[#C53030] font-semibold text-sm shrink-0">
                                <XCircle className="w-3.5 h-3.5" /> Chưa đạt
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-base">
                            <span className="text-slate-500">
                              Nộp lúc: {formatDateTime(r.submittedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-base pt-1 border-t border-slate-100">
                            <span>
                              <span className="text-slate-500">Điểm: </span>
                              <span className="font-bold text-[#0F172A]">{r.score}</span>
                            </span>
                            <span>
                              <span className="text-slate-500">Số câu đúng: </span>
                              <span className="font-semibold text-[#0F172A]">
                                {r.correctCount}/{r.totalQuestions}
                              </span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {historyPages > 1 && (
                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
                        <span>
                          {(page - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(page * HISTORY_PAGE_SIZE, filteredResults.length)} / {filteredResults.length} lượt thi
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setHistoryPage(page - 1)}
                            disabled={page === 1}
                            aria-label="Trang trước"
                            className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 min-touch-target flex items-center justify-center"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="px-1">
                            {page}/{historyPages}
                          </span>
                          <button
                            onClick={() => setHistoryPage(page + 1)}
                            disabled={page === historyPages}
                            aria-label="Trang sau"
                            className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 min-touch-target flex items-center justify-center"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Trợ lý AI ── */}
            {/* Luôn mount (chỉ ẩn) để đổi mục rồi quay lại không mất hội thoại; chỉ mất khi tải lại trang/đóng tab */}
            {aiEnabled && (
              <div hidden={activeSection !== 'ai'}>
                <AiAssistantChat
                  currentTopicId={activeExam?.topicId?._id || activeExam?.topicId}
                  active={activeSection === 'ai'}
                />
              </div>
            )}

            {/* ── Tài liệu ôn tập ── */}
            {activeSection === 'materials' && (
              <div className="space-y-6">
                {docsError && (
                  <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{docsError}</span>
                  </div>
                )}

                {docsLoading && !docsLoadedOnce ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang tải tài liệu...</span>
                  </div>
                ) : (
                  <>
                    <div
                      className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden"
                      style={{ '--stagger-delay': '0ms' }}
                    >
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-[#008BC5]" />
                          Tài liệu kỳ thi hiện tại
                        </h2>
                        {activeExam && (
                          <p className="text-sm text-slate-500 mt-0.5">Chủ đề: {activeExam.title}</p>
                        )}
                      </div>

                      {!activeExam ? (
                        <div className="p-8 text-center text-slate-500 text-base">
                          Hiện không có kỳ thi nào đang diễn ra nên chưa có tài liệu để hiển thị ở mục
                          này.
                        </div>
                      ) : activeDocs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-base">
                          Chưa có tài liệu ôn tập nào cho kỳ thi hiện tại.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {activeDocs.map((doc) => (
                            <DocumentRow
                              key={doc._id}
                              doc={doc}
                              busy={busyDocId === doc._id}
                              onPreview={handlePreviewDoc}
                              onDownload={handleDownloadDoc}
                            />
                          ))}
                        </div>
                      )}
                    </div>


                    <div
                      className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden"
                      style={{ '--stagger-delay': '100ms' }}
                    >
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                          <FileText className="w-5 h-5 text-[#008BC5]" />
                          Tất cả tài liệu
                        </h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                          Bao gồm tài liệu của các kỳ thi trước đây.
                        </p>
                      </div>

                      {olderDocs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-base">
                          Không có tài liệu nào khác ngoài danh sách ở trên.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {olderDocs.map((doc) => (
                            <DocumentRow
                              key={doc._id}
                              doc={doc}
                              busy={busyDocId === doc._id}
                              onPreview={handlePreviewDoc}
                              onDownload={handleDownloadDoc}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Dòng hiển thị 1 tài liệu, dùng chung cho cả 2 danh sách ở mục "Tài liệu ôn tập".
const DocumentRow = ({ doc, busy, onPreview, onDownload }) => (
  <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
    <div className="flex items-start gap-3 flex-1 min-w-0">
      <div className="w-10 h-10 rounded-lg bg-[#EAF6FF] flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-[#008BC5]" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[#0F172A] text-base truncate">{doc.title}</div>
        <div className="text-sm text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{doc.topicId?.name || '—'}</span>
          <span>·</span>
          <span>Cập nhật: {formatDateTime(doc.createdAt)}</span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
      {isPdf(doc) && (
        <button
          onClick={() => onPreview(doc)}
          disabled={busy}
          className="min-h-[44px] px-3 flex items-center gap-1.5 text-sm font-semibold text-[#008BC5] border border-[#008BC5]/40 rounded-lg hover:bg-[#EAF6FF] disabled:opacity-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
          <span>Xem</span>
        </button>
      )}
      <button
        onClick={() => onDownload(doc)}
        disabled={busy}
        className="min-h-[44px] px-3 flex items-center gap-1.5 text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>Tải về</span>
      </button>
    </div>
  </div>
);