import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { useGeneration } from '../../services/question-generation.store';

// % ước tính theo thời gian (server không báo tiến độ thật); dừng ở 95% tới khi server trả kết quả.
const useTick = (active) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
};

const useProgress = () => {
  const g = useGeneration();
  const now = useTick(g.generating);
  const elapsed = (now - g.startedAt) / 1000;
  const percent = Math.min(95, Math.round((elapsed / g.estimateSec) * 100));
  return { ...g, percent, remaining: Math.max(0, Math.ceil(g.estimateSec - elapsed)) };
};

// Thẻ giữa màn hình, hiện trong tab Tạo câu hỏi khi đang chạy
export const GenerationProgress = () => {
  const { generating, percent, remaining, total } = useProgress();
  if (!generating) return null;
  return (
    <div role="status" className="bg-white rounded-xl shadow-z176 border border-[#008BC5]/30 p-6 sm:p-8 text-center space-y-4">
      <Loader2 className="w-10 h-10 mx-auto text-[#008BC5] animate-spin" />
      <div className="font-bold text-lg text-[#0F172A]">AI đang soạn {total} câu hỏi... {percent}%</div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden max-w-md mx-auto">
        <div className="h-full bg-[#008BC5] transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-sm text-slate-600">{remaining > 0 ? `Ước tính còn khoảng ${remaining} giây` : 'Sắp xong, vui lòng chờ thêm chút...'}</div>
      <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg text-sm text-[#0F172A] max-w-md mx-auto flex items-start gap-2 text-left">
        <AlertTriangle className="w-5 h-5 shrink-0 text-[#F6AD37]" />
        <span>Bạn có thể chuyển sang mục khác, quá trình vẫn tiếp tục chạy. <b>Không tải lại (F5) hoặc đóng trang</b> kẻo mất kết quả.</span>
      </div>
    </div>
  );
};

// Chip nhỏ góc dưới phải khi đang ở tab khác
export const GenerationBadge = ({ onClick }) => {
  const { generating, unseen, error, percent } = useProgress();
  if (!generating && !unseen) return null;
  const Icon = generating ? Loader2 : error ? AlertTriangle : CheckCircle2;
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-40 px-4 py-3 rounded-full shadow-lg bg-[#008BC5] text-white font-semibold flex items-center gap-2 min-touch-target"
    >
      <Icon className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
      {generating ? `AI đang soạn câu hỏi ${percent}%` : error ? 'Tạo câu hỏi lỗi — bấm để xem' : 'Đã soạn xong — bấm để tải'}
      {!generating && !error && <Sparkles className="w-4 h-4" />}
    </button>
  );
};