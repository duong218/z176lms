import { useState, useEffect, useCallback } from 'react';
import { fetchMyExamProposals } from '../services/examiner.service';

// Số đề của chính Người ra đề đang cần họ xử lý: bị từ chối (cần sửa) + bản nháp chưa gửi duyệt.
// Cùng tiêu chí với mục "Việc cần xử lý" ở tab Tổng quan, nhưng đếm theo từng đề.
export const countExaminerTodo = (list) =>
  (Array.isArray(list) ? list : []).filter((e) => e.isMine && (e.status === 'rejected' || e.status === 'draft')).length;

// Tự tải lại mỗi 60s; ExamProposalTab gọi setCount để cập nhật ngay sau khi gửi duyệt/xóa/sửa đề.
export const useExaminerTodo = (enabled) => {
  const [count, setCount] = useState(0);
  const refresh = useCallback(
    () =>
      fetchMyExamProposals()
        .then((mine) => setCount(countExaminerTodo(mine)))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [enabled, refresh]);
  return [count, setCount];
};