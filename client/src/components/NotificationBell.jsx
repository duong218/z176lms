import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Clock, CheckCircle, XCircle, Globe, AlertTriangle, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notification.service';

// Icon + màu theo đúng 3/5 màu chức năng của design-system.md, khớp với
// STATUS_BADGE trong ExamReviewTab.jsx và VARIANTS trong Toast.jsx để nhất
// quán ý nghĩa màu xuyên suốt hệ thống.
const TYPE_CONFIG = {
  exam_submitted: { Icon: Clock, color: '#B45309' },
  exam_approved: { Icon: CheckCircle, color: '#16A34A' },
  exam_rejected: { Icon: XCircle, color: '#C53030' },
  exam_published: { Icon: Globe, color: '#008BC5' },
  exam_assignment_failed: { Icon: AlertTriangle, color: '#B45309' },
};

// Khoảng thời gian polling số thông báo chưa đọc — đủ nhanh để cảm nhận
// "gần như tức thời" mà không dồn quá nhiều request, cùng bậc với
// ACTIVE_EXAM_POLL_INTERVAL_MS trong App.jsx.
const UNREAD_POLL_INTERVAL_MS = 30_000;

// Mặc định chỉ hiện 3 thông báo mới nhất — tránh dropdown dài quá khi có
// nhiều thông báo dồn lại (vd nhiều kỳ thi được đăng liên tiếp). Người dùng
// bấm "Xem thêm" để mở rộng xem hết (tối đa những gì fetchNotifications()
// đã tải về, giới hạn 30 bản ghi ở phía service).
const INITIAL_VISIBLE_COUNT = 3;

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} ngày trước`;
}

// onNotificationClick(notification): App quyết định có điều hướng hay không và trả về true nếu đã điều hướng
// (khi đó dropdown tự đóng). Trả về false/undefined thì giữ hành vi cũ: chỉ đánh dấu đã đọc, dropdown vẫn mở.
export const NotificationBell = ({ currentUser, onNotificationClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  const loadUnreadCount = useCallback(() => {
    if (!currentUser) return;
    fetchUnreadCount()
      .then(setUnreadCount)
      .catch(() => {
        /* lỗi mạng tạm thời — badge giữ nguyên giá trị cũ, không chặn UI */
      });
  }, [currentUser]);

  const loadNotifications = useCallback(() => {
    if (!currentUser) return;
    setLoading(true);
    fetchNotifications()
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [currentUser]);

  // Polling badge số chưa đọc — chạy nền kể cả khi dropdown đang đóng, để
  // người dùng thấy có tin mới ngay cả khi không mở chuông.
  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }
    loadUnreadCount();
    const intervalId = setInterval(loadUnreadCount, UNREAD_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [currentUser, loadUnreadCount]);

  // Mở dropdown -> tải danh sách mới nhất, luôn bắt đầu ở trạng thái gọn
  // (3 mục) dù lần trước đã bấm "Xem thêm" — tránh dropdown mở ra đã dài
  // ngay từ đầu ở lần sau.
  useEffect(() => {
    if (isOpen) {
      setShowAll(false);
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleItemClick = async (notification) => {
    // Điều hướng trước, không chờ mạng; thông báo đã đọc rồi vẫn bấm để đi tiếp được.
    const navigated = onNotificationClick?.(notification) === true;
    if (navigated) setIsOpen(false);
    if (notification.isRead) return;
    try {
      await markNotificationRead(notification._id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* giữ nguyên trạng thái nếu lỗi mạng — không chặn thao tác khác */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* giữ nguyên trạng thái nếu lỗi mạng */
    }
  };

  if (!currentUser) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative p-2.5 text-slate-300 hover:text-white hover:bg-[#334155]/40 rounded-lg min-touch-target flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
        aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ''}`}
        title="Thông báo"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E53E3E] text-white text-[11px] font-bold flex items-center justify-center leading-none"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 w-auto sm:w-96 max-w-full sm:max-w-sm bg-white rounded-[10px] border border-[#E2E8F0] shadow-z176 overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] bg-[#F6F8FA]">
            <h3 className="text-base font-bold text-[#0F172A]">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#008BC5] hover:underline min-touch-target px-2 py-1"
              >
                <CheckCheck className="w-4 h-4" />
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto" data-lenis-prevent>
            {loading ? (
              <div className="p-8 text-center text-[#64748B] text-base">Đang tải...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-[#64748B] text-base">
                Bạn chưa có thông báo nào
              </div>
            ) : (
              (showAll ? notifications : notifications.slice(0, INITIAL_VISIBLE_COUNT)).map((n) => {
                const cfg = TYPE_CONFIG[n.type] || { Icon: Bell, color: '#64748B' };
                const { Icon, color } = cfg;
                return (
                  <button
                    key={n._id}
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 border-b border-[#E2E8F0] last:border-b-0 transition-colors ${
                      n.isRead ? 'bg-white hover:bg-[#F6F8FA]' : 'bg-[#EAF6FF] hover:bg-[#DFF2FF]'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color }} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold text-[#0F172A]">{n.title}</span>
                        {!n.isRead && (
                          <span
                            className="w-2 h-2 rounded-full bg-[#008BC5] shrink-0 mt-1.5"
                            aria-label="Chưa đọc"
                          />
                        )}
                      </div>
                      <p className="text-sm text-[#334155] mt-0.5 leading-snug">{n.message}</p>
                      <span className="text-xs text-[#64748B] mt-1 block">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Xem thêm / Thu gọn — chỉ hiện khi có nhiều hơn INITIAL_VISIBLE_COUNT
              thông báo, giữ dropdown gọn theo mặc định thay vì luôn hiện hết. */}
          {!loading && notifications.length > INITIAL_VISIBLE_COUNT && (
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-[#008BC5] hover:bg-[#F0F9FF] border-t border-[#E2E8F0] min-touch-target transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Thu gọn
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Xem thêm {notifications.length - INITIAL_VISIBLE_COUNT} thông báo
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};