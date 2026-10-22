import { useState } from 'react';
import { TabBadge } from './TabBadge';
import { Home, FileText, Award, CheckSquare, PhoneCall, User, Menu, X, LogOut, Shield, LayoutDashboard, KeyRound } from 'lucide-react';
import { UnitLogoDisplay } from './UnitLogoDisplay';
import { NotificationBell } from './NotificationBell';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTextSize, TEXT_SIZES } from '../hooks/useTextSize';

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  examiner: 'Người ra đề',
  candidate: 'Thí sinh',
  leader: 'Người duyệt đề',
};

export const Header = ({
  variant = 'public',
  activeTab,
  onSelectTab,
  onOpenLogin,
  onOpenExam,
  onOpenChangePassword,
  unitLogo,
  currentUser,
  authLoading,
  onLogout,
  // MỚI — danh sách tab con của dashboard hiện tại (vd 4 tab của
  // AdminDashboard: Tổng quan/Tài khoản/Nhật ký/Sao lưu) + tab đang chọn +
  // callback đổi tab. Chỉ có giá trị khi variant === 'dashboard' và trang đó
  // có hỗ trợ điều này (hiện tại: AdminDashboard). Dùng để hiển thị các tab
  // này ngay trong menu 3 gạch ở mobile, thay vì bắt người dùng vuốt ngang
  // 1 thanh tab riêng trong nội dung trang — khó thao tác trên màn hình nhỏ.
  dashboardTabs = [],
  dashboardActiveTab,
  onSelectDashboardTab,
  // MỚI — bấm vào 1 thông báo trong chuông (App quyết định điều hướng theo loại thông báo)
  onNotificationClick,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useScrollLock(drawerOpen);

  const menuItems = variant === 'dashboard' ? [] : [
    // "Trang chủ" chỉ hiện khi CHƯA đăng nhập — khi đã đăng nhập, logo Z176
    // ở đầu header đã đảm nhiệm việc đưa user về trang chủ (xem onClick của
    // nút logo bên dưới), nên nút này bị dư và được ẩn đi để menu gọn hơn.
    ...(!currentUser ? [{ id: 'home', label: 'Trang chủ', icon: <Home className="w-5 h-5 shrink-0" /> }] : []),
    { id: 'rules', label: 'Quy chế', icon: <FileText className="w-5 h-5 shrink-0" /> },
    { id: 'results', label: 'Kết quả', icon: <Award className="w-5 h-5 shrink-0" /> },
    { id: 'exam', label: 'Vào thi', icon: <CheckSquare className="w-5 h-5 shrink-0" /> },
    { id: 'contact', label: 'Liên hệ', icon: <PhoneCall className="w-5 h-5 shrink-0" /> },
  ];

  if (variant !== 'dashboard') {
    if (currentUser?.roleCode === 'admin') {
      menuItems.push({ id: 'admin-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> });
    }
    if (currentUser?.roleCode === 'examiner') {
      menuItems.push({ id: 'examiner-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> });
    }
    if (currentUser?.roleCode === 'leader') {
      menuItems.push({ id: 'leader-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> });
    }
    if (currentUser?.roleCode === 'candidate') {
      menuItems.push({ id: 'candidate-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> });
    }
  }

  const handleNavClick = (tab) => {
    if (tab === 'exam') {
      onOpenExam();
    } else {
      onSelectTab(tab);
    }
    setDrawerOpen(false);
  };

  // MỚI — chọn 1 tab con của dashboard (vd "Tài khoản" trong AdminDashboard)
  // từ trong drawer mobile, và đóng drawer lại luôn (giống hành vi
  // handleNavClick ở trên) để không phải tự tay bấm nút X.
  const handleDashboardTabClick = (tabId) => {
    onSelectDashboardTab(tabId);
    setDrawerOpen(false);
  };

  const [textSize, setTextSize] = useTextSize(currentUser?.username);
  const roleLabel = currentUser?.roleCode
    ? ROLE_LABELS[currentUser.roleCode] || currentUser.roleName || currentUser.roleCode
    : '';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F172A] text-white shadow-z176 border-b border-[#334155]/40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo Z176 */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 text-left focus:outline-none focus:ring-2 focus:ring-[#008BC5] rounded-md p-1 -ml-1 transition-colors"
          aria-label="Về trang chủ Z176"
        >
          <UnitLogoDisplay config={unitLogo} sizeClassName="w-10 h-10" iconSizeClassName="w-6 h-6" />
          <div className="flex flex-col">
            <span className="font-bold text-base leading-tight tracking-wide text-white">
              Z176 - BỘ QUỐC PHÒNG
            </span>
            <span className="text-xs text-[#64748B] font-medium leading-tight">
              Hệ thống thi nội bộ
            </span>
          </div>
        </button>

        {/* Desktop Navigation Menu — chỉ hiện từ lg (>=1024px) trở lên: ở
            variant='public' đã đăng nhập, thanh nav phải chứa cả menuItems
            lẫn user pill/chuông/nút đổi mật khẩu/đăng xuất, nên nếu bật từ
            md (768px) thì không đủ chỗ và bị xô/chồng lên nhau. Từ md tới
            dưới lg giờ dùng chung menu rút gọn (hamburger) như mobile. */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-3 min-w-0" aria-label="Menu chính">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 xl:px-4 rounded-lg font-medium text-sm xl:text-base transition-colors duration-200 whitespace-nowrap min-touch-target border ${isActive
                  ? 'bg-[#008BC5]/15 text-[#38BDF8] border-[#008BC5]/30 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                  : 'text-slate-300 hover:text-white hover:bg-[#334155]/40 border-transparent'
                  }`}
              >
                <span className="hidden xl:inline-block">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Desktop Auth Area — cùng breakpoint lg với nav ở trên, và co gọn
            dần theo chiều rộng: role label chỉ hiện từ xl, các nút phụ
            (đổi mật khẩu/đăng xuất) rút còn icon cho tới xl mới hiện chữ. */}
        <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0">
          {/* Cỡ chữ: bấm để đổi vòng Vừa → Lớn → Rất lớn */}
          <button
            onClick={() => setTextSize((textSize + 1) % TEXT_SIZES.length)}
            className="flex items-center gap-1.5 px-2.5 py-2 text-slate-200 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 whitespace-nowrap shrink-0 min-touch-target"
            title={`Cỡ chữ: ${TEXT_SIZES[textSize]} (bấm để đổi)`}
            aria-label={`Cỡ chữ hiện tại: ${TEXT_SIZES[textSize]}. Bấm để đổi cỡ chữ`}
          >
            <span className="font-bold text-lg leading-none">A<span className="text-sm">a</span></span>
            <span className="hidden xl:inline text-sm font-medium">{TEXT_SIZES[textSize]}</span>
          </button>
          {authLoading ? (
            <div className="w-6 h-6 border-2 border-slate-600 border-t-[#008BC5] rounded-full animate-spin" />
          ) : currentUser ? (
            <div className="flex items-center gap-1.5 xl:gap-2">
              {/* Chuông thông báo */}
              <NotificationBell currentUser={currentUser} onNotificationClick={onNotificationClick} />

              {/* User info pill */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800 rounded-lg border border-slate-700 max-w-[9rem] xl:max-w-none">
                <div className="w-7 h-7 rounded-full bg-[#008BC5]/20 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#38BDF8]" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-semibold text-white truncate">{currentUser.fullname ? `${currentUser.fullname}${currentUser.employeeCode ? ` - ${currentUser.employeeCode}` : ''}` : currentUser.username}</span>
                  <span className="hidden xl:block text-xs text-[#64748B] whitespace-nowrap">{roleLabel}</span>
                </div>
              </div>
              {/* Change password button */}
              <button
                onClick={onOpenChangePassword}
                className="flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-slate-400 hover:text-[#F6AD37] hover:bg-orange-500/10 rounded-lg transition-all duration-200 border border-transparent hover:border-orange-500/20 whitespace-nowrap shrink-0"
                title="Đổi mật khẩu"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              {/* Logout button */}
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 border border-transparent hover:border-red-500/20 whitespace-nowrap shrink-0"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">Thoát</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-base rounded-lg transition-all duration-200 border border-slate-700 hover:border-slate-600 whitespace-nowrap shadow-sm hover:shadow-md min-touch-target"
            >
              <User className="w-5 h-5 text-[#008BC5]" />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>

        {/* Mobile/Tablet Right Area: Chuông (nếu đăng nhập) + Hamburger Toggle (<1024px) */}
        <div className="flex items-center gap-1 lg:hidden">
          {!authLoading && currentUser && <NotificationBell currentUser={currentUser} onNotificationClick={onNotificationClick} />}
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2.5 text-white hover:bg-[#334155] rounded-lg min-touch-target flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
            aria-label="Mở danh mục menu"
          >
            <Menu className="w-7 h-7" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Slide-in */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-xs bg-[#0F172A] text-white h-full shadow-2xl flex flex-col z-10 border-r border-[#334155]">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#334155] flex items-center justify-between">
              <button
                onClick={() => handleNavClick('home')}
                className="flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-[#008BC5] rounded-md -ml-1 p-1"
                aria-label="Về trang chủ Z176"
              >
                <UnitLogoDisplay config={unitLogo} sizeClassName="w-8 h-8" iconSizeClassName="w-5 h-5" />
                <span className="font-bold text-base text-white">Menu hệ thống Z176</span>
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-gray-300 hover:text-white rounded-lg min-touch-target flex items-center justify-center"
                aria-label="Đóng menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Vùng cuộn: tab con + danh sách mục (khối tài khoản bên dưới được ghim, không cuộn) */}
            <div className="flex-1 min-h-0 overflow-y-auto" data-lenis-prevent>
            {/* MỚI — Tab con của dashboard hiện tại (vd 4 tab của
                AdminDashboard). Chỉ hiện khi variant='dashboard' VÀ trang đó
                có truyền dashboardTabs xuống (hiện tại chỉ AdminDashboard làm
                điều này) — nếu không có thì không hiện gì, không ảnh hưởng
                các dashboard khác (Examiner/Leader/Candidate) vốn chưa được
                chuyển qua cơ chế này. */}
            {variant === 'dashboard' && dashboardTabs.length > 0 && (
              <div className="p-4 space-y-2 border-b border-[#334155]">
                <p className="px-1 text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                  Chuyển mục
                </p>
                {dashboardTabs.map((tab) => {
                  const isActive = dashboardActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleDashboardTabClick(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-left text-base font-medium transition-colors min-touch-target ${isActive
                        ? 'bg-[#008BC5] text-white font-bold'
                        : 'text-gray-100 hover:bg-[#334155] active:bg-[#334155]'
                        }`}
                    >
                      {tab.icon}
                      <span className="flex-1">{tab.label}</span>
                      <TabBadge count={tab.badge} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Menu Items strictly in order */}
            <div className="p-4 space-y-2">
              {menuItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-left text-base font-medium transition-colors min-touch-target ${isActive
                      ? 'bg-[#008BC5] text-white font-bold'
                      : 'text-gray-100 hover:bg-[#334155] active:bg-[#334155]'
                      }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}

            </div>
            </div>

            {/* Khối tài khoản ghim đáy: luôn thấy Đổi mật khẩu / Đăng xuất dù cửa sổ thấp */}
            <div className="shrink-0 p-4 border-t border-[#334155] space-y-2">
                {/* Cỡ chữ (điện thoại chỉ có Vừa/Lớn) */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-300 shrink-0">Cỡ chữ</span>
                  <div className="flex flex-1 gap-1.5" role="group" aria-label="Chọn cỡ chữ">
                    {TEXT_SIZES.map((label, i) => (
                      <button
                        key={label}
                        onClick={() => setTextSize(i)}
                        aria-pressed={textSize === i}
                        className={`flex-1 min-h-[44px] rounded-lg border text-sm font-bold ${i === 2 ? 'max-sm:hidden' : ''} ${textSize === i ? 'bg-[#008BC5] border-[#008BC5] text-white' : 'border-slate-600 text-slate-200 hover:bg-[#334155]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {currentUser ? (
                  <>
                    {/* User info in drawer */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
                      <div className="w-8 h-8 rounded-full bg-[#008BC5]/20 flex items-center justify-center">
                        <Shield className="w-4.5 h-4.5 text-[#38BDF8]" />
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-semibold text-white">{currentUser.fullname ? `${currentUser.fullname}${currentUser.employeeCode ? ` - ${currentUser.employeeCode}` : ''}` : currentUser.username}</span>
                        <span className="text-xs text-[#64748B]">{roleLabel}</span>
                      </div>
                    </div>
                    {/* Change password in drawer */}
                    <button
                      onClick={() => {
                        setDrawerOpen(false);
                        onOpenChangePassword();
                      }}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 text-[#F6AD37] hover:bg-orange-500/10 font-semibold text-base rounded-lg transition-colors min-touch-target border border-orange-500/20"
                    >
                      <KeyRound className="w-5 h-5" />
                      <span>Đổi mật khẩu</span>
                    </button>
                    {/* Logout in drawer */}
                    <button
                      onClick={() => {
                        setDrawerOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 text-red-400 hover:bg-red-500/10 font-semibold text-base rounded-lg transition-colors min-touch-target border border-red-500/20"
                    >
                      <LogOut className="w-5 h-5" />
                      <span>Đăng xuất</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenLogin();
                    }}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#334155] hover:bg-[#334155]/80 text-white font-semibold text-base rounded-lg transition-colors min-touch-target border border-gray-600/40"
                  >
                    <User className="w-5 h-5 text-[#008BC5]" />
                    <span>Đăng nhập</span>
                  </button>
                )}
            </div>

            {/* Drawer Footer */}
            <div className="shrink-0 p-3 border-t border-[#334155] bg-[#0F172A] text-xs text-[#64748B] text-center">
              Công ty Z176 - Bộ Quốc phòng
            </div>
          </div>
        </div>
      )}
    </header>
  );
};