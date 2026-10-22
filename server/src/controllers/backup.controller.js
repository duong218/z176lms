/**
 * Controller Quản lý Sao lưu & Khôi phục Cơ sở Dữ liệu (Database Backup & Restore).
 * Tích hợp lưu trữ trực tiếp lên Google Drive, tải file sao lưu .gz và khôi phục CSDL an toàn.
 */

import { backupService } from '../services/backup.service.js';
import { auditService } from '../services/audit.service.js';
import { ApiError } from '../utils/api-error.js';
import { asyncHandler } from '../utils/async-handler.js';

// Bắt đầu sao lưu CSDL thủ công (Admin) CHẠY NỀN: nén gz -> mã hóa -> tải lên Google Drive -> xoay vòng giữ 5 bản gần nhất.
// Trả 202 ngay kèm trạng thái job; tiến độ lấy qua GET /backups/status. Đang có job chạy thì trả luôn job đó.
export const createBackup = asyncHandler(async (req, res) => {
  const { userId } = req.auth;
  const ipAddress = req.ip;
  backupService.startBackupJob({
    prefix: 'z176-manual',
    afterSuccess: (driveFile, { kept, deleted }) =>
      auditService.writeAudit({
        actorUserId: userId,
        action: 'BACKUP_MANUAL_CREATE',
        resourceType: 'Backup',
        metadata: { driveFileId: driveFile.id, fileName: driveFile.name, kept, deleted },
        ipAddress,
      }),
  });
  res.status(202).json({ success: true, data: backupService.getBackupJob(), message: 'Đã bắt đầu sao lưu.' });
});

// Tiến độ backup thủ công: { state: idle|running|done|error, phase, percent, message, result }
export const getBackupStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: backupService.getBackupJob() });
});

// Lấy danh sách các bản sao lưu đang lưu trữ trên Google Drive
export const listBackups = asyncHandler(async (req, res) => {
  const files = await backupService.listDriveBackups();
  res.json({
    success: true,
    data: files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0), createdTime: f.createdTime })),
    maxKept: backupService.MAX_BACKUPS_KEPT,
  });
});

// Tải xuống file nén .gz của một bản sao lưu cụ thể từ Google Drive
export const downloadBackup = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  const { fileName } = req.query;

  res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'backup.gz'}"`);
  res.setHeader('Content-Type', 'application/octet-stream'); // bản mới là .gz.enc (đã mã hóa), không phải gzip thuần

  await backupService.streamDriveFileToResponse(fileId, res);

  await auditService.writeAudit({
    actorUserId: req.auth.userId,
    action: 'BACKUP_DOWNLOAD',
    resourceType: 'Backup',
    metadata: { driveFileId: fileId, fileName },
    ipAddress: req.ip,
  });
});

// Khôi phục CSDL từ file .gz tải lên (bắt buộc xác nhận chuỗi 'RESTORE' để tránh ghi đè nhầm)
export const restoreBackup = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Vui lòng chọn file backup (.gz) để khôi phục.', 'NO_FILE');
  }

  if (req.body?.confirm !== 'RESTORE') {
    await backupService.cleanupLocalFile(req.file.path);
    throw new ApiError(
      400,
      'Thao tác khôi phục sẽ XOÁ TOÀN BỘ dữ liệu hiện tại. Vui lòng xác nhận trước khi tiếp tục.',
      'CONFIRMATION_REQUIRED'
    );
  }

  try {
    await backupService.restoreFromLocalFile(req.file.path);
  } finally {
    await backupService.cleanupLocalFile(req.file.path);
  }

  await auditService.writeAudit({
    actorUserId: req.auth.userId,
    action: 'BACKUP_RESTORE',
    resourceType: 'Backup',
    metadata: { originalFileName: req.file.originalname },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Khôi phục dữ liệu thành công.' });
});