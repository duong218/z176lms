import { useState, useEffect } from 'react';
import { PlayCircle, ArrowRight, Info } from 'lucide-react';
import { getExamPhase } from '../lib/examPhase';

const formatVN = (value) => new Date(value).toLocaleString('vi-VN');

// Trạng thái cho phép bấm "Vào thi" kèm lý do khi chưa được vào:
// - Chưa có activeExam (chưa publish kỳ thi nào) -> không cho vào thi.
// - Chưa tới startDate -> báo giờ bắt đầu.
// - Đã quá endDate -> báo đã kết thúc.
export function getExamEntryState(activeExam) {
  if (!activeExam?.startDate || !activeExam?.endDate) {
    return { open: false, message: 'Hiện tại chưa có kỳ thi nào đang diễn ra.' };
  }
  const now = Date.now();
  const start = new Date(activeExam.startDate).getTime();
  const end = new Date(activeExam.endDate).getTime();
  if (now < start) {
    return { open: false, message: `Kỳ thi "${activeExam.title}" chưa bắt đầu. Thời gian bắt đầu: ${formatVN(start)}.` };
  }
  if (now > end) {
    return { open: false, message: `Kỳ thi "${activeExam.title}" đã kết thúc lúc ${formatVN(end)}.` };
  }
  return { open: true, message: '' };
}

export const CTAButton = ({ onClick, activeExam }) => {
  const [showDisabledNotice, setShowDisabledNotice] = useState(false);

  // Re-render định kỳ để nút tự chuyển trạng thái mờ ngay khi hết giờ,
  // không cần người dùng phải F5 lại trang.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Tính lại ở MỖI lần render (bộ đếm 1 giây ở trên kích hoạt) để nút tự mờ đúng lúc hết giờ / sáng đúng lúc tới giờ bắt đầu.
  const entry = getExamEntryState(activeExam);
  const isOpen = entry.open;
  const phase = getExamPhase(activeExam);
  const buttonText = isOpen ? 'VÀO THI NGAY' : phase === 'upcoming' ? 'CHƯA ĐẾN GIỜ THI' : phase === 'ended' ? 'KỲ THI ĐÃ KẾT THÚC' : 'VÀO THI NGAY';

  useEffect(() => {
    if (!showDisabledNotice) return;
    const timeout = setTimeout(() => setShowDisabledNotice(false), 3500);
    return () => clearTimeout(timeout);
  }, [showDisabledNotice]);

  const handleClick = () => {
    if (!isOpen) {
      setShowDisabledNotice(true);
      return;
    }
    onClick?.();
  };

  return (
    <div className="py-2.5 sm:py-4 px-4">
      <div className="max-w-md mx-auto">
        {/*
          CTA Button "VÀO THI":
          - EXCEPTION ONLY: Pill border radius (rounded-full / 999px)
          - Flat blue #008BC5 (NO RED)
          - White text, 18px, weight 700
          - Full-width on mobile, minimum height 52px
          - Khi không trong thời gian thi hợp lệ: mờ đi (disabled trực quan) nhưng vẫn nhận click
            để có thể báo cho người dùng biết lý do, thay vì im lặng không phản hồi gì.
        */}
        <button
          type="button"
          onClick={handleClick}
          aria-disabled={!isOpen}
          aria-label={
            isOpen
              ? 'Nhấn để bắt đầu vào thi trực tuyến'
              : entry.message
          }
          className={`w-full min-h-[52px] font-bold text-[18px] sm:text-[20px] rounded-[999px] shadow-lg flex items-center justify-center gap-3 px-8 transition-all duration-200 focus:outline-none focus:ring-4 min-touch-target ${isOpen
              ? 'bg-[#008BC5] hover:bg-[#0077A8] active:scale-95 text-white shadow-[#008BC5]/20 cursor-pointer focus:ring-[#008BC5]/30'
              : 'bg-slate-400/70 text-white/90 shadow-slate-900/10 cursor-not-allowed opacity-60 focus:ring-slate-300/30'
            }`}
        >
          <PlayCircle className="w-6 h-6 shrink-0" />
          <span>{buttonText}</span>
          <ArrowRight className="w-5 h-5 shrink-0" />
        </button>

        <p className="text-center text-xs text-slate-100 mt-1.5 font-medium drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
          Dành cho cán bộ, công nhân viên Công ty Z176
        </p>

        {showDisabledNotice && (
          <div className="mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-xl text-slate-100 text-sm font-medium animate-in fade-in">
            <Info className="w-4 h-4 text-[#008BC5] shrink-0" />
            <span>{entry.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};