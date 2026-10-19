import { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, ClipboardCheck, Search, Plus, Edit2, Trash2, Loader2, X, Upload, Download, ChevronLeft, ChevronRight, ChevronDown, AlertCircle, AlertTriangle, CheckSquare, Square, Image as ImageIcon, FileSpreadsheet, FilterX, ArrowRightLeft } from 'lucide-react';
import { fetchQuestions, fetchTopics, fetchDepartments, createQuestion, updateQuestion, deleteQuestion, previewImportQuestions, confirmImportQuestionsExcel, previewImportQuestionsWord, confirmImportQuestionsWord, bulkDeleteQuestions, bulkMoveQuestionsUsage, uploadQuestionImage } from '../../services/examiner.service';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';

// Mục đích sử dụng câu hỏi: ngân hàng THI CHÍNH THỨC (bí mật) hoặc ôn tập (thí sinh thấy đáp án khi luyện)
const USAGE_LABEL = { exam: 'Thi chính thức', practice: 'Ôn tập' };

// MỚI — Dropdown tự dựng dùng chung, thay cho toàn bộ thẻ <select> native
// trong file này. Danh sách xổ xuống của <select> do OS/trình duyệt tự vẽ,
// không bị ràng buộc bởi layout của trang/modal cha nên hay bị tràn ra
// ngoài khung chứa hoặc lệch khỏi màn hình trên mobile. Component này tự đo
// khoảng trống còn lại trong viewport để quyết định mở xuống hay lật lên
// trên, và luôn giới hạn width/height trong phạm vi màn hình.
// options: [{ value, label }]; triggerClassName để giữ nguyên style/kích
// thước riêng của từng chỗ dùng (khác nhau giữa ô lọc và ô trong form).
function Select({ value, options, onChange, placeholder = '-- Chọn --', disabled = false, triggerClassName = '' }) {
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
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`text-left relative ${triggerClassName} ${disabled ? 'disabled:bg-slate-50 disabled:text-slate-400 cursor-not-allowed' : ''}`}
        style={{ color: disabled ? '#94A3B8' : value ? undefined : '#64748B' }}
      >
        <span className="block truncate pr-6">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && !disabled && (
        <div
          className={`absolute z-20 w-full overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg py-1 ${
            menuStyle.placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${menuStyle.maxHeight}px` }}
          data-lenis-prevent
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3.5 min-h-[40px] flex items-center text-sm"
              style={value === opt.value ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// MỚI — Ảnh minh hoạ chỉ nhận JPG / PNG. Chọn tệp khác (kể cả khi chọn "Tất cả tệp" trong hộp thoại) -> cảnh báo đỏ và khóa nút Lưu.
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png'];
const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png'];

// Trả về chuỗi rỗng nếu hợp lệ, ngược lại trả về thông báo lỗi tiếng Việt. Kiểm tra cả đuôi tệp lẫn MIME
// để chặn tệp đổi đuôi (vd .gif đổi tên thành .png).
function validateImageFile(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const extOk = ALLOWED_IMAGE_EXT.includes(ext);
  const mimeOk = !file.type || ALLOWED_IMAGE_MIME.includes(file.type);
  if (extOk && mimeOk) return '';
  return `Tệp "${file.name}" không đúng định dạng. Chỉ chấp nhận ảnh JPG hoặc PNG.`;
}

// MỚI — Giá trị ban đầu của form từ một câu hỏi (hàm thuần): dùng chung cho cửa sổ sửa (modal), khung sửa nhanh
// bên phải và để so sánh phát hiện thay đổi chưa lưu.
function buildFormValues(q) {
  const answers = q.answers.map((a) => ({ id: a.id, content: a.content, isCorrect: a.isCorrect }));
  // Luôn có ít nhất 4 ô phương án để bố cục form cân đối
  while (answers.length < 4) answers.push({ content: '', isCorrect: false });
  return {
    content: q.content,
    questionKind: q.questionKind || 'theory',
    answerType: q.answerType || 'single',
    difficulty: q.difficulty || 'easy',
    scope: q.scope || 'Common',
    usage: q.usage || 'exam',
    topicId: q.topicId || '',
    departmentId: q.departmentId || '',
    imageUrl: q.imageUrl || '',
    imageCloudinaryId: q.imageCloudinaryId || '',
    answers,
  };
}

// Chữ ký để so sánh form hiện tại với bản đã tải (phát hiện thay đổi chưa lưu)
const formSignature = (v) =>
  JSON.stringify({
    content: v.content,
    questionKind: v.questionKind,
    answerType: v.answerType,
    difficulty: v.difficulty,
    scope: v.scope,
    usage: v.usage,
    topicId: v.topicId,
    departmentId: v.departmentId,
    imageCloudinaryId: v.imageCloudinaryId,
    answers: v.answers.map((a) => [a.content, Boolean(a.isCorrect)]),
  });

// MỚI — Màn hình desktop (từ 1024px, trùng breakpoint `lg:` của Tailwind). Mobile/tablet giữ nguyên cách sửa bằng cửa sổ.
function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return matches;
}

export const QuestionBankTab = ({ initialFilter } = {}) => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  // Filters State
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedScope, setSelectedScope] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedAnswerType, setSelectedAnswerType] = useState('');
  // Lọc theo ngân hàng: '' = tất cả, 'exam' = thi chính thức, 'practice' = ôn tập
  const [selectedUsage, setSelectedUsage] = useState('');
  const [usageCounts, setUsageCounts] = useState(null); // { exam, practice } do server trả kèm danh sách

  // Chọn nhiều câu hỏi (checkbox) để xóa hàng loạt. Reset mỗi khi đổi trang/
  // bộ lọc để tránh giữ id của câu hỏi không còn hiển thị trên màn hình.
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Import Excel (bulk) state — 2 bước: preview (xem trước, chưa ghi DB) rồi
  // confirm (ghi thật) — xem handleImportFile / handleConfirmImport bên dưới.
  const [showImportGuide, setShowImportGuide] = useState(false);
  // Ngân hàng đích của lần import này ('exam' | 'practice'). null = chưa chọn -> chưa cho tải file
  const [importUsage, setImportUsage] = useState(null);
  // Loại file đang import: 'excel' (mặc định, giữ nguyên hành vi cũ) hoặc 'word' (.docx)
  const [importFileKind, setImportFileKind] = useState('excel');
  // Các câu Word dùng cách đánh dấu đáp án đúng THIỂU SỐ trong file (vd file toàn
  // gạch chân nhưng vài câu lại dùng *) cần xác nhận lại: { [soCau]: number[] đáp án đúng đã chọn }
  const [reviewOverrides, setReviewOverrides] = useState({});

  useScrollLock(isFormOpen || isImportOpen || showImportGuide);
  const [importLoading, setImportLoading] = useState(false); // đang upload + phân tích file (bước preview)
  const [importPreview, setImportPreview] = useState(null); // { token, totalRows, readyCount, duplicateCount, errorCount, missingDepartments, duplicates, ready, errors }
  const [importConfirming, setImportConfirming] = useState(false); // đang ghi thật (bước confirm)
  // Bản nháp các phòng ban còn thiếu: mỗi phần tử = { name, code, description,
  // include, codeLocked, descriptionLocked, rowCount }. codeLocked/descriptionLocked
  // = true khi giá trị đã lấy sẵn được từ file Excel -> không cho sửa tay.
  const [deptDrafts, setDeptDrafts] = useState([]);
  const [keepDupRows, setKeepDupRows] = useState([]); // rowIndex của các dòng trùng mà người dùng chọn "vẫn thêm mới"

  // Form State
  const [content, setContent] = useState('');
  const [questionKind, setQuestionKind] = useState('theory');
  const [answerType, setAnswerType] = useState('single');
  const [difficulty, setDifficulty] = useState('easy');
  const [scope, setScope] = useState('Common');
  const [usage, setUsage] = useState('exam'); // ngân hàng của câu hỏi trong form
  const [topicId, setTopicId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageCloudinaryId, setImageCloudinaryId] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  // Tệp ảnh đã chọn sai định dạng (khác JPG/PNG): hiện cảnh báo đỏ và khóa nút Lưu cho tới khi chọn lại tệp hợp lệ
  const [imageFormatError, setImageFormatError] = useState('');

  // Khung sửa nhanh bên phải (CHỈ desktop): id câu hỏi đang mở; null = đóng. Dùng chung state form với cửa sổ sửa (modal).
  const [panelQuestionId, setPanelQuestionId] = useState(null);
  const [panelError, setPanelError] = useState('');
  const baselineRef = useRef(''); // chữ ký form lúc mở khung, để biết có thay đổi chưa lưu không
  const isDesktop = useIsDesktop();
  const showPanel = isDesktop && panelQuestionId !== null;
  const [answers, setAnswers] = useState([
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false }
  ]);

  // Giữ giá trị `search` mới nhất trong 1 ref — để loadData bên dưới luôn đọc
  // được search hiện tại mà KHÔNG cần liệt kê `search` vào dependency của
  // useCallback (đọc qua ref không kích hoạt exhaustive-deps). Nhờ vậy tránh
  // được việc gõ tìm kiếm làm loadData đổi tham chiếu -> effect tự chạy lại
  // theo từng phím gõ; ô tìm kiếm vẫn chỉ tải lại khi bấm tìm/enter
  // (xem handleSearchSubmit bên dưới).
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // useCallback: giữ nguyên tham chiếu hàm loadData giữa các lần render (chỉ
  // đổi khi 1 trong các filter dưới đây đổi) — để useEffect kế tiếp có thể
  // khai báo loadData vào dependency array mà không gây loop vô hạn.
  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const [questionsRes, topicsData, deptsData] = await Promise.all([
        fetchQuestions({
          page,
          limit: 10,
          search: searchRef.current,
          topicId: selectedTopic,
          scope: selectedScope,
          departmentId: selectedDept,
          difficulty: selectedDifficulty,
          answerType: selectedAnswerType,
          usage: selectedUsage
        }),
        fetchTopics({ withCounts: true }),
        fetchDepartments()
      ]);
      setQuestions(questionsRes.items);
      setPagination(questionsRes.pagination);
      setUsageCounts(questionsRes.usageCounts || null);
      setTopics(topicsData);
      setDepartments(deptsData);
      return questionsRes.items;
    } catch (err) {
      setError(err.message || 'Lỗi tải ngân hàng câu hỏi');
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedTopic, selectedScope, selectedDept, selectedDifficulty, selectedAnswerType, selectedUsage]);

  // Chủ đề có câu hỏi ở ngân hàng `usage` không? Server trả kèm topic.questionCounts { exam, practice }
  // (xem fetchTopics({ withCounts: true })). Thiếu questionCounts (server cũ) -> coi là có, không ẩn nhầm.
  const topicHasUsage = (topic, usage) => !topic?.questionCounts || (topic.questionCounts[usage] ?? 0) > 0;

  // Ô lọc "Chủ đề": tab Tất cả -> mọi chủ đề; tab Thi chính thức/Ôn tập -> chỉ chủ đề có câu thuộc tab đó.
  const filterTopics = selectedUsage ? topics.filter((t) => topicHasUsage(t, selectedUsage)) : topics;

  // Đổi tab ngân hàng: nếu chủ đề đang chọn không có câu ở tab mới thì bỏ chọn chủ đề luôn (cùng 1 lần tải, không bị flash 0 câu).
  const handleUsageChange = (value) => {
    setSelectedUsage(value);
    if (value && selectedTopic) {
      const current = topics.find((t) => t._id === selectedTopic);
      if (current && !topicHasUsage(current, value)) setSelectedTopic('');
    }
  };

  // Chủ đề đang chọn không còn câu nào ở tab hiện tại (vd vừa chuyển hết câu sang ngân hàng kia) -> bỏ chọn thay vì hiện 0 câu.
  useEffect(() => {
    if (!selectedUsage || !selectedTopic) return;
    const current = topics.find((t) => t._id === selectedTopic);
    if (current && !topicHasUsage(current, selectedUsage)) setSelectedTopic('');

  }, [selectedUsage, selectedTopic, topics]);

  useEffect(() => {
    setSelectedIds([]);
    loadData(1);
  }, [selectedTopic, selectedScope, selectedDept, selectedDifficulty, selectedAnswerType, selectedUsage, loadData]);

  // Khi nhận filter từ bên ngoài (vd bấm "Xem câu hỏi" trên 1 thẻ chủ đề ở
  // tab Chủ đề, hoặc trên 1 thẻ bộ phận ở tab Bộ phận/Phòng ban), áp filter
  // đó vào ngân hàng câu hỏi. Dùng initialFilter?.ts (mốc thời gian) trong
  // dependency thay vì chỉ topicId/departmentId, để nếu người dùng bấm lại
  // đúng mục vừa xem, effect vẫn chạy lại (đảm bảo tab luôn được kéo về
  // đúng trạng thái đã lọc, kể cả khi giữa chừng người dùng đã tự đổi filter
  // khác đi).
  useEffect(() => {
    if (!initialFilter?.ts) return;
    if (initialFilter.topicId) {
      setSelectedTopic(initialFilter.topicId);
      // Chỉ giữ tab Thi chính thức/Ôn tập nếu chủ đề này chắc chắn có câu ở tab đó; nếu không thì về "Tất cả".
      if (selectedUsage) {
        const target = topics.find((t) => t._id === initialFilter.topicId);
        if (!target || !topicHasUsage(target, selectedUsage)) setSelectedUsage('');
      }
    }
    if (initialFilter.departmentId) {
      // Bấm "Xem câu hỏi" từ 1 bộ phận cụ thể -> chỉ muốn xem câu hỏi RIÊNG
      // của đúng bộ phận đó, không lẫn câu hỏi Chung -> khóa luôn scope, và
      // bỏ filter Chủ đề đang chọn dở (nếu có) để không lọc chồng nhầm ý.
      setSelectedTopic('');
      setSelectedDept(initialFilter.departmentId);
      setSelectedScope('DepartmentSpecific');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter?.topicId, initialFilter?.departmentId, initialFilter?.ts]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData(1);
  };

  const handleOpenAdd = async () => {
    if (!(await confirmDiscardPanelChanges())) return;
    setPanelQuestionId(null);
    setImageFormatError('');
    setEditingQuestion(null);
    setContent('');
    setQuestionKind('theory');
    setAnswerType('single');
    setDifficulty('easy');
    setScope('Common');
    // Đang xem tab Ôn tập thì câu mới mặc định thuộc Ôn tập, ngược lại là Thi chính thức
    setUsage(selectedUsage === 'practice' ? 'practice' : 'exam');
    setTopicId('');
    setDepartmentId('');
    setImageUrl('');
    setImageCloudinaryId('');
    setImagePreviewUrl('');
    setAnswers([
      { content: '', isCorrect: false },
      { content: '', isCorrect: false },
      { content: '', isCorrect: false },
      { content: '', isCorrect: false }
    ]);
    setIsFormOpen(true);
  };

  // Nạp một câu hỏi vào các state của form (dùng cho cả cửa sổ sửa và khung sửa nhanh bên phải)
  const fillFormFromQuestion = (q) => {
    const v = buildFormValues(q);
    setEditingQuestion(q);
    setContent(v.content);
    setQuestionKind(v.questionKind);
    setAnswerType(v.answerType);
    setDifficulty(v.difficulty);
    setScope(v.scope);
    setUsage(v.usage);
    setTopicId(v.topicId);
    setDepartmentId(v.departmentId);
    setImageUrl(v.imageUrl);
    setImageCloudinaryId(v.imageCloudinaryId);
    setImagePreviewUrl(v.imageUrl);
    setImageFormatError('');
    setAnswers(v.answers);
  };

  // Giá trị form hiện tại (đọc từ state) để so sánh với bản đã tải
  const currentFormValues = () => ({
    content, questionKind, answerType, difficulty, scope, usage, topicId, departmentId, imageCloudinaryId, answers,
  });

  const isPanelDirty = () => panelQuestionId !== null && formSignature(currentFormValues()) !== baselineRef.current;

  // Khung sửa nhanh đang có thay đổi chưa lưu thì hỏi lại trước khi bỏ. Trả về true nếu được phép tiếp tục.
  const confirmDiscardPanelChanges = async () => {
    if (!isPanelDirty()) return true;
    return confirmAction(
      'Câu hỏi đang sửa ở khung bên phải có thay đổi chưa lưu. Tiếp tục sẽ mất các thay đổi này.',
      { title: 'Thay đổi chưa được lưu', confirmLabel: 'Bỏ thay đổi' }
    );
  };

  // Cây bút: vẫn mở cửa sổ chỉnh sửa như cũ (mobile và desktop đều dùng được)
  const handleOpenEdit = async (q) => {
    if (!(await confirmDiscardPanelChanges())) return;
    setPanelQuestionId(null);
    fillFormFromQuestion(q);
    setIsFormOpen(true);
  };

  // MỚI (desktop) — Bấm vào một câu hỏi trong danh sách: mở khung sửa nhanh bên phải (4/10), danh sách thu còn 6/10.
  const handleSelectQuestion = async (q) => {
    if (!isDesktop || isFormOpen) return;
    if (window.getSelection?.()?.toString()) return; // đang bôi đen chữ để sao chép -> không mở
    if (panelQuestionId === q.id) return;
    if (!(await confirmDiscardPanelChanges())) return;
    fillFormFromQuestion(q);
    baselineRef.current = formSignature(buildFormValues(q));
    setPanelQuestionId(q.id);
    setPanelError('');
    setError('');
  };

  const handleClosePanel = async () => {
    if (!(await confirmDiscardPanelChanges())) return;
    setPanelQuestionId(null);
    setEditingQuestion(null);
    setPanelError('');
    setImageFormatError('');
  };

  // Lỗi của form hiển thị ngay trong khung sửa nhanh (nếu đang mở), ngược lại giữ banner đầu trang như cũ
  const reportFormError = (message) => {
    if (showPanel) setPanelError(message);
    else setError(message);
  };

  const handleAnswerChange = (index, field, value) => {
    const nextAnswers = [...answers];
    if (field === 'isCorrect' && answerType === 'single') {
      // Toggle all others off
      nextAnswers.forEach((ans, i) => {
        ans.isCorrect = i === index ? value : false;
      });
    } else {
      nextAnswers[index][field] = value;
    }
    setAnswers(nextAnswers);
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Sai định dạng (khác JPG/PNG): không tải lên, hiện cảnh báo đỏ và khóa nút Lưu. Giữ nguyên ảnh đang có (nếu có).
    const formatProblem = validateImageFile(file);
    if (formatProblem) {
      setImageFormatError(formatProblem);
      return;
    }
    setImageFormatError('');

    const localPreview = URL.createObjectURL(file);
    setImagePreviewUrl(localPreview);
    setImageUploading(true);
    if (showPanel) setPanelError(''); else setError('');
    try {
      const res = await uploadQuestionImage(file);
      setImageUrl(res.imageUrl);
      setImageCloudinaryId(res.imageCloudinaryId);
      setImagePreviewUrl(res.imageUrl);
    } catch (err) {
      reportFormError(err.message || 'Lỗi khi tải ảnh lên');
      setImagePreviewUrl(imageUrl || '');
    } finally {
      setImageUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleRemoveImage = () => {
    setImageFormatError('');
    setImageUrl('');
    setImageCloudinaryId('');
    setImagePreviewUrl('');
  };

  const addAnswerField = () => {
    if (answers.length >= 8) return; // Limit to 8 options
    setAnswers([...answers, { content: '', isCorrect: false }]);
  };

  const removeAnswerField = (index) => {
    if (answers.length <= 2) return; // Keep at least 2 options
    setAnswers(answers.filter((_, i) => i !== index));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (imageUploading || imageFormatError) return;
    if (!topicId) {
      reportFormError('Vui lòng chọn chủ đề liên kết');
      return;
    }
    if (scope === 'DepartmentSpecific' && !departmentId) {
      reportFormError('Vui lòng chọn bộ phận liên kết');
      return;
    }

    const filteredAnswers = answers.filter(a => a.content.trim() !== '');
    if (filteredAnswers.length < 2) {
      reportFormError('Vui lòng điền ít nhất 2 phương án trả lời');
      return;
    }

    const correctCount = filteredAnswers.filter(a => a.isCorrect).length;
    if (answerType === 'single' && correctCount !== 1) {
      reportFormError('Vui lòng chọn duy nhất 1 đáp án đúng cho câu hỏi Một đáp án.');
      return;
    }
    if (answerType === 'multiple' && correctCount < 1) {
      reportFormError('Vui lòng chọn ít nhất 1 đáp án đúng cho câu hỏi Nhiều đáp án.');
      return;
    }

    setActionLoading(true);
    setError('');
    setPanelError('');
    const payload = {
      content,
      questionKind,
      answerType,
      difficulty,
      scope,
      usage,
      topicId,
      departmentId: scope === 'DepartmentSpecific' ? departmentId : undefined,
      answers: filteredAnswers
    };

    if (editingQuestion) {
      // Chỉ gửi imageUrl/imageCloudinaryId khi có thay đổi so với câu hỏi
      // gốc — gửi null nghĩa là "gỡ/thay ảnh, xoá ảnh cũ trên Cloudinary",
      // không gửi nghĩa là "giữ nguyên ảnh hiện có" (backend không đụng field).
      const originalCloudinaryId = editingQuestion.imageCloudinaryId || '';
      if (imageCloudinaryId !== originalCloudinaryId) {
        payload.imageUrl = imageUrl || null;
        payload.imageCloudinaryId = imageCloudinaryId || null;
      }
    } else {
      payload.imageUrl = imageUrl || undefined;
      payload.imageCloudinaryId = imageCloudinaryId || undefined;
    }

    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, payload);
      } else {
        await createQuestion(payload);
      }
      if (showPanel) {
        // Khung sửa nhanh: giữ khung mở, nạp lại câu hỏi vừa lưu từ danh sách mới để lần lưu sau so sánh ảnh/đáp án đúng
        const items = await loadData(pagination.page);
        const fresh = items?.find((x) => x.id === panelQuestionId);
        if (fresh) {
          fillFormFromQuestion(fresh);
          baselineRef.current = formSignature(buildFormValues(fresh));
          showToast('Đã lưu câu hỏi.', 'success');
        } else {
          // Câu hỏi không còn nằm trong danh sách đang lọc (vd đổi ngân hàng) -> đóng khung
          setPanelQuestionId(null);
          setEditingQuestion(null);
          showToast('Đã lưu câu hỏi. Câu này không còn nằm trong bộ lọc hiện tại nên khung chỉnh sửa đã đóng.', 'success');
        }
      } else {
        setIsFormOpen(false);
        await loadData(pagination.page);
      }
    } catch (err) {
      reportFormError(err.message || 'Lỗi khi lưu câu hỏi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction('Bạn có chắc chắn muốn ngừng sử dụng câu hỏi này?', { title: 'Ngừng sử dụng câu hỏi', confirmLabel: 'Ngừng sử dụng' });
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      await deleteQuestion(id);
      if (panelQuestionId === id) {
        setPanelQuestionId(null);
        setEditingQuestion(null);
      }
      await loadData(pagination.page);
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa câu hỏi';
      setError(message);
      // Thêm toast lỗi song song với banner (đồng bộ pattern TopicTab.jsx) —
      // lỗi bị CHẶN (vd câu hỏi đang dùng cho kỳ thi published) cần nổi bật
      // ngay, tránh người dùng chỉ thấy nút hết loading rồi tưởng đã ngừng
      // sử dụng thành công mà không để ý banner ở đầu trang (đặc biệt khi
      // danh sách câu hỏi dài, banner nằm trên cùng dễ bị lướt qua).
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allOnPageSelected = questions.length > 0 && questions.every((q) => selectedIds.includes(q.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !questions.some((q) => q.id === id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...questions.map((q) => q.id)])]);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng ${selectedIds.length} câu hỏi đã chọn?`,
      { title: 'Ngừng sử dụng câu hỏi đã chọn', confirmLabel: 'Ngừng sử dụng' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkDeleteQuestions({ ids: selectedIds });
      setSelectedIds([]);
      await loadData(1);
      // res.skippedActiveExam khác null khi có câu hỏi bị GIỮ LẠI vì đang
      // dùng cho kỳ thi published (xem question.service.js/deactivateManyQuestions)
      // — dùng 'warning' (vàng) thay vì 'success' (xanh) vì đây không phải
      // thành công hoàn toàn như người dùng mong đợi khi chọn N câu để xóa.
      if (res.skippedActiveExam) {
        showToast(
          `Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi. Giữ lại ${res.skippedActiveExam.skippedCount} câu vì đang được dùng cho kỳ thi "${res.skippedActiveExam.examTitle}" đang diễn ra — vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
          'warning',
        );
      } else {
        showToast(`Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi.`, 'success');
      }
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa hàng loạt câu hỏi';
      setError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Chuyển các câu đã chọn (trong trang hiện tại) sang ngân hàng khác.
  // - Sang ÔN TẬP: thí sinh sẽ thấy đáp án, câu không còn dùng cho thi chính thức.
  // - Sang THI: câu có thể đã hiện đáp án cho thí sinh khi ôn tập -> cảnh báo về tính công bằng.
  // Gọi 1 lần endpoint bulk-move-usage với danh sách ID; server chặn CẢ thao tác nếu chuyển sang Ôn tập mà có câu thuộc chủ đề đang có kỳ thi phát hành.
  const handleMoveUsage = async (target) => {
    const toMove = questions.filter((q) => selectedIds.includes(q.id) && (q.usage || 'exam') !== target);
    if (toMove.length === 0) {
      showToast(`Các câu đã chọn đều đang thuộc ngân hàng ${USAGE_LABEL[target]}.`, 'warning');
      return;
    }
    const message =
      target === 'practice'
        ? `Chuyển ${toMove.length} câu sang ngân hàng ÔN TẬP? Thí sinh sẽ thấy đáp án đúng khi luyện tập, và các câu này sẽ KHÔNG còn được dùng để tạo mã đề thi chính thức. Nếu chủ đề đang có kỳ thi phát hành, thao tác sẽ bị chặn.`
        : `Chuyển ${toMove.length} câu sang ngân hàng THI CHÍNH THỨC? Nếu thí sinh đã từng ôn tập các câu này thì họ có thể đã biết đáp án, ảnh hưởng đến tính công bằng của kỳ thi.`;
    const ok = await confirmAction(message, {
      title: `Chuyển sang ${USAGE_LABEL[target]}`,
      confirmLabel: `Chuyển sang ${USAGE_LABEL[target]}`,
      cancelLabel: 'Không chuyển',
    });
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkMoveQuestionsUsage({
        ids: toMove.map((q) => q.id),
        targetUsage: target,
      });
      setSelectedIds([]);
      await loadData(1);
      showToast(`Đã chuyển ${res.movedCount} câu sang ngân hàng ${USAGE_LABEL[target]}.`, 'success');
    } catch (err) {
      // Bị chặn (vd kỳ thi đang diễn ra) -> không chuyển câu nào, giữ nguyên lựa chọn để người dùng xử lý
      const msg = err.message || 'Lỗi khi chuyển câu hỏi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Xóa TOÀN BỘ câu hỏi khớp đúng bộ lọc đang áp dụng trên UI (không giới
  // hạn theo trang hiện tại) — tiện cho việc dọn dữ liệu test/trùng lặp.
  // Backend sẽ tự chặn nếu chưa chọn bộ lọc cụ thể nào (tránh xóa nhầm toàn
  // bộ ngân hàng câu hỏi).
  const handleDeleteAllByFilter = async () => {
    const hasFilter = selectedTopic || selectedScope || selectedDept || selectedDifficulty || selectedAnswerType || search.trim();
    if (!hasFilter) {
      showToast('Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó, hình thức đáp án hoặc từ khóa tìm kiếm) trước khi xóa tất cả, để tránh xóa nhầm toàn bộ ngân hàng câu hỏi.', 'warning');
      return;
    }
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng TẤT CẢ ${pagination.total} câu hỏi đang khớp bộ lọc hiện tại (không chỉ trang này)? Hành động này áp dụng cho toàn bộ kết quả lọc, không thể hoàn tác qua giao diện.`,
      { title: 'Ngừng sử dụng tất cả theo bộ lọc', confirmLabel: 'Ngừng sử dụng tất cả' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkDeleteQuestions({
        filters: {
          topicId: selectedTopic,
          scope: selectedScope,
          departmentId: selectedDept,
          difficulty: selectedDifficulty,
          answerType: selectedAnswerType,
          usage: selectedUsage,
          search,
        },
      });
      setSelectedIds([]);
      await loadData(1);
      if (res.skippedActiveExam) {
        showToast(
          `Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi khớp bộ lọc. Giữ lại ${res.skippedActiveExam.skippedCount} câu vì đang được dùng cho kỳ thi "${res.skippedActiveExam.examTitle}" đang diễn ra — vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
          'warning',
        );
      } else {
        showToast(`Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi khớp bộ lọc.`, 'success');
      }
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa tất cả theo bộ lọc';
      setError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Có bộ lọc nào đang áp dụng không (kể cả tab ngân hàng và ô tìm kiếm) -> bật nút "Xóa bộ lọc"
  const hasAnyFilter = Boolean(
    selectedTopic || selectedScope || selectedDept || selectedDifficulty || selectedAnswerType || selectedUsage || search.trim(),
  );

  // Đưa toàn bộ bộ lọc (chủ đề, phạm vi, bộ phận, độ khó, hình thức đáp án, tab ngân hàng, từ khóa) về mặc định.
  // Các bộ lọc dạng select đổi -> effect ở trên tự tải lại trang 1; riêng ô tìm kiếm không nằm trong dependency
  // của effect nên nếu chỉ có từ khóa thì phải tự gọi loadData.
  const handleClearFilters = () => {
    const selectFilterActive = Boolean(
      selectedTopic || selectedScope || selectedDept || selectedDifficulty || selectedAnswerType || selectedUsage,
    );
    searchRef.current = '';
    setSearch('');
    setSelectedTopic('');
    setSelectedScope('');
    setSelectedDept('');
    setSelectedDifficulty('');
    setSelectedAnswerType('');
    setSelectedUsage('');
    if (!selectFilterActive) loadData(1);
  };

  // Chuyển TOÀN BỘ câu hỏi khớp bộ lọc hiện tại (không giới hạn trang) sang ngân hàng còn lại.
  // Hướng chuyển suy ra từ tab đang chọn: tab Ôn tập -> sang Thi; tab Thi chính thức -> sang Ôn tập.
  // Server chỉ chuyển câu đang ở ngân hàng nguồn; khi chuyển sang Ôn tập mà có câu thuộc chủ đề đang có kỳ thi phát hành thì CHẶN cả thao tác (409).
  const handleMoveAllByFilter = async () => {
    if (!selectedUsage) {
      showToast('Hãy chọn tab "Thi chính thức" hoặc "Ôn tập" trước để xác định hướng chuyển.', 'warning');
      return;
    }
    const hasSpecificFilter = selectedTopic || selectedScope || selectedDept || selectedDifficulty || selectedAnswerType || search.trim();
    if (!hasSpecificFilter) {
      showToast('Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó, hình thức đáp án hoặc từ khóa) trước khi chuyển tất cả, để tránh chuyển nhầm toàn bộ ngân hàng câu hỏi.', 'warning');
      return;
    }
    const target = selectedUsage === 'practice' ? 'exam' : 'practice';
    const total = pagination.total;
    if (total === 0) {
      showToast(`Không có câu nào khớp bộ lọc để chuyển sang ${USAGE_LABEL[target]}.`, 'warning');
      return;
    }
    const message =
      target === 'practice'
        ? `Chuyển TẤT CẢ ${total} câu đang khớp bộ lọc (không chỉ trang này) sang ngân hàng ÔN TẬP? Thí sinh sẽ thấy đáp án đúng khi luyện tập, và các câu này sẽ KHÔNG còn được dùng để tạo mã đề thi chính thức. Nếu chủ đề đang có kỳ thi phát hành, thao tác sẽ bị chặn.`
        : `Chuyển TẤT CẢ ${total} câu đang khớp bộ lọc (không chỉ trang này) sang ngân hàng THI CHÍNH THỨC? Nếu thí sinh đã từng ôn tập các câu này thì họ có thể đã biết đáp án, ảnh hưởng đến tính công bằng của kỳ thi.`;
    const ok = await confirmAction(message, {
      title: `Chuyển tất cả sang ${USAGE_LABEL[target]}`,
      confirmLabel: `Chuyển ${total} câu`,
      cancelLabel: 'Không chuyển',
    });
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkMoveQuestionsUsage({
        filters: {
          topicId: selectedTopic,
          scope: selectedScope,
          departmentId: selectedDept,
          difficulty: selectedDifficulty,
          answerType: selectedAnswerType,
          usage: selectedUsage,
          search,
        },
        targetUsage: target,
      });
      setSelectedIds([]);
      await loadData(1);
      showToast(`Đã chuyển ${res.movedCount} câu sang ngân hàng ${USAGE_LABEL[target]}.`, 'success');
    } catch (err) {
      const msg = err.message || 'Lỗi khi chuyển tất cả theo bộ lọc';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // BƯỚC 1/2 — Chọn file là phân tích ngay (chưa ghi DB): server trả về
  // phòng ban còn thiếu (để tạo ngay trong modal) và các câu trùng (để chọn
  // giữ câu cũ hay vẫn thêm câu mới).
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!importUsage) {
      setError('Vui lòng chọn nhập vào ngân hàng thi chính thức hay ngân hàng ôn tập trước khi tải file.');
      e.target.value = '';
      return;
    }
    setImportLoading(true);
    setError('');
    try {
      const data =
        importFileKind === 'word'
          ? await previewImportQuestionsWord(file, importUsage)
          : await previewImportQuestions(file, importUsage);
      setImportPreview(data);
      setDeptDrafts(
        (data.missingDepartments || []).map((d) => ({
          name: d.name,
          code: d.code || '',
          description: d.description || '',
          include: true, // mặc định tick tạo hết
          codeLocked: Boolean(d.code),
          descriptionLocked: Boolean(d.description),
          rowCount: d.rowCount || 0,
        })),
      );
      setKeepDupRows([]); // mặc định: câu trùng bị bỏ qua, giữ câu cũ
      // Mặc định mỗi câu cần xác nhận lại giữ nguyên gợi ý của server (= coi "bỏ qua" là chấp nhận gợi ý)
      setReviewOverrides(
        Object.fromEntries((data.needsReview || []).map((r) => [r.row, r.suggestedCorrect])),
      );
      setIsImportOpen(false);
      setShowImportGuide(false);
    } catch (err) {
      setError(err.message || (importFileKind === 'word' ? 'Xem trước file Word thất bại' : 'Xem trước file Excel thất bại'));
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  // Bật/tắt 1 đáp án trong danh sách đáp án đúng của 1 câu đang cần xác nhận lại (needsReview)
  const toggleReviewOption = (row, optionIndex) => {
    setReviewOverrides((prev) => {
      const cur = prev[row] || [];
      const next = cur.includes(optionIndex) ? cur.filter((i) => i !== optionIndex) : [...cur, optionIndex];
      return { ...prev, [row]: next };
    });
  };

  // Đóng cửa sổ chọn file (chưa có bản xem trước): bỏ luôn lựa chọn ngân hàng để lần sau phải chọn lại
  const closeImportModal = () => {
    setIsImportOpen(false);
    setImportUsage(null);
    setImportFileKind('excel');
  };

  const closeImportPreview = () => {
    setImportUsage(null);
    setImportPreview(null);
    setDeptDrafts([]);
    setKeepDupRows([]);
    setReviewOverrides({});
    setImportFileKind('excel');
  };

  const toggleDeptInclude = (name) => {
    setDeptDrafts((prev) => prev.map((d) => (d.name === name ? { ...d, include: !d.include } : d)));
  };

  const updateDeptField = (name, field, value) => {
    setDeptDrafts((prev) => prev.map((d) => (d.name === name ? { ...d, [field]: value } : d)));
  };

  // Số câu hỏi sẽ "cứu" được thêm nhờ các bộ phận đang được tick tạo VÀ đã
  // điền đủ mã + mô tả — dùng để hiển thị đúng số câu trên nút xác nhận,
  // và để chặn xác nhận khi còn thiếu thông tin.
  const includedDeptRowCount = deptDrafts
    .filter((d) => d.include && d.code.trim() && d.description.trim())
    .reduce((sum, d) => sum + d.rowCount, 0);

  const hasIncompleteIncludedDept = deptDrafts.some(
    (d) => d.include && (!d.code.trim() || !d.description.trim()),
  );

  const toggleKeepDupRow = (row) => {
    setKeepDupRows((prev) => (prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]));
  };

  // BƯỚC 2/2 — Xác nhận: tạo các phòng ban đã tick + ghi thật câu hỏi vào DB
  // (câu trùng chỉ được thêm nếu dòng đó nằm trong keepDupRows).
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    // Chặn ngay trên UI: bộ phận đang tick tạo mà chưa nhập đủ mã + mô tả sẽ
    // khiến server lỗi khi tạo phòng ban -> nhắc điền đủ hoặc bỏ tick, thay vì
    // để lỗi bay lên sau khi bấm xác nhận.
    if (hasIncompleteIncludedDept) {
      setError('Vui lòng nhập đủ mã và mô tả cho các bộ phận đang tạo, hoặc bỏ tick "Tạo bộ phận này" để bỏ qua.');
      return;
    }
    // Bước xác nhận cuối: nói rõ số câu và ngân hàng đích, vì nhầm ngân hàng có thể làm lộ đề
    const targetUsage = importPreview.usage || importUsage;
    const totalToImport = importPreview.readyCount + keepDupRows.length + includedDeptRowCount;
    const confirmed = await confirmAction(
      targetUsage === 'practice'
        ? `Bạn sắp thêm ${totalToImport} câu vào ngân hàng ÔN TẬP. Thí sinh sẽ thấy đáp án đúng khi luyện tập. Tiếp tục?`
        : `Bạn sắp thêm ${totalToImport} câu vào ngân hàng THI CHÍNH THỨC (bí mật, dùng để tạo mã đề thi). Tiếp tục?`,
      {
        title: `Nhập vào ngân hàng ${USAGE_LABEL[targetUsage]}`,
        confirmLabel: `Nhập vào ${USAGE_LABEL[targetUsage]}`,
        cancelLabel: 'Kiểm tra lại',
        danger: targetUsage === 'practice',
      },
    );
    if (!confirmed) return;

    setImportConfirming(true);
    setError('');
    try {
      const payload = {
        usage: targetUsage,
        token: importPreview.token,
        createDepartments: deptDrafts
          .filter((d) => d.include)
          .map((d) => ({ name: d.name, code: d.code.trim(), description: d.description.trim() })),
        keepDuplicateRows: keepDupRows,
      };
      const res =
        importFileKind === 'word'
          ? await confirmImportQuestionsWord({ ...payload, correctOverrides: reviewOverrides })
          : await confirmImportQuestionsExcel(payload);
      showToast(
        `Đã thêm vào ngân hàng ${USAGE_LABEL[targetUsage]}: ${res.imported} thành công, ${res.skipped} bỏ qua (trùng), ${res.failed} lỗi.`,
        res.failed > 0 ? 'warning' : 'success',
      );
      setImportUsage(null);
      setImportPreview(null);
      setDeptDrafts([]);
      setKeepDupRows([]);
      setReviewOverrides({});
      await loadData(1);
    } catch (err) {
      setError(err.message || 'Import thất bại (phiên xem trước có thể đã hết hạn, hãy tải file lên lại)');
    } finally {
      setImportConfirming(false);
    }
  };

  // Thân form chỉnh sửa câu hỏi — dùng chung cho cửa sổ (compact = false) và khung sửa nhanh bên phải (compact = true, 1 cột)
  const renderFormFields = (compact) => (
    <>
              <div className={compact ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 lg:grid-cols-12 gap-6'}>
                {/* CỘT TRÁI (6 cột): Nội dung câu hỏi, Mục đích & Ảnh minh họa */}
                <div className={compact ? 'space-y-5' : 'lg:col-span-6 space-y-5'}>
                  {/* Nội dung câu hỏi */}
                  <div>
                    <label className="block text-base font-semibold text-slate-800 mb-1.5">
                      Nội dung câu hỏi <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      placeholder="Nhập nội dung chi tiết của câu hỏi..."
                      rows="4"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full px-4 py-3 text-base font-medium border-2 border-slate-300 rounded-xl focus:outline-none focus:border-[#008BC5] focus:bg-white bg-slate-50/50 leading-relaxed text-slate-900 placeholder:text-slate-400 transition-all"
                    />
                  </div>

                  {/* Mục đích sử dụng */}
                  <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-2.5">
                    <label className="block text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Mục đích sử dụng câu hỏi
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'exam', label: 'Thi chính thức', Icon: ClipboardCheck },
                        { value: 'practice', label: 'Ôn tập tự do', Icon: BookOpen },
                      ].map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setUsage(value)}
                          aria-pressed={usage === value}
                          className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 font-bold text-sm transition-all shadow-xs ${
                            usage === value
                              ? value === 'practice'
                                ? 'border-[#F6AD37] bg-[#FFFBEB] text-[#B45309]'
                                : 'border-[#008BC5] bg-[#EAF6FF] text-[#008BC5]'
                              : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {usage === 'practice'
                        ? '• Ôn tập: Thí sinh sẽ thấy đáp án đúng và lời giải khi tự luyện. Không rút vào đề thi chính thức.'
                        : '• Thi chính thức: Bảo mật cao, chỉ dùng để sinh đề thi khi kỳ thi mở, thí sinh không thể xem trước.'}
                    </p>
                  </div>

                  {/* Ảnh minh hoạ */}
                  <div className={`p-4 border-2 rounded-xl space-y-2.5 ${imageFormatError ? 'bg-red-50/40 border-red-400' : 'bg-slate-50 border-slate-200'}`}>
                    <label className="block text-sm font-bold text-slate-800">
                      Ảnh minh hoạ đề bài (không bắt buộc)
                    </label>
                    <div className="flex items-start gap-3.5">
                      {imagePreviewUrl && (
                        <div className="relative shrink-0">
                          <img
                            src={imagePreviewUrl}
                            alt="Xem trước ảnh câu hỏi"
                            className="w-24 h-24 object-cover rounded-xl border-2 border-slate-300 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-md transition-colors"
                            title="Xóa ảnh này"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          onChange={handleImageFileChange}
                          disabled={imageUploading}
                          className="block w-full text-sm text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-white file:border-slate-300 file:border file:text-slate-700 file:text-sm file:font-semibold hover:file:bg-slate-100 cursor-pointer"
                        />
                        <p className="text-xs text-slate-400 mt-1.5 leading-normal">
                          JPG hoặc PNG, tối đa 10MB. Ảnh hiển thị cùng đề bài câu hỏi.
                        </p>
                        {imageUploading && (
                          <p className="text-xs text-[#008BC5] mt-1.5 flex items-center gap-1 font-semibold">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải ảnh lên hệ thống...
                          </p>
                        )}
                        {imageFormatError && (
                          <div role="alert" className="mt-2 flex items-start gap-2 p-2.5 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700 font-medium">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="break-words">{imageFormatError}</p>
                              <button
                                type="button"
                                onClick={() => setImageFormatError('')}
                                className="mt-1 text-xs font-bold underline hover:text-red-900"
                              >
                                Bỏ tệp này
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (6 cột): Thuộc tính câu hỏi & Các phương án trả lời */}
                <div className={compact ? 'space-y-5' : 'lg:col-span-6 space-y-5'}>
                  {/* Khối thuộc tính phân loại */}
                  <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-3.5">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Phân loại & Thuộc tính
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Chủ đề liên kết *</label>
                        <Select
                          value={topicId}
                          onChange={setTopicId}
                          placeholder="-- Chọn chủ đề --"
                          options={topics.map(t => ({ value: t._id, label: t.name }))}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Độ khó</label>
                        <Select
                          value={difficulty}
                          onChange={setDifficulty}
                          options={[
                            { value: 'easy', label: 'Dễ' },
                            { value: 'medium', label: 'Trung bình' },
                            { value: 'hard', label: 'Khó' },
                          ]}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Phạm vi câu hỏi</label>
                        <Select
                          value={scope}
                          onChange={setScope}
                          options={[
                            { value: 'Common', label: 'Chung (Toàn nhà máy)' },
                            { value: 'DepartmentSpecific', label: 'Riêng bộ phận' },
                          ]}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Bộ phận liên kết</label>
                        <Select
                          disabled={scope !== 'DepartmentSpecific'}
                          value={departmentId}
                          onChange={setDepartmentId}
                          placeholder="-- Chọn bộ phận --"
                          options={departments.map(d => ({ value: d._id, label: d.name }))}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Loại nội dung</label>
                        <Select
                          value={questionKind}
                          onChange={setQuestionKind}
                          options={[
                            { value: 'theory', label: 'Lý thuyết' },
                            { value: 'practice', label: 'Bài tập thực hành' },
                          ]}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Hình thức đáp án</label>
                        <Select
                          value={answerType}
                          onChange={(val) => {
                            setAnswerType(val);
                            if (val === 'single') {
                              setAnswers(prev => prev.map((ans, idx) => ({ ...ans, isCorrect: idx === 0 })));
                            }
                          }}
                          options={[
                            { value: 'single', label: 'Một đáp án đúng (Single)' },
                            { value: 'multiple', label: 'Nhiều đáp án đúng (Multi)' },
                          ]}
                          triggerClassName="w-full px-3 py-2 text-sm font-medium border-2 border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Answers Area */}
                  <div className="p-4 bg-sky-50/40 border-2 border-sky-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="block text-sm font-bold text-slate-800">
                          Các phương án trả lời (Từ A đến H)
                        </label>
                        <p className="text-xs text-slate-500">
                          {answerType === 'single'
                            ? 'Chọn ô tròn ở phương án đúng duy nhất'
                            : 'Tích chọn vào các ô vuông ở những phương án đúng'}
                        </p>
                      </div>
                      {answers.length < 8 && (
                        <button
                          type="button"
                          onClick={addAnswerField}
                          className="text-xs font-bold text-[#008BC5] bg-white border border-[#008BC5] px-2.5 py-1 rounded-lg hover:bg-sky-50 transition-colors shadow-2xs"
                        >
                          + Thêm phương án
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {answers.map((ans, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-2.5 items-center p-2 rounded-xl border-2 transition-all ${
                            ans.isCorrect ? 'bg-white border-[#008BC5] shadow-xs' : 'bg-white/80 border-slate-200'
                          }`}
                        >
                          <input
                            type={answerType === 'single' ? 'radio' : 'checkbox'}
                            name="correct_answer"
                            checked={ans.isCorrect}
                            onChange={(e) => handleAnswerChange(idx, 'isCorrect', e.target.checked)}
                            title="Tích để chọn đây là đáp án đúng"
                            className="w-5 h-5 shrink-0 accent-[#008BC5] cursor-pointer"
                          />
                          <span className={`font-bold text-sm w-5 shrink-0 ${ans.isCorrect ? 'text-[#008BC5]' : 'text-slate-600'}`}>
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <input
                            type="text"
                            placeholder={`Nội dung phương án ${String.fromCharCode(65 + idx)}...`}
                            value={ans.content}
                            onChange={(e) => handleAnswerChange(idx, 'content', e.target.value)}
                            className="flex-1 min-w-0 px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg focus:outline-none focus:border-[#008BC5] bg-transparent"
                          />
                          {answers.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeAnswerField(idx)}
                              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                              title="Xóa phương án này"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div className={compact ? 'pt-3 pb-4 -mx-4 px-4 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 bg-white' : 'pt-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3'}>
                <button
                  type="button"
                  onClick={compact ? handleClosePanel : () => setIsFormOpen(false)}
                  className="px-6 py-3 min-h-[48px] border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100 transition-colors text-base"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || imageUploading || Boolean(imageFormatError)}
                  className="px-8 py-3 min-h-[48px] bg-[#008BC5] hover:bg-[#007ba1] text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {(actionLoading || imageUploading) && <Loader2 className="w-5 h-5 animate-spin" />}
                  {imageUploading ? 'Đang tải ảnh...' : imageFormatError ? 'Ảnh sai định dạng' : 'Lưu câu hỏi'}
                </button>
              </div>
    </>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar & Filters */}
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AccountTab.jsx bên Admin.
          SỬA LỖI — danh sách xổ xuống của các ô lọc (chủ đề, phạm vi, bộ phận, độ khó, hình thức đáp án) bị thẻ "Chọn tất cả
          trang này" và danh sách câu hỏi bên dưới đè lên: animate-fade-in-up giữ transform nên mỗi thẻ là 1 stacking context
          riêng, thẻ nằm sau trong DOM luôn vẽ đè lên phần dropdown tràn ra ngoài thẻ lọc. relative + z-30 nâng cả thẻ lọc
          (và mọi dropdown bên trong) lên trên các thẻ phía dưới; vẫn thấp hơn Header/modal (z-50). */}
      <div className="animate-fade-in-up relative z-30 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4" style={{ '--stagger-delay': '0ms' }}>
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm nội dung câu hỏi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button type="submit" className="px-5 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors">
            Tìm kiếm
          </button>
        </form>

        {/* Lọc theo ngân hàng: Tất cả / Thi chính thức / Ôn tập (kèm số câu) */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo ngân hàng câu hỏi">
          {[
            { value: '', label: 'Tất cả', count: usageCounts ? usageCounts.exam + usageCounts.practice : undefined, Icon: null },
            { value: 'exam', label: 'Thi chính thức', count: usageCounts?.exam, Icon: ClipboardCheck },
            { value: 'practice', label: 'Ôn tập', count: usageCounts?.practice, Icon: BookOpen },
          ].map(({ value, label, count, Icon }) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => handleUsageChange(value)}
              aria-pressed={selectedUsage === value}
              className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg border font-semibold text-sm touch-manipulation transition-colors ${
                selectedUsage === value
                  ? 'border-[#008BC5] bg-[#008BC5] text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              {label}
              {count !== undefined && <span className="font-normal opacity-90">({count})</span>}
            </button>
          ))}
        </div>

        {/* Bộ lọc — 2 cột trên mobile để mỗi ô chọn còn đủ rộng, có thể cuộn
            ngang danh sách khi mở dropdown; enlarge padding cho dễ chạm. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          <Select
            value={selectedTopic}
            onChange={setSelectedTopic}
            disabled={Boolean(selectedUsage) && filterTopics.length === 0}
            placeholder={selectedUsage && filterTopics.length === 0 ? '-- Chưa có chủ đề --' : '-- Tất cả chủ đề --'}
            options={filterTopics.map(t => ({ value: t._id, label: t.name }))}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedScope}
            onChange={setSelectedScope}
            placeholder="-- Phạm vi --"
            options={[
              { value: 'Common', label: 'Chung' },
              { value: 'DepartmentSpecific', label: 'Riêng bộ phận' },
            ]}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedDept}
            onChange={setSelectedDept}
            disabled={selectedScope !== 'DepartmentSpecific'}
            placeholder="-- Bộ phận --"
            options={departments.map(d => ({ value: d._id, label: d.name }))}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedDifficulty}
            onChange={setSelectedDifficulty}
            placeholder="-- Độ khó --"
            options={[
              { value: 'easy', label: 'Dễ' },
              { value: 'medium', label: 'Trung bình' },
              { value: 'hard', label: 'Khó' },
            ]}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <div className="col-span-2 md:col-span-1">
            <Select
              value={selectedAnswerType}
              onChange={setSelectedAnswerType}
              placeholder="-- Hình thức đáp án --"
              options={[
                { value: 'single', label: 'Một đáp án (Single)' },
                { value: 'multiple', label: 'Nhiều đáp án (Multiple)' },
              ]}
              triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center pt-2 gap-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500 font-medium">Tổng cộng: {pagination.total} câu hỏi</div>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasAnyFilter}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              title="Đưa tất cả bộ lọc và ô tìm kiếm về mặc định"
            >
              <FilterX className="w-4 h-4" />
              Xóa bộ lọc
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setImportUsage(null);
                setIsImportOpen(true);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import câu hỏi</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm câu hỏi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {questions.length > 0 && (
        <div className="animate-fade-in-up bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 text-sm" style={{ '--stagger-delay': '80ms' }}>
          <button
            type="button"
            onClick={toggleSelectAllOnPage}
            className="flex items-center gap-2 text-slate-600 hover:text-[#008BC5] font-medium py-1.5 min-h-[40px]"
          >
            {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-[#008BC5]" /> : <Square className="w-4 h-4" />}
            {allOnPageSelected ? 'Bỏ chọn tất cả trang này' : 'Chọn tất cả trang này'}
            {selectedIds.length > 0 && <span className="text-slate-400 font-normal">({selectedIds.length} đã chọn)</span>}
          </button>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleMoveUsage('exam')}
              disabled={selectedIds.length === 0 || actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-[#008BC5]/40 text-[#008BC5] rounded-lg font-medium hover:bg-[#EAF6FF] active:bg-[#EAF6FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              <ClipboardCheck className="w-4 h-4" />
              Chuyển sang Thi
            </button>
            <button
              type="button"
              onClick={() => handleMoveUsage('practice')}
              disabled={selectedIds.length === 0 || actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-[#F6AD37]/60 text-[#B45309] rounded-lg font-medium hover:bg-[#FFFBEB] active:bg-[#FFFBEB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              <BookOpen className="w-4 h-4" />
              Chuyển sang Ôn tập
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              disabled={selectedIds.length === 0 || actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-[#E53E3E]/40 text-[#E53E3E] rounded-lg font-medium hover:bg-[#FEECEC] active:bg-[#FEECEC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Xóa {selectedIds.length > 0 ? `${selectedIds.length} câu đã chọn` : 'đã chọn'}
            </button>
            <button
              type="button"
              onClick={handleMoveAllByFilter}
              disabled={actionLoading || !selectedUsage}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              title={
                selectedUsage
                  ? 'Chuyển toàn bộ câu hỏi khớp bộ lọc hiện tại (không chỉ trang này) sang ngân hàng còn lại'
                  : 'Chọn tab "Thi chính thức" hoặc "Ôn tập" trước để xác định hướng chuyển'
              }
            >
              <ArrowRightLeft className="w-4 h-4" />
              {selectedUsage === 'practice'
                ? `Chuyển tất cả sang Thi (${pagination.total})`
                : selectedUsage === 'exam'
                  ? `Chuyển tất cả sang Ôn tập (${pagination.total})`
                  : 'Chuyển tất cả theo bộ lọc'}
            </button>
            <button
              type="button"
              onClick={handleDeleteAllByFilter}
              disabled={actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#E53E3E] text-white rounded-lg font-medium hover:bg-[#C53030] active:bg-[#C53030] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Xóa toàn bộ câu hỏi khớp bộ lọc hiện tại, không chỉ trang này"
            >
              <Trash2 className="w-4 h-4" />
              Xóa tất cả theo bộ lọc ({pagination.total})
            </button>
          </div>
        </div>
      )}

      {/* Danh sách câu hỏi + (desktop) khung sửa nhanh bên phải: danh sách 6/10, khung 4/10 */}
      <div className={showPanel ? 'lg:grid lg:grid-cols-10 lg:gap-5 lg:items-start' : ''}>
        <div className={showPanel ? 'lg:col-span-6 min-w-0' : ''}>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
                  <div className="h-6 w-3/4 bg-slate-200 rounded"></div>
                  <div className="h-4 w-1/4 bg-slate-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="animate-fade-in-up space-y-4" style={{ '--stagger-delay': '140ms' }}>
              {questions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => handleSelectQuestion(q)}
                  aria-current={showPanel && panelQuestionId === q.id ? 'true' : undefined}
                  className={`p-3.5 sm:p-5 rounded-xl border shadow-sm space-y-3.5 sm:space-y-4 hover:shadow-md transition-shadow ${isDesktop ? 'cursor-pointer' : ''} ${
                    showPanel && panelQuestionId === q.id
                      ? 'bg-[#F0F9FF] border-[#008BC5] ring-2 ring-[#008BC5]/50 shadow-md'
                      : selectedIds.includes(q.id)
                        ? 'bg-white border-[#008BC5] ring-1 ring-[#008BC5]/30'
                        : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 sm:gap-4">
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelectId(q.id); }}
                        className="shrink-0 text-slate-400 hover:text-[#008BC5] p-1.5 -m-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center"
                        title="Chọn câu hỏi này"
                      >
                        {selectedIds.includes(q.id) ? <CheckSquare className="w-5 h-5 text-[#008BC5]" /> : <Square className="w-5 h-5" />}
                      </button>
                      <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1 ${
                            q.usage === 'practice' ? 'bg-[#FFFBEB] text-[#B45309]' : 'bg-[#EAF6FF] text-[#008BC5]'
                          }`}
                        >
                          {q.usage === 'practice' ? <BookOpen className="w-3 h-3" /> : <ClipboardCheck className="w-3 h-3" />}
                          {q.usage === 'practice' ? 'Ôn tập' : 'Thi chính thức'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${q.difficulty === 'easy' ? 'bg-[#F0FDF4] text-[#16A34A]' :
                            q.difficulty === 'medium' ? 'bg-[#FFFBEB] text-[#B45309]' :
                              'bg-[#FEECEC] text-[#C53030]'
                          }`}>
                          {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">
                          {q.questionKind === 'theory' ? 'Lý thuyết' : 'Bài tập'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-semibold">
                          {q.scope === 'Common' ? 'Chung' : 'Riêng bộ phận'}
                        </span>
                        {q.imageUrl && (
                          <span
                            title="Câu hỏi này có ảnh minh hoạ đề bài"
                            className="px-2 py-0.5 bg-sky-50 text-[#008BC5] rounded text-xs font-semibold flex items-center gap-1"
                          >
                            <ImageIcon className="w-3 h-3" />
                            Có ảnh
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-800 text-[15px] sm:text-base leading-snug break-words">{q.content}</h4>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenEdit(q); }}
                        className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-[#008BC5] hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }}
                        className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-[#E53E3E] hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Answers list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:pl-2">
                    {q.answers.map((ans, idx) => (
                      <div key={ans.id || idx} className={`p-2.5 rounded-lg border text-sm flex items-start gap-2.5 ${ans.isCorrect ? 'bg-[#F0FDF4] border-[#22C55E]/40 text-[#0F172A]' : 'bg-slate-50/50 border-slate-100 text-slate-700'}`}>
                        <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span>
                        <span className="flex-1 break-words">{ans.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {questions.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
                  Không tìm thấy câu hỏi nào.
                </div>
              )}

              {/* Pagination */}
              {pagination.total > pagination.limit && (
                <div className="flex justify-between items-center pt-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => loadData(pagination.page - 1)}
                    className="flex items-center gap-1 px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-lg hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 text-sm font-medium"
                  >
                    <ChevronLeft className="w-4 h-4" /> Trước
                  </button>
                  <span className="text-sm font-medium text-slate-600">Trang {pagination.page}</span>
                  <button
                    disabled={pagination.page * pagination.limit >= pagination.total}
                    onClick={() => loadData(pagination.page + 1)}
                    className="flex items-center gap-1 px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-lg hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 text-sm font-medium"
                  >
                    Sau <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {showPanel && (
          <aside
            aria-label="Chỉnh sửa nhanh câu hỏi"
            className="lg:col-span-4 lg:sticky lg:top-20 min-w-0 bg-white rounded-xl border-2 border-[#008BC5]/50 shadow-lg flex flex-col lg:max-h-[calc(100vh-6rem)]"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-start gap-3 bg-slate-50 rounded-t-xl shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-[#0F172A]">Chỉnh sửa câu hỏi</h3>
                <p className="text-xs text-slate-500 mt-0.5">Bấm câu khác trong danh sách để chuyển nhanh</p>
              </div>
              <button
                type="button"
                onClick={handleClosePanel}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors shrink-0"
                aria-label="Đóng khung chỉnh sửa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="px-4 pt-4 overflow-y-auto space-y-5 rounded-b-[10px]" data-lenis-prevent>
              {panelError && (
                <div role="alert" className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#E53E3E]" />
                  <span>{panelError}</span>
                </div>
              )}
              {renderFormFields(true)}
            </form>
          </aside>
        )}
      </div>

      {/* QUESTION FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[94vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-xl sm:text-2xl text-[#0F172A]">
                  {editingQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Soạn thảo nội dung câu hỏi, thiết lập thuộc tính và các phương án trả lời
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Đóng cửa sổ"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-6" data-lenis-prevent>
              {renderFormFields(false)}
            </form>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto border border-slate-100" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Nhập câu hỏi từ file</h3>
              <button
                onClick={closeImportModal}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {!importUsage ? (
                <div className="space-y-3">
                  <p className="font-semibold text-[#0F172A]">Import vào đâu?</p>
                  <button
                    type="button"
                    onClick={() => setImportUsage('exam')}
                    className="w-full text-left p-4 rounded-xl border-2 border-[#008BC5] bg-[#EAF6FF] hover:bg-[#dff0fb] active:bg-[#dff0fb] transition-colors touch-manipulation min-h-[72px]"
                  >
                    <div className="flex items-center gap-2 font-bold text-[#008BC5] text-base">
                      <ClipboardCheck className="w-5 h-5 shrink-0" />
                      Câu hỏi thi chính thức
                    </div>
                    <div className="text-sm text-[#334155] mt-1">
                      Ngân hàng bí mật, chỉ dùng để tạo mã đề thi. Thí sinh không xem được.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportUsage('practice')}
                    className="w-full text-left p-4 rounded-xl border-2 border-[#F6AD37] bg-[#FFFBEB] hover:bg-[#fff5d6] active:bg-[#fff5d6] transition-colors touch-manipulation min-h-[72px]"
                  >
                    <div className="flex items-center gap-2 font-bold text-[#B45309] text-base">
                      <BookOpen className="w-5 h-5 shrink-0" />
                      Câu hỏi ôn tập
                    </div>
                    <div className="text-sm text-[#334155] mt-1">
                      Thí sinh luyện tập và thấy đáp án đúng ngay. Không dùng cho thi chính thức.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="w-full py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              ) : (
              <>
              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${
                  importUsage === 'practice'
                    ? 'bg-[#FFFBEB] border-[#F6AD37]/50 text-[#B45309]'
                    : 'bg-[#EAF6FF] border-[#008BC5]/30 text-[#008BC5]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {importUsage === 'practice' ? <BookOpen className="w-4 h-4 shrink-0" /> : <ClipboardCheck className="w-4 h-4 shrink-0" />}
                  <span>Đang nhập vào: {importUsage === 'practice' ? 'Câu hỏi ôn tập' : 'Câu hỏi thi chính thức'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setImportUsage(null)}
                  disabled={importLoading}
                  className="shrink-0 underline font-semibold min-h-[32px] px-1 disabled:opacity-50"
                >
                  Đổi
                </button>
              </div>

              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setImportFileKind('excel')}
                  disabled={importLoading}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                    importFileKind === 'excel' ? 'bg-white shadow text-[#008BC5]' : 'text-slate-500'
                  }`}
                >
                  File Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => setImportFileKind('word')}
                  disabled={importLoading}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                    importFileKind === 'word' ? 'bg-white shadow text-[#008BC5]' : 'text-slate-500'
                  }`}
                >
                  File Word (.docx)
                </button>
              </div>

              {importFileKind === 'excel' && (
                <a
                  href="/templates/Mau_Import_Cau_Hoi_Z176.xlsx"
                  download
                  className="flex items-center justify-center gap-2 w-full py-3 min-h-[46px] border border-[#008BC5]/30 bg-[#EAF6FF] text-[#008BC5] rounded-lg font-semibold text-sm hover:bg-[#008BC5]/10 active:bg-[#008BC5]/10 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Tải file mẫu Excel (đúng định dạng cột)
                </a>
              )}

              {importFileKind === 'word' && (
                <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-600 space-y-1.5">
                  <p className="font-semibold text-slate-700">Mỗi câu phải đúng khuôn sau:</p>
                  <pre className="whitespace-pre-wrap bg-white border border-slate-200 rounded p-2 text-[11px] leading-relaxed">{`Câu 1: (chủ đề: Tài chính - bộ phận: - độ khó: dễ) Nội dung câu hỏi?
A. Phương án 1
*B. Phương án đúng (đánh dấu * ở đầu)
C. Phương án 3
D. Phương án đúng khác (hoặc GẠCH CHÂN cả dòng)`}</pre>
                  <p>Bộ phận để trống = Phạm vi Chung; ghi <b>MÃ bộ phận</b> (vd: <code>bộ phận: HCHC</code>) = Phạm vi Riêng. Mã phải đã có trong hệ thống — mã lạ sẽ báo lỗi câu đó (Word không tự tạo bộ phận). Câu dùng cho nhiều bộ phận thì viết lặp lại, mỗi bộ phận 1 câu. Chỉ nhận file .docx.</p>
                  <p>Gõ chữ cái A. B. C. trực tiếp ở đầu mỗi dòng (không dùng danh sách tự đánh số của Word). Gạch chân phải phủ cả dòng đáp án — nếu chỉ gạch một phần, hệ thống sẽ hỏi lại. Dùng dấu * ở đầu dòng là cách chắc chắn nhất.</p>
                </div>
              )}

              {/* Panel xem nhanh cột bắt buộc — không cần mở file Excel cũng
                  biết được cấu trúc file cần có, hữu ích cho người dùng lần
                  đầu import (vd người kế nhiệm sau này không quen hệ thống).
                  Chỉ áp dụng cho Excel, Word đã có khối hướng dẫn riêng ở trên. */}
              {importFileKind === 'excel' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowImportGuide((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-semibold text-slate-700"
                >
                  <span>Xem nhanh: file Excel cần có cột gì?</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showImportGuide ? 'rotate-180' : ''}`} />
                </button>
                {showImportGuide && (
                  <div className="p-4 space-y-3 text-xs text-slate-600 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 pr-2 font-semibold text-slate-700">Tên cột</th>
                          <th className="py-1.5 pr-2 font-semibold text-slate-700">Bắt buộc?</th>
                          <th className="py-1.5 font-semibold text-slate-700">Giá trị hợp lệ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Chủ đề</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Tên chủ đề (tự tạo mới nếu chưa có)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Nội dung</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Nội dung câu hỏi</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Phạm vi</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">chung — hoặc — riêng (mặc định: chung)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Mã bộ phận</td>
                          <td className="py-1.5 pr-2 text-amber-600 font-semibold">Nếu Phạm vi = riêng</td>
                          <td className="py-1.5">Mã bộ phận đã có trong hệ thống (vd: HCHC) — hệ thống tìm bộ phận theo mã này</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Bộ phận</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">Tên bộ phận (để dễ đọc) — chỉ dùng khi mã chưa có và bạn tạo bộ phận mới ở bước xem trước</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Loại</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">lý thuyết — hoặc — bài tập (mặc định: lý thuyết)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Đáp án</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">chọn 1 — hoặc — chọn nhiều (mặc định: chọn 1)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Độ khó</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">dễ, trung bình, khó (mặc định: trung bình)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Lựa chọn 1…8</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Ít nhất 2</td>
                          <td className="py-1.5">Nội dung từng phương án trả lời</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Đáp án đúng</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Số thứ tự đáp án đúng, vd: 1 hoặc 1,3</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-slate-400 italic">
                      Điền tên cột đúng như trên (có dấu). Tải file mẫu ở trên để xem đầy đủ giải thích (sheet "HuongDan") kèm 2 dòng ví dụ thật.
                    </p>
                  </div>
                )}
              </div>
              )}

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 cursor-pointer relative">
                <input
                  type="file"
                  accept={importFileKind === 'word' ? '.docx' : '.xlsx, .xls'}
                  onChange={handleImportFile}
                  disabled={importLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
                />
                {importLoading ? (
                  <Loader2 className="w-10 h-10 text-[#008BC5] mx-auto mb-2 animate-spin" />
                ) : (
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold text-slate-700">
                  {importLoading
                    ? 'Đang phân tích file...'
                    : importFileKind === 'word'
                      ? 'Tải file Word câu hỏi lên đây'
                      : 'Tải file Excel câu hỏi lên đây'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {importFileKind === 'word'
                    ? 'Định dạng hỗ trợ: .docx (Tối đa 5MB) — chọn file sẽ tự xem trước, chưa ghi vào hệ thống'
                    : 'Định dạng hỗ trợ: .xlsx, .xls (Tối đa 5MB) — chọn file sẽ tự xem trước, chưa ghi vào hệ thống'}
                </p>
              </div>

              {importFileKind === 'excel' && (
                <p className="text-xs text-slate-500">
                  Xem sheet "HuongDan" trong file mẫu để biết chi tiết từng cột: Chủ đề, Nội dung, Phạm vi, Mã bộ phận, Bộ phận, Loại, Đáp án, Độ khó, Lựa chọn 1–8, Đáp án đúng.
                </p>
              )}

              <div className="pt-2 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={closeImportModal}
                  disabled={importLoading}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Đóng
                </button>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL — XEM TRƯỚC & XÁC NHẬN (bước 2/2) */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#008BC5]" /> Xem trước import — chưa ghi vào hệ thống
              </h3>
              <button
                onClick={closeImportPreview}
                disabled={importConfirming}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto" data-lenis-prevent>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold ${
                  (importPreview.usage || importUsage) === 'practice'
                    ? 'bg-[#FFFBEB] border-[#F6AD37]/50 text-[#B45309]'
                    : 'bg-[#EAF6FF] border-[#008BC5]/30 text-[#008BC5]'
                }`}
              >
                {(importPreview.usage || importUsage) === 'practice' ? <BookOpen className="w-4 h-4 shrink-0" /> : <ClipboardCheck className="w-4 h-4 shrink-0" />}
                <span>
                  Sẽ nhập vào ngân hàng: {(importPreview.usage || importUsage) === 'practice' ? 'ÔN TẬP' : 'THI CHÍNH THỨC'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-[#0F172A]">{importPreview.totalRows}</div>
                  <div className="text-sm text-slate-500">{importFileKind === 'word' ? 'Tổng số câu' : 'Tổng số dòng'}</div>
                </div>
                <div className="bg-[#F0FDF4] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#22C55E]">{importPreview.readyCount}</div>
                  <div className="text-sm text-slate-500">Sẵn sàng thêm</div>
                </div>
                <div className="bg-[#FFF7ED] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#F6AD37]">{importPreview.duplicateCount}</div>
                  <div className="text-sm text-slate-500">Trùng câu cũ</div>
                </div>
                <div className="bg-[#FEECEC] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#E53E3E]">{importPreview.errorCount}</div>
                  <div className="text-sm text-slate-500">Lỗi dữ liệu</div>
                </div>
              </div>

              {/* PHÒNG BAN CÒN THIẾU — tạo ngay tại đây (mã + mô tả), không
                  cần thoát ra ngoài tạo tay rồi import lại như trước. */}
              {deptDrafts.length > 0 && (
                <div className="border border-amber-300 bg-[#FFF7ED] rounded-lg p-3 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-[#92400E]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      File có câu hỏi riêng cho các bộ phận sau nhưng hệ thống <b>chưa có</b>. Nhập đủ mã + mô tả rồi bấm "Xác nhận nhập" để tạo bộ phận và import luôn các câu riêng. Bỏ tick "Tạo bộ phận này" nếu bạn KHÔNG muốn tạo (các câu hỏi riêng của bộ phận đó sẽ bị bỏ qua, chỉ import câu chung).
                    </span>
                  </div>
                  <div className="space-y-2">
                    {deptDrafts.map((d) => (
                      <div key={d.name} className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={d.include}
                              onChange={() => toggleDeptInclude(d.name)}
                              disabled={importConfirming}
                              className="w-4 h-4"
                            />
                            Tạo bộ phận này
                            <span className="font-semibold text-[#0F172A]">{d.name}</span>
                          </label>
                          <span className="text-xs text-slate-500 shrink-0">{d.rowCount} câu riêng</span>
                        </div>

                        {d.include ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Mã phòng ban</label>
                              <input
                                type="text"
                                value={d.code}
                                onChange={(e) => updateDeptField(d.name, 'code', e.target.value)}
                                disabled={importConfirming || d.codeLocked}
                                placeholder="vd. CNTT"
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Tên phòng ban</label>
                              <input
                                type="text"
                                value={d.name}
                                disabled
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-500"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-500 mb-1">Mô tả ngắn gọn</label>
                              <input
                                type="text"
                                value={d.description}
                                onChange={(e) => updateDeptField(d.name, 'description', e.target.value)}
                                disabled={importConfirming || d.descriptionLocked}
                                placeholder="Mô tả chức năng bộ phận"
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 pl-6">
                            Sẽ bỏ qua {d.rowCount} câu riêng của bộ phận này, chỉ import câu chung.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CÂU TRÙNG — mặc định bỏ qua (giữ câu cũ), tick để vẫn thêm
                  câu mới dù nội dung trùng (vd cố ý tạo 2 câu giống nhau). */}
              {/* NEEDS REVIEW (chỉ Word) — câu dùng cách đánh dấu đáp án đúng THIỂU SỐ
                  trong file (vd file toàn gạch chân nhưng câu này lại dùng *). Mặc định
                  đã chọn sẵn theo gợi ý của hệ thống — không bấm gì cũng được ("bỏ qua"
                  = chấp nhận gợi ý), hoặc tự tick lại cho đúng trước khi xác nhận nhập. */}
              {importPreview.needsReview?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <b>{importPreview.needsReview.length} câu</b> cần bạn xác nhận lại đáp án đúng: dùng cách đánh dấu khác với đa số file (vd file chủ yếu gạch chân nhưng câu này lại dùng dấu *) hoặc có đáp án chỉ được gạch chân một phần. Hệ thống đã chọn sẵn theo gợi ý — kiểm tra lại hoặc tick lại cho đúng trước khi xác nhận nhập.
                  </p>
                  <div className="border border-amber-200 rounded-lg divide-y divide-amber-100 max-h-64 overflow-y-auto" data-lenis-prevent>
                    {importPreview.needsReview.map((r) => (
                      <div key={r.row} className="p-2.5 text-sm space-y-1.5">
                        <div className="flex items-start gap-2">
                          <span className="text-slate-400 w-14 shrink-0">Câu {r.row}</span>
                          <span className="flex-1 min-w-0 text-slate-700">{r.content}</span>
                        </div>
                        {r.reasons?.length > 0 && (
                          <p className="pl-14 text-[11px] text-amber-600">
                            {[
                              r.reasons.includes('minority') && 'Dùng cách đánh dấu khác với đa số file',
                              r.reasons.includes('partialUnderline') && 'Có đáp án chỉ gạch chân một phần',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pl-14">
                          {r.options.map((o) => (
                            <label
                              key={o.index}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer ${
                                (reviewOverrides[r.row] || []).includes(o.index)
                                  ? 'border-[#22C55E] bg-[#F0FDF4] text-[#166534] font-semibold'
                                  : 'border-slate-200 text-slate-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={(reviewOverrides[r.row] || []).includes(o.index)}
                                onChange={() => toggleReviewOption(r.row, o.index)}
                                disabled={importConfirming}
                                className="w-3.5 h-3.5"
                              />
                              {o.letter}. {o.content.slice(0, 40)}
                              {o.partialUnderline && <span className="text-amber-600 font-normal">(gạch chân một phần)</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importPreview.duplicates?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Các câu hỏi dưới đây <b>trùng nội dung</b> với câu đã có trong ngân hàng (cùng chủ đề/phạm vi/bộ phận). Mặc định sẽ <b>bỏ qua, giữ câu cũ</b> — tick vào dòng nào bạn muốn vẫn thêm câu mới song song.
                  </p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto" data-lenis-prevent>
                    {importPreview.duplicates.map((d) => (
                      <label key={d.row} className="p-2.5 text-sm flex items-start gap-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={keepDupRows.includes(d.row)}
                          onChange={() => toggleKeepDupRow(d.row)}
                          disabled={importConfirming}
                          className="w-4 h-4 mt-0.5 shrink-0"
                        />
                        <span className="text-slate-400 w-14 shrink-0">{importFileKind === 'word' ? 'Câu' : 'Dòng'} {d.row}</span>
                        <span className="flex-1 min-w-0 text-slate-700">{d.content}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* LỖI KHÁC — luôn bị bỏ qua, chỉ hiển thị để người dùng biết
                  sửa lại file cho lần import sau. */}
              {importPreview.errors?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Các {importFileKind === 'word' ? 'câu' : 'dòng'} dưới đây có lỗi khác, sẽ <b>luôn bị bỏ qua</b>:</p>
                  <div className="border border-red-200 rounded-lg divide-y divide-red-100 max-h-40 overflow-y-auto" data-lenis-prevent>
                    {importPreview.errors.map((e) => (
                      <div key={e.row} className="p-2.5 text-sm flex items-start gap-2">
                        <span className="text-slate-400 w-14 shrink-0">{importFileKind === 'word' ? 'Câu' : 'Dòng'} {e.row}</span>
                        <span className="flex-1 min-w-0 text-[#E53E3E]">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeImportPreview}
                  disabled={importConfirming}
                  className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={
                    importConfirming ||
                    hasIncompleteIncludedDept ||
                    importPreview.readyCount + keepDupRows.length + includedDeptRowCount === 0
                  }
                  className="flex-1 py-2.5 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Xác nhận nhập ({importPreview.readyCount + keepDupRows.length + includedDeptRowCount} câu)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};