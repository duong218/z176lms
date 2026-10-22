import { useState, useEffect, useCallback } from 'react';
import { fetchPendingExams, fetchApprovedExams } from '../services/exam-review.service';

const len = (r) => (Array.isArray(r) ? r.length : 0);

// Đếm việc đang chờ Người duyệt đề: đề chờ duyệt (pending) + đề đã duyệt đang chờ đăng chính thức (approved).
// Tự tải lại mỗi 60s; ExamReviewTab gọi setCounts để cập nhật ngay sau khi duyệt/đăng (không phải chờ chu kỳ).
export const useLeaderPending = (enabled) => {
  const [counts, setCounts] = useState({ pending: 0, approved: 0 });
  const refresh = useCallback(
    () =>
      Promise.all([fetchPendingExams(), fetchApprovedExams()])
        .then(([p, a]) => setCounts({ pending: len(p), approved: len(a) }))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [enabled, refresh]);
  return [counts, setCounts];
};