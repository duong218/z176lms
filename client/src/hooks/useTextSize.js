import { useState, useEffect, useCallback } from 'react';

// Cỡ chữ toàn hệ thống: 3 mức, nhớ theo TÀI KHOẢN trên thiết bị (chưa đăng nhập dùng khóa "guest").
// Áp dụng bằng data-text-size trên <html>; index.css đổi font-size gốc nên chữ, nút, khoảng cách (đều tính theo rem) to lên đồng đều.
export const TEXT_SIZES = ['Vừa', 'Lớn', 'Rất lớn'];

const keyOf = (username) => `z176.textSize.${username || 'guest'}`;
const read = (key) => {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isInteger(n) && n >= 0 && n < TEXT_SIZES.length ? n : null;
  } catch {
    return null;
  }
};
const initial = (username) => read(keyOf(username)) ?? read(keyOf()) ?? 0;

export function useTextSize(username) {
  const [level, setLevel] = useState(() => initial(username));

  useEffect(() => setLevel(initial(username)), [username]); // đổi tài khoản -> nạp cỡ chữ của tài khoản đó
  useEffect(() => {
    document.documentElement.dataset.textSize = String(level);
  }, [level]);

  const choose = useCallback(
    (n) => {
      setLevel(n);
      try {
        localStorage.setItem(keyOf(username), String(n));
      } catch {
        /* chế độ riêng tư: vẫn đổi được trong phiên, chỉ không nhớ */
      }
    },
    [username],
  );

  return [level, choose];
}