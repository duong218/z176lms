import { UserInfoCard } from '../../components/UserInfoCard';
import { DashboardShell } from '../../components/DashboardShell';
import { OverviewTab } from '../../components/admin/OverviewTab';
import { AccountTab } from '../../components/admin/AccountTab';
import { AuditLogTab } from '../../components/admin/AuditLogTab';
import { BackupTab } from '../../components/admin/BackupTab';
import { AiSettingsTab } from '../../components/admin/AiSettingsTab';
import { BackupProgressCard } from '../../components/admin/BackupProgressCard';
import { LayoutDashboard, Users, Activity, Database, Bot } from 'lucide-react';

// Xuất ra ngoài để App.jsx dùng lại đúng 1 nguồn danh sách tab này khi
// truyền xuống Header.jsx (hiển thị trong menu 3 gạch ở mobile) — tránh
// định nghĩa lặp lại 2 nơi khiến label/icon lệch nhau nếu sau này đổi tab.
export const ADMIN_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'accounts', label: 'Tài khoản', icon: <Users className="w-5 h-5" /> },
  { id: 'audit', label: 'Nhật ký (Log)', icon: <Activity className="w-5 h-5" /> },
  { id: 'backup', label: 'Sao lưu & Phục hồi', icon: <Database className="w-5 h-5" /> },
  { id: 'ai', label: 'Trợ lý AI', icon: <Bot className="w-5 h-5" /> },
];

// activeTab/onTabChange là props từ App.jsx (thay vì state nội bộ) —
// để Header.jsx (menu 3 gạch ở mobile) đọc/đổi được đúng tab đang chọn ở đây,
// tránh 2 nơi giữ 2 state tab riêng biệt lệch nhau.
export const AdminDashboard = ({ currentUser, activeTab, onTabChange }) => {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 md:py-8 mt-16 min-h-screen">
      {/* Tiêu đề trang */}
      <div className="mb-5 md:mb-6 flex items-start gap-3 md:gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#EAF6FF] flex items-center justify-center shrink-0">
          <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6 text-[#008BC5]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] leading-tight">Bảng điều khiển quản trị</h1>
          <p className="text-sm md:text-base text-[#334155] mt-1">
            Quản lý người dùng và theo dõi hoạt động hệ thống Z176.
          </p>
        </div>
      </div>

      <DashboardShell
        tabs={ADMIN_DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={onTabChange}
        idPrefix="admin"
        label="Các mục quản trị"
      >
        {activeTab === 'overview' && <UserInfoCard user={currentUser} />}
        {activeTab === 'overview' && <OverviewTab onNavigate={onTabChange} />}
        {activeTab === 'accounts' && <AccountTab currentUser={currentUser} />}
        {activeTab === 'audit' && <AuditLogTab />}
        {activeTab === 'backup' && <BackupTab />}
        {activeTab === 'ai' && <AiSettingsTab />}
      </DashboardShell>
      {/* Tiến độ backup thủ công: hiện ở mọi mục để admin vừa sao lưu vừa làm việc khác */}
      <BackupProgressCard />
    </div>
  );
};