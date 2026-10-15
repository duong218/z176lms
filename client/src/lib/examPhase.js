/**
 * Giai đoạn của kỳ thi theo giờ: 'upcoming' (chưa tới giờ bắt đầu) | 'open' (đang mở) | 'ended' (đã hết hạn).
 * Cùng ranh giới với getExamEntryState (CTAButton.jsx): now < start -> upcoming, now > end -> ended.
 */
export function getExamPhase(exam, now = Date.now()) {
  if (!exam?.startDate || !exam?.endDate) return 'none';
  if (now < new Date(exam.startDate).getTime()) return 'upcoming';
  if (now > new Date(exam.endDate).getTime()) return 'ended';
  return 'open';
}

/** Đồng hồ đếm ngược phải nhắm vào mốc nào, theo giai đoạn: chưa mở -> giờ bắt đầu; đang mở -> hạn nộp. */
export function getCountdownTarget(exam, phase) {
  if (phase === 'upcoming') return new Date(exam.startDate).getTime();
  if (phase === 'open') return new Date(exam.endDate).getTime();
  return null;
}

export const COUNTDOWN_LABEL = {
  upcoming: 'Kỳ thi bắt đầu sau',
  open: 'Thời gian còn lại để làm bài thi',
  ended: 'Kỳ thi đã kết thúc',
};

export function splitDuration(ms) {
  const d = Math.max(0, ms);
  return {
    days: Math.floor(d / 86_400_000),
    hours: Math.floor((d % 86_400_000) / 3_600_000),
    minutes: Math.floor((d % 3_600_000) / 60_000),
    seconds: Math.floor((d % 60_000) / 1000),
  };
}