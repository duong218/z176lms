// Kiểm tra nhanh mã hóa bản backup (AES-256-GCM). Chạy: node test/test_backup_crypto.mjs   (từ thư mục server/)
// Không cần MongoDB/Google: chỉ test encryptFile / decryptFile / isEncrypted.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.BACKUP_ENCRYPTION_KEY = 'khoa-test-1';
const { backupService: b } = await import('../src/services/backup.service.js');
const { env } = await import('../src/config/env.js');

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'z176-crypto-'));
const plain = path.join(dir, 'a.gz');
const enc = path.join(dir, 'a.gz.enc');
const dec = path.join(dir, 'a.dec');
const data = crypto.randomBytes(300_000); // > 1 chunk stream (64KB)
await fs.writeFile(plain, data);

// 1) Mã hóa rồi giải mã ra đúng nội dung gốc; bản mã không chứa dữ liệu gốc
await b.encryptFile(plain, enc);
assert.ok(await b.isEncrypted(enc), 'file mã hóa phải nhận ra được');
assert.ok(!(await b.isEncrypted(plain)), 'file .gz thường không bị coi là đã mã hóa');
assert.ok(!(await fs.readFile(enc)).includes(data.subarray(0, 64)), 'bản mã không được chứa dữ liệu gốc');
await b.decryptFile(enc, dec);
assert.ok((await fs.readFile(dec)).equals(data), 'giải mã phải ra đúng dữ liệu gốc');

// 2) Sai khóa -> lỗi BACKUP_DECRYPT_FAILED
env.backupEncryptionKey = 'khoa-sai';
await assert.rejects(b.decryptFile(enc, dec), { code: 'BACKUP_DECRYPT_FAILED' });
env.backupEncryptionKey = 'khoa-test-1';

// 3) File bị sửa 1 byte -> không giải mã được (GCM phát hiện)
const bad = await fs.readFile(enc);
bad[bad.length >> 1] ^= 1;
await fs.writeFile(enc, bad);
await assert.rejects(b.decryptFile(enc, dec), { code: 'BACKUP_DECRYPT_FAILED' });

// 4) File quá ngắn -> BACKUP_FILE_CORRUPT
await fs.writeFile(enc, Buffer.concat([Buffer.from('Z176ENC1'), Buffer.alloc(5)]));
await assert.rejects(b.decryptFile(enc, dec), { code: 'BACKUP_FILE_CORRUPT' });

await fs.rm(dir, { recursive: true, force: true });
console.log('OK: mã hóa/giải mã backup đúng; sai khóa, sửa file, file hỏng đều bị chặn');
