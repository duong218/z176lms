/**
 * Quản lý & chuẩn hóa biến môi trường (.env) cho toàn bộ hệ thống Backend.
 * Bao gồm cấu hình Database, JWT Auth, Cloudinary, Google Drive Backup, Rate Limiter và các tham số vận hành.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Nạp file .env từ thư mục gốc hoặc thư mục server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Hàm trợ giúp lấy giá trị tùy chọn (trả về undefined nếu rỗng)
function optional(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

// Đối tượng cấu hình môi trường chuẩn hóa
export const env = {
  // Cấu hình môi trường & mạng
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  port: Number(process.env.PORT ?? 5000),
  mongodbUri: optional('MONGODB_URI'),

  // Cấu hình xác thực JWT & mã hóa mật khẩu
  jwtSecret: optional('JWT_SECRET'),
  jwtRefreshSecret: optional('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '1d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),

  // Cấu hình CORS & Upload file cục bộ
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',

  // Cấu hình khởi tạo Admin mặc định (Seed)
  seedOnStart:
    process.env.SEED_ON_START === 'true' ||
    (process.env.SEED_ON_START !== 'false' &&
      (process.env.NODE_ENV ?? 'development') !== 'production'),
  adminSeedEmail: optional('ADMIN_SEED_EMAIL'),
  adminSeedPassword: optional('ADMIN_SEED_PASSWORD'),
  adminSeedMustChangePassword: process.env.ADMIN_SEED_MUST_CHANGE_PASSWORD !== 'false',

  // Cấu hình bảo mật phiên thi & Giới hạn tần suất (Rate limiting/Lockout)
  examSessionSecret: optional('EXAM_SESSION_SECRET'),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5),
  loginRateLimitWindowMinutes: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES ?? 15),
  accountLockMaxAttempts: Number(process.env.ACCOUNT_LOCK_MAX_ATTEMPTS ?? 5),
  accountLockMinutes: Number(process.env.ACCOUNT_LOCK_MINUTES ?? 15),

  // Cấu hình lưu trữ hình ảnh trên Cloudinary
  cloudinary: {
    cloudName: optional('CLOUDINARY_CLOUD_NAME'),
    apiKey: optional('CLOUDINARY_API_KEY'),
    apiSecret: optional('CLOUDINARY_API_SECRET'),
  },

  // Khóa mã hóa bản sao lưu (AES-256-GCM) trước khi đưa lên Google Drive. Bắt buộc ở production.
  backupEncryptionKey: optional('BACKUP_ENCRYPTION_KEY'),

  // Cấu hình sao lưu dữ liệu lên Google Drive (OAuth2)
  googleBackup: {
    clientId: optional('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: optional('GOOGLE_REFRESH_TOKEN'),
    folderId: optional('GOOGLE_DRIVE_BACKUP_FOLDER_ID'),
  },
};

// Kiểm tra tính hợp lệ của các biến môi trường bắt buộc khi khởi động
export function assertRuntimeEnv() {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }
  if (!env.jwtSecret || !env.jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required for auth');
  }
}