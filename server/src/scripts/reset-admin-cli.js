/**
 * Script CLI: Đặt lại mật khẩu tài khoản Quản trị viên (Admin)
 * Sử dụng khi Admin quên mật khẩu hoặc bị khóa tài khoản do nhập sai nhiều lần.
 *
 * Cách dùng:
 *   node src/scripts/reset-admin-cli.js [mật_khẩu_mới] [tên_đăng_nhập_admin]
 *   hoặc:
 *   npm run reset-admin [mật_khẩu_mới]
 */

import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { assertRuntimeEnv, env } from '../config/env.js';
import { Role, User } from '../models/index.js';

async function main() {
  assertRuntimeEnv();
  await connectDatabase();

  // 1. Xác định mật khẩu mới cần đặt
  const customPassword = process.argv[2]?.trim();
  const targetPassword = customPassword || env.adminSeedPassword || '123456';

  // 2. Xác định tài khoản admin cần reset
  const customUsername = process.argv[3]?.trim()?.toLowerCase();
  const configuredUsername = env.adminSeedEmail?.trim()?.toLowerCase();

  let adminUser = null;

  // Tìm role admin trước
  const adminRole = await Role.findOne({ code: 'admin' });
  if (!adminRole) {
    // eslint-disable-next-line no-console
    console.error('❌ Lỗi: Không tìm thấy vai trò "admin" trong cơ sở dữ liệu!');
    await disconnectDatabase();
    process.exit(1);
  }

  // Ưu tiên tìm theo username cụ thể (nếu có truyền vào hoặc cấu hình trong .env)
  const candidateUsername = customUsername || configuredUsername;
  if (candidateUsername) {
    adminUser = await User.findOne({ username: candidateUsername });
  }

  // Nếu không tìm thấy hoặc không có username cấu hình, tìm tài khoản đầu tiên có role là admin
  if (!adminUser) {
    adminUser = await User.findOne({ roleId: adminRole._id }).sort({ createdAt: 1 });
  }

  if (!adminUser) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ Không tìm thấy tài khoản admin hiện có. Đang tạo tài khoản admin mới...');
    const usernameToCreate = candidateUsername || 'admin';
    const passwordHash = await bcrypt.hash(targetPassword, env.bcryptSaltRounds);

    adminUser = await User.create({
      username: usernameToCreate,
      passwordHash,
      roleId: adminRole._id,
      isActive: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockUntil: null,
      tokenVersion: 1,
    });

    // eslint-disable-next-line no-console
    console.info(`✅ Đã khởi tạo thành công tài khoản Admin mới:`);
    // eslint-disable-next-line no-console
    console.info(`   👉 Tên đăng nhập: ${adminUser.username}`);
    // eslint-disable-next-line no-console
    console.info(`   👉 Mật khẩu mới : ${targetPassword}`);
    await disconnectDatabase();
    return;
  }

  // 3. Tiến hành đặt lại mật khẩu và gỡ toàn bộ trạng thái khóa
  const passwordHash = await bcrypt.hash(targetPassword, env.bcryptSaltRounds);

  adminUser.passwordHash = passwordHash;
  adminUser.isActive = true;
  adminUser.failedLoginAttempts = 0;
  adminUser.lockUntil = null;
  adminUser.lockedAt = undefined;
  adminUser.mustChangePassword = false;
  adminUser.tokenVersion = (adminUser.tokenVersion || 0) + 1; // Thu hồi token ở các thiết bị cũ

  await adminUser.save();

  // eslint-disable-next-line no-console
  console.info('========================================================');
  // eslint-disable-next-line no-console
  console.info('🎉 ĐẶT LẠI MẬT KHẨU TÀI KHOẢN ADMIN THÀH CÔNG!');
  // eslint-disable-next-line no-console
  console.info(`   👉 Tên đăng nhập: ${adminUser.username}`);
  // eslint-disable-next-line no-console
  console.info(`   👉 Mật khẩu mới : ${targetPassword}`);
  // eslint-disable-next-line no-console
  console.info(`   👉 Trạng thái   : Đã mở khóa (isActive = true), gỡ bỏ giới hạn khóa tạm thời.`);
  // eslint-disable-next-line no-console
  console.info('========================================================');

  await disconnectDatabase();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Lỗi khi reset mật khẩu admin:', err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});

