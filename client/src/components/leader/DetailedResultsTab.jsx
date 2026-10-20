import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Search, Filter, ChevronLeft, ChevronRight, RotateCcw, Lock, CheckCircle2, Circle, X } from 'lucide-react';
import { fetchDetailedResults, exportReport } from '../../services/report.service';
import { grantExtraAttempt, fetchCandidateRoleOptions } from '../../services/exam-review.service';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Select } from '../Select';

export const DetailedResultsTab = () => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grantingId, setGrantingId] = useState(null);
  // Khóa ngay từ lúc bấm (kể cả lúc đang tải vai trò / đang mở hộp xác nhận) để bấm đúp không cấp 2 lần.
  const grantBusyRef = useRef(false);
  // MỚI — Hộp thoại chọn vai trò (phòng ban) khi cấp thêm lượt cho thí sinh kiêm nhiệm:
  // { item, options, currentDepartmentId, hasInProgress, selectedId } hoặc null khi đóng.
  const [grantDialog, setGrantDialog] = useState(null);
  useScrollLock(Boolean(grantDialog));

  const [filters, setFilters] = useState({
    search: '',
    passed: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (page = 1) => {
    try {
      setLoading(true);
      const res = await fetchDetailedResults({ ...filters, page, limit: pagination.limit });
      if (res.success) {
        const responseData = res.data?.data || res.data || [];
        setData(Array.isArray(responseData) ? responseData : []);
        setPagination(res.data?.pagination || res.pagination || { page: 1, limit: 10, totalPages: 1, total: 0 });
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tải kết quả chi tiết');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilters = (e) => {
    e.preventDefault();
    loadData(1);
  };

  const handleExport = async () => {
    try {
      await exportReport(filters);
    } catch (err) {
      showToast(err.message || 'Lỗi khi xuất file Excel', 'error');
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      loadData(newPage);
    }
  };

  // Gọi API cấp lượt (kèm departmentId nếu Người duyệt đề đổi vai trò) rồi báo kết quả
  const performGrant = async (item, departmentId) => {
    setGrantingId(item._id);
    try {
      const result = await grantExtraAttempt(item.examCandidateId, departmentId);
      showToast(
        result?.roleChanged
          ? `Đã cấp thêm lượt thi cho ${item.employeeName} và đổi vai trò sang "${result.roleName}".`
          : `Đã cấp thêm lượt thi cho ${item.employeeName}.`,
        'success',
      );
      return true;
    } catch (err) {
      showToast(err.message || 'Lỗi khi cấp lại lượt thi', 'error');
      return false;
    } finally {
      setGrantingId(null);
    }
  };

  // MỚI — Cấp thêm 1 lượt thi chính thức cho thí sinh đã thi (mở lại lượt thi
  // để họ thi lại). Không xóa/reset kết quả cũ, chỉ cấp thêm quyền làm 1 lượt
  // mới; thí sinh tự đăng nhập và bấm "Bắt đầu thi" như bình thường.
  // Thí sinh có phòng kiêm nhiệm (>= 2 vai trò): mở hộp thoại để Người duyệt đề chọn lại vai trò nếu cần
  // (phòng chưa đủ câu riêng bị mờ khi kỳ thi tắt bù). Thí sinh chỉ có 1 vai trò: xác nhận như cũ.
  const handleGrantExtraAttempt = async (item) => {
    if (!item.examCandidateId) {
      showToast('Thiếu thông tin thí sinh, không thể cấp lại lượt thi.', 'error');
      return;
    }
    if (grantBusyRef.current) return;
    grantBusyRef.current = true;
    try {
      await runGrantFlow(item);
    } finally {
      grantBusyRef.current = false;
    }
  };

  const runGrantFlow = async (item) => {
    let roleInfo = null;
    try {
      roleInfo = await fetchCandidateRoleOptions(item.examCandidateId);
    } catch {
      // Không tải được danh sách vai trò -> vẫn cho cấp lượt như cũ (giữ nguyên vai trò hiện tại)
      roleInfo = null;
    }

    if (roleInfo?.options?.length > 1) {
      setGrantDialog({
        item,
        options: roleInfo.options,
        currentDepartmentId: roleInfo.currentDepartmentId ? String(roleInfo.currentDepartmentId) : null,
        hasInProgress: Boolean(roleInfo.hasInProgress),
        selectedId: roleInfo.currentDepartmentId ? String(roleInfo.currentDepartmentId) : null,
      });
      return;
    }

    const ok = await confirmAction(
      `Cấp thêm 1 lượt thi chính thức cho "${item.employeeName}" (bài thi: ${item.examTitle})? Thí sinh sẽ có thể đăng nhập và làm lại bài thi này.`,
      { title: 'Cấp lại lượt thi', confirmLabel: 'Cấp lượt thi', danger: false }
    );
    if (!ok) return;
    await performGrant(item, undefined);
  };

  const handleConfirmGrantDialog = async () => {
    if (!grantDialog || grantBusyRef.current) return;
    const { item, currentDepartmentId, selectedId, hasInProgress } = grantDialog;
    // Chỉ gửi departmentId khi thật sự đổi vai trò (và không có lượt thi đang dở)
    const departmentId = !hasInProgress && selectedId && selectedId !== currentDepartmentId ? selectedId : undefined;
    grantBusyRef.current = true;
    try {
      const ok = await performGrant(item, departmentId);
      if (ok) setGrantDialog(null);
    } finally {
      grantBusyRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AuditLogTab.jsx bên Admin. */}
      <div className="animate-fade-in-up flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" style={{ '--stagger-delay': '0ms' }}>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Kết quả chi tiết</h2>
          <p className="text-base text-[#334155]">Danh sách các bài thi đã nộp</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-[#008BC5] hover:bg-[#0693E3] text-white font-semibold text-base rounded-[10px] transition-colors min-touch-target"
        >
          <FileText className="w-5 h-5" />
          <span>Xuất Excel theo bộ lọc</span>
        </button>
      </div>

      {/* Bộ lọc — xếp cột đơn trên mobile, đủ chiều cao 48px cho mỗi ô theo design system */}
      {/* relative z-20: nâng thẻ bộ lọc lên trên thẻ bảng phía sau (animate-fade-in-up tạo stacking context riêng) để dropdown không bị đè */}
      <div className="animate-fade-in-up relative z-20 bg-white rounded-xl border border-[#E2E8F0] p-4" style={{ '--stagger-delay': '80ms' }}>
        <form onSubmit={applyFilters} className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Tìm theo họ tên thí sinh..."
              className="w-full h-12 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-[10px] text-base text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
            />
          </div>
          <div className="w-full md:w-48">
            <Select
              name="passed"
              value={filters.passed}
              onChange={handleFilterChange}
              className="w-full h-12 px-4 bg-white border border-[#E2E8F0] rounded-[10px] text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
            >
              <option value="">Tất cả kết quả</option>
              <option value="true">Đạt</option>
              <option value="false">Không đạt</option>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="h-12 px-3 bg-white border border-[#E2E8F0] rounded-[10px] text-base text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
            />
            <span className="hidden sm:inline text-[#64748B]">-</span>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="h-12 px-3 bg-white border border-[#E2E8F0] rounded-[10px] text-base text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#0693E3] focus:border-[#008BC5]"
            />
          </div>
          <button
            type="submit"
            className="h-12 px-6 bg-[#334155] hover:bg-[#1e293b] text-white font-semibold text-base rounded-[10px] transition-colors flex items-center justify-center gap-2 min-touch-target"
          >
            <Filter className="w-5 h-5" />
            Lọc
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#008BC5] rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030] text-base">
          <p>Lỗi: {error}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="flex flex-col items-center justify-center text-[#64748B]">
            <FileText className="w-12 h-12 mb-3" />
            <p className="text-base font-medium text-[#334155]">Chưa có kết quả thi nào</p>
            <p className="text-base mt-1">Hệ thống chưa ghi nhận bài làm nào phù hợp với bộ lọc hiện tại.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="animate-fade-in-up hidden sm:block bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" style={{ '--stagger-delay': '140ms' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F6F8FA] text-[#334155] text-base border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Họ và tên</th>
                    <th className="px-6 py-4 font-semibold">Phòng ban</th>
                    <th className="px-6 py-4 font-semibold">Bài thi</th>
                    <th className="px-6 py-4 font-semibold text-center">Điểm</th>
                    <th className="px-6 py-4 font-semibold text-center">Kết quả</th>
                    <th className="px-6 py-4 font-semibold">Ngày nộp</th>
                    <th className="px-6 py-4 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {data.map((item) => (
                    <tr key={item._id} className="hover:bg-[#F6F8FA] transition-colors">
                      <td className="px-6 py-4 font-medium text-[#0F172A] text-base">{item.employeeName}</td>
                      <td className="px-6 py-4 text-[#334155] text-base">{item.departmentName}</td>
                      <td className="px-6 py-4 text-[#334155] text-base">{item.examTitle}</td>
                      <td className="px-6 py-4 text-center font-bold text-[#F6AD37] text-base">{item.score}</td>
                      <td className="px-6 py-4 text-center">
                        {item.passed ? (
                          <span className="px-3 py-1 bg-[#F0FDF4] text-[#166534] rounded-lg text-sm font-semibold">ĐẠT</span>
                        ) : (
                          <span className="px-3 py-1 bg-[#FEECEC] text-[#C53030] rounded-lg text-sm font-semibold">KHÔNG ĐẠT</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-[#334155] text-base">
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleGrantExtraAttempt(item)}
                          disabled={grantingId === item._id}
                          title="Mở lại lượt thi cho thí sinh này"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#EAF6FF] hover:bg-[#008BC5]/20 text-[#008BC5] font-semibold rounded-lg transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                        >
                          <RotateCcw className="w-4 h-4" />
                          {grantingId === item._id ? 'Đang cấp...' : 'Cấp lại lượt thi'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '140ms' }}>
            {data.map((item) => (
              <div key={item._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#0F172A] text-base">{item.employeeName}</div>
                    <div className="text-base text-[#64748B]">{item.departmentName}</div>
                  </div>
                  {item.passed ? (
                    <span className="px-3 py-1 bg-[#F0FDF4] text-[#166534] rounded-lg text-sm font-semibold shrink-0">ĐẠT</span>
                  ) : (
                    <span className="px-3 py-1 bg-[#FEECEC] text-[#C53030] rounded-lg text-sm font-semibold shrink-0">KHÔNG ĐẠT</span>
                  )}
                </div>

                <div className="text-base text-[#334155]">
                  Bài thi: <span className="font-medium text-[#0F172A]">{item.examTitle}</span>
                </div>

                <div className="flex items-center justify-between text-base">
                  <div>
                    <span className="text-[#64748B]">Điểm: </span>
                    <span className="font-bold text-[#F6AD37]">{item.score}</span>
                  </div>
                  <div className="text-[#64748B] text-sm">
                    {item.submittedAt ? new Date(item.submittedAt).toLocaleString('vi-VN') : '-'}
                  </div>
                </div>

                <button
                  onClick={() => handleGrantExtraAttempt(item)}
                  disabled={grantingId === item._id}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-[#EAF6FF] hover:bg-[#008BC5]/20 text-[#008BC5] font-semibold text-base rounded-[10px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                >
                  <RotateCcw className="w-4 h-4" />
                  {grantingId === item._id ? 'Đang cấp...' : 'Cấp lại lượt thi'}
                </button>
              </div>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-sm text-[#334155]">
                Trang {pagination.page}/{pagination.totalPages} (Tổng {pagination.total})
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="w-11 h-11 flex items-center justify-center bg-white border border-[#E2E8F0] text-[#334155] rounded-lg hover:bg-[#F6F8FA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-touch-target"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="w-11 h-11 flex items-center justify-center bg-white border border-[#E2E8F0] text-[#334155] rounded-lg hover:bg-[#F6F8FA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-touch-target"
                  aria-label="Trang sau"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* MỚI — Hộp thoại cấp lại lượt thi + chọn vai trò (phòng ban) cho thí sinh kiêm nhiệm */}
      {grantDialog && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">Cấp lại lượt thi</h3>
                <p className="text-sm text-[#334155]">
                  {grantDialog.item.employeeName} — {grantDialog.item.examTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrantDialog(null)}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F6F8FA] min-touch-target"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              <p className="text-sm font-semibold text-[#0F172A]">Vai trò (phòng ban) thi của thí sinh</p>
              {grantDialog.hasInProgress && (
                <p className="text-sm text-[#B45309] bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg px-3 py-2">
                  Thí sinh đang có lượt thi dở dang nên chưa thể đổi vai trò lúc này.
                </p>
              )}
              <div className="space-y-2" role="radiogroup" aria-label="Chọn phòng ban thi">
                {grantDialog.options.map((o) => {
                  const id = String(o.departmentId);
                  const active = id === grantDialog.selectedId;
                  const ineligible = o.eligible === false;
                  const disabled = ineligible || grantDialog.hasInProgress;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => setGrantDialog((prev) => ({ ...prev, selectedId: id }))}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-colors min-touch-target ${
                        disabled
                          ? `bg-slate-100 border-transparent cursor-not-allowed ${ineligible ? 'opacity-60' : active ? '' : 'opacity-60'}`
                          : active
                            ? 'bg-[#EAF6FF] border-[#008BC5]'
                            : 'bg-white border-[#E2E8F0] hover:border-[#008BC5]/50'
                      }`}
                    >
                      {ineligible ? (
                        <Lock className="w-5 h-5 text-slate-400 shrink-0" />
                      ) : active ? (
                        <CheckCircle2 className="w-5 h-5 text-[#008BC5] shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className={`block font-bold text-base ${ineligible ? 'text-slate-500' : 'text-[#0F172A]'}`}>
                          {o.name}
                        </span>
                        {ineligible && (
                          <span className="block text-xs text-slate-500">
                            Kỳ thi không dành cho phòng ban này (chưa đủ câu riêng: {o.deptQuestionCount ?? 0}/{o.requiredDeptQuestions ?? 0})
                          </span>
                        )}
                        {id === grantDialog.currentDepartmentId && (
                          <span className="block text-xs text-[#008BC5]">Vai trò hiện tại</span>
                        )}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          o.isMain ? 'bg-[#0F172A] text-white' : 'bg-[#008BC5]/15 text-[#008BC5]'
                        }`}
                      >
                        {o.isMain ? 'Phòng chính' : 'Kiêm nhiệm'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#64748B]">
                Chọn lại phòng ban nếu thí sinh lỡ chọn nhầm. Để nguyên vai trò hiện tại nếu chỉ cần cấp thêm lượt.
              </p>
            </div>

            <div className="p-4 border-t border-[#E2E8F0] bg-[#F6F8FA] flex flex-col-reverse sm:flex-row justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setGrantDialog(null)}
                className="px-4 py-3 min-h-[46px] bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmGrantDialog}
                disabled={grantingId === grantDialog.item._id}
                className="px-4 py-3 min-h-[46px] bg-[#008BC5] hover:bg-[#0693E3] text-white rounded-lg font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {grantingId === grantDialog.item._id ? 'Đang cấp...' : 'Cấp lượt thi'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};