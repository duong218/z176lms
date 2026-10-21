import { useState } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

// Khung điều hướng dùng chung cho 3 dashboard (Quản trị, Người duyệt đề, Người ra đề):
//  - từ lg (1024px): thanh chức năng DỌC bên trái, sticky, thu gọn được thành cột biểu tượng
//  - từ md đến dưới lg: thanh tab ngang như cũ
//  - dưới md: không hiện thanh nào, dùng menu 3 gạch ở Header.jsx (chỉ hiện tên mục đang xem)
const STORE_KEY = 'z176.dashboardSidebarCollapsed';
const NARROW_SCREEN = 1100; // màn hẹp (laptop nhỏ, máy tính bảng ngang) mặc định thu gọn để nhường chỗ cho nội dung

const initialCollapsed = () => {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    /* trình duyệt chặn localStorage: dùng mặc định theo độ rộng màn hình */
  }
  return window.innerWidth < NARROW_SCREEN;
};

export const DashboardShell = ({ tabs, activeTab, onTabChange, idPrefix, label, animated = true, children }) => {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const activeLabel = tabs.find((t) => t.id === activeTab)?.label;

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORE_KEY, next ? '1' : '0');
      } catch {
        /* bỏ qua: chỉ không nhớ được lựa chọn */
      }
      return next;
    });

  return (
    <div className="lg:flex lg:items-start lg:gap-5">
      {/* Thanh dọc bên trái (từ lg) */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-20 transition-[width] duration-200 motion-reduce:transition-none ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <div className="bg-white rounded-xl shadow-z176 border border-slate-200 p-2 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <div role="tablist" aria-orientation="vertical" aria-label={label} className="flex flex-col gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`${idPrefix}-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`${idPrefix}-tabpanel`}
                  title={collapsed ? tab.label : undefined}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex items-center gap-3 min-h-[48px] rounded-lg text-left text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#008BC5] ${
                    collapsed ? 'justify-center px-0' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-[#006BA1] text-white font-semibold'
                      : 'text-[#334155] font-medium hover:bg-slate-100 hover:text-[#0F172A]'
                  }`}
                >
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-white" aria-hidden="true" />}
                  <span className="shrink-0">{tab.icon}</span>
                  <span className={collapsed ? 'sr-only' : 'min-w-0 leading-snug'}>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mở rộng thanh chức năng' : 'Thu gọn thanh chức năng'}
            title={collapsed ? 'Mở rộng thanh chức năng' : undefined}
            className={`mt-2 pt-2 border-t border-slate-200 w-full flex items-center gap-3 min-h-[48px] rounded-lg text-base font-medium text-[#475569] hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#008BC5] ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            {collapsed ? <ChevronsRight className="w-5 h-5" aria-hidden="true" /> : <ChevronsLeft className="w-5 h-5" aria-hidden="true" />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
        </div>
      </aside>

      {/* Khung nội dung. overflow-clip (không dùng overflow-hidden) để các phần tử sticky bên trong vẫn hoạt động. */}
      <div className="min-w-0 flex-1 bg-white rounded-xl shadow-z176 border border-slate-200 overflow-clip">
        {/* Thanh tab ngang: chỉ từ md đến dưới lg */}
        <div
          role="tablist"
          aria-label={label}
          className="hidden md:flex lg:hidden overflow-x-auto border-b border-slate-200 bg-white px-2 scrollbar-hide"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center gap-2 px-5 py-4 min-h-[48px] font-semibold text-base whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#008BC5] ${
                  isActive ? 'text-[#00709F] bg-[#EAF6FF]' : 'text-[#334155] hover:text-[#0F172A]'
                }`}
              >
                {tab.icon}
                {tab.label}
                <span
                  className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full transition-colors ${isActive ? 'bg-[#008BC5]' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {/* Điện thoại: thanh tab đã ẩn nên hiện tên mục đang xem */}
        {activeLabel && (
          <div className="md:hidden px-4 py-3 border-b border-slate-200 bg-white text-base font-semibold text-[#0F172A]">
            {activeLabel}
          </div>
        )}

        <div
          key={activeTab}
          role="tabpanel"
          id={`${idPrefix}-tabpanel`}
          aria-labelledby={`${idPrefix}-tab-${activeTab}`}
          className={`${animated ? 'animate-fade-in-up ' : ''}p-3 sm:p-4 md:p-6 bg-[#F8FAFC] min-h-[400px]`}
          style={animated ? { '--stagger-delay': '0ms' } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
};