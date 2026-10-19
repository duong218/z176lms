import { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle, AlertTriangle, Download, CheckCircle2, FileText } from 'lucide-react';
import { fetchTopics, fetchDepartments } from '../../services/examiner.service';
import { fetchStudyDocuments } from '../../services/study-document.service';
import { fetchAiStatus, generateQuestionFile, downloadBase64File } from '../../services/ai-assistant.service';

const MAX_QUESTIONS = 30;
const MAX_HISTORY = 5;
const FORMAT_LABEL = { docx: 'Word', xlsx: 'Excel' };

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40';
const labelCls = 'block text-sm font-semibold text-[#0F172A] mb-1';

/**
 * Người tạo đề: chọn 1 tài liệu ôn tập + chủ đề / phạm vi / phòng ban / độ khó / số câu / định dạng,
 * AI soạn câu hỏi, server dựng file Word hoặc Excel ĐÚNG khuôn import. Người tạo đề tải về, kiểm tra, sửa
 * rồi dùng chức năng Import ở mục Ngân hàng câu hỏi. Không ghi thẳng vào ngân hàng câu hỏi.
 */
export const QuestionGeneratorTab = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [topics, setTopics] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [form, setForm] = useState({
    documentId: '',
    topicId: '',
    scope: 'common', // 'common' | 'department'
    departmentId: '',
    difficulty: 'medium', // easy | medium | hard | mixed
    count: 10,
    format: 'docx',
    instructions: '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]); // kết quả các lần tạo trong phiên này (mới nhất trước)

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudyDocuments(), fetchTopics(), fetchDepartments(), fetchAiStatus().catch(() => ({ enabled: false }))])
      .then(([docs, topicList, deptList, status]) => {
        if (cancelled) return;
        setDocuments(Array.isArray(docs) ? docs : []);
        setTopics(Array.isArray(topicList) ? topicList : []);
        setDepartments(Array.isArray(deptList) ? deptList : []);
        setAiEnabled(Boolean(status?.enabled));
      })
      .catch((err) => !cancelled && setLoadError(err?.message || 'Không tải được dữ liệu.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Chọn tài liệu → gợi ý sẵn chủ đề và phạm vi theo tài liệu đó (vẫn đổi được)
  const handleDocumentChange = (documentId) => {
    const doc = documents.find((d) => d._id === documentId);
    const patch = { documentId };
    if (doc) {
      const topicId = doc.topicId?._id || doc.topicId;
      if (topicId) patch.topicId = topicId;
      if (doc.scope === 'DepartmentSpecific' && doc.departmentId) {
        patch.scope = 'department';
        patch.departmentId = doc.departmentId._id || doc.departmentId;
      } else {
        patch.scope = 'common';
        patch.departmentId = '';
      }
    }
    set(patch);
  };

  const handleGenerate = async () => {
    setError('');
    const count = Number(form.count);
    if (!form.documentId) return setError('Vui lòng chọn tài liệu nguồn.');
    if (!form.topicId) return setError('Vui lòng chọn chủ đề.');
    if (form.scope === 'department' && !form.departmentId) return setError('Vui lòng chọn phòng ban cho câu hỏi Riêng.');
    if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS) {
      return setError(`Số câu phải từ 1 đến ${MAX_QUESTIONS}.`);
    }
    setGenerating(true);
    try {
      const data = await generateQuestionFile({
        documentId: form.documentId,
        topicId: form.topicId,
        scope: form.scope,
        departmentId: form.scope === 'department' ? form.departmentId : undefined,
        difficulty: form.difficulty,
        count,
        format: form.format,
        instructions: form.instructions,
      });
      const docTitle = documents.find((d) => d._id === form.documentId)?.title || '';
      setResults((prev) => [{ ...data, id: Date.now(), docTitle }, ...prev].slice(0, MAX_HISTORY));
    } catch (err) {
      setError(err?.message || 'Không thể tạo câu hỏi, vui lòng thử lại.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Đang tải...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#008BC5]" />
            Tạo câu hỏi bằng AI
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Chọn một tài liệu ôn tập, AI soạn câu hỏi trắc nghiệm rồi xuất file đúng khuôn import. Bạn tải về kiểm tra, sửa,
            sau đó import ở mục Ngân hàng câu hỏi.
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {loadError && (
            <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}
          {!aiEnabled && (
            <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#F6AD37]" />
              <span>Trợ lý AI chưa được bật. Vui lòng nhờ quản trị viên bật trong tab "Trợ lý AI".</span>
            </div>
          )}

          <label className="block">
            <span className={labelCls}>Tài liệu nguồn (PDF / Word / Excel đã đăng ở mục Tài liệu ôn tập)</span>
            <select className={inputCls} value={form.documentId} onChange={(e) => handleDocumentChange(e.target.value)}>
              <option value="">-- Chọn tài liệu --</option>
              {documents.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.title} — {d.topicId?.name || 'Chưa có chủ đề'} (
                  {d.scope === 'DepartmentSpecific' ? d.departmentId?.name || 'Riêng' : 'Chung'})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className={labelCls}>Chủ đề của câu hỏi</span>
              <select className={inputCls} value={form.topicId} onChange={(e) => set({ topicId: e.target.value })}>
                <option value="">-- Chọn chủ đề --</option>
                {topics.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Phạm vi</span>
              <select
                className={inputCls}
                value={form.scope}
                onChange={(e) => set({ scope: e.target.value, departmentId: e.target.value === 'common' ? '' : form.departmentId })}
              >
                <option value="common">Chung (mọi phòng ban)</option>
                <option value="department">Riêng theo phòng ban</option>
              </select>
            </label>

            {form.scope === 'department' && (
              <label className="block md:col-span-2">
                <span className={labelCls}>Phòng ban</span>
                <select className={inputCls} value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
                  <option value="">-- Chọn phòng ban --</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id} disabled={!d.code}>
                      {d.name} {d.code ? `(${d.code})` : '(chưa có mã bộ phận)'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className={labelCls}>Độ khó</span>
              <select className={inputCls} value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
                <option value="mixed">Trộn đều 3 mức</option>
              </select>
            </label>

            <label className="block">
              <span className={labelCls}>Số câu (tối đa {MAX_QUESTIONS})</span>
              <input
                type="number"
                min={1}
                max={MAX_QUESTIONS}
                className={inputCls}
                value={form.count}
                onChange={(e) => set({ count: e.target.value })}
              />
            </label>
          </div>

          <div>
            <span className={labelCls}>Định dạng file xuất</span>
            <div className="flex gap-3">
              {Object.entries(FORMAT_LABEL).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex-1 sm:flex-none sm:w-40 px-4 py-2.5 rounded-lg border cursor-pointer text-center min-touch-target ${
                    form.format === value ? 'border-[#008BC5] bg-[#E6F4FA] text-[#008BC5] font-semibold' : 'border-slate-300 text-[#0F172A]'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={value}
                    checked={form.format === value}
                    onChange={() => set({ format: value })}
                    className="sr-only"
                  />
                  {label} {value === 'docx' && <span className="text-xs font-normal">(khuyên dùng)</span>}
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className={labelCls}>Yêu cầu thêm (không bắt buộc)</span>
            <textarea
              rows={3}
              maxLength={500}
              className={inputCls}
              value={form.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
              placeholder='Ví dụ: "tập trung vào phần an toàn điện", "ưu tiên câu hỏi tình huống"...'
            />
          </label>

          <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg flex items-start gap-2 text-sm text-[#0F172A]">
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#F6AD37]" />
            <span>
              Câu hỏi do AI soạn có thể sai nội dung hoặc đáp án. Luôn đọc lại file trước khi import. Nội dung tài liệu được gửi tới
              dịch vụ AI bên ngoài, bản demo chỉ dùng tài liệu mẫu.
            </span>
          </div>

          {error && (
            <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !aiEnabled}
            className="w-full sm:w-auto px-6 py-3 bg-[#008BC5] disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'AI đang soạn câu hỏi (có thể mất 30–60 giây)...' : 'Tạo file câu hỏi'}
          </button>
        </div>
      </div>

      {results.map((r) => (
        <div key={r.id} className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" />
                Đã soạn {r.count}/{r.requested} câu
              </div>
              <p className="text-sm text-slate-500 mt-0.5 break-words">
                Từ tài liệu "{r.docTitle}"
                {r.rejected > 0 ? ` · AI viết ${r.rejected} câu không hợp lệ nên đã bị loại` : ''}
              </p>
            </div>
            <button
              onClick={() => downloadBase64File(r)}
              className="px-5 py-3 bg-[#008BC5] text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target shrink-0"
            >
              <Download className="w-4 h-4" />
              Tải file {FORMAT_LABEL[r.format]}
            </button>
          </div>

          <div className="px-4 sm:px-6 pb-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-600 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Xem nhanh {r.preview.length} câu đầu
            </div>
            {r.preview.map((q, i) => (
              <div key={i} className="text-sm text-[#0F172A]">
                <div className="font-semibold">
                  {i + 1}. {q.content}
                </div>
                <ul className="mt-1 space-y-0.5 pl-4">
                  {q.options.map((o, idx) => (
                    <li key={idx} className={idx + 1 === q.correct ? 'text-[#1B7F3B] font-semibold' : 'text-slate-600'}>
                      {String.fromCharCode(65 + idx)}. {o}
                      {idx + 1 === q.correct ? ' ✓' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-sm text-slate-500">
              Tiếp theo: mở file để kiểm tra và sửa, rồi vào <b>Ngân hàng câu hỏi</b> → Import {FORMAT_LABEL[r.format]}.
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};