/**
 * Tiến trình lập lịch Dọn dẹp Tập tin Tạm (Upload Cleanup Scheduler).
 * Tự động chạy mỗi giờ một lần để quét và xóa các file upload tạm còn sót lại (> 6 giờ tuổi) trong thư mục uploads.
 */

import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { env } from '../config/env.js';
import { writeAudit } from './audit.service.js';
import { StudyDocument } from '../models/study-document.model.js';

const CRON_EXPRESSION = '0 * * * *'; // Chạy mỗi giờ, phút 0
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // Ngưỡng file cũ > 6 tiếng

// Hàm quét và xóa các file tạm hết hạn lưu trữ
async function runUploadCleanup() {
  const dir = path.resolve(env.uploadDir);
  if (!fs.existsSync(dir)) {
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    console.error('[upload-cleanup] Không đọc được thư mục upload:', err.message);
    return;
  }

  // Tài liệu ôn tập còn hiệu lực cũng nằm trong thư mục này: tuyệt đối không xoá
  const keep = new Set(
    (await StudyDocument.find({ isActive: true }, 'filePath').lean()).map((d) => path.resolve(d.filePath)),
  );
  const now = Date.now();
  const deleted = [];
  const failed = [];

  for (const name of entries) {
    const filePath = path.join(dir, name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || keep.has(path.resolve(filePath))) continue; // bỏ qua thư mục con và tài liệu ôn tập
      if (now - stat.mtimeMs < MAX_AGE_MS) continue; // còn mới, chưa tới lượt dọn

      fs.unlinkSync(filePath);
      deleted.push(name);
    } catch (err) {
      failed.push({ name, message: err.message });
    }
  }

  if (deleted.length > 0 || failed.length > 0) {
    console.log(
      `[upload-cleanup] Đã xoá ${deleted.length} file tạm quá hạn` +
        (failed.length > 0 ? `, lỗi ${failed.length} file` : '') +
        (deleted.length > 0 ? `: ${deleted.join(', ')}` : ''),
    );

    await writeAudit({
      actorUserId: null,
      action: 'UPLOAD_TMP_CLEANUP',
      resourceType: 'Upload',
      metadata: { deletedCount: deleted.length, deleted, failed },
    }).catch(() => {
      /* audit lỗi không được chặn job dọn file */
    });
  }
}

// Khởi tạo Cron Job và chạy ngay 1 lần lúc server khởi động
export function initUploadCleanupScheduler() {
  cron.schedule(CRON_EXPRESSION, runUploadCleanup, { timezone: TIMEZONE });
  console.log(`[upload-cleanup] Đã đăng ký cron dọn file tạm: "${CRON_EXPRESSION}" (${TIMEZONE})`);

  runUploadCleanup().catch((err) => {
    console.error('[upload-cleanup] Lần chạy dọn dẹp lúc khởi động thất bại:', err.message);
  });
}

export { runUploadCleanup };