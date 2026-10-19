import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit2, Lock, Unlock, KeyRound, Loader2, X, Eye, Copy, Check, Upload, FileSpreadsheet, AlertTriangle, AlertCircle, Columns3, ChevronDown, Info, Download, UserCog } from 'lucide-react';
import { fetchUsers, fetchRoles, createUser, updateUserRole, toggleUserLock, resetUserPassword, previewImportEmployeesExcel, confirmImportEmployeesExcel, downloadImportResultsCsv, downloadSingleAccountCredential, exportCandidateCredentialsExcel, updateUserProfile } from '../../services/admin.service';
// Dùng lại đúng fetchDepartments()/createDepartment() đã có sẵn ở tab "Phòng ban"
// (examiner/DepartmentTab.jsx) — không viết API mới, không gọi apiRequest trực tiếp nữa.
import { fetchDepartments, createDepartment } from '../../services/examiner.service';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Select } from '../Select';

const PROFILE_KEYS = ['fullname', 'employeeCode', 'dob', 'gender', 'phone', 'address', 'position'];
// DB lưu ngày sinh dạng 'dd/mm/yyyy' (giống file Excel); <input type=date> dùng 'yyyy-mm-dd'.
const dobToInput = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const dobFromInput = (s) => (s ? s.split('-').reverse().join('/') : '');
const PROFILE_INPUT_CLASS = 'w-full px-3.5 py-2 min-h-[44px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white';

// Render modal thẳng vào <body>. Nếu để modal nằm trong cây DOM của tab thì khi tổ tiên có
// transform (vd. animate-fade-in-up) hoặc overflow-hidden, `fixed inset-0` sẽ bị bó trong vùng đó
// thay vì phủ cả màn hình -> cửa sổ bị lệch/ẩn khỏi tầm nhìn.
const ModalPortal = ({ children }) => createPortal(children, document.body);

// Danh sách cột có thể hiển thị trong bảng tài khoản. `alwaysOn` = cột lõi
// không cho ẩn (Username, Phân quyền, Trạng thái, Hành động). Các cột còn
// lại lấy từ hồ sơ nhân viên (Employee) — có thể trống nếu tài khoản không
// phải role 'candidate' hoặc chưa được import kèm dữ liệu đó.
const ACCOUNT_COLUMNS = [
  { key: 'fullname', label: 'Họ tên' },
  { key: 'employeeCode', label: 'Mã NV' },
  { key: 'departmentName', label: 'Phòng ban' },
  { key: 'extraDepartmentNames', label: 'Phòng kiêm nhiệm' },
  { key: 'dob', label: 'Ngày sinh' },
  { key: 'gender', label: 'Giới tính' },
  { key: 'phone', label: 'SĐT' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'position', label: 'Chức vụ' },
];

const ACCOUNT_COLUMNS_STORAGE_KEY = 'z176_account_table_columns';

// Giá trị đặc biệt cho dòng "+ Tạo phòng ban mới" trong dropdown Phòng ban —
// không phải _id thật nên không bao giờ trùng với dữ liệu Mongo thật.
const CREATE_NEW_DEPARTMENT_VALUE = '__create_new_department__';

// File mẫu import nhân viên (tiếng Việt, có sheet hướng dẫn) — đặt sẵn tại
// public/templates để nút tải dùng static path, giống quy ước file mẫu
// import câu hỏi (Mau_Import_Cau_Hoi_Z176.xlsx) bên QuestionBankTab.
const IMPORT_EMPLOYEE_TEMPLATE_PATH = '/templates/Mau_Import_Nhan_Vien_Z176.xlsx';

// Cột file Excel import nhân viên mà hệ thống hiện chấp nhận (khớp đúng
// alias trong buildEmployeeImportRow @ server/src/services/user.service.js)
// — dùng để hiển thị panel "Xem nhanh" ngay trong toolbar, cạnh nút Import.
const IMPORT_EMPLOYEE_COLUMNS_GUIDE = [
  { label: 'Họ tên', required: true, note: 'Bắt buộc.' },
  { label: 'Mã phòng ban / Phòng ban', required: true, note: 'Bắt buộc có ít nhất 1 trong 2 — nếu có Mã phòng ban, hệ thống ưu tiên dùng mã này.' },
  { label: 'Phòng kiêm nhiệm (ghi trong cột Phòng ban)', required: false, note: 'Phòng chính ghi ngoài, phòng kiêm nhiệm ghi trong { } cách nhau bằng dấu ; — vd: Tài chính-kế toán {Kiểm kho; Chính trị}. Mọi phòng đều cần có mã (nhập ở bước xem trước).' },
  { label: 'Mã nhân viên', required: false, note: 'Không bắt buộc — để trống sẽ tự sinh mã tạm dạng TMP<số dòng>.' },
  { label: 'Ngày sinh / Giới tính / SĐT / Địa chỉ / Chức vụ', required: false, note: 'Không bắt buộc — chỉ lưu làm hồ sơ tham khảo.' },
];

export const AccountTab = ({ currentUser }) => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [exportCredentialsLoading, setExportCredentialsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Cột hiển thị trong bảng — nhớ lựa chọn của người dùng giữa các lần vào
  // lại trang (localStorage), mặc định hiện tất cả cột.
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ACCOUNT_COLUMNS_STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        return { ...Object.fromEntries(ACCOUNT_COLUMNS.map((c) => [c.key, true])), ...saved };
      }
    } catch {
      /* ignore parse error, dùng mặc định */
    }
    return Object.fromEntries(ACCOUNT_COLUMNS.map((c) => [c.key, true]));
  });
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef(null);

  // Panel "Xem nhanh: file Excel cần có cột gì?" — cạnh nút Import Excel,
  // cùng kiểu accordion/popover với menu Cột hiển thị ở trên.
  const [isImportGuideOpen, setIsImportGuideOpen] = useState(false);
  const importGuideRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(ACCOUNT_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    if (!isColumnMenuOpen) return;
    const handleClickOutside = (e) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target)) {
        setIsColumnMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColumnMenuOpen]);

  useEffect(() => {
    if (!isImportGuideOpen) return;
    const handleClickOutside = (e) => {
      if (importGuideRef.current && !importGuideRef.current.contains(e.target)) {
        setIsImportGuideOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isImportGuideOpen]);

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeColumns = ACCOUNT_COLUMNS.filter((c) => visibleColumns[c.key]);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  // Chỉ dùng khi role được chọn là 'candidate' (thí sinh) — Employee đi kèm User.
  const [newFullname, setNewFullname] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newExtraDepartmentIds, setNewExtraDepartmentIds] = useState([]); // phòng kiêm nhiệm khi tạo tài khoản thủ công
  const [newEmployeeCode, setNewEmployeeCode] = useState('');

  // MỚI — Modal con "+ Tạo phòng ban mới" ngay trong dropdown Phòng ban của
  // form Thêm tài khoản mới (tránh phải thoát ra tab Phòng ban rồi quay lại).
  // Dùng state loading riêng (deptActionLoading), không dùng chung actionLoading,
  // để nút "Lưu" của form tạo tài khoản không bị disable nhầm khi đang tạo phòng ban.
  const [isCreateDeptOpen, setIsCreateDeptOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [deptActionLoading, setDeptActionLoading] = useState(false);
  // Lỗi hiện inline ngay trong modal con — nhất quán với handleSubmit của
  // modal tạo phòng ban gốc trong DepartmentTab.jsx (dùng banner lỗi tại
  // chỗ, không dùng toast).
  const [deptFormError, setDeptFormError] = useState('');

  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  // MỚI — Modal sửa phòng ban chính / phòng kiêm nhiệm của 1 nhân viên
  const [isEditDeptOpen, setIsEditDeptOpen] = useState(false);
  const [editDeptUser, setEditDeptUser] = useState(null);
  const [editPrimaryDeptId, setEditPrimaryDeptId] = useState('');
  const [editExtraDeptIds, setEditExtraDeptIds] = useState([]);
  const [editProfile, setEditProfile] = useState({}); // thông tin cá nhân (modal bút)
  const [editingUser, setEditingUser] = useState(null);
  const [editingRoleId, setEditingRoleId] = useState('');

  // Password Reveal Modal
  const [tempPasswordModal, setTempPasswordModal] = useState({
    isOpen: false,
    title: '',
    username: '',
    password: ''
  });
  const [copied, setCopied] = useState(false);

  // Import Excel (bulk) state — 2 bước: preview (xem trước, chưa ghi DB) rồi
  // confirm (ghi thật) — xem handleImportFile / handleConfirmImport bên dưới.
  const [importLoading, setImportLoading] = useState(false); // đang upload + phân tích file (bước preview)
  const [importPreview, setImportPreview] = useState(null); // { total, toCreate, toReuse, toUpdate, conflicts, errors, rows }
  const [importConfirming, setImportConfirming] = useState(false); // đang ghi thật (bước confirm)
  const [importResult, setImportResult] = useState(null); // { total, created, updated, reused, failed, results }
  // Mã phòng ban admin nhập ở bước xem trước: { [key phòng ban]: mã } — chỉ cho các phòng có needsCode
  const [importDeptCodes, setImportDeptCodes] = useState({});
  const fileInputRef = useRef(null);

  useScrollLock(isCreateOpen || isCreateDeptOpen || isEditRoleOpen || isEditDeptOpen || tempPasswordModal.isOpen || Boolean(importPreview));

  // useCallback: giữ nguyên tham chiếu hàm giữa các lần render (chỉ đổi khi
  // showToast đổi) — để useEffect bên dưới có thể khai báo loadData vào
  // dependency array đúng theo eslint mà KHÔNG gây loop vô hạn (nếu không bọc
  // useCallback, loadData sẽ là hàm mới mỗi render → effect chạy lại liên tục).
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, departmentsData] = await Promise.all([
        fetchUsers(),
        fetchRoles(),
        fetchDepartments().catch(() => []), // không chặn cả trang nếu API department lỗi
      ]);
      setUsers(
        (Array.isArray(usersData) ? usersData : []).map((u) => ({
          ...u,
          // Chuỗi hiển thị cho cột "Phòng kiêm nhiệm" (bảng dùng user[col.key] chung cho mọi cột)
          extraDepartmentNames: (u.extraDepartments ?? []).map((d) => d.name).join('; '),
        })),
      );
      setRoles(rolesData);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
    } catch (err) {
      showToast(err.message || 'Lỗi khi tải danh sách dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // MỚI — Chỉ tải lại riêng danh sách phòng ban (không setLoading(true) toàn
  // trang như loadData) — dùng sau khi tạo phòng ban mới ngay trong modal
  // "Thêm tài khoản mới", để modal đó không bị unmount giữa chừng do component
  // return skeleton khi `loading` = true.
  const refreshDepartments = useCallback(async () => {
    try {
      const departmentsData = await fetchDepartments();
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
      return Array.isArray(departmentsData) ? departmentsData : [];
    } catch (err) {
      showToast(err.message || 'Lỗi khi tải lại danh sách phòng ban', 'error');
      return [];
    }
  }, [showToast]);

  // Xác định role đang chọn trong form tạo tài khoản có phải 'candidate' (thí sinh) không —
  // dùng để hiện/ẩn nhóm field Họ tên/Mã NV/Phòng ban.
  const isCandidateRoleSelected = roles.some(
    (r) => r._id === newRoleId && r.code === 'candidate',
  );

  const resetCreateForm = () => {
    setNewUsername('');
    setNewRoleId('');
    setNewFullname('');
    setNewDepartmentId('');
    setNewExtraDepartmentIds([]);
    setNewEmployeeCode('');
    // Đóng và reset luôn modal con tạo phòng ban để tránh còn sót dữ liệu
    // nhập dở khi mở lại form tạo tài khoản lần sau.
    setIsCreateDeptOpen(false);
    setNewDeptName('');
    setNewDeptCode('');
    setDeptFormError('');
  };

  // MỚI — Xử lý chọn dòng "+ Tạo phòng ban mới" trong dropdown Phòng ban:
  // mở modal con thay vì gán sentinel value vào newDepartmentId thật.
  const handleDepartmentSelectChange = (value) => {
    if (value === CREATE_NEW_DEPARTMENT_VALUE) {
      setNewDeptName('');
      setNewDeptCode('');
      setDeptFormError('');
      setIsCreateDeptOpen(true);
      return;
    }
    setNewDepartmentId(value);
    // Phòng vừa chọn làm phòng chính thì không thể đồng thời là phòng kiêm nhiệm
    setNewExtraDepartmentIds((prev) => prev.filter((id) => id !== value));
  };

  // Tick / bỏ tick 1 phòng kiêm nhiệm trong form tạo tài khoản
  const toggleNewExtraDepartment = (id) => {
    setNewExtraDepartmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // MỚI — Tạo phòng ban mới ngay trong form Thêm tài khoản, dùng lại đúng
  // createDepartment() từ examiner.service.js (KHÔNG viết API mới). Sau khi
  // tạo thành công: refresh lại danh sách departments trong AccountTab và tự
  // động chọn luôn phòng ban vừa tạo vào dropdown. Xử lý lỗi bằng banner inline
  // ngay trong modal con — nhất quán với handleSubmit của DepartmentTab.jsx,
  // không dùng showToast ở đây.
  const handleCreateDepartmentInline = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim() || !newDeptCode.trim()) return;
    setDeptActionLoading(true);
    setDeptFormError('');
    try {
      const created = await createDepartment({
        name: newDeptName.trim(),
        code: newDeptCode.trim().toUpperCase(),
      });
      await refreshDepartments();
      setNewDepartmentId(created._id);
      setIsCreateDeptOpen(false);
      setNewDeptName('');
      setNewDeptCode('');
    } catch (err) {
      setDeptFormError(err.message || 'Lỗi khi tạo phòng ban mới');
    } finally {
      setDeptActionLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newRoleId) return;
    if (isCandidateRoleSelected && (!newFullname.trim() || !newDepartmentId)) {
      showToast('Tài khoản thí sinh bắt buộc phải có Họ tên và Phòng ban.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      const employeeInfo = isCandidateRoleSelected
        ? {
            fullname: newFullname.trim(),
            departmentId: newDepartmentId,
            employeeCode: newEmployeeCode.trim() || undefined,
            extraDepartmentIds: newExtraDepartmentIds,
          }
        : undefined;

      const res = await createUser(newUsername, newRoleId, employeeInfo);
      setIsCreateOpen(false);
      resetCreateForm();
      // Reload table
      await loadData();
      // Show temporary password
      setTempPasswordModal({
        isOpen: true,
        title: 'Tài khoản được tạo thành công!',
        username: res.data.username,
        password: res.tempPassword
      });
    } catch (err) {
      showToast(err.message || 'Không thể tạo tài khoản', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    if (!editingUser || !editingRoleId) return;
    setActionLoading(true);
    try {
      await updateUserRole(editingUser._id, editingRoleId);
      setIsEditRoleOpen(false);
      setEditingUser(null);
      setEditingRoleId('');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Không thể đổi quyền', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleLock = async (user) => {
    const actionText = user.isActive ? 'Khóa' : 'Mở khóa';
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ${actionText.toLowerCase()} tài khoản "${user.username}"?`,
      { title: `${actionText} tài khoản`, confirmLabel: actionText, danger: user.isActive }
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      await toggleUserLock(user._id, !user.isActive);
      await loadData();
    } catch (err) {
      showToast(err.message || `Lỗi khi ${actionText.toLowerCase()} tài khoản`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (user) => {
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn reset mật khẩu tài khoản "${user.username}"? Mật khẩu mới sẽ được sinh ngẫu nhiên.`,
      { title: 'Reset mật khẩu', confirmLabel: 'Reset', danger: false }
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      const tempPass = await resetUserPassword(user._id);
      setTempPasswordModal({
        isOpen: true,
        title: 'Đã reset mật khẩu thành công!',
        username: user.username,
        password: tempPass
      });
    } catch (err) {
      showToast(err.message || 'Lỗi khi reset mật khẩu', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tempPasswordModal.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // BƯỚC 1/2 — Xem trước import Excel hàng loạt nhân viên (role candidate):
  // chỉ đọc + phân loại từng dòng, CHƯA ghi gì vào DB — xem admin.service.js
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportPreview(null);
    setImportResult(null);
    try {
      const data = await previewImportEmployeesExcel(file);
      setImportPreview(data);
      // Điền sẵn mã gợi ý (lấy từ cột Mã phòng ban của file nếu có) cho các phòng còn thiếu mã
      setImportDeptCodes(
        Object.fromEntries((data.departments ?? []).filter((d) => d.needsCode).map((d) => [d.key, d.suggestedCode || ''])),
      );
    } catch (err) {
      showToast(err.message || 'Xem trước import thất bại', 'error');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // BƯỚC 2/2 — Admin đã xem preview và bấm xác nhận: ghi thật vào DB. Các
  // dòng 'conflict'/'error' trong preview sẽ tự động bị server bỏ qua.
  const handleConfirmImport = async () => {
    if (!importPreview?.rows?.length) return;
    if (Object.keys(importDeptProblems).length > 0) {
      showToast('Còn phòng ban chưa có mã hợp lệ — hãy nhập đủ mã (không trùng nhau) trước khi xác nhận.', 'warning');
      return;
    }
    setImportConfirming(true);
    try {
      const data = await confirmImportEmployeesExcel(importPreview.rows, importDeptCodes);
      setImportPreview(null);
      setImportDeptCodes({});
      setImportResult(data);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Import thất bại', 'error');
    } finally {
      setImportConfirming(false);
    }
  };

  // MỚI — Mở / lưu modal sửa phòng ban chính + phòng kiêm nhiệm của 1 nhân viên
  const openEditDepartments = (user) => {
    setEditDeptUser(user);
    setEditPrimaryDeptId(String(user.departmentId ?? ''));
    setEditExtraDeptIds((user.extraDepartments ?? []).map((d) => String(d._id)));
    setEditProfile({ ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, user[k] ?? ''])), dob: dobToInput(user.dob) });
    setIsEditDeptOpen(true);
  };

  const toggleEditExtraDepartment = (id) => {
    setEditExtraDeptIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleUpdateDepartments = async (e) => {
    e.preventDefault();
    if (!editDeptUser || !editPrimaryDeptId) return;
    setActionLoading(true);
    try {
      await updateUserProfile(editDeptUser._id, {
        ...editProfile,
        dob: dobFromInput(editProfile.dob),
        departmentId: editPrimaryDeptId,
        extraDepartmentIds: editExtraDeptIds,
      });
      setIsEditDeptOpen(false);
      setEditDeptUser(null);
      showToast('Đã cập nhật thông tin cá nhân', 'success');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Không thể cập nhật thông tin cá nhân', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Kiểm tra mã phòng ban admin nhập ở bước xem trước: phòng "cần mã" phải có mã và không trùng nhau.
  // (Trùng với phòng ban khác NGOÀI file này sẽ do server chặn khi xác nhận và báo rõ phòng nào.)
  const normalizeDeptCodeInput = (c) =>
    String(c ?? '').toUpperCase().replace(/Đ/g, 'D').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Z0-9]/g, '');
  const importDeptProblems = (() => {
    const problems = {};
    const used = new Map();
    for (const d of importPreview?.departments ?? []) {
      const code = normalizeDeptCodeInput(d.needsCode ? importDeptCodes[d.key] : d.currentCode);
      if (d.needsCode && !code) problems[d.key] = 'Chưa có mã';
      if (code) {
        if (used.has(code)) problems[d.key] = problems[d.key] ?? `Mã "${code}" trùng với phòng "${used.get(code)}"`;
        else used.set(code, d.name);
      }
    }
    return problems;
  })();

  // Filter users based on search term
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // MỚI: Xuất danh sách CHỈ tài khoản nhân viên (role candidate — không gồm
  // admin/examiner/leader) kèm username + mật khẩu tạm ra Excel. Hành động
  // này RESET mật khẩu tạm cho TOÀN BỘ tài khoản candidate đang hoạt động,
  // nên bắt buộc phải xác nhận rõ ràng trước khi thực hiện.
  const handleExportCandidateCredentials = async () => {
    const ok = await confirmAction(
      'Thao tác này sẽ RESET MẬT KHẨU của TẤT CẢ tài khoản nhân viên (thí sinh) đang hoạt động và xuất ra file Excel kèm mật khẩu mới. Mật khẩu cũ sẽ không còn dùng được. Bạn có chắc chắn muốn tiếp tục?',
      { title: 'Xuất danh sách nhân viên + reset mật khẩu', confirmLabel: 'Xuất & reset', danger: true }
    );
    if (!ok) return;

    setExportCredentialsLoading(true);
    try {
      await exportCandidateCredentialsExcel();
      showToast('Đã xuất danh sách và reset mật khẩu thành công', 'success');
    } catch (err) {
      showToast(err.message || 'Xuất danh sách thất bại', 'error');
    } finally {
      setExportCredentialsLoading(false);
    }
  };

  const isSelf = (user) => {
    const currentId = currentUser?._id || currentUser?.id;
    return user._id === currentId;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse"></div>
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm animate-pulse flex justify-between">
            <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
            <div className="h-6 w-1/4 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — mobile: xếp dọc, mỗi nút full-width cao 48px, luôn có nhãn chữ.
          Desktop (sm:): quay lại bố cục 1 hàng như cũ.
          MỚI — animate-fade-in-up: hiệu ứng xuất hiện khi tab vừa tải xong. */}
      <div className="animate-fade-in-up relative z-30 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6" style={{ '--stagger-delay': '0ms' }}>
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Tìm kiếm username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-10 pr-4 bg-white border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Nút thêm tài khoản — hành động chính, luôn full-width & nổi bật trên mobile */}
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-2 w-full h-12 sm:w-auto sm:order-3 px-4 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Thêm tài khoản</span>
        </button>

        {/* Các hành động phụ — xếp dọc, mỗi nút full-width trên mobile */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:order-2">
          <div className="relative" ref={columnMenuRef}>
            <button
              type="button"
              onClick={() => setIsColumnMenuOpen((v) => !v)}
              className="flex items-center justify-center gap-2 w-full sm:w-auto h-12 px-4 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              <Columns3 className="w-5 h-5" />
              <span>Cột hiển thị</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {isColumnMenuOpen && (
              <div className="absolute z-20 mt-2 w-full sm:w-56 left-0 sm:left-auto sm:right-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2">
                <p className="text-xs font-semibold text-slate-500 uppercase px-2 pb-1">Hiện/ẩn cột</p>
                {ACCOUNT_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-slate-50 cursor-pointer text-base text-slate-700 min-h-[44px]"
                  >
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      className="w-5 h-5 rounded border-slate-300 text-[#008BC5] focus:ring-[#008BC5]"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleExportCandidateCredentials}
            disabled={exportCredentialsLoading}
            title="Xuất danh sách nhân viên kèm username/mật khẩu — sẽ reset mật khẩu tất cả"
            className="flex items-center justify-center gap-2 w-full sm:w-auto h-12 px-4 bg-amber-50 border border-amber-300 text-amber-700 rounded-lg font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {exportCredentialsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            <span>Xuất DS nhân viên (kèm mật khẩu)</span>
          </button>
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="flex items-center justify-center gap-2 w-full sm:w-auto h-12 px-4 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {importLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span>Import Excel</span>
          </button>

          {/* "Xem nhanh": file Excel cần có cột gì? — tải file mẫu tiếng Việt
              kèm sheet hướng dẫn, hoặc xem nhanh bảng cột ngay tại đây mà
              không cần mở file. */}
          <div className="relative" ref={importGuideRef}>
            <button
              type="button"
              onClick={() => setIsImportGuideOpen((v) => !v)}
              className="flex items-center justify-center gap-2 w-full sm:w-auto h-12 px-4 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              <Info className="w-5 h-5" />
              <span>Xem nhanh: file cần cột gì?</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {isImportGuideOpen && (
              <div className="absolute z-20 mt-2 w-full sm:w-[26rem] left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-4 space-y-3">
                <a
                  href={IMPORT_EMPLOYEE_TEMPLATE_PATH}
                  download
                  className="flex items-center justify-center gap-2 w-full h-10 px-3 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải file Excel mẫu (kèm hướng dẫn)</span>
                </a>
                <div className="space-y-2">
                  {IMPORT_EMPLOYEE_COLUMNS_GUIDE.map((col) => (
                    <div key={col.label} className="text-xs border border-slate-100 rounded-lg p-2.5 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                            col.required ? 'bg-[#22C55E]' : 'bg-[#94A3B8]'
                          }`}
                        />
                        <span className="font-semibold text-slate-700">{col.label}</span>
                        {col.required && (
                          <span className="text-[10px] font-medium text-[#22C55E] bg-[#F0FDF4] px-1.5 py-0.5 rounded">
                            Bắt buộc
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mt-1 pl-4">{col.note}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Thiếu Mã nhân viên sẽ tự sinh mã tạm TMP&lt;số dòng&gt;. Username đăng nhập tự sinh từ Mã nhân viên.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table (Hidden on Mobile) — MỚI: animate cả khối bảng 1 lần,
          KHÔNG so le từng dòng — nếu bảng có nhiều người dùng, so le từng
          dòng sẽ khiến dòng cuối hiện rất trễ (vd 50 dòng x 60ms = 3s chờ),
          trong khi đây là bảng cần thấy toàn bộ ngay để tìm kiếm/dò dữ liệu. */}
      <div className="animate-fade-in-up hidden sm:block overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm" style={{ '--stagger-delay': '80ms' }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
              <th className="p-4 font-semibold">Tài khoản (Username)</th>
              {activeColumns.map((col) => (
                <th key={col.key} className="p-4 font-semibold whitespace-nowrap">{col.label}</th>
              ))}
              <th className="p-4 font-semibold">Phân quyền</th>
              <th className="p-4 font-semibold">Trạng thái</th>
              <th className="p-4 font-semibold text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredUsers.map(user => (
              <tr key={user._id} className="hover:bg-slate-50/50">
                <td className="p-4 font-medium text-[#0F172A]">{user.username} {isSelf(user) && <span className="text-xs text-slate-400 font-normal italic">(Bạn)</span>}</td>
                {activeColumns.map((col) => (
                  <td key={col.key} className="p-4 text-sm text-slate-600 whitespace-nowrap">
                    {user[col.key] || <span className="text-slate-300">—</span>}
                  </td>
                ))}
                <td className="p-4">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                    user.roleCode === 'admin' ? 'bg-purple-100 text-purple-700' :
                    user.roleCode === 'examiner' ? 'bg-blue-100 text-blue-700' :
                    user.roleCode === 'leader' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {user.roleName || user.roleCode}
                  </span>
                </td>
                <td className="p-4">
                  {user.isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-[#22C55E] font-medium">
                      <CheckCircleIcon className="w-4 h-4" /> Hoạt động
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-[#E53E3E] font-medium">
                      <Lock className="w-4 h-4" /> Đã khóa
                    </span>
                  )}
                </td>
                <td className="p-4 flex justify-end gap-2">
                  <button
                    disabled={isSelf(user) || actionLoading}
                    onClick={() => {
                      setEditingUser(user);
                      setEditingRoleId(user.roleId);
                      setIsEditRoleOpen(true);
                    }}
                    className="p-2 text-slate-500 hover:text-[#008BC5] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    title={isSelf(user) ? "Không thể đổi quyền của chính mình" : "Sửa phân quyền"}
                  >
                    <UserCog className="w-4 h-4" />
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => openEditDepartments(user)}
                    className="p-2 text-slate-500 hover:text-[#008BC5] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30"
                    title="Sửa thông tin cá nhân"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleResetPassword(user)}
                    className="p-2 text-slate-500 hover:text-[#F6AD37] hover:bg-[#FFFBEB] rounded-lg transition-colors disabled:opacity-30"
                    title="Reset mật khẩu"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  {user.isActive ? (
                    <button
                      disabled={isSelf(user) || actionLoading}
                      onClick={() => handleToggleLock(user)}
                      className="p-2 text-slate-500 hover:text-[#E53E3E] hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      title={isSelf(user) ? "Không thể tự khóa tài khoản của mình" : "Khóa tài khoản"}
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      disabled={isSelf(user) || actionLoading}
                      onClick={() => handleToggleLock(user)}
                      className="p-2 text-slate-500 hover:text-[#22C55E] hover:bg-green-50 rounded-lg transition-colors disabled:opacity-30"
                      title="Mở khóa tài khoản"
                    >
                      <Unlock className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile List (Hidden on Desktop) */}
      <div className="animate-fade-in-up sm:hidden space-y-4" style={{ '--stagger-delay': '80ms' }}>
        {filteredUsers.map(user => (
          <div key={user._id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <span className="font-bold text-[#0F172A]">
                {user.username} {isSelf(user) && <span className="text-xs text-slate-400 font-normal italic">(Bạn)</span>}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${
                user.roleCode === 'admin' ? 'bg-purple-100 text-purple-700' :
                user.roleCode === 'examiner' ? 'bg-blue-100 text-blue-700' :
                user.roleCode === 'leader' ? 'bg-emerald-100 text-emerald-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {user.roleName || user.roleCode}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              {user.isActive ? (
                <span className="text-[#22C55E] font-medium flex items-center gap-1"><CheckCircleIcon className="w-4 h-4" /> Hoạt động</span>
              ) : (
                <span className="text-[#E53E3E] font-medium flex items-center gap-1"><Lock className="w-4 h-4" /> Đã khóa</span>
              )}
            </div>

            {activeColumns.some((col) => user[col.key]) && (
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-500 pt-1">
                {activeColumns
                  .filter((col) => user[col.key])
                  .map((col) => (
                    <div key={col.key}>
                      <span className="text-slate-400">{col.label}: </span>
                      <span className="text-slate-700 font-medium">{user[col.key]}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={isSelf(user) || actionLoading}
                onClick={() => {
                  setEditingUser(user);
                  setEditingRoleId(user.roleId);
                  setIsEditRoleOpen(true);
                }}
                className="flex-1 min-h-[44px] text-sm font-medium text-[#008BC5] bg-blue-50 rounded-lg disabled:opacity-30"
              >
                Sửa quyền
              </button>
              <button
                disabled={actionLoading}
                onClick={() => openEditDepartments(user)}
                className="flex-1 min-h-[44px] text-sm font-medium text-[#008BC5] bg-blue-50 rounded-lg disabled:opacity-30"
              >
                Thông tin
              </button>
              <button
                disabled={actionLoading}
                onClick={() => handleResetPassword(user)}
                className="flex-1 min-h-[44px] text-sm font-medium text-[#F6AD37] bg-[#FFFBEB] rounded-lg disabled:opacity-30"
              >
                Mật khẩu
              </button>
              <button
                disabled={isSelf(user) || actionLoading}
                onClick={() => handleToggleLock(user)}
                className={`flex-1 min-h-[44px] text-sm font-medium rounded-lg disabled:opacity-30 ${user.isActive ? 'text-[#E53E3E] bg-red-50' : 'text-[#22C55E] bg-green-50'}`}
              >
                {user.isActive ? 'Khóa' : 'Mở khóa'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE USER MODAL */}
      {isCreateOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A]">Thêm tài khoản mới</h3>
                <button onClick={() => { setIsCreateOpen(false); resetCreateForm(); }} className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tên đăng nhập (Username)</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập username..."
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phân quyền (Role)</label>
                  <Select
                    required
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  >
                    <option value="">-- Chọn phân quyền --</option>
                    {roles.map(role => (
                      <option key={role._id} value={role._id}>{role.name}</option>
                    ))}
                  </Select>
                </div>

                {/* Chỉ hiện khi role được chọn là Thí sinh (candidate) — bắt buộc kèm hồ sơ nhân viên */}
                {isCandidateRoleSelected && (
                  <div className="space-y-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Hồ sơ nhân viên (bắt buộc cho tài khoản Thí sinh)</p>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Họ và tên</label>
                      <input
                        type="text"
                        required
                        placeholder="Nguyễn Văn A"
                        value={newFullname}
                        onChange={(e) => setNewFullname(e.target.value)}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Phòng ban</label>
                      <Select
                        required
                        value={newDepartmentId}
                        onChange={(e) => handleDepartmentSelectChange(e.target.value)}
                        className="w-full px-3.5 py-2 min-h-[44px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                      >
                        <option value="">-- Chọn phòng ban --</option>
                        {departments.map(dept => (
                          <option key={dept._id} value={dept._id}>{dept.name}</option>
                        ))}
                        {/* MỚI — Tạo phòng ban mới ngay tại đây, không phải thoát ra tab Phòng ban */}
                        <option value={CREATE_NEW_DEPARTMENT_VALUE}>+ Tạo phòng ban mới</option>
                      </Select>
                      {departments.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Chưa có phòng ban nào trong hệ thống — chọn "+ Tạo phòng ban mới" ở trên để tạo ngay.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Phòng kiêm nhiệm <span className="text-slate-400 font-normal">(không bắt buộc)</span>
                      </label>
                      <div className="border border-slate-300 rounded-lg p-2 max-h-36 overflow-y-auto space-y-0.5" data-lenis-prevent>
                        {departments.filter((d) => d._id !== newDepartmentId).map((dept) => (
                          <label
                            key={dept._id}
                            className={`flex items-center gap-2 text-sm px-1.5 py-1 rounded ${dept.code ? 'text-slate-700 cursor-pointer hover:bg-slate-50' : 'text-slate-400'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!dept.code}
                              checked={newExtraDepartmentIds.includes(dept._id)}
                              onChange={() => toggleNewExtraDepartment(dept._id)}
                            />
                            <span>{dept.name}</span>
                            {!dept.code && <span className="text-xs">(chưa có mã — bổ sung ở tab Phòng ban)</span>}
                          </label>
                        ))}
                        {departments.filter((d) => d._id !== newDepartmentId).length === 0 && (
                          <p className="text-xs text-slate-400 px-1">Chưa có phòng ban nào khác để chọn.</p>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Mỗi kỳ thi, nhân viên chọn 1 vai trò (phòng chính hoặc phòng kiêm nhiệm) để thi.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Mã nhân viên <span className="text-slate-400 font-normal">(không bắt buộc)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="NV-001"
                        value={newEmployeeCode}
                        onChange={(e) => setNewEmployeeCode(e.target.value)}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => { setIsCreateOpen(false); resetCreateForm(); }}
                    className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MỚI — MODAL CON: TẠO PHÒNG BAN MỚI */}
      {isCreateDeptOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A]">Tạo phòng ban mới</h3>
                <button
                  type="button"
                  onClick={() => { setIsCreateDeptOpen(false); setNewDeptName(''); setNewDeptCode(''); setDeptFormError(''); }}
                  className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateDepartmentInline} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                {deptFormError && (
                  <div className="p-3.5 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-center gap-2.5 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{deptFormError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Mã bộ phận (Ví dụ: XDM1)</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập mã viết tắt..."
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tên phòng ban</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập tên phòng ban..."
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                  />
                </div>
                <div className="pt-2 flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => { setIsCreateDeptOpen(false); setNewDeptName(''); setNewDeptCode(''); setDeptFormError(''); }}
                    className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={deptActionLoading}
                    className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                  >
                    {deptActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* EDIT DEPARTMENTS MODAL — sửa phòng ban chính + phòng kiêm nhiệm */}
      {isEditDeptOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A]">Sửa thông tin cá nhân</h3>
                <button onClick={() => { setIsEditDeptOpen(false); setEditDeptUser(null); }} className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleUpdateDepartments} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-sm font-semibold text-slate-500">Tài khoản</label>
                  <p className="text-base font-bold text-[#0F172A] mt-0.5">{editDeptUser?.username}</p>
                </div>
                {[['fullname', 'Họ tên', true], ['employeeCode', 'Mã nhân viên']].map(([key, label, required]) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
                    <input
                      required={required}
                      value={editProfile[key] ?? ''}
                      onChange={(e) => setEditProfile((p) => ({ ...p, [key]: e.target.value }))}
                      className={PROFILE_INPUT_CLASS}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phòng ban chính</label>
                  <Select
                    required
                    value={editPrimaryDeptId}
                    onChange={(e) => {
                      setEditPrimaryDeptId(e.target.value);
                      setEditExtraDeptIds((prev) => prev.filter((id) => id !== e.target.value));
                    }}
                    className="w-full px-3.5 py-2 min-h-[44px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  >
                    <option value="" disabled>-- Chọn phòng ban --</option>
                    {departments.map((dept) => (
                      <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Phòng kiêm nhiệm <span className="text-slate-400 font-normal">(không bắt buộc)</span>
                  </label>
                  <div className="border border-slate-300 rounded-lg p-2 max-h-44 overflow-y-auto space-y-0.5" data-lenis-prevent>
                    {departments.filter((d) => d._id !== editPrimaryDeptId).map((dept) => (
                      <label
                        key={dept._id}
                        className={`flex items-center gap-2 text-sm px-1.5 py-1 rounded ${dept.code ? 'text-slate-700 cursor-pointer hover:bg-slate-50' : 'text-slate-400'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!dept.code}
                          checked={editExtraDeptIds.includes(dept._id)}
                          onChange={() => toggleEditExtraDepartment(dept._id)}
                        />
                        <span>{dept.name}</span>
                        {!dept.code && <span className="text-xs">(chưa có mã — bổ sung ở tab Phòng ban)</span>}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Giới tính</label>
                  <Select
                    value={editProfile.gender ?? ''}
                    onChange={(e) => setEditProfile((p) => ({ ...p, gender: e.target.value }))}
                    className={PROFILE_INPUT_CLASS}
                  >
                    <option value="">—</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Ngày sinh</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={editProfile.dob ?? ''}
                    onChange={(e) => setEditProfile((p) => ({ ...p, dob: e.target.value }))}
                    className={PROFILE_INPUT_CLASS}
                  />
                </div>
                {[['phone', 'Số điện thoại'], ['address', 'Địa chỉ'], ['position', 'Chức vụ']].map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
                    <input
                      value={editProfile[key] ?? ''}
                      onChange={(e) => setEditProfile((p) => ({ ...p, [key]: e.target.value }))}
                      className={PROFILE_INPUT_CLASS}
                    />
                  </div>
                ))}
                <div className="pt-2 flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => { setIsEditDeptOpen(false); setEditDeptUser(null); }}
                    className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* EDIT ROLE MODAL */}
      {isEditRoleOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A]">Sửa phân quyền</h3>
                <button onClick={() => { setIsEditRoleOpen(false); setEditingUser(null); }} className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleUpdateRole} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-sm font-semibold text-slate-500">Tài khoản</label>
                  <p className="text-base font-bold text-[#0F172A] mt-0.5">{editingUser?.username}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phân quyền mới</label>
                  <Select
                    required
                    value={editingRoleId}
                    onChange={(e) => setEditingRoleId(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  >
                    {roles.map(role => (
                      <option key={role._id} value={role._id}>{role.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="pt-2 flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => { setIsEditRoleOpen(false); setEditingUser(null); }}
                    className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Cập nhật
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* TEMPORARY PASSWORD DISPLAY MODAL */}
      {tempPasswordModal.isOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200" data-lenis-prevent>
              <div className="p-4 sm:p-6 text-center space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div className="w-16 h-16 bg-[#22C55E]/10 rounded-full flex items-center justify-center mx-auto text-[#22C55E]">
                  <Eye className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-xl text-[#0F172A]">{tempPasswordModal.title}</h3>
              
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100 text-left">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">Tên đăng nhập</span>
                    <span className="text-sm font-semibold text-[#0F172A]">{tempPasswordModal.username}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 relative">
                    <span className="text-xs text-slate-500 block font-medium">Mật khẩu tạm thời</span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-lg font-mono font-bold text-[#E53E3E] tracking-wider select-all">{tempPasswordModal.password}</span>
                      <button
                        onClick={copyToClipboard}
                        type="button"
                        className="flex items-center gap-1 text-xs text-[#008BC5] hover:text-[#007ba1] font-semibold bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[#22C55E]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FFFBEB] p-3 rounded-lg border border-[#F6AD37]/40 text-left text-xs text-[#92400E] font-medium">
                  ⚠️ Mật khẩu tạm này chỉ hiển thị duy nhất một lần. Hãy sao chép hoặc tải file, rồi gửi cho người dùng. Họ sẽ bắt buộc phải đổi mật khẩu khi đăng nhập lần đầu.
                </div>

                <button
                  type="button"
                  onClick={() => downloadSingleAccountCredential({
                    title: tempPasswordModal.title,
                    username: tempPasswordModal.username,
                    password: tempPasswordModal.password,
                  })}
                  className="w-full py-3 min-h-[46px] bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 rotate-180" /> Tải file tài khoản (username + mật khẩu)
                </button>

                <button
                  type="button"
                  onClick={() => setTempPasswordModal({ isOpen: false, title: '', username: '', password: '' })}
                  className="w-full py-3 min-h-[46px] bg-[#0F172A] text-white rounded-lg font-semibold hover:bg-slate-800 active:bg-slate-800 transition-colors shadow-md"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* IMPORT EXCEL — XEM TRƯỚC & XÁC NHẬN MODAL (bước 1/2) */}
      {importPreview && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90dvh] my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A] flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#008BC5]" /> Xem trước import — chưa ghi vào hệ thống
                </h3>
                <button
                  onClick={() => setImportPreview(null)}
                  disabled={importConfirming}
                  className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center">
                  <div className="bg-[#F0FDF4] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#22C55E]">{importPreview.toCreate}</div>
                    <div className="text-sm text-slate-500">Tạo mới</div>
                  </div>
                  <div className="bg-[#FFF7ED] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#F6AD37]">{importPreview.toReuse}</div>
                    <div className="text-sm text-slate-500">Tái sử dụng</div>
                  </div>
                  <div className="bg-[#EAF6FF] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#008BC5]">{importPreview.toUpdate}</div>
                    <div className="text-sm text-slate-500">Cập nhật</div>
                  </div>
                  <div className="bg-[#FEECEC] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#E53E3E]">{importPreview.conflicts}</div>
                    <div className="text-sm text-slate-500">Trùng t.khoản</div>
                  </div>
                  <div className="bg-[#FEECEC] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#E53E3E]">{importPreview.duplicatesInFile}</div>
                    <div className="text-sm text-slate-500">Trùng trong file</div>
                  </div>
                  <div className="bg-[#FEECEC] rounded-lg p-3">
                    <div className="text-xl font-bold text-[#E53E3E]">{importPreview.errors}</div>
                    <div className="text-sm text-slate-500">Lỗi dữ liệu</div>
                  </div>
                </div>

                {(importPreview.duplicatesInFile > 0) && (
                  <div className="bg-[#FEECEC] border border-[#E53E3E]/40 rounded-lg p-3 text-xs text-[#7F1D1D] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Có mã nhân viên xuất hiện ở <b>nhiều dòng trong cùng file</b> — các dòng này bị bỏ qua vì không thể xác định dòng nào đúng. Hãy sửa lại file (mỗi mã chỉ giữ 1 dòng) rồi import lại riêng các dòng đó.
                    </span>
                  </div>
                )}

                {(importPreview.toReuse > 0) && (
                  <div className="bg-[#FFF7ED] border border-[#F6AD37]/40 rounded-lg p-3 text-xs text-[#92400E] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Các dòng "Tái sử dụng" bên dưới sẽ <b>mở khóa và ghi đè</b> lên tài khoản đã bị khóa của nhân viên cũ (tên nhân viên cũ được ghi rõ ở từng dòng). Hãy kiểm tra kỹ trước khi xác nhận.
                    </span>
                  </div>
                )}

                {importPreview.departments?.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 text-sm font-semibold text-slate-700 flex items-center justify-between gap-2">
                      <span>Phòng ban trong file ({importPreview.departments.length})</span>
                      {importPreview.departmentsNeedingCode > 0 && (
                        <span className="text-xs font-medium text-amber-600">{importPreview.departmentsNeedingCode} phòng cần nhập mã</span>
                      )}
                    </div>
                    {importPreview.departments.some((d) => d.isNew) && (
                      <div className="px-3 py-2 bg-[#FFF7ED] border-b border-[#F6AD37]/30 text-xs text-[#92400E] flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Có phòng ban <b>MỚI</b> sẽ được tạo khi xác nhận — hãy kiểm tra tên không bị gõ sai chính tả (tên sai sẽ thành một phòng ban riêng).</span>
                      </div>
                    )}
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto" data-lenis-prevent>
                      {importPreview.departments.map((d) => (
                        <div key={d.key} className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800 truncate">{d.name}</div>
                            <div className="text-xs text-slate-500">
                              {d.isNew ? 'Phòng ban MỚI — sẽ được tạo' : d.willReactivate ? 'Đã ngừng hoạt động — sẽ được khôi phục' : 'Đã có trong hệ thống'}
                              {' · '}
                              {[d.primaryCount > 0 && `phòng chính: ${d.primaryCount} dòng`, d.extraCount > 0 && `kiêm nhiệm: ${d.extraCount} dòng`].filter(Boolean).join(', ')}
                            </div>
                            {importDeptProblems[d.key] && (
                              <div className="text-xs text-[#E53E3E] mt-0.5">{importDeptProblems[d.key]}</div>
                            )}
                            {!importDeptProblems[d.key] && d.needsCode && importDeptCodes[d.key] === d.suggestedCode && d.issues?.map((msg) => (
                              <div key={msg} className="text-xs text-[#E53E3E] mt-0.5">{msg}</div>
                            ))}
                          </div>
                          <div className="sm:w-44 shrink-0">
                            {d.needsCode ? (
                              <input
                                type="text"
                                value={importDeptCodes[d.key] ?? ''}
                                onChange={(e) => setImportDeptCodes((prev) => ({ ...prev, [d.key]: e.target.value.toUpperCase() }))}
                                placeholder="Nhập mã phòng ban"
                                className={`w-full px-3 py-1.5 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#008BC5] ${importDeptProblems[d.key] ? 'border-[#E53E3E]' : 'border-slate-300'}`}
                              />
                            ) : (
                              <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-mono">Mã: {d.currentCode}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto" data-lenis-prevent>
                  {importPreview.rows.map((r) => (
                    <div key={r.rowIndex} className="p-3 text-sm flex items-start gap-2">
                      <span className="text-slate-400 w-14 shrink-0">Dòng {r.rowIndex}</span>
                      <div className="flex-1 min-w-0">
                        {r.action === 'create' && (
                          <span className="text-[#22C55E] font-medium">Tạo mới — {r.fullname} ({r.employeeCode})</span>
                        )}
                        {r.action === 'reuse' && (
                          <span className="text-[#F6AD37] font-medium">
                            Tái sử dụng — {r.fullname} ({r.employeeCode}), ghi đè lên tài khoản "{r.reuseTarget?.username}" hiện là "{r.reuseTarget?.fullname}"
                          </span>
                        )}
                        {r.action === 'update' && (
                          <span className="text-[#008BC5] font-medium">
                            Cập nhật hồ sơ — {r.fullname} ({r.employeeCode}), tài khoản "{r.updateTarget?.username}"
                          </span>
                        )}
                        {r.action === 'conflict' && (
                          <span className="text-[#E53E3E] font-medium">
                            Trùng tài khoản đang hoạt động "{r.conflictWith?.username}" ({r.conflictWith?.fullname || r.conflictWith?.employeeCode}) — bỏ qua, hãy sửa lại file
                          </span>
                        )}
                        {r.action === 'duplicate_in_file' && (
                          <span className="text-[#E53E3E] font-medium">
                            Trùng mã trong file — {r.fullname} ({r.employeeCode}), trùng với dòng {r.duplicateRows?.join(', ')} — bỏ qua, hãy sửa lại file
                          </span>
                        )}
                        {r.action === 'error' && (
                          <span className="text-[#E53E3E] font-medium">Lỗi — {r.message}</span>
                        )}
                        {['create', 'reuse', 'update'].includes(r.action) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Phòng chính: <b>{r.departmentName}</b>
                            {r.extraDepartments?.length > 0 && (
                              <> · Kiêm nhiệm: <b>{r.extraDepartments.map((e) => e.name).join('; ')}</b></>
                            )}
                            {r.action === 'update' && !r.extrasProvided && ' · (giữ nguyên phòng kiêm nhiệm hiện có)'}
                          </p>
                        )}
                        {r.warnings?.map((w) => (
                          <p key={w} className="text-xs text-amber-600 mt-0.5 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    disabled={importConfirming}
                    className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importConfirming || (importPreview.toCreate + importPreview.toReuse + importPreview.toUpdate === 0) || Object.keys(importDeptProblems).length > 0}
                    className="flex-1 py-2.5 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {importConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Xác nhận nhập ({importPreview.toCreate + importPreview.toReuse + importPreview.toUpdate} dòng)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* IMPORT EXCEL — KẾT QUẢ MODAL (bước 2/2, sau khi đã ghi thật) */}
      {importResult && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
              <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-lg text-[#0F172A] flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#008BC5]" /> Kết quả import
                </h3>
                <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-[#F0FDF4] rounded-lg p-3">
                    <div className="text-2xl font-bold text-[#22C55E]">{importResult.created}</div>
                    <div className="text-sm text-slate-500">Tạo mới</div>
                  </div>
                  <div className="bg-[#FFF7ED] rounded-lg p-3">
                    <div className="text-2xl font-bold text-[#F6AD37]">{importResult.reused}</div>
                    <div className="text-sm text-slate-500">Tái sử dụng</div>
                  </div>
                  <div className="bg-[#EAF6FF] rounded-lg p-3">
                    <div className="text-2xl font-bold text-[#008BC5]">{importResult.updated}</div>
                    <div className="text-sm text-slate-500">Cập nhật</div>
                  </div>
                  <div className="bg-[#FEECEC] rounded-lg p-3">
                    <div className="text-2xl font-bold text-[#E53E3E]">{importResult.failed}</div>
                    <div className="text-sm text-slate-500">Lỗi</div>
                  </div>
                </div>

                {importResult.failed > 0 && (
                  <div className="bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg p-3 text-xs text-[#92400E] max-h-32 overflow-y-auto space-y-1" data-lenis-prevent>
                    <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Các dòng lỗi:</p>
                    {importResult.results.filter(r => r.status === 'error').map(r => (
                      <p key={r.row}>Dòng {r.row}: {r.message}</p>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => downloadImportResultsCsv(importResult.results)}
                  className="w-full py-2.5 bg-[#0F172A] text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 rotate-180" /> Tải file kết quả (username + mật khẩu)
                </button>
                <p className="text-xs text-slate-400 text-center">
                  File chứa mật khẩu tạm — chỉ tải được 1 lần từ đây, hãy lưu lại cẩn thận.
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

const CheckCircleIcon = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);