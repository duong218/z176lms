import { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle, AlertTriangle, Download, CheckCircle2, FileText } from 'lucide-react';
import { SelectBox } from '../Select';
import { fetchTopics, fetchDepartments, fetchExamProposals } from '../../services/examiner.service';
import { fetchStudyDocuments } from '../../services/study-document.service';
import { fetchAiStatus, downloadBase64File } from '../../services/ai-assistant.service';

import { startGeneration, markSeen, markDownloaded, clearGenerationError, useGeneration } from '../../services/question-generation.store';
import { GenerationProgress } from './GenerationProgress';

const MAX_QUESTIONS = 30;
const MAX_DEPTS = 12;
const NEW_TOPIC = '__new__';
const FORMAT_LABEL = { docx: 'Word', xlsx: 'Excel' };

const inputCls =
  'w-full min-w-0 max-w-full px-3 py-2 border border-slate-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40';
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
  const [publishedTopicIds, setPublishedTopicIds] = useState([]); // chủ đề của kỳ thi đang phát hành → tô nổi bật

  const [form, setForm] = useState({
    documentId: '',
    topicId: '', // '' | id chủ đề có sẵn | NEW_TOPIC
    newTopicName: '',
    scope: 'common', // 'common' | 'department'
    departmentIds: [], // phạm vi Riêng: chọn nhiều phòng ban, mỗi phòng AI soạn 1 bộ câu hỏi riêng
    difficulty: 'medium', // easy | medium | hard | mixed
    count: 10,
    format: 'docx',
    instructions: '',
  });
  const [error, setError] = useState('');
  const { generating, results, error: genError } = useGeneration(); // nằm trong store → đổi tab không mất
  useEffect(() => { markSeen(); }, [results, genError, generating]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudyDocuments(), fetchTopics(), fetchDepartments(), fetchAiStatus().catch(() => ({ enabled: false })), fetchExamProposals().catch(() => [])])
      .then(([docs, topicList, deptList, status, exams]) => {
        if (cancelled) return;
        setDocuments(Array.isArray(docs) ? docs : []);
        setTopics(Array.isArray(topicList) ? topicList : []);
        setDepartments(Array.isArray(deptList) ? deptList : []);
        setAiEnabled(Boolean(status?.enabled));
        setPublishedTopicIds(
          (Array.isArray(exams) ? exams : []).filter((e) => e.status === 'published').map((e) => String(e.topicId?._id ?? e.topicId)),
        );
      })
      .catch((err) => !cancelled && setLoadError(err?.message || 'Không tải được dữ liệu.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const usableDepts = departments.filter((d) => d.code); // phòng ban chưa có mã thì không import được
  const allSelected = usableDepts.length > 0 && form.departmentIds.length === usableDepts.length;
  const deptN = form.departmentIds.length;
  const perDept = form.scope === 'department' && deptN > 0;
  const toggleDept = (id) =>
    set({ departmentIds: form.departmentIds.includes(id) ? form.departmentIds.filter((x) => x !== id) : [...form.departmentIds, id] });

  // Chọn tài liệu → chỉ gợi ý sẵn phạm vi theo tài liệu đó (vẫn đổi được). Chủ đề do người tạo đề tự chọn / đặt mới.
  const handleDocumentChange = (documentId) => {
    const doc = documents.find((d) => d._id === documentId);
    const patch = { documentId };
    if (doc) {
      if (doc.scope === 'DepartmentSpecific' && doc.departmentId) {
        patch.scope = 'department';
        patch.departmentIds = [doc.departmentId._id || doc.departmentId];
      } else {
        patch.scope = 'common';
        patch.departmentIds = [];
      }
    }
    set(patch);
  };

  const handleGenerate = async () => {
    setError('');
    const count = Number(form.count);
    if (!form.documentId) return setError('Vui lòng chọn tài liệu nguồn.');
    const isNewTopic = form.topicId === NEW_TOPIC;
    const newTopicName = form.newTopicName.trim();
    if (!form.topicId) return setError('Vui lòng chọn chủ đề.');
    if (isNewTopic && !newTopicName) return setError('Vui lòng nhập tên chủ đề mới.');
    if (form.scope === 'department' && form.departmentIds.length === 0) return setError('Vui lòng chọn ít nhất 1 phòng ban cho câu hỏi Riêng.');
    if (form.scope === 'department' && form.departmentIds.length > MAX_DEPTS) {
      return setError(`Mỗi lần chỉ tạo tối đa cho ${MAX_DEPTS} phòng ban. Hãy bỏ bớt hoặc tạo làm 2 lần.`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS) {
      return setError(`Số câu phải từ 1 đến ${MAX_QUESTIONS}.`);
    }
    clearGenerationError();
    startGeneration(
      {
        documentId: form.documentId,
        ...(isNewTopic ? { topicName: newTopicName } : { topicId: form.topicId }),
        scope: form.scope,
        departmentIds: form.scope === 'department' ? form.departmentIds : undefined,
        difficulty: form.difficulty,
        count,
        format: form.format,
        instructions: form.instructions,
      },
      {
        docTitle: documents.find((d) => d._id === form.documentId)?.title || '',
        deptCount: form.scope === 'department' ? form.departmentIds.length : 0,
        count,
      },
    );
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
            <SelectBox
              value={form.documentId}
              onChange={handleDocumentChange}
              items={[
                { value: '', label: '-- Chọn tài liệu --' },
                ...documents.map((d) => ({
                  value: d._id,
                  label: `${d.title} — ${d.topicId?.name || 'Chưa có chủ đề'} (${
                    d.scope === 'DepartmentSpecific' ? d.departmentId?.name || 'Riêng' : 'Chung'
                  })`,
                })),
              ]}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block min-w-0">
              <span className={labelCls}>Chủ đề của câu hỏi</span>
              <SelectBox
                value={form.topicId}
                onChange={(topicId) => set({ topicId })}
                items={[
                  { value: '', label: '-- Chọn chủ đề --' },
                  { value: NEW_TOPIC, label: '+ Chủ đề mới...' },
                  ...(topics.length ? [{ heading: 'Chủ đề gợi ý (đã tạo trước đây)' }] : []),
                  ...[...topics]
                    .sort((a, b) => publishedTopicIds.includes(String(b._id)) - publishedTopicIds.includes(String(a._id)))
                    .map((t) => ({
                      value: t._id,
                      label: t.name,
                      badge: publishedTopicIds.includes(String(t._id)) ? 'Đang phát hành' : undefined,
                    })),
                ]}
              />
              {form.topicId === NEW_TOPIC && (
                <input
                  type="text"
                  maxLength={100}
                  autoFocus
                  className={`${inputCls} mt-2`}
                  value={form.newTopicName}
                  onChange={(e) => set({ newTopicName: e.target.value })}
                  placeholder="Nhập tên chủ đề mới, ví dụ: Hội thi nghiệp vụ giỏi tháng 11"
                />
              )}
            </label>

            <label className="block min-w-0">
              <span className={labelCls}>Phạm vi</span>
              <SelectBox
                value={form.scope}
                onChange={(scope) => set({ scope, departmentIds: scope === 'common' ? [] : form.departmentIds })}
                items={[
                  { value: 'common', label: 'Chung (mọi phòng ban)' },
                  { value: 'department', label: 'Riêng theo phòng ban' },
                ]}
              />
            </label>

            {form.scope === 'department' && (
              <div className="md:col-span-2 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-[#0F172A]">
                    Phòng ban ({form.departmentIds.length}/{usableDepts.length} đã chọn)
                  </span>
                  <button
                    type="button"
                    onClick={() => set({ departmentIds: allSelected ? [] : usableDepts.map((d) => d._id) })}
                    className="text-sm font-semibold text-[#008BC5] px-2 py-2 min-touch-target"
                  >
                    {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto border border-slate-300 rounded-lg divide-y divide-slate-100 bg-white">
                  {departments.map((d) => (
                    <label
                      key={d._id}
                      className={`flex items-start gap-3 px-3 py-2.5 min-touch-target ${d.code ? 'cursor-pointer hover:bg-[#E6F4FA]' : 'text-slate-400'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!d.code}
                        checked={form.departmentIds.includes(d._id)}
                        onChange={() => toggleDept(d._id)}
                        className="mt-1 w-4 h-4 shrink-0 accent-[#008BC5]"
                      />
                      <span className="min-w-0 break-words text-base">
                        {d.name} {d.code ? `(${d.code})` : '(chưa có mã bộ phận)'}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  AI soạn riêng một bộ {Number(form.count) || 0} câu cho từng phòng ban đã chọn (cùng độ khó, cùng số câu). Tối đa {MAX_DEPTS} phòng ban mỗi lần.
                </p>
              </div>
            )}

            <label className="block min-w-0">
              <span className={labelCls}>Độ khó</span>
              <SelectBox
                value={form.difficulty}
                onChange={(difficulty) => set({ difficulty })}
                items={[
                  { value: 'easy', label: 'Dễ' },
                  { value: 'medium', label: 'Trung bình' },
                  { value: 'hard', label: 'Khó' },
                  { value: 'mixed', label: 'Trộn đều 3 mức' },
                ]}
              />
            </label>

            <label className="block min-w-0">
              <span className={labelCls}>{perDept ? 'Số câu MỖI phòng ban' : 'Số câu'} (tối đa {MAX_QUESTIONS})</span>
              <input
                type="number"
                min={1}
                max={MAX_QUESTIONS}
                className={inputCls}
                value={form.count}
                onChange={(e) => set({ count: e.target.value })}
              />
              {perDept && (
                <p className="text-sm font-semibold text-[#B45309] mt-1">
                  {deptN} phòng ban × {Number(form.count) || 0} câu = {deptN * (Number(form.count) || 0)} câu tổng cộng
                </p>
              )}
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

          {(error || genError) && (
            <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg flex items-center gap-2 text-sm text-[#0F172A]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error || genError}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !aiEnabled}
            className="w-full sm:w-auto px-6 py-3 bg-[#008BC5] disabled:bg-slate-300 text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Đang soạn...' : perDept ? `Tạo file ${deptN * (Number(form.count) || 0)} câu hỏi` : 'Tạo file câu hỏi'}
          </button>
        </div>
      </div>

      <GenerationProgress />

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
                {r.deptCount > 0 ? ` · ${r.deptCount} phòng ban` : ''}
                {r.rejected > 0 ? ` · AI viết ${r.rejected} câu không hợp lệ nên đã bị loại` : ''}
                {r.failed?.length > 0 ? ` · AI soạn lỗi cho: ${r.failed.join(', ')} (hãy tạo lại riêng các phòng này)` : ''}
              </p>
            </div>
            <button
              onClick={() => {
                downloadBase64File(r);
                markDownloaded(r.id);
              }}
              className="px-5 py-3 bg-[#008BC5] text-white font-bold rounded-lg flex items-center justify-center gap-2 min-touch-target shrink-0"
            >
              <Download className="w-4 h-4" />
              Tải file {FORMAT_LABEL[r.format]}
            </button>
          </div>

          {!r.downloaded && (
            <div role="status" className="mx-4 sm:mx-6 mb-4 p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg flex items-start gap-2 text-sm text-[#0F172A]">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#F6AD37]" />
              <span>
                <b>Bạn chưa tải file này về.</b> Kết quả chỉ nằm trên trang này — tải lại trang (F5) hoặc đăng xuất sẽ mất. Hãy bấm "Tải file" trước khi rời đi.
              </span>
            </div>
          )}

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