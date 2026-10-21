import { useState, useEffect } from 'react';
import { FileText, Building2 } from 'lucide-react';
import { fetchResultsByDepartment, exportReport } from '../../services/report.service';
import { useToast } from '../ToastContext';

export const DepartmentReportTab = () => {
  const { showToast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Phân trang 10 dòng/trang
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchResultsByDepartment();
      if (res.success) {
        const responseData = res.data || [];
        setData(Array.isArray(responseData) ? responseData : []);
        setPage(1);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message || 'Lỗi tải dữ liệu phòng ban');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      await exportReport();
    } catch (err) {
      showToast(err.message || 'Lỗi khi tải file báo cáo', 'error');
    }
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

  return (
    <div className="space-y-6">
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AuditLogTab.jsx bên Admin. */}
      <div className="animate-fade-in-up flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" style={{ '--stagger-delay': '0ms' }}>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Thống kê theo Phòng ban</h2>
          <p className="text-base text-[#334155]">Chi tiết số lượng thí sinh, lượt thi và tỷ lệ đạt</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-[#008BC5] hover:bg-[#0693E3] text-white font-semibold text-base rounded-[10px] transition-colors min-touch-target"
        >
          <FileText className="w-5 h-5" />
          <span>Xuất Excel toàn bộ</span>
        </button>
      </div>

      {data.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="flex flex-col items-center justify-center text-[#64748B]">
            <Building2 className="w-12 h-12 mb-3" />
            <p className="text-base font-medium text-[#334155]">Chưa có thống kê phòng ban</p>
            <p className="text-base mt-1">Hiện chưa có dữ liệu kết quả thi để thống kê theo phòng ban.</p>
          </div>
        </div>
      ) : (
        <>
          {(() => {
            const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
            const safePage = Math.min(page, totalPages);
            const pagedData = data.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
            return (
              <>
          {/* Desktop Table */}
          <div className="animate-fade-in-up hidden sm:block bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" style={{ '--stagger-delay': '80ms' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F6F8FA] text-[#334155] text-base border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Phòng ban</th>
                    <th className="px-6 py-4 font-semibold text-center">Số thí sinh</th>
                    <th className="px-6 py-4 font-semibold text-center">Số lượt nộp</th>
                    <th className="px-6 py-4 font-semibold text-center text-[#22C55E]">Đạt</th>
                    <th className="px-6 py-4 font-semibold text-center text-[#E53E3E]">Không đạt</th>
                    <th className="px-6 py-4 font-semibold text-center">Tỷ lệ Đạt</th>
                    <th className="px-6 py-4 font-semibold text-center">Điểm TB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {pagedData.map((item) => (
                    <tr key={item._id} className="hover:bg-[#F6F8FA] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#64748B]" />
                          <span className="font-medium text-[#0F172A] text-base">{item.departmentName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-base text-[#334155]">{item.totalCandidates}</td>
                      <td className="px-6 py-4 text-center text-base text-[#334155]">{item.totalSubmissions}</td>
                      <td className="px-6 py-4 text-center font-semibold text-[#22C55E] text-base">{item.passedCount}</td>
                      <td className="px-6 py-4 text-center font-semibold text-[#E53E3E] text-base">{item.failedCount}</td>
                      <td className="px-6 py-4 text-center font-semibold text-[#22C55E] text-base">{item.passRate}%</td>
                      <td className="px-6 py-4 text-center text-[#F6AD37] font-semibold text-base">{item.avgScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '80ms' }}>
            {pagedData.map((item) => (
              <div key={item._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#008BC5] shrink-0" />
                  <span className="font-bold text-[#0F172A] text-base">{item.departmentName}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
                  <div>
                    <span className="text-[#64748B]">Số thí sinh:</span>{' '}
                    <span className="font-semibold text-[#0F172A]">{item.totalCandidates}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Số lượt nộp:</span>{' '}
                    <span className="font-semibold text-[#0F172A]">{item.totalSubmissions}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Đạt:</span>{' '}
                    <span className="font-semibold text-[#22C55E]">{item.passedCount}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Không đạt:</span>{' '}
                    <span className="font-semibold text-[#E53E3E]">{item.failedCount}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
                  <div>
                    <span className="text-[#64748B] text-base">Tỷ lệ Đạt: </span>
                    <span className="font-bold text-[#22C55E] text-base">{item.passRate}%</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] text-base">Điểm TB: </span>
                    <span className="font-bold text-[#F6AD37] text-base">{item.avgScore}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Phân trang: 10 dòng/trang */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 text-sm text-[#334155]">
              <span>
                Trang {safePage}/{totalPages} · {data.length} phòng ban
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F6F8FA] min-touch-target"
                >
                  Trước
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F6F8FA] min-touch-target"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
};