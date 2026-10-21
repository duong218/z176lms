import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchPendingExams,
  fetchApprovedExams,
  fetchExamHistory,
  approveExam,
  rejectExam,
  publishExam,
  fetchPublishImpact,
  archiveExam,
} from '../../services/exam-review.service';
import { CheckCircle, XCircle, Clock, Globe, History, Archive, Trash2, AlertTriangle, CalendarClock } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Pagination } from '../Pagination';
import { ExamStats, ExamStatusBadge, Stat, ScopeLine, senderText } from '../ExamInfo';

// Nhãn badge riêng cho bảng "Lịch sử duyệt kỳ thi" (published ở đây nghĩa là đã từng đăng).
const HISTORY_LABEL = { rejected: 'Đã từ chối', published: 'Đang phát hành', archived: 'Đã lưu trữ' };

const SectionTitle = ({ Icon, color, title, count }) => (
  <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#0F172A]">
    <Icon className={`w-5 h-5 ${color}`} aria-hidden="true" />
    {title}
    {count > 0 && <span className="text-base font-semibold text-[#334155]">({count})</span>}
  </h2>
);

const Note = ({ children }) => <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#334155]">{children}</div>;

// Nhãn text thuần cho MỌI trạng thái có thể có của Exam (không chỉ 3 trạng
// thái trong STATUS_BADGE ở trên, vốn chỉ dùng cho bảng "Lịch sử duyệt kỳ
// thi") — dùng để ghép vào câu thông báo lỗi khi thao tác bị chặn do kỳ thi
// đã đổi trạng thái ở nơi khác (tab/thiết bị khác), xem
// reportStaleStatusError() bên dưới.
const STATUS_TEXT_LABELS = {
  draft: 'Nháp',
  pending_review: 'Chờ duyệt',
  approved: 'Đã duyệt (chờ phát hành)',
  rejected: 'Đã từ chối',
  published: 'Đang phát hành',
  archived: 'Đã lưu trữ',
};

// Ô chọn ngày giờ (datetime-local) cho phép chọn "bây giờ" lệch tối đa chừng này (chỉ chính xác tới phút); khớp với server.
const START_TOLERANCE_MS = 5 * 60 * 1000;

// Date -> chuỗi 'YYYY-MM-DDTHH:mm' theo GIỜ ĐỊA PHƯƠNG, đúng định dạng của <input type="datetime-local">.
const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExamReviewTab = () => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [pendingExams, setPendingExams] = useState([]);
  const [approvedExams, setApprovedExams] = useState([]);
  const [historyExams, setHistoryExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archivingId, setArchivingId] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  // Chống bấm đúp "Xác nhận duyệt" / "Từ chối" trong lúc request đang chạy
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reject Modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Approve Modal
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveId, setApproveId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Thông báo lỗi ngày giờ ngay trong hộp thoại duyệt + mốc "bây giờ" làm giá trị nhỏ nhất của ô chọn ngày bắt đầu
  const [dateError, setDateError] = useState('');
  const [minStart, setMinStart] = useState('');

  useScrollLock(isRejectModalOpen || isApproveModalOpen);

  // Phân trang cho bảng "Lịch sử duyệt kỳ thi" — danh sách này không giới
  // hạn từ server nên có thể rất dài theo thời gian, chỉ hiện 10 dòng/trang.
  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, approved, history] = await Promise.all([
        fetchPendingExams(),
        fetchApprovedExams(),
        fetchExamHistory(),
      ]);
      setPendingExams(Array.isArray(pending) ? pending : []);
      setApprovedExams(Array.isArray(approved) ? approved : []);
      setHistoryExams(Array.isArray(history) ? history : []);
      setHistoryPage(1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dùng chung cho handleApprove/handleReject/handleArchive bên dưới — khi
  // action bị chặn vì kỳ thi không còn ở trạng thái mong đợi nữa (thường do
  // đã bị thao tác từ 1 tab/thiết bị khác đang mở song song), tự tải lại 3
  // danh sách để tìm đúng trạng thái THẬT hiện tại của kỳ thi đó, rồi ghép
  // vào thông báo lỗi cho rõ ràng, thay vì chỉ hiện message chung chung của
  // backend khiến người dùng phải tự đoán vì sao thao tác bị từ chối.
  const reportStaleStatusError = async (id, fallbackMessage) => {
    const [pending, approved, history] = await Promise.all([
      fetchPendingExams().catch(() => []),
      fetchApprovedExams().catch(() => []),
      fetchExamHistory().catch(() => []),
    ]);
    const freshExam = [...pending, ...approved, ...history].find((e) => e._id === id);
    const statusText = freshExam ? STATUS_TEXT_LABELS[freshExam.status] || freshExam.status : null;

    showToast(
      statusText
        ? `Kỳ thi này đã ở trạng thái "${statusText}" (có thể vừa được thao tác từ tab hoặc thiết bị khác) nên không thể thực hiện thao tác này nữa. Danh sách đã được tải lại cho đúng trạng thái mới nhất.`
        : fallbackMessage,
      'warning',
    );
    loadData();
  };

  const handleApprove = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Chặn ngay ở giao diện: bắt đầu phải từ hiện tại trở đi, kết thúc phải sau bắt đầu (server cũng kiểm tra lại)
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setDateError('Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.');
      return;
    }
    if (start.getTime() < Date.now() - START_TOLERANCE_MS) {
      setDateError('Thời gian bắt đầu phải từ thời điểm hiện tại trở đi.');
      return;
    }
    if (end <= start) {
      setDateError('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }
    setDateError('');

    setIsSubmitting(true);
    try {
      // Gửi mốc thời gian đã kèm múi giờ (ISO) để server hiểu đúng giờ đã chọn, không phụ thuộc múi giờ máy chủ.
      await approveExam(approveId, { startDate: start.toISOString(), endDate: end.toISOString() });
      setIsApproveModalOpen(false);
      setStartDate('');
      setEndDate('');
      showToast('Đã phê duyệt kỳ thi thành công.', 'success');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        setIsApproveModalOpen(false);
        await reportStaleStatusError(approveId, error.message || 'Lỗi khi duyệt kỳ thi');
        return;
      }
      if (error.code === 'EXAM_DATES_INVALID' || error.code === 'EXAM_DATES_REQUIRED') {
        setDateError(error.message);
        return;
      }
      showToast(error.message || 'Lỗi khi duyệt kỳ thi', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await rejectExam(rejectId, rejectReason);
      setIsRejectModalOpen(false);
      setRejectReason('');
      showToast('Đã từ chối đề xuất kỳ thi.', 'warning');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        setIsRejectModalOpen(false);
        await reportStaleStatusError(rejectId, error.message || 'Lỗi khi từ chối kỳ thi');
        return;
      }
      showToast(error.message || 'Lỗi khi từ chối kỳ thi', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpired = (exam) => new Date(exam.endDate).getTime() <= Date.now();

  const handlePublish = async (id) => {
    const ok = await confirmAction(
      'Bạn có chắc chắn muốn đăng chính thức kỳ thi này? Kỳ thi đang diễn ra (nếu có) sẽ bị lưu trữ.',
      { title: 'Đăng chính thức kỳ thi', confirmLabel: 'Đăng chính thức', danger: false }
    );
    if (!ok) return;
    setPublishingId(id);
    try {
      // Đang có thí sinh làm bài ở kỳ thi hiện tại? Đăng kỳ thi mới sẽ kết thúc kỳ thi đó ngay -> bắt buộc xác nhận lần 2.
      const confirmForce = (info) =>
        confirmAction(
          `Hiện có ${info?.activeAttemptCount ?? 'một số'} thí sinh đang làm bài` +
            (info?.currentExams?.length ? ` trong kỳ thi "${info.currentExams.map((e) => e.title).join('", "')}"` : '') +
            '. Nếu đăng kỳ thi mới bây giờ, kỳ thi này sẽ bị lưu trữ ngay và các thí sinh đó sẽ KHÔNG nộp được bài (bài làm dở có thể bị mất). Bạn có chắc chắn vẫn muốn đăng?',
          { title: 'Còn thí sinh đang làm bài', confirmLabel: 'Vẫn đăng chính thức', danger: true },
        );

      const impact = await fetchPublishImpact(id).catch(() => null);
      let force = false;
      if (impact?.activeAttemptCount > 0) {
        if (!(await confirmForce(impact))) return;
        force = true;
      }

      try {
        await publishExam(id, { force });
      } catch (err) {
        // Có thí sinh vừa vào thi sau lúc kiểm tra: hỏi lại với số liệu mới nhất rồi mới ép đăng.
        if (err.code === 'EXAM_PUBLISH_ACTIVE_ATTEMPTS' && !force) {
          const latest = await fetchPublishImpact(id).catch(() => null);
          if (!(await confirmForce(latest ?? impact))) return;
          await publishExam(id, { force: true });
        } else {
          throw err;
        }
      }
      showToast('Đã đăng chính thức kỳ thi.', 'success');
      loadData();
    } catch (error) {
      // Đề đã được thao tác ở nơi khác (đăng xong / bị bỏ qua) -> báo đúng trạng thái thật, KHÔNG bảo bấm lại.
      if (error.code === 'EXAM_INVALID_STATUS') {
        await reportStaleStatusError(id, error.message || 'Lỗi khi đăng chính thức');
        return;
      }
      // Đề đã quá thời gian kết thúc (duyệt từ trước) -> báo rõ, không bảo bấm lại.
      if (error.code === 'EXAM_DATES_EXPIRED') {
        showToast(error.message, 'error');
        return;
      }
      // Đang có Người duyệt đề khác phát hành đúng kỳ thi này.
      if (error.code === 'EXAM_PUBLISH_IN_PROGRESS' || error.code === 'EXAM_CONFLICT' || error.code === 'EXAM_PUBLISH_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
        return;
      }
      // Publish có thể đã xử lý được MỘT PHẦN trước khi lỗi xảy ra (vd mất
      // mạng giữa chừng lúc đang sinh mã đề/gán thí sinh) — kỳ thi khi đó vẫn
      // ở trạng thái "approved" (chưa published), an toàn để bấm lại. Ghi rõ
      // hướng xử lý ngay trong thông báo lỗi, tránh Leader hiểu nhầm là chưa
      // làm gì và bỏ qua không xử lý tiếp.
      showToast(
        `${error.message || 'Lỗi khi đăng chính thức'} — Vui lòng bấm "Đăng chính thức" lại để đảm bảo đầy đủ dữ liệu.`,
        'error',
      );
      // Load lại danh sách để Leader thấy đúng trạng thái mới nhất từ server,
      // tránh thao tác dựa trên dữ liệu cũ hiển thị trên màn hình.
      loadData();
    } finally {
      setPublishingId(null);
    }
  };

  const handleArchive = async (id) => {
    const ok = await confirmAction(
      'Bỏ qua kỳ thi này? Kỳ thi sẽ được lưu trữ và không thể phát hành nữa.',
      { title: 'Bỏ qua kỳ thi', confirmLabel: 'Bỏ qua' }
    );
    if (!ok) return;
    setArchivingId(id);
    try {
      await archiveExam(id);
      showToast('Đã lưu trữ kỳ thi.', 'success');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        await reportStaleStatusError(id, error.message || 'Lỗi khi bỏ qua kỳ thi');
      } else if (error.code === 'EXAM_PUBLISH_IN_PROGRESS' || error.code === 'EXAM_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
      } else {
        showToast(error.message || 'Lỗi khi bỏ qua kỳ thi', 'error');
      }
    } finally {
      setArchivingId(null);
    }
  };

  const openApprove = (id) => {
    setApproveId(id);
    setStartDate('');
    setEndDate('');
    setDateError('');
    setMinStart(toLocalInputValue(new Date()));
    setIsApproveModalOpen(true);
  };

  const openReject = (id) => {
    setRejectId(id);
    setIsRejectModalOpen(true);
  };

  const totalHistoryPages = Math.max(1, Math.ceil(historyExams.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const pagedHistoryExams = historyExams.slice((safeHistoryPage - 1) * HISTORY_PAGE_SIZE, safeHistoryPage * HISTORY_PAGE_SIZE);

  const fmtDT = (d) => new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  const metaLine = (exam) => [exam.topicId?.name, `Người gửi: ${senderText(exam)}`].filter(Boolean).join(' · ');
  const modalTitle = (id) => pendingExams.find((e) => e._id === id)?.title;
  const inputCls = 'w-full px-3 min-h-[48px] text-base border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:border-[#008BC5] outline-none';
  const labelCls = 'block text-sm font-semibold text-[#334155] mb-2';
  const btnGhost = 'flex-1 min-h-[48px] bg-white border-[1.5px] border-[#CBD5E1] hover:bg-[#F6F8FA] text-[#334155] rounded-[10px] text-base font-semibold transition-colors';
  const btnAction = 'inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-[10px] text-base font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="space-y-8">
      {/* ── Đề xuất chờ duyệt ── */}
      <section>
        <SectionTitle Icon={Clock} color="text-[#F6AD37]" title="Đề xuất chờ duyệt" count={pendingExams.length} />
        {loading ? (
          <Note>Đang tải...</Note>
        ) : pendingExams.length === 0 ? (
          <Note>Không có đề xuất nào đang chờ duyệt</Note>
        ) : (
          <ul className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
            {pendingExams.map((exam) => (
              <li key={exam._id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-z176">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#0F172A] leading-snug break-words">{exam.title}</h3>
                      <p className="text-base text-[#334155] break-words">{metaLine(exam)}</p>
                    </div>
                    <ExamStats exam={exam} />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:w-44 shrink-0">
                    <button
                      onClick={() => openApprove(exam._id)}
                      className={`${btnAction} col-span-2 lg:col-span-1 bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white`}
                    >
                      <CheckCircle className="w-4 h-4" aria-hidden="true" /> Phê duyệt
                    </button>
                    <button
                      onClick={() => openReject(exam._id)}
                      className={`${btnAction} col-span-2 lg:col-span-1 bg-white border-[1.5px] border-[#E53E3E] hover:bg-[#FEECEC] text-[#C53030]`}
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" /> Từ chối
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Kỳ thi đã duyệt, chờ phát hành ── */}
      <section>
        <SectionTitle Icon={CheckCircle} color="text-[#22C55E]" title="Kỳ thi đã duyệt (Chờ phát hành)" count={approvedExams.length} />
        {loading ? (
          <Note>Đang tải...</Note>
        ) : approvedExams.length === 0 ? (
          <Note>Không có kỳ thi nào đang chờ phát hành</Note>
        ) : (
          <ul className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '100ms' }}>
            {approvedExams.map((exam) => {
              const busy = publishingId === exam._id || archivingId === exam._id;
              return (
                <li key={exam._id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-z176">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <h3 className="text-lg font-bold text-[#0F172A] leading-snug break-words">{exam.title}</h3>
                        <p className="text-base text-[#334155] break-words">{metaLine(exam)}</p>
                      </div>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Stat Icon={CalendarClock} label="Bắt đầu" value={fmtDT(exam.startDate)} />
                        <Stat Icon={CalendarClock} label="Kết thúc" value={fmtDT(exam.endDate)} />
                      </dl>
                      {isExpired(exam) && (
                        <p className="flex items-center gap-2 text-base font-semibold text-[#C53030]">
                          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" /> Đã quá thời gian kết thúc
                        </p>
                      )}
                      <ScopeLine exam={exam} />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:w-44 shrink-0">
                      <button
                        onClick={() => handlePublish(exam._id)}
                        title={isExpired(exam) ? 'Kỳ thi đã quá hạn, không thể đăng chính thức' : undefined}
                        disabled={busy || isExpired(exam)}
                        className={`${btnAction} col-span-2 lg:col-span-1 bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white`}
                      >
                        <Globe className="w-4 h-4" aria-hidden="true" /> {publishingId === exam._id ? 'Đang đăng...' : 'Đăng chính thức'}
                      </button>
                      <button
                        onClick={() => handleArchive(exam._id)}
                        disabled={busy}
                        className={`${btnAction} col-span-2 lg:col-span-1 bg-white border-[1.5px] border-[#CBD5E1] hover:bg-[#F6F8FA] text-[#334155]`}
                      >
                        <Archive className="w-4 h-4" aria-hidden="true" /> {archivingId === exam._id ? 'Đang xử lý...' : 'Bỏ qua'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Lịch sử duyệt kỳ thi — không xóa dấu vết sau khi Duyệt/Từ chối/Đăng chính thức/Bỏ qua ── */}
      <section>
        <SectionTitle Icon={History} color="text-[#64748B]" title="Lịch sử duyệt kỳ thi" count={historyExams.length} />
        {loading ? (
          <Note>Đang tải...</Note>
        ) : historyExams.length === 0 ? (
          <Note>Chưa có kỳ thi nào được xử lý</Note>
        ) : (
          <>
            <ul className="animate-fade-in-up bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden" style={{ '--stagger-delay': '200ms' }}>
              {pagedHistoryExams.map((exam) => {
                const processedAt = exam.publishedAt || exam.approvedAt || exam.updatedAt || exam.createdAt;
                return (
                  // exam.deletedAt: đề bị từ chối mà Người ra đề đã xóa — giữ lại làm bằng chứng, nền xám + dòng chữ ghi rõ
                  <li key={exam._id} className={`p-4 sm:p-5 space-y-2 ${exam.deletedAt ? 'bg-[#F6F8FA]' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[#0F172A] break-words">{exam.title}</h3>
                        <p className="text-base text-[#334155] break-words">{metaLine(exam)}</p>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-1">
                        <ExamStatusBadge status={exam.status} label={HISTORY_LABEL[exam.status]} />
                        <span className="text-sm text-[#334155]">{processedAt ? fmtDT(processedAt) : '—'}</span>
                      </div>
                    </div>
                    {exam.status === 'rejected' && (
                      <p className="rounded-lg bg-[#FEECEC] border border-[#E53E3E]/30 p-3 text-base text-[#C53030]">
                        <b>Lý do:</b> {exam.rejectionReason || 'Không có lý do'}
                      </p>
                    )}
                    {exam.status === 'rejected' && exam.deletedAt && (
                      <p className="flex items-start gap-2 text-base font-semibold text-[#334155]">
                        <Trash2 className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" />
                        <span>Đã bị xóa bởi {exam.deletedByName || 'Người ra đề'} lúc {fmtDT(exam.deletedAt)}</span>
                      </p>
                    )}
                    {exam.status === 'archived' && (
                      <p className="flex items-start gap-2 text-base text-[#334155]">
                        <Archive className="w-4 h-4 shrink-0 mt-1" aria-hidden="true" /> Đã bị thay thế bởi kỳ thi khác hoặc bị bỏ qua
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3">
              <Pagination page={safeHistoryPage} pageCount={totalHistoryPages} onChange={setHistoryPage} />
            </div>
          </>
        )}
      </section>

      {/* Modals — render qua portal vào document.body: nếu để nằm trong cây của tab thì `fixed` bị neo theo
          phần tử cha có animation/transform (animate-fade-in-up) của dashboard, khiến lớp phủ chỉ phủ vùng
          nội dung tab và hộp thoại bị căn giữa ở GIỮA CẢ TRANG DÀI -> nằm ngoài màn hình, không thấy ô chọn thời gian. */}
      {isApproveModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-label="Phê duyệt đề xuất kỳ thi" className="bg-white rounded-xl shadow-z176 w-full max-w-md max-h-[90dvh] overflow-hidden border border-[#E2E8F0] flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F6F8FA] shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Phê duyệt đề xuất kỳ thi</h3>
              <button type="button" onClick={() => setIsApproveModalOpen(false)} aria-label="Đóng" className="text-[#334155] hover:bg-[#E2E8F0] -mr-2 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[10px]">
                <XCircle className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleApprove} noValidate className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {modalTitle(approveId) && <p className="text-base text-[#334155]">Kỳ thi: <b className="text-[#0F172A]">{modalTitle(approveId)}</b></p>}
              <div>
                <label htmlFor="approve-start" className={labelCls}>Thời gian bắt đầu</label>
                <input
                  id="approve-start"
                  required
                  type="datetime-local"
                  min={minStart}
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setDateError(''); }}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="approve-end" className={labelCls}>Thời gian kết thúc</label>
                <input
                  id="approve-end"
                  required
                  type="datetime-local"
                  min={startDate || minStart}
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setDateError(''); }}
                  className={inputCls}
                />
              </div>
              {dateError && (
                <p role="alert" className="text-base font-medium text-[#C53030] bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg px-3 py-2">
                  {dateError}
                </p>
              )}
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsApproveModalOpen(false)} className={btnGhost}>Hủy</button>
                <button type="submit" disabled={isSubmitting} className={`${btnAction} flex-1 bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white`}>
                  {isSubmitting ? 'Đang xử lý...' : 'Xác nhận duyệt'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {isRejectModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-label="Từ chối đề xuất kỳ thi" className="bg-white rounded-xl shadow-z176 w-full max-w-md max-h-[90dvh] overflow-hidden border border-[#E2E8F0] flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F6F8FA] shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Từ chối đề xuất kỳ thi</h3>
              <button type="button" onClick={() => setIsRejectModalOpen(false)} aria-label="Đóng" className="text-[#334155] hover:bg-[#E2E8F0] -mr-2 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-[10px]">
                <XCircle className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleReject} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {modalTitle(rejectId) && <p className="text-base text-[#334155]">Kỳ thi: <b className="text-[#0F172A]">{modalTitle(rejectId)}</b></p>}
              <div>
                <label htmlFor="reject-reason" className={labelCls}>Lý do từ chối</label>
                <textarea
                  id="reject-reason"
                  required
                  rows="3"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối để Người ra đề chỉnh sửa lại..."
                  className="w-full p-3 text-base border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:border-[#008BC5] outline-none"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsRejectModalOpen(false)} className={btnGhost}>Hủy</button>
                <button type="submit" disabled={isSubmitting} className={`${btnAction} flex-1 bg-[#E53E3E] hover:bg-[#C53030] text-white`}>
                  {isSubmitting ? 'Đang xử lý...' : 'Từ chối'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};