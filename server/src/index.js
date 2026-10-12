/**
 * File khởi động chính của ứng dụng Backend Server (Z176 Exam Server).
 * Quản lý vòng đời khởi động: kiểm tra biến môi trường, kết nối CSDL, seed dữ liệu mẫu,
 * kích hoạt các tiến trình lập lịch (Cron Schedulers) và lắng nghe cổng HTTP.
 */

import { createApp } from './app.js';
import { assertRuntimeEnv, env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { runStartupSeed } from './services/seed.service.js';
import { initBackupScheduler } from './services/backup.scheduler.js';
import { initUploadCleanupScheduler } from './services/upload-cleanup.scheduler.js';
import { initAccountPurgeScheduler } from './services/account-purge.scheduler.js';
import { initAbandonedAttemptScheduler } from './services/abandoned-attempt.scheduler.js';

async function main() {
  // --- Khởi tạo kết nối & Môi trường ---
  assertRuntimeEnv();
  await connectDatabase();

  // --- Khởi tạo dữ liệu ban đầu (Seed Data) ---
  const seedResult = await runStartupSeed({ includeAdmin: env.seedOnStart });
  if (env.seedOnStart && seedResult.adminResult.seeded) {
    // eslint-disable-next-line no-console -- startup only, no secrets
    console.info(
      `[seed] Admin created: username="${seedResult.adminResult.username}" mustChangePassword=${seedResult.adminResult.mustChangePassword}`,
    );
  } else if (env.seedOnStart && !seedResult.adminResult.seeded) {
    // eslint-disable-next-line no-console
    console.warn(
      `[seed] Admin not created (${seedResult.adminResult.reason}). Set ADMIN_SEED_EMAIL + ADMIN_SEED_PASSWORD in server/.env — see .env.example`,
    );
  }

  // --- Đăng ký các tiến trình Cron định kỳ chạy nền ---
  // 1. Sao lưu CSDL tự động lên Google Drive lúc 3h sáng
  initBackupScheduler();

  // 2. Dọn dẹp file tạm upload sót (file > 6h tuổi) mỗi giờ một lần
  initUploadCleanupScheduler();

  // 3. Xóa cứng tài khoản bị khóa liên tục > 6 tháng không có lịch sử hoạt động lúc 4h sáng
  initAccountPurgeScheduler();

  // 4. Mỗi phút nộp và chấm các lượt thi bị bỏ rơi (thí sinh tắt tab/máy giữa bài, không quay lại)
  initAbandonedAttemptScheduler();

  // --- Khởi chạy HTTP Server ---
  const app = createApp();
  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console -- startup banner only
    console.info(
      [
        '',
        '========================================',
        `  Z176 Exam Server — ${env.nodeEnv}`,
        `  Port:             ${env.port}`,
        `  Login rate limit: ${env.isProduction ? 'ON' : 'OFF (dev)'}`,
        '========================================',
        '',
      ].join('\n'),
    );
  });
  // Node mặc định đóng kết nối rảnh sau 5s -> client poll 5-15s liên tục phải mở lại kết nối. headersTimeout phải > keepAliveTimeout.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

// Bắt lỗi ngoại lệ khi khởi động server
main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});