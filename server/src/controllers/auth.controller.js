/**
 * Controller xử lý các tác vụ Xác thực & Phiên đăng nhập (Authentication & Session).
 * Điều phối đăng nhập, cấp/làm mới JWT cookie, đăng xuất và đổi mật khẩu.
 */

import {
  REFRESH_COOKIE,
  changePassword,
  loginWithUsernamePassword,
  logoutUser,
  refreshAccessToken,
  refreshCookieOptions,
  getProfileFromAuth,
} from '../services/auth.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from '../services/audit.service.js';

// Đăng nhập bằng tài khoản/mật khẩu, trả về Access Token và lưu Refresh Token vào httpOnly Cookie
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    throw new ApiError(400, 'Thiếu tên đăng nhập hoặc mật khẩu', 'AUTH_VALIDATION');
  }

  const name = String(username).trim().toLowerCase().slice(0, 64);
  // Ghi nhật ký đăng nhập; lỗi ghi log không được làm hỏng đăng nhập (thí sinh đang chờ vào thi).
  const audit = (action, actorUserId) =>
    writeAudit({ actorUserId, action, resourceType: 'User', metadata: { username: name, detail: `Tài khoản: ${name}` }, ipAddress: req.ip }).catch(() => {});

  let result;
  try {
    result = await loginWithUsernamePassword(username, password);
  } catch (err) {
    if (err.code === 'AUTH_INVALID') await audit('LOGIN_FAIL');
    if (err.code === 'AUTH_LOCKED') await audit('LOGIN_LOCKED');
    throw err;
  }
  await audit('LOGIN_OK', result.user.id);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshToken));
  res.json({
    success: true,
    message: 'Đăng nhập thành công',
    code: 'AUTH_LOGIN_OK',
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

// Làm mới Access Token thông qua Refresh Token từ cookie
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  const result = await refreshAccessToken(token);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshToken));
  res.json({
    success: true,
    message: 'Làm mới phiên thành công',
    code: 'AUTH_REFRESH_OK',
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

// Đăng xuất: thu hồi phiên trên server (tăng tokenVersion) và xoá refresh cookie ở client
export const logout = asyncHandler(async (req, res) => {
  if (req.auth?.userId) {
    await logoutUser(req.auth.userId);
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({
    success: true,
    message: 'Đăng xuất thành công',
    code: 'AUTH_LOGOUT_OK',
  });
});

// Lấy thông tin tài khoản và hồ sơ nhân viên của người dùng đang đăng nhập
export const me = asyncHandler(async (req, res) => {
  const profile = await getProfileFromAuth(req.auth);
  res.json({
    success: true,
    message: 'OK',
    code: 'AUTH_ME_OK',
    data: profile,
  });
});

// Người dùng tự đổi mật khẩu cá nhân và ghi nhật ký kiểm toán (Audit Log)
export const changePasswordHandler = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Thiếu mật khẩu', 'AUTH_VALIDATION');
  }
  await changePassword(req.auth.userId, currentPassword, newPassword);

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'CHANGE_PASSWORD',
    resourceType: 'User',
    resourceId: req.auth.userId,
    metadata: { detail: 'Người dùng tự đổi mật khẩu cá nhân' },
    ipAddress: req.ip,
  });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({
    success: true,
    message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
    code: 'AUTH_PASSWORD_CHANGED',
  });
});