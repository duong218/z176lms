import { UserInfoCard } from '../../components/UserInfoCard';
import { DashboardShell } from '../../components/DashboardShell';
import { useState } from 'react';
import { QuestionBankTab } from '../../components/examiner/QuestionBankTab';
import { TopicTab } from '../../components/examiner/TopicTab';
import { DepartmentTab } from '../../components/examiner/DepartmentTab';
import { ExamProposalTab } from '../../components/examiner/ExamProposalTab';
import { OverviewTab } from '../../components/examiner/OverviewTab';
import { StudyDocumentTab } from '../../components/examiner/StudyDocumentTab';
import { QuestionAnalysisTab } from '../../components/examiner/QuestionAnalysisTab';
import { QuestionGeneratorTab } from '../../components/examiner/QuestionGeneratorTab';
import { GenerationBadge } from '../../components/examiner/GenerationProgress';
import { LayoutDashboard, BookOpen, FolderOpen, Building, FileSignature, Library, BarChart3, Sparkles } from 'lucide-react';

// Xuất ra ngoài để App.jsx dùng lại khi truyền xuống Header.jsx (hiển thị
// trong menu 3 gạch ở mobile), cùng pattern đã áp dụng cho ADMIN_DASHBOARD_TABS.
export const EXAMINER_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'questions', label: 'Ngân hàng câu hỏi', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'analysis', label: 'Phân tích câu hỏi', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'topics', label: 'Chủ đề', icon: <FolderOpen className="w-5 h-5" /> },
  { id: 'departments', label: 'Bộ phận / Phòng ban', icon: <Building className="w-5 h-5" /> },
  { id: 'proposals', label: 'Đề xuất kỳ thi', icon: <FileSignature className="w-5 h-5" /> },
  { id: 'materials', label: 'Tài liệu ôn tập', icon: <Library className="w-5 h-5" /> },
  { id: 'ai-questions', label: 'Tạo câu hỏi bằng AI', icon: <Sparkles className="w-5 h-5" /> },
];

// Gắn huy hiệu số đề cần xử lý (bị từ chối + bản nháp) vào mục "Đề xuất kỳ thi" (thanh bên lẫn menu mobile trong Header)
export const examinerTabsWithBadge = (count) =>
  EXAMINER_DASHBOARD_TABS.map((t) => (t.id === 'proposals' ? { ...t, badge: count } : t));

// activeTab/onTabChange giờ là props từ App.jsx (thay vì state nội bộ) — để
// Header.jsx (menu 3 gạch ở mobile) đọc/đổi được đúng tab đang chọn ở đây.
// highlightExam/onHighlightConsumed: yêu cầu tô sáng 1 đề xuất khi mở từ chuông thông báo (xem App.jsx).
export const ExaminerDashboard = ({ currentUser, activeTab, onTabChange, highlightExam, onHighlightConsumed, todoCount = 0, onTodoChange }) => {
  // Khi bấm "Xem câu hỏi" trên 1 thẻ chủ đề ở tab Chủ đề, hoặc trên 1 thẻ bộ
  // phận ở tab Bộ phận/Phòng ban, lưu filter tương ứng + mốc thời gian
  // (seed) vào đây rồi chuyển sang tab Ngân hàng câu hỏi. Kèm seed để nếu
  // người dùng bấm lại đúng mục cũ lần nữa, QuestionBankTab vẫn nhận biết
  // được đây là 1 yêu cầu áp filter MỚI (không chỉ so sánh id không đổi mà
  // bỏ qua).
  const [questionsFilterSeed, setQuestionsFilterSeed] = useState(null);

  const handleViewQuestionsByTopic = (topicId) => {
    setQuestionsFilterSeed({ topicId, ts: Date.now() });
    onTabChange('questions');
  };

  const handleViewQuestionsByDepartment = (departmentId) => {
    setQuestionsFilterSeed({ departmentId, ts: Date.now() });
    onTabChange('questions');
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-8 mt-14 sm:mt-16 min-h-screen">
      <div className="mb-5 sm:mb-8 px-1">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0F172A] mb-1.5 sm:mb-2">QUẢN LÝ NGÂN HÀNG ĐỀ THI</h1>
        <p className="text-sm sm:text-base text-[#334155]">Soạn thảo, quản lý câu hỏi thi chuyên môn và bộ phận phòng ban.</p>
      </div>

      <DashboardShell
        tabs={examinerTabsWithBadge(todoCount)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        idPrefix="examiner"
        label="Các mục quản lý của Người ra đề"
        animated={false}
      >
        {/* onNavigate: để các mục "Việc cần xử lý", "Đề xuất gần đây"... trong Tổng quan chuyển thẳng sang tab tương ứng */}
        {activeTab === 'overview' && <UserInfoCard user={currentUser} />}
        {activeTab === 'overview' && <OverviewTab onNavigate={onTabChange} />}
        {activeTab === 'questions' && <QuestionBankTab initialFilter={questionsFilterSeed} />}
        {activeTab === 'analysis' && <QuestionAnalysisTab />}
        {activeTab === 'topics' && <TopicTab onViewQuestions={handleViewQuestionsByTopic} />}
        {activeTab === 'departments' && <DepartmentTab onViewQuestions={handleViewQuestionsByDepartment} />}
        {activeTab === 'proposals' && <ExamProposalTab highlightExam={highlightExam} onHighlightConsumed={onHighlightConsumed} onTodoChange={onTodoChange} />}
        {activeTab === 'materials' && <StudyDocumentTab />}
        {activeTab === 'ai-questions' && <QuestionGeneratorTab />}
        {activeTab !== 'ai-questions' && <GenerationBadge onClick={() => onTabChange('ai-questions')} />}
      </DashboardShell>
    </div>
  );
};