import { useState, useEffect } from 'react';
import { Select } from '../Select';
import {
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ServerCrash,
  FilePen,
  Clock,
} from 'lucide-react';
import {
  fetchQuestions,
  fetchTopics,
  fetchDepartments,
  fetchMyExamProposals,
  fetchQuestionStatsByTopic,
} from '../../services/examiner.service';

// Tab Tổng quan cho Người ra đề — viết lại thành BẢNG ĐIỀU KHIỂN theo hướng "việc cần làm trước, số liệu sau":
//  1. Việc cần xử lý: đề bị từ chối (kèm lý do), bản nháp chưa gửi duyệt, ngân hàng thi chính thức còn trống.
//  2. Ngân hàng câu hỏi: tách rõ câu THI CHÍNH THỨC và câu ÔN TẬP (chỉ câu thi chính thức mới được rút vào đề).
//  3. Tiến trình đề xuất: bản nháp -> chờ duyệt -> đã duyệt -> đã phát hành (+ bị từ chối / đã lưu trữ).
//  4. Độ phủ câu riêng theo bộ phận: bộ phận chưa có câu riêng sẽ bị khóa khi kỳ thi TẮT bù câu chung.
//  5. Đề xuất gần đây.
// Không có API tổng hợp riêng nên dùng lại đúng các API đã có (fetchQuestions limit=1 để lấy usageCounts,
// fetchTopics, fetchDepartments, fetchMyExamProposals, fetchQuestionStatsByTopic) và tự tính ở client.

// Nhãn + màu trạng thái, khớp enum EXAM_STATUS ở server/src/models/constants.js.
const STATUS_META = {
  draft: { solid: '#475569', fg: '#FFFFFF', label: 'Bản nháp', color: '#64748B', tint: '#F6F8FA', soft: 'bg-[#F6F8FA] text-[#334155]' },
  pending_review: { solid: '#F6AD37', fg: '#0F172A', label: 'Chờ duyệt', color: '#F6AD37', tint: '#FFF7E6', soft: 'bg-[#FFF7E6] text-[#B45309]' },
  approved: { solid: '#166534', fg: '#FFFFFF', label: 'Đã duyệt', color: '#22C55E', tint: '#F0FDF4', soft: 'bg-[#F0FDF4] text-[#166534]' },
  rejected: { label: 'Bị từ chối', color: '#E53E3E', tint: '#FEECEC', soft: 'bg-[#FEECEC] text-[#C53030]' },
  published: { solid: '#006BA1', fg: '#FFFFFF', label: 'Đã phát hành', color: '#008BC5', tint: '#EAF6FF', soft: 'bg-[#EAF6FF] text-[#00709F]' },
  archived: { label: 'Đã lưu trữ', color: '#94A3B8', tint: '#F6F8FA', soft: 'bg-[#F6F8FA] text-[#334155]' },
};

// Các bước của vòng đời đề xuất — đây là một chuỗi thật nên vẽ theo thứ tự trái -> phải.
const PIPELINE = ['draft', 'pending_review', 'approved', 'published'];

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Không rõ', color: '#94A3B8', tint: '#F6F8FA', soft: 'bg-[#F6F8FA] text-[#334155]' };
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function topicIdOf(proposal) {
  return proposal?.topicId?._id ?? proposal?.topicId ?? '';
}

// Khung thẻ dùng chung: tiêu đề + mô tả ngắn + nội dung
const Panel = ({ title, hint, children, className = '' }) => (
  <section className={`bg-white rounded-xl border border-slate-200 shadow-z176 p-4 sm:p-5 ${className}`}>
    <div className="mb-3">
      <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
      {hint && <p className="text-sm text-[#334155] mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

// Một dòng việc cần xử lý; nếu có onNavigate thì cả dòng bấm được
const ActionRow = ({ icon: Icon, tone, title, detail, cta, onClick }) => {
  const toneClass = tone === 'danger' ? 'bg-[#FEECEC] text-[#C53030]' : 'bg-[#FFF7E6] text-[#B45309]';
  const content = (
    <>
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-base font-semibold text-[#0F172A] break-words">{title}</span>
        {detail && <span className="block text-sm text-[#334155] mt-0.5 line-clamp-2 break-words">{detail}</span>}
      </span>
      {onClick && (
        <span className="hidden sm:flex items-center gap-1 text-sm font-semibold text-[#008BC5] shrink-0">
          {cta}
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#008BC5]/50 hover:bg-slate-50 transition-colors min-h-[56px]"
    >
      {content}
    </button>
  ) : (
    <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 min-h-[56px]">{content}</div>
  );
};

export const OverviewTab = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);

  // Độ phủ câu riêng theo bộ phận cho 1 chủ đề được chọn
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [coverage, setCoverage] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    Promise.all([fetchQuestions({ limit: 1 }), fetchTopics(), fetchDepartments(), fetchMyExamProposals()])
      .then(([questionsRes, topics, departments, proposals]) => {
        if (cancelled) return;
        const topicList = Array.isArray(topics) ? topics : [];
        const proposalList = Array.isArray(proposals) ? proposals : [];
        setData({
          examQuestions: questionsRes?.usageCounts?.exam ?? 0,
          practiceQuestions: questionsRes?.usageCounts?.practice ?? 0,
          topics: topicList,
          totalDepartments: Array.isArray(departments) ? departments.length : 0,
          proposals: proposalList,
        });
        // Mặc định xem độ phủ theo chủ đề của đề xuất mới nhất, không có thì chủ đề đầu tiên
        const latest = [...proposalList].sort(
          (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
        )[0];
        const preferred = topicIdOf(latest);
        const firstTopic = topicList[0]?._id ?? '';
        setSelectedTopicId(topicList.some((t) => t._id === preferred) ? preferred : firstTopic);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTopicId) {
      setCoverage(null);
      return undefined;
    }
    let cancelled = false;
    setCoverageLoading(true);
    setCoverageError(false);
    fetchQuestionStatsByTopic(selectedTopicId)
      .then((res) => {
        if (!cancelled) setCoverage(res);
      })
      .catch(() => {
        if (!cancelled) {
          setCoverage(null);
          setCoverageError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setCoverageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-56 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg p-4 flex items-center gap-3">
        <ServerCrash className="w-5 h-5 shrink-0 text-[#E53E3E]" />
        <p className="font-medium">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
      </div>
    );
  }

  const go = onNavigate ? (tab) => () => onNavigate(tab) : () => undefined;
  const canGo = Boolean(onNavigate);

  const byUpdated = [...data.proposals].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
  );
  const counts = data.proposals.reduce((acc, p) => {
    const key = p.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const rejected = byUpdated.filter((p) => p.status === 'rejected');
  const drafts = byUpdated.filter((p) => p.status === 'draft');
  const recent = byUpdated.slice(0, 5);

  const totalQuestions = data.examQuestions + data.practiceQuestions;
  const examShare = totalQuestions > 0 ? Math.round((data.examQuestions / totalQuestions) * 100) : 0;
  const onlyPractice = data.examQuestions === 0 && data.practiceQuestions > 0;

  // Danh sách việc cần xử lý, theo mức khẩn: đề bị từ chối -> ngân hàng thi trống -> bản nháp
  const actions = [];
  rejected.forEach((p) =>
    actions.push({
      key: `rej-${p._id}`,
      icon: AlertTriangle,
      tone: 'danger',
      title: `Đề "${p.title}" bị từ chối`,
      detail: p.rejectionReason ? `Lý do: ${p.rejectionReason}` : 'Chưa có lý do cụ thể. Mở đề để chỉnh sửa và gửi duyệt lại.',
      cta: 'Sửa đề',
      tab: 'proposals',
    }),
  );
  if (onlyPractice) {
    actions.push({
      key: 'empty-exam-bank',
      icon: BookOpen,
      tone: 'warn',
      title: 'Ngân hàng thi chính thức đang trống',
      detail: `${data.practiceQuestions} câu hiện đều thuộc ngân hàng Ôn tập nên sẽ không được rút vào đề. Chuyển sang "Thi" những câu dùng cho kỳ thi.`,
      cta: 'Mở ngân hàng',
      tab: 'questions',
    });
  }
  if (drafts.length > 0) {
    actions.push({
      key: 'drafts',
      icon: FilePen,
      tone: 'warn',
      title: `${drafts.length} bản nháp chưa gửi duyệt`,
      detail: drafts
        .slice(0, 2)
        .map((p) => p.title)
        .join(', ') + (drafts.length > 2 ? ` và ${drafts.length - 2} đề khác` : ''),
      cta: 'Gửi duyệt',
      tab: 'proposals',
    });
  }

  // Độ phủ: thang thanh tiến độ theo bộ phận có nhiều câu nhất
  const coverageDepts = coverage?.departments ?? [];
  const maxDeptCount = Math.max(1, ...coverageDepts.map((d) => d.count));
  const emptyDepts = coverageDepts.filter((d) => d.count === 0);

  return (
    <div className="animate-fade-in-up space-y-4 sm:space-y-5" style={{ '--stagger-delay': '0ms' }}>
      {/* 1. Việc cần xử lý */}
      <section
        className={`bg-white rounded-xl border border-slate-200 shadow-z176 p-4 sm:p-5 border-l-4 ${
          actions.length > 0 ? 'border-l-[#F6AD37]' : 'border-l-[#22C55E]'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          {actions.length > 0 ? (
            <AlertTriangle className="w-5 h-5 text-[#F6AD37]" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
          )}
          <h3 className="text-base font-bold text-[#0F172A]">
            {actions.length > 0 ? `Việc cần xử lý (${actions.length})` : 'Không có việc tồn đọng'}
          </h3>
        </div>
        {actions.length > 0 ? (
          <div className="space-y-2">
            {actions.map((a) => (
              <ActionRow
                key={a.key}
                icon={a.icon}
                tone={a.tone}
                title={a.title}
                detail={a.detail}
                cta={a.cta}
                onClick={canGo ? go(a.tab) : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#334155]">
            Không có đề bị từ chối hay bản nháp nào đang chờ gửi duyệt. Bạn có thể bổ sung câu hỏi hoặc tạo đề xuất kỳ thi mới.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* 2. Ngân hàng câu hỏi */}
        <Panel title="Ngân hàng câu hỏi" hint="Chỉ câu thuộc ngân hàng Thi chính thức mới được rút vào đề.">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#006BA1] text-white p-3">
              <p className="text-sm font-semibold">Thi chính thức</p>
              <p className="text-3xl font-bold mt-0.5">{data.examQuestions}</p>
            </div>
            <div className="rounded-lg bg-[#334155] text-white p-3">
              <p className="text-sm font-semibold">Ôn tập</p>
              <p className="text-3xl font-bold mt-0.5">{data.practiceQuestions}</p>
            </div>
          </div>
          {totalQuestions > 0 && (
            <div className="mt-3">
              <div
                className="h-2 rounded-full bg-slate-200 overflow-hidden"
                role="img"
                aria-label={`${examShare}% câu hỏi thuộc ngân hàng thi chính thức`}
              >
                <div className="h-full bg-[#008BC5]" style={{ width: `${examShare}%` }} />
              </div>
              <p className="text-sm text-[#334155] mt-1.5">{examShare}% tổng số {totalQuestions} câu thuộc ngân hàng thi chính thức</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={canGo ? go('topics') : undefined}
              disabled={!canGo}
              className="text-left rounded-lg px-1 py-1 hover:bg-slate-50 disabled:hover:bg-transparent transition-colors"
            >
              <p className="text-sm font-medium text-[#334155]">Chủ đề</p>
              <p className="text-lg font-bold text-[#0F172A]">{data.topics.length}</p>
            </button>
            <button
              type="button"
              onClick={canGo ? go('departments') : undefined}
              disabled={!canGo}
              className="text-left rounded-lg px-1 py-1 hover:bg-slate-50 disabled:hover:bg-transparent transition-colors"
            >
              <p className="text-sm font-medium text-[#334155]">Bộ phận / Phòng ban</p>
              <p className="text-lg font-bold text-[#0F172A]">{data.totalDepartments}</p>
            </button>
          </div>
        </Panel>

        {/* 3. Tiến trình đề xuất */}
        <Panel
          title="Tiến trình đề xuất kỳ thi"
          hint={data.proposals.length > 0 ? `Bạn đã tạo ${data.proposals.length} đề xuất.` : 'Bạn chưa tạo đề xuất kỳ thi nào.'}
        >
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PIPELINE.map((status, index) => {
              const meta = statusMeta(status);
              const n = counts[status] || 0;
              return (
                <li
                  key={status}
                  className="relative rounded-lg p-3"
                  style={{ backgroundColor: meta.solid, color: meta.fg }}
                >
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <p className={`text-3xl font-bold mt-0.5 ${n === 0 ? 'opacity-70' : ''}`}>{n}</p>
                  {index < PIPELINE.length - 1 && (
                    <ChevronRight className="hidden sm:block absolute -right-[11px] top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 bg-white z-10" />
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-2 mt-3">
            {['rejected', 'archived'].map((status) => {
              const meta = statusMeta(status);
              const n = counts[status] || 0;
              return (
                <span key={status} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${n > 0 ? meta.soft : 'bg-slate-50 text-[#64748B]'}`}>
                  {meta.label}
                  <span className="font-bold">{n}</span>
                </span>
              );
            })}
          </div>
        </Panel>

        {/* 4. Độ phủ câu riêng theo bộ phận */}
        <Panel
          title="Độ phủ câu riêng theo bộ phận"
          hint="Số câu riêng thuộc ngân hàng thi chính thức của chủ đề. Khi kỳ thi tắt bù câu chung, bộ phận thiếu câu riêng sẽ bị khóa."
        >
          {data.topics.length === 0 ? (
            <p className="text-sm text-[#64748B] py-6 text-center">Chưa có chủ đề nào.</p>
          ) : (
            <>
              <label className="block">
                <span className="sr-only">Chọn chủ đề</span>
                <Select
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-slate-300 rounded-lg text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
                >
                  {data.topics.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </label>

              {coverageLoading ? (
                <div className="mt-3 space-y-2" aria-busy="true">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : coverageError || !coverage ? (
                <p className="text-sm text-[#C53030] mt-3">Không tải được thống kê cho chủ đề này.</p>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-slate-600 mb-2">
                    Câu chung: <span className="font-bold text-[#0F172A]">{coverage.commonCount}</span>
                    {emptyDepts.length > 0 && (
                      <span className="text-[#B45309]"> — {emptyDepts.length} bộ phận chưa có câu riêng</span>
                    )}
                  </p>
                  <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {coverageDepts.map((d) => (
                      <li key={d.departmentId} className="flex items-center gap-3 text-sm">
                        <span className="w-36 sm:w-44 truncate text-slate-700" title={d.name}>
                          {d.name}
                        </span>
                        <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <span
                            className={`block h-full rounded-full ${d.count === 0 ? 'bg-transparent' : 'bg-[#008BC5]'}`}
                            style={{ width: `${(d.count / maxDeptCount) * 100}%` }}
                          />
                        </span>
                        <span className={`w-16 text-right font-semibold ${d.count === 0 ? 'text-[#B45309]' : 'text-[#0F172A]'}`}>
                          {d.count === 0 ? 'Chưa có' : d.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* 5. Đề xuất gần đây */}
        <Panel
          title="Đề xuất gần đây"
          hint={recent.length > 0 ? 'Cập nhật gần nhất ở trên cùng.' : undefined}
        >
          {recent.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-[#334155]">Bạn chưa tạo đề xuất kỳ thi nào.</p>
              {canGo && (
                <button
                  type="button"
                  onClick={go('proposals')}
                  className="mt-3 inline-flex items-center justify-center px-4 h-11 bg-[#008BC5] hover:bg-[#0693E3] text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Tạo đề xuất kỳ thi
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((p) => {
                const meta = statusMeta(p.status);
                const row = (
                  <>
                    <span className="flex-1 min-w-0 text-left">
                      <span className="block text-sm font-semibold text-[#0F172A] truncate">{p.title}</span>
                      <span className="flex items-center gap-1.5 text-sm text-[#334155] mt-0.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {p.topicId?.name ? `${p.topicId.name}, ` : ''}
                          {formatDateTime(p.updatedAt || p.createdAt)}
                        </span>
                      </span>
                    </span>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold ${meta.soft}`}>{meta.label}</span>
                  </>
                );
                return (
                  <li key={p._id}>
                    {canGo ? (
                      <button
                        type="button"
                        onClick={go('proposals')}
                        className="w-full flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-slate-50 transition-colors min-h-[52px]"
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="w-full flex items-center gap-3 py-2.5 px-1 min-h-[52px]">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};