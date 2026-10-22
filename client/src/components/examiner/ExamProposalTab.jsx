import { useState, useEffect, useRef } from 'react';
import { fetchExamProposals, createExamProposal, updateExamProposal, submitForReview, deleteExamProposal, fetchTopics, fetchQuestionStatsByTopic } from '../../services/examiner.service';
import { countExaminerTodo } from '../../hooks/useExaminerTodo';
import { FilePlus, Pencil, Send, Trash2, Ban, AlertCircle, AlertTriangle, Clock, XCircle, ChevronDown } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Pagination } from '../Pagination';
import { ExamStats, ExamStatusBadge, senderText } from '../ExamInfo';

// MỚI — Dropdown chọn chủ đề tự dựng, thay cho thẻ <select> gốc của trình
// duyệt. Danh sách xổ xuống của <select> native do OS/trình duyệt tự vẽ,
// không bị ràng buộc bởi kích thước modal cha nên có thể tràn ra ngoài viền
// modal/màn hình (đặc biệt trên mobile). Component này tự đo khoảng trống
// còn lại trong viewport để quyết định mở xuống hay lật lên trên, và luôn
// giới hạn chiều rộng/chiều cao trong phạm vi màn hình.
function TopicSelect({ value, options, onChange, placeholder = '-- Chọn chủ đề --' }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ placement: 'bottom', maxHeight: 240 });
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !wrapperRef.current) return undefined;

    const PREFERRED_MAX_HEIGHT = 240;
    const VIEWPORT_MARGIN = 12;

    const recalcPosition = () => {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;

      if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
        setMenuStyle({ placement: 'bottom', maxHeight: Math.max(120, Math.min(PREFERRED_MAX_HEIGHT, spaceBelow)) });
      } else {
        setMenuStyle({ placement: 'top', maxHeight: Math.max(120, Math.min(PREFERRED_MAX_HEIGHT, spaceAbove)) });
      }
    };

    recalcPosition();
    window.addEventListener('resize', recalcPosition);
    window.addEventListener('scroll', recalcPosition, true);
    return () => {
      window.removeEventListener('resize', recalcPosition);
      window.removeEventListener('scroll', recalcPosition, true);
    };
  }, [open]);

  const selectedOption = options.find((o) => o._id === value);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-2.5 pr-10 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none bg-white text-left relative"
        style={{ color: value ? '#0F172A' : '#64748B' }}
      >
        {selectedOption ? selectedOption.name : placeholder}
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && (
        <div
          className={`absolute z-20 w-full overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg py-1 ${
            menuStyle.placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${menuStyle.maxHeight}px` }}
          data-lenis-prevent
        >
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3.5 min-h-[44px] flex items-center text-base"
            style={!value ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt._id}
              type="button"
              onClick={() => { onChange(opt._id); setOpen(false); }}
              className="w-full text-left px-3.5 min-h-[44px] flex items-center text-base"
              style={value === opt._id ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// MỚI — Danh sách đề xuất kỳ thi hiện tải hết 1 lần (không phân trang phía
// server, xem fetchExamProposals). Về sau số lượng đề xuất tăng dần theo
// thời gian sẽ khiến trang kéo dài mãi, nên phân trang phía client, mỗi lượt
// hiển thị 10 kỳ thi.
const PAGE_SIZE = 10;

// MỚI — Trạng thái cho phép Sửa / Gửi duyệt, và cho phép Xóa (thêm "Chờ duyệt" để rút lại đề đã gửi nhầm).
// Đã duyệt / Đã đăng / Đã lưu trữ thì không có thao tác nào. Server kiểm tra lại, đây chỉ là để ẩn nút.
const canEdit = (status) => status === 'draft' || status === 'rejected';
const canDelete = (status) => canEdit(status) || status === 'pending_review';

// Câu xác nhận xóa theo trạng thái (đề bị từ chối vẫn được giữ trong lịch sử của Người duyệt đề, nên nói rõ).
const buildDeleteConfirmMessage = (exam) => {
  const base = `Xóa đề xuất "${exam.title}"? Hành động này không thể hoàn tác.`;
  if (exam.status === 'pending_review') {
    return `${base} Đề đang chờ duyệt nên Người duyệt đề sẽ không còn thấy đề này nữa.`;
  }
  if (exam.status === 'rejected') {
    return `${base} Đề bị từ chối này vẫn được giữ trong lịch sử duyệt của Người duyệt đề, đánh dấu là đã bị xóa bởi bạn.`;
  }
  return base;
};

// Thông báo cho đề của người khác (bị khóa hoàn toàn).
const NOT_OWNER_MESSAGE = 'Bạn không phải người đề xuất kỳ thi này';

// MỚI — Giá trị mặc định của form khi mở modal "Tạo đề xuất mới" (tách riêng
// hằng số để openCreateModal() dùng lại được, tránh lặp lại object literal).
const DEFAULT_FORM_DATA = {
  title: '',
  topicId: '',
  durationMinutes: 30,
  totalQuestions: 20,
  commonQuestionCount: 10,
  departmentQuestionCount: 10,
  passThresholdPercent: 70,
  // MỚI — Công tắc BÙ CÂU CHUNG: mặc định TẮT (công bằng). Bật = phòng thiếu câu riêng được bù bằng câu chung (hành vi cũ).
  allowCommonCompensation: false,
  // MỚI — Phạm vi phòng ban được thi: mặc định tất cả phòng ban.
  departmentScope: 'all',
  allowedDepartmentIds: [],
};

// highlightExam: { examId, ts } — yêu cầu từ chuông thông báo (bấm "đã duyệt"/"bị từ chối"): nhảy tới đúng trang,
// cuộn và tô sáng đúng đề xuất đó. onHighlightConsumed: báo App xóa yêu cầu để lần sau mở lại tab không tô sáng lại.
export const ExamProposalTab = ({ highlightExam, onHighlightConsumed, onTodoChange }) => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [exams, setExams] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // MỚI — id của đề đang được SỬA (null = modal đang ở chế độ "tạo mới").
  // Dùng để form biết gọi updateExamProposal thay vì createExamProposal, và
  // để đổi tiêu đề/nút bấm của modal cho đúng ngữ cảnh.
  const [editingExamId, setEditingExamId] = useState(null);
  // Id đề đang gửi duyệt — chống bấm đúp nút "Gửi duyệt" khi request chưa xong
  const [submittingReviewId, setSubmittingReviewId] = useState(null);
  // Id đề đang xóa — chống bấm đúp nút "Xóa" khi request chưa xong
  const [deletingId, setDeletingId] = useState(null);

  useScrollLock(isModalOpen);
  // MỚI — Trang hiện tại của danh sách đề xuất (phân trang client-side, 10
  // kỳ thi/trang). Reset về trang 1 mỗi khi tải lại danh sách (xem loadData).
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

  // Thống kê số câu hỏi (chung + riêng theo từng bộ phận) của chủ đề đang
  // chọn trong form — dùng để hiển thị gợi ý và validate ngay trên UI, tránh
  // để tới lúc Người duyệt đề publish mới phát hiện thiếu câu hỏi.
  const [topicStats, setTopicStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!formData.topicId) {
      setTopicStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    fetchQuestionStatsByTopic(formData.topicId)
      .then((data) => { if (!cancelled) setTopicStats(data); })
      .catch(() => { if (!cancelled) setTopicStats(null); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [formData.topicId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examsData, topicsData] = await Promise.all([
        fetchExamProposals(),
        // MỚI — kèm số câu hỏi từng ngân hàng của mỗi chủ đề (questionCounts: { exam, practice }) để chỉ cho chọn chủ đề có câu THI CHÍNH THỨC
        fetchTopics({ withCounts: true })
      ]);
      setExams(Array.isArray(examsData) ? examsData : []);
      setTopics(Array.isArray(topicsData) ? topicsData : []);
      setPage(1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Báo số đề cần xử lý lên Dashboard (huy hiệu đỏ ở menu) ngay sau mỗi thay đổi danh sách
  useEffect(() => {
    if (!loading) onTodoChange?.(countExaminerTodo(exams));
  }, [loading, exams, onTodoChange]);

  // Tính trước xem cấu hình (commonQuestionCount/departmentQuestionCount) có
  // khả thi không, THEO ĐÚNG công thức bù mà backend
  // (exam-code-generation.service.js) đang dùng: nếu 1 bộ phận thiếu câu
  // riêng, phần thiếu sẽ được bù từ pool câu chung. Chỉ thật sự KHÔNG khả
  // thi nếu pool chung không đủ để bù cho bộ phận đó.
  const commonCount = topicStats?.commonCount ?? 0;
  const common = Number(formData.commonQuestionCount) || 0;
  const perDept = Number(formData.departmentQuestionCount) || 0;
  const total = Number(formData.totalQuestions) || 0;

  const commonExceedsPool = common > commonCount;
  const sumMismatch = formData.topicId && common + perDept !== total;

  // Công tắc bù câu chung (MỚI): BẬT -> thiếu câu riêng thì bù từ pool chung (chỉ chặn khi pool chung không đủ bù).
  // TẮT -> KHÔNG bù: phòng thiếu câu riêng không bị chặn lưu đề, nhưng sẽ bị KHÓA khỏi danh sách vai trò thi (chỉ cảnh báo).
  const allowCompensation = Boolean(formData.allowCommonCompensation);
  const scopeMode = formData.departmentScope === 'selected' ? 'selected' : 'all';
  const allowedDeptIdSet = new Set((formData.allowedDepartmentIds ?? []).map(String));

  // MỚI — Chỉ kiểm tra / cảnh báo các phòng nằm trong phạm vi thi (mode all: phòng có ≥1 NV).
  const isDeptInFormScope = (d) => {
    if (scopeMode === 'selected') return allowedDeptIdSet.has(String(d.departmentId));
    return (d.employeeCount ?? 0) > 0;
  };

  const scopedDepartments = (topicStats?.departments ?? []).filter(isDeptInFormScope);

  const infeasibleDepartments = scopedDepartments
    .map((d) => {
      const shortfall = Math.max(0, perDept - d.count);
      const neededCommon = common + shortfall;
      return {
        ...d,
        shortfall,
        neededCommon,
        infeasible: allowCompensation && neededCommon > commonCount,
      };
    })
    .filter((d) => d.shortfall > 0);

  const scopeInsufficientDepartments =
    !allowCompensation && perDept > 0
      ? scopedDepartments.filter((d) => d.count < perDept)
      : [];

  // MỚI — Đang BẬT bù nhưng ngân hàng không đủ câu chung để bù (chung + phần thiếu > số câu chung hiện có) -> chặn lưu, báo lỗi đỏ.
  // Các phòng thiếu câu riêng còn lại (bù được) chỉ hiện cảnh báo vàng "sẽ tự bù".
  const compensationShortDepartments = infeasibleDepartments.filter((d) => d.infeasible);
  const compensatableDepartments = infeasibleDepartments.filter((d) => !d.infeasible);

  const excludedScopeDepartments =
    scopeMode === 'selected'
      ? (topicStats?.departments ?? []).filter((d) => !allowedDeptIdSet.has(String(d.departmentId)))
      : [];

  // MỚI — Ô chọn chủ đề CHỈ liệt kê chủ đề đang có câu hỏi thuộc ngân hàng THI CHÍNH THỨC (kể cả chủ đề vừa được chuyển câu từ
  // Ôn tập sang Thi). Chủ đề chỉ có câu Ôn tập không xuất hiện. Câu ôn tập không bao giờ được rút vào đề (server lọc theo
  // questionUsageFilter). Thiếu questionCounts (server cũ) -> coi là có, không ẩn nhầm.
  const examCountOfTopic = (topic) => (topic?.questionCounts ? topic.questionCounts.exam ?? 0 : null);
  const examTopics = topics.filter((t) => {
    const n = examCountOfTopic(t);
    return n === null || n > 0;
  });
  const hasExamTopics = examTopics.length > 0;
  const topicOptions = examTopics.map((t) => {
    const n = examCountOfTopic(t);
    return n === null ? t : { ...t, name: `${t.name} (${n} câu thi chính thức)` };
  });
  // Chủ đề đang chọn không nằm trong danh sách chủ đề thi chính thức (chỉ xảy ra khi dữ liệu vừa đổi) -> chặn lưu
  const selectedTopicNoExam =
    Boolean(formData.topicId) &&
    topics.length > 0 &&
    !examTopics.some((t) => String(t._id) === String(formData.topicId));

  const hasBlockingError =
    !!formData.topicId &&
    (selectedTopicNoExam ||
      commonExceedsPool ||
      sumMismatch ||
      infeasibleDepartments.some((d) => d.infeasible) ||
      scopeInsufficientDepartments.length > 0);

  // MỚI — Mở modal ở chế độ "Tạo mới": reset form về mặc định, editingExamId
  // = null để form biết gọi createExamProposal khi submit.
  const openCreateModal = () => {
    setEditingExamId(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  // MỚI — Mở modal ở chế độ "Chỉnh sửa": nạp sẵn dữ liệu của đề đang chọn
  // vào form (đúng như dữ liệu hiện có, không phải giá trị mặc định), rồi
  // mở modal y hệt giao diện tạo mới. topicId có thể là object đã populate
  // (exam.topicId?.name) hoặc string id tuỳ nơi gọi — chuẩn hoá về string id
  // để TopicSelect nhận đúng giá trị.
  const officialTopicIdOrEmpty = (topicId) => {
    if (!topicId || topics.length === 0) return topicId;
    if (examTopics.some((t) => String(t._id) === String(topicId))) return topicId;
    showToast('Chủ đề của đề xuất này hiện không còn câu hỏi thi chính thức. Vui lòng chọn chủ đề khác.', 'warning');
    return '';
  };

  const openEditModal = (exam) => {
    setEditingExamId(exam._id);
    setFormData({
      title: exam.title,
      // Chủ đề của đề cũ đã hết câu thi chính thức (vd đã chuyển hết sang Ôn tập) -> bỏ chọn để người soạn chọn chủ đề khác
      topicId: officialTopicIdOrEmpty(exam.topicId?._id ?? exam.topicId ?? ''),
      durationMinutes: exam.durationMinutes,
      totalQuestions: exam.totalQuestions,
      commonQuestionCount: exam.commonQuestionCount,
      departmentQuestionCount: exam.departmentQuestionCount,
      passThresholdPercent: exam.passThresholdPercent,
      // Kỳ thi cũ chưa có field này được hệ thống coi là đang BẬT bù -> hiển thị đúng như vậy khi sửa
      allowCommonCompensation: exam.allowCommonCompensation !== false,
      departmentScope: exam.departmentScope === 'selected' ? 'selected' : 'all',
      allowedDepartmentIds:
        exam.departmentScope === 'selected'
          ? (exam.allowedDepartmentIds ?? []).map((d) => String(d._id ?? d))
          : [],
    });
    setIsModalOpen(true);
  };

  const toggleAllowedDepartment = (departmentId) => {
    const key = String(departmentId);
    setFormData((prev) => {
      const set = new Set((prev.allowedDepartmentIds ?? []).map(String));
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, allowedDepartmentIds: [...set] };
    });
  };

  const switchToSelectedScope = () => {
    setFormData((prev) => {
      if (prev.departmentScope === 'selected') return prev;
      const allIds = (topicStats?.departments ?? []).map((d) => String(d.departmentId));
      return { ...prev, departmentScope: 'selected', allowedDepartmentIds: allIds };
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingExamId(null);
  };

  // ĐỔI — Dùng chung cho cả "Tạo mới" và "Chỉnh sửa": nếu editingExamId có
  // giá trị thì gọi updateExamProposal (PATCH), ngược lại gọi
  // createExamProposal (POST) như trước. Cùng 1 validate, cùng 1 payload.
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.topicId) {
      showToast('Vui lòng chọn chủ đề liên kết cho kỳ thi.', 'warning');
      return;
    }
    if (selectedTopicNoExam) {
      showToast('Chủ đề này chưa có câu hỏi thi chính thức nào (câu thuộc ngân hàng Ôn tập không được dùng để ra đề). Vui lòng chọn chủ đề khác hoặc chuyển câu hỏi sang ngân hàng Thi chính thức.', 'warning');
      return;
    }
    if (hasBlockingError) {
      showToast('Cấu hình số câu hỏi chưa hợp lệ so với ngân hàng câu hỏi hiện có của chủ đề này. Vui lòng kiểm tra lại phần cảnh báo trong form.', 'warning');
      return;
    }
    if (scopeMode === 'selected' && allowedDeptIdSet.size === 0) {
      showToast('Vui lòng chọn ít nhất một phòng ban trong phạm vi được thi.', 'warning');
      return;
    }
    if (excludedScopeDepartments.length > 0) {
      const names = excludedScopeDepartments.map((d) => d.name).join(', ');
      const ok = await confirmAction(
        `Các phòng ban sau sẽ không được phép tham gia thi: ${names}. Bạn vẫn muốn lưu đề xuất?`,
        { title: 'Xác nhận phạm vi phòng ban', confirmLabel: 'Vẫn lưu', danger: false },
      );
      if (!ok) return;
    }
    const payload = {
      ...formData,
      durationMinutes: Number(formData.durationMinutes),
      totalQuestions: Number(formData.totalQuestions),
      commonQuestionCount: Number(formData.commonQuestionCount),
      departmentQuestionCount: Number(formData.departmentQuestionCount),
      passThresholdPercent: Number(formData.passThresholdPercent),
      allowCommonCompensation: Boolean(formData.allowCommonCompensation),
      departmentScope: scopeMode,
      allowedDepartmentIds: scopeMode === 'selected' ? [...allowedDeptIdSet] : undefined,
    };
    try {
      if (editingExamId) {
        await updateExamProposal(editingExamId, payload);
        showToast('Đã lưu thay đổi. Đề xuất đã quay về trạng thái Nháp — nhớ Gửi duyệt lại nhé.', 'success');
      } else {
        await createExamProposal(payload);
        showToast('Đã tạo đề xuất kỳ thi thành công.', 'success');
      }
      closeModal();
      loadData();
    } catch (error) {
      showToast(error.message || (editingExamId ? 'Lỗi khi lưu thay đổi' : 'Lỗi khi tạo đề xuất'), 'error');
    }
  };

  // Nhãn text thuần (không kèm icon/màu) cho từng trạng thái — dùng để ghép
  // vào câu thông báo lỗi (mục đích khác với getStatusBadge() vốn để render
  // JSX trong bảng), tránh lặp lại chuỗi tiếng Việt ở 2 nơi dễ lệch nhau.
  const STATUS_TEXT_LABELS = {
    draft: 'Nháp',
    pending_review: 'Chờ duyệt',
    rejected: 'Bị từ chối',
    approved: 'Đã duyệt',
    published: 'Đã đăng',
    archived: 'Đã lưu trữ',
  };

  const handleSubmitReview = async (id) => {
    const ok = await confirmAction(
      'Bạn có chắc chắn muốn gửi đề xuất này cho Người duyệt đề duyệt?',
      { title: 'Gửi duyệt đề xuất', confirmLabel: 'Gửi duyệt', danger: false }
    );
    if (!ok) return;
    if (submittingReviewId) return;
    setSubmittingReviewId(id);
    try {
      const data = await submitForReview(id);
      showToast('Đã gửi đề xuất cho Người duyệt đề.', 'success');
      if (data?.warnings?.outOfScopeEmployeeCount > 0) {
        const deptText = (data.warnings.outOfScopeDepartments ?? [])
          .map((d) => `${d.name} (${d.employeeCount} NV)`)
          .join(', ');
        showToast(
          `Cảnh báo: ${data.warnings.outOfScopeEmployeeCount} nhân viên ngoài phạm vi kỳ thi${deptText ? ` — ${deptText}` : ''}.`,
          'warning',
        );
      }
      loadData();
    } catch (error) {
      // EXAM_INVALID_STATUS: kỳ thi không còn ở trạng thái draft/rejected nữa
      // (vd đã được gửi duyệt từ 1 tab/thiết bị khác đang mở song song trước
      // đó — backend chặn đúng để tránh gửi duyệt trùng lặp). Trường hợp này
      // KHÔNG phải lỗi thật, chỉ là dữ liệu trên UI đang cũ hơn DB — nên cần
      // tự tải lại danh sách để badge trạng thái cập nhật đúng ngay, và nói
      // rõ trạng thái THẬT hiện tại thay vì message chung chung của backend,
      // để người dùng hiểu ngay tại sao không gửi được nữa mà không cần tự đoán.
      if (error.code === 'EXAM_INVALID_STATUS') {
        const freshExams = await fetchExamProposals().catch(() => null);
        const freshExam = Array.isArray(freshExams) ? freshExams.find((e) => e._id === id) : null;
        const statusText = freshExam ? STATUS_TEXT_LABELS[freshExam.status] || freshExam.status : null;
        showToast(
          statusText
            ? `Kỳ thi này đã ở trạng thái "${statusText}" (có thể vừa được thao tác từ tab hoặc thiết bị khác) nên không thể gửi duyệt lại. Danh sách đã được tải lại cho đúng trạng thái mới nhất.`
            : 'Kỳ thi không còn ở trạng thái phù hợp để gửi duyệt (có thể vừa được thao tác từ tab hoặc thiết bị khác). Danh sách đã được tải lại cho đúng trạng thái mới nhất.',
          'warning',
        );
        loadData();
        return;
      }
      // EXAM_CONFLICT: đề vừa bị sửa/chuyển trạng thái ở nơi khác đúng lúc đang gửi -> tải lại cho đúng dữ liệu mới nhất.
      if (error.code === 'EXAM_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
        return;
      }
      showToast(error.message || 'Lỗi khi gửi duyệt', 'error');
    } finally {
      setSubmittingReviewId(null);
    }
  };

  // MỚI — Xóa đề xuất của chính mình. Mọi lỗi "dữ liệu cũ" (đề đã đổi trạng thái / đã bị xóa ở tab khác) đều tải lại danh sách
  // và nói đúng nguyên nhân, không coi là lỗi hệ thống.
  const handleDelete = async (exam) => {
    if (deletingId) return;
    const ok = await confirmAction(buildDeleteConfirmMessage(exam), {
      title: 'Xóa đề xuất kỳ thi',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(exam._id);
    try {
      await deleteExamProposal(exam._id);
      showToast('Đã xóa đề xuất kỳ thi.', 'success');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_NOT_FOUND') {
        showToast('Đề xuất này không còn tồn tại (có thể đã được xóa từ tab hoặc thiết bị khác). Danh sách đã được tải lại.', 'warning');
        loadData();
        return;
      }
      if (error.code === 'EXAM_INVALID_STATUS') {
        // Server đã nêu đúng trạng thái thật ("Đề đã được duyệt, không thể xóa"...)
        showToast(`${error.message} (có thể vừa được thao tác từ tab hoặc thiết bị khác). Danh sách đã được tải lại.`, 'warning');
        loadData();
        return;
      }
      if (error.code === 'EXAM_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
        return;
      }
      showToast(error.message || 'Lỗi khi xóa đề xuất', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Nút Xóa dùng chung cho thẻ mobile và bảng desktop (chỉ khác kích thước/độ rộng).
  const renderDeleteButton = (exam, sizeClass) => (
    <button
      onClick={() => handleDelete(exam)}
      disabled={deletingId === exam._id}
      aria-label="Xóa đề xuất"
      className={`inline-flex items-center justify-center gap-1.5 border border-[#E53E3E] bg-white hover:bg-[#FEECEC] active:bg-[#FEECEC] text-[#C53030] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${sizeClass}`}
    >
      <Trash2 className="w-4 h-4" /> {deletingId === exam._id ? 'Đang xóa...' : 'Xóa'}
    </button>
  );

  // ── Tô sáng 1 đề xuất khi được mở từ thông báo ──
  const [highlightedId, setHighlightedId] = useState(null);
  const pendingHighlightRef = useRef(null);

  // (2) Dữ liệu đã tải xong và đang có yêu cầu chờ -> nhảy tới trang chứa đề đó rồi tô sáng.
  // Khai báo TRƯỚC effect nhận yêu cầu để lần render đầu chưa có yêu cầu thì bỏ qua.
  useEffect(() => {
    const targetId = pendingHighlightRef.current;
    if (loading || !targetId) return;
    pendingHighlightRef.current = null;
    onHighlightConsumed?.();
    const index = exams.findIndex((e) => e._id === targetId);
    if (index === -1) return; // đề không còn trong danh sách: chỉ mở tab, không tô sáng
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    setHighlightedId(targetId);
  }, [loading, exams]); // eslint-disable-line react-hooks/exhaustive-deps

  // (1) Nhận yêu cầu mới. Nếu tab đã mở sẵn (không đang tải) thì tải lại để thấy đúng trạng thái
  // vừa được duyệt/từ chối; nếu vừa mở tab thì loadData() lần đầu đang chạy rồi nên không tải thêm.
  useEffect(() => {
    if (!highlightExam?.examId) return;
    pendingHighlightRef.current = String(highlightExam.examId);
    if (!loading) loadData();
  }, [highlightExam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuộn tới dòng được tô sáng (bản mobile/desktop cùng tồn tại trong DOM, chọn bản đang hiển thị), tự tắt sau 4s.
  useEffect(() => {
    if (!highlightedId) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = Array.from(document.querySelectorAll(`[data-exam-id="${highlightedId}"]`)).find(
        (n) => n.offsetParent !== null,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = setTimeout(() => setHighlightedId(null), 4000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [highlightedId]);

  // MỚI — Cắt danh sách theo trang hiện tại (10 kỳ thi/trang). exams giữ
  // nguyên toàn bộ dữ liệu gốc (không đổi) — chỉ pagedExams (phần hiển thị)
  // thay đổi theo `page`.
  const totalPages = Math.max(1, Math.ceil(exams.length / PAGE_SIZE));
  const pagedExams = exams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <div className="space-y-4">
      <div className="animate-fade-in-up flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 sm:p-5 rounded-xl border border-[#E2E8F0] shadow-z176" style={{ '--stagger-delay': '0ms' }}>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Danh sách đề xuất kỳ thi</h2>
          <p className="text-base text-[#334155]">Tạo cấu trúc đề thi và trình Người duyệt đề phê duyệt</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 min-h-[48px] w-full sm:w-auto bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white rounded-[10px] text-base font-semibold transition-colors"
        >
          <FilePlus className="w-5 h-5" aria-hidden="true" /> Tạo đề xuất mới
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center text-base text-[#334155]">Đang tải...</div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center text-[#334155]">
          <FilePlus className="w-12 h-12 mx-auto mb-3 text-[#64748B]" aria-hidden="true" />
          <p className="font-semibold text-base text-[#0F172A]">Chưa có đề xuất nào</p>
          <p className="text-base mt-1">Bấm "Tạo đề xuất mới" để bắt đầu</p>
        </div>
      ) : (
        <>
          {/* Một danh sách thẻ duy nhất cho mọi kích thước: mobile xếp dọc, desktop (lg) đẩy nút thao tác sang cột phải. */}
          <ul className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '80ms' }}>
            {pagedExams.map((exam) =>
              exam.isMine === false ? (
                <li key={exam._id} data-exam-id={exam._id} aria-disabled="true" className="rounded-xl border border-[#CBD5E1] bg-[#F1F5F9] p-4 sm:p-5 text-[#334155] select-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 text-base font-bold break-words line-through">{exam.title}</h3>
                    <ExamStatusBadge status={exam.status} />
                  </div>
                  <p className="mt-1 text-base break-words line-through">Người gửi: {senderText(exam)}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-base font-semibold">
                    <Ban className="w-4 h-4 shrink-0" aria-hidden="true" /> {NOT_OWNER_MESSAGE}
                  </p>
                </li>
              ) : (
                <li
                  key={exam._id}
                  data-exam-id={exam._id}
                  className={`rounded-xl border p-4 sm:p-5 shadow-z176 transition-colors ${
                    highlightedId === exam._id ? 'border-[#008BC5] ring-2 ring-[#008BC5]/40 bg-[#EAF6FF]' : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-[#0F172A] leading-snug break-words">{exam.title}</h3>
                          <p className="text-base text-[#334155] break-words">
                            {[exam.topicId?.name, `Người gửi: ${senderText(exam)}`].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <ExamStatusBadge status={exam.status} />
                      </div>

                      <ExamStats exam={exam} />

                      {exam.status === 'rejected' && exam.rejectionReason && (
                        <div className="flex items-start gap-2 rounded-lg bg-[#FEECEC] border border-[#E53E3E]/30 p-3 text-base text-[#C53030]">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            <b>Lý do từ chối:</b> {exam.rejectionReason}
                          </span>
                        </div>
                      )}
                    </div>

                    {canDelete(exam.status) && (
                      <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:w-44 shrink-0">
                        {canEdit(exam.status) && (
                          <>
                            <button
                              onClick={() => handleSubmitReview(exam._id)}
                              disabled={submittingReviewId === exam._id}
                              className="col-span-2 lg:col-span-1 inline-flex items-center justify-center gap-2 px-4 min-h-[48px] bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] text-white rounded-[10px] text-base font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Send className="w-4 h-4" aria-hidden="true" /> {submittingReviewId === exam._id ? 'Đang gửi...' : 'Gửi duyệt'}
                            </button>
                            <button
                              onClick={() => openEditModal(exam)}
                              className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] bg-white border-[1.5px] border-[#008BC5] hover:bg-[#F0F9FF] text-[#008BC5] rounded-[10px] text-base font-semibold transition-colors"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" /> Chỉnh sửa
                            </button>
                          </>
                        )}
                        {renderDeleteButton(exam, `px-4 min-h-[48px] rounded-[10px] text-base ${canEdit(exam.status) ? '' : 'col-span-2 lg:col-span-1'}`)}
                      </div>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>

          <Pagination page={page} pageCount={totalPages} onChange={handlePageChange} />
        </>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
                  {editingExamId ? 'Chỉnh sửa đề xuất kỳ thi' : 'Tạo đề xuất kỳ thi mới'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Thiết lập cấu trúc đề, phân bổ số lượng câu hỏi và phạm vi phòng ban tham gia
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Đóng cửa sổ"
              >
                <XCircle className="w-7 h-7" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto" data-lenis-prevent>
              <form id="createExamForm" onSubmit={handleSubmitForm} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* CỘT TRÁI (7 cột): Thông tin cơ bản & Số lượng câu hỏi */}
                  <div className="lg:col-span-7 space-y-5">
                    {/* 1. Tên kỳ thi */}
                    <div>
                      <label className="block text-base font-semibold text-slate-800 mb-1.5">
                        Tên kỳ thi <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full px-4 py-3 text-base border-2 border-slate-300 rounded-xl focus:border-[#008BC5] focus:bg-white bg-slate-50/50 outline-none transition-all placeholder:text-slate-400 font-medium text-slate-900"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="VD: Hội thi chuyên môn nghiệp vụ quý 4"
                      />
                    </div>

                    {/* 2. Chủ đề liên kết */}
                    <div>
                      <label className="block text-base font-semibold text-slate-800 mb-1.5">
                        Chủ đề câu hỏi liên kết <span className="text-red-500">*</span>
                      </label>
                      <TopicSelect
                        value={formData.topicId}
                        options={topicOptions}
                        onChange={(topicId) => setFormData({ ...formData, topicId })}
                      />
                      <p className="text-sm text-slate-600 mt-1">
                        Chỉ hiển thị các chủ đề đang có câu hỏi thi chính thức.
                      </p>
                      {!loading && !hasExamTopics && (
                        <p className="text-sm text-[#C53030] bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg px-3 py-2 mt-2">
                          Chưa có chủ đề nào có câu hỏi thi chính thức. Hãy thêm câu hỏi vào ngân hàng Thi chính thức trước
                          khi tạo đề xuất.
                        </p>
                      )}
                      {selectedTopicNoExam && (
                        <p className="text-sm text-[#C53030] bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg px-3 py-2 mt-2">
                          Chủ đề đang chọn hiện không còn câu hỏi thi chính thức. Vui lòng chọn chủ đề khác.
                        </p>
                      )}
                    </div>

                    {/* 3. Cấu hình thời gian & điểm đạt */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#008BC5]" />
                        Thời gian & Tiêu chuẩn đạt
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">
                            Thời gian làm bài (phút)
                          </label>
                          <input
                            required
                            type="number"
                            min="1"
                            inputMode="numeric"
                            className="w-full px-3.5 py-2.5 text-base font-semibold border-2 border-slate-300 rounded-lg focus:border-[#008BC5] bg-white outline-none"
                            value={formData.durationMinutes}
                            onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">
                            Điểm đạt tối thiểu (%)
                          </label>
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            inputMode="numeric"
                            className="w-full px-3.5 py-2.5 text-base font-semibold border-2 border-slate-300 rounded-lg focus:border-[#008BC5] bg-white outline-none"
                            value={formData.passThresholdPercent}
                            onChange={(e) => setFormData({ ...formData, passThresholdPercent: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 4. Cấu trúc số lượng câu hỏi */}
                    <div className="p-4 bg-sky-50/40 border border-sky-200 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-sky-900 uppercase tracking-wide">
                          Cơ cấu phân bổ số câu hỏi
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                          Chung + Riêng = Tổng
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                            <span>Tổng số câu</span>
                            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-medium">Tự tính</span>
                          </label>
                          <input
                            tabIndex={-1}
                            readOnly
                            type="number"
                            className="w-full px-3 py-2 text-lg font-bold text-center text-slate-700 border-2 border-slate-200 rounded-lg bg-slate-100/80 outline-none cursor-default select-none"
                            value={formData.totalQuestions}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Số câu chung
                          </label>
                          <input
                            required
                            type="number"
                            min="0"
                            inputMode="numeric"
                            className="w-full px-3 py-2 text-lg font-bold text-center text-[#008BC5] border-2 border-slate-300 rounded-lg focus:border-[#008BC5] bg-white outline-none"
                            value={formData.commonQuestionCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              const cNum = Number(val) || 0;
                              const dNum = Number(formData.departmentQuestionCount) || 0;
                              setFormData({
                                ...formData,
                                commonQuestionCount: val,
                                totalQuestions: cNum + dNum,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Số câu bộ phận
                          </label>
                          <input
                            required
                            type="number"
                            min="0"
                            inputMode="numeric"
                            className="w-full px-3 py-2 text-lg font-bold text-center text-indigo-600 border-2 border-slate-300 rounded-lg focus:border-[#008BC5] bg-white outline-none"
                            value={formData.departmentQuestionCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              const dNum = Number(val) || 0;
                              const cNum = Number(formData.commonQuestionCount) || 0;
                              setFormData({
                                ...formData,
                                departmentQuestionCount: val,
                                totalQuestions: cNum + dNum,
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5. Công tắc bù câu chung */}
                    <label className="flex items-start gap-3.5 p-4 bg-slate-50 hover:bg-slate-100/70 border-2 border-slate-200 rounded-xl cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        className="mt-1 w-5 h-5 shrink-0 accent-[#008BC5] rounded cursor-pointer"
                        checked={Boolean(formData.allowCommonCompensation)}
                        onChange={(e) => setFormData({ ...formData, allowCommonCompensation: e.target.checked })}
                      />
                      <span className="text-sm text-slate-700 select-none">
                        <span className="block font-bold text-base text-slate-800">
                          Cho phép bù câu hỏi chung khi phòng ban thiếu câu riêng
                        </span>
                        <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                          <strong>• Bật:</strong> Phòng thiếu câu riêng vẫn thi được (bù phần thiếu bằng câu chung).
                          <br />
                          <strong>• Tắt (khuyến nghị công bằng):</strong> Phòng chưa đủ câu riêng bị khóa, thí sinh không thể thi đề toàn câu chung.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* CỘT PHẢI (5 cột): Số liệu ngân hàng câu hỏi & Phạm vi phòng ban */}
                  <div className="lg:col-span-5 space-y-5">
                    {/* Bảng số liệu câu hỏi của chủ đề */}
                    <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                        <span className="text-sm font-bold text-slate-800">Ngân hàng câu hỏi hiện có</span>
                        {topicStats && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#008BC5]/10 text-[#008BC5]">
                            {topicStats.commonCount} câu chung
                          </span>
                        )}
                      </div>

                      {statsLoading ? (
                        <div className="py-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-[#008BC5] border-t-transparent rounded-full animate-spin"></span>
                          Đang kiểm tra số lượng câu hỏi...
                        </div>
                      ) : topicStats ? (
                        <>
                          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                            {topicStats.departments.map((d) => {
                              const isInsufficient = !allowCompensation && perDept > 0 && d.count < perDept;
                              return (
                                <div
                                  key={d.departmentId}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                                    isInsufficient ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  <span className="truncate pr-2" title={d.name}>{d.name}</span>
                                  <span className="font-bold shrink-0">{d.count} câu</span>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-slate-500 italic">
                            * Chỉ tính các câu hỏi thuộc ngân hàng Thi chính thức (không tính câu Ôn tập).
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center italic">
                          Vui lòng chọn chủ đề để xem số liệu câu hỏi khả dụng.
                        </p>
                      )}
                    </div>

                    {/* Cảnh báo lỗi cấu hình nếu có */}
                    {formData.topicId && topicStats && (
                      <div className="space-y-2">
                        {commonExceedsPool && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#C53030] flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Số câu chung ({common}) vượt quá số câu chung hiện có ({commonCount}).</span>
                          </div>
                        )}
                        {scopeInsufficientDepartments.length > 0 && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#C53030] space-y-1.5">
                            <div className="font-bold flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              Không thể lưu do thiếu câu riêng (đang tắt bù):
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5">
                              {scopeInsufficientDepartments.map((d) => (
                                <li key={`scope-${d.departmentId}`}>
                                  {d.name}: có {d.count}/{perDept} câu riêng
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {compensationShortDepartments.length > 0 && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#C53030] space-y-1.5">
                            <div className="font-bold flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              Không thể lưu do không đủ câu chung để bù:
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5">
                              {compensationShortDepartments.map((d) => (
                                <li key={`comp-${d.departmentId}`}>
                                  {d.name}: có {d.count}/{perDept} câu riêng, cần bù {d.shortfall} câu chung
                                  {' '}(tổng cần {d.neededCommon} câu chung, ngân hàng chỉ có {commonCount})
                                </li>
                              ))}
                            </ul>
                            <p className="text-[11px]">
                              Vui lòng bổ sung thêm câu hỏi chung cho chủ đề này hoặc giảm số câu của đề.
                            </p>
                          </div>
                        )}
                        {compensatableDepartments.length > 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                              Lưu ý về phòng ban thiếu câu riêng:
                            </div>
                            {compensatableDepartments.map((d) => (
                              <p key={d.departmentId} className="text-[11px]">
                                • {d.name}: có {d.count}/{perDept} câu riêng
                                {allowCompensation ? ` (sẽ tự bù ${d.shortfall} câu chung)` : ' (bị khóa khỏi kỳ thi)'}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cấu hình phạm vi phòng ban */}
                    <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-3">
                      <div>
                        <label className="block text-sm font-bold text-slate-800 mb-1">
                          Phạm vi phòng ban được phép thi
                        </label>
                        <p className="text-xs text-slate-500 mb-2.5">
                          Giới hạn phòng ban/phân xưởng được tham gia thi đề này.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, departmentScope: 'all', allowedDepartmentIds: [] })}
                            className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all text-center ${
                              formData.departmentScope !== 'selected'
                                ? 'bg-[#008BC5] text-white border-[#008BC5] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Tất cả phòng ban
                          </button>
                          <button
                            type="button"
                            onClick={switchToSelectedScope}
                            className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all text-center ${
                              formData.departmentScope === 'selected'
                                ? 'bg-[#008BC5] text-white border-[#008BC5] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Chọn phòng ban cụ thể
                          </button>
                        </div>
                      </div>

                      {formData.departmentScope === 'selected' && (
                        <div className="space-y-2.5 pt-3 border-t border-slate-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">
                              Đã chọn: {allowedDeptIdSet.size}/{(topicStats?.departments ?? []).length} phòng
                            </span>
                            <div className="flex gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  const allIds = (topicStats?.departments ?? []).map((d) => String(d.departmentId));
                                  setFormData({ ...formData, allowedDepartmentIds: allIds });
                                }}
                                className="text-[#008BC5] font-semibold hover:underline"
                              >
                                Chọn tất cả
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, allowedDepartmentIds: [] })}
                                className="text-slate-500 font-semibold hover:underline"
                              >
                                Bỏ chọn hết
                              </button>
                            </div>
                          </div>

                          {topicStats?.departments && topicStats.departments.length > 0 ? (
                            <div className="max-h-52 overflow-y-auto space-y-1.5 p-2 bg-white rounded-lg border border-slate-200">
                              {topicStats.departments.map((dept) => {
                                const isChecked = allowedDeptIdSet.has(String(dept.departmentId));
                                const hasNoEmp = (dept.employeeCount ?? 0) === 0;
                                return (
                                  <label
                                    key={dept.departmentId}
                                    className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs transition-colors ${
                                      isChecked ? 'bg-sky-50/70 border border-sky-200' : 'border border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-[#008BC5] rounded cursor-pointer"
                                        checked={isChecked}
                                        onChange={() => toggleAllowedDepartment(dept.departmentId)}
                                      />
                                      <span className={`font-semibold truncate ${isChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                                        {dept.name}
                                      </span>
                                      {hasNoEmp && (
                                        <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-medium shrink-0">
                                          0 nhân viên
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-slate-400 font-mono text-[11px] shrink-0 ml-1">
                                      {dept.count} câu
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2 text-center">
                              Vui lòng chọn chủ đề để hiển thị danh sách phòng ban.
                            </p>
                          )}

                          {allowedDeptIdSet.size === 0 && (
                            <p className="text-xs text-[#C53030] flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Cần chọn ít nhất một phòng ban trong phạm vi được thi.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-3 min-h-[48px] bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-base transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="createExamForm"
                disabled={hasBlockingError}
                className="px-8 py-3 min-h-[48px] bg-[#008BC5] hover:bg-sky-600 text-white rounded-xl font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {editingExamId ? 'Lưu thay đổi' : 'Lưu đề xuất'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};