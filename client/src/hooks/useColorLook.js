import { useState, useCallback } from 'react';

// Giao diện Dashboard thí sinh: "Đơn giản" (mặc định) hay "Nhiều màu". Chỉ đổi cách dùng 5 màu chức năng
// của design-system, không thêm màu mới. Nhớ theo thiết bị, cùng cách với useTextSize.
const KEY = 'z176.colorLook';

export function useColorLook() {
  const [colorful, setColorful] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const choose = useCallback((v) => {
    setColorful(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* chế độ riêng tư: vẫn đổi được trong phiên, chỉ không nhớ */
    }
  }, []);
  return [colorful, choose];
}