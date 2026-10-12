/**
 * Middleware xử lý Xác thực (Authentication) & Phân quyền (Authorization).
 * Đảm bảo request có token hợp lệ, kiểm tra trạng thái hoạt động của tài khoản và quyền hạn theo vai trò (Role).
 */

import { verifyAccessToken, getAuthProfile } from '../services/auth.service.js';
import { User, Role } from '../models/index.js';
import { ApiError } from '../utils/api-error.js';

// MỚI — Cache vai trò trong bộ nhớ (vai trò rất ít đổi) để KHÔNG phải truy vấn Role ở MỌI request.
// KHÔNG cache User: isActive + tokenVersion vẫn đọc DB ở mỗi request nên thu hồi phiên vẫn tức thì (SKILLS.md mục 4, nguyên tắc 4).
const ROLE_CACHE_TTL_MS = 10_000;
const roleCache = new Map();
async function getRoleCached(roleId) {
  const key = String(roleId);
  const hit = roleCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.role;
  const role = await Role.findById(roleId).select('code name isActive').lean();
  if (role) roleCache.set(key, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

// Hàm phụ trợ tách Bearer Token từ header Authorization
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice(7).trim();
}

// Middleware xác thực Access Token: giải mã JWT, kiểm tra tài khoản còn hoạt động và tokenVersion hợp lệ
export async function authenticate(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Yêu cầu đăng nhập', 'AUTH_REQUIRED');
    }

    const payload = verifyAccessToken(token);
    // MỚI — chỉ lấy đúng các trường cần dùng + lean() (không dựng document Mongoose) vì hàm này chạy ở MỌI request.
    const user = await User.findById(payload.sub)
      .select('username isActive tokenVersion mustChangePassword roleId')
      .lean();
    if (!user || !user.isActive) {
      throw new ApiError(401, 'Phiên không hợp lệ', 'AUTH_ACCESS_INVALID');
    }
    const role = await getRoleCached(user.roleId);
    if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      // Token cũ mang vai trò khác vai trò hiện tại -> admin vừa đổi vai trò (khác với đăng nhập nơi khác / đổi mật khẩu)
      if (payload.roleCode && role?.code && payload.roleCode !== role.code) {
        throw new ApiError(401, 'Quản trị viên đã thay đổi quyền của bạn', 'AUTH_ROLE_CHANGED');
      }
      throw new ApiError(401, 'Phiên đã bị thu hồi', 'AUTH_ACCESS_REVOKED');
    }

    if (!role || !role.isActive) {
      throw new ApiError(403, 'Vai trò không hợp lệ', 'AUTH_ROLE_INACTIVE');
    }

    // Đính kèm thông tin danh tính người dùng vào đối tượng req.auth
    req.auth = {
      userId: user._id.toString(),
      username: user.username,
      roleId: role._id.toString(),
      roleCode: role.code,
      roleName: role.name,
      mustChangePassword: user.mustChangePassword,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Middleware phân quyền: chỉ cho phép các Role có mã code trong danh sách được phép truy cập
export function requireRoleCodes(...allowedCodes) {
  const allowed = new Set(allowedCodes.map((c) => c.toLowerCase()));
  return (req, _res, next) => {
    if (!req.auth?.roleCode) {
      next(new ApiError(401, 'Yêu cầu đăng nhập', 'AUTH_REQUIRED'));
      return;
    }
    if (!allowed.has(req.auth.roleCode.toLowerCase())) {
      next(new ApiError(403, 'Không có quyền truy cập', 'AUTH_FORBIDDEN'));
      return;
    }
    next();
  };
}

// Middleware tùy chọn gắn thông tin hồ sơ nhân viên đầy đủ vào req.auth.profile nếu đã xác thực
export async function attachProfileIfAuthenticated(req, _res, next) {
  if (!req.auth?.userId) {
    next();
    return;
  }
  try {
    req.auth.profile = await getAuthProfile(req.auth.userId);
  } catch {
    /* optional profile fetch fallback */
  }
  next();
}