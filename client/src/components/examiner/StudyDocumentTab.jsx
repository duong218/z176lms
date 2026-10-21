import { useEffect, useState, useRef } from 'react';
import {
  BookOpen,
  UploadCloud,
  FileText,
  Eye,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { fetchTopics, fetchDepartments, createTopic, fetchExamProposals } from '../../services/examiner.service';
import {
  fetchStudyDocuments,
  uploadStudyDocument,
  deleteStudyDocument,
  previewStudyDocument,
  downloadStudyDocument,
} from '../../services/study-document.service';
import { useConfirm } from '../ConfirmDialog';

const NEW_TOPIC = '__new__';
const SCOPE_COMMON = 'Common';
const SCOPE_DEPARTMENT = 'DepartmentSpecific';

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx'; // Trợ lý AI chỉ đọc được 3 loại này; .doc/.xls cũ bị server từ chối
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// MỚI — Dropdown tự dựng, thay cho <select> native. Danh sách xổ xuống của
// <select> do OS/trình duyệt tự vẽ, không bị ràng buộc bởi layout trang cha
// nên hay bị tràn ra ngoài khung chứa/màn hình trên mobile (đặc biệt khi ô
// chọn nằm gần đầu trang, danh sách dài sẽ tràn xuống dưới, lệch khỏi khung
// card). Component này tự đo khoảng trống viewport để quyết định mở xuống
// hay lật lên trên, luôn giới hạn width/height trong màn hình.
function Select({ value, options, onChange, placeholder = '-- Chọn --', triggerClassName = '' }) {
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

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-left relative ${triggerClassName}`}
        style={{ color: value ? undefined : '#64748B' }}
      >
        <span className="block truncate pr-6">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && (
        <div
          className={`absolute z-20 w-full overflow-y-auto bg-white rounded-[10px] border border-[#E2E8F0] shadow-z176 py-1 ${
            menuStyle.placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${menuStyle.maxHeight}px` }}
          data-lenis-prevent
        >
          {options.map((opt, idx) => opt.heading ? (
            <div key={`h${idx}`} className="px-3.5 pt-2 pb-1 text-sm font-bold text-[#334155]">{opt.heading}</div>
          ) : (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3.5 min-h-[44px] flex items-center justify-between gap-2 text-base"
              style={{
                ...(opt.badge ? { backgroundColor: '#F0FDF4' } : {}),
                ...(value === opt.value ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }),
              }}
            >
              <span className="min-w-0">{opt.label}</span>
              {opt.badge && (
                <span className="shrink-0 text-sm font-semibold px-2 py-0.5 rounded-lg bg-[#F0FDF4] border border-[#22C55E]/40 text-[#166534]">{opt.badge}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const isPdf = (doc) =>
  doc.mimeType === 'application/pdf' || doc.originalFileName?.toLowerCase().endsWith('.pdf');

export const StudyDocumentTab = () => {
  const confirmAction = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [topics, setTopics] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [form, setForm] = useState({
    topicId: '', // '' | id chủ đề có sẵn | NEW_TOPIC
    newTopicName: '',
    title: '',
    scope: SCOPE_COMMON,
    departmentId: '',
  });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [busyId, setBusyId] = useState(null); // id đang xem/tải/xóa dở
  const [publishedTopicIds, setPublishedTopicIds] = useState([]); // chủ đề của kỳ thi đang phát hành → tô nổi bật

  const loadAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStudyDocuments(), fetchTopics(), fetchDepartments(), fetchExamProposals().catch(() => [])])
      .then(([docs, topicList, deptList, exams]) => {
        setDocuments(Array.isArray(docs) ? docs : []);
        setTopics(Array.isArray(topicList) ? topicList : []);
        setDepartments(Array.isArray(deptList) ? deptList : []);
        setPublishedTopicIds(
          (Array.isArray(exams) ? exams : []).filter((e) => e.status === 'published').map((e) => String(e.topicId?._id ?? e.topicId)),
        );
      })
      .catch((err) => {
        setError(err?.message || 'Không thể tải danh sách tài liệu.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] ?? null;
    if (selected && !/\.(pdf|docx|xlsx)$/i.test(selected.name)) {
      setFormError(
        `File "${selected.name}" không đúng định dạng. Chỉ chấp nhận PDF (.pdf), Word (.docx) hoặc Excel (.xlsx). ` +
          'File Word/Excel cũ (.doc, .xls): mở bằng Word/Excel rồi chọn "Lưu thành" .docx/.xlsx.',
      );
      setFile(null);
      e.target.value = '';
      return;
    }
    if (selected && selected.size > MAX_FILE_BYTES) {
      setFormError('File vượt quá dung lượng cho phép (tối đa 20MB).');
      setFile(null);
      e.target.value = '';
      return;
    }
    setFormError(null);
    setFile(selected);
  };

  const resetForm = () => {
    setForm({ topicId: '', newTopicName: '', title: '', scope: SCOPE_COMMON, departmentId: '' });
    setFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!form.topicId) {
      setFormError('Vui lòng chọn chủ đề.');
      return;
    }
    if (form.topicId === NEW_TOPIC && !form.newTopicName.trim()) {
      setFormError('Vui lòng nhập tên chủ đề mới.');
      return;
    }
    if (!file) {
      setFormError('Vui lòng chọn file tài liệu (PDF, Word hoặc Excel).');
      return;
    }
    if (form.scope === SCOPE_DEPARTMENT && !form.departmentId) {
      setFormError('Vui lòng chọn phòng ban cho tài liệu riêng.');
      return;
    }

    setSubmitting(true);
    try {
      let topicId = form.topicId;
      if (topicId === NEW_TOPIC) {
        // Tài liệu cần chủ đề có thật trong hệ thống → tạo chủ đề trước. Nếu bước đăng file lỗi, chủ đề đã tạo được chọn sẵn
        // để bấm đăng lại không bị báo trùng.
        const created = await createTopic({ name: form.newTopicName.trim() });
        topicId = created._id;
        setTopics((prev) => (prev.some((t) => t._id === topicId) ? prev : [...prev, created]));
        setForm((f) => ({ ...f, topicId, newTopicName: '' }));
      }
      await uploadStudyDocument({
        topicId,
        title: form.title,
        scope: form.scope,
        departmentId: form.scope === SCOPE_DEPARTMENT ? form.departmentId : undefined,
        file,
      });
      setNotice('Đăng tài liệu thành công.');
      resetForm();
      loadAll();
    } catch (err) {
      setFormError(err?.message || 'Đăng tài liệu thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreview = async (doc) => {
    setBusyId(doc._id);
    setError(null);
    try {
      await previewStudyDocument(doc._id);
    } catch (err) {
      setError(err?.message || 'Không thể mở tài liệu.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (doc) => {
    setBusyId(doc._id);
    setError(null);
    try {
      await downloadStudyDocument(doc._id, doc.originalFileName || doc.title);
    } catch (err) {
      setError(err?.message || 'Không thể tải tài liệu.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc) => {
    const ok = await confirmAction(
      `Gỡ tài liệu "${doc.title}"? Thí sinh sẽ không còn xem được tài liệu này.`,
      { title: 'Gỡ tài liệu', confirmLabel: 'Gỡ tài liệu' }
    );
    if (!ok) return;
    setBusyId(doc._id);
    setError(null);
    try {
      await deleteStudyDocument(doc._id);
      setNotice('Đã gỡ tài liệu.');
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
    } catch (err) {
      setError(err?.message || 'Không thể gỡ tài liệu.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Form đăng tài liệu */}
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với BackupTab.jsx bên Admin. */}
      <div className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-[#E2E8F0] overflow-hidden" style={{ '--stagger-delay': '0ms' }}>
        <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F6F8FA]">
          <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-[#008BC5]" />
            Đăng tài liệu ôn tập mới
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {formError && (
            <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-start gap-2.5 text-base">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#E53E3E]" />
              <span>{formError}</span>
            </div>
          )}
          {notice && (
            <div className="p-3 bg-[#F0FDF4] border border-[#22C55E]/30 text-[#0F172A] rounded-lg flex items-start gap-2.5 text-base">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#22C55E]" />
              <span>{notice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold text-[#0F172A] mb-1.5">
                Chủ đề <span className="text-[#E53E3E]">*</span>
              </label>
              <Select
                value={form.topicId}
                onChange={(val) => setForm((f) => ({ ...f, topicId: val }))}
                placeholder="— Chọn chủ đề —"
                options={[
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
                triggerClassName="w-full min-h-[48px] px-3 text-base text-[#0F172A] border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#008BC5] focus:ring-[3px] focus:ring-[#008BC5]/15"
              />
              {form.topicId === NEW_TOPIC && (
                <input
                  type="text"
                  maxLength={100}
                  autoFocus
                  value={form.newTopicName}
                  onChange={(e) => setForm((f) => ({ ...f, newTopicName: e.target.value }))}
                  placeholder="Nhập tên chủ đề mới, ví dụ: An toàn xe nâng kho"
                  className="w-full min-h-[48px] px-3 text-base text-[#0F172A] border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#008BC5] focus:ring-[3px] focus:ring-[#008BC5]/15 mt-2"
                />
              )}
            </div>

            <div>
              <label className="block text-base font-semibold text-[#0F172A] mb-1.5">
                Tiêu đề tài liệu
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Để trống sẽ dùng tên file"
                className="w-full min-h-[48px] px-3 text-base text-[#0F172A] border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#008BC5] focus:ring-[3px] focus:ring-[#008BC5]/15"
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-[#0F172A] mb-1.5">
                Phạm vi
              </label>
              <Select
                value={form.scope}
                onChange={(val) => setForm((f) => ({ ...f, scope: val, departmentId: '' }))}
                options={[
                  { value: SCOPE_COMMON, label: 'Chung (mọi thí sinh)' },
                  { value: SCOPE_DEPARTMENT, label: 'Riêng theo phòng ban' },
                ]}
                triggerClassName="w-full min-h-[48px] px-3 text-base text-[#0F172A] border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#008BC5] focus:ring-[3px] focus:ring-[#008BC5]/15"
              />
            </div>

            {form.scope === SCOPE_DEPARTMENT && (
              <div>
                <label className="block text-base font-semibold text-[#0F172A] mb-1.5">
                  Phòng ban <span className="text-[#E53E3E]">*</span>
                </label>
                <Select
                  value={form.departmentId}
                  onChange={(val) => setForm((f) => ({ ...f, departmentId: val }))}
                  placeholder="— Chọn phòng ban —"
                  options={departments.map((d) => ({ value: d._id, label: d.name }))}
                  triggerClassName="w-full min-h-[48px] px-3 text-base text-[#0F172A] border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#008BC5] focus:ring-[3px] focus:ring-[#008BC5]/15"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-base font-semibold text-[#0F172A] mb-1.5">
              File tài liệu <span className="text-[#E53E3E]">*</span>
            </label>
            <div className="rounded-[10px] border-[1.5px] border-dashed border-[#CBD5E1] bg-[#F6F8FA] p-3 sm:p-4 space-y-2">
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileChange}
                className="w-full text-base text-[#334155] file:mr-3 file:min-h-[48px] file:px-5 file:rounded-[10px] file:border-0 file:bg-[#008BC5] file:text-white file:font-semibold hover:file:bg-[#0693E3] file:cursor-pointer cursor-pointer"
              />
              {file && (
                <p className="flex items-start gap-2 text-base font-semibold text-[#0F172A] break-words">
                  <FileText className="w-5 h-5 text-[#008BC5] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{file.name} ({formatFileSize(file.size)})</span>
                </p>
              )}
            </div>
            <p className="text-sm text-[#334155] mt-2">
              Định dạng: PDF (.pdf), Word (.docx), Excel (.xlsx) — tối đa 20MB. Không nhận .doc, .xls cũ.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto min-h-[48px] px-6 bg-[#008BC5] hover:bg-[#0693E3] active:bg-[#006BA1] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-base rounded-[10px] transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            <span>{submitting ? 'Đang đăng tài liệu...' : 'Đăng tài liệu'}</span>
          </button>
        </form>
      </div>

      {/* Danh sách tài liệu đã đăng */}
      <div className="animate-fade-in-up bg-white rounded-xl shadow-z176 border border-[#E2E8F0] overflow-hidden" style={{ '--stagger-delay': '80ms' }}>
        <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F6F8FA]">
          <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#008BC5]" />
            Tài liệu đã đăng{!loading && !error && documents.length > 0 && <span className="text-base font-semibold text-[#334155]">({documents.length})</span>}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#334155]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Đang tải dữ liệu...</span>
          </div>
        ) : error ? (
          <div className="p-5">
            <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-start gap-2.5 text-base">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#E53E3E]" />
              <span>{error}</span>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-[#334155] text-base">
            Chưa có tài liệu nào được đăng.
          </div>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {documents.map((doc) => {
              const btn = 'flex-1 lg:flex-none min-h-[48px] px-4 inline-flex items-center justify-center gap-2 text-base font-semibold rounded-[10px] border-[1.5px] disabled:opacity-40 transition-colors';
              return (
                <li key={doc._id} className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-[10px] bg-[#EAF6FF] flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6 text-[#008BC5]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#0F172A] text-base break-words">{doc.title}</h3>
                      <p className="text-base text-[#334155] break-words">{doc.topicId?.name || '—'}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#334155]">
                        <span
                          className={`px-2.5 py-0.5 rounded-lg border font-semibold ${
                            doc.scope === SCOPE_DEPARTMENT ? 'bg-[#EAF6FF] text-[#008BC5] border-[#008BC5]/30' : 'bg-[#F6F8FA] text-[#334155] border-[#E2E8F0]'
                          }`}
                        >
                          {doc.scope === SCOPE_DEPARTMENT ? `Riêng: ${doc.departmentId?.name || '—'}` : 'Chung'}
                        </span>
                        <span>{formatDateTime(doc.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {isPdf(doc) && (
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={busyId === doc._id}
                        className={`${btn} text-[#008BC5] border-[#008BC5] hover:bg-[#F0F9FF]`}
                        title="Xem trực tiếp"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                        <span>Xem</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={busyId === doc._id}
                      className={`${btn} text-[#334155] border-[#CBD5E1] hover:bg-[#F6F8FA]`}
                      title="Tải về"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>Tải về</span>
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={busyId === doc._id}
                      className={`${btn} text-[#C53030] border-[#E53E3E] hover:bg-[#FEECEC]`}
                      title="Gỡ tài liệu"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      <span>Gỡ</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};