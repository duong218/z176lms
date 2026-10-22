import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { createBackup, listBackups, downloadBackup, restoreBackup } from '../controllers/backup.controller.js';

const router = Router();

// Upload file backup (.gz hoặc .gz.enc) vào thư mục tạm OS trước khi mongorestore đọc
const uploadBackupFile = multer({
  dest: path.join(os.tmpdir(), 'z176-backup-uploads'),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB, chỉnh theo dung lượng DB thực tế
  fileFilter: (req, file, cb) => {
    if (!/\.gz(\.enc)?$/.test(file.originalname)) {
      return cb(new Error('Chỉ chấp nhận file .gz hoặc .gz.enc (được tạo từ chức năng backup).'));
    }
    cb(null, true);
  },
});

router.use(authenticate, requirePasswordChanged, requireRoleCodes('admin'));

router.get('/', listBackups);
router.post('/', createBackup);
router.get('/:fileId/download', downloadBackup);
router.post('/restore', uploadBackupFile.single('backupFile'), restoreBackup);

export default router;