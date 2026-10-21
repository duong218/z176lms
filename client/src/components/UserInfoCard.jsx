import { UserCircle2, ShieldCheck } from 'lucide-react';

// Thẻ thông tin tài khoản đang đăng nhập, dùng ở đầu tab Tổng quan của Admin/Người ra đề/Người duyệt đề.
// Hiển thị "Họ tên - Mã NV" (từ hồ sơ Employee); tài khoản chưa có hồ sơ thì dùng username.
export const UserInfoCard = ({ user }) => {
  if (!user) return null;
  const displayName = user.fullname
    ? `${user.fullname}${user.employeeCode ? ` - ${user.employeeCode}` : ''}`
    : user.username;
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4 sm:p-5 mb-4 sm:mb-5 flex items-center gap-4">
      <span className="w-12 h-12 rounded-xl bg-[#EAF6FF] text-[#008BC5] flex items-center justify-center shrink-0">
        <UserCircle2 className="w-6 h-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold text-[#0F172A] truncate">{displayName}</p>
        <p className="text-base text-[#334155] flex items-center gap-1.5 mt-0.5">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          {user.roleName}
        </p>
      </div>
    </div>
  );
};