/**
 * Service Sao lưu & Khôi phục Dữ liệu MongoDB và Tích hợp Google Drive (Backup Service).
 * Sử dụng công cụ mongodump/mongorestore nén gzip và đồng bộ trực tiếp lên Google Drive qua OAuth2.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fssync from 'fs';
import { google } from 'googleapis';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

const MAX_BACKUPS_KEPT = 5;
const TMP_DIR = path.join(os.tmpdir(), 'z176-backups');

// Đảm bảo thư mục lưu file nén tạm tồn tại trên server
async function ensureTmpDir() {
  await fs.mkdir(TMP_DIR, { recursive: true, mode: 0o700 }); // chỉ tiến trình server đọc được bản dump chưa mã hóa
}

// Kiểm tra đầy đủ thông tin xác thực Google OAuth2 trong biến môi trường
function assertGoogleConfigured() {
  const { clientId, clientSecret, refreshToken, folderId } = env.googleBackup;
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new ApiError(
      500,
      'Chưa cấu hình Google Drive backup (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN / GOOGLE_DRIVE_BACKUP_FOLDER_ID).',
      'GOOGLE_BACKUP_NOT_CONFIGURED'
    );
  }
}

// Khởi tạo Google Drive API Client bằng OAuth2 Refresh Token (cho phép ghi vào Drive cá nhân)
function getDriveClient() {
  assertGoogleConfigured();
  const { clientId, clientSecret, refreshToken } = env.googleBackup;

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oAuth2Client });
}

// Thực thi lệnh hệ thống ngoài (mongodump / mongorestore)
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(
        new ApiError(
          500,
          `Không thể chạy lệnh "${cmd}". Cần cài mongodb-database-tools trên server. Chi tiết: ${err.message}`,
          'BACKUP_TOOL_NOT_FOUND'
        )
      );
    });
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(
        new ApiError(500, `Lệnh "${cmd}" thất bại (mã ${code}): ${stderr.slice(-2000)}`, 'BACKUP_COMMAND_FAILED')
      );
    });
  });
}

// Xóa file tạm cục bộ sau khi hoàn thành thao tác
async function cleanupLocalFile(filePath) {
  try {
    if (filePath && fssync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch {
    /* best-effort cleanup */
  }
}

// Chạy mongodump/mongorestore nhưng đưa URI (có mật khẩu) qua file --config quyền 0600 thay vì --uri trên dòng lệnh:
// đối số của tiến trình con ai trên máy chủ cũng xem được bằng `ps`. JSON.stringify cho ra chuỗi YAML hợp lệ.
async function runMongoTool(cmd, args) {
  await ensureTmpDir();
  const cfg = path.join(TMP_DIR, `mongo-${crypto.randomUUID()}.yml`);
  await fs.writeFile(cfg, `uri: ${JSON.stringify(env.mongodbUri)}\n`, { mode: 0o600 });
  try {
    await runCommand(cmd, [`--config=${cfg}`, ...args]);
  } finally {
    await cleanupLocalFile(cfg);
  }
}

// --- Mã hóa bản backup trước khi lên Google Drive: AES-256-GCM (stream, không nạp cả file vào RAM) ---
// Định dạng: MAGIC(8) | salt(16) | iv(12) | ciphertext | authTag(16). Khóa = scrypt(BACKUP_ENCRYPTION_KEY, salt).
// MẤT BACKUP_ENCRYPTION_KEY = MẤT TOÀN BỘ bản backup đã mã hóa, hãy cất khóa ở nơi riêng (không chỉ trong .env).
const MAGIC = Buffer.from('Z176ENC1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN;

function deriveKey(salt) {
  if (!env.backupEncryptionKey) {
    throw new ApiError(500, 'Thiếu BACKUP_ENCRYPTION_KEY để mã hóa/giải mã bản sao lưu.', 'BACKUP_KEY_MISSING');
  }
  return crypto.scryptSync(env.backupEncryptionKey, salt, 32);
}

async function encryptFile(src, dest) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  await fs.writeFile(dest, Buffer.concat([MAGIC, salt, iv]), { mode: 0o600 });
  await pipeline(fssync.createReadStream(src), cipher, fssync.createWriteStream(dest, { flags: 'a' }));
  await fs.appendFile(dest, cipher.getAuthTag());
}

// File có đúng là bản backup đã mã hóa (đọc 8 byte đầu)? Bản .gz cũ chưa mã hóa vẫn khôi phục được.
async function isEncrypted(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const head = Buffer.alloc(MAGIC.length);
    await fh.read(head, 0, MAGIC.length, 0);
    return head.equals(MAGIC);
  } finally {
    await fh.close();
  }
}

async function decryptFile(src, dest) {
  const { size } = await fs.stat(src);
  if (size < HEADER_LEN + TAG_LEN) {
    throw new ApiError(400, 'File sao lưu mã hóa bị hỏng hoặc không đầy đủ.', 'BACKUP_FILE_CORRUPT');
  }
  const fh = await fs.open(src, 'r');
  const head = Buffer.alloc(HEADER_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    await fh.read(head, 0, HEADER_LEN, 0);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    await fh.close();
  }
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = head.subarray(MAGIC.length + SALT_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      fssync.createReadStream(src, { start: HEADER_LEN, end: size - TAG_LEN - 1 }),
      decipher,
      fssync.createWriteStream(dest, { mode: 0o600 })
    );
  } catch {
    // GCM báo lỗi xác thực khi sai khóa hoặc file bị sửa; chưa động tới CSDL nên báo lỗi an toàn.
    throw new ApiError(400, 'Không giải mã được: sai BACKUP_ENCRYPTION_KEY hoặc file đã bị sửa/hỏng.', 'BACKUP_DECRYPT_FAILED');
  }
}

// Chạy mongodump xuất CSDL ra file .gz nén trong thư mục tạm
async function dumpToLocalFile(prefix = 'z176-backup') {
  await ensureTmpDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${prefix}-${timestamp}.gz`;
  const filePath = path.join(TMP_DIR, fileName);

  await runMongoTool('mongodump', [`--archive=${filePath}`, '--gzip']);

  const stat = await fs.stat(filePath);
  return { filePath, fileName, size: stat.size };
}

// Tải file nén .gz lên thư mục sao lưu trên Google Drive
async function uploadToDrive(filePath, fileName) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [env.googleBackup.folderId],
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fssync.createReadStream(filePath),
    },
    fields: 'id, name, size, createdTime',
  });
  return res.data;
}

// Quy trình sao lưu trọn gói: Dump DB -> Mã hóa -> Upload Drive -> Dọn file tạm
async function createBackupToDrive({ prefix = 'z176-backup' } = {}) {
  const encrypt = Boolean(env.backupEncryptionKey);
  // Production: thà báo lỗi rõ còn hơn lặng lẽ đẩy dữ liệu nhân sự chưa mã hóa lên Drive ngoài.
  if (!encrypt && env.isProduction) {
    throw new ApiError(
      500,
      'Chưa cấu hình BACKUP_ENCRYPTION_KEY: không sao lưu bản chưa mã hóa lên Google Drive.',
      'BACKUP_KEY_MISSING'
    );
  }
  if (!encrypt) console.warn('[backup] BACKUP_ENCRYPTION_KEY chưa đặt: bản sao lưu lên Drive KHÔNG được mã hóa (chỉ cho dev).');

  const { filePath, fileName } = await dumpToLocalFile(prefix);
  const encPath = `${filePath}.enc`;
  try {
    if (encrypt) await encryptFile(filePath, encPath);
    return await uploadToDrive(encrypt ? encPath : filePath, encrypt ? `${fileName}.enc` : fileName);
  } finally {
    await cleanupLocalFile(filePath);
    await cleanupLocalFile(encPath);
  }
}

// Lấy danh sách các file backup đang lưu trên Google Drive (mới nhất xếp trước)
async function listDriveBackups() {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${env.googleBackup.folderId}' in parents and trashed = false`,
    fields: 'files(id, name, size, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 100,
  });
  return res.data.files ?? [];
}

// Xoay vòng bản sao lưu: Giữ tối đa N bản mới nhất, tự động xóa các bản cũ hơn trên Google Drive
async function rotateDriveBackups(maxKept = MAX_BACKUPS_KEPT) {
  const drive = getDriveClient();
  const files = await listDriveBackups();
  const toDelete = files.slice(maxKept);

  for (const file of toDelete) {
    await drive.files.delete({ fileId: file.id });
  }
  return { kept: files.length - toDelete.length, deleted: toDelete.map((f) => f.name) };
}

// Tải file từ Drive về thư mục tạm cục bộ
async function downloadDriveFileToLocal(fileId, fileName) {
  await ensureTmpDir();
  const drive = getDriveClient();
  const filePath = path.join(TMP_DIR, `download-${Date.now()}-${fileName}`);

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  await new Promise((resolve, reject) => {
    const dest = fssync.createWriteStream(filePath);
    res.data.pipe(dest).on('finish', resolve).on('error', reject);
  });

  return filePath;
}

// Stream trực tiếp dữ liệu file từ Google Drive ra HTTP response cho client tải về
async function streamDriveFileToResponse(fileId, res) {
  const drive = getDriveClient();
  const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  driveRes.data.pipe(res);
}

// Khôi phục dữ liệu CSDL từ file .gz / .gz.enc (mongorestore --drop sẽ xóa sạch dữ liệu hiện tại trước khi phục hồi)
// Giải mã xong mới chạy mongorestore: sai khóa thì dừng trước khi --drop, CSDL còn nguyên.
async function restoreFromLocalFile(localFilePath) {
  const decPath = `${localFilePath}.dec`;
  try {
    let archive = localFilePath;
    if (await isEncrypted(localFilePath)) {
      await decryptFile(localFilePath, decPath);
      archive = decPath;
    }
    await runMongoTool('mongorestore', [`--archive=${archive}`, '--gzip', '--drop']);
  } finally {
    await cleanupLocalFile(decPath);
  }
}

export const backupService = {
  createBackupToDrive,
  listDriveBackups,
  rotateDriveBackups,
  downloadDriveFileToLocal,
  streamDriveFileToResponse,
  restoreFromLocalFile,
  cleanupLocalFile,
  encryptFile,
  decryptFile,
  isEncrypted,
  MAX_BACKUPS_KEPT,
};