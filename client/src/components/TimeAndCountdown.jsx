import { useState, useEffect } from 'react';
import { Calendar, Clock, Info } from 'lucide-react';
import { getExamPhase, getCountdownTarget, splitDuration, COUNTDOWN_LABEL } from '../lib/examPhase';

export const TimeAndCountdown = ({ activeExam }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Giai đoạn kỳ thi đổi theo giờ (chưa mở -> đang mở -> đã kết thúc) nên tính lại ở mỗi nhịp 1 giây.
  const [phase, setPhase] = useState(() => getExamPhase(activeExam));

  useEffect(() => {
    if (!activeExam || !activeExam.endDate) return undefined;

    const tick = () => {
      const p = getExamPhase(activeExam);
      const target = getCountdownTarget(activeExam, p);
      setPhase(p);
      setTimeLeft(splitDuration(target == null ? 0 : target - Date.now()));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeExam]);

  const padNumber = (num) => {
    return num < 10 ? `0${num}` : `${num}`;
  };

  const countdownUnits = [
    { value: padNumber(timeLeft.days), label: 'Ngày' },
    { value: padNumber(timeLeft.hours), label: 'Giờ' },
    { value: padNumber(timeLeft.minutes), label: 'Phút' },
    { value: padNumber(timeLeft.seconds), label: 'Giây' },
  ];

  if (!activeExam) {
    return (
      <div className="py-2.5 sm:py-4 px-4">
        <div className="max-w-xl mx-auto space-y-2">
          <div className="flex items-center justify-center gap-2 p-4 bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl text-slate-200">
            <Info className="w-5 h-5 text-[#008BC5]" />
            <span className="font-medium text-[15px]">Hiện tại chưa có kỳ thi nào đang diễn ra.</span>
          </div>
        </div>
      </div>
    );
  }

  const formatLocalDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${padNumber(d.getDate())}/${padNumber(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  return (
    <div className="py-2.5 sm:py-4 px-4">
      <div className="max-w-xl mx-auto space-y-2">
        {/* Section 3: Time Information - Exactly 16px, #334155, centered */}
        <div className="flex items-center justify-center gap-1.5 text-[16px] font-medium text-slate-100 text-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] [&_strong]:text-white">
          <Calendar className="w-5 h-5 text-sky-300 shrink-0" />
          <span>Từ ngày <strong className="text-[#0F172A] font-bold">{formatLocalDate(activeExam.startDate)}</strong> đến hết <strong className="text-[#0F172A] font-bold">{formatLocalDate(activeExam.endDate)}</strong></span>
        </div>

        {/* Section 4: Countdown Block (4 boxes) */}
        <div>
          <div className="flex items-center justify-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
            <Clock className="w-4 h-4 text-sky-300" />
            <span>{COUNTDOWN_LABEL[phase] ?? COUNTDOWN_LABEL.open}</span>
          </div>

          {/* Grid layout for 4 boxes */}
          <div className="grid grid-cols-4 min-[360px]:grid-cols-4 grid-cols-2 gap-2 max-w-md mx-auto">
            {countdownUnits.map((unit, index) => (
              <div key={index} className="flex flex-col rounded-[10px] overflow-hidden shadow-z176">
                {/* Number Part: Flat #008BC5 background, white text weight 700, 20-24px */}
                <div className="bg-[#008BC5] text-white font-bold text-center py-1.5 text-[22px] min-[360px]:text-[24px] tracking-wider leading-none">
                  {unit.value}
                </div>
                {/* Label Strip: Flat #334155 background, white text 14px */}
                <div className="bg-[#334155] text-white text-[14px] font-medium text-center py-1 leading-none">
                  {unit.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};