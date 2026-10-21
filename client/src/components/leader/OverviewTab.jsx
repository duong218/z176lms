import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Users,
  FileCheck2,
  CheckCircle2,
  XCircle,
  ServerCrash,
  RefreshCw,
  Award,
  Building2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchOverviewStats, fetchResultsByDepartment, fetchReportTopics } from '../../services/report.service';

// Tab Tổng quan cho Người duyệt đề (leader).
// Dữ liệu:
//  - /reports/overview?topicId=...       -> { totalSubmissions, totalCandidates, passedCount, failedCount, passRate, avgScore }
//  - /reports/by-department?topicId=...  -> [{ _id, departmentName, totalCandidates, totalSubmissions, passedCount, failedCount, passRate, avgScore }]
//  - /reports/topics                     -> [{ _id, name, totalSubmissions }] (chỉ chủ đề đã có kết quả thi)
// topicId rỗng = "Tất cả chủ đề" (không lọc). Cả số liệu tổng quan lẫn danh sách phòng ban đều lọc theo cùng chủ đề.

const PASS_COLOR = '#22C55E';
const FAIL_COLOR = '#E53E3E';

// Ngưỡng tô màu tỷ lệ Đạt của phòng ban (chỉ để nhìn nhanh, không ảnh hưởng dữ liệu).
// Muốn đổi ngưỡng thì sửa 2 số này.
const HIGH_RATE = 70;
const MID_RATE = 40;

// text dùng màu đậm hơn để đủ tương phản trên nền trắng
const TIERS = {
  high: { label: `Từ ${HIGH_RATE}% trở lên`, color: '#22C55E', soft: '#F0FDF4', text: '#15803D' },
  mid: { label: `${MID_RATE}% đến dưới ${HIGH_RATE}%`, color: '#F6AD37', soft: '#FFF7E6', text: '#B45309' },
  low: { label: `Dưới ${MID_RATE}%`, color: '#E53E3E', soft: '#FEECEC', text: '#C53030' },
};

const tierOf = (rate) => (rate >= HIGH_RATE ? TIERS.high : rate >= MID_RATE ? TIERS.mid : TIERS.low);

const INITIAL_DEPARTMENTS_SHOWN = 8;

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const percentOf = (value, total) => (total > 0 ? ((value / total) * 100).toFixed(1) : '0.0');

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]';

// ---------- Topic select ----------
// Dropdown tự dựng thay cho <select> native: danh sách luôn nằm trong chiều rộng
// của khung (không tràn ra ngoài màn hình điện thoại) và tên chủ đề dài tự xuống dòng.
function TopicSelect({ id, value, topics, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const options = useMemo(() => [{ _id: '', name: 'Tất cả chủ đề' }, ...topics], [topics]);
  const current = options.find((o) => o._id === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const choose = (v) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 pl-3 pr-3 py-2.5 min-h-[44px] rounded-lg border border-[#E2E8F0] bg-white text-left text-sm font-medium text-[#0F172A] ${focusRing}`}
      >
        <span className="truncate">{current.name}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 sm:right-auto sm:min-w-full sm:w-80 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg"
        >
          {options.map((o) => {
            const selected = o._id === value;
            return (
              <li
                key={o._id || 'all'}
                role="option"
                aria-selected={selected}
                onClick={() => choose(o._id)}
                className={`flex items-start justify-between gap-2 px-3 py-2.5 min-h-[44px] cursor-pointer text-sm break-words ${
                  selected ? 'bg-[#EAF6FF] font-semibold text-[#00709F]' : 'text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">{o.name}</span>
                {selected && <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Skeleton ----------
const OverviewSkeleton = () => (
  <div className="space-y-6" role="status" aria-label="Đang tải dữ liệu tổng quan">
    <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white p-5 rounded-xl border border-[#E2E8F0] animate-pulse">
          <div className="h-10 w-10 bg-slate-200 rounded-xl mb-3" />
          <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-8 w-16 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 h-80 bg-white rounded-xl border border-[#E2E8F0] animate-pulse" />
      <div className="h-80 bg-white rounded-xl border border-[#E2E8F0] animate-pulse" />
    </div>
    <div className="h-64 bg-white rounded-xl border border-[#E2E8F0] animate-pulse" />
  </div>
);

// ---------- Thẻ số liệu ----------
const StatCard = ({ label, value, caption, icon: Icon, bg, fg }) => (
  <div className="rounded-xl shadow-z176 p-4 sm:p-5 flex flex-col" style={{ backgroundColor: bg, color: fg }}>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold leading-tight">{label}</p>
    </div>
    <p className="text-3xl font-bold mt-4 tabular-nums">{value}</p>
    {caption && <p className="text-sm font-medium mt-1">{caption}</p>}
  </div>
);

// ---------- Một dòng phòng ban trong bảng xếp hạng ----------
const DepartmentRow = ({ item, rank }) => {
  const rate = toNumber(item.passRate);
  const tier = tierOf(rate);
  return (
    <li className="flex items-start gap-3 py-3.5 border-t border-[#E2E8F0] first:border-t-0 first:pt-0">
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold tabular-nums shrink-0"
        style={{ backgroundColor: tier.soft, color: tier.text }}
        aria-label={`Hạng ${rank}`}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-semibold text-[#0F172A] truncate" title={item.departmentName}>
            {item.departmentName}
          </p>
          <p className="text-base font-bold tabular-nums shrink-0" style={{ color: tier.text }}>
            {rate}%
          </p>
        </div>
        <div
          className="mt-2 h-2 rounded-full bg-[#E2E8F0] overflow-hidden"
          role="progressbar"
          aria-valuenow={rate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Tỷ lệ đạt của ${item.departmentName}`}
        >
          <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(rate, 0), 100)}%`, backgroundColor: tier.color }} />
        </div>
        <p className="mt-2 text-sm text-[#64748B] flex flex-wrap gap-x-4 gap-y-0.5">
          <span>
            <span className="font-semibold tabular-nums" style={{ color: TIERS.high.text }}>{toNumber(item.passedCount)}</span> đạt
          </span>
          <span>
            <span className="font-semibold tabular-nums" style={{ color: TIERS.low.text }}>{toNumber(item.failedCount)}</span> không đạt
          </span>
          <span>
            <span className="font-semibold tabular-nums text-[#334155]">{toNumber(item.totalCandidates)}</span> thí sinh
          </span>
          <span>
            Điểm TB <span className="font-semibold tabular-nums text-[#334155]">{item.avgScore}</span>
          </span>
        </p>
      </div>
    </li>
  );
};

export const OverviewTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(''); // '' = Tất cả chủ đề
  const [showAllDepartments, setShowAllDepartments] = useState(false);

  const mountedRef = useRef(true);
  // Mỗi lần gọi tăng 1; chỉ kết quả của lần gọi MỚI NHẤT được áp dụng (đổi chủ đề liên tục không bị ghi đè bởi phản hồi cũ).
  const requestIdRef = useRef(0);

  // Gọi API và áp dụng kết quả. Không set state đồng bộ ở đây để lần tải đầu (state khởi tạo đã là loading) gọi trực tiếp trong effect được.
  const fetchAll = useCallback((selectedTopicId) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;

    const filters = { topicId: selectedTopicId };
    Promise.all([fetchOverviewStats(filters), fetchResultsByDepartment(filters)])
      .then(([overviewRes, departmentRes]) => {
        if (!isCurrent()) return;
        if (overviewRes?.success && departmentRes?.success) {
          setStats(overviewRes.data);
          setDepartments(Array.isArray(departmentRes.data) ? departmentRes.data : []);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (isCurrent()) setError(true);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, []);

  // Tải lại (đổi chủ đề / làm mới / thử lại): bật trạng thái loading rồi gọi API
  const loadData = useCallback(
    (selectedTopicId) => {
      setLoading(true);
      setError(false);
      fetchAll(selectedTopicId);
    },
    [fetchAll],
  );

  // Danh sách chủ đề chỉ phục vụ bộ lọc: lỗi thì chỉ ẩn bộ lọc, không làm hỏng cả trang.
  const loadTopics = useCallback(() => {
    fetchReportTopics()
      .then((res) => {
        if (mountedRef.current && res?.success && Array.isArray(res.data)) setTopics(res.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll('');
    loadTopics();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll, loadTopics]);

  const handleTopicChange = (event) => {
    const value = event.target.value;
    setTopicId(value);
    setShowAllDepartments(false);
    loadData(value);
  };

  const handleRefresh = () => {
    loadData(topicId);
    loadTopics();
  };

  // Xếp phòng ban theo tỷ lệ Đạt giảm dần (bằng nhau thì nhiều lượt thi hơn lên trước, rồi theo tên).
  // Phòng ban cùng tỷ lệ Đạt cùng hạng.
  const rankedDepartments = useMemo(() => {
    const sorted = [...departments].sort(
      (a, b) =>
        toNumber(b.passRate) - toNumber(a.passRate) ||
        toNumber(b.totalSubmissions) - toNumber(a.totalSubmissions) ||
        String(a.departmentName ?? '').localeCompare(String(b.departmentName ?? ''), 'vi'),
    );
    return sorted.map((item) => {
      const rate = toNumber(item.passRate);
      // hạng = vị trí đầu tiên có cùng tỷ lệ Đạt (+1)
      const rank = sorted.findIndex((other) => toNumber(other.passRate) === rate) + 1;
      return { item, rank };
    });
  }, [departments]);

  // Lần đầu chưa có dữ liệu -> skeleton. Các lần tải sau (đổi chủ đề, làm mới) giữ số liệu cũ, chỉ làm mờ nhẹ.
  if (loading && !stats) return <OverviewSkeleton />;

  // Chưa có dữ liệu thì luôn hiện khối lỗi (giữ đúng điều kiện bản gốc: error || !stats)
  if (!stats) {
    return (
      <div role="alert" className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030]">
        <div className="flex items-center gap-3">
          <ServerCrash className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p className="font-medium text-base">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
        </div>
        <button
          onClick={() => loadData(topicId)}
          className={`mt-4 px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-lg text-base font-semibold min-touch-target ${focusRing}`}
        >
          Thử lại
        </button>
      </div>
    );
  }

  const totalSubmissions = toNumber(stats.totalSubmissions);
  const totalCandidates = toNumber(stats.totalCandidates);
  const passedCount = toNumber(stats.passedCount);
  const failedCount = toNumber(stats.failedCount);
  const passRate = toNumber(stats.passRate);
  const hasSubmissions = totalSubmissions > 0;

  const selectedTopicName = topics.find((t) => t._id === topicId)?.name || '';
  const scopeLabel = topicId ? `Đang xem chủ đề: ${selectedTopicName || 'đã chọn'}` : 'Đang xem tất cả chủ đề';

  const pieData = [
    { name: 'Đạt', value: passedCount, color: PASS_COLOR },
    { name: 'Không đạt', value: failedCount, color: FAIL_COLOR },
  ];

  const avgPerCandidate = totalCandidates > 0 ? (totalSubmissions / totalCandidates).toFixed(1) : null;

  const summaryCards = [
    { label: 'Tổng số thí sinh', value: totalCandidates, caption: '', icon: Users, bg: '#006BA1', fg: '#FFFFFF' },
    {
      label: 'Tổng lượt nộp bài',
      value: totalSubmissions,
      caption: avgPerCandidate ? `Trung bình ${avgPerCandidate} lượt / thí sinh` : '',
      icon: FileCheck2,
      bg: '#334155',
      fg: '#FFFFFF',
    },
    {
      label: 'Số lượt Đạt',
      value: passedCount,
      caption: `${percentOf(passedCount, totalSubmissions)}% tổng lượt nộp`,
      icon: CheckCircle2,
      bg: '#166534',
      fg: '#FFFFFF',
    },
    {
      label: 'Số lượt Không đạt',
      value: failedCount,
      caption: `${percentOf(failedCount, totalSubmissions)}% tổng lượt nộp`,
      icon: XCircle,
      bg: '#C53030',
      fg: '#FFFFFF',
    },
  ];

  const visibleDepartments = showAllDepartments
    ? rankedDepartments
    : rankedDepartments.slice(0, INITIAL_DEPARTMENTS_SHOWN);
  const hiddenCount = rankedDepartments.length - visibleDepartments.length;

  return (
    <div className="space-y-6">
      {/* Tiêu đề + bộ lọc chủ đề + làm mới */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>
          <p className="text-sm text-[#64748B] mt-0.5">{scopeLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          {topics.length > 0 && (
            <div className="relative flex-1 min-w-0 sm:flex-none sm:w-64">
              <label htmlFor="leader-topic-filter" className="sr-only">
                Lọc theo chủ đề
              </label>
              <TopicSelect
                id="leader-topic-filter"
                value={topicId}
                topics={topics}
                onChange={(value) => handleTopicChange({ target: { value } })}
              />
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Làm mới số liệu"
            className={`inline-flex items-center justify-center gap-2 px-3 min-h-[44px] rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#334155] hover:bg-slate-50 disabled:opacity-60 shrink-0 ${focusRing}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#FEECEC] text-[#C53030] text-sm font-medium">
          <ServerCrash className="w-4 h-4 shrink-0" aria-hidden="true" />
          Không cập nhật được số liệu. Đang hiển thị số liệu lần tải trước.
        </div>
      )}

      <div aria-busy={loading} className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {/* 4 thẻ số liệu */}
        <div className="animate-fade-in-up grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ '--stagger-delay': '0ms' }}>
          {summaryCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <div className="animate-fade-in-up grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ '--stagger-delay': '120ms' }}>
          {/* Biểu đồ tròn: tỷ lệ đạt nằm giữa vòng */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <p className="text-base font-semibold text-[#0F172A]">Tỷ lệ Đạt / Không đạt</p>
              <p className="text-sm text-[#64748B]">Tổng {totalSubmissions} lượt nộp bài</p>
            </div>

            {!hasSubmissions ? (
              <div className="py-16 text-center text-[#64748B] text-base">
                {topicId
                  ? 'Chưa có kết quả thi cho chủ đề này.'
                  : 'Chưa có kết quả thi. Số liệu sẽ xuất hiện khi có thí sinh nộp bài.'}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative h-56 sm:h-64 w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, color: '#0F172A' }}
                        formatter={(value, name) => [`${value} lượt`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-[#0F172A] tabular-nums">{passRate}%</span>
                    <span className="text-sm text-[#64748B]">Tỷ lệ đạt</span>
                  </div>
                </div>

                <ul className="w-full sm:w-1/2 space-y-3">
                  {pieData.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]"
                    >
                      <span className="flex items-center gap-2.5 text-base font-medium text-[#334155]">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" />
                        {item.name}
                      </span>
                      <span className="text-right">
                        <span className="block text-base font-bold text-[#0F172A] tabular-nums">{item.value} lượt</span>
                        <span className="block text-sm text-[#64748B] tabular-nums">{percentOf(item.value, totalSubmissions)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Chỉ số phụ: tỷ lệ đạt + điểm trung bình */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4 sm:p-5 flex flex-col justify-center gap-6">
            <div>
              <p className="text-sm font-medium text-[#334155]">Tỷ lệ Đạt</p>
              <p className="text-3xl font-bold text-[#15803D] mt-1 tabular-nums">{stats.passRate}%</p>
              <div
                className="mt-3 h-2 rounded-full bg-[#E2E8F0] overflow-hidden"
                role="progressbar"
                aria-valuenow={passRate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Tỷ lệ đạt"
              >
                <div className="h-full rounded-full bg-[#22C55E]" style={{ width: `${Math.min(Math.max(passRate, 0), 100)}%` }} />
              </div>
            </div>

            <div className="border-t border-[#E2E8F0]" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FFF7E6] flex items-center justify-center shrink-0">
                <Award className="w-5 h-5 text-[#F6AD37]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#334155]">Điểm trung bình</p>
                <p className="text-3xl font-bold text-[#0F172A] mt-0.5 tabular-nums">{stats.avgScore}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Phòng ban xếp theo tỷ lệ Đạt */}
        <section
          className="animate-fade-in-up bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4 sm:p-5"
          style={{ '--stagger-delay': '240ms' }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h4 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#008BC5]" aria-hidden="true" />
                Phòng ban theo tỷ lệ Đạt
              </h4>
              <p className="text-sm text-[#64748B] mt-0.5">
                {rankedDepartments.length > 0
                  ? `${rankedDepartments.length} phòng ban có kết quả thi, xếp từ cao xuống thấp`
                  : 'Chưa có phòng ban nào có kết quả thi'}
              </p>
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#334155]" aria-label="Chú giải màu">
              {Object.values(TIERS).map((tier) => (
                <li key={tier.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tier.color }} aria-hidden="true" />
                  {tier.label}
                </li>
              ))}
            </ul>
          </div>

          {rankedDepartments.length === 0 ? (
            <div className="py-10 text-center text-[#64748B] text-base">
              {topicId ? 'Chưa có phòng ban nào thi chủ đề này.' : 'Chưa có dữ liệu kết quả thi theo phòng ban.'}
            </div>
          ) : (
            <>
              <ol>
                {visibleDepartments.map(({ item, rank }) => (
                  <DepartmentRow key={item._id} item={item} rank={rank} />
                ))}
              </ol>

              {rankedDepartments.length > INITIAL_DEPARTMENTS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllDepartments((v) => !v)}
                  className={`mt-3 w-full min-h-[44px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-semibold text-[#334155] hover:bg-slate-100 ${focusRing}`}
                >
                  {showAllDepartments ? 'Thu gọn danh sách' : `Xem thêm ${hiddenCount} phòng ban`}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};