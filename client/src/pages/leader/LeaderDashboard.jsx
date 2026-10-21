import { useState, useEffect } from 'react';
import { UserInfoCard } from '../../components/UserInfoCard';
import { DashboardShell } from '../../components/DashboardShell';
import { LayoutDashboard, Building2, FileBarChart, PieChart, CheckCircle, BookOpen, TrendingUp, ShieldAlert, Bot } from 'lucide-react';
import { OverviewTab } from '../../components/leader/OverviewTab';
import { DepartmentReportTab } from '../../components/leader/DepartmentReportTab';
import { ExamReportTab } from '../../components/leader/ExamReportTab';
import { DetailedResultsTab } from '../../components/leader/DetailedResultsTab';
import { ExamReviewTab } from '../../components/leader/ExamReviewTab';
import { CompetencyTab } from '../../components/leader/CompetencyTab';
import { AnomalyTab } from '../../components/leader/AnomalyTab';
import { AiAssistantChat } from '../../components/candidate/AiAssistantChat';
import { fetchAiStatus, askLeaderAssistant } from '../../services/ai-assistant.service';

const ASSISTANT_SUGGESTIONS = [
  'Tỷ lệ đạt của kỳ thi gần nhất theo từng phòng ban?',
  'Phòng ban nào có điểm trung bình thấp nhất?',
  'Chủ đề nào cả công ty hay sai nhất?',
  'Phòng nào ít luyện tập trước kỳ thi?',
  'Có lượt thi nào bất thường không?',
  'Đang có đề nào chờ duyệt hoặc chờ đăng chính thức?',
  'Liệt kê những người không đạt gần đây để tôi cân nhắc cấp thêm lượt thi',
  'So sánh tỷ lệ đạt các phòng ban bằng biểu đồ cột',
];

// Xuất ra ngoài để App.jsx dùng lại khi truyền xuống Header.jsx (hiển thị
// trong menu 3 gạch ở mobile), cùng pattern đã áp dụng cho ADMIN_DASHBOARD_TABS
// và EXAMINER_DASHBOARD_TABS.
export const LEADER_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <PieChart className="w-5 h-5" /> },
  { id: 'review', label: 'Duyệt kỳ thi', icon: <CheckCircle className="w-5 h-5" /> },
  { id: 'department', label: 'Theo phòng ban', icon: <Building2 className="w-5 h-5" /> },
  { id: 'competency', label: 'Năng lực phòng ban', icon: <TrendingUp className="w-5 h-5" /> },
  { id: 'anomaly', label: 'Dấu hiệu bất thường', icon: <ShieldAlert className="w-5 h-5" /> },
  { id: 'exam', label: 'Theo bài thi', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'detailed', label: 'Kết quả chi tiết', icon: <FileBarChart className="w-5 h-5" /> },
  { id: 'assistant', label: 'Trợ lý báo cáo', icon: <Bot className="w-5 h-5" /> },
];

// activeTab/onTabChange là props từ App.jsx — để Header.jsx (menu 3 gạch ở
// mobile) đọc/đổi được đúng tab đang chọn ở đây.
export const LeaderDashboard = ({ currentUser, activeTab, onTabChange }) => {
  const [aiEnabled, setAiEnabled] = useState(false); // admin bật/tắt Trợ lý AI
  useEffect(() => {
    fetchAiStatus()
      .then((st) => setAiEnabled(Boolean(st?.enabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 md:py-8 mt-16 min-h-screen">
      {/* Tiêu đề trang */}
      <div className="mb-5 md:mb-6 flex items-start gap-3 md:gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#EAF6FF] flex items-center justify-center shrink-0">
          <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6 text-[#008BC5]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] leading-tight">Dashboard Người duyệt đề</h1>
          <p className="text-sm md:text-base text-[#334155] mt-1">Báo cáo và thống kê kết quả thi chuyên môn Z176.</p>
        </div>
      </div>

      <DashboardShell
        tabs={LEADER_DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={onTabChange}
        idPrefix="leader"
        label="Các mục báo cáo"
      >
        {activeTab === 'overview' && <UserInfoCard user={currentUser} />}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'department' && <DepartmentReportTab />}
        {activeTab === 'competency' && <CompetencyTab />}
        {activeTab === 'anomaly' && <AnomalyTab />}
        {activeTab === 'exam' && <ExamReportTab />}
        {activeTab === 'detailed' && <DetailedResultsTab />}
        {activeTab === 'review' && <ExamReviewTab />}
        {/* Luôn mount (chỉ ẩn) để đổi mục rồi quay lại không mất hội thoại */}
        <div hidden={activeTab !== 'assistant'}>
          {aiEnabled ? (
            <AiAssistantChat
              active={activeTab === 'assistant'}
              onAsk={askLeaderAssistant}
              suggestions={ASSISTANT_SUGGESTIONS}
              title="Trợ lý báo cáo"
              subtitle="Trợ lý đọc số liệu báo cáo toàn công ty và chỉ trả lời, không tự duyệt đề hay cấp lượt thi. Dấu hiệu bất thường chỉ là gợi ý để xem xét; hãy đối chiếu với báo cáo gốc."
            />
          ) : (
            <p className="p-4 bg-white rounded-xl border border-slate-200 text-slate-600">
              Trợ lý AI chưa được bật. Vui lòng báo quản trị viên cấu hình và bật Trợ lý AI.
            </p>
          )}
        </div>
      </DashboardShell>
    </div>
  );
};