import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { fetchAuditLogs } from '../../services/admin.service';

// Nhãn tiếng Việt cho từng action — dựa trên các action thực tế đã thấy trong
// audit.controller.js/service.js (user.controller.js) và danh sách do quản trị
// dự án cung cấp (exam.controller.js/exam-attempt.controller.js). Nếu hệ thống
// phát sinh thêm action mới chưa có trong danh sách, sẽ tự hiển thị nguyên mã
// action (xem hàm getActionLabel bên dưới) để không bao giờ "mất" log.
const ACTION_LABELS = {
  // Tài khoản
  CREATE_USER: 'Tạo tài khoản',
  UPDATE_ROLE: 'Cập nhật phân quyền',
  LOCK_USER: 'Khóa tài khoản',
  UNLOCK_USER: 'Mở khóa tài khoản',
  RESET_PASSWORD: 'Đặt lại mật khẩu',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  UPDATE_USER_PROFILE: 'Cập nhật thông tin cá nhân',
  EXPORT_CANDIDATE_CREDENTIALS: 'Xuất danh sách tài khoản nhân viên',
  // Đề thi
  CREATE_EXAM: 'Tạo đề thi',
  UPDATE_EXAM: 'Chỉnh sửa đề xuất kỳ thi',
  DELETE_EXAM: 'Xóa đề xuất kỳ thi',
  SUBMIT_EXAM: 'Gửi đề thi để phê duyệt',
  APPROVE_EXAM: 'Duyệt đề thi',
  REJECT_EXAM: 'Từ chối đề thi',
  PUBLISH_EXAM: 'Phát hành đề thi',
  ARCHIVE_EXAM: 'Lưu trữ đề thi',
  // Lượt làm bài của thí sinh
  START_EXAM_ATTEMPT: 'Bắt đầu làm bài',
  SUBMIT_EXAM_ATTEMPT: 'Nộp bài thi',
  AUTO_SUBMIT_EXAM_ATTEMPT: 'Tự động nộp bài (hết giờ)',
  RESUME_EXAM_ATTEMPT: 'Tiếp tục làm bài',
  GRANT_EXTRA_EXAM_ATTEMPT: 'Cấp thêm lượt thi',
  // Sao lưu & phục hồi (backup.controller.js)
  BACKUP_MANUAL_CREATE: 'Tạo bản sao lưu thủ công',
  BACKUP_DOWNLOAD: 'Tải bản sao lưu',
  BACKUP_RESTORE: 'Khôi phục dữ liệu từ bản sao lưu',
  // Câu hỏi (question.controller.js)
  CREATE_QUESTION: 'Tạo câu hỏi',
  UPDATE_QUESTION: 'Cập nhật câu hỏi',
  DELETE_QUESTION: 'Ngừng sử dụng câu hỏi',
  BULK_DELETE_QUESTIONS: 'Xóa hàng loạt câu hỏi',
  // MỚI — chuyển hàng loạt câu hỏi giữa Thi chính thức <-> Ôn tập theo bộ lọc
  // (bulkMoveQuestionsUsage trong examiner.service.js, route /questions/bulk-move-usage).
  BULK_MOVE_QUESTIONS: 'Chuyển hàng loạt câu hỏi',
  // Lần thử chuyển sang Ôn tập BỊ CHẶN vì chủ đề đang có kỳ thi published (ghi ở question.controller.js)
  BULK_MOVE_QUESTIONS_BLOCKED: 'Bị chặn chuyển hàng loạt câu hỏi',
  IMPORT_QUESTIONS: 'Import câu hỏi từ Excel',
  // Ghi chú: các action dạng "chấm" dưới đây được ghi ở tầng service
  // (question.service.js) — SONG SONG với action IN HOA tương ứng ghi ở tầng
  // controller (question.controller.js) cho CÙNG 1 thao tác. Đã xác nhận
  // trực tiếp từ mã nguồn question.service.js (không còn là suy đoán).
  'question.import': 'Import câu hỏi từ Excel',
  'question.deactivate': 'Ngừng sử dụng câu hỏi',
  'question.bulk_deactivate': 'Ngừng sử dụng hàng loạt câu hỏi',
  'question.update': 'Cập nhật câu hỏi',
  // Chủ đề (topic.controller.js)
  CREATE_TOPIC: 'Tạo chủ đề',
  RESTORE_TOPIC: 'Khôi phục chủ đề',
  UPDATE_TOPIC: 'Cập nhật chủ đề',
  DEACTIVATE_TOPIC: 'Ngừng sử dụng chủ đề',
  // MỚI — trường hợp NGỪNG SỬ DỤNG chủ đề bị CHẶN vì đang có kỳ thi published
  // dùng chủ đề đó (xem deactivateTopic() trong topic.service.js, ném
  // ApiError('TOPIC_HAS_ACTIVE_EXAM')) — khác với DEACTIVATE_TOPIC ở trên
  // (ghi khi thao tác THÀNH CÔNG), action này ghi lại lần thử BỊ TỪ CHỐI.
  DEACTIVATE_TOPIC_BLOCKED: 'Bị chặn ngừng sử dụng chủ đề',
  // Tài liệu ôn tập
  UPLOAD_STUDY_DOCUMENT: 'Đăng tài liệu ôn tập',
  DEACTIVATE_STUDY_DOCUMENT: 'Gỡ tài liệu ôn tập',
  // Phòng ban (department.controller.js) — trước đây thiếu trong bảng này
  // nên bị hiển thị thô nguyên mã action (vd "CREATE_DEPARTMENT") thay vì
  // nhãn tiếng Việt.
  CREATE_DEPARTMENT: 'Tạo phòng ban',
  UPDATE_DEPARTMENT: 'Cập nhật phòng ban',
  DEACTIVATE_DEPARTMENT: 'Ngừng sử dụng phòng ban',
  // Lần thử ngừng sử dụng phòng ban BỊ CHẶN vì đang có thí sinh làm bài / kỳ thi đang diễn ra (ghi ở department.controller.js)
  DEACTIVATE_DEPARTMENT_BLOCKED: 'Bị chặn ngừng sử dụng phòng ban',
  // MỚI — Tác vụ hệ thống tự động (không do người dùng bấm), thực hiện bởi
  // actor "Hệ thống" (xem cột "Người thực hiện" trong bảng) — dọn các file
  // đã upload tạm (vd ảnh câu hỏi) nhưng không được gắn vào bản ghi nào
  // trong 1 khoảng thời gian, tránh rác tồn đọng trên storage.
  UPLOAD_TMP_CLEANUP: 'Dọn dẹp file tạm chưa sử dụng',
  // Trợ lý AI (ai-assistant.controller.js)
  AI_GENERATE_QUESTIONS: 'AI soạn câu hỏi',
  UPDATE_AI_SETTINGS: 'Cập nhật cấu hình Trợ lý AI',
  // Sao lưu tự động (backup.scheduler.js)
  BACKUP_AUTO_CREATE: 'Tự động tạo bản sao lưu',
  BACKUP_AUTO_FAILED: 'Sao lưu tự động thất bại',
  // Tài khoản / nhân viên
  ACCOUNT_PURGE_AUTO: 'Tự động xóa tài khoản đã khóa quá hạn',
  UPDATE_EMPLOYEE_DEPARTMENTS: 'Cập nhật phòng ban của nhân viên',
};

// Các action mang tính cảnh báo/nhạy cảm — hiển thị nhấn mạnh bằng màu vàng-cam
// (#F6AD37) theo design-system.md thay vì màu xám trung tính mặc định.
// Có thể điều chỉnh danh sách này nếu cần nhấn mạnh thêm/bớt hành động khác.
const EMPHASIZED_ACTIONS = new Set([
  'LOCK_USER',
  'RESET_PASSWORD',
  'REJECT_EXAM',
  'DELETE_EXAM',
  'ARCHIVE_EXAM',
  'AUTO_SUBMIT_EXAM_ATTEMPT',
  'BACKUP_RESTORE',
  'BACKUP_AUTO_FAILED',
  'DELETE_QUESTION',
  'BULK_DELETE_QUESTIONS',
  'BULK_MOVE_QUESTIONS_BLOCKED',
  'question.deactivate',
  'question.bulk_deactivate',
  'DEACTIVATE_TOPIC',
  'DEACTIVATE_TOPIC_BLOCKED',
  'DEACTIVATE_STUDY_DOCUMENT',
  'DEACTIVATE_DEPARTMENT',
  'DEACTIVATE_DEPARTMENT_BLOCKED',
]);

const RESOURCE_TYPE_OPTIONS = [
  { value: 'User', label: 'Tài khoản' },
  { value: 'Exam', label: 'Đề thi' },
  { value: 'Question', label: 'Câu hỏi' },
  { value: 'Topic', label: 'Chủ đề' },
  { value: 'Department', label: 'Phòng ban' },
  { value: 'Backup', label: 'Sao lưu & phục hồi' },
  { value: 'AiSetting', label: 'Trợ lý AI' },
];

function getActionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function ActionBadge({ action }) {
  const emphasized = EMPHASIZED_ACTIONS.has(action);
  return (
    <span
      className="inline-block px-2 py-1 rounded text-sm font-semibold whitespace-nowrap"
      style={
        emphasized
          ? { backgroundColor: '#FFF7E6', color: '#92600E', border: '1px solid #F6AD37' }
          : { backgroundColor: '#F6F8FA', color: '#334155', border: '1px solid #E2E8F0' }
      }
    >
      {getActionLabel(action)}
    </span>
  );
}

// Dropdown tự vẽ — thay cho thẻ <select> gốc của trình duyệt, vì <select> gốc
// khi mở ra dùng màu highlight mặc định của hệ điều hành/trình duyệt (thường là
// xanh dương khác tông), không đồng bộ được với màu #008BC5 của design system.
// Component này tự kiểm soát toàn bộ màu/bo góc/trạng thái chọn.
function FilterSelect({ label, value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
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

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-[#334155] mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-12 pl-3 pr-10 rounded-[10px] border text-base text-left bg-white relative focus:outline-none"
        style={{
          borderColor: open ? '#008BC5' : '#E2E8F0',
          boxShadow: open ? '0 0 0 2px rgba(6,147,227,0.25)' : 'none',
          color: value ? '#0F172A' : '#64748B',
        }}
      >
        {displayLabel}
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B] pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white rounded-[10px] border border-[#E2E8F0] py-1 shadow-lg" data-lenis-prevent>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3.5 py-2.5 min-h-[44px] flex items-center text-sm sm:text-base transition-colors hover:bg-slate-50"
            style={
              !value
                ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 }
                : { color: '#0F172A' }
            }
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3.5 py-2.5 min-h-[44px] flex items-center text-sm sm:text-base transition-colors hover:bg-slate-50"
              style={
                value === opt.value
                  ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 }
                  : { color: '#0F172A' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_LIMIT = 20;

// MỚI — Gộp phần HIỂN THỊ các log liên tiếp cùng người + cùng hành động, cách nhau tối đa 10 phút (logs đã sắp mới -> cũ).
// Dữ liệu log giữ nguyên từng dòng (kiểm toán không mất gì), chỉ thu gọn thành 1 dòng có số đếm, bấm để xổ ra.
// Hành động nhạy cảm (EMPHASIZED_ACTIONS) không bao giờ bị gộp để không bị che.
const GROUP_GAP_MS = 10 * 60 * 1000;
const actorKeyOf = (log) => log.actorUserId?._id ?? log.actorUserId ?? 'system';
function groupLogs(logs) {
  const groups = [];
  for (const log of logs) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    const canJoin =
      prev &&
      !EMPHASIZED_ACTIONS.has(log.action) &&
      prev.action === log.action &&
      String(actorKeyOf(prev)) === String(actorKeyOf(log)) &&
      Math.abs(new Date(prev.createdAt) - new Date(log.createdAt)) <= GROUP_GAP_MS;
    if (canJoin) g.push(log);
    else groups.push([log]);
  }
  return groups;
}
const EMPTY_FILTERS = { q: '', action: '', resourceType: '', from: '', to: '' };

export const AuditLogTab = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // MỚI — id của log đầu nhóm (mới nhất) cho các nhóm đang xổ ra. Tải thêm chỉ nối vào cuối nên id đầu nhóm không đổi.
  const [expanded, setExpanded] = useState(() => new Set());
  const debounceRef = useRef(null);
  const groups = useMemo(() => groupLogs(logs), [logs]);
  const toggleGroup = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const loadLogs = useCallback((appliedFilters, page, append) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    fetchAuditLogs({ ...appliedFilters, page, limit: DEFAULT_LIMIT })
      .then((res) => {
        const items = Array.isArray(res?.data) ? res.data : [];
        setLogs((prev) => (append ? [...prev, ...items] : items));
        setPagination(res?.pagination || { page, totalPages: 1, total: items.length });
      })
      .catch((err) => console.error(err))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  // Tải lại danh sách mỗi khi bộ lọc thay đổi (reset về trang 1)
  useEffect(() => {
    loadLogs(filters, 1, false);
  }, [filters, loadLogs]);

  // Debounce ô tìm kiếm 500ms trước khi áp vào filters (tránh gọi API liên tục khi đang gõ)
  const handleSearchChange = (value) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: value.trim() }));
    }, 500);
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
  };

  const handleLoadMore = () => {
    loadLogs(filters, pagination.page + 1, true);
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const getActorDisplayName = (log) => {
    const actor = log.actorUserId;
    if (!actor) return 'Hệ thống';
    return actor.fullname || actor.username || 'Không rõ';
  };

  const getActorSubInfo = (log) => {
    const actor = log.actorUserId;
    if (!actor) return null;
    const parts = [actor.employeeCode, actor.departmentName].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  };

  // Bỏ mã lỗi kỹ thuật dạng "(TOPIC_HAS_ACTIVE_EXAM)" khỏi câu hiển thị cho người dùng
  const getDetailText = (log) =>
    String(log.metadata?.detail || log.metadata?.questionId || '-').replace(/\s*\([A-Z_]+\)(?=:)/, '');

  return (
    <div className="space-y-4">
      {/* Thanh tìm kiếm + nút mở bộ lọc — MỚI: animate-fade-in-up khi tab vừa tải xong */}
      <div className="relative z-30 animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo tên, mã nhân viên, phòng ban..."
              className="w-full h-12 pl-10 pr-4 rounded-[10px] border border-[#E2E8F0] text-base text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="relative flex items-center justify-center gap-2 h-12 min-w-[48px] px-4 rounded-[10px] border border-[#E2E8F0] bg-white text-[#0F172A] font-semibold text-base"
          >
            <SlidersHorizontal className="w-5 h-5 text-[#008BC5]" />
            <span className="hidden sm:inline">Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-[#008BC5] text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-4">
            <FilterSelect
              label="Hành động"
              value={filters.action}
              placeholder="Tất cả hành động"
              options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(v) => handleFilterChange('action', v)}
            />

            <FilterSelect
              label="Loại đối tượng"
              value={filters.resourceType}
              placeholder="Tất cả loại"
              options={RESOURCE_TYPE_OPTIONS}
              onChange={(v) => handleFilterChange('resourceType', v)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#334155] mb-1">Từ ngày</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => handleFilterChange('from', e.target.value)}
                  className="w-full h-12 px-3 rounded-[10px] border border-[#E2E8F0] text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0693E3]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#334155] mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => handleFilterChange('to', e.target.value)}
                  className="w-full h-12 px-3 rounded-[10px] border border-[#E2E8F0] text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0693E3]"
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center justify-center gap-2 w-full h-12 rounded-[10px] border border-[#E2E8F0] text-[#334155] font-semibold text-base"
              >
                <X className="w-5 h-5" />
                Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white p-4 rounded-xl border border-[#E2E8F0] animate-pulse flex flex-col gap-2">
              <div className="h-4 w-1/4 bg-[#E2E8F0] rounded"></div>
              <div className="h-4 w-1/2 bg-[#E2E8F0] rounded"></div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="flex flex-col items-center justify-center text-[#64748B]">
            <Activity className="w-12 h-12 mb-3 text-[#64748B]" />
            <p className="text-base font-medium text-[#334155]">
              {activeFilterCount > 0 ? 'Không tìm thấy nhật ký phù hợp' : 'Chưa có nhật ký nào'}
            </p>
            <p className="text-base mt-1">
              {activeFilterCount > 0
                ? 'Thử đổi lại từ khóa hoặc bộ lọc đang chọn.'
                : 'Hệ thống chưa ghi nhận hoạt động nào.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table (Hidden on Mobile) — MỚI: animate cả khối 1 lần
              (không so le từng dòng) vì danh sách có thể dài + còn nút "Xem
              thêm" load thêm log, so le từng dòng sẽ không nhất quán giữa
              lần tải đầu và lần bấm tải thêm. */}
          <div className="animate-fade-in-up hidden sm:block overflow-x-auto bg-white rounded-xl border border-[#E2E8F0]" style={{ '--stagger-delay': '80ms' }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F6F8FA] border-b border-[#E2E8F0] text-base text-[#334155]">
                  <th className="p-4 font-semibold w-48">Thời gian</th>
                  <th className="p-4 font-semibold w-56">Người dùng</th>
                  <th className="p-4 font-semibold w-56">Hành động</th>
                  <th className="p-4 font-semibold">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {groups.map(group => {
                  const head = group[0];
                  if (group.length === 1) {
                    return (
                      <tr key={head._id} className="hover:bg-[#F6F8FA]">
                        <td className="p-4 text-sm text-[#64748B] whitespace-nowrap align-top">{formatDate(head.createdAt)}</td>
                        <td className="p-4 align-top">
                          <div className="font-medium text-[#0F172A] text-base">{getActorDisplayName(head)}</div>
                          {getActorSubInfo(head) && (
                            <div className="text-sm text-[#64748B] mt-0.5">{getActorSubInfo(head)}</div>
                          )}
                        </td>
                        <td className="p-4 align-top"><ActionBadge action={head.action} /></td>
                        <td className="p-4 text-base text-[#334155] align-top">{getDetailText(head)}</td>
                      </tr>
                    );
                  }
                  const open = expanded.has(head._id);
                  return (
                    <Fragment key={head._id}>
                      <tr className="hover:bg-[#F6F8FA] cursor-pointer" onClick={() => toggleGroup(head._id)}>
                        <td className="p-4 text-sm text-[#64748B] whitespace-nowrap align-top">{formatDate(head.createdAt)}</td>
                        <td className="p-4 align-top">
                          <div className="font-medium text-[#0F172A] text-base">{getActorDisplayName(head)}</div>
                          {getActorSubInfo(head) && (
                            <div className="text-sm text-[#64748B] mt-0.5">{getActorSubInfo(head)}</div>
                          )}
                        </td>
                        <td className="p-4 align-top">
                          <button type="button" aria-expanded={open} className="inline-flex items-center gap-2 text-left">
                            <ActionBadge action={head.action} />
                            <span className="min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-[#008BC5] text-white text-xs font-bold">{group.length}</span>
                            <ChevronDown className="w-5 h-5 text-[#64748B] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                          </button>
                        </td>
                        <td className="p-4 text-base text-[#334155] align-top">
                          {group.length} thao tác liên tiếp (từ {formatDate(group[group.length - 1].createdAt)}). {open ? 'Bấm để thu gọn.' : 'Bấm để xem từng dòng.'}
                        </td>
                      </tr>
                      {open && group.map(log => (
                        <tr key={log._id} className="bg-[#F6F8FA]">
                          <td className="p-4 pl-8 text-sm text-[#64748B] whitespace-nowrap align-top border-l-4 border-[#008BC5]/40">{formatDate(log.createdAt)}</td>
                          <td className="p-4" colSpan={2}></td>
                          <td className="p-4 text-base text-[#334155] align-top">{getDetailText(log)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile List (Hidden on Desktop) */}
          <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '80ms' }}>
            {groups.map(group => {
              const head = group[0];
              const isGroup = group.length > 1;
              const open = isGroup && expanded.has(head._id);
              return (
                <div key={head._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-2">
                  <div
                    className={`space-y-2 ${isGroup ? 'cursor-pointer' : ''}`}
                    onClick={isGroup ? () => toggleGroup(head._id) : undefined}
                    role={isGroup ? 'button' : undefined}
                    aria-expanded={isGroup ? open : undefined}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-bold text-[#0F172A] text-base">{getActorDisplayName(head)}</div>
                        {getActorSubInfo(head) && (
                          <div className="text-sm text-[#64748B]">{getActorSubInfo(head)}</div>
                        )}
                      </div>
                      <span className="text-sm text-[#64748B] whitespace-nowrap">{formatDate(head.createdAt)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <ActionBadge action={head.action} />
                        {isGroup && (
                          <>
                            <span className="min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-[#008BC5] text-white text-xs font-bold">{group.length}</span>
                            <ChevronDown className="w-5 h-5 text-[#64748B] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                          </>
                        )}
                      </div>
                      <p className="text-base text-[#334155] mt-2">
                        {isGroup ? `${group.length} thao tác liên tiếp. ${open ? 'Bấm để thu gọn.' : 'Bấm để xem từng dòng.'}` : getDetailText(head)}
                      </p>
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                      {group.map(log => (
                        <div key={log._id} className="bg-[#F6F8FA] rounded-lg p-3 border-l-4 border-[#008BC5]/40">
                          <div className="text-sm text-[#64748B]">{formatDate(log.createdAt)}</div>
                          <p className="text-base text-[#334155] mt-1 break-words">{getDetailText(log)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pagination.page < pagination.totalPages && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full h-12 rounded-[10px] border border-[#008BC5] text-[#008BC5] font-semibold text-base disabled:opacity-40"
            >
              {loadingMore ? 'Đang tải...' : `Xem thêm (đã tải ${logs.length}/${pagination.total})`}
            </button>
          )}
        </>
      )}
    </div>
  );
};