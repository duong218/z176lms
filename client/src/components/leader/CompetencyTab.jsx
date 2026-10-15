import { useState, useEffect, useMemo } from 'react';
import { Building2, Lock, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchDepartmentCompetency } from '../../services/analytics.service';
import { CompetencyView, toneOf } from '../CompetencyBars';
import { Pagination } from '../Pagination';
import { ReadinessSection } from './ReadinessSection';

const PAGE_SIZE = 8;

const SORTS = {
  low: { label: 'Thấp nhất trước', fn: (a, b) => a.overallRate - b.overallRate },
  high: { label: 'Cao nhất trước', fn: (a, b) => b.overallRate - a.overallRate },
  name: { label: 'Tên A → Z', fn: (a, b) => a.name.localeCompare(b.name, 'vi') },
};

const Stat = ({ label, value, sub }) => (
  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 min-w-0">
    <p className="text-sm text-[#64748B]">{label}</p>
    <p className="text-2xl font-bold text-[#0F172A] mt-0.5 truncate">{value}</p>
    {sub && <p className="text-sm text-[#64748B] truncate">{sub}</p>}
  </div>
);

/** Năng lực theo phòng ban (thi chính thức). Chỉ số liệu gộp, không có dữ liệu từng cá nhân. */
export const CompetencyTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('low');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDepartmentCompetency();
      if (res.success) setData(res.data);
      else setError(res.message);
    } catch (err) {
      setError(err.message || 'Lỗi tải năng lực phòng ban');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const all = useMemo(() => data?.departments ?? [], [data]);
  const ready = useMemo(() => all.filter((d) => !d.insufficientData && d.overallRate != null), [all]);
  const hidden = useMemo(() => all.filter((d) => d.insufficientData || d.overallRate == null), [all]);

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () => ready.filter((d) => !q || d.name.toLowerCase().includes(q)).sort(SORTS[sort].fn),
    [ready, q, sort]
  );
  const hiddenList = hidden.filter((d) => !q || d.name.toLowerCase().includes(q));

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

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

  const avg = ready.length ? ready.reduce((s, d) => s + d.overallRate, 0) / ready.length : null;
  const lowest = ready.length ? ready.reduce((m, d) => (d.overallRate < m.overallRate ? d : m)) : null;

  return (
    <div className="space-y-5">
      <ReadinessSection />
      <div className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Năng lực theo phòng ban</h2>
          <p className="text-base text-[#334155]">
            Tỷ lệ trả lời đúng theo chủ đề trong các kỳ thi chính thức. Phòng ban dưới {data?.minCandidates} thí sinh được ẩn số
            liệu để bảo vệ thông tin cá nhân.
          </p>
        </div>

        {all.length > 0 && (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
            <Stat label="Phòng ban có số liệu" value={`${ready.length}/${all.length}`} />
            <Stat label="Trung bình các phòng ban" value={avg == null ? '—' : `${Math.round(avg * 100)}%`} />
            <Stat label="Thấp nhất" value={lowest ? `${Math.round(lowest.overallRate * 100)}%` : '—'} sub={lowest?.name} />
          </div>
        )}
      </div>

      {all.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">
          <Building2 className="w-12 h-12 mb-3 mx-auto" />
          <p className="text-base font-medium text-[#334155]">Chưa có dữ liệu</p>
          <p className="text-base mt-1">Chưa có lượt thi chính thức nào được nộp.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm phòng ban…"
                aria-label="Tìm phòng ban"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-base min-touch-target"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              aria-label="Sắp xếp"
              className="w-full sm:w-52 px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-base min-touch-target"
            >
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {rows.length === 0 && <p className="text-base text-[#64748B] py-4 text-center">Không tìm thấy phòng ban phù hợp.</p>}
            {rows.map((d) => {
              const isOpen = openId === d.departmentId;
              const tone = toneOf(d.overallRate);
              const p = Math.round(d.overallRate * 100);
              return (
                <article key={d.departmentId} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                  <button
                    onClick={() => setOpenId(isOpen ? null : d.departmentId)}
                    aria-expanded={isOpen}
                    className="w-full text-left p-4 flex items-center gap-3 hover:bg-[#F6F8FA] min-touch-target"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-[#0F172A] break-words">{d.name}</p>
                      <p className="text-sm text-[#64748B]">{d.candidates} thí sinh</p>
                      <div className="mt-2 h-2.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xl font-bold ${tone.text}`}>{p}%</p>
                      <p className="text-sm text-[#64748B]">{tone.label}</p>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-[#64748B] shrink-0" /> : <ChevronDown className="w-5 h-5 text-[#64748B] shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:p-5">
                      <CompetencyView topics={d.topics} />
                    </div>
                  )}
                </article>
              );
            })}
            <Pagination
              page={cur}
              pageCount={pageCount}
              onChange={(p) => {
                setPage(p);
                setOpenId(null);
              }}
            />
          </div>

          {hiddenList.length > 0 && (
            <details className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <summary className="flex items-center gap-2 cursor-pointer text-base font-semibold text-[#334155] min-touch-target select-none">
                <Lock className="w-4 h-4 shrink-0" />
                {hiddenList.length} phòng ban chưa đủ thí sinh để hiển thị
              </summary>
              <ul className="mt-2 divide-y divide-[#E2E8F0]">
                {hiddenList.map((d) => (
                  <li key={d.departmentId} className="flex justify-between gap-3 py-2 text-base text-[#334155]">
                    <span className="min-w-0 break-words">{d.name}</span>
                    <span className="text-[#64748B] shrink-0">{d.candidates} thí sinh</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
};