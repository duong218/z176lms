/**
 * Service Quản lý Người dùng & Nhân sự (User Service).
 * Xử lý: CRUD tài khoản, Phân quyền Role, Khóa/Mở khóa (kèm mốc purge 6 tháng), Reset mật khẩu, Tái sử dụng tài khoản đã khóa, Xuất thông tin đăng nhập và Import Excel nhân viên 2 bước.
 */

import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import crypto from 'crypto';
import fs from 'fs';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { User, Role, Employee, Department, ExamCandidate, ExamAttempt, ATTEMPT_STATUS } from '../models/index.js';
import { normalizeDeptName } from '../models/department.model.js';
import { ApiError } from '../utils/api-error.js';
import * as auditService from './audit.service.js';
import { assignEmployeeToActiveExamIfAny } from './exam-code-generation.service.js';
import { ensureDepartmentsForImport } from './department.service.js';
import {
  formatDepartmentCell,
  resolveRowDepartments,
  summarizeImportDepartments,
} from '../utils/import-departments.js';

// Lượt thi in_progress chỉ được coi là "còn sống" nếu có hoạt động (heartbeat/answer/my-exam) trong khoảng này.
// Gấp đôi INACTIVITY_TIMEOUT_MS (1 phút) của exam-attempt.service.js; client gửi heartbeat mỗi 15 giây nên lượt thi đang được làm thật luôn mới hơn nhiều.
// Hệ thống không có scheduler dọn lượt thi: thí sinh tắt máy giữa bài thì lượt thi nằm in_progress mãi, không được chặn đổi vai trò vĩnh viễn.
const ATTEMPT_ALIVE_WINDOW_MS = 2 * 60_000;

// Lấy danh sách toàn bộ người dùng kèm thông tin vai trò (Role) và hồ sơ nhân sự (Employee)
export async function listUsers() {
  const users = await User.find().populate('roleId', 'code name').sort({ createdAt: -1 }).lean();

  const employees = await Employee.find({ userId: { $in: users.map((u) => u._id) } })
    .populate('departmentId', 'name code')
    .populate('extraDepartmentIds', 'name code')
    .lean();
  const employeeByUserId = new Map(employees.map((e) => [e.userId.toString(), e]));

  return users.map((u) => {
    const emp = employeeByUserId.get(u._id.toString());
    return {
      ...u,
      fullname: emp?.fullname ?? '',
      employeeCode: emp?.employeeCode ?? '',
      departmentId: emp?.departmentId?._id ?? emp?.departmentId ?? '',
      departmentName: emp?.departmentId?.name ?? '',
      departmentCode: emp?.departmentId?.code ?? '',
      // Phòng ban kiêm nhiệm: [{ _id, name, code }]
      extraDepartments: (emp?.extraDepartmentIds ?? []).map((d) => ({ _id: d._id, name: d.name, code: d.code ?? '' })),
      dob: emp?.dob ?? '',
      gender: emp?.gender ?? '',
      phone: emp?.phone ?? '',
      address: emp?.address ?? '',
      position: emp?.position ?? '',
    };
  });
}

// Sinh ngẫu nhiên mật khẩu tạm 6 chữ số và mã hóa bcrypt hash
async function generateTempPassword() {
  const tempPassword = crypto.randomInt(100000, 999999).toString();
  const passwordHash = await bcrypt.hash(tempPassword, env.bcryptSaltRounds);
  return { tempPassword, passwordHash };
}

// Tìm kiếm tài khoản đã tồn tại theo Mã nhân viên hoặc Tên đăng nhập để kiểm tra điều kiện tái sử dụng
async function findExistingAccountForReuse({ employeeCode, username }) {
  if (employeeCode) {
    const employee = await Employee.findOne({ employeeCode });
    if (employee) {
      const user = await User.findById(employee.userId).select('+passwordHash');
      if (user) return { existingUser: user, existingEmployee: employee };
    }
  }

  if (username) {
    const user = await User.findOne({ username: username.toLowerCase() }).select('+passwordHash');
    if (user) {
      const employee = await Employee.findOne({ userId: user._id });
      return { existingUser: user, existingEmployee: employee ?? null };
    }
  }

  return { existingUser: null, existingEmployee: null };
}

// Tái kích hoạt tài khoản đã bị khóa (nhân viên cũ đã nghỉ) để cấp lại cho nhân viên mới cùng mã
async function reactivateLockedAccount({
  adminId,
  existingUser,
  existingEmployee,
  newUsername,
  employeeData,
  ipAddress,
}) {
  if (newUsername && newUsername !== existingUser.username) {
    const usernameTaken = await User.findOne({
      username: newUsername,
      _id: { $ne: existingUser._id },
    });
    if (usernameTaken) {
      throw new ApiError(
        400,
        `Username "${newUsername}" đã được tài khoản khác sử dụng`,
        'USERNAME_EXISTS',
      );
    }
    existingUser.username = newUsername;
  }

  const { tempPassword, passwordHash } = await generateTempPassword();
  existingUser.passwordHash = passwordHash;
  existingUser.mustChangePassword = true;
  existingUser.isActive = true;
  existingUser.failedLoginAttempts = 0;
  existingUser.lockUntil = undefined;
  existingUser.lockedAt = undefined;
  existingUser.tokenVersion += 1;
  await existingUser.save();

  let employee = existingEmployee;
  if (employee) {
    employee.fullname = employeeData.fullname;
    employee.departmentId = employeeData.departmentId;
    employee.extraDepartmentIds = employeeData.extraDepartmentIds ?? [];
    employee.employeeCode = employeeData.employeeCode || employee.employeeCode;
    employee.dob = employeeData.dob ?? '';
    employee.gender = employeeData.gender ?? '';
    employee.phone = employeeData.phone ?? '';
    employee.address = employeeData.address ?? '';
    employee.position = employeeData.position ?? '';
    employee.isActive = true;
    await employee.save();
  } else {
    employee = await Employee.create({
      fullname: employeeData.fullname,
      departmentId: employeeData.departmentId,
      extraDepartmentIds: employeeData.extraDepartmentIds ?? [],
      userId: existingUser._id,
      employeeCode: employeeData.employeeCode || undefined,
      dob: employeeData.dob ?? '',
      gender: employeeData.gender ?? '',
      phone: employeeData.phone ?? '',
      address: employeeData.address ?? '',
      position: employeeData.position ?? '',
      isActive: true,
    });
  }

  await auditService.writeAudit({
    actorUserId: adminId,
    action: 'Tái sử dụng tài khoản đã khóa',
    resourceType: 'User',
    resourceId: existingUser._id,
    metadata: {
      username: existingUser.username,
      employeeCode: employee.employeeCode,
      detail: 'Tài khoản của nhân viên đã nghỉ (bị khóa) được cấp lại cho nhân viên mới cùng mã',
    },
    ipAddress,
  });

  const userObj = existingUser.toObject();
  delete userObj.passwordHash;
  return { user: userObj, tempPassword, employee };
}

// Kiểm tra và chuẩn hóa danh sách phòng ban kiêm nhiệm: không trùng phòng chính, không trùng nhau,
// phải tồn tại + đang hoạt động + ĐÃ CÓ MÃ (mọi phòng tham gia thi theo vai trò đều phải có mã).
async function normalizeExtraDepartmentIds(primaryId, rawIds) {
  if (rawIds === undefined || rawIds === null) return [];
  if (!Array.isArray(rawIds)) {
    throw new ApiError(400, 'extraDepartmentIds phải là mảng', 'INVALID_FIELD');
  }
  const unique = [...new Set(rawIds.map(String))];
  for (const id of unique) {
    if (!mongoose.isValidObjectId(id)) {
      throw new ApiError(400, 'extraDepartmentIds chứa ID không hợp lệ', 'INVALID_FIELD');
    }
  }
  if (unique.includes(String(primaryId))) {
    throw new ApiError(400, 'Phòng kiêm nhiệm không được trùng với phòng chính', 'EXTRA_DEPARTMENT_DUPLICATE');
  }
  if (!unique.length) return [];

  const found = await Department.find({ _id: { $in: unique }, isActive: true }).select('_id name code').lean();
  if (found.length !== unique.length) {
    throw new ApiError(
      400,
      'Có phòng kiêm nhiệm không tồn tại hoặc đã ngừng hoạt động',
      'EXTRA_DEPARTMENT_NOT_FOUND',
    );
  }
  const withoutCode = found.filter((d) => !d.code);
  if (withoutCode.length) {
    throw new ApiError(
      400,
      `Phòng ban ${withoutCode.map((d) => `"${d.name}"`).join(', ')} chưa có mã phòng ban — hãy bổ sung mã ở tab Phòng ban trước khi dùng làm phòng kiêm nhiệm`,
      'EXTRA_DEPARTMENT_NO_CODE',
    );
  }
  return unique;
}

// Tạo tài khoản người dùng mới (tự động tạo kèm hồ sơ Employee nếu là Thí sinh)
export async function createUser({ adminId, username, roleId, ipAddress, employeeInfo }) {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new ApiError(400, 'Vai trò không hợp lệ', 'ROLE_NOT_FOUND');
  }

  const isCandidate = role.code === 'candidate';
  if (isCandidate) {
    if (!employeeInfo?.fullname || !employeeInfo?.departmentId) {
      throw new ApiError(
        400,
        'Tài khoản thí sinh bắt buộc phải có họ tên và phòng ban',
        'MISSING_EMPLOYEE_FIELDS',
      );
    }
  }

  // Phòng kiêm nhiệm (nếu có) — chỉ áp dụng cho tài khoản thí sinh
  const extraDepartmentIds = isCandidate
    ? await normalizeExtraDepartmentIds(employeeInfo.departmentId, employeeInfo.extraDepartmentIds)
    : [];

  // Kiểm tra trùng lặp và kích hoạt lại tài khoản cũ nếu đang bị khóa
  {
    const { existingUser, existingEmployee } = await findExistingAccountForReuse({
      employeeCode: isCandidate ? employeeInfo?.employeeCode : undefined,
      username,
    });

    if (existingUser) {
      if (existingUser.isActive) {
        const conflictField = existingEmployee?.employeeCode ? 'Mã nhân viên' : 'Tên đăng nhập';
        throw new ApiError(
          409,
          `${conflictField} đã tồn tại và tài khoản đang hoạt động`,
          existingEmployee?.employeeCode ? 'EMPLOYEE_CODE_ACTIVE' : 'USERNAME_EXISTS',
        );
      }

      if (!isCandidate) {
        throw new ApiError(400, 'Tên đăng nhập đã tồn tại', 'USERNAME_EXISTS');
      }

      const { user, tempPassword, employee } = await reactivateLockedAccount({
        adminId,
        existingUser,
        existingEmployee,
        newUsername: username?.toLowerCase(),
        employeeData: { ...employeeInfo, extraDepartmentIds },
        ipAddress,
      });
      await assignEmployeeToActiveExamIfAny(employee).catch(() => {});
      return { user, tempPassword, employee, reused: true };
    }
  }

  const { tempPassword, passwordHash } = await generateTempPassword();

  const newUser = await User.create({
    username: username.toLowerCase(),
    roleId,
    passwordHash,
    mustChangePassword: true,
  });

  let employee = null;
  if (isCandidate) {
    try {
      employee = await Employee.create({
        fullname: employeeInfo.fullname,
        departmentId: employeeInfo.departmentId,
        extraDepartmentIds,
        userId: newUser._id,
        employeeCode: employeeInfo.employeeCode || undefined,
        isActive: true,
      });
    } catch (err) {
      await User.deleteOne({ _id: newUser._id });
      throw new ApiError(
        400,
        `Không thể tạo hồ sơ nhân viên: ${err.message}`,
        'EMPLOYEE_CREATE_FAILED',
      );
    }

    await assignEmployeeToActiveExamIfAny(employee);
  }

  const userObj = newUser.toObject();
  delete userObj.passwordHash;
  return { user: userObj, tempPassword, employee, reused: false };
}


// Cập nhật vai trò (Role) cho người dùng
export async function updateUserRole({ adminId, userId, newRoleId, ipAddress }) {
  if (adminId.toString() === userId.toString()) {
    throw new ApiError(403, 'Không thể tự đổi quyền của chính mình', 'CANNOT_CHANGE_OWN_ROLE');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  const role = await Role.findById(newRoleId).select('code');
  if (!role) throw new ApiError(400, 'Vai trò không hợp lệ', 'ROLE_NOT_FOUND');

  const isCandidate = role.code === 'candidate';
  const employee = isCandidate ? await Employee.findOne({ userId }) : null;
  if (isCandidate && !employee) {
    throw new ApiError(
      400,
      'Tài khoản chưa có thông tin cá nhân. Bấm biểu tượng bút để nhập họ tên và phòng ban trước khi chuyển thành thí sinh',
      'EMPLOYEE_PROFILE_REQUIRED',
    );
  }

  // Đang có lượt thi CÒN HOẠT ĐỘNG thì không đổi vai trò: mọi API làm bài yêu cầu vai trò candidate nên bài sẽ ngừng lưu/nộp được.
  // Chỉ tính lượt thi in_progress chưa hết giờ và có hoạt động trong ATTEMPT_ALIVE_WINDOW_MS gần nhất; lượt thi bị bỏ rơi thì không chặn.
  const currentEmployee = await Employee.findOne({ userId }).select('_id');
  if (currentEmployee) {
    const candidateIds = await ExamCandidate.find({ employeeId: currentEmployee._id }).distinct('_id');
    const now = new Date();
    const inProgress = await ExamAttempt.exists({
      examCandidateId: { $in: candidateIds },
      status: ATTEMPT_STATUS.IN_PROGRESS,
      expiresAt: { $gt: now },
      lastActiveAt: { $gte: new Date(now.getTime() - ATTEMPT_ALIVE_WINDOW_MS) },
    });
    if (inProgress) {
      throw new ApiError(
        409,
        'Người dùng đang có lượt thi chưa nộp. Hãy đợi họ nộp bài xong rồi mới đổi vai trò',
        'ATTEMPT_IN_PROGRESS',
      );
    }
  }

  user.roleId = newRoleId;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // thu hồi phiên cũ: người dùng phải đăng nhập lại với vai trò mới
  await user.save();
  // Hồ sơ Employee của non-candidate luôn inactive -> không bị tính là thí sinh khi sinh mã đề / gán kỳ thi.
  await Employee.updateOne({ userId }, { isActive: isCandidate });
  if (employee) {
    employee.isActive = true;
    await assignEmployeeToActiveExamIfAny(employee).catch(() => {}); // vào ngay kỳ thi đang phát hành (nếu có); lỗi gán không làm hỏng việc đổi role
  }

  return user;
}

// Sửa thông tin cá nhân của MỌI role; chưa có hồ sơ Employee thì tạo (inactive nếu không phải candidate).
export async function updateUserProfile({ userId, profile }) {
  const user = await User.findById(userId).populate('roleId', 'code');
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  const { fullname, departmentId, extraDepartmentIds, employeeCode, dob, gender, phone, address, position } = profile;
  if (!fullname?.trim() || !departmentId) {
    throw new ApiError(400, 'Bắt buộc phải có họ tên và phòng ban', 'MISSING_EMPLOYEE_FIELDS');
  }
  if (!mongoose.isValidObjectId(departmentId)) {
    throw new ApiError(400, 'departmentId không hợp lệ', 'INVALID_FIELD');
  }
  const dept = await Department.findOne({ _id: departmentId, isActive: true });
  if (!dept) throw new ApiError(400, 'Phòng ban chính không tồn tại hoặc đã ngừng hoạt động', 'DEPARTMENT_NOT_FOUND');
  if (dob && !/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
    throw new ApiError(400, 'Ngày sinh phải có dạng dd/mm/yyyy', 'INVALID_FIELD');
  }

  const employee =
    (await Employee.findOne({ userId })) ??
    new Employee({ userId, isActive: user.roleId?.code === 'candidate' });
  employee.set({
    fullname,
    departmentId: dept._id,
    extraDepartmentIds: await normalizeExtraDepartmentIds(dept._id, extraDepartmentIds),
    employeeCode: employeeCode?.trim() || undefined,
    dob: dob ?? '',
    gender: gender ?? '',
    phone: phone ?? '',
    address: address ?? '',
    position: position ?? '',
  });
  try {
    await employee.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, `Mã nhân viên "${employeeCode}" đã được dùng cho tài khoản khác`, 'EMPLOYEE_CODE_DUPLICATE');
    }
    throw err;
  }
  return { username: user.username, fullname: employee.fullname };
}

// Khóa hoặc Mở khóa tài khoản (lưu mốc lockedAt và tăng tokenVersion để thu hồi phiên đăng nhập)
export async function toggleUserLock({ adminId, userId, isActive, ipAddress }) {
  if (adminId.toString() === userId.toString()) {
    throw new ApiError(403, 'Không thể tự khóa/mở khóa tài khoản của chính mình', 'CANNOT_LOCK_SELF');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  user.isActive = isActive;
  user.lockedAt = isActive ? undefined : new Date();
  user.tokenVersion += 1;
  await user.save();

  return user;
}

// Reset mật khẩu người dùng về mật khẩu tạm ngẫu nhiên 6 chữ số
export async function resetUserPassword({ adminId, userId, ipAddress }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  const { tempPassword, passwordHash } = await generateTempPassword();

  user.passwordHash = passwordHash;
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();

  return { tempPassword };
}

// Xuất file Excel danh sách thông tin đăng nhập của toàn bộ Thí sinh (kèm reset mật khẩu tạm mới)
export async function exportCandidateCredentialsExcel({ adminId, ipAddress }) {
  const candidateRole = await Role.findOne({ code: 'candidate' });
  if (!candidateRole) {
    throw new ApiError(500, 'Không tìm thấy role "candidate" trong hệ thống', 'ROLE_NOT_FOUND');
  }

  const users = await User.find({ roleId: candidateRole._id, isActive: true }).sort({ username: 1 });
  if (!users.length) {
    throw new ApiError(404, 'Không có tài khoản nhân viên nào đang hoạt động để xuất', 'NO_CANDIDATE_USERS');
  }

  const employees = await Employee.find({ userId: { $in: users.map((u) => u._id) } })
    .populate('departmentId', 'name')
    .populate('extraDepartmentIds', 'name')
    .lean();
  const employeeByUserId = new Map(employees.map((e) => [e.userId.toString(), e]));

  const rows = [];
  for (const user of users) {
    const { tempPassword, passwordHash } = await generateTempPassword();
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    await user.save();

    const emp = employeeByUserId.get(user._id.toString());
    rows.push({
      fullname: emp?.fullname ?? '',
      employeeCode: emp?.employeeCode ?? '',
      // Dạng "Chính {kiêm nhiệm 1; kiêm nhiệm 2}" — khớp đúng khuôn import Excel
      departmentName: formatDepartmentCell(
        emp?.departmentId?.name ?? '',
        (emp?.extraDepartmentIds ?? []).map((d) => d.name),
      ),
      position: emp?.position ?? '',
      username: user.username,
      tempPassword,
    });
  }

  const buffer = await buildCredentialsWorkbook(rows);

  await auditService.writeAudit({
    actorUserId: adminId,
    action: 'EXPORT_CANDIDATE_CREDENTIALS',
    resourceType: 'User',
    resourceId: null,
    metadata: { detail: `Xuất danh sách + reset mật khẩu tạm cho ${rows.length} tài khoản nhân viên` },
    ipAddress,
  });

  return { buffer, count: rows.length };
}

// Dựng bảng tính Excel danh sách tài khoản thí sinh với màu sắc và viền định dạng đẹp mắt
async function buildCredentialsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Z176 - Hệ thống thi nội bộ';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Danh sách nhân viên', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Họ tên', key: 'fullname', width: 26 },
    { header: 'Mã nhân viên', key: 'employeeCode', width: 16 },
    { header: 'Phòng ban', key: 'departmentName', width: 24 },
    { header: 'Chức vụ', key: 'position', width: 20 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Mật khẩu tạm', key: 'tempPassword', width: 16 },
  ];

  rows.forEach((r, i) => sheet.addRow({ stt: i + 1, ...r }));

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008BC5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });
  headerRow.height = 22;

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const isEven = i % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
      }
      const isPasswordCol = sheet.getColumn(colNumber).key === 'tempPassword';
      const isUsernameCol = sheet.getColumn(colNumber).key === 'username';
      if (isPasswordCol) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (isUsernameCol) {
        cell.font = { bold: true };
      }
    });
    row.height = 18;
  }

  sheet.autoFilter = { from: 'A1', to: `G1` };

  const noteRowIndex = sheet.rowCount + 2;
  const note = sheet.getCell(`A${noteRowIndex}`);
  note.value = 'Lưu ý: Mật khẩu tạm chỉ hiển thị được 1 lần duy nhất tại thời điểm xuất. Vui lòng gửi cho nhân viên và yêu cầu đổi mật khẩu ngay lần đăng nhập đầu tiên. Không chia sẻ file này cho người không liên quan.';
  note.font = { italic: true, size: 10, color: { argb: 'FFB91C1C' } };
  sheet.mergeCells(`A${noteRowIndex}:G${noteRowIndex}`);
  sheet.getRow(noteRowIndex).alignment = { wrapText: true };

  return workbook.xlsx.writeBuffer();
}

// ============ Import Excel Danh Sách Nhân Viên (Bulk Import) ============

function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');
}

function mapRowKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

// Chuẩn hóa mã nhân viên thành username viết liền không dấu (VD: "NV-001" -> "nv001")
function usernameFromEmployeeCode(code) {
  return String(code)
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

// Chuẩn hóa ngày sinh từ ô Excel về 'dd/mm/yyyy'. Ô kiểu Date của Excel đến dạng số (serial) -> đổi lại.
// Không hiểu được / ngày không tồn tại (31/02) -> '' để không lưu dữ liệu rác.
function normalizeDob(v) {
  let d;
  let m;
  let y;
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return '';
    ({ d, m, y } = p);
  } else {
    const t = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? '').trim());
    if (!t) return '';
    [d, m, y] = [Number(t[1]), Number(t[2]), Number(t[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// Đọc và parse dữ liệu 1 dòng nhân viên từ Excel. KHÔNG ghi gì vào DB (kể cả phòng ban):
// phòng ban chính + kiêm nhiệm chỉ được TRA CỨU trên bản chụp `departmentSnapshot`, việc tạo phòng/gán mã
// diễn ra ở bước xác nhận (confirmEmployeeImportRows) sau khi admin đã nhập mã ở bước xem trước.
function buildEmployeeImportRow(row, rowIndex, departmentSnapshot) {
  const r = mapRowKeys(row);
  const fullname = r.fullname ?? r.hoten ?? r.hovaten;
  const deptCodeRaw = r.maphongban ?? r.mabophan ?? r.maban ?? r.madepartment;
  const deptCell = r.department ?? r.phongban ?? r.bophan;
  const employeeCodeRaw = r.employeecode ?? r.manhanvien ?? r.manv ?? r.ma ?? r.masonhanvien;
  const dob = r.ngaysinh ?? r.dob ?? '';
  const gender = r.gioitinh ?? r.gender ?? '';
  const phone = r.sodienthoai ?? r.dienthoai ?? r.sdt ?? r.phone ?? '';
  const address = r.diachi ?? r.address ?? '';
  const position = r.chucvu ?? r.position ?? '';

  if (!String(fullname ?? '').trim()) {
    throw new ApiError(400, `Dòng ${rowIndex}: thiếu họ tên`, 'IMPORT_ROW_INVALID');
  }

  const employeeCode = String(employeeCodeRaw ?? '').trim() || `TMP${rowIndex}`;
  const username = usernameFromEmployeeCode(employeeCode);
  if (!username) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: mã nhân viên "${employeeCode}" không sinh được username hợp lệ`,
      'IMPORT_ROW_INVALID',
    );
  }

  // Ô Phòng ban có dạng: Tên phòng chính {kiêm nhiệm 1; kiêm nhiệm 2}
  const depts = resolveRowDepartments({ cellRaw: deptCell, codeRaw: deptCodeRaw }, departmentSnapshot);
  if (depts.error) {
    throw new ApiError(400, `Dòng ${rowIndex}: ${depts.error}`, 'IMPORT_ROW_INVALID');
  }

  return {
    rowIndex,
    fullname: String(fullname).trim(),
    employeeCode,
    username,
    departmentName: depts.primary.name,
    departmentCode: depts.primary.fileCode,
    extraDepartments: depts.extras, // [{ name }]
    // true khi ô Phòng ban thật sự liệt kê phòng kiêm nhiệm. Nếu false, dòng "cập nhật" KHÔNG đụng vào
    // phòng kiêm nhiệm hiện có của nhân viên (tránh xóa mất phần admin đã gán thủ công).
    extrasProvided: depts.extrasProvided,
    warnings: depts.warnings,
    dob: normalizeDob(dob),
    gender: String(gender ?? '').trim(),
    phone: String(phone ?? '').trim(),
    address: String(address ?? '').trim(),
    position: String(position ?? '').trim(),
  };
}

// Đọc toàn bộ các dòng dữ liệu nhân viên từ file Excel
function readImportRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(400, 'Không đọc được file upload', 'IMPORT_FILE_MISSING');
  }

  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, 'File Excel không có sheet', 'IMPORT_EMPTY');

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows.length) throw new ApiError(400, 'Sheet trống', 'IMPORT_EMPTY');

  const rows = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const rowIndex = i + 2;
    const nonEmptyCellCount = Object.values(rawRows[i]).filter(
      (v) => String(v ?? '').trim() !== '',
    ).length;
    if (nonEmptyCellCount <= 1) continue;

    rows.push({ rowIndex, raw: rawRows[i] });
  }
  return rows;
}

// Phân loại hành vi xử lý của từng dòng nhân viên (create / reuse / update / conflict)
async function classifyImportRow(parsed) {
  const { existingUser, existingEmployee } = await findExistingAccountForReuse({
    employeeCode: parsed.employeeCode,
    username: parsed.username,
  });

  if (!existingUser) {
    return { ...parsed, action: 'create' };
  }

  if (!existingUser.isActive) {
    return {
      ...parsed,
      action: 'reuse',
      reuseTarget: {
        userId: existingUser._id.toString(),
        username: existingUser.username,
        fullname: existingEmployee?.fullname ?? '(không có hồ sơ)',
        employeeCode: existingEmployee?.employeeCode ?? '',
      },
    };
  }

  const sameEmployeeCode =
    parsed.employeeCode && existingEmployee?.employeeCode === parsed.employeeCode;
  if (sameEmployeeCode || existingUser.username === parsed.username) {
    return {
      ...parsed,
      action: 'update',
      updateTarget: {
        userId: existingUser._id.toString(),
        username: existingUser.username,
        fullname: existingEmployee?.fullname ?? '',
      },
    };
  }

  return {
    ...parsed,
    action: 'conflict',
    conflictWith: {
      username: existingUser.username,
      fullname: existingEmployee?.fullname ?? '',
      employeeCode: existingEmployee?.employeeCode ?? '',
    },
  };
}

// Bước 1: Xem trước (Preview) kết quả Import Nhân sự (Phát hiện trùng lặp trong file và đối chiếu với CSDL)
export async function previewEmployeesFromExcelFile(filePath) {
  const rows = readImportRows(filePath);
  // Bản chụp danh sách phòng ban (cả đã xóa mềm) để tra cứu mà KHÔNG tạo gì trong lúc xem trước
  const departmentSnapshot = await Department.find().lean();

  const parsedRows = [];
  const parseErrors = [];
  for (const { rowIndex, raw } of rows) {
    try {
      const parsed = buildEmployeeImportRow(raw, rowIndex, departmentSnapshot);
      parsedRows.push(parsed);
    } catch (err) {
      parseErrors.push({
        rowIndex,
        action: 'error',
        message: err.message ?? 'Lỗi không xác định',
      });
    }
  }

  const rowIndexesByCode = new Map();
  for (const p of parsedRows) {
    const list = rowIndexesByCode.get(p.employeeCode) ?? [];
    list.push(p.rowIndex);
    rowIndexesByCode.set(p.employeeCode, list);
  }

  const preview = [];
  let toCreate = 0;
  let toReuse = 0;
  let toUpdate = 0;
  let conflicts = 0;
  let duplicatesInFile = 0;
  let errors = parseErrors.length;

  for (const parsed of parsedRows) {
    const duplicateRowIndexes = rowIndexesByCode
      .get(parsed.employeeCode)
      .filter((idx) => idx !== parsed.rowIndex);

    if (duplicateRowIndexes.length > 0) {
      duplicatesInFile += 1;
      preview.push({
        ...parsed,
        action: 'duplicate_in_file',
        duplicateRows: duplicateRowIndexes,
        message: `Mã nhân viên "${parsed.employeeCode}" xuất hiện ở nhiều dòng trong cùng file (dòng ${[parsed.rowIndex, ...duplicateRowIndexes].sort((a, b) => a - b).join(', ')}) — hãy sửa file để mỗi mã chỉ còn 1 dòng rồi import lại`,
      });
      continue;
    }

    const classified = await classifyImportRow(parsed);
    preview.push(classified);
    if (classified.action === 'create') toCreate += 1;
    else if (classified.action === 'reuse') toReuse += 1;
    else if (classified.action === 'update') toUpdate += 1;
    else if (classified.action === 'conflict') conflicts += 1;
  }

  const merged = [...preview, ...parseErrors].sort((a, b) => a.rowIndex - b.rowIndex);

  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup */
  }

  // Gộp các phòng ban (chính + kiêm nhiệm) của những dòng SẼ được ghi, để admin điền mã ngay ở bước xem trước
  const writable = merged.filter((r) => ['create', 'reuse', 'update'].includes(r.action));
  const departments = summarizeImportDepartments(
    writable.map((r) => ({
      rowIndex: r.rowIndex,
      primary: { name: r.departmentName, fileCode: r.departmentCode },
      extras: r.extraDepartments,
    })),
    departmentSnapshot,
  );

  return {
    total: rows.length,
    toCreate,
    toReuse,
    toUpdate,
    conflicts,
    duplicatesInFile,
    errors,
    rowsWithWarnings: merged.filter((r) => r.warnings?.length).length,
    departments,
    departmentsNeedingCode: departments.filter((d) => d.needsCode).length,
    rows: merged,
  };
}

// Bước 2: Xác nhận (Confirm) Import Nhân sự vào CSDL (Tạo mới, Cập nhật hoặc Tái kích hoạt tài khoản đã khóa)
export async function confirmEmployeeImportRows(rows, adminId, ipAddress, { departmentCodes } = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApiError(400, 'Không có dòng nào để xác nhận import', 'IMPORT_EMPTY');
  }

  const candidateRole = await Role.findOne({ code: 'candidate' });
  if (!candidateRole) {
    throw new ApiError(500, 'Chưa cấu hình role candidate trong hệ thống', 'ROLE_NOT_FOUND');
  }

  // Gom mọi phòng ban (chính + kiêm nhiệm) của các dòng sẽ ghi; tạo / khôi phục / gán mã TRƯỚC khi tạo nhân viên.
  // Mọi phòng đều bắt buộc có mã; lỗi mã sẽ dừng cả lần import (chưa ghi nhân viên nào).
  const deptItems = new Map();
  for (const r of rows) {
    if (!['create', 'reuse', 'update'].includes(r?.action)) continue;
    for (const name of [r.departmentName, ...(r.extraDepartments ?? []).map((e) => e?.name)]) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) continue;
      const key = normalizeDeptName(trimmed);
      if (!deptItems.has(key)) deptItems.set(key, { key, name: trimmed });
    }
  }
  const departmentIdByKey = await ensureDepartmentsForImport([...deptItems.values()], departmentCodes ?? {});
  const deptIdOf = (name) => departmentIdByKey.get(normalizeDeptName(name));

  const results = [];
  let createdCount = 0;
  let updatedCount = 0;
  let reusedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const { rowIndex, action } = row ?? {};
    if (action !== 'create' && action !== 'reuse' && action !== 'update') {
      continue;
    }

    try {
      const departmentId = deptIdOf(row.departmentName);
      if (!departmentId) {
        throw new ApiError(400, `Dòng ${rowIndex}: thiếu phòng ban`, 'IMPORT_ROW_INVALID');
      }
      const extraDepartmentIds = [
        ...new Set((row.extraDepartments ?? []).map((e) => String(deptIdOf(e?.name) ?? '')).filter(Boolean)),
      ].filter((id) => id !== String(departmentId));

      if (action === 'reuse' || action === 'update') {
        const targetUserId = row.reuseTarget?.userId ?? row.updateTarget?.userId;
        const existingUser = await User.findById(targetUserId).select('+passwordHash');
        if (!existingUser) {
          throw new ApiError(
            400,
            `Dòng ${rowIndex}: tài khoản dự kiến ${action === 'reuse' ? 'tái sử dụng' : 'cập nhật'} không còn tồn tại — có thể đã bị xóa giữa lúc xem trước và xác nhận`,
            'IMPORT_TARGET_MISSING',
          );
        }
        const existingEmployee = await Employee.findOne({ userId: existingUser._id });

        if (action === 'reuse') {
          if (existingUser.isActive) {
            throw new ApiError(
              409,
              `Dòng ${rowIndex}: tài khoản "${existingUser.username}" đã được mở khóa bởi thao tác khác — không thể tự động tái sử dụng nữa`,
              'IMPORT_TARGET_NO_LONGER_LOCKED',
            );
          }
          const { user, tempPassword, employee: reusedEmployee } = await reactivateLockedAccount({
            adminId,
            existingUser,
            existingEmployee,
            newUsername: row.username,
            employeeData: { ...row, departmentId, extraDepartmentIds },
            ipAddress,
          });
          // Giống luồng tạo tài khoản thủ công: vào ngay kỳ thi đang phát hành (nếu có); lỗi gán không làm hỏng import
          await assignEmployeeToActiveExamIfAny(reusedEmployee).catch(() => {});
          results.push({
            row: rowIndex,
            employeeCode: row.employeeCode,
            username: user.username,
            fullname: row.fullname,
            department: row.departmentName,
            status: 'reused',
            tempPassword,
            message: `Đã mở khóa và cấp lại tài khoản (trước đó thuộc về "${row.reuseTarget?.fullname || row.reuseTarget?.username}")`,
          });
          reusedCount += 1;
          continue;
        }

        let employeeToAssign = existingEmployee;
        if (existingEmployee) {
          existingEmployee.fullname = row.fullname;
          existingEmployee.departmentId = departmentId;
          // Chỉ ghi đè phòng kiêm nhiệm khi file thật sự liệt kê chúng; nếu không thì giữ nguyên như hiện có
          if (row.extrasProvided) existingEmployee.extraDepartmentIds = extraDepartmentIds;
          existingEmployee.employeeCode = row.employeeCode || existingEmployee.employeeCode;
          existingEmployee.dob = row.dob;
          existingEmployee.gender = row.gender;
          existingEmployee.phone = row.phone;
          existingEmployee.address = row.address;
          existingEmployee.position = row.position;
          await existingEmployee.save();
        } else {
          employeeToAssign = await Employee.create({
            fullname: row.fullname,
            departmentId,
            extraDepartmentIds,
            userId: existingUser._id,
            employeeCode: row.employeeCode,
            dob: row.dob,
            gender: row.gender,
            phone: row.phone,
            address: row.address,
            position: row.position,
            isActive: true,
          });
        }
        // Nhân viên đang hoạt động mà chưa có đề trong kỳ thi đang phát hành (vd vừa được chuyển sang phòng mới) -> gán ngay.
        // Đã có đề rồi thì hàm tự bỏ qua; lỗi gán không làm hỏng import.
        if (employeeToAssign.isActive !== false) {
          await assignEmployeeToActiveExamIfAny(employeeToAssign).catch(() => {});
        }
        results.push({
          row: rowIndex,
          employeeCode: row.employeeCode,
          username: existingUser.username,
          fullname: row.fullname,
          department: row.departmentName,
          status: 'updated',
          tempPassword: '',
          message: 'Đã cập nhật hồ sơ (không tạo tài khoản mới)',
        });
        updatedCount += 1;
        continue;
      }

      const usernameTaken = await User.findOne({ username: row.username });
      if (usernameTaken) {
        throw new ApiError(
          400,
          `Dòng ${rowIndex}: username "${row.username}" đã tồn tại — dữ liệu có thể vừa thay đổi giữa lúc xem trước và xác nhận, hãy import lại`,
          'IMPORT_USERNAME_CONFLICT',
        );
      }

      const { tempPassword, passwordHash } = await generateTempPassword();
      const newUser = await User.create({
        username: row.username,
        roleId: candidateRole._id,
        passwordHash,
        mustChangePassword: true,
      });

      let employee;
      try {
        employee = await Employee.create({
          fullname: row.fullname,
          departmentId,
          extraDepartmentIds,
          userId: newUser._id,
          employeeCode: row.employeeCode,
          dob: row.dob,
          gender: row.gender,
          phone: row.phone,
          address: row.address,
          position: row.position,
          isActive: true,
        });
      } catch (err) {
        await User.deleteOne({ _id: newUser._id });
        throw new ApiError(
          400,
          `Dòng ${rowIndex}: không thể tạo hồ sơ nhân viên (${err.message})`,
          'EMPLOYEE_CREATE_FAILED',
        );
      }

      await assignEmployeeToActiveExamIfAny(employee).catch(() => {});

      results.push({
        row: rowIndex,
        employeeCode: row.employeeCode,
        username: row.username,
        fullname: row.fullname,
        department: row.departmentName,
        status: 'created',
        tempPassword,
        message: 'Tạo tài khoản thành công',
      });
      createdCount += 1;
    } catch (err) {
      failedCount += 1;
      results.push({
        row: rowIndex,
        employeeCode: row?.employeeCode ?? '',
        username: '',
        fullname: row?.fullname ?? '',
        department: row?.departmentName ?? '',
        status: 'error',
        tempPassword: '',
        message: err.message ?? 'Lỗi không xác định',
      });
    }
  }

  if (createdCount > 0 || updatedCount > 0 || reusedCount > 0) {
    await auditService.writeAudit({
      actorUserId: adminId,
      action: 'Import nhân viên từ Excel',
      resourceType: 'User',
      metadata: { created: createdCount, updated: updatedCount, reused: reusedCount, failed: failedCount },
      ipAddress,
    });
  }

  return {
    total: results.length,
    created: createdCount,
    updated: updatedCount,
    reused: reusedCount,
    failed: failedCount,
    results,
  };
}

// Sửa phòng ban chính / phòng kiêm nhiệm của 1 nhân viên (admin thao tác thủ công trong tab Tài khoản).
// Truyền field nào thì đổi field đó; không truyền extraDepartmentIds thì giữ nguyên danh sách kiêm nhiệm
// (chỉ tự bỏ phòng nào vừa trở thành phòng chính để không bị trùng).
export async function updateEmployeeDepartments({ userId, departmentId, extraDepartmentIds }) {
  const employee = await Employee.findOne({ userId });
  if (!employee) {
    throw new ApiError(
      404,
      'Tài khoản này không có hồ sơ nhân viên (chỉ tài khoản thí sinh mới có phòng ban)',
      'EMPLOYEE_NOT_FOUND',
    );
  }

  let primaryId = employee.departmentId;
  if (departmentId !== undefined && departmentId !== null && String(departmentId) !== String(employee.departmentId)) {
    if (!mongoose.isValidObjectId(departmentId)) {
      throw new ApiError(400, 'departmentId không hợp lệ', 'INVALID_FIELD');
    }
    const dept = await Department.findOne({ _id: departmentId, isActive: true });
    if (!dept) {
      throw new ApiError(400, 'Phòng ban chính không tồn tại hoặc đã ngừng hoạt động', 'DEPARTMENT_NOT_FOUND');
    }
    primaryId = dept._id;
  }

  const nextExtra =
    extraDepartmentIds === undefined
      ? (employee.extraDepartmentIds ?? []).map(String).filter((id) => id !== String(primaryId))
      : await normalizeExtraDepartmentIds(primaryId, extraDepartmentIds);

  employee.departmentId = primaryId;
  employee.extraDepartmentIds = nextExtra;
  await employee.save();

  const populated = await Employee.findById(employee._id)
    .populate('departmentId', 'name code')
    .populate('extraDepartmentIds', 'name code')
    .lean();

  return {
    userId: String(userId),
    fullname: populated.fullname,
    departmentId: populated.departmentId?._id ?? primaryId,
    departmentName: populated.departmentId?.name ?? '',
    departmentCode: populated.departmentId?.code ?? '',
    extraDepartments: (populated.extraDepartmentIds ?? []).map((d) => ({ _id: d._id, name: d.name, code: d.code ?? '' })),
  };
}