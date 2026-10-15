import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { fetchPracticeReadiness } from '../../services/analytics.service';
import { toneOf } from '../CompetencyBars';

/** Mức độ sẵn sàng của kỳ thi đang phát hành: tỷ lệ thí sinh đã luyện tập đúng chủ đề thi. Chỉ số gộp, không lộ tên ai. */
export const ReadinessSection = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPracticeReadiness()
      .then((res) => (res.success ? setData(res.data) : setError(res.message)))
      .catch((err) => setError(err.message || 'Lỗi tải mức độ sẵn sàng'));
  }, []);

  if (error) return <p className="text-base text-[#C53030]">Lỗi: {error}</p>;
  if (!data) return null;

  const { exam } = data;
  const shown = data.departments.filter((d) => !d.insufficientData).sort((a, b) => a.rate - b.rate);
  const hidden = data.departments.length - shown.length;
  const total = shown.reduce((s, d) => s + d.candidates, 0);
  const done = shown.reduce((s, d) => s + d.practiced, 0);

  return (
    <section className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="w-5 h-5 text-[#008BC5] mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Mức độ sẵn sàng thi</h2>
          {exam ? (
            <p className="text-base text-[#334155]">
              Kỳ thi &quot;{exam.title}&quot;: tỷ lệ thí sinh đã làm ít nhất {exam.minAnswers} câu ôn tập thuộc chủ đề{' '}
              <strong>{exam.topicName || 'của kỳ thi'}</strong>
              {total > 0 && ` — tổng: ${done}/${total} (${Math.round((done / total) * 100)}%)`}. Phòng ban dưới{' '}
              {data.minCandidates} thí sinh được ẩn.
            </p>
          ) : (
            <p className="text-base text-[#64748B]">Chưa có kỳ thi nào đang phát hành nên chưa có số liệu sẵn sàng.</p>
          )}
        </div>
      </div>

      {exam && exam.practiceQuestionCount === 0 && (
        <p className="text-base text-[#B7791F] bg-[#FEF6E7] border border-[#F6AD37]/40 rounded-lg px-3 py-2">
          Chủ đề &quot;{exam.topicName}&quot; chưa có câu hỏi ôn tập nên thí sinh không thể luyện đúng chủ đề thi. Nhờ Người ra
          đề thêm câu ôn tập vào chủ đề này, nếu không tỷ lệ bên dưới luôn là 0%.
        </p>
      )}
      {exam && shown.length === 0 && <p className="text-base text-[#64748B]">Chưa có phòng ban đủ số liệu.</p>}
      {shown.length > 0 && (
        <ul className="space-y-3">
          {shown.map((d) => {
            const tone = toneOf(d.rate);
            const p = Math.round(d.rate * 100);
            return (
              <li key={d.departmentId}>
                <div className="flex justify-between gap-3 text-base">
                  <span className="font-semibold text-[#0F172A] min-w-0 break-words">{d.name}</span>
                  <span className={`font-bold shrink-0 ${tone.text}`}>
                    {d.practiced}/{d.candidates} người · {p}%
                  </span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${p}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && <p className="text-sm text-[#64748B]">{hidden} phòng ban chưa đủ thí sinh để hiển thị.</p>}
    </section>
  );
};