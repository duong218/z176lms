import { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, CheckCircle2, XCircle, Clock, MousePointerClick, PlayCircle } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

// Hướng dẫn lần đầu vào thi: 3 bước có hình minh họa + "Thi thử 3 câu" để làm quen.
// Toàn bộ chạy ở trình duyệt: không cần đăng nhập, không gọi server, không tính điểm.

const DEMO_QUESTIONS = [
  {
    q: 'Khi nghe chuông báo cháy tại nơi làm việc, bạn nên làm gì trước tiên?',
    options: ['Chạy vào lấy đồ cá nhân', 'Bình tĩnh đi theo lối thoát hiểm', 'Tiếp tục làm việc', 'Đứng yên chờ hướng dẫn'],
    correct: 1,
  },
  {
    q: 'Đội mũ bảo hộ khi vào xưởng nhằm mục đích gì?',
    options: ['Bảo vệ đầu khi có va đập', 'Để trang trí', 'Để giữ ấm', 'Để phân biệt phòng ban'],
    correct: 0,
  },
  {
    q: 'Trước khi vận hành máy, việc cần làm là gì?',
    options: ['Tháo bỏ che chắn cho nhanh', 'Vận hành ngay', 'Kiểm tra máy và thiết bị an toàn', 'Nhờ người khác chạy thử'],
    correct: 2,
  },
];

// Khung giả lập màn hình để minh họa — bấm vào "điểm sáng" có vòng nhấp nháy
const Screen = ({ children }) => (
  <div className="w-full max-w-sm mx-auto bg-white border-2 border-slate-300 rounded-xl shadow-z176 overflow-hidden">
    <div className="h-6 bg-slate-200 flex items-center gap-1.5 px-3">
      <span className="w-2 h-2 rounded-full bg-red-400" />
      <span className="w-2 h-2 rounded-full bg-amber-400" />
      <span className="w-2 h-2 rounded-full bg-green-400" />
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

const Hot = ({ children, label }) => (
  <div className="relative">
    <div className="ring-4 ring-[#F6AD37] ring-offset-2 rounded-lg animate-pulse">{children}</div>
    <span className="absolute -top-3 right-2 inline-flex items-center gap-1 bg-[#F6AD37] text-[#0F172A] text-xs font-bold px-2 py-0.5 rounded-full">
      <MousePointerClick className="w-3.5 h-3.5" /> {label}
    </span>
  </div>
);

const Field = ({ label, value }) => (
  <div>
    <div className="text-xs font-semibold text-slate-600 mb-1">{label}</div>
    <div className="h-9 px-3 flex items-center rounded-md border border-slate-300 bg-slate-50 text-sm text-slate-800">{value}</div>
  </div>
);

const Btn = ({ children, color = 'bg-[#008BC5]' }) => (
  <div className={`h-11 rounded-lg ${color} text-white font-bold flex items-center justify-center text-base`}>{children}</div>
);

const STEPS = [
  {
    title: 'Bước 1: Đăng nhập',
    text: 'Bấm nút "Đăng nhập" trên trang chủ. Nhập Mã nhân viên (ghi trên thẻ) và mật khẩu do ban tổ chức cấp, rồi bấm nút xanh "Đăng nhập".',
    art: (
      <Screen>
        <Field label="Mã nhân viên" value="NV-17601" />
        <Field label="Mật khẩu" value="••••••••" />
        <Hot label="Bấm vào đây"><Btn>Đăng nhập</Btn></Hot>
      </Screen>
    ),
  },
  {
    title: 'Bước 2: Chọn kỳ thi',
    text: 'Sau khi đăng nhập, bạn sẽ thấy kỳ thi đang mở. Kiểm tra đúng tên và thời gian thi, rồi bấm "Bắt đầu làm bài".',
    art: (
      <Screen>
        <div className="rounded-lg border border-slate-200 p-3 space-y-1">
          <div className="font-bold text-slate-900">Kỳ thi chuyên môn tháng 10</div>
          <div className="text-sm text-slate-600 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Thời gian: 30 phút</div>
        </div>
        <Hot label="Bấm vào đây"><Btn color="bg-[#22C55E]">Bắt đầu làm bài</Btn></Hot>
      </Screen>
    ),
  },
  {
    title: 'Bước 3: Làm bài và nộp bài',
    text: 'Đọc kỹ câu hỏi, bấm chọn đáp án đúng. Đồng hồ đếm ngược nằm ở góc trên. Làm xong tất cả các câu thì bấm "Nộp bài" và xem kết quả ngay.',
    art: (
      <Screen>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-slate-900">Câu 1/10</span>
          <span className="inline-flex items-center gap-1 font-bold text-[#E53E3E]"><Clock className="w-4 h-4" /> 29:41</span>
        </div>
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg border-2 border-[#008BC5] bg-[#EAF6FF] text-sm font-semibold">A. Đáp án bạn chọn</div>
          <div className="px-3 py-2 rounded-lg border border-slate-300 text-sm">B. Đáp án khác</div>
        </div>
        <Hot label="Làm xong thì bấm"><Btn color="bg-[#F6AD37] !text-[#0F172A]">Nộp bài</Btn></Hot>
      </Screen>
    ),
  },
];

const Demo = ({ onFinish }) => {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const item = DEMO_QUESTIONS[index];

  const pick = (i) => {
    if (picked !== null) return; // đã chọn rồi thì khóa lại để xem kết quả câu này
    setPicked(i);
    if (i === item.correct) setScore((s) => s + 1);
  };
  const next = () => {
    if (index + 1 >= DEMO_QUESTIONS.length) return setDone(true);
    setIndex(index + 1);
    setPicked(null);
  };

  if (done) {
    return (
      <div className="text-center space-y-4 py-4">
        <CheckCircle2 className="w-16 h-16 mx-auto text-[#22C55E]" />
        <div className="text-2xl font-bold text-[#0F172A]">Bạn đúng {score}/{DEMO_QUESTIONS.length} câu</div>
        <p className="text-lg text-[#334155]">Rất tốt! Đây chỉ là thi thử nên không tính điểm. Bây giờ bạn đã sẵn sàng thi thật.</p>
        <button onClick={onFinish} className="w-full min-h-[56px] bg-[#008BC5] text-white font-bold text-lg rounded-lg">
          Đăng nhập để thi thật
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-base font-semibold text-[#334155]">
        Thi thử — câu {index + 1}/{DEMO_QUESTIONS.length} <span className="font-normal">(không tính điểm)</span>
      </div>
      <div className="text-xl font-bold text-[#0F172A] leading-snug">{item.q}</div>
      <div className="space-y-2.5">
        {item.options.map((opt, i) => {
          const isRight = picked !== null && i === item.correct;
          const isWrong = picked === i && i !== item.correct;
          return (
            <button
              key={opt}
              onClick={() => pick(i)}
              className={`w-full text-left min-h-[56px] px-4 py-3 rounded-lg border-2 text-lg font-medium flex items-center justify-between gap-2 ${
                isRight ? 'border-[#22C55E] bg-green-50' : isWrong ? 'border-[#E53E3E] bg-red-50' : 'border-slate-300 bg-white hover:border-[#008BC5]'
              }`}
            >
              <span>{String.fromCharCode(65 + i)}. {opt}</span>
              {isRight && <CheckCircle2 className="w-6 h-6 text-[#22C55E] shrink-0" />}
              {isWrong && <XCircle className="w-6 h-6 text-[#E53E3E] shrink-0" />}
            </button>
          );
        })}
      </div>
      {picked === null ? (
        <p className="text-base text-[#334155]">Bấm vào đáp án bạn chọn.</p>
      ) : (
        <button onClick={next} className="w-full min-h-[56px] bg-[#008BC5] text-white font-bold text-lg rounded-lg flex items-center justify-center gap-2">
          {index + 1 >= DEMO_QUESTIONS.length ? 'Xem kết quả' : 'Câu tiếp theo'} <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

// startWith: 'guide' (xem hướng dẫn từng bước) | 'demo' (vào thẳng thi thử)
export const FirstTimeGuideModal = ({ isOpen, onClose, onStartExam, startWith = 'guide' }) => {
  const [mode, setMode] = useState(startWith);
  const [step, setStep] = useState(0);
  useScrollLock(isOpen);

  // Mỗi lần mở lại thì về bước đầu (chỉ phụ thuộc isOpen/startWith để không bị reset khi trang chủ vẽ lại)
  useEffect(() => {
    if (!isOpen) return;
    setMode(startWith);
    setStep(0);
  }, [isOpen, startWith]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const last = step === STEPS.length - 1;
  const finishToLogin = () => {
    onClose();
    onStartExam?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-[12px] border border-slate-200 shadow-z176 animate-fade-in-up"
        role="dialog"
        aria-modal="true"
        aria-label="Hướng dẫn lần đầu vào thi"
        data-lenis-prevent
      >
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-[#0F172A]">{mode === 'demo' ? 'Thi thử 3 câu' : 'Hướng dẫn vào thi'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 min-touch-target" aria-label="Đóng">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {mode === 'demo' ? (
            <Demo onFinish={finishToLogin} />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center gap-2" aria-hidden="true">
                {STEPS.map((_, i) => (
                  <span key={i} className={`h-2.5 rounded-full transition-all ${i === step ? 'w-8 bg-[#008BC5]' : 'w-2.5 bg-slate-300'}`} />
                ))}
              </div>
              {STEPS[step].art}
              <h3 className="text-2xl font-bold text-[#0F172A]">{STEPS[step].title}</h3>
              <p className="text-lg leading-relaxed text-[#334155]">{STEPS[step].text}</p>

              <div className="flex gap-3">
                {step > 0 && (
                  <button onClick={() => setStep(step - 1)} className="min-h-[56px] px-5 border-2 border-slate-300 text-[#0F172A] font-bold text-lg rounded-lg flex items-center gap-2">
                    <ArrowLeft className="w-5 h-5" /> Quay lại
                  </button>
                )}
                {!last ? (
                  <button onClick={() => setStep(step + 1)} className="flex-1 min-h-[56px] bg-[#008BC5] text-white font-bold text-lg rounded-lg flex items-center justify-center gap-2">
                    Tiếp tục <ArrowRight className="w-5 h-5" />
                  </button>
                ) : (
                  <button onClick={() => setMode('demo')} className="flex-1 min-h-[56px] bg-[#22C55E] text-white font-bold text-lg rounded-lg flex items-center justify-center gap-2">
                    <PlayCircle className="w-5 h-5" /> Thi thử 3 câu
                  </button>
                )}
              </div>
              {last && (
                <button onClick={finishToLogin} className="w-full min-h-[48px] text-[#008BC5] font-bold text-base underline">
                  Bỏ qua, đăng nhập thi thật
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};