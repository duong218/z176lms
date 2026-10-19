/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { Header } from './components/Header';
import { Banner } from './components/Banner';
import { TimeAndCountdown } from './components/TimeAndCountdown';
import { CTAButton } from './components/CTAButton';
import { RegulationsSection } from './components/RegulationsSection';
import { QuickGuideSection } from './components/QuickGuideSection';
import { ResultsLookupSection } from './components/ResultsLookupSection';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { LoginModal } from './components/LoginModal';
import { ExamModal } from './components/ExamModal';
import { SessionRevokedModal } from './components/SessionRevokedModal';
import { ToastProvider } from './components/ToastContext';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { fetchMe, logoutUser, getAccessToken } from './services/auth.service';
import { SESSION_EXPIRED_EVENT } from './services/api';
import { hasPending, resetGeneration, claimOwner } from './services/question-generation.store';
import { fetchMyExam } from './services/exam-attempt.service';
import { AdminDashboard, ADMIN_DASHBOARD_TABS } from './pages/admin/AdminDashboard';
import { ExaminerDashboard, EXAMINER_DASHBOARD_TABS } from './pages/examiner/ExaminerDashboard';
import { LeaderDashboard, LEADER_DASHBOARD_TABS } from './pages/leader/LeaderDashboard';
import { CandidateDashboard } from './pages/candidate/CandidateDashboard';
import { fetchActiveExam } from './services/exam-review.service';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AlertCircle } from 'lucide-react';
import { setLenisInstance } from './lib/lenis-instance';

// Khoảng thời gian tự động làm mới kỳ thi đang active trên trang chủ (ms).
// Giúp Hero Section tự cập nhật khi Người duyệt đề vừa "Đăng chính thức" mà không cần F5.
const ACTIVE_EXAM_POLL_INTERVAL_MS = 60_000;

// Khoảng thời gian kiểm tra định kỳ xem tài khoản có vừa bị đăng nhập ở nơi
// khác hay không (mỗi lần đăng nhập mới, backend tăng tokenVersion khiến mọi
// access token cũ lập tức bị thu hồi — xem auth.service.js). 5s theo đúng yêu
// cầu: phát hiện gần như ngay lập tức, không bắt người dùng cũ chờ lâu mà
// không hiểu vì sao thao tác bị chặn.
const SESSION_CHECK_INTERVAL_MS = 15_000; // 15s: heartbeat/lưu đáp án cũng đã kiểm tra phiên (tokenVersion), không cần dò mỗi 5s

// App được tách làm 2 lớp: AppShell (bọc ToastProvider + ConfirmProvider) và
// App (nội dung thật, dùng được hook useToast()/useConfirm() vì đã nằm bên
// trong Provider). Tách vậy vì hook chỉ hoạt động được bên trong component
// con của Provider, không thể gọi ngay tại nơi định nghĩa Provider.
// ConfirmProvider thay cho window.confirm() gốc trình duyệt (không style
// được) — dùng chung ở AccountTab, DepartmentTab, TopicTab, ExamReviewTab,
// QuestionBankTab... nên đặt cùng cấp với ToastProvider ở đây.
export default function AppShell() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  );
}

// Map roleCode -> tab dashboard tương ứng. Dùng chung cho cả auto-login
// (khôi phục phiên khi mở lại tab) và đăng nhập thủ công qua LoginModal, để
// 2 luồng này luôn nhất quán — tránh trường hợp chỉ đăng nhập thủ công mới
// được tự chuyển sang Dashboard còn auto-login thì không.
// Đặt ở module scope (không phải trong component) vì đây là mapping TĨNH,
// không phụ thuộc props/state nào — giữ tham chiếu ổn định giữa các lần
// render, tránh phải liệt kê vào dependency array của useEffect bên dưới.
const DASHBOARD_TAB_BY_ROLE = {
  admin: 'admin-dashboard',
  examiner: 'examiner-dashboard',
  leader: 'leader-dashboard',
  candidate: 'candidate-dashboard',
};

function App() {
  const [activeTab, setActiveTab] = useState('home');
  // Tab con đang chọn trong từng dashboard (Admin/Examiner/Leader) — nâng
  // lên đây (thay vì state nội bộ của từng dashboard) để Header.jsx có thể
  // hiển thị + đổi được từ menu 3 gạch trên mobile.
  const [adminSubTab, setAdminSubTab] = useState('overview');
  const [examinerSubTab, setExaminerSubTab] = useState('overview');
  // Đề xuất cần tô sáng khi Người ra đề mở từ thông báo: { examId, ts } (null = không có yêu cầu)
  const [examinerHighlight, setExaminerHighlight] = useState(null);
  const [leaderSubTab, setLeaderSubTab] = useState('overview');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isExamOpen, setIsExamOpen] = useState(false);

  // ── Auth state ─────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Nội dung thông báo phiên bị thu hồi. null = không hiện modal.
  // Khác với Toast (có thể lờ đi/tự ẩn), modal này CHẶN thao tác — người dùng
  // bắt buộc phải bấm "Đăng nhập lại" mới đóng được, theo đúng yêu cầu: tránh
  // để người dùng tiếp tục thao tác trên phiên đã không còn hợp lệ.
  const confirmAction = useConfirm();
  const [sessionRevokedMessage, setSessionRevokedMessage] = useState(null);

  // Auto-login: kiểm tra accessToken khi mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    fetchMe()
      .then((user) => {
        setCurrentUser(user);
        // Đã có phiên đăng nhập hợp lệ (token còn hạn) -> vào thẳng Dashboard
        // theo role, thay vì hiện Trang chủ rồi bắt người dùng tự bấm lại.
        const dashboardTab = DASHBOARD_TAB_BY_ROLE[user?.roleCode];
        if (dashboardTab) {
          setActiveTab(dashboardTab);
        }
      })
      .catch((err) => {
        // Token hết hạn hoặc lỗi — bỏ qua, user sẽ thấy nút đăng nhập.
        // Riêng trường hợp admin vừa đổi vai trò thì phải báo rõ lý do (không đăng xuất im lặng).
        if (err?.code === 'AUTH_ROLE_CHANGED') {
          setSessionRevokedMessage('Quản trị viên đã thay đổi quyền của bạn. Vui lòng đăng nhập lại để tiếp tục.');
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Buộc đăng xuất về màn hình đăng nhập, kèm modal chặn giải thích lý do ──
  // Dùng chung cho mọi trường hợp phiên bị vô hiệu từ phía server (đăng nhập
  // nơi khác, đổi mật khẩu ở thiết bị khác, admin khoá tài khoản, refresh
  // token cũng đã hết hạn...), không chỉ riêng AUTH_ACCESS_REVOKED.
  const forceLogout = (message) => {
    setCurrentUser(null);
    setIsExamOpen(false);
    setIsChangePasswordOpen(false);
    setIsLoginOpen(false); // đóng luôn LoginModal cũ nếu lỡ đang mở, tránh chồng 2 modal
    setActiveTab('home');
    setSessionRevokedMessage(message);
  };

  // Bấm "Đăng nhập lại" trong modal: đóng modal cảnh báo, mở lại màn đăng nhập.
  const handleConfirmSessionRevoked = () => {
    setSessionRevokedMessage(null);
    setIsLoginOpen(true);
  };

  // ── MỚI: lắng nghe sự kiện phiên hết hạn thật sự (access token hết hạn VÀ
  // refresh token cũng hết hạn/không hợp lệ) do api.js phát ra sau khi đã tự
  // thử refresh nhưng thất bại. Trước đây các request cứ 401 thẳng ra UI mà
  // không có bước tự làm mới, giờ chỉ khi refresh cũng fail mới tới đây.
  useEffect(() => {
    const handleSessionExpired = (event) => {
      forceLogout(event.detail?.message || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  // ── Kiểm tra định kỳ: tài khoản có vừa bị đăng nhập ở trình duyệt/thiết bị
  // khác hay không (chỉ 1 phiên đăng nhập được hoạt động tại 1 thời điểm —
  // xem auth.service.js: mỗi lần login mới sẽ tăng tokenVersion, khiến access
  // token đang dùng ở nơi khác lập tức bị thu hồi). Chỉ chạy khi đã đăng nhập.
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;

    const checkSession = () => {
      fetchMe()
        .then((user) => {
          // Phiên vẫn hợp lệ. Nếu thông tin tài khoản vừa đổi (họ tên, mã NV, vai trò...)
          // thì cập nhật currentUser; không đổi thì giữ nguyên để khỏi render thừa.
          if (cancelled) return;
          setCurrentUser((prev) => {
            if (!prev) return prev;
            const keys = ['username', 'fullname', 'employeeCode', 'roleCode', 'roleName', 'mustChangePassword'];
            return keys.some((k) => prev[k] !== user?.[k]) ? { ...prev, ...user } : prev;
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (err?.code === 'AUTH_ROLE_CHANGED') {
            forceLogout('Quản trị viên đã thay đổi quyền của bạn. Vui lòng đăng nhập lại để tiếp tục.');
          } else if (err?.code === 'AUTH_ACCESS_REVOKED') {
            forceLogout(
              'Tài khoản của bạn đang được đăng nhập ở một trình duyệt/thiết bị khác. Vui lòng đăng nhập lại để tiếp tục.',
            );
          }
          // AUTH_ACCESS_EXPIRED không cần xử lý ở đây nữa — api.js đã tự
          // refresh + retry request này rồi, nên lỗi rơi tới đây chỉ còn là
          // "refresh cũng fail" (đã có event SESSION_EXPIRED_EVENT xử lý ở
          // effect trên) hoặc lỗi mạng tạm thời — không nên đăng xuất người
          // dùng chỉ vì 1 lần lỡ request mạng.
        });
    };

    const intervalId = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);

    // Trình duyệt làm chậm bộ đếm của tab nền (có thể tới ~1 phút), nên kiểm tra ngay khi tab được xem lại.
    const handleVisible = () => {
      if (document.visibilityState === 'visible') checkSession();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [currentUser]);

  // Tự động mở lại ExamModal nếu tài khoản đang có lượt thi dở dang (vd sau khi
  // F5/tải lại trang giữa chừng lúc đang làm bài). Chỉ kiểm tra 1 lần sau khi
  // đã xác định được currentUser (tránh gọi khi chưa biết trạng thái đăng nhập).
  // Không ảnh hưởng tới luồng bắt đầu thi bình thường — chỉ tự mở modal, việc
  // lấy đúng câu hỏi/đáp án đã xáo vẫn do ExamModal tự xử lý như cũ.
  useEffect(() => {
    if (authLoading || !currentUser || currentUser.roleCode !== 'candidate') return;

    let cancelled = false;
    fetchMyExam()
      .then((data) => {
        if (!cancelled && data?.attempt) {
          setIsExamOpen(true);
        }
      })
      .catch(() => {
        /* không có kỳ thi active / chưa gán đề — bỏ qua, không cần báo lỗi ở đây */
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser]);

  const [activeExam, setActiveExam] = useState(null);

  // Lấy kỳ thi đang published:
  // 1) Gọi ngay khi app khởi động (giữ hành vi cũ).
  // 2) Gọi lại mỗi khi người dùng quay về tab "home" (ví dụ sau khi đăng xuất khỏi Dashboard,
  //    hoặc bấm "Trang chủ" trên Header) — tránh phải F5 mới thấy kỳ thi vừa được publish.
  // 3) Polling định kỳ trong lúc đang ở trang chủ, để các tab đang mở sẵn cũng tự cập nhật.
  useEffect(() => {
    let cancelled = false;

    const loadActiveExam = () => {
      fetchActiveExam().then((data) => {
        if (!cancelled) setActiveExam(data);
      });
    };

    loadActiveExam();

    if (activeTab !== 'home') {
      return () => {
        cancelled = true;
      };
    }

    const intervalId = setInterval(loadActiveExam, ACTIVE_EXAM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeTab]);

  // Tự động mở modal đổi mật khẩu nếu bắt buộc
  useEffect(() => {
    if (currentUser?.mustChangePassword && (activeTab === 'admin-dashboard' || activeTab === 'examiner-dashboard' || activeTab === 'leader-dashboard' || activeTab === 'candidate-dashboard')) {
      setIsChangePasswordOpen(true);
    }
  }, [currentUser, activeTab]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    // Admin đăng nhập thành công -> tự động chuyển sang Dashboard,
    // không cần bấm thêm vào nút "Dashboard" trên Header.
    if (user?.roleCode === 'admin') {
      setActiveTab('admin-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (user?.roleCode === 'examiner') {
      setActiveTab('examiner-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (user?.roleCode === 'leader') {
      setActiveTab('leader-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (user?.roleCode === 'candidate') {
      setActiveTab('candidate-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Người tạo đề còn câu hỏi AI chưa tải / đang soạn → hỏi lại trước khi đăng xuất
  useEffect(() => { claimOwner(currentUser?.username); }, [currentUser?.username]);

  const handleLogout = async () => {
    if (
      hasPending() &&
      !(await confirmAction('Bạn còn câu hỏi AI chưa tải về (hoặc đang soạn). Đăng xuất sẽ mất toàn bộ.', {
        title: 'Chưa tải câu hỏi AI',
        confirmLabel: 'Vẫn đăng xuất',
        cancelLabel: 'Quay lại tải',
      }))
    )
      return;
    resetGeneration();
    await logoutUser();
    setCurrentUser(null);
    // Đăng xuất khỏi dashboard thì về lại trang chủ, tránh màn hình trắng
    // do activeTab vẫn là 'admin-dashboard'/'examiner-dashboard' nhưng currentUser đã null.
    setActiveTab('home');
  };

  // ── Unit Logo (localStorage) ───────────────────────────────
  const [unitLogo] = useState(() => {
    try {
      const saved = localStorage.getItem('z176_unit_logo_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error reading saved logo:', e);
    }
    return {
      type: 'preset',
      presetId: 'defense_star',
      title: 'Huy hiệu Quốc phòng Z176',
    };
  });

  // ── Navigation ─────────────────────────────────────────────
  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    if (tab !== 'home') {
      const element = document.getElementById(tab);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Bấm thông báo trên chuông, điều hướng theo role + loại thông báo; trả về true nếu đã điều hướng
  // để NotificationBell đóng dropdown. Loại khác (vd exam_published) giữ nguyên, không chuyển trang.
  //  - Leader bấm "đề xuất chờ duyệt" (exam_submitted)  -> tab "Duyệt kỳ thi".
  //  - Examiner bấm "đã phê duyệt/bị từ chối" (exam_approved/exam_rejected) -> tab "Đề xuất kỳ thi".
  const handleNotificationClick = (notification) => {
    const type = notification?.type;
    const role = currentUser?.roleCode;
    if (role === 'leader' && type === 'exam_submitted') {
      setLeaderSubTab('review');
      setActiveTab('leader-dashboard');
    } else if (role === 'examiner' && (type === 'exam_approved' || type === 'exam_rejected')) {
      setExaminerSubTab('proposals');
      // listForUser populate examId thành { _id, title }; null nếu kỳ thi đã bị xóa
      const examId = notification.examId?._id ?? notification.examId;
      setExaminerHighlight(examId ? { examId: String(examId), ts: Date.now() } : null);
      setActiveTab('examiner-dashboard');
    } else {
      return false;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleOpenExam = () => {
    setIsExamOpen(true);
  };

  // ── Lenis smooth scroll ─────────────────────────────────────
  // Chỉ cải thiện cảm giác cuộn trang, không ảnh hưởng đến state/logic nào khác.
  // lenisRef tránh việc React.StrictMode chạy effect 2 lần lúc mount tạo ra
  // 2 instance Lenis chồng nhau (nguyên nhân gây giật/lag khi cuộn).
  const lenisRef = useRef(null);
  useEffect(() => {
    if (lenisRef.current) return undefined;

    // lerp: hệ số làm mượt mỗi lần lăn chuột — số càng nhỏ càng "trôi" lâu, càng dễ cảm nhận.
    // wheelMultiplier: độ nhạy khi lăn chuột. autoRaf: để Lenis tự quản lý vòng lặp render,
    // tránh khả năng vòng lặp requestAnimationFrame tự viết tay bị lỗi/không chạy.
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      wheelMultiplier: 1,
      smoothWheel: true,
      autoRaf: true,
    });
    lenisRef.current = lenis;
    setLenisInstance(lenis); // MỚI — đăng ký vào registry để các modal ở mọi cấp cây component đều dùng được
    document.documentElement.classList.add('lenis');

    return () => {
      lenis.destroy();
      setLenisInstance(null); // MỚI — dọn registry khi App unmount
      document.documentElement.classList.remove('lenis');
      lenisRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-[#0F172A] antialiased selection:bg-[#008BC5] selection:text-white">
      {/* 1. Header (Navbar) fixed top */}
      <Header
        variant={activeTab.endsWith('-dashboard') ? 'dashboard' : 'public'}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenExam={handleOpenExam}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        unitLogo={unitLogo}
        currentUser={currentUser}
        authLoading={authLoading}
        onLogout={handleLogout}
        onNotificationClick={handleNotificationClick}
        dashboardTabs={
          activeTab === 'admin-dashboard'
            ? ADMIN_DASHBOARD_TABS
            : activeTab === 'examiner-dashboard'
              ? EXAMINER_DASHBOARD_TABS
              : activeTab === 'leader-dashboard'
                ? LEADER_DASHBOARD_TABS
                : []
        }
        dashboardActiveTab={
          activeTab === 'admin-dashboard'
            ? adminSubTab
            : activeTab === 'examiner-dashboard'
              ? examinerSubTab
              : activeTab === 'leader-dashboard'
                ? leaderSubTab
                : undefined
        }
        onSelectDashboardTab={
          activeTab === 'admin-dashboard'
            ? setAdminSubTab
            : activeTab === 'examiner-dashboard'
              ? setExaminerSubTab
              : activeTab === 'leader-dashboard'
                ? setLeaderSubTab
                : undefined
        }
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentUser?.mustChangePassword && (
          <div className="max-w-6xl mx-auto px-4 mt-20 -mb-12">
            <div className="p-4 bg-[#FFFBEB] border border-[#F6AD37]/40 text-[#0F172A] rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-base">Yêu cầu đổi mật khẩu!</p>
                  <p className="text-sm text-[#334155] font-medium">Tài khoản của bạn đang dùng mật khẩu tạm thời. Vui lòng đổi mật khẩu mới để bảo mật và mở khóa đầy đủ chức năng hệ thống.</p>
                </div>
              </div>
              <button
                onClick={() => setIsChangePasswordOpen(true)}
                className="px-4 py-2 bg-[#F6AD37] hover:bg-[#B45309] text-white rounded-lg text-sm font-semibold shrink-0 transition-colors shadow-sm"
              >
                Đổi mật khẩu ngay
              </button>
            </div>
          </div>
        )}

        {activeTab === 'admin-dashboard' && currentUser?.roleCode === 'admin' ? (
          <AdminDashboard currentUser={currentUser} activeTab={adminSubTab} onTabChange={setAdminSubTab} />
        ) : activeTab === 'examiner-dashboard' && currentUser?.roleCode === 'examiner' ? (
          <ExaminerDashboard
            currentUser={currentUser}
            activeTab={examinerSubTab}
            onTabChange={setExaminerSubTab}
            highlightExam={examinerHighlight}
            onHighlightConsumed={() => setExaminerHighlight(null)}
          />
        ) : activeTab === 'leader-dashboard' && currentUser?.roleCode === 'leader' ? (
          <LeaderDashboard currentUser={currentUser} onLogout={handleLogout} activeTab={leaderSubTab} onTabChange={setLeaderSubTab} />
        ) : activeTab === 'candidate-dashboard' && currentUser?.roleCode === 'candidate' ? (
          <CandidateDashboard
            currentUser={currentUser}
            onOpenExam={handleOpenExam}
            examModalOpen={isExamOpen}
            activeExam={activeExam}
          />
        ) : (
          <>
            {/* 2. Banner giới thiệu cuộc thi */}
            <section
              className="relative overflow-hidden bg-cover bg-[center_55%]"
              style={{ backgroundImage: 'url(/images/HeroSection.jpg)' }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,0.72)_0%,rgba(15,23,42,0.48)_52%,rgba(15,23,42,0.20)_100%)] pointer-events-none" />
              <div className="relative z-10">
                <Banner unitLogo={unitLogo} activeExam={activeExam} />
                <TimeAndCountdown activeExam={activeExam} />
                <CTAButton onClick={handleOpenExam} activeExam={activeExam} />
              </div>
            </section>

            {/* Quy chế & Thể lệ */}
            <RegulationsSection onStartExam={handleOpenExam} />

            {/* Hướng dẫn nhanh cho công nhân */}
            <QuickGuideSection onStartExam={handleOpenExam} />

            {/* Tra cứu kết quả thi */}
            <ResultsLookupSection />

            {/* Liên hệ & Hỗ trợ kỹ thuật */}
            <ContactSection />
          </>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <ExamModal
        isOpen={isExamOpen}
        onClose={() => setIsExamOpen(false)}
        currentUser={currentUser}
        onOpenLogin={() => {
          setIsExamOpen(false);
          setIsLoginOpen(true);
        }}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onPasswordChanged={() => {
          // MỚI — không còn nhận updatedUser để "vá" currentUser tại chỗ nữa.
          // Đổi mật khẩu xong server đã thu hồi token cũ (tokenVersion++) và
          // kỳ vọng đăng nhập lại (xem AUTH_PASSWORD_CHANGED). Đưa hẳn về
          // trang chủ + yêu cầu đăng nhập lại để mọi dashboard con (đặc biệt
          // CandidateDashboard) mount mới hoàn toàn, tránh giữ lại state cũ
          // (fetchMyExam lỗi do token vừa bị thu hồi -> canStartExam sai).
          setCurrentUser(null);
          setActiveTab('home');
          setIsLoginOpen(true);
        }}
        preventClose={currentUser?.mustChangePassword === true}
      />

      {/* Modal chặn khi phiên bị thu hồi (đăng nhập nơi khác) — z-[110],
          cao hơn Toast (z-[100]) để luôn đè lên trên nếu cả 2 cùng tồn tại. */}
      <SessionRevokedModal
        isOpen={!!sessionRevokedMessage}
        message={sessionRevokedMessage}
        onConfirm={handleConfirmSessionRevoked}
      />
    </div>
  );
}