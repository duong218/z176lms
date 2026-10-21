import { Clock, ListChecks, Layers, Target, Building2, Scale, FilePlus, CheckCircle, XCircle, Archive } from 'lucide-react';

// Phạm vi phòng ban (kỳ thi cũ không có field = tất cả phòng ban).
export const examScopeLabel = (exam) => {
  if (exam.departmentScope !== 'selected') return 'Tất cả phòng ban';
  const names = (exam.allowedDepartmentIds ?? []).map((d) => (typeof d === 'object' && d?.name ? d.name : null)).filter(Boolean);
  return names.length ? names.join(', ') : 'Chỉ định phòng ban';
};

// Người gửi: server trả exam.creator = { name, departmentName }.
export const senderText = (exam) => [exam.creator?.name, exam.creator?.departmentName].filter(Boolean).join(' · ') || '—';

// Màu LUÔN đi kèm icon + chữ (không chỉ dựa vào màu). Chỉ dùng 5 màu chức năng của design-system.
const STATUS = {
  draft: { label: 'Nháp', Icon: FilePlus, cls: 'bg-[#F6F8FA] text-[#334155] border-[#E2E8F0]' },
  pending_review: { label: 'Chờ duyệt', Icon: Clock, cls: 'bg-[#FFF7E6] text-[#B45309] border-[#F6AD37]/50' },
  rejected: { label: 'Bị từ chối', Icon: XCircle, cls: 'bg-[#FEECEC] text-[#C53030] border-[#E53E3E]/30' },
  approved: { label: 'Đã duyệt', Icon: CheckCircle, cls: 'bg-[#EAF6FF] text-[#008BC5] border-[#008BC5]/30' },
  published: { label: 'Đã đăng', Icon: CheckCircle, cls: 'bg-[#F0FDF4] text-[#166534] border-[#22C55E]/40' },
  archived: { label: 'Đã lưu trữ', Icon: Archive, cls: 'bg-[#F6F8FA] text-[#334155] border-[#E2E8F0]' },
};

export const ExamStatusBadge = ({ status, label }) => {
  const s = STATUS[status];
  if (!s) return <span className="text-sm text-[#334155]">{label ?? status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-lg border text-sm font-semibold ${s.cls}`}>
      <s.Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {label ?? s.label}
    </span>
  );
};

export const Stat = ({ Icon, label, value }) => (
  <div className="rounded-lg bg-[#F6F8FA] px-3 py-2">
    <dt className="flex items-center gap-1.5 text-sm text-[#334155]">
      <Icon className="w-4 h-4 text-[#64748B] shrink-0" aria-hidden="true" /> {label}
    </dt>
    <dd className="text-base font-bold text-[#0F172A]">{value}</dd>
  </div>
);

export const ScopeLine = ({ exam }) => (
  <p className="flex items-start gap-2 text-base text-[#334155]">
    <Building2 className="w-4 h-4 text-[#64748B] shrink-0 mt-1" aria-hidden="true" />
    <span>
      Phạm vi: <b className="text-[#0F172A]">{examScopeLabel(exam)}</b>
    </span>
  </p>
);

/** Cấu trúc đề: 4 ô số liệu + dòng bù câu chung + phạm vi. Ô nào server không trả thì bỏ qua, không bịa số. */
export const ExamStats = ({ exam }) => {
  const has = (v) => v !== undefined && v !== null;
  const off = exam.allowCommonCompensation === false;
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {has(exam.durationMinutes) && <Stat Icon={Clock} label="Thời gian" value={`${exam.durationMinutes} phút`} />}
        {has(exam.totalQuestions) && <Stat Icon={ListChecks} label="Tổng câu" value={exam.totalQuestions} />}
        {has(exam.commonQuestionCount) && <Stat Icon={Layers} label="Chung / Riêng" value={`${exam.commonQuestionCount} / ${exam.departmentQuestionCount ?? 0}`} />}
        {has(exam.passThresholdPercent) && <Stat Icon={Target} label="Điểm đạt" value={`${exam.passThresholdPercent}%`} />}
      </dl>
      <p className="flex items-start gap-2 text-base text-[#334155]">
        <Scale className="w-4 h-4 text-[#64748B] shrink-0 mt-1" aria-hidden="true" />
        <span>
          Bù câu chung: <b className="text-[#0F172A]">{off ? 'Tắt' : 'Bật'}</b>
          <span className="text-sm text-[#334155]"> — {off ? 'phòng thiếu câu riêng bị khóa' : 'thiếu câu riêng thì bù câu chung'}</span>
        </span>
      </p>
      <ScopeLine exam={exam} />
    </div>
  );
};