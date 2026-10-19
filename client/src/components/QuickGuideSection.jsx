import { useState } from 'react';
import { UserCheck, ListChecks, PenTool, Send, ArrowRight, HelpCircle, Images, PlayCircle } from 'lucide-react';
import { FirstTimeGuideModal } from './FirstTimeGuideModal';

export const QuickGuideSection = ({ onStartExam }) => {
  const [guide, setGuide] = useState(null); // null | 'guide' | 'demo'
  const steps = [
    {
      number: '1',
      title: 'Đăng nhập',
      desc: 'Nhập Mã nhân viên (trên thẻ công nhân) và mật khẩu do ban tổ chức cấp .',
      icon: UserCheck,
      color: 'bg-blue-50 border-blue-200 text-[#008BC5]',
      badgeBg: 'bg-[#008BC5] text-white',
    },
    {
      number: '2',
      title: 'Chọn đề',
      desc: 'Xác nhận thông tin cá nhân và bấm bắt đầu bài thi theo chủ đề đã được ban tổ chức .',
      icon: ListChecks,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-600',
      badgeBg: 'bg-indigo-600 text-white',
    },
    {
      number: '3',
      title: 'Làm bài',
      desc: 'Đọc kỹ từng câu hỏi, tích chọn đáp án đúng. Đồng hồ đếm ngược hiển thị trên màn hình trong suốt bài thi.',
      icon: PenTool,
      color: 'bg-amber-50 border-amber-200 text-amber-600',
      badgeBg: 'bg-amber-600 text-white',
    },
    {
      number: '4',
      title: 'Nộp kết quả',
      desc: 'Nhấn nút "Nộp bài thi", xem kết quả tức thì và tải chứng nhận hoàn thành.',
      icon: Send,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      badgeBg: 'bg-emerald-600 text-white',
    },
  ];

  return (
    <section id="guide" className="py-6 px-4 bg-white border-t border-slate-200">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#008BC5] text-white flex items-center justify-center shrink-0 shadow-z176">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0F172A]">Hướng dẫn nhanh cho công nhân</h2>
              <p className="text-sm text-[#334155]">4 bước đơn giản để hoàn thành bài thi trực tuyến</p>
            </div>
          </div>
        </div>

        {/* Lần đầu vào thi: xem hướng dẫn có hình hoặc thi thử 3 câu để làm quen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setGuide('guide')}
            className="min-h-[56px] px-4 bg-[#008BC5] hover:bg-[#007ba1] text-white font-bold text-base rounded-lg shadow-z176 flex items-center justify-center gap-2"
          >
            <Images className="w-5 h-5" /> Xem hướng dẫn có hình
          </button>
          <button
            onClick={() => setGuide('demo')}
            className="min-h-[56px] px-4 bg-white hover:bg-green-50 text-[#15803D] border-2 border-[#22C55E] font-bold text-base rounded-lg flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" /> Thi thử 3 câu (không tính điểm)
          </button>
        </div>

        {/* Steps Flow Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="bg-slate-50 rounded-[10px] p-4 border border-slate-200 shadow-z176 flex flex-col justify-between relative group hover:border-[#008BC5] transition-all"
              >
                <div>
                  {/* Step Header with Badge and Icon */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center ${step.badgeBg}`}>
                      {step.number}
                    </span>
                    <div className={`p-2 rounded-lg border ${step.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Step Title & Description */}
                  <h3 className="font-bold text-base text-[#0F172A] mb-1.5 flex items-center gap-1.5">
                    <span>{step.title}</span>
                  </h3>
                  <p className="text-sm text-[#334155] leading-snug">
                    {step.desc}
                  </p>
                </div>

                {/* Mobile visual arrow indicator except last */}
                {index < steps.length - 1 && (
                  <div className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-300 pointer-events-none lg:block hidden">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Callout for easy accessibility */}
        <div className="bg-[#EAF6FF] border border-[#008BC5]/30 rounded-[10px] p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-center sm:text-left">
            <span className="font-bold text-base text-[#0F172A] block">
              Dễ dàng, không phức tạp — Bắt đầu  ngay!
            </span>
            <span className="text-xs text-[#334155] font-medium">
              Chỉ mất 1 phút đăng nhập, thời gian làm bài theo đúng quy định của đề thi
            </span>
          </div>
          <button
            onClick={onStartExam}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#008BC5] hover:bg-[#007ba1] active:bg-[#006b8c] text-white font-bold text-sm rounded-lg shadow-z176 flex items-center justify-center gap-2 transition-colors min-touch-target shrink-0"
            aria-label="Nhấn để thực hiện các bước làm bài ngay"
          >
            <span>THỰC HIỆN NGAY</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FirstTimeGuideModal isOpen={guide !== null} startWith={guide ?? 'guide'} onClose={() => setGuide(null)} onStartExam={onStartExam} />
    </section>
  );
};