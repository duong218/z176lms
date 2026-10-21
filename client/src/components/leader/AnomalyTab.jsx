import { useState, useEffect } from 'react';
import { ShieldAlert, Users, Timer, Info, CheckCircle2, CircleSlash, Check, Search, ChevronDown, EyeOff } from 'lucide-react';
import { fetchAnomalies } from '../../services/analytics.service';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 5;
const EXAM_PAGE_SIZE = 5;
const label = (p) => p.name || p.code || 'Không rõ';
const dur = (s) => (s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`);
const dec = (n) => String(n).replace('.', ',');
const fmt = (d) => new Date(d).toLocaleDateString('vi-VN');
const total = (e) => e.sharedWrong.length + e.fast.length + e.leaves.length; // tổng số dấu hiệu của một kỳ thi
// bỏ dấu tiếng Việt + chữ thường để gõ "nghiep vu" vẫn tìm được "nghiệp vụ"
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();

// Màu luôn đi kèm chữ "Đang diễn ra" (không chỉ dựa vào màu xanh)
const Live = () => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold bg-[#F0FDF4] text-[#166534]">
    <span className="w-2 h-2 rounded-full bg-[#22C55E]" aria-hidden="true" />
    Đang diễn ra
  </span>
);

const Section = ({ icon, title, hint, count, children }) => (
  <section className="space-y-2.5">
    <div>
      <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
        {icon}
        {title} <span className="text-[#334155] font-medium">({count})</span>
      </h3>
      <p className="text-sm text-[#334155] mt-0.5">{hint}</p>
    </div>
    {children}
  </section>
);

// ok = đã xét và không thấy gì (xanh); skip = chưa đủ điều kiện để xét (xám, tránh tưởng đã kiểm tra xong)
const Empty = ({ text, skip }) => (
  <p className="flex items-center gap-2 bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 text-base text-[#334155]">
    {skip ? <CircleSlash className="w-5 h-5 text-[#64748B] shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" />}
    {text}
  </p>
);

const Rows = ({ children }) => <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 divide-y divide-[#E2E8F0] overflow-hidden">{children}</div>;

const Row = ({ title, sub, badge }) => (
  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
    <div className="min-w-0">
      <p className="text-base font-semibold text-[#0F172A] break-words">{title}</p>
      {sub && <p className="text-sm text-[#334155] break-words">{sub}</p>}
    </div>
    <span className="self-start sm:self-auto shrink-0 px-3 py-1.5 rounded-lg border border-[#F6AD37]/50 text-base font-semibold bg-[#FFF7E6] text-[#B45309]">{badge}</span>
  </div>
);

/** Dấu hiệu bất thường theo kỳ thi. Chỉ là gợi ý để xem xét, KHÔNG kết luận gian lận. */
export const AnomalyTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [examId, setExamId] = useState(null);
  const [examPage, setExamPage] = useState(1);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [pairPage, setPairPage] = useState(1);
  const [fastPage, setFastPage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAnomalies();
      if (res.success) setData(res.data);
      else setError(res.message);
    } catch (err) {
      setError(err.message || 'Lỗi tải dấu hiệu bất thường');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const { thresholds: t } = data;
  // Server xếp kỳ đang diễn ra lên đầu, rồi kỳ kết thúc gần nhất; mặc định mở kỳ đầu tiên.
  // Chỉ liệt kê kỳ thi có dấu hiệu (kỳ 0 dấu hiệu làm danh sách dài vô ích), riêng kỳ đang diễn ra luôn được giữ.
  const exams = data.exams.filter((e) => e.running || total(e) > 0);
  const exam = exams.find((e) => e.examId === examId) ?? exams[0];
  const pairs = exam?.sharedWrong ?? [];
  const fast = exam?.fast ?? [];
  const leaves = exam?.leaves ?? [];
  const pairPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));
  const fastPages = Math.max(1, Math.ceil(fast.length / PAGE_SIZE));
  const leavePages = Math.max(1, Math.ceil(leaves.length / PAGE_SIZE));
  const pCur = Math.min(pairPage, pairPages);
  const fCur = Math.min(fastPage, fastPages);
  const lCur = Math.min(leavePage, leavePages);
  const q = norm(query.trim());
  const matched = q ? exams.filter((e) => norm(e.title).includes(q)) : exams;
  const examPages = Math.max(1, Math.ceil(matched.length / EXAM_PAGE_SIZE));
  const eCur = Math.min(examPage, examPages);
  const pick = (id) => {
    setExamId(id);
    setPairPage(1);
    setFastPage(1);
    setLeavePage(1);
    setExamPage(1);
    setQuery('');
    setPicking(false);
  };

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
        <h2 className="text-xl font-bold text-[#0F172A]">Dấu hiệu bất thường</h2>
        <p className="flex items-start gap-2 rounded-xl border border-[#F6AD37]/40 bg-[#FFF7E6] px-4 py-3 text-base text-[#334155]">
          <ShieldAlert className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
          Đây chỉ là gợi ý để xem xét, không kết luận gian lận. Nên đối chiếu thêm bối cảnh trước khi trao đổi với thí sinh.
        </p>

        <details className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[#334155]">
          <summary className="flex items-center gap-2 cursor-pointer text-base font-semibold min-touch-target select-none">
            <Info className="w-4 h-4 text-[#008BC5] shrink-0" /> Cách phát hiện
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-[#475569] list-disc pl-5">
            <li>
              Cùng sai giống nhau: hai thí sinh chọn cùng một đáp án sai ở từ {t.minSharedWrong} câu trở lên, chiếm từ{' '}
              {Math.round(t.sharedWrongRatio * 100)}% số câu sai của người sai ít hơn. So theo nội dung đáp án nên vẫn đúng khi
              đề đã xáo thứ tự. Đáp án sai mà nhiều người cùng chọn thì không tính.
            </li>
            <li>
              Làm quá nhanh: trung bình dưới {t.fastSecPerQuestion} giây mỗi câu, xét từ {t.minAnsweredForSpeed} câu đã trả lời trở lên.
            </li>
            <li>Kỳ thi dưới {t.minAttemptsForPairs} lượt nộp thì không so cặp vì mẫu quá nhỏ. Bài bị hệ thống tự nộp không được xét.</li>
            <li>
              Rời màn hình thi nhiều: từ {t.minLeaves} lần trở lên (chuyển tab, chuyển ứng dụng, khoá màn hình). Chỉ có số liệu ở các lượt
              thi sau khi tính năng này được bật, lượt thi cũ không có.
            </li>
          </ul>
        </details>
      </div>

      {!exam ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center text-[#64748B]">
          <CheckCircle2 className="w-12 h-12 mb-3 mx-auto text-[#22C55E]" />
          <p className="text-base font-medium text-[#334155]">Không phát hiện dấu hiệu bất thường</p>
          <p className="text-base mt-1">
            {data.exams.length === 0 ? 'Chưa có lượt thi chính thức nào được nộp.' : `Đã xét ${data.exams.length} kỳ thi.`}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 overflow-hidden">
            <div className="px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-[#334155]">Đang xem kỳ thi</p>
                  {exam.running && <Live />}
                </div>
                <p className="text-base font-bold text-[#0F172A] break-words">{exam.title}</p>
                <p className="text-sm text-[#334155]">
                  {exam.attempts} lượt đã nộp · {total(exam)} dấu hiệu
                  {!exam.running && exam.endsAt ? ` · Kết thúc ${fmt(exam.endsAt)}` : ''}
                </p>
              </div>
              {exams.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicking((v) => !v)}
                  aria-expanded={picking}
                  aria-controls="exam-picker"
                  className="self-start sm:self-auto shrink-0 inline-flex items-center gap-2 px-4 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-base font-semibold text-[#334155] min-touch-target"
                >
                  {picking ? 'Đóng danh sách' : `Đổi kỳ thi (${exams.length})`}
                  <ChevronDown className={`w-4 h-4 transition-transform ${picking ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              )}
            </div>

            <dl className="grid grid-cols-3 divide-x divide-[#E2E8F0] border-t border-[#E2E8F0] bg-[#F6F8FA]">
              {[
                [Users, 'Cùng sai', pairs.length],
                [Timer, 'Làm nhanh', fast.length],
                [EyeOff, 'Rời màn hình', leaves.length],
              ].map(([Icon, name, n]) => (
                <div key={name} className="px-3 py-3 sm:px-5 text-center sm:text-left">
                  <dt className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-[#334155]">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {name}
                  </dt>
                  <dd className={`text-xl font-bold ${n > 0 ? 'text-[#B45309]' : 'text-[#0F172A]'}`}>{n}</dd>
                </div>
              ))}
            </dl>

            {picking && (
              <div id="exam-picker" className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-3">
                {exams.length > EXAM_PAGE_SIZE && (
                  <div className="relative">
                    <Search className="w-5 h-5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setExamPage(1);
                      }}
                      aria-label="Tìm kỳ thi theo tên"
                      placeholder="Tìm kỳ thi theo tên"
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-base min-touch-target"
                    />
                  </div>
                )}

                {matched.length === 0 ? (
                  <p className="text-base text-[#334155] px-1">Không có kỳ thi nào khớp với "{query}".</p>
                ) : (
                  <>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] overflow-hidden">
                      {matched.slice((eCur - 1) * EXAM_PAGE_SIZE, eCur * EXAM_PAGE_SIZE).map((e) => {
                        const active = e.examId === exam.examId;
                        return (
                          <button
                            key={e.examId}
                            type="button"
                            onClick={() => pick(e.examId)}
                            aria-pressed={active}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 min-touch-target border-l-4 ${
                              active ? 'bg-[#E6F4FA] border-[#008BC5]' : 'border-transparent hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className={`block break-words text-base ${active ? 'font-bold text-[#0F172A]' : 'text-[#334155]'}`}>{e.title}</span>
                              {e.running ? (
                                <span className="mt-1 inline-flex">
                                  <Live />
                                </span>
                              ) : (
                                e.endsAt && <span className="block text-sm text-[#334155]">Kết thúc {fmt(e.endsAt)}</span>
                              )}
                            </span>
                            <span className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-[#B45309]">
                              {total(e)} dấu hiệu
                              {active && <Check className="w-4 h-4 text-[#008BC5]" aria-hidden="true" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Pagination page={eCur} pageCount={examPages} onChange={setExamPage} />
                  </>
                )}
              </div>
            )}
          </div>

          <Section
            icon={<Users className="w-5 h-5 text-[#B45309]" />}
            title="Cùng sai giống nhau"
            hint="Hai thí sinh cùng chọn một đáp án sai ở nhiều câu."
            count={pairs.length}
          >
            {pairs.length === 0 ? (
              <Empty
                skip={exam.attempts < t.minAttemptsForPairs}
                text={exam.attempts < t.minAttemptsForPairs ? `Chưa so cặp: kỳ thi dưới ${t.minAttemptsForPairs} lượt nộp.` : 'Không phát hiện cặp nào.'}
              />
            ) : (
              <>
                <Rows>
                  {pairs.slice((pCur - 1) * PAGE_SIZE, pCur * PAGE_SIZE).map((p) => (
                    <Row
                      key={p.people[0].attemptId + p.people[1].attemptId}
                      title={`${label(p.people[0])} và ${label(p.people[1])}`}
                      sub={[p.people[0].code, p.people[1].code].filter(Boolean).join(' · ')}
                      badge={`Cùng sai ${p.shared}/${p.ofWrong} câu sai`}
                    />
                  ))}
                </Rows>
                <Pagination page={pCur} pageCount={pairPages} onChange={setPairPage} />
              </>
            )}
          </Section>

          <Section
            icon={<Timer className="w-5 h-5 text-[#B45309]" />}
            title="Làm bài rất nhanh"
            hint="Thời gian làm trung bình mỗi câu thấp bất thường."
            count={fast.length}
          >
            {fast.length === 0 ? (
              <Empty skip={exam.attempts === 0} text={exam.attempts === 0 ? 'Chưa có lượt nộp nào để xét.' : 'Không phát hiện trường hợp nào.'} />
            ) : (
              <>
                <Rows>
                  {fast.slice((fCur - 1) * PAGE_SIZE, fCur * PAGE_SIZE).map((f) => (
                    <Row
                      key={f.attemptId}
                      title={label(f)}
                      sub={`${f.code ? `${f.code} · ` : ''}${f.answered} câu trong ${dur(f.totalSeconds)}`}
                      badge={`${dec(f.secondsPerQuestion)} giây/câu`}
                    />
                  ))}
                </Rows>
                <Pagination page={fCur} pageCount={fastPages} onChange={setFastPage} />
              </>
            )}
          </Section>

          <Section
            icon={<EyeOff className="w-5 h-5 text-[#B45309]" />}
            title="Rời màn hình thi nhiều"
            hint="Số lần thí sinh chuyển tab hoặc thoát khỏi màn hình thi trong lúc làm bài."
            count={leaves.length}
          >
            {leaves.length === 0 ? (
              <Empty skip={exam.attempts === 0} text={exam.attempts === 0 ? 'Chưa có lượt nộp nào để xét.' : 'Không phát hiện trường hợp nào.'} />
            ) : (
              <>
                <Rows>
                  {leaves.slice((lCur - 1) * PAGE_SIZE, lCur * PAGE_SIZE).map((l) => (
                    <Row key={l.attemptId} title={label(l)} sub={l.code} badge={`Rời ${l.leaveCount} lần`} />
                  ))}
                </Rows>
                <Pagination page={lCur} pageCount={leavePages} onChange={setLeavePage} />
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
};